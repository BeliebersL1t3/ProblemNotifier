<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class EmailUpdateController extends Controller
{
    /**
     * Update an account from a placeholder/dummy email to their real, verified email address.
     */
    public function updateRealEmail(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 401);
        }

        $validated = $request->validate([
            'email' => [
                'required',
                'string',
                'email',
                'max:255',
                'unique:users,email,' . $user->id,
                function ($attribute, $value, $fail) {
                    $lower = strtolower(trim($value));
                    $dummyDomains = ['telunas.com', 'example.com', 'test.com', 'dummy.com', 'localhost'];
                    foreach ($dummyDomains as $domain) {
                        if (str_ends_with($lower, '@' . $domain)) {
                            $fail('Harap gunakan alamat email asli (seperti Gmail atau email aktif perusahaan), bukan domain dummy.');
                            return;
                        }
                    }
                },
            ],
        ]);

        $oldEmail = $user->email;
        $newEmail = strtolower(trim($validated['email']));

        $user->email = $newEmail;
        $user->save();

        Log::info("User #{$user->id} ({$user->name}) transitioned from dummy email '{$oldEmail}' to real email '{$newEmail}'");

        return response()->json([
            'success' => true,
            'message' => 'Alamat email asli berhasil dihubungkan ke akun Anda!',
            'user'    => [
                'id'             => $user->id,
                'name'           => $user->name,
                'email'          => $user->email,
                'is_dummy_email' => false,
            ],
        ]);
    }
}
