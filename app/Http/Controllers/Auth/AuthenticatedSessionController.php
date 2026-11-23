<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\User;
use App\Services\TicketNotificationService;
use App\Services\WhatsAppBotLauncher;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class AuthenticatedSessionController extends Controller
{
    /**
     * Strict double-gate check: debug account switcher is ONLY allowed in local + APP_DEBUG=true.
     */
    private function isDevDebugAuthEnabled(): bool
    {
        return app()->environment('local') && (bool) config('app.debug');
    }

    /**
     * Build safe debug account list (never exposes password hashes or real private passwords).
     */
    private function getDevDebugAccounts(): array
    {
        if (!$this->isDevDebugAuthEnabled()) {
            return [];
        }

        $versionKey = 'dev_debug_login_accounts:' . md5(
            (string) User::max('updated_at') . ':' . (string) User::count()
        );

        return Cache::remember($versionKey, now()->addMinutes(5), function () {
            $knownSeededPasswords = ['telunas123', 'password'];

            return User::query()
                ->orderByRaw("CASE WHEN role = 'admin' THEN 0 ELSE 1 END")
                ->orderBy('department')
                ->orderBy('name')
                ->get([
                    'id',
                    'name',
                    'staff_name',
                    'email',
                    'password',
                    'role',
                    'department',
                    'subdivision',
                    'is_hod',
                    'hod_title',
                    'is_active',
                    'approval_status',
                ])
                ->map(function (User $user) use ($knownSeededPasswords) {
                    $matchedDefaultPassword = null;
                    if (!empty($user->password)) {
                        foreach ($knownSeededPasswords as $candidate) {
                            if (Hash::check($candidate, $user->password)) {
                                $matchedDefaultPassword = $candidate;
                                break;
                            }
                        }
                    }

                    return [
                        'id'              => $user->id,
                        'name'            => $user->staff_name ?: $user->name,
                        'email'           => $user->email,
                        'role'            => $user->role,
                        'department'      => $user->department,
                        'subdivision'     => $user->subdivision,
                        'is_hod'          => (bool) $user->is_hod,
                        'hod_title'       => $user->hod_title,
                        'is_active'       => (bool) $user->is_active,
                        'approval_status' => $user->approval_status,
                        'dev_password'    => $matchedDefaultPassword,
                    ];
                })
                ->values()
                ->all();
        });
    }

    /**
     * Display the login view.
     */
    public function create(Request $request): Response
    {
        $devDebugEnabled = $this->isDevDebugAuthEnabled();

        return Inertia::render('Auth/Login', [
            'canResetPassword'     => Route::has('password.request'),
            'canRegister'          => filter_var(config('telunas.registration_enabled', false), FILTER_VALIDATE_BOOLEAN),
            'status'               => session('status'),
            'canRecoverBot'        => false,
            'botRecoveryState'     => null,
            'botRecoveryExpiresAt' => 0,
            'serverNow'            => now()->timestamp,
            'devDebugAuthEnabled'  => $devDebugEnabled,
            'devDebugAccounts'     => $devDebugEnabled ? $this->getDevDebugAccounts() : [],
            'isAdminPortal'        => false,
            'loginPostUrl'         => route('login'),
        ]);
    }

    /**
     * Display the Admin & Server Recovery login view.
     */
    public function createAdmin(Request $request): Response
    {
        $recoveryMeta = LoginOtpController::getValidBotRecoveryMeta($request);
        $botRecoveryState = $recoveryMeta !== null
            ? app(WhatsAppBotLauncher::class)->inspectStatus()['state']
            : null;

        $devDebugEnabled = $this->isDevDebugAuthEnabled();

        return Inertia::render('Auth/Login', [
            'canResetPassword'     => false,
            'canRegister'          => false,
            'status'               => session('status'),
            'canRecoverBot'        => $recoveryMeta !== null,
            'botRecoveryState'     => $botRecoveryState,
            'botRecoveryExpiresAt' => $recoveryMeta['expires_at'] ?? 0,
            'serverNow'            => now()->timestamp,
            'devDebugAuthEnabled'  => $devDebugEnabled,
            'devDebugAccounts'     => $devDebugEnabled ? $this->getDevDebugAccounts() : [],
            'isAdminPortal'        => true,
            'loginPostUrl'         => route('admin.login.store'),
        ]);
    }

    /**
     * Handle an incoming authentication request.
     *
     * @throws ValidationException
     */
    public function store(LoginRequest $request): RedirectResponse
    {
        $request->session()->forget(LoginOtpController::BOT_RECOVERY_SESSION_KEY);
        $request->session()->put('login_portal', 'user');

        $user = $request->validateCredentialsWithoutLogin();
        $remember = $request->boolean('remember');

        // Security Zero-Knowledge Gate: Admin accounts cannot log in through the regular user portal.
        // Returning standard credential failure prevents user enumeration and forces admins to the secret portal.
        if ($user->isAdmin()) {
            throw ValidationException::withMessages([
                'email' => trans('auth.failed'),
            ]);
        }

        $otpEnabled = filter_var(config('telunas.login_otp_enabled', true), FILTER_VALIDATE_BOOLEAN);
        if (!$otpEnabled) {
            Auth::login($user, $remember);
            $request->session()->regenerate();

            return redirect()->intended(route('lean.index', absolute: false));
        }

        $cleanDigits = preg_replace('/[^0-9]/', '', (string) ($user->whatsapp_number ?? ''));
        $requireWhatsapp = filter_var(config('telunas.login_otp_require_whatsapp', false), FILTER_VALIDATE_BOOLEAN);

        if ($cleanDigits === '') {
            if ($requireWhatsapp) {
                throw ValidationException::withMessages([
                    'email' => __('telunas.otp_whatsapp_missing'),
                ]);
            }

            // Transitional phase: accounts without WhatsApp can still sign in with Email + Password
            Auth::login($user, $remember);
            $request->session()->regenerate();

            return redirect()->intended(route('lean.index', absolute: false));
        }

        if (!TicketNotificationService::isValidIndonesianMobile($cleanDigits)) {
            throw ValidationException::withMessages([
                'email' => __('telunas.otp_whatsapp_invalid'),
            ]);
        }

        $request->session()->regenerate();

        $sent = LoginOtpController::initiateChallenge($request, $user, $remember);
        if (!$sent) {
            $request->session()->forget(LoginOtpController::SESSION_KEY);

            // On regular login, do NOT initiate admin bot recovery. The regular page stays 100% clean.
            throw ValidationException::withMessages([
                'email' => __('telunas.otp_send_failed_user'),
            ]);
        }

        return redirect()->route('login.otp');
    }

    /**
     * Handle an incoming Admin authentication request.
     *
     * @throws ValidationException
     */
    public function storeAdmin(LoginRequest $request): RedirectResponse
    {
        $request->session()->forget(LoginOtpController::BOT_RECOVERY_SESSION_KEY);
        $request->session()->put('login_portal', 'admin');

        $user = $request->validateCredentialsWithoutLogin();
        $remember = $request->boolean('remember');

        // Security Role Gate: Strictly reject non-admin users from admin portal
        if (!$user->isAdmin()) {
            throw ValidationException::withMessages([
                'email' => 'Akses ditolak. Halaman login ini khusus untuk akun Administrator.',
            ]);
        }

        $otpEnabled = filter_var(config('telunas.login_otp_enabled', true), FILTER_VALIDATE_BOOLEAN);
        if (!$otpEnabled) {
            Auth::login($user, $remember);
            $request->session()->regenerate();

            return redirect()->intended(route('lean.index', absolute: false));
        }

        $cleanDigits = preg_replace('/[^0-9]/', '', (string) ($user->whatsapp_number ?? ''));

        if ($cleanDigits === '') {
            throw ValidationException::withMessages([
                'email' => 'Akun Administrator wajib memiliki nomor WhatsApp terdaftar untuk verifikasi OTP login. Silakan hubungi tim IT.',
            ]);
        }

        if (!TicketNotificationService::isValidIndonesianMobile($cleanDigits)) {
            throw ValidationException::withMessages([
                'email' => __('telunas.otp_whatsapp_invalid'),
            ]);
        }

        $request->session()->regenerate();

        $sent = LoginOtpController::initiateChallenge($request, $user, $remember);
        if (!$sent) {
            $request->session()->forget(LoginOtpController::SESSION_KEY);

            LoginOtpController::initiateAdminBotRecovery($request, $user, $remember);
            $botState = app(WhatsAppBotLauncher::class)->inspectStatus()['state'];

            $errorMessage = ($botState === 'needs_pairing')
                ? __('telunas.otp_needs_pairing_admin_hint')
                : __('telunas.otp_send_failed_admin_hint');

            throw ValidationException::withMessages([
                'email' => $errorMessage,
            ]);
        }

        return redirect()->route('login.otp');
    }

    /**
     * Local-only 1-click debug login for testing any account without WhatsApp OTP blocker.
     * Strictly disabled (404) outside APP_ENV=local + APP_DEBUG=true.
     */
    public function devQuickLogin(Request $request): RedirectResponse
    {
        abort_unless($this->isDevDebugAuthEnabled(), 404);

        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $user = User::findOrFail($validated['user_id']);

        if (!$user->is_active) {
            throw ValidationException::withMessages([
                'email' => "Akun {$user->email} sedang nonaktif (is_active = false).",
            ]);
        }

        $request->session()->forget(LoginOtpController::BOT_RECOVERY_SESSION_KEY);
        $request->session()->forget(LoginOtpController::SESSION_KEY);

        Auth::login($user, true);
        $request->session()->regenerate();

        Log::info('[DEV_QUICK_LOGIN] Signed in via local debug panel', [
            'user_id'    => $user->id,
            'email'      => $user->email,
            'role'       => $user->role,
            'department' => $user->department,
        ]);

        return redirect()->intended(route('lean.index', absolute: false));
    }

    /**
     * Destroy an authenticated session.
     */
    public function destroy(Request $request): RedirectResponse
    {
        $recallerName = Auth::guard('web')->getRecallerName();
        $sessionCookie = config('session.cookie');

        Auth::guard('web')->logout();

        $request->session()->invalidate();

        $request->session()->regenerateToken();

        return redirect()->route('login')->withCookies([
            cookie()->forget($recallerName),
            cookie()->forget($sessionCookie),
        ]);
    }
}
