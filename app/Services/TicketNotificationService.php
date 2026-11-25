<?php

namespace App\Services;

use App\Models\ApprovalTicket;
use App\Models\DashboardNotification;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class TicketNotificationService
{
    /**
     * Resolve public Tailscale application URL for clickable links in WhatsApp messages.
     */
    public static function getTailscaleAppUrl(?string $path = null): string
    {
        $base = rtrim(env('TAILSCALE_URL', env('APP_PUBLIC_URL', 'https://msi.taile8cc1e.ts.net')), '/');
        if (!empty($path)) {
            $path = '/' . ltrim($path, '/');
            return $base . $path;
        }
        return $base;
    }

    /**
     * Resolve configured WhatsApp Bot HTTP base URL.
     */
    protected static function botBaseUrl(): string
    {
        $port = (int) config('services.bot.port', 3000);
        if ($port <= 0 || $port > 65535) {
            $port = 3000;
        }

        return "http://localhost:{$port}";
    }

    /**
     * Send direct WhatsApp message via bot
     */
    public static function sendWhatsApp(string $phone, string $message): bool
    {
        $cleanPhone = preg_replace('/[^0-9]/', '', $phone);
        if (empty($cleanPhone)) {
            return false;
        }

        if (str_starts_with($cleanPhone, '0')) {
            $cleanPhone = '62' . substr($cleanPhone, 1);
        } elseif (str_starts_with($cleanPhone, '8')) {
            $cleanPhone = '62' . $cleanPhone;
        }

        try {
            $response = Http::withHeaders([
                'X-Bot-Key' => config('services.bot.api_key'),
            ])->connectTimeout(2)->timeout(3)->post(self::botBaseUrl() . '/notify-direct', [
                'phone'   => $cleanPhone,
                'message' => $message,
            ]);

            if (!$response->successful()) {
                Log::warning("WhatsApp direct notification failed (HTTP {$response->status()}): " . mb_substr($response->body(), 0, 300));
                return false;
            }

            return true;
        } catch (\Throwable $e) {
            Log::warning("WhatsApp direct notification skipped (bot offline / unreachable): " . $e->getMessage());
            return false;
        }
    }

    /**
     * Send group WhatsApp notification via bot (/notify endpoint).
     * Supports targeting departments, location groups, and broadcast generalGroupId fallback.
     */
    public static function sendWhatsAppGroup(array $payload): bool
    {
        $message = trim((string) ($payload['message'] ?? ''));
        if ($message === '') {
            return false;
        }

        try {
            $response = Http::withHeaders([
                'X-Bot-Key' => config('services.bot.api_key'),
            ])->connectTimeout(2)->timeout(4)->post(self::botBaseUrl() . '/notify', $payload);

            if (!$response->successful()) {
                Log::warning("WhatsApp group notification failed (HTTP {$response->status()}): " . mb_substr($response->body(), 0, 300));
                return false;
            }

            return true;
        } catch (\Throwable $e) {
            Log::warning("WhatsApp group notification skipped (bot offline / unreachable): " . $e->getMessage());
            return false;
        }
    }

    /**
     * Validate Indonesian mobile phone format (08xx, 10-13 digits)
     */
    public static function isValidIndonesianMobile(?string $phone): bool
    {
        $clean = preg_replace('/[^0-9]/', '', (string)$phone);
        // Valid Indonesian mobile prefixes: 0811..0899, length 10 to 13 digits (or with 628: 11 to 14 digits)
        return (bool) preg_match('/^(?:08[1-9][0-9]{7,10}|628[1-9][0-9]{7,10}|8[1-9][0-9]{7,10})$/', $clean);
    }

    /**
     * Check if a phone number exists on WhatsApp via bot
     *
     * @return array{success: bool, bot_online: bool, exists: bool|null, message: string}
     */
    public static function checkWhatsAppNumber(?string $phone): array
    {
        $clean = preg_replace('/[^0-9]/', '', (string)$phone);
        if (empty($clean)) {
            return [
                'success' => false,
                'bot_online' => false,
                'exists' => null,
                'message' => 'Nomor telepon tidak boleh kosong.',
            ];
        }

        if (!self::isValidIndonesianMobile($clean)) {
            return [
                'success' => false,
                'bot_online' => false,
                'exists' => false,
                'message' => 'Format nomor tidak valid. Nomor seluler Indonesia harus diawali 08xx dengan panjang 10-13 digit.',
            ];
        }

        if (str_starts_with($clean, '0')) {
            $cleanPhone = '62' . substr($clean, 1);
        } elseif (str_starts_with($clean, '8')) {
            $cleanPhone = '62' . $clean;
        } else {
            $cleanPhone = $clean;
        }

        try {
            $response = Http::withHeaders([
                'X-Bot-Key' => config('services.bot.api_key'),
            ])->connectTimeout(2)->timeout(3)->post(self::botBaseUrl() . '/api/check-number', [
                'phone' => $cleanPhone,
            ]);

            if ($response->successful()) {
                $data = $response->json();
                $botOnline = (bool)($data['botOnline'] ?? false);
                $exists = isset($data['exists']) ? (bool)$data['exists'] : null;

                if (!$botOnline) {
                    return [
                        'success' => true,
                        'bot_online' => false,
                        'exists' => null,
                        'message' => 'Bot WhatsApp sedang offline.',
                    ];
                }

                return [
                    'success' => true,
                    'bot_online' => true,
                    'exists' => $exists,
                    'message' => $exists 
                        ? 'Nomor terdaftar dan aktif di WhatsApp.' 
                        : 'Nomor ini tidak terdaftar di WhatsApp. Pastikan nomor sudah aktif.',
                ];
            }

            return [
                'success' => false,
                'bot_online' => false,
                'exists' => null,
                'message' => 'Gagal menghubungi bot WhatsApp (Server Error).',
            ];
        } catch (\Throwable $e) {
            Log::info("WhatsApp number check skipped (bot offline / unreachable): " . $e->getMessage());
            return [
                'success' => true,
                'bot_online' => false,
                'exists' => null,
                'message' => 'Bot WhatsApp sedang offline.',
            ];
        }
    }

    /**
     * Create Dashboard Notification
     */
    public static function createDashboardNotification(array $data): DashboardNotification
    {
        return DashboardNotification::create([
            'user_id' => $data['user_id'] ?? null,
            'department' => $data['department'] ?? null,
            'role_target' => $data['role_target'] ?? null,
            'type' => $data['type'] ?? 'ticket_request',
            'title' => $data['title'],
            'message' => $data['message'],
            'link' => $data['link'] ?? null,
            'is_read' => false,
        ]);
    }

    /**
     * Notify HODs when a new registration or request is made in their department
     */
    public static function notifyHods(ApprovalTicket $ticket, string $actionTitle): void
    {
        // 1. In-app notification for HODs of the department
        self::createDashboardNotification([
            'department' => $ticket->department,
            'role_target' => 'hod',
            'type' => 'ticket_request',
            'title' => "Tiket Baru: {$actionTitle} ({$ticket->ticket_number})",
            'message' => "Staf {$ticket->staff_name} mengajukan {$ticket->type} di departemen {$ticket->department}. Perlu tinjauan HOD.",
            'link' => "/tickets?id={$ticket->id}",
        ]);

        // 2. Direct WhatsApp to HODs if enabled
        $hods = User::hodsOfDepartment($ticket->department)
            ->where('notify_whatsapp_tickets', true)
            ->whereNotNull('whatsapp_number')
            ->get();

        $ticketLink = self::getTailscaleAppUrl("/tickets?id={$ticket->id}");

        foreach ($hods as $hod) {
            $msg = "🔔 *Pemberitahuan Tiket Menunggu Tinjauan HOD*\n\n"
                 . "Tipe: *{$actionTitle}*\n"
                 . "Nomor Tiket: *{$ticket->ticket_number}*\n"
                 . "Staf: *{$ticket->staff_name}*\n"
                 . "Departemen: *{$ticket->department}*\n\n"
                 . "Silakan masuk ke Web Dashboard untuk meninjau dan memberikan persetujuan:\n"
                 . "🔗 {$ticketLink}";
            self::sendWhatsApp($hod->whatsapp_number, $msg);
        }
    }

    /**
     * Resolve active supervisors for a department with automatic failover if a supervisor resigns / is inactive.
     *
     * @param string $department
     * @return array{recipients: \Illuminate\Support\Collection, is_fallback: bool, fallback_reason: ?string}
     */
    public static function resolveActiveSupervisors(string $department): array
    {
        $cleanDept = trim($department);
        if ($cleanDept === '') {
            $cleanDept = 'Umum';
        }

        // 1. Search for active supervisor(s) in the target department
        $supervisors = User::supervisorsOfDepartment($cleanDept)
            ->whereNotNull('whatsapp_number')
            ->where('whatsapp_number', '!=', '')
            ->get();

        if ($supervisors->isNotEmpty()) {
            return [
                'recipients'      => $supervisors,
                'is_fallback'     => false,
                'fallback_reason' => null,
            ];
        }

        // 2. Check if there were supervisors who resigned / are inactive in this department
        $resignedSupervisors = User::where('is_hod', true)
            ->where('is_active', false)
            ->where(function ($q) use ($cleanDept) {
                $q->whereRaw('LOWER(department) = ?', [strtolower($cleanDept)])
                  ->orWhere('department', 'like', "%{$cleanDept}%");
            })
            ->pluck('name')
            ->toArray();

        $fallbackReason = !empty($resignedSupervisors)
            ? "Supervisor departemen {$cleanDept} (" . implode(', ', $resignedSupervisors) . ") saat ini tidak aktif / telah resign. Notifikasi dialihkan otomatis ke Administrator."
            : "Departemen {$cleanDept} belum memiliki supervisor aktif. Notifikasi dialihkan otomatis ke Administrator.";

        // 3. Fallback to active Admins so no ticket notice is ever lost
        $admins = User::where('role', 'admin')
            ->where('is_active', true)
            ->whereNotNull('whatsapp_number')
            ->where('whatsapp_number', '!=', '')
            ->get();

        return [
            'recipients'      => $admins,
            'is_fallback'     => true,
            'fallback_reason' => $fallbackReason,
        ];
    }

    /**
     * Send direct WhatsApp DM & in-app dashboard notification to active Supervisor(s) of target department(s)
     * exclusively on 1-hour progress escalation (no DM spam on new issue creation),
     * with automatic failover to another active supervisor or Admin if a supervisor resigned/is inactive.
     *
     * @param mixed $issue
     * @param string $action
     * @param array<string, mixed> $context
     * @return array{sent: bool, recipients: array<int, string>, is_fallback: bool}
     */
    public static function notifyDepartmentSupervisor($issue, string $action = 'escalation_1h', array $context = []): array
    {
        $targetDepts = is_array($issue->target_departments) && !empty($issue->target_departments)
            ? array_values(array_unique(array_filter(array_map('trim', $issue->target_departments))))
            : [trim((string) ($issue->department ?? 'Umum')) ?: 'Umum'];

        $deptDisplay = implode(', ', $targetDepts);
        $issueCode = $context['issueCode'] ?? \App\Http\Controllers\LeanController::formatIssueCode($issue);
        $tailscaleLink = self::getTailscaleAppUrl("/lapangan?focus={$issueCode}");
        $location = $issue->location ?: '-';
        $reporter = $issue->reporter_name ?: 'Staf';
        $reporterDept = $issue->reporter_dept ? " ({$issue->reporter_dept})" : '';
        $idleFormatted = $context['idleFormatted'] ?? '1 jam';
        $lastUpdateWib = $context['lastUpdateWib'] ?? '-';
        $statusLabel = $context['statusLabel'] ?? ($issue->status === 'in_progress'
            ? 'Sedang Dikerjakan (In Progress — belum ada update baru)'
            : 'Open (Belum Ditangani)');
        $workersLine = $context['workersLine'] ?? (!empty($issue->claimed_by_name) ? "\n• *Petugas:* {$issue->claimed_by_name}" : '');

        $notifiedUserIds = [];
        $notifiedNames = [];
        $anyDelivered = false;
        $anyFallback = false;

        foreach ($targetDepts as $targetDept) {
            $resolved = self::resolveActiveSupervisors($targetDept);
            $recipients = $resolved['recipients'];
            $isFallback = (bool) $resolved['is_fallback'];
            $fallbackReason = $resolved['fallback_reason'];

            if ($isFallback) {
                $anyFallback = true;
            }

            if ($recipients->isEmpty()) {
                Log::warning("[Supervisor Escalation] No active supervisor or admin found with WhatsApp number for dept {$targetDept} (ticket #{$issueCode})");
                continue;
            }

            foreach ($recipients as $recipient) {
                if (isset($notifiedUserIds[$recipient->id])) {
                    continue;
                }
                $notifiedUserIds[$recipient->id] = true;

                $spvTitle = $recipient->hod_title ?: ($recipient->role === 'admin' ? 'Administrator' : 'Supervisor ' . $targetDept);
                $spvName = $recipient->staff_name ?: $recipient->name;

                // In-app dashboard notification
                self::createDashboardNotification([
                    'user_id'     => $recipient->id,
                    'department'  => $targetDept,
                    'role_target' => $recipient->role === 'admin' ? 'admin' : 'supervisor',
                    'type'        => 'issue_escalation',
                    'title'       => "⏰ Eskalasi 1 Jam ({$issueCode})",
                    'message'     => "Isu #{$issueCode} [{$targetDept}]: {$issue->title} di {$location} belum diperbarui selama {$idleFormatted}.",
                    'link'        => "/lapangan?focus={$issueCode}",
                ]);

                // WhatsApp Direct DM
                if ($recipient->notify_whatsapp_tickets !== false && !empty($recipient->whatsapp_number)) {
                    $fallbackNotice = $isFallback ? "⚠️ *[AUTO-FAILOVER]*\n_{$fallbackReason}_\n\n" : "";

                    $msg = "⏰ *ESKALASI SUPERVISOR (1 JAM TANPA KABAR)* ⏰\n\n"
                         . "Halo *{$spvName}* ({$spvTitle}),\n"
                         . "Isu pada departemen *{$targetDept}* berikut belum mendapatkan pembaruan progres selama *{$idleFormatted}*:\n\n"
                         . "• *ID Tiket:* #{$issueCode}\n"
                         . "• *Masalah:* {$issue->title}\n"
                         . "• *Lokasi:* {$location}\n"
                         . "• *Departemen:* {$deptDisplay}\n"
                         . "• *Pelapor:* {$reporter}{$reporterDept}\n"
                         . "• *Status:* {$statusLabel}{$workersLine}\n"
                         . "• *Kabar Terakhir:* {$lastUpdateWib} ({$idleFormatted} lalu)\n\n"
                         . $fallbackNotice
                         . "Mohon segera arahkan tim untuk memperbarui *Update Progres*, menandai *Pending* jika terkendala, atau *Selesai* di Telunas Issue Tracker. Jika masih tanpa kabar hingga *3 jam*, laporan akan otomatis diteruskan ke Owner.\n\n"
                         . "🔗 *Buka Tiket:* {$tailscaleLink}";

                    if (self::sendWhatsApp($recipient->whatsapp_number, $msg)) {
                        $anyDelivered = true;
                        $notifiedNames[] = $spvName;
                    } else {
                        Log::warning("[Supervisor Escalation] Failed sending 1h DM to {$spvName} ({$recipient->whatsapp_number}) for ticket #{$issueCode}.");
                    }
                }
            }
        }

        return [
            'sent'        => $anyDelivered,
            'recipients'  => $notifiedNames,
            'is_fallback' => $anyFallback,
        ];
    }

    /**
     * Notify Admins for informational monitoring when a new user registers (pending HOD)
     */
    public static function notifyAdminsNewRegistration(ApprovalTicket $ticket): void
    {
        // 1. In-app notification for Admins
        self::createDashboardNotification([
            'role_target' => 'admin',
            'type' => 'ticket_request',
            'title' => "Info Registrasi Akun Baru: {$ticket->staff_name} ({$ticket->ticket_number})",
            'message' => "Pengguna baru {$ticket->staff_name} telah mendaftar di departemen {$ticket->department}. Saat ini sedang menunggu tinjauan HOD.",
            'link' => "/tickets?id={$ticket->id}",
        ]);

        // 2. Direct WhatsApp to Admins if enabled
        $admins = User::where('role', 'admin')
            ->where('notify_whatsapp_tickets', true)
            ->whereNotNull('whatsapp_number')
            ->get();

        $ticketLink = self::getTailscaleAppUrl("/tickets?id={$ticket->id}");

        foreach ($admins as $admin) {
            $msg = "📋 *[Info Monitoring] Pendaftaran Akun Baru*\n\n"
                 . "Pengguna: *{$ticket->staff_name}*\n"
                 . "Departemen: *{$ticket->department}*\n"
                 . "Nomor Tiket: *{$ticket->ticket_number}*\n"
                 . "Status: *Menunggu Tinjauan HOD*\n\n"
                 . "User baru telah mendaftar dan menunggu verifikasi dari HOD departemen terkait.\n"
                 . "🔗 *Pantau Tiket:* {$ticketLink}";
            self::sendWhatsApp($admin->whatsapp_number, $msg);
        }
    }

    /**
     * Notify Admin when a ticket needs final ACC
     */
    public static function notifyAdmins(ApprovalTicket $ticket, string $actionTitle): void
    {
        $isDirectHodTransfer = ($ticket->type === 'department_transfer' && !$ticket->hod_id);
        $targetDisplay = str_replace('::', ' - ', $ticket->requested_value ?: '-');

        // 1. In-app notification for Admins
        self::createDashboardNotification([
            'role_target' => 'admin',
            'type' => 'ticket_request',
            'title' => "Tiket Menunggu ACC Admin: {$actionTitle} ({$ticket->ticket_number})",
            'message' => $isDirectHodTransfer
                ? "HoD {$ticket->staff_name} ({$ticket->department} ➔ {$targetDisplay}) mengajukan pindah departemen. Menunggu ACC final Admin."
                : "Tiket {$ticket->ticket_number} ({$ticket->staff_name} - {$ticket->department}) telah disetujui HOD dan menunggu ACC final Admin.",
            'link' => "/tickets?id={$ticket->id}",
        ]);

        // 2. Direct WhatsApp to Admins if enabled
        $admins = User::where('role', 'admin')
            ->where('notify_whatsapp_tickets', true)
            ->whereNotNull('whatsapp_number')
            ->get();

        $ticketLink = self::getTailscaleAppUrl("/tickets?id={$ticket->id}");

        foreach ($admins as $admin) {
            if ($isDirectHodTransfer) {
                $msg = "👑 *Permohonan Pindah Departemen (HOD)*\n\n"
                     . "Nomor Tiket: *#{$ticket->ticket_number}*\n"
                     . "Pemohon: *{$ticket->staff_name}* (HOD {$ticket->department})\n"
                     . "Departemen Tujuan: *{$targetDisplay}*\n"
                     . "Alasan: " . ($ticket->reason ?: '-') . "\n\n"
                     . "Status: Menunggu ACC Final Admin (Tersedia opsi penetapan status HOD di departemen baru).\n"
                     . "🔗 *Tinjau Tiket:* {$ticketLink}";
            } else {
                $msg = "👑 *Pemberitahuan Tiket Menunggu ACC Final Admin*\n\n"
                     . "Tipe: *{$actionTitle}*\n"
                     . "Nomor: *{$ticket->ticket_number}*\n"
                     . "Staf: *{$ticket->staff_name}* ({$ticket->department})\n"
                     . "Catatan HOD: " . ($ticket->hod_notes ?: '-') . "\n\n"
                     . "Silakan login ke Web Dashboard untuk memberikan persetujuan final:\n"
                     . "🔗 {$ticketLink}";
            }
            self::sendWhatsApp($admin->whatsapp_number, $msg);
        }
    }

    /**
     * Notify User about their ticket resolution (Approved or Rejected)
     */
    public static function notifyUserResolution(ApprovalTicket $ticket, bool $approved, ?string $reason = null): void
    {
        $statusLabel = $approved ? 'Disetujui' : 'Ditolak';
        $typeLabel = match ($ticket->type) {
            'account_registration' => 'Pendaftaran Akun',
            'whatsapp_change' => 'Perubahan Nomor WhatsApp',
            'whatsapp_unlink' => 'Pelepasan Nomor WhatsApp',
            'password_reset' => 'Reset Password',
            'department_transfer' => 'Mutasi / Pindah Departemen',
            default => 'Pengajuan Tiket',
        };

        $msgBody = $approved
            ? "Permohonan {$typeLabel} Anda (#{$ticket->ticket_number}) telah DISETUJUI."
            : "Permohonan {$typeLabel} Anda (#{$ticket->ticket_number}) DITOLAK. Alasan: " . ($reason ?: 'Tidak memenuhi persyaratan.');

        // 1. In-app notification if user account exists
        if ($ticket->user_id) {
            self::createDashboardNotification([
                'user_id' => $ticket->user_id,
                'type' => $approved ? 'ticket_approved' : 'ticket_rejected',
                'title' => "{$typeLabel} {$statusLabel} (#{$ticket->ticket_number})",
                'message' => $msgBody,
                'link' => "/tickets?id={$ticket->id}",
            ]);
        }

        // 2. Direct WhatsApp notification to user
        $targetPhone = $ticket->requested_value ?: $ticket->current_value;
        if (!$targetPhone && $ticket->user && $ticket->user->whatsapp_number) {
            $targetPhone = $ticket->user->whatsapp_number;
        }

        // Check if user allowed WhatsApp notifications (or default true for registration)
        $allowed = true;
        if ($ticket->user && isset($ticket->user->notify_whatsapp_tickets)) {
            $allowed = (bool) $ticket->user->notify_whatsapp_tickets;
        }

        if ($targetPhone && $allowed) {
            $icon = $approved ? '✅' : '❌';
            $ticketLink = self::getTailscaleAppUrl("/tickets?id={$ticket->id}");
            $waMsg = "{$icon} *Pemberitahuan Status Tiket {$ticket->ticket_number}*\n\n"
                   . "Halo *{$ticket->staff_name}*,\n\n"
                   . "Permohonan *{$typeLabel}* Anda berstatus: *{$statusLabel}*.\n\n"
                   . ($approved ? "Sekarang Anda dapat menggunakan akun/fitur tersebut di Web Dashboard." : "⚠️ Alasan Penolakan:\n_{$reason}_") . "\n\n"
                   . "🔗 *Lihat Tiket:* {$ticketLink}\n\n"
                   . "Terima kasih.";
            self::sendWhatsApp($targetPhone, $waMsg);
        }
    }

    /**
     * Notify a user when their HOD status is granted or revoked, including which admin did it.
     */
    public static function notifyHodStatusChange(User $targetUser, bool $isGranted, ?User $adminUser, ?string $hodTitle = null): void
    {
        $adminName = $adminUser ? ($adminUser->staff_name ?: $adminUser->name) : 'Administrator';
        $department = $targetUser->department ?: 'Umum';

        if ($isGranted) {
            $userTitle = "👑 Diangkat Menjadi Head of Department (HOD)";
            $userMessage = "Selamat! Anda telah diangkat menjadi Head of Department (HOD) untuk departemen {$department}"
                         . ($hodTitle ? " ({$hodTitle})" : "")
                         . " oleh Admin: {$adminName}.";

            $adminTitle = "Perubahan HOD: {$targetUser->name} ({$department})";
            $adminMessage = "Admin {$adminName} telah mengangkat {$targetUser->name} sebagai HOD departemen {$department}"
                          . ($hodTitle ? " ({$hodTitle})" : "") . ".";
        } else {
            $userTitle = "⚠️ Status Head of Department (HOD) Dicabut";
            $userMessage = "Status Head of Department (HOD) Anda untuk departemen {$department} telah dicabut oleh Admin: {$adminName}.";

            $adminTitle = "Pencabutan HOD: {$targetUser->name} ({$department})";
            $adminMessage = "Admin {$adminName} telah mencabut status HOD dari {$targetUser->name} ({$department}).";
        }

        // 1. In-app notification for the affected user
        self::createDashboardNotification([
            'user_id' => $targetUser->id,
            'department' => $targetUser->department,
            'type' => 'hod_status_change',
            'title' => $userTitle,
            'message' => $userMessage,
            'link' => '/profile',
        ]);

        // 2. In-app notification for other Admins
        self::createDashboardNotification([
            'role_target' => 'admin',
            'type' => 'hod_status_change',
            'title' => $adminTitle,
            'message' => $adminMessage,
            'link' => '/users',
        ]);

        // 3. Direct WhatsApp notification to user if enabled
        if ($targetUser->notify_whatsapp_tickets && !empty($targetUser->whatsapp_number)) {
            $profileLink = self::getTailscaleAppUrl('/profile');
            if ($isGranted) {
                $waMsg = "👑 *PEMBERITAHUAN HOD TELUNAS* 👑\n\n"
                       . "Halo *{$targetUser->name}*,\n\n"
                       . "Akun Anda telah *DIANGKAT* menjadi *Head of Department (HOD)* untuk departemen *{$department}*"
                       . ($hodTitle ? " ({$hodTitle})" : "") . ".\n\n"
                       . "• *Ditetapkan oleh Admin:* {$adminName}\n"
                       . "• *Wewenang:* Anda kini dapat meninjau & menyetujui tiket permohonan staf dan akun baru di departemen Anda.\n\n"
                       . "🔗 *Buka Profil & Wewenang:* {$profileLink}";
            } else {
                $waMsg = "⚠️ *PEMBERITAHUAN HOD TELUNAS* ⚠️\n\n"
                       . "Halo *{$targetUser->name}*,\n\n"
                       . "Status *Head of Department (HOD)* Anda untuk departemen *{$department}* telah *DICABUT*.\n\n"
                       . "• *Dicabut oleh Admin:* {$adminName}\n"
                       . "• *Status Terkini:* Anggota Staf Biasa\n\n"
                       . "🔗 *Buka Profil:* {$profileLink}";
            }
            self::sendWhatsApp($targetUser->whatsapp_number, $waMsg);
        }
    }

    /**
     * Snapshot all currently active Administrator recipients BEFORE any role/status mutation.
     * Optionally includes a target user using their original pre-change phone & email so an
     * attacker cannot silence alerts by clearing/modifying contact info alongside a demotion.
     *
     * @return array<int, array{id: int, name: string, whatsapp_number: ?string, email: ?string}>
     */
    public static function snapshotActiveAdmins(?User $extraUser = null, ?string $originalPhone = null, ?string $originalEmail = null): array
    {
        $admins = User::where('role', 'admin')
            ->where('is_active', true)
            ->whereNull('deleted_at')
            ->get(['id', 'name', 'staff_name', 'whatsapp_number', 'email']);

        $byId = [];
        foreach ($admins as $admin) {
            $byId[$admin->id] = [
                'id'              => (int) $admin->id,
                'name'            => (string) ($admin->staff_name ?: $admin->name ?: 'Administrator'),
                'whatsapp_number' => $admin->whatsapp_number ? trim((string) $admin->whatsapp_number) : null,
                'email'           => $admin->email ? trim((string) $admin->email) : null,
            ];
        }

        if ($extraUser) {
            $phone = $originalPhone !== null ? trim($originalPhone) : ($extraUser->whatsapp_number ? trim((string) $extraUser->whatsapp_number) : null);
            $email = $originalEmail !== null ? trim($originalEmail) : ($extraUser->email ? trim((string) $extraUser->email) : null);

            $byId[(int) $extraUser->id] = [
                'id'              => (int) $extraUser->id,
                'name'            => (string) ($extraUser->staff_name ?: $extraUser->name ?: 'Administrator'),
                'whatsapp_number' => $phone !== '' ? $phone : null,
                'email'           => $email !== '' ? $email : null,
            ];
        }

        return array_values($byId);
    }

    /**
     * Build security alert message payloads (WhatsApp + Email fallback) for Admin privilege changes.
     *
     * @return array{subject: string, whatsapp: string, email: string}
     */
    public static function buildAdminPrivilegeAlertMessage(array $event, bool $isAffectedTarget = false): array
    {
        $type = (string) ($event['type'] ?? 'PROMOTED_TO_ADMIN');
        $targetName = (string) ($event['target_name'] ?? '-');
        $targetEmail = (string) ($event['target_email'] ?? '-');
        $targetDept = (string) ($event['target_department'] ?? 'Umum');
        $changeDetail = (string) ($event['change_detail'] ?? '-');
        $actorName = (string) ($event['actor_name'] ?? 'Administrator');
        $actorIp = (string) ($event['actor_ip'] ?? '-');
        $source = (string) ($event['source'] ?? 'Web Manajemen User');
        $timestamp = (string) ($event['timestamp'] ?? Carbon::now('Asia/Jakarta')->format('d M Y, H:i') . ' WIB');
        $auditUrl = self::getTailscaleAppUrl('/users');

        $typeTitle = match ($type) {
            'NEW_ADMIN'          => 'Akun Administrator Baru Dibuat',
            'PROMOTED_TO_ADMIN'  => 'Promosi Hak Akses ke Administrator',
            'DEMOTED_FROM_ADMIN' => 'Pencabutan Hak Akses Administrator',
            'ADMIN_DEACTIVATED'  => 'Penonaktifan / Arsip Akun Administrator',
            default              => 'Perubahan Hak Akses Administrator',
        };

        $subject = "[SECURITY ALERT] {$typeTitle}: {$targetName} - Telunas Issue Tracker";

        if ($isAffectedTarget) {
            $waLead = "⚠️ *Pemberitahuan Khusus untuk Anda ({$targetName}):*\n"
                . "Hak akses *Administrator* pada akun Anda sedang diubah / dicabut. Pesan ini dikirim sebelum status Administrator Anda berakhir.";
            $emailLead = "PEMBERITAHUAN KHUSUS UNTUK ANDA ({$targetName}):\n"
                . "Hak akses Administrator pada akun Anda sedang diubah / dicabut. Pemberitahuan ini dikirim sebelum status Administrator Anda berakhir.";
        } else {
            $waLead = "🔔 *Pemberitahuan Keamanan untuk Seluruh Administrator Aktif:*\n"
                . "Terdeteksi perubahan penting pada hak akses *Administrator* di sistem Telunas Issue Tracker.";
            $emailLead = "PEMBERITAHUAN KEAMANAN UNTUK SELURUH ADMINISTRATOR AKTIF:\n"
                . "Terdeteksi perubahan penting pada hak akses Administrator di sistem Telunas Issue Tracker.";
        }

        $waMsg = "🚨 *PERINGATAN KEAMANAN AKSES ADMIN* 🚨\n\n"
            . "{$waLead}\n\n"
            . "• *Kejadian:* {$typeTitle}\n"
            . "• *Akun Target:* {$targetName} ({$targetEmail})\n"
            . "• *Departemen:* {$targetDept}\n"
            . "• *Perubahan:* {$changeDetail}\n"
            . "• *Dilakukan Oleh:* {$actorName}" . ($actorIp !== '-' && $actorIp !== '' ? " (IP: {$actorIp})" : "") . "\n"
            . "• *Sumber:* {$source}\n"
            . "• *Waktu:* {$timestamp}\n\n"
            . "🔎 *Cek Audit Trail:* {$auditUrl}\n"
            . "_Jika perubahan ini tidak Anda kenali atau tidak sah, segera periksa Audit Trail dan hubungi tim IT._";

        $emailMsg = "PERINGATAN KEAMANAN AKSES ADMINISTRATOR - TELUNAS ISSUE TRACKER\n\n"
            . "{$emailLead}\n\n"
            . "Kejadian       : {$typeTitle}\n"
            . "Akun Target    : {$targetName} ({$targetEmail})\n"
            . "Departemen     : {$targetDept}\n"
            . "Perubahan      : {$changeDetail}\n"
            . "Dilakukan Oleh : {$actorName}" . ($actorIp !== '-' && $actorIp !== '' ? " (IP: {$actorIp})" : "") . "\n"
            . "Sumber         : {$source}\n"
            . "Waktu          : {$timestamp}\n\n"
            . "Cek Audit Trail: {$auditUrl}\n\n"
            . "Jika perubahan ini tidak Anda kenali atau tidak sah, segera periksa Audit Trail dan hubungi tim IT.\n"
            . "--\nSistem Keamanan Telunas Issue Tracker";

        return [
            'subject'  => $subject,
            'whatsapp' => $waMsg,
            'email'    => $emailMsg,
        ];
    }

    /**
     * Deliver a security alert to a single recipient via WhatsApp with automatic Email fallback.
     *
     * @return array{whatsapp_sent: bool, email_sent: bool}
     */
    private static function deliverSecurityAlertToRecipient(array $recipient, array $messages, string $contextLabel): array
    {
        $whatsappSent = false;
        $emailSent = false;
        $phone = !empty($recipient['whatsapp_number']) ? trim((string) $recipient['whatsapp_number']) : '';
        $email = !empty($recipient['email']) ? trim((string) $recipient['email']) : '';
        $name = (string) ($recipient['name'] ?? 'Admin');

        if ($phone !== '') {
            try {
                $whatsappSent = self::sendWhatsApp($phone, $messages['whatsapp']);
            } catch (\Throwable $waEx) {
                Log::warning("AdminSecurityAlert ({$contextLabel}): WhatsApp send error for {$name}: " . $waEx->getMessage());
            }
        }

        // Automatic fallback to Email if WhatsApp number is empty OR WhatsApp delivery failed
        if (!$whatsappSent && $email !== '') {
            try {
                Mail::raw($messages['email'], function ($mail) use ($email, $messages) {
                    $mail->to($email)->subject($messages['subject']);
                });
                $emailSent = true;
                Log::info("AdminSecurityAlert ({$contextLabel}): Fallback email sent to {$email} ({$name}).");
            } catch (\Throwable $mailEx) {
                Log::warning("AdminSecurityAlert ({$contextLabel}): Fallback email failed for {$email} ({$name}): " . $mailEx->getMessage());
            }
        }

        if (!$whatsappSent && !$emailSent) {
            Log::warning("AdminSecurityAlert ({$contextLabel}): No delivery channel succeeded for {$name} (phone=" . ($phone !== '' ? 'set' : 'empty') . ", email=" . ($email !== '' ? 'set' : 'empty') . ").");
        }

        return [
            'whatsapp_sent' => $whatsappSent,
            'email_sent'    => $emailSent,
        ];
    }

    /**
     * Synchronously notify an Admin BEFORE their Administrator privileges are revoked or deactivated.
     * Guarantees the affected admin receives the alert while they are still an Administrator.
     */
    public static function notifyTargetAdminBeforeRevocation(array $event, array $targetRecipient): array
    {
        $messages = self::buildAdminPrivilegeAlertMessage($event, true);
        return self::deliverSecurityAlertToRecipient($targetRecipient, $messages, 'pre-revocation');
    }

    /**
     * Notify all active Administrators captured in the pre-change snapshot (WhatsApp + Email fallback).
     * Skips $alreadyNotifiedUserId so a demoted/deactivated admin does not receive a duplicate alert.
     */
    public static function notifyActiveAdminsOfPrivilegeChange(array $event, array $recipientSnapshot, ?int $alreadyNotifiedUserId = null): array
    {
        $messages = self::buildAdminPrivilegeAlertMessage($event, false);
        $whatsappCount = 0;
        $emailCount = 0;
        $seenPhones = [];
        $seenEmails = [];

        foreach ($recipientSnapshot as $recipient) {
            $recipientId = isset($recipient['id']) ? (int) $recipient['id'] : null;
            if ($alreadyNotifiedUserId !== null && $recipientId === $alreadyNotifiedUserId) {
                continue;
            }

            $normPhone = !empty($recipient['whatsapp_number'])
                ? preg_replace('/[^0-9]/', '', (string) $recipient['whatsapp_number'])
                : '';
            $normEmail = !empty($recipient['email']) ? strtolower(trim((string) $recipient['email'])) : '';

            if (($normPhone !== '' && isset($seenPhones[$normPhone])) || ($normPhone === '' && $normEmail !== '' && isset($seenEmails[$normEmail]))) {
                continue;
            }
            if ($normPhone !== '') {
                $seenPhones[$normPhone] = true;
            }
            if ($normEmail !== '') {
                $seenEmails[$normEmail] = true;
            }

            $res = self::deliverSecurityAlertToRecipient($recipient, $messages, 'admin-broadcast');
            if ($res['whatsapp_sent']) {
                $whatsappCount++;
            }
            if ($res['email_sent']) {
                $emailCount++;
            }
        }

        return [
            'whatsapp_sent' => $whatsappCount,
            'email_sent'    => $emailCount,
        ];
    }
}
