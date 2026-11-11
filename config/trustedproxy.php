<?php

$raw = env('TRUSTED_PROXIES');
$proxies = null;

if (is_string($raw)) {
    $trimmed = trim($raw);
    if ($trimmed === '*' || $trimmed === '**') {
        $proxies = '*';
    } elseif ($trimmed !== '') {
        $proxies = array_values(array_filter(array_map('trim', explode(',', $trimmed))));
    }
} elseif (is_array($raw)) {
    $proxies = array_values(array_filter(array_map('trim', $raw)));
}

return [
    /*
    |--------------------------------------------------------------------------
    | Trusted Proxy IPs / CIDRs
    |--------------------------------------------------------------------------
    | Controlled via TRUSTED_PROXIES in .env. Keep null on direct VPS/Nginx
    | setups to prevent X-Forwarded-For spoofing, or set '*' / specific CIDR
    | ranges when hosted behind Cloudflare or a managed PaaS load balancer.
    */
    'proxies' => $proxies ?: null,
];

