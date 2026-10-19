<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\IpUtils;
use Symfony\Component\HttpFoundation\Response;

class RestrictToTelunasNetwork
{
    /**
     * Standard RFC 1918 and local link/loopback private ranges.
     *
     * @var array<int, string>
     */
    protected const PRIVATE_RANGES = [
        '127.0.0.0/8',
        '10.0.0.0/8',
        '172.16.0.0/12',
        '192.168.0.0/16',
        '169.254.0.0/16',
        '::1',
        'fc00::/7',
        'fe80::/10',
    ];

    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        // 1. Always allow bypass verification and restriction routes
        if ($request->is('telunas-wifi-required') || $request->is('telunas-wifi-bypass')) {
            return $next($request);
        }

        // 2. If client meets any authorization criteria, allow traffic
        if ($this->isAllowed($request)) {
            return $next($request);
        }

        $clientIp = $request->ip();

        // 3. Access denied: Handle API / JSON requests
        if ($request->expectsJson() || $request->is('api/*')) {
            return response()->json([
                'error'       => 'Akses Ditolak',
                'message'     => 'Akses dibatasi. Anda harus terhubung ke jaringan Wi-Fi Telunas.',
                'detected_ip' => $clientIp,
            ], 403);
        }

        // 4. Access denied: For Inertia SPA navigations, force a full top-level browser redirect
        // to prevent Inertia from rendering the error inside a dismissable modal dialog.
        if ($request->header('X-Inertia')) {
            return response('', 409)->header('X-Inertia-Location', url('/telunas-wifi-required'));
        }

        // 5. Access denied: Standard browser request
        $allowedIps = $this->resolveAllowedIps();
        $displayAllowedHint = !empty($allowedIps) ? implode(', ', array_slice($allowedIps, 0, 2)) : null;

        return response()->view('errors.telunas-wifi-required', [
            'clientIp'    => $clientIp,
            'allowedHint' => $displayAllowedHint,
        ], 403);
    }

    /**
     * Determine if the incoming request is permitted to access the application.
     */
    public function isAllowed(Request $request): bool
    {
        // If restriction is disabled in config/env, allow all traffic
        if (!config('telunas.restrict_wifi', true)) {
            return true;
        }

        // Allow application health check
        if ($request->is('up')) {
            return true;
        }

        // Allow requests with valid WhatsApp Bot API Key
        $botApiKey = (string) config('services.bot.api_key');
        $requestApiKey = (string) $request->header('X-Bot-Api-Key');
        if (!empty($botApiKey) && !empty($requestApiKey) && hash_equals($botApiKey, $requestApiKey)) {
            return true;
        }

        // Check if device holds an authorized leader bypass session or cookie
        if ($this->hasValidBypassSession($request)) {
            return true;
        }

        $clientIp = $request->ip();

        // Always allow local loopback and private LAN addresses
        if ($this->isLocalOrPrivateIp($clientIp)) {
            return true;
        }

        // Check if client IP matches allowed public IPs / CIDRs
        $allowedIps = $this->resolveAllowedIps();
        if (!empty($allowedIps) && IpUtils::checkIp($clientIp, $allowedIps)) {
            return true;
        }

        return false;
    }

    /**
     * Check if request has a valid, non-expired leader bypass session or cookie.
     */
    public function hasValidBypassSession(Request $request): bool
    {
        $appKey = (string) config('app.key');
        if (empty($appKey)) {
            return false;
        }

        // 1. Check Laravel Session
        if ($request->hasSession()) {
            $sessionUntil = $request->session()->get('telunas_wifi_bypass_until');
            $sessionSignature = $request->session()->get('telunas_wifi_bypass_signature');

            if ($sessionUntil && $sessionSignature && (int) $sessionUntil > time()) {
                $expectedSignature = $sessionUntil . '|' . hash_hmac('sha256', (string) $sessionUntil, $appKey);
                if (hash_equals($expectedSignature, (string) $sessionSignature)) {
                    return true;
                }
            }
        }

        // 2. Check Encrypted Cookie
        $cookieToken = $request->cookie('telunas_bypass_token');
        if (!empty($cookieToken) && is_string($cookieToken) && str_contains($cookieToken, '|')) {
            [$cookieUntil, $cookieHmac] = explode('|', $cookieToken, 2);
            if ((int) $cookieUntil > time()) {
                $expectedHmac = hash_hmac('sha256', (string) $cookieUntil, $appKey);
                if (hash_equals($expectedHmac, (string) $cookieHmac)) {
                    // Re-populate session if available
                    if ($request->hasSession()) {
                        $request->session()->put('telunas_wifi_bypass_until', (int) $cookieUntil);
                        $request->session()->put('telunas_wifi_bypass_signature', $cookieToken);
                    }
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Public accessor to resolve allowed IPs.
     *
     * @return array<int, string>
     */
    public function getAllowedIps(): array
    {
        return $this->resolveAllowedIps();
    }

    /**
     * Determine if an IP is a local loopback or private network address.
     */
    protected function isLocalOrPrivateIp(?string $ip): bool
    {
        if (empty($ip)) {
            return false;
        }

        return IpUtils::checkIp($ip, self::PRIVATE_RANGES);
    }

    /**
     * Resolve the allowed IP addresses from config and auto-detection.
     *
     * @return array<int, string>
     */
    protected function resolveAllowedIps(): array
    {
        $rawConfig = config('telunas.allowed_ips', 'auto');
        $items = is_array($rawConfig) ? $rawConfig : array_map('trim', explode(',', (string) $rawConfig));

        $allowed = [];
        $needsAuto = false;

        foreach ($items as $item) {
            $item = trim($item);
            if (empty($item)) {
                continue;
            }
            if (strtolower($item) === 'auto') {
                $needsAuto = true;
            } else {
                $allowed[] = $item;
            }
        }

        // If list is empty or explicitly includes 'auto', auto-detect server public WAN IP
        if ($needsAuto || empty($allowed)) {
            $serverPublicIp = $this->getServerPublicIp();
            if ($serverPublicIp && !in_array($serverPublicIp, $allowed, true)) {
                $allowed[] = $serverPublicIp;
            }
        }

        return array_values(array_filter($allowed));
    }

    /**
     * Get and cache the server's public WAN IP.
     */
    public function getServerPublicIp(): ?string
    {
        $cacheSeconds = (int) config('telunas.auto_ip_cache_seconds', 1800);

        return Cache::remember('telunas_server_public_ip', $cacheSeconds, function () {
            $endpoints = [
                'https://api.ipify.org',
                'https://checkip.amazonaws.com',
                'https://icanhazip.com',
            ];

            foreach ($endpoints as $url) {
                try {
                    $response = Http::timeout(3)->get($url);
                    if ($response->successful()) {
                        $ip = trim($response->body());
                        if (filter_var($ip, FILTER_VALIDATE_IP)) {
                            return $ip;
                        }
                    }
                } catch (\Throwable $e) {
                    // Try next endpoint
                }
            }

            Log::warning('[RestrictToTelunasNetwork] Could not auto-detect server public WAN IP from external providers.');
            return null;
        });
    }
}
