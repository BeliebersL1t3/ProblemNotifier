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

        // Store target return URL (default: previous URL) with strict open-redirect sanitization
        $rawReturnUrl = $request->input('return_to', url()->previous() ?: route('dashboard'));
        $returnUrl = $this->sanitizeReturnUrl($rawReturnUrl);
        session(['google_oauth_return_to' => $returnUrl]);

        // Generate and store anti-CSRF OAuth state
        $state = \Illuminate\Support\Str::random(40);
        session(['google_oauth_state' => $state]);

        try {
            $authUrl = $this->gmailApiService->getAuthUrl(state: $state, loginHint: $user->email);
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
        $returnUrl = $this->sanitizeReturnUrl($returnUrl);

        if ($request->has('error')) {
            Log::warning('Google OAuth Error received: ' . $request->input('error'));
            return redirect()->to($returnUrl)->with('error', 'Otorisasi Google dibatalkan atau gagal.');
        }

        // Verify anti-CSRF OAuth state
        $expectedState = session()->pull('google_oauth_state');
        $receivedState = $request->input('state');
        if (empty($expectedState) || empty($receivedState) || !hash_equals((string) $expectedState, (string) $receivedState)) {
            Log::warning('Google OAuth State Mismatch (potential CSRF attack).');
            return redirect()->to($returnUrl)->with('error', 'Sesi otorisasi Google tidak valid atau kedaluwarsa. Silakan coba kembali.');
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
     * Sanitize return URL to prevent Open Redirect attacks.
     */
    private function sanitizeReturnUrl(?string $url): string
    {
        if (empty($url)) {
            return route('dashboard');
        }

        // Local relative path (e.g. /dashboard or /profile)
        if (str_starts_with($url, '/') && !str_starts_with($url, '//')) {
            return $url;
        }

        // Host verification for absolute URLs
        $appHost = parse_url(config('app.url'), PHP_URL_HOST);
        $urlHost = parse_url($url, PHP_URL_HOST);
        if ($urlHost && $appHost && strtolower($urlHost) === strtolower($appHost)) {
            return $url;
        }

        return route('dashboard');
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
