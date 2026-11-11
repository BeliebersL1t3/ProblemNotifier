<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\TicketNotificationService;
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
        $request->session()->forget(self::SESSION_KEY);

        return redirect()->route('login');
    }
}

