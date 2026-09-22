<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
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
     * Check if a phone number is already registered (real-time validation).
     */
    public function checkPhone(Request $request): \Illuminate\Http\JsonResponse
    {
        $rawPhone = $request->input('phone', '');
        [$canonicalPhone, $zeroPhone] = $this->normalizePhoneVariants($rawPhone);

        if (empty($canonicalPhone) || strlen($canonicalPhone) < 9) {
            return response()->json([
                'available' => true,
            ]);
        }

        $conflict = User::whereIn('whatsapp_number', array_unique([$canonicalPhone, $zeroPhone]))->first();

        if ($conflict) {
            $deptLabel = !empty($conflict->department) ? " ({$conflict->department})" : '';
            return response()->json([
                'available' => false,
                'message' => "Nomor WhatsApp ini sudah terdaftar oleh akun {$conflict->name}{$deptLabel}.",
            ]);
        }

        return response()->json([
            'available' => true,
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
                    if (empty($canonicalPhone) || strlen($canonicalPhone) < 10) {
                        $fail('Nomor WhatsApp tidak valid (terlalu pendek).');
                        return;
                    }

                    $conflict = User::whereIn('whatsapp_number', array_unique([$canonicalPhone, $zeroPhone]))->first();
                    if ($conflict) {
                        $deptLabel = !empty($conflict->department) ? " ({$conflict->department})" : '';
                        $fail("Nomor WhatsApp ini sudah terdaftar oleh akun {$conflict->name}{$deptLabel}.");
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
            'whatsapp_number' => $canonicalPhone,
            'role' => 'department',
            'is_active' => false,
            'approval_status' => 'pending_hod',
            'notify_whatsapp_tickets' => true,
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
            'requested_value' => $canonicalPhone,
            'status' => 'pending_hod',
            'reason' => 'Pendaftaran akun mandiri dari Web Dashboard',
        ]);

        // Notify HODs of the department
        \App\Services\TicketNotificationService::notifyHods($ticket, 'Pendaftaran Akun Baru');

        return redirect()->route('login')->with('status', 'registration-pending');
    }
}
