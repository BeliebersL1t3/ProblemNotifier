<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Telunas Wi-Fi Network Access Restriction
    |--------------------------------------------------------------------------
    |
    | When enabled, access to the application via public tunnels (such as ngrok)
    | is restricted to devices connected to the Telunas Wi-Fi network.
    |
    | - restrict_wifi: Enable or disable Wi-Fi checking (true/false)
    | - allowed_ips: Comma-separated list or array of allowed public IPs / CIDRs.
    |                Use 'auto' to automatically match the server's public WAN IP.
    |
    */

    'restrict_wifi' => env('RESTRICT_TELUNAS_WIFI', true),

    'allowed_ips' => env('TELUNAS_WIFI_IPS', 'auto'),

    /*
    |--------------------------------------------------------------------------
    | Auto IP Cache Duration (in seconds)
    |--------------------------------------------------------------------------
    | How long to cache the auto-detected server public IP before refreshing.
    | Default is 1800 seconds (30 minutes).
    */
    'auto_ip_cache_seconds' => (int) env('TELUNAS_AUTO_IP_CACHE_SECONDS', 1800),

];
