<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'google' => [
        'credentials_path'    => env('GOOGLE_CREDENTIALS_PATH', 'app/google-credentials.json'),
        'spreadsheet_id'          => env('GOOGLE_SPREADSHEET_ID'),
        'ops_spreadsheet_id'      => env('GOOGLE_OPS_SPREADSHEET_ID'),
        'tickets_spreadsheet_id'  => env('GOOGLE_TICKETS_SPREADSHEET_ID', '1uMJNUgTPw-WuA_colsbIzSeVegO9QivjOZ_nAPZ1HWo'),
        'drive_folder_id'         => env('GOOGLE_DRIVE_FOLDER_ID'),
        'calendar_id'             => env('GOOGLE_CALENDAR_ID'),
    ],

    'imgbb' => [
        'key' => env('IMGBB_API_KEY'),
    ],

];
