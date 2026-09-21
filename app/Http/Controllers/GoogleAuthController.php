<?php

namespace App\Http\Controllers;

use App\Services\GmailApiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class GoogleAuthController extends Controller
{
    public function __construct(
        protected GmailApiService $gmailApiService
    ) {}

    /**
     * Redirect authenticated user to Google OAuth consent screen.
     */
    public function redirect(Request $request): RedirectResponse
    {
        $user = auth()->user();
        if (!$user) {
            return redirect()->route('login');
        }

        // Store target return URL (default: previous URL)
        $returnUrl = $request->input('return_to', url()->previous() ?: route('dashboard'));
        session(['google_oauth_return_to' => $returnUrl]);

        try {
            $authUrl = $this->gmailApiService->getAuthUrl();
            return redirect()->away($authUrl);
        } catch (\Throwable $e) {
            Log::error('Google OAuth Redirect Failed: ' . $e->getMessage());
            return redirect()->to($returnUrl)->with('error', 'Gagal memulai koneksi Google: ' . $e->getMessage());
        }
    }

    /**
     * Handle OAuth callback from Google.
     */
    public function callback(Request $request): RedirectResponse
    {
        $user = auth()->user();
        $returnUrl = session()->pull('google_oauth_return_to', route('dashboard'));

        if ($request->has('error')) {
            Log::warning('Google OAuth Error received: ' . $request->input('error'));
            return redirect()->to($returnUrl)->with('error', 'Otorisasi Google dibatalkan atau gagal.');
        }

        $code = $request->input('code');
        if (!$code) {
            return redirect()->to($returnUrl)->with('error', 'Kode otorisasi Google tidak ditemukan.');
        }

        try {
            $info = $this->gmailApiService->handleCallback($code, $user);

            return redirect()->to($returnUrl)->with(
                'success',
                "Akun Google ({$info['google_email']}) berhasil dihubungkan! Laporan PDF sekarang akan dikirimkan langsung dari akun Gmail Anda."
            );
        } catch (\Throwable $e) {
            Log::error('Google OAuth Callback Processing Failed: ' . $e->getMessage());
            return redirect()->to($returnUrl)->with('error', 'Gagal menghubungkan akun Google: ' . $e->getMessage());
        }
    }

    /**
     * Disconnect user's Google account.
     */
    public function disconnect(Request $request): JsonResponse|RedirectResponse
    {
        $user = auth()->user();
        if ($user) {
            $user->google_id = null;
            $user->google_email = null;
            $user->google_access_token = null;
            $user->google_refresh_token = null;
            $user->google_token_expires_at = null;
            $user->save();
        }

        if ($request->wantsJson()) {
            return response()->json([
                'success' => true,
                'message' => 'Akun Google berhasil diputuskan.',
            ]);
        }

        return back()->with('success', 'Akun Google berhasil diputuskan.');
    }

    /**
     * Check user's Google Mail connection status.
     */
    public function status(): JsonResponse
    {
        $user = auth()->user();

        return response()->json([
            'success'      => true,
            'connected'    => $user ? $user->hasGoogleMailConnected() : false,
            'google_email' => $user?->google_email,
            'user_email'   => $user?->email,
            'user_name'    => $user?->name,
        ]);
    }
}
