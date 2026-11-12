<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Services\TicketNotificationService;
use App\Services\WhatsAppBotLauncher;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class AuthenticatedSessionController extends Controller
{
    /**
     * Display the login view.
     */
    public function create(Request $request): Response
    {
        $recoveryMeta = LoginOtpController::getValidBotRecoveryMeta($request);
        $botRecoveryState = $recoveryMeta !== null
            ? app(WhatsAppBotLauncher::class)->inspectStatus()['state']
            : null;

        return Inertia::render('Auth/Login', [
            'canResetPassword'     => Route::has('password.request'),
            'canRegister'          => filter_var(config('telunas.registration_enabled', false), FILTER_VALIDATE_BOOLEAN),
            'status'               => session('status'),
            'canRecoverBot'        => $recoveryMeta !== null,
            'botRecoveryState'     => $botRecoveryState,
            'botRecoveryExpiresAt' => $recoveryMeta['expires_at'] ?? 0,
            'serverNow'            => now()->timestamp,
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

        $user = $request->validateCredentialsWithoutLogin();
        $remember = $request->boolean('remember');

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

            if ($user->isAdmin()) {
                LoginOtpController::initiateAdminBotRecovery($request, $user, $remember);
                $botState = app(WhatsAppBotLauncher::class)->inspectStatus()['state'];

                $errorMessage = ($botState === 'needs_pairing')
                    ? __('telunas.otp_needs_pairing_admin_hint')
                    : __('telunas.otp_send_failed_admin_hint');

                throw ValidationException::withMessages([
                    'email' => $errorMessage,
                ]);
            }

            throw ValidationException::withMessages([
                'email' => __('telunas.otp_send_failed_user'),
            ]);
        }

        return redirect()->route('login.otp');
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
