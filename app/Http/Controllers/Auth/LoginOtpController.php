<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\TicketNotificationService;
use App\Services\WhatsAppBotLauncher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class LoginOtpController extends Controller
{
    public const SESSION_KEY = 'login_otp_challenge';
    public const BOT_RECOVERY_SESSION_KEY = 'admin_bot_recovery';

    /**
     * Create and dispatch a fresh OTP challenge for the given user, returning true on delivery.
     */
    public static function initiateChallenge(Request $request, User $user, bool $remember = false): bool
    {
        $cleanDigits = preg_replace('/[^0-9]/', '', (string) ($user->whatsapp_number ?? ''));
        if ($cleanDigits === '' || !TicketNotificationService::isValidIndonesianMobile($cleanDigits)) {
            return false;
        }

        $ttlMinutes = max(1, (int) config('telunas.login_otp_ttl_minutes', 5));
        $cooldownSeconds = max(10, (int) config('telunas.login_otp_resend_cooldown_seconds', 60));
        $maxAttempts = max(1, (int) config('telunas.login_otp_max_attempts', 5));

        $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $otpHash = self::hashOtp($user->id, $otp);

        $staffDisplay = $user->staff_name ?: $user->name;
        $waMessage = "🔐 *KODE OTP LOGIN — TELUNAS ISSUE TRACKER*\n\n"
            . "Halo *{$staffDisplay}*,\n\n"
            . "Kode verifikasi login Anda adalah:\n"
            . "*{$otp}*\n\n"
            . "⏱️ Berlaku selama *{$ttlMinutes} menit*.\n"
            . "⚠️ *RAHASIA:* Jangan berikan kode ini kepada siapa pun, termasuk staf IT/Admin.";

        $sent = TicketNotificationService::sendWhatsApp($cleanDigits, $waMessage);
        if (!$sent) {
            Log::warning('[LoginOTP] Gagal mengirim kode OTP WhatsApp.', [
                'user_id' => $user->id,
                'email'   => $user->email,
            ]);
            return false;
        }

        $nowTs = now()->timestamp;

        $request->session()->put(self::SESSION_KEY, [
            'user_id'             => $user->id,
            'remember'            => $remember,
            'otp_hash'            => $otpHash,
            'issued_at'           => $nowTs,
            'expires_at'          => $nowTs + ($ttlMinutes * 60),
            'resend_available_at' => $nowTs + $cooldownSeconds,
            'attempts'            => 0,
            'max_attempts'        => $maxAttempts,
            'masked_phone'        => self::maskPhone($cleanDigits),
        ]);

        return true;
    }

    /**
     * Compute HMAC-SHA256 digest of the OTP bound to the user ID and app key.
     */
    public static function hashOtp(int $userId, string $otp): string
    {
        $appKey = (string) config('app.key');
        if ($appKey === '') {
            throw new \RuntimeException('APP_KEY must be configured before issuing login OTP codes.');
        }

        return hash_hmac('sha256', "{$userId}|{$otp}", $appKey);
    }

    /**
     * Mask phone number for display on the pre-auth OTP screen (e.g. 0813••••921).
     */
    public static function maskPhone(string $digits): string
    {
        $clean = preg_replace('/[^0-9]/', '', $digits);
        if (str_starts_with($clean, '62')) {
            $clean = '0' . substr($clean, 2);
        } elseif (str_starts_with($clean, '8')) {
            $clean = '0' . $clean;
        }

        $len = strlen($clean);
        if ($len <= 4) {
            return '••••';
        }
        if ($len <= 7) {
            return substr($clean, 0, 2) . '••••' . substr($clean, -2);
        }

        return substr($clean, 0, 4) . '••••' . substr($clean, -3);
    }

    /**
     * Render the WhatsApp OTP verification view.
     */
    public function show(Request $request): Response|RedirectResponse
    {
        $challenge = $request->session()->get(self::SESSION_KEY);
        if (!is_array($challenge) || empty($challenge['user_id']) || empty($challenge['otp_hash'])) {
            return redirect()->route('login');
        }

        $user = User::find((int) $challenge['user_id']);
        if (!$user || !$user->is_active || $user->isRejected() || $user->isPendingApproval()) {
            $request->session()->forget(self::SESSION_KEY);
            return redirect()->route('login')->withErrors([
                'email' => 'Sesi verifikasi login tidak lagi valid. Silakan masuk kembali.',
            ]);
        }

        $maxAttempts = max(1, (int) ($challenge['max_attempts'] ?? 5));
        $attempts = (int) ($challenge['attempts'] ?? 0);

        return Inertia::render('Auth/VerifyOtp', [
            'maskedPhone'       => (string) ($challenge['masked_phone'] ?? '08••••••••'),
            'expiresAt'         => (int) ($challenge['expires_at'] ?? 0),
            'resendAvailableAt' => (int) ($challenge['resend_available_at'] ?? 0),
            'serverNow'         => now()->timestamp,
            'attemptsRemaining' => max(0, $maxAttempts - $attempts),
            'status'            => session('status'),
        ]);
    }

    /**
     * Verify the submitted 6-digit OTP and finalize login.
     *
     * @throws ValidationException
     */
    public function verify(Request $request): RedirectResponse
    {
        $request->validate([
            'otp' => ['required', 'string', 'regex:/^\d{6}$/'],
        ], [
            'otp.required' => 'Masukkan 6 digit kode OTP WhatsApp Anda.',
            'otp.regex'    => 'Kode OTP harus terdiri dari tepat 6 digit angka.',
        ]);

        $challenge = $request->session()->get(self::SESSION_KEY);
        if (!is_array($challenge) || empty($challenge['user_id']) || empty($challenge['otp_hash'])) {
            return redirect()->route('login')->withErrors([
                'email' => 'Sesi verifikasi OTP tidak ditemukan atau telah berakhir. Silakan login kembali.',
            ]);
        }

        $nowTs = now()->timestamp;
        if ($nowTs > (int) ($challenge['expires_at'] ?? 0)) {
            throw ValidationException::withMessages([
                'otp' => 'Kode OTP sudah kedaluwarsa. Silakan klik "Kirim Ulang OTP" atau login kembali.',
            ]);
        }

        $attempts = (int) ($challenge['attempts'] ?? 0);
        $maxAttempts = max(1, (int) ($challenge['max_attempts'] ?? 5));

        if ($attempts >= $maxAttempts) {
            $request->session()->forget(self::SESSION_KEY);
            return redirect()->route('login')->withErrors([
                'email' => 'Terlalu banyak percobaan kode OTP yang salah. Demi keamanan, silakan login ulang.',
            ]);
        }

        $userId = (int) $challenge['user_id'];
        $submittedOtp = (string) $request->input('otp');
        $expectedHash = self::hashOtp($userId, $submittedOtp);

        if (!hash_equals((string) $challenge['otp_hash'], $expectedHash)) {
            $newAttempts = $attempts + 1;

            if ($newAttempts >= $maxAttempts) {
                $request->session()->forget(self::SESSION_KEY);
                return redirect()->route('login')->withErrors([
                    'email' => 'Kode OTP salah melebihi batas percobaan. Demi keamanan, silakan login ulang.',
                ]);
            }

            $challenge['attempts'] = $newAttempts;
            $request->session()->put(self::SESSION_KEY, $challenge);
            $remaining = $maxAttempts - $newAttempts;

            throw ValidationException::withMessages([
                'otp' => "Kode OTP tidak sesuai. Sisa percobaan: {$remaining} kali.",
            ]);
        }

        $user = User::find($userId);
        if (!$user || !$user->is_active || $user->isRejected() || $user->isPendingApproval()) {
            $request->session()->forget(self::SESSION_KEY);
            return redirect()->route('login')->withErrors([
                'email' => 'Akun Anda tidak aktif atau status persetujuannya telah berubah. Silakan hubungi Admin.',
            ]);
        }

        $remember = (bool) ($challenge['remember'] ?? false);
        $request->session()->forget(self::SESSION_KEY);

        Auth::login($user, $remember);
        $request->session()->regenerate();

        return redirect()->intended(route('lean.index', absolute: false));
    }

    /**
     * Re-issue a fresh 6-digit OTP respecting resend cooldown.
     */
    public function resend(Request $request): RedirectResponse
    {
        $challenge = $request->session()->get(self::SESSION_KEY);
        if (!is_array($challenge) || empty($challenge['user_id'])) {
            return redirect()->route('login')->withErrors([
                'email' => 'Sesi verifikasi tidak ditemukan. Silakan login kembali.',
            ]);
        }

        $nowTs = now()->timestamp;
        $resendAvailableAt = (int) ($challenge['resend_available_at'] ?? 0);
        if ($nowTs < $resendAvailableAt) {
            $waitSeconds = $resendAvailableAt - $nowTs;
            return back()->withErrors([
                'otp' => "Mohon tunggu {$waitSeconds} detik sebelum mengirim ulang kode OTP.",
            ]);
        }

        $user = User::find((int) $challenge['user_id']);
        if (!$user || !$user->is_active || $user->isRejected() || $user->isPendingApproval()) {
            $request->session()->forget(self::SESSION_KEY);
            return redirect()->route('login')->withErrors([
                'email' => 'Akun Anda tidak aktif atau tidak valid. Silakan login kembali.',
            ]);
        }

        $sent = self::initiateChallenge($request, $user, (bool) ($challenge['remember'] ?? false));
        if (!$sent) {
            return back()->withErrors([
                'otp' => 'Gagal mengirim ulang kode OTP karena Bot WhatsApp sedang offline atau tidak dapat dijangkau. Silakan hubungi Admin.',
            ]);
        }

        return back()->with('status', 'Kode OTP baru telah dikirim ke WhatsApp Anda.');
    }

    /**
     * Cancel pending OTP challenge and return to login screen.
     */
    public function cancel(Request $request): RedirectResponse
    {
        $request->session()->forget([self::SESSION_KEY, self::BOT_RECOVERY_SESSION_KEY]);

        return redirect()->route('login');
    }

    /**
     * Store a short-lived, session-bound bot recovery authorization for a credential-verified Admin.
     */
    public static function initiateAdminBotRecovery(Request $request, User $user, bool $remember = false): void
    {
        if (!$user->isAdmin()) {
            $request->session()->forget(self::BOT_RECOVERY_SESSION_KEY);
            return;
        }

        $ttlSeconds = max(30, (int) config('telunas.admin_bot_recovery_ttl_seconds', 180));

        $request->session()->put(self::BOT_RECOVERY_SESSION_KEY, [
            'user_id'       => $user->id,
            'remember'      => $remember,
            'expires_at'    => now()->timestamp + $ttlSeconds,
            'last_start_at' => 0,
        ]);
    }

    /**
     * Return safe recovery metadata for the login view if a valid Admin recovery session exists.
     *
     * @return array{expires_at: int}|null
     */
    public static function getValidBotRecoveryMeta(Request $request): ?array
    {
        $recovery = $request->session()->get(self::BOT_RECOVERY_SESSION_KEY);
        if (!is_array($recovery) || empty($recovery['user_id']) || empty($recovery['expires_at'])) {
            return null;
        }

        $nowTs = now()->timestamp;
        if ($nowTs > (int) $recovery['expires_at']) {
            $request->session()->forget(self::BOT_RECOVERY_SESSION_KEY);
            return null;
        }

        $user = User::find((int) $recovery['user_id']);
        if (!$user || !$user->isAdmin() || !$user->is_active || $user->isRejected() || $user->isPendingApproval()) {
            $request->session()->forget(self::BOT_RECOVERY_SESSION_KEY);
            return null;
        }

        return [
            'expires_at' => (int) $recovery['expires_at'],
        ];
    }

    /**
     * Start the WhatsApp bot on behalf of a credential-verified Admin stuck at login because the bot is offline.
     */
    public function startBotForRecovery(Request $request, WhatsAppBotLauncher $launcher): JsonResponse
    {
        $resolved = $this->resolveAuthorizedRecoveryContext($request);
        if ($resolved instanceof JsonResponse) {
            return $resolved;
        }

        /** @var User $user */
        $user = $resolved['user'];
        $recovery = $resolved['recovery'];

        $status = $launcher->inspectStatus();

        if ($status['connected']) {
            return $this->completeBotRecoveryWithOtp($request, $user, (bool) ($recovery['remember'] ?? false));
        }

        if ($status['state'] === 'needs_pairing') {
            return response()->json([
                'status'  => 'needs_pairing',
                'state'   => 'needs_pairing',
                'message' => 'Bot sudah menyala, namun sesi WhatsApp sedang terputus atau belum ter-pair. Pulihkan sesi bot via CLI server (node bot-v2.js) atau ubah LOGIN_OTP_ENABLED=false di .env untuk pemulihan darurat.',
            ]);
        }

        $nowTs = now()->timestamp;
        $cooldown = max(2, (int) config('telunas.bot_recovery_cooldown_seconds', 8));
        $lastStartAt = (int) ($recovery['last_start_at'] ?? 0);

        if ($status['state'] === 'booting' || ($lastStartAt > 0 && ($nowTs - $lastStartAt) < $cooldown)) {
            return response()->json([
                'status'  => 'booting',
                'state'   => 'booting',
                'message' => 'Bot WhatsApp sedang booting dan menghubungkan koneksi WhatsApp...',
            ]);
        }

        try {
            $launchResult = $launcher->start();
            $recovery['last_start_at'] = $nowTs;
            $request->session()->put(self::BOT_RECOVERY_SESSION_KEY, $recovery);

            if ($launchResult['state'] === 'connected') {
                return $this->completeBotRecoveryWithOtp($request, $user, (bool) ($recovery['remember'] ?? false));
            }

            if ($launchResult['state'] === 'needs_pairing') {
                return response()->json([
                    'status'  => 'needs_pairing',
                    'state'   => 'needs_pairing',
                    'message' => 'Bot sudah menyala, namun sesi WhatsApp sedang terputus atau belum ter-pair. Pulihkan sesi bot via CLI server (node bot-v2.js) atau ubah LOGIN_OTP_ENABLED=false di .env untuk pemulihan darurat.',
                ]);
            }

            Log::info('[LoginBotRecovery] Admin triggered WhatsApp bot start prior to OTP.', [
                'user_id' => $user->id,
                'email'   => $user->email,
                'version' => $launchResult['version'],
            ]);

            return response()->json([
                'status'  => 'booting',
                'state'   => 'booting',
                'version' => $launchResult['version'],
                'message' => $launchResult['message'],
            ]);
        } catch (\Throwable $e) {
            Log::error('[LoginBotRecovery] Failed starting WhatsApp bot during Admin login recovery.', [
                'user_id' => $user->id,
                'email'   => $user->email,
                'error'   => $e->getMessage(),
            ]);

            return response()->json([
                'status'  => 'error',
                'state'   => 'offline',
                'message' => 'Gagal menyalakan Bot WhatsApp di server: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Poll bot connection readiness during Admin recovery and automatically dispatch OTP once connected.
     */
    public function botRecoveryStatus(Request $request, WhatsAppBotLauncher $launcher): JsonResponse
    {
        $resolved = $this->resolveAuthorizedRecoveryContext($request);
        if ($resolved instanceof JsonResponse) {
            return $resolved;
        }

        /** @var User $user */
        $user = $resolved['user'];
        $recovery = $resolved['recovery'];

        $status = $launcher->inspectStatus();

        if ($status['connected']) {
            return $this->completeBotRecoveryWithOtp($request, $user, (bool) ($recovery['remember'] ?? false));
        }

        if ($status['state'] === 'needs_pairing') {
            return response()->json([
                'status'  => 'needs_pairing',
                'state'   => 'needs_pairing',
                'message' => 'Bot sudah menyala, namun sesi WhatsApp sedang terputus atau belum ter-pair. Pulihkan sesi bot via CLI server (node bot-v2.js) atau ubah LOGIN_OTP_ENABLED=false di .env untuk pemulihan darurat.',
            ]);
        }

        return response()->json([
            'status'  => $status['state'],
            'state'   => $status['state'],
            'message' => $status['message'],
        ]);
    }

    /**
     * Validate the session-bound Admin recovery authorization and re-check database state.
     *
     * @return array{user: User, recovery: array<string, mixed>}|JsonResponse
     */
    protected function resolveAuthorizedRecoveryContext(Request $request): array|JsonResponse
    {
        $recovery = $request->session()->get(self::BOT_RECOVERY_SESSION_KEY);
        if (!is_array($recovery) || empty($recovery['user_id']) || empty($recovery['expires_at'])) {
            $request->session()->forget(self::BOT_RECOVERY_SESSION_KEY);
            return response()->json([
                'status'  => 'unauthorized',
                'message' => 'Sesi pemulihan bot khusus Admin tidak ditemukan atau sudah berakhir. Silakan masukkan kembali email & password Admin.',
            ], 403);
        }

        if (now()->timestamp > (int) $recovery['expires_at']) {
            $request->session()->forget(self::BOT_RECOVERY_SESSION_KEY);
            return response()->json([
                'status'  => 'expired',
                'message' => 'Waktu sesi pemulihan bot telah habis. Silakan masukkan kembali email & password Admin.',
            ], 403);
        }

        $user = User::find((int) $recovery['user_id']);
        if (!$user || !$user->isAdmin() || !$user->is_active || $user->isRejected() || $user->isPendingApproval()) {
            $request->session()->forget(self::BOT_RECOVERY_SESSION_KEY);
            return response()->json([
                'status'  => 'unauthorized',
                'message' => 'Hanya akun Administrator aktif yang diizinkan menggunakan fitur pemulihan bot.',
            ], 403);
        }

        return [
            'user'     => $user,
            'recovery' => $recovery,
        ];
    }

    /**
     * Dispatch the login OTP once the bot becomes connected and clear the recovery session.
     */
    protected function completeBotRecoveryWithOtp(Request $request, User $user, bool $remember): JsonResponse
    {
        $existingChallenge = $request->session()->get(self::SESSION_KEY);
        $nowTs = now()->timestamp;

        if (
            is_array($existingChallenge)
            && (int) ($existingChallenge['user_id'] ?? 0) === $user->id
            && ($nowTs - (int) ($existingChallenge['issued_at'] ?? 0)) <= 15
        ) {
            $request->session()->forget(self::BOT_RECOVERY_SESSION_KEY);

            return response()->json([
                'status'   => 'otp_sent',
                'state'    => 'connected',
                'redirect' => route('login.otp', absolute: false),
                'message'  => 'Bot WhatsApp sudah aktif dan kode OTP sudah dikirim. Mengalihkan ke halaman verifikasi...',
            ]);
        }

        $sent = self::initiateChallenge($request, $user, $remember);
        if (!$sent) {
            return response()->json([
                'status'  => 'error',
                'state'   => 'booting',
                'message' => 'Bot terhubung, tetapi pengiriman kode OTP ke WhatsApp belum berhasil. Silakan coba sesaat lagi.',
            ], 503);
        }

        $request->session()->forget(self::BOT_RECOVERY_SESSION_KEY);

        Log::info('[LoginBotRecovery] Bot connected and Admin OTP dispatched automatically.', [
            'user_id' => $user->id,
            'email'   => $user->email,
        ]);

        return response()->json([
            'status'   => 'otp_sent',
            'state'    => 'connected',
            'redirect' => route('login.otp', absolute: false),
            'message'  => 'Bot WhatsApp berhasil diaktifkan dan kode OTP telah dikirim ke WhatsApp Anda.',
        ]);
    }
}

