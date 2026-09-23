<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProfileUpdateRequest;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Redirect;
use Inertia\Inertia;
use Inertia\Response;

class ProfileController extends Controller
{
    /**
     * Display the user's profile form.
     */
    public function edit(Request $request): Response
    {
        $user = $request->user();

        $pendingTickets = \App\Models\ApprovalTicket::where('user_id', $user->id)
            ->whereIn('status', ['pending_hod', 'pending_admin'])
            ->get();

        $pendingTransferTicket = $pendingTickets->firstWhere('type', 'department_transfer');
        $pendingWaOrPwdTicket = $pendingTickets->whereIn('type', ['whatsapp_change', 'whatsapp_unlink', 'password_reset'])->first();

        return Inertia::render('Profile/Edit', [
            'mustVerifyEmail' => $user instanceof MustVerifyEmail,
            'status' => session('status'),
            'pendingTicket' => $pendingWaOrPwdTicket,
            'pendingTransferTicket' => $pendingTransferTicket,
            'notifyWhatsAppTickets' => (bool) $user->notify_whatsapp_tickets,
        ]);
    }

    /**
     * Update the user's profile information.
     */
    public function update(ProfileUpdateRequest $request): RedirectResponse
    {
        $request->user()->fill($request->validated());

        if ($request->user()->isDirty('email')) {
            $request->user()->email_verified_at = null;
        }

        $request->user()->save();

        return Redirect::route('profile.edit');
    }

