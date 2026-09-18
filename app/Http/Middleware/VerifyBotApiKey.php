<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerifyBotApiKey
{
    /**
     * Handle an incoming request for Bot-only endpoints.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $configuredKey = config('services.bot.api_key');
        $providedKey = $request->header('X-Bot-Key') ?: $request->bearerToken();

        if (!empty($configuredKey) && !empty($providedKey) && hash_equals((string) $configuredKey, (string) $providedKey)) {
            return $next($request);
        }

        return response()->json([
            'success' => false,
            'message' => 'Unauthorized: Invalid or missing bot API key.',
        ], 401);
    }
}
