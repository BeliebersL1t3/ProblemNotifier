<?php

namespace App\Http\Controllers;

use App\Http\Middleware\RestrictToTelunasNetwork;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class TelunasWifiBypassController extends Controller
{
    /**
     * Show the Telunas Wi-Fi restriction screen with leader bypass option.
     */
    public function show(Request $request): Response|RedirectResponse
    {
        // If client is already authorized or restriction is disabled, go to home
        $middleware = app(RestrictToTelunasNetwork::class);
        if ($middleware->isAllowed($request)) {
            return redirect('/');
        }

        $clientIp = $request->ip();
        $allowedIps = $middleware->getAllowedIps();
        $displayAllowedHint = !empty($allowedIps) ? implode(', ', array_slice($allowedIps, 0, 2)) : null;

        return response()->view('errors.telunas-wifi-required', [
            'clientIp'    => $clientIp,
            'allowedHint' => $displayAllowedHint,
        ], 403);
    }

    /**
     * Verify the submitted leader bypass passcode and grant 24-hour access.
     */
    public function verify(Request $request): RedirectResponse
    {
        $request->validate([
            'passcode' => 'required|string',
        ]);

        $configuredPasscode = (string) config('telunas.bypass_passcode', '');
        $submittedPasscode = (string) $request->input('passcode');

        if (empty($configuredPasscode) || !hash_equals($configuredPasscode, $submittedPasscode)) {
            return back()
                ->withErrors(['passcode' => 'Passcode izin akses luar tidak valid. Silakan periksa kembali.'])
                ->withInput();
        }

        $hours = (int) config('telunas.bypass_hours', 24);
        $expiryTimestamp = now()->addHours($hours)->timestamp;
        $signature = hash_hmac('sha256', (string) $expiryTimestamp, (string) config('app.key'));
        $token = $expiryTimestamp . '|' . $signature;

        $request->session()->put('telunas_wifi_bypass_until', $expiryTimestamp);
        $request->session()->put('telunas_wifi_bypass_signature', $token);

        $cookie = cookie('telunas_bypass_token', $token, $hours * 60, null, null, false, true);

        return redirect('/')
            ->withCookie($cookie)
            ->with('status', "Izin akses luar Wi-Fi berhasil diaktifkan untuk {$hours} jam ke depan.");
    }
}
