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

    /*
    |--------------------------------------------------------------------------
    | Leader Wi-Fi Bypass Passcode & Validity
    |--------------------------------------------------------------------------
    | Allows authorized personnel (leaders/supervisors) outside the resort Wi-Fi
    | to enter a master passcode on the restriction page to gain access.
    */
    'bypass_passcode' => env('TELUNAS_WIFI_BYPASS_PASSCODE', 'TelunasLeader2026!'),

    'bypass_hours' => (int) env('TELUNAS_WIFI_BYPASS_HOURS', 24),

    /*
    |--------------------------------------------------------------------------
    | Google Sheets Webhook Integration
    |--------------------------------------------------------------------------
    | Webhook endpoints deployed via Google Apps Script for live data synchronization.
    | - issues_webhook_url: Webhook for Telunas Issues Log (Issues + AI Audit)
    | - locations_webhook_url: Webhook for Issue Locations (Resort Hotspots)
    */
    'google_sheets' => [
        'issues_webhook_url' => env('GOOGLE_SHEET_ISSUES_WEBHOOK_URL', ''),
        'locations_webhook_url' => env('GOOGLE_SHEET_LOCATIONS_WEBHOOK_URL', ''),
    ],

];
