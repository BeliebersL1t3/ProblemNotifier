<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerifyBotOrAuth
{
    /**
     * Handle incoming requests accessible by either logged-in web users OR authenticated bot.
     */
    public function handle(Request $request, Closure $next): Response
    {
        // 1. Authenticated web user session
        if (auth()->check()) {
            return $next($request);
        }

        // 2. Valid bot API key
        $configuredKey = config('services.bot.api_key');
        $providedKey = $request->header('X-Bot-Key') ?: $request->bearerToken();

        if (!empty($configuredKey) && !empty($providedKey) && hash_equals((string) $configuredKey, (string) $providedKey)) {
            return $next($request);
        }

        return response()->json([
            'success' => false,
            'message' => 'Unauthenticated. Please log in or provide a valid bot API key.',
        ], 401);
    }
}
