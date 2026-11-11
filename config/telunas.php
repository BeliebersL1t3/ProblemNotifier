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

    'restrict_wifi' => env('RESTRICT_TELUNAS_WIFI', false),

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
    'bypass_passcode' => env('TELUNAS_WIFI_BYPASS_PASSCODE', ''),

    'bypass_hours' => (int) env('TELUNAS_WIFI_BYPASS_HOURS', 24),

    /*
    |--------------------------------------------------------------------------
    | Cloud Authentication, WhatsApp OTP & Self-Registration Controls
    |--------------------------------------------------------------------------
    */
    'login_otp_enabled' => env('LOGIN_OTP_ENABLED', true),

    'login_otp_require_whatsapp' => env('LOGIN_OTP_REQUIRE_WHATSAPP', false),

    'login_otp_ttl_minutes' => (int) env('LOGIN_OTP_TTL_MINUTES', 5),

    'login_otp_max_attempts' => (int) env('LOGIN_OTP_MAX_ATTEMPTS', 5),

    'login_otp_resend_cooldown_seconds' => (int) env('LOGIN_OTP_RESEND_COOLDOWN_SECONDS', 60),

    'admin_bot_recovery_ttl_seconds' => (int) env('ADMIN_BOT_RECOVERY_TTL_SECONDS', 180),

    'bot_recovery_cooldown_seconds' => (int) env('BOT_RECOVERY_COOLDOWN_SECONDS', 8),

    'registration_enabled' => env('REGISTRATION_ENABLED', false),

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
