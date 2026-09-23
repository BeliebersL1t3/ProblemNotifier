<?php

namespace App\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;

class VerifyCsrfToken extends PreventRequestForgery
{
    /**
     * Determine if the request has a URI that should pass through CSRF verification.
     *
     * Requests authenticated with a valid bot API key (X-Bot-Key or Bearer token)
     * are granted CSRF exemption, whereas cookie-authenticated web sessions
     * are strictly required to validate CSRF tokens.
     */
    protected function inExceptArray($request)
    {
        $configuredKey = config('services.bot.api_key');
        $providedKey = $request->header('X-Bot-Key') ?: $request->bearerToken();

        if (!empty($configuredKey) && !empty($providedKey) && hash_equals((string) $configuredKey, (string) $providedKey)) {
            return true;
        }

        return parent::inExceptArray($request);
    }
}
