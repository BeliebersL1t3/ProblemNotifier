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
        return Inertia::render('Profile/Edit', [
            'mustVerifyEmail' => $request->user() instanceof MustVerifyEmail,
            'status' => session('status'),
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
     * Update user's WhatsApp number.
     */
    public function updateWhatsApp(Request $request): RedirectResponse
    {
        $request->validate([
            'whatsapp_number' => ['nullable', 'string', 'max:30'],
        ]);

        $user = $request->user();
        $rawPhone = trim($request->input('whatsapp_number', ''));

        if (!empty($rawPhone)) {
            // Normalize: remove non-digits
            $clean = preg_replace('/[^0-9]/', '', $rawPhone);
            if (str_starts_with($clean, '0')) {
                $clean = '62' . substr($clean, 1);
            } elseif (str_starts_with($clean, '8')) {
                $clean = '62' . $clean;
            }

            // Check if phone number is already registered to another user
            $conflict = \App\Models\User::where('whatsapp_number', $clean)
                ->where('id', '!=', $user->id)
                ->first();

            if ($conflict) {
                return Redirect::back()->withErrors([
                    'whatsapp_number' => "Nomor WhatsApp ini sudah digunakan oleh akun {$conflict->name} ({$conflict->department})."
                ]);
            }

            $user->whatsapp_number = $clean;
        } else {
            $user->whatsapp_number = null;
        }

        $user->save();

        // Notify WhatsApp bot to sync staff memory in real-time
        try {
            \Illuminate\Support\Facades\Http::timeout(1)->post('http://localhost:3000/sync-staff');
        } catch (\Exception $e) {}

        return Redirect::route('profile.edit')->with('status', 'whatsapp-updated');
    }

    /**
     * API endpoint: Return staff directory of registered WhatsApp numbers for the bot.
     */
    public function staffDirectory()
    {
        $users = \App\Models\User::whereNotNull('whatsapp_number')
            ->select('id', 'name', 'staff_name', 'department', 'subdivision', 'role', 'whatsapp_number')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $users,
        ]);
    }

    /**
     * API endpoint: Link WhatsApp phone number to matching User from WhatsApp claiming.
     */
    public function linkStaffFromWhatsApp(Request $request)
    {
        $staffName = trim($request->input('staff_name', ''));
        $department = trim($request->input('department', ''));
        $rawPhone = trim($request->input('whatsapp_number', ''));

        if (empty($rawPhone)) {
            return response()->json(['success' => false, 'message' => 'Phone required'], 400);
        }

        $cleanPhone = preg_replace('/[^0-9]/', '', $rawPhone);
        if (str_starts_with($cleanPhone, '0')) {
            $cleanPhone = '62' . substr($cleanPhone, 1);
        }

        // First find user matching department AND staff_name
        $query = \App\Models\User::query();
        if (!empty($department)) {
            $query->where(function($q) use ($department) {
                $q->where('department', 'like', "%{$department}%")
                  ->orWhere('name', 'like', "%{$department}%");
            });
        }

        // Try to match staffName
        $cleanStaff = preg_replace('/[^a-zA-Z0-9]/', '', $staffName);
        $firstName = explode(' ', trim($staffName))[0] ?? '';
        $matchedUser = (clone $query)->where(function($q) use ($staffName, $firstName, $cleanStaff) {
            $q->where('staff_name', 'like', "%{$staffName}%")
              ->orWhere('name', 'like', "%{$staffName}%")
              ->orWhere('staff_name', 'like', "%{$firstName}%")
              ->orWhere('name', 'like', "%{$firstName}%");
        })->first();

        // Fallback: match first user of that department if specific name not found
        if (!$matchedUser && !empty($department)) {
            $matchedUser = $query->first();
        }

        if ($matchedUser) {
            // Anti-Impersonation: If account is already linked to another WhatsApp number, reject overwrite!
            if (!empty($matchedUser->whatsapp_number) && $matchedUser->whatsapp_number !== $cleanPhone) {
                return response()->json([
                    'success' => false,
                    'message' => "Akun {$matchedUser->name} sudah terdaftar untuk nomor WhatsApp lain (+{$matchedUser->whatsapp_number})."
                ], 403);
            }

            // Unlink any other user who had this phone number to prevent duplicates
            \App\Models\User::where('whatsapp_number', $cleanPhone)
                ->where('id', '!=', $matchedUser->id)
                ->update(['whatsapp_number' => null]);

            $matchedUser->whatsapp_number = $cleanPhone;
            $matchedUser->save();

            return response()->json([
                'success' => true,
                'message' => "Linked phone to user {$matchedUser->name} ({$matchedUser->department})",
                'user' => [
                    'id' => $matchedUser->id,
                    'name' => $matchedUser->name,
                    'department' => $matchedUser->department,
                    'whatsapp_number' => $matchedUser->whatsapp_number,
                ]
            ]);
        }

        return response()->json(['success' => false, 'message' => 'No matching user found'], 404);
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

        $user = null;
        if (!empty($userId)) {
            $user = \App\Models\User::find($userId);
        }
        if (!$user && !empty($cleanPhone)) {
            $user = \App\Models\User::where('whatsapp_number', $cleanPhone)->first();
        }

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Akun tidak ditemukan atau nomor WhatsApp belum ditautkan.'], 404);
        }

        // Return current actual password without modifying/resetting it
        $currentPassword = $user->raw_password ?: 'telunas123';

        return response()->json([
            'success'    => true,
            'name'       => $user->staff_name ?: $user->name,
            'email'      => $user->email,
            'department' => $user->department,
            'password'   => $currentPassword,
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

        $extension = strtolower($file->getClientOriginalExtension() ?: 'png');
        $filename = 'avatar_' . $user->id . '_' . time() . '_' . \Illuminate\Support\Str::random(6) . '.' . $extension;

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
