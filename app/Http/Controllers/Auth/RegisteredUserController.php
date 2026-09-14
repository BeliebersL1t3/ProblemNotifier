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
     * Handle an incoming registration request.
     *
     * @throws ValidationException
     */
    public function store(Request $request): RedirectResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|lowercase|email|max:255|unique:'.User::class,
            'password' => ['required', 'confirmed', Rules\Password::defaults()],
            'department' => 'required|string|max:100',
            'subdivision' => 'nullable|string|max:100',
            'whatsapp_number' => 'required|string|max:30',
        ]);

        $cleanPhone = preg_replace('/[^0-9]/', '', $request->whatsapp_number);
        if (empty($cleanPhone)) {
            throw ValidationException::withMessages([
                'whatsapp_number' => 'Nomor WhatsApp tidak valid.',
            ]);
        }

        // Check if phone number is already registered by active user
        $conflict = User::where('whatsapp_number', $cleanPhone)->first();
        if ($conflict) {
            throw ValidationException::withMessages([
                'whatsapp_number' => "Nomor WhatsApp ini sudah terdaftar oleh akun {$conflict->name} ({$conflict->department}).",
            ]);
        }

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'department' => $request->department,
            'subdivision' => $request->subdivision,
            'whatsapp_number' => $cleanPhone,
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
            'requested_value' => $cleanPhone,
            'status' => 'pending_hod',
            'reason' => 'Pendaftaran akun mandiri dari Web Dashboard',
        ]);

        // Notify HODs of the department
        \App\Services\TicketNotificationService::notifyHods($ticket, 'Pendaftaran Akun Baru');

        return redirect()->route('login')->with('status', 'registration-pending');
    }
}
