<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Services\TicketNotificationService;
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
    public function create(): Response
    {
        return Inertia::render('Auth/Login', [
            'canResetPassword' => Route::has('password.request'),
            'canRegister'      => filter_var(config('telunas.registration_enabled', false), FILTER_VALIDATE_BOOLEAN),
            'status'           => session('status'),
        ]);
    }

    /**
     * Handle an incoming authentication request.
     *
     * @throws ValidationException
     */
    public function store(LoginRequest $request): RedirectResponse
    {
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
                    'email' => 'Akun Anda belum memiliki nomor WhatsApp terdaftar untuk verifikasi OTP login. Silakan hubungi Administrator.',
                ]);
            }

            // Transitional phase: accounts without WhatsApp can still sign in with Email + Password
            Auth::login($user, $remember);
            $request->session()->regenerate();

            return redirect()->intended(route('lean.index', absolute: false));
        }

        if (!TicketNotificationService::isValidIndonesianMobile($cleanDigits)) {
            throw ValidationException::withMessages([
                'email' => 'Format nomor WhatsApp yang terdaftar pada akun Anda tidak valid. Silakan hubungi Administrator untuk memperbaikinya.',
            ]);
        }

        $request->session()->regenerate();

        $sent = LoginOtpController::initiateChallenge($request, $user, $remember);
        if (!$sent) {
            $request->session()->forget(LoginOtpController::SESSION_KEY);

            throw ValidationException::withMessages([
                'email' => 'Gagal mengirim kode OTP ke WhatsApp (Bot WhatsApp sedang offline atau tidak dapat dijangkau). Silakan hubungi Administrator.',
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
