<?php

namespace App\Services;

use App\Models\ApprovalTicket;
use App\Models\DashboardNotification;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TicketNotificationService
{
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
            ])->connectTimeout(2)->timeout(3)->post('http://localhost:3000/notify-direct', [
                'phone' => $cleanPhone,
                'message' => $message,
            ]);

            return $response->successful();
        } catch (\Throwable $e) {
            Log::info("WhatsApp ticket notification skipped (bot offline): " . $e->getMessage());
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
            ])->connectTimeout(2)->timeout(3)->post('http://localhost:3000/api/check-number', [
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

        foreach ($hods as $hod) {
            $msg = "🔔 *Pemberitahuan Tiket Menunggu Tinjauan HOD*\n\n"
                 . "Tipe: *{$actionTitle}*\n"
                 . "Nomor Tiket: *{$ticket->ticket_number}*\n"
                 . "Staf: *{$ticket->staff_name}*\n"
                 . "Departemen: *{$ticket->department}*\n\n"
                 . "Silakan masuk ke Web Dashboard untuk meninjau dan memberikan persetujuan.";
            self::sendWhatsApp($hod->whatsapp_number, $msg);
        }
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

        foreach ($admins as $admin) {
            $msg = "📋 *[Info Monitoring] Pendaftaran Akun Baru*\n\n"
                 . "Pengguna: *{$ticket->staff_name}*\n"
                 . "Departemen: *{$ticket->department}*\n"
                 . "Nomor Tiket: *{$ticket->ticket_number}*\n"
                 . "Status: *Menunggu Tinjauan HOD*\n\n"
                 . "User baru telah mendaftar dan menunggu verifikasi dari HOD departemen terkait. Anda dapat memantau statusnya di Web Dashboard.";
            self::sendWhatsApp($admin->whatsapp_number, $msg);
        }
    }

    /**
     * Notify Admin when a ticket needs final ACC
     */
    public static function notifyAdmins(ApprovalTicket $ticket, string $actionTitle): void
    {
        // 1. In-app notification for Admins
        self::createDashboardNotification([
            'role_target' => 'admin',
            'type' => 'ticket_request',
            'title' => "Tiket Menunggu ACC Admin: {$actionTitle} ({$ticket->ticket_number})",
            'message' => "Tiket {$ticket->ticket_number} ({$ticket->staff_name} - {$ticket->department}) telah disetujui HOD dan menunggu ACC final Admin.",
            'link' => "/tickets?id={$ticket->id}",
        ]);

        // 2. Direct WhatsApp to Admins if enabled
        $admins = User::where('role', 'admin')
            ->where('notify_whatsapp_tickets', true)
            ->whereNotNull('whatsapp_number')
            ->get();

        foreach ($admins as $admin) {
            $msg = "👑 *Pemberitahuan Tiket Menunggu ACC Final Admin*\n\n"
                 . "Tipe: *{$actionTitle}*\n"
                 . "Nomor: *{$ticket->ticket_number}*\n"
                 . "Staf: *{$ticket->staff_name}* ({$ticket->department})\n"
                 . "Catatan HOD: " . ($ticket->hod_notes ?: '-') . "\n\n"
                 . "Silakan login ke Web Dashboard untuk memberikan persetujuan final.";
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
            $waMsg = "{$icon} *Pemberitahuan Status Tiket {$ticket->ticket_number}*\n\n"
                   . "Halo *{$ticket->staff_name}*,\n\n"
                   . "Permohonan *{$typeLabel}* Anda berstatus: *{$statusLabel}*.\n\n"
                   . ($approved ? "Sekarang Anda dapat menggunakan akun/fitur tersebut di Web Dashboard." : "⚠️ Alasan Penolakan:\n_{$reason}_") . "\n\n"
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
            if ($isGranted) {
                $waMsg = "👑 *PEMBERITAHUAN HOD TELUNAS* 👑\n\n"
                       . "Halo *{$targetUser->name}*,\n\n"
                       . "Akun Anda telah *DIANGKAT* menjadi *Head of Department (HOD)* untuk departemen *{$department}*"
                       . ($hodTitle ? " ({$hodTitle})" : "") . ".\n\n"
                       . "• *Ditetapkan oleh Admin:* {$adminName}\n"
                       . "• *Wewenang:* Anda kini dapat meninjau & menyetujui tiket permohonan staf dan akun baru di departemen Anda.\n\n"
                       . "Silakan masuk ke Web Dashboard Telunas untuk melihat detail akun Anda.";
            } else {
                $waMsg = "⚠️ *PEMBERITAHUAN HOD TELUNAS* ⚠️\n\n"
                       . "Halo *{$targetUser->name}*,\n\n"
                       . "Status *Head of Department (HOD)* Anda untuk departemen *{$department}* telah *DICABUT*.\n\n"
                       . "• *Dicabut oleh Admin:* {$adminName}\n"
                       . "• *Status Terkini:* Anggota Staf Biasa\n\n"
                       . "Akses peninjauan tiket HOD untuk akun Anda telah dinonaktifkan.";
            }
            self::sendWhatsApp($targetUser->whatsapp_number, $waMsg);
        }
    }
}