    /**
     * Update user's WhatsApp number (Admin direct, regular user via ticket).
     */
    public function updateWhatsApp(Request $request): RedirectResponse
    {
        $request->validate([
            'whatsapp_number' => ['nullable', 'string', 'max:30'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $user = $request->user();
        $rawPhone = trim($request->input('whatsapp_number', ''));
        $clean = null;

        if (!empty($rawPhone)) {
            $clean = preg_replace('/[^0-9]/', '', $rawPhone);
            if (str_starts_with($clean, '0')) {
                $clean = '62' . substr($clean, 1);
            } elseif (str_starts_with($clean, '8')) {
                $clean = '62' . $clean;
            }

            // Check if phone number is already registered to another active user
            $conflict = \App\Models\User::where('whatsapp_number', $clean)
                ->where('id', '!=', $user->id)
                ->first();

            if ($conflict) {
                return Redirect::back()->withErrors([
                    'whatsapp_number' => "Nomor WhatsApp ini sudah digunakan oleh akun {$conflict->name} ({$conflict->department})."
                ]);
            }
        }

        // If Admin or HOD, direct update is permitted without tickets
        if ($user->isAdmin() || $user->isHOD()) {
            $user->whatsapp_number = empty($clean) ? null : $clean;
            if (empty($clean)) {
                $user->notify_whatsapp_tickets = false;
            }
            $user->save();

            try {
                \Illuminate\Support\Facades\Http::withHeaders([
                    'X-Bot-Key' => config('services.bot.api_key'),
                ])->timeout(1)->post('http://localhost:3000/sync-staff');
            } catch (\Exception $e) {}

            return Redirect::route('profile.edit')->with('status', 'whatsapp-updated');
        }

        // For regular users / HODs: create ApprovalTicket while keeping old number active!
        $type = empty($clean) ? 'whatsapp_unlink' : 'whatsapp_change';

        // Check for existing pending ticket
        $existing = \App\Models\ApprovalTicket::where('user_id', $user->id)
            ->whereIn('status', ['pending_hod', 'pending_admin'])
            ->whereIn('type', ['whatsapp_change', 'whatsapp_unlink'])
            ->first();

        if ($existing) {
            return Redirect::back()->withErrors([
                'whatsapp_number' => "Anda masih memiliki tiket permohonan ({$existing->ticket_number}) yang sedang diproses."
            ]);
        }

        $ticket = \App\Models\ApprovalTicket::create([
            'ticket_number' => \App\Models\ApprovalTicket::generateTicketNumber($type),
            'type' => $type,
            'user_id' => $user->id,
            'department' => $user->department ?: 'General',
            'subdivision' => $user->subdivision,
            'staff_name' => $user->staff_name ?: $user->name,
            'email' => $user->email,
            'current_value' => $user->whatsapp_number,
            'requested_value' => $clean,
            'reason' => $request->input('reason') ?: 'Permohonan penggantian nomor WhatsApp via profil',
            'status' => 'pending_hod',
        ]);

        \App\Services\TicketNotificationService::notifyHods($ticket, empty($clean) ? 'Pelepasan Nomor WhatsApp' : 'Perubahan Nomor WhatsApp');

        return Redirect::route('profile.edit')->with('status', 'whatsapp-ticket-submitted');
    }

    /**
     * Update user's notification preferences
     */
    public function updateNotificationPreferences(Request $request): RedirectResponse
    {
        $request->validate([
            'notify_whatsapp_tickets' => ['required', 'boolean'],
        ]);

        $user = $request->user();
        $enableWa = $request->boolean('notify_whatsapp_tickets');

        if ($enableWa && empty($user->whatsapp_number)) {
            return Redirect::back()->withErrors([
                'notify_whatsapp_tickets' => 'Akun tidak memiliki nomor WhatsApp terdaftar. Hubungkan nomor WhatsApp terlebih dahulu untuk mengaktifkan notifikasi via WhatsApp.',
            ]);
        }

        $user->notify_whatsapp_tickets = $enableWa;
        $user->save();

        return Redirect::route('profile.edit')->with('status', 'preferences-updated');
    }

    /**
     * API endpoint: Return staff directory of registered WhatsApp numbers for the bot.
     */
    public function staffDirectory()
    {
        $users = \App\Models\User::activeApproved()
            ->whereNotNull('whatsapp_number')
            ->select('id', 'name', 'staff_name', 'department', 'subdivision', 'role', 'whatsapp_number', 'permissions', 'is_hod')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $users,
        ]);
    }

    /**
     * API endpoint: Reset password for a verified WhatsApp linked user.
     */
    public function resetPasswordViaWhatsApp(Request $request)
    {
        $userId = $request->input('user_id');
        $rawPhone = trim($request->input('whatsapp_number', ''));
        $cleanPhone = preg_replace('/[^0-9]/', '', $rawPhone);
        if (str_starts_with($cleanPhone, '0')) {
            $cleanPhone = '62' . substr($cleanPhone, 1);
        }

        if (empty($cleanPhone)) {
            return response()->json([
                'success' => false,
                'message' => 'Nomor WhatsApp pengirim wajib disertakan untuk verifikasi identitas.',
            ], 422);
        }

        // Look up user strictly by registered WhatsApp number
        $user = \App\Models\User::where('whatsapp_number', $cleanPhone)
            ->where('is_active', true)
            ->first();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Akun tidak ditemukan atau nomor WhatsApp ini belum ditautkan ke akun aktif manapun.',
            ], 404);
        }

        // If user_id is provided, strictly ensure it matches the owner of this WhatsApp number (anti-tamper / IDOR prevention)
        if (!empty($userId) && (int)$user->id !== (int)$userId) {
            return response()->json([
                'success' => false,
                'message' => 'Validasi gagal: ID akun tidak sesuai dengan nomor WhatsApp yang terdaftar.',
            ], 403);
        }

        // Generate a clean, easy-to-type temporary password for the user on mobile
        $tempPassword = 'Telunas-' . random_int(1000, 9999);

        // Update user with secure hashed password and clear reversible raw_password
        $user->forceFill([
            'password'     => \Illuminate\Support\Facades\Hash::make($tempPassword),
            'raw_password' => null,
        ])->save();

        return response()->json([
            'success'      => true,
            'name'         => $user->staff_name ?: $user->name,
            'email'        => $user->email,
            'department'   => $user->department,
            'password'     => $tempPassword,
            'is_temporary' => true,
        ]);
    }

    /**
     * Upload or update user avatar photo.
     */
    public function updateAvatar(Request $request)
    {
        $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpeg,png,jpg,webp', 'max:5120'],
        ]);

        $user = $request->user();
        $file = $request->file('avatar');

        $avatarsDir = public_path('uploads/avatars');
        if (!file_exists($avatarsDir)) {
            mkdir($avatarsDir, 0755, true);
        }

        if (!empty($user->avatar)) {
            $oldPath = $avatarsDir . '/' . basename($user->avatar);
            if (file_exists($oldPath)) {
                @unlink($oldPath);
            }
        }

        // Detect safe extension from server MIME inspection (not client provided filename)
        $extension = strtolower($file->extension() ?: ($file->guessExtension() ?: 'png'));
        if (!in_array($extension, ['jpg', 'jpeg', 'png', 'webp'])) {
            return response()->json([
                'success' => false,
                'message' => 'Format file tidak didukung.',
            ], 422);
        }
        $filename = 'avatar_' . $user->id . '_' . time() . '_' . \Illuminate\Support\Str::random(12) . '.' . $extension;

        $file->move($avatarsDir, $filename);

        $user->avatar = $filename;
        $user->save();

        if ($request->wantsJson()) {
            return response()->json([
                'success'    => true,
                'avatar'     => $user->avatar,
                'avatar_url' => $user->avatar_url,
                'message'    => 'Foto profil berhasil diperbarui.',
            ]);
        }

        return Redirect::route('profile.edit')->with('status', 'avatar-updated');
    }

    /**
     * Remove / reset user avatar photo.
     */
    public function destroyAvatar(Request $request)
    {
        $user = $request->user();
        $avatarsDir = public_path('uploads/avatars');

        if (!empty($user->avatar)) {
            $oldPath = $avatarsDir . '/' . basename($user->avatar);
            if (file_exists($oldPath)) {
                @unlink($oldPath);
            }
        }

        $user->avatar = null;
        $user->save();

        if ($request->wantsJson()) {
            return response()->json([
                'success'    => true,
                'avatar'     => null,
                'avatar_url' => null,
                'message'    => 'Foto profil berhasil dihapus.',
            ]);
        }

        return Redirect::route('profile.edit')->with('status', 'avatar-deleted');
    }

    /**
     * Delete the user's account.
     */
    public function destroy(Request $request): RedirectResponse
    {
        $request->validate([
            'password' => ['required', 'current_password'],
        ]);

        $user = $request->user();

        Auth::logout();

        $user->delete();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return Redirect::to('/');
    }
}
