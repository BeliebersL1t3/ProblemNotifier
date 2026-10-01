<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\TicketNotificationService;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class RegisteredUserController extends Controller
{
    /**
     * Display the registration view.
     */
    public function create(): Response
    {
        return Inertia::render('Auth/Register');
    }

    /**
     * Check if a phone number is valid, available, and registered on WhatsApp.
     */
    public function checkPhone(Request $request): \Illuminate\Http\JsonResponse
    {
        $rawPhone = $request->input('phone', '');
        [$canonicalPhone, $zeroPhone] = $this->normalizePhoneVariants($rawPhone);

        if (empty($canonicalPhone) || strlen($zeroPhone) < 4) {
            return response()->json([
                'valid' => true,
                'available' => true,
                'exists_on_wa' => null,
                'bot_online' => null,
            ]);
        }

        // 1. Strict Indonesian mobile format validation (08xx, 10-13 digits)
        if (!TicketNotificationService::isValidIndonesianMobile($zeroPhone)) {
            return response()->json([
                'valid' => false,
                'available' => false,
                'exists_on_wa' => null,
                'bot_online' => null,
                'message' => 'Format nomor tidak valid. Nomor seluler Indonesia harus diawali 08xx dengan panjang 10-13 digit.',
            ]);
        }

        // 2. Check local database uniqueness
        $conflict = User::whereIn('whatsapp_number', array_unique([$canonicalPhone, $zeroPhone]))->first();
        if ($conflict) {
            return response()->json([
                'valid' => true,
                'available' => false,
                'exists_on_wa' => null,
                'bot_online' => null,
                'message' => 'Nomor WhatsApp ini sudah terdaftar di sistem. Silakan gunakan nomor lain atau hubungi Admin.',
            ]);
        }

        // 3. Real-time verification with WhatsApp Bot
        $waCheck = TicketNotificationService::checkWhatsAppNumber($canonicalPhone);

        if ($waCheck['bot_online']) {
            if ($waCheck['exists'] === false) {
                return response()->json([
                    'valid' => true,
                    'available' => false,
                    'exists_on_wa' => false,
                    'bot_online' => true,
                    'message' => 'Nomor ini tidak terdaftar di WhatsApp. Pastikan nomor sudah aktif di aplikasi WhatsApp.',
                ]);
            }

            return response()->json([
                'valid' => true,
                'available' => true,
                'exists_on_wa' => true,
                'bot_online' => true,
                'message' => 'Nomor terhubung ke WhatsApp dan siap digunakan.',
            ]);
        }

        // Graceful fallback if bot is offline
        return response()->json([
            'valid' => true,
            'available' => true,
            'exists_on_wa' => null,
            'bot_online' => false,
            'message' => 'Format nomor valid. (Bot WhatsApp offline, keabsahan nomor akan diverifikasi saat review HOD)',
        ]);
    }

    /**
     * Normalize raw phone number into [canonical (628...), zero (08...)]
     *
     * @return array{0: string, 1: string}
     */
    protected function normalizePhoneVariants(?string $rawPhone): array
    {
        $clean = preg_replace('/[^0-9]/', '', (string)$rawPhone);
        if (empty($clean)) {
            return ['', ''];
        }

        if (str_starts_with($clean, '0')) {
            $canonical = '62' . substr($clean, 1);
        } elseif (str_starts_with($clean, '8')) {
            $canonical = '62' . $clean;
        } else {
            $canonical = $clean;
        }

        $zero = str_starts_with($canonical, '62') ? ('0' . substr($canonical, 2)) : $canonical;

        return [$canonical, $zero];
    }

    /**
     * Handle an incoming registration request.
     *
     * @throws ValidationException
     */
    public function store(Request $request): RedirectResponse
    {
        [$canonicalPhone, $zeroPhone] = $this->normalizePhoneVariants($request->whatsapp_number);

        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|lowercase|email|max:255|unique:'.User::class,
            'password' => ['required', 'confirmed', Rules\Password::defaults()],
            'department' => 'required|string|max:100',
            'subdivision' => 'nullable|string|max:100',
            'whatsapp_number' => [
                'required',
                'string',
                'max:30',
                function ($attribute, $value, $fail) use ($canonicalPhone, $zeroPhone) {
                    if (!TicketNotificationService::isValidIndonesianMobile($zeroPhone)) {
                        $fail('Format nomor WhatsApp tidak valid. Harus nomor seluler Indonesia diawali 08xx (10-13 digit).');
                        return;
                    }

                    $conflict = User::whereIn('whatsapp_number', array_unique([$canonicalPhone, $zeroPhone]))->first();
                    if ($conflict) {
                        $fail('Nomor WhatsApp ini sudah terdaftar di sistem. Silakan gunakan nomor lain atau hubungi Admin.');
                        return;
                    }

                    // Check with bot if bot is online
                    $waCheck = TicketNotificationService::checkWhatsAppNumber($canonicalPhone);
                    if ($waCheck['bot_online'] && $waCheck['exists'] === false) {
                        $fail('Nomor WhatsApp tidak terdaftar di server WhatsApp. Pastikan nomor sudah terdaftar dan aktif di aplikasi WhatsApp.');
                    }
                },
            ],
        ]);

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'department' => $request->department,
            'subdivision' => $request->subdivision,
            'whatsapp_number' => $zeroPhone,
            'role' => 'department',
            'is_active' => false,
            'approval_status' => 'pending_hod',
            'notify_whatsapp_tickets' => true,
            'permissions' => \App\Http\Controllers\UserController::getDefaultPermissions('department'),
        ]);

        event(new Registered($user));

        // Create Approval Ticket
        $ticket = \App\Models\ApprovalTicket::create([
            'ticket_number' => \App\Models\ApprovalTicket::generateTicketNumber('account_registration'),
            'type' => 'account_registration',
            'user_id' => $user->id,
            'department' => $user->department,
            'subdivision' => $user->subdivision,
            'staff_name' => $user->name,
            'email' => $user->email,
            'requested_value' => $zeroPhone,
            'status' => 'pending_hod',
            'reason' => 'Pendaftaran akun mandiri dari Web Dashboard',
        ]);

        // Notify HODs of the department
        \App\Services\TicketNotificationService::notifyHods($ticket, 'Pendaftaran Akun Baru');

        // Notify Admins for monitoring
        \App\Services\TicketNotificationService::notifyAdminsNewRegistration($ticket);

        return redirect()->route('login')->with('status', 'registration-pending');
    }
}
