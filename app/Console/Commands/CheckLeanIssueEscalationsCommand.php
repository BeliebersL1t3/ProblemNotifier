<?php

namespace App\Console\Commands;

use App\Http\Controllers\LeanController;
use App\Models\LeanIssue;
use App\Services\TicketNotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

class CheckLeanIssueEscalationsCommand extends Command
{
    protected $signature = 'lean:check-escalations';

    protected $description = 'Check active lean issues without progress updates for 1h (Group WA reminder) and 3h (Owner WA escalation)';

    public const GROUP_ESCALATION_MINUTES = 60;
    public const OWNER_ESCALATION_MINUTES = 180;

    public function handle(): int
    {
        $tz = config('app.timezone', 'UTC');
        $now = Carbon::now($tz);
        $groupThreshold = $now->copy()->subMinutes(self::GROUP_ESCALATION_MINUTES);
        $ownerThreshold = $now->copy()->subMinutes(self::OWNER_ESCALATION_MINUTES);

        $ownerPhones = $this->resolveOwnerPhones();

        // Active tickets whose timer is running (open or in_progress; pending is paused, resolved is stopped)
        $candidates = LeanIssue::query()
            ->whereIn('status', ['open', 'in_progress'])
            ->where(function ($q) use ($groupThreshold, $ownerThreshold) {
                $q->where(function ($q1) use ($groupThreshold) {
                    $q1->whereNull('group_escalated_at')
                       ->whereRaw('COALESCE(last_progress_at, created_at) <= ?', [$groupThreshold->toDateTimeString()]);
                })->orWhere(function ($q2) use ($ownerThreshold) {
                    $q2->whereNull('owner_escalated_at')
                       ->whereRaw('COALESCE(last_progress_at, created_at) <= ?', [$ownerThreshold->toDateTimeString()]);
                });
            })
            ->orderBy('id')
            ->get();

        $groupSent = 0;
        $ownerSent = 0;

        foreach ($candidates as $issue) {
            $anchor = $issue->last_progress_at
                ? $issue->last_progress_at->copy()->setTimezone($tz)
                : $issue->created_at->copy()->setTimezone($tz);

            $idleMinutes = (int) floor($anchor->diffInMinutes($now, false));
            if ($idleMinutes < self::GROUP_ESCALATION_MINUTES) {
                continue;
            }

            $issueCode = LeanController::formatIssueCode($issue);
            $targetDepts = is_array($issue->target_departments) && !empty($issue->target_departments)
                ? $issue->target_departments
                : ['Umum'];
            $deptDisplay = implode(', ', $targetDepts);
            $idleFormatted = $this->formatMinutesIndonesian($idleMinutes);
            $createdWib = $issue->created_at
                ? $issue->created_at->copy()->setTimezone('Asia/Jakarta')->format('d M Y, H:i') . ' WIB'
                : '-';
            $lastUpdateWib = $anchor->copy()->setTimezone('Asia/Jakarta')->format('d M Y, H:i') . ' WIB';
            $statusLabel = $issue->status === 'in_progress'
                ? 'Sedang Dikerjakan (In Progress — belum ada update baru)'
                : 'Open (Belum Ditangani)';
            $workersLine = !empty($issue->claimed_by_name)
                ? "\n• *Petugas:* {$issue->claimed_by_name}"
                : '';

            // Stage 1: >= 1 hour without update -> notify target department WhatsApp group
            if ($issue->group_escalated_at === null && $idleMinutes >= self::GROUP_ESCALATION_MINUTES) {
                $groupMessage = "⏰ *PENGINGAT PROGRES (1 JAM TANPA KABAR)* ⏰\n\n"
                    . "• *ID Tiket:* #{$issueCode}\n"
                    . "• *Masalah:* {$issue->title}\n"
                    . "• *Lokasi:* {$issue->location}\n"
                    . "• *Departemen:* {$deptDisplay}\n"
                    . "• *Pelapor:* {$issue->reporter_name}\n"
                    . "• *Status:* {$statusLabel}{$workersLine}\n"
                    . "• *Kabar Terakhir:* {$lastUpdateWib} ({$idleFormatted} lalu)\n\n"
                    . "Mohon Supervisor/tim segera memperbarui *Update Progres*, menandai *Pending* jika terkendala, atau *Selesai* di aplikasi Telunas Issue Tracker. Jika masih tanpa kabar hingga *3 jam*, laporan akan otomatis diteruskan ke Owner.";

                $sent = TicketNotificationService::sendWhatsAppGroup([
                    'message'         => $groupMessage,
                    'departments'     => $targetDepts,
                    'location'        => $issue->location,
                    'includeLocation' => true,
                    'includeGeneral'  => true,
                    'departmentOnly'  => false,
                ]);

                if ($sent) {
                    $logs = $issue->progress_logs ?? [];
                    $logs[] = [
                        'id'         => uniqid('log_', true),
                        'type'       => 'escalation_group',
                        'actor'      => 'Sistem Timer Otomatis',
                        'actor_dept' => $deptDisplay,
                        'message'    => "Pengingat 1 jam tanpa kabar ({$idleFormatted}) terkirim otomatis ke grup WhatsApp departemen.",
                        'created_at' => $now->copy()->setTimezone('Asia/Jakarta')->toIso8601String(),
                    ];

                    $updated = LeanIssue::where('id', $issue->id)
                        ->whereNull('group_escalated_at')
                        ->update([
                            'group_escalated_at'     => $now,
                            'escalation_group_count' => (int) ($issue->escalation_group_count ?? 0) + 1,
                            'progress_logs'          => json_encode($logs),
                        ]);

                    if ($updated > 0) {
                        $issue->group_escalated_at = $now;
                        $issue->escalation_group_count = (int) ($issue->escalation_group_count ?? 0) + 1;
                        $issue->progress_logs = $logs;
                        $groupSent++;
                    }
                } else {
                    Log::warning("[lean:check-escalations] Failed sending 1h group reminder for ticket #{$issueCode} (ID {$issue->id}). Will retry next cycle.");
                }
            }

            // Stage 2: >= 3 hours without update -> notify Owner directly via WhatsApp
            if ($issue->owner_escalated_at === null && $idleMinutes >= self::OWNER_ESCALATION_MINUTES) {
                if (empty($ownerPhones)) {
                    Log::warning("[lean:check-escalations] Owner WhatsApp number is not configured (services.bot.owner_whatsapp); skipping 3h owner escalation for ticket #{$issueCode}.");
                    continue;
                }

                $ownerMessage = "🚨 *ESKALASI OWNER (3 JAM TANPA KABAR)* 🚨\n\n"
                    . "• *ID Tiket:* #{$issueCode}\n"
                    . "• *Masalah:* {$issue->title}\n"
                    . "• *Lokasi:* {$issue->location}\n"
                    . "• *Departemen:* {$deptDisplay}\n"
                    . "• *Pelapor:* {$issue->reporter_name}\n"
                    . "• *Status:* {$statusLabel}{$workersLine}\n"
                    . "• *Dibuat:* {$createdWib}\n"
                    . "• *Kabar Terakhir:* {$lastUpdateWib} (*{$idleFormatted}* tanpa update)\n\n"
                    . "Tiket ini telah melewati batas *3 jam* tanpa pembaruan progres maupun status Pending dari departemen terkait.";

                $anyOwnerDelivered = false;
                foreach ($ownerPhones as $phone) {
                    if (TicketNotificationService::sendWhatsApp($phone, $ownerMessage)) {
                        $anyOwnerDelivered = true;
                    } else {
                        Log::warning("[lean:check-escalations] Failed sending 3h owner escalation to {$phone} for ticket #{$issueCode} (ID {$issue->id}).");
                    }
                }

                if ($anyOwnerDelivered) {
                    $logs = $issue->progress_logs ?? [];
                    $logs[] = [
                        'id'         => uniqid('log_', true),
                        'type'       => 'escalation_owner',
                        'actor'      => 'Sistem Timer Otomatis',
                        'actor_dept' => 'Owner',
                        'message'    => "Eskalasi 3 jam tanpa kabar ({$idleFormatted}) terkirim otomatis ke WhatsApp Owner.",
                        'created_at' => $now->copy()->setTimezone('Asia/Jakarta')->toIso8601String(),
                    ];

                    $updated = LeanIssue::where('id', $issue->id)
                        ->whereNull('owner_escalated_at')
                        ->update([
                            'owner_escalated_at'     => $now,
                            'escalation_owner_count' => (int) ($issue->escalation_owner_count ?? 0) + 1,
                            'progress_logs'          => json_encode($logs),
                        ]);

                    if ($updated > 0) {
                        $issue->owner_escalated_at = $now;
                        $issue->escalation_owner_count = (int) ($issue->escalation_owner_count ?? 0) + 1;
                        $issue->progress_logs = $logs;
                        $ownerSent++;
                    }
                }
            }
        }

        $this->info("Checked {$candidates->count()} candidate(s): {$groupSent} group reminder(s), {$ownerSent} owner escalation(s) sent.");

        return self::SUCCESS;
    }

    /**
     * Resolve configured Owner WhatsApp number(s) (supports comma-separated list).
     *
     * @return array<int, string>
     */
    protected function resolveOwnerPhones(): array
    {
        $raw = (string) config('services.bot.owner_whatsapp', '08113861133');
        $parts = array_filter(array_map('trim', explode(',', $raw)), fn (string $v) => $v !== '');
        return array_values(array_unique($parts));
    }

    protected function formatMinutesIndonesian(int $minutes): string
    {
        if ($minutes < 60) {
            return "{$minutes} menit";
        }

        $hours = intdiv($minutes, 60);
        $mins = $minutes % 60;
        if ($mins === 0) {
            return "{$hours} jam";
        }

        return "{$hours} jam {$mins} menit";
    }
}
