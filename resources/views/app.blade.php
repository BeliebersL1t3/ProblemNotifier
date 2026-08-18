<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <title inertia>{{ config('app.name', 'Laravel') }}</title>

        <!-- Fonts -->
        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=figtree:400,500,600&display=swap" rel="stylesheet" />

        <!-- Mobile & Web App Meta Tags -->
        <meta name="theme-color" content="#E3D1AA">
        <meta name="mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
        <meta name="apple-mobile-web-app-title" content="Telunas Fix">
        <link rel="apple-touch-icon" href="/logo.png">
        <link rel="manifest" href="/site.webmanifest">

        <!-- Scripts -->
        @routes
        @php
            $isLocalhost = in_array(request()->getHost(), ['localhost', '127.0.0.1']);
            $hotPath = public_path('hot');
            $hotBakPath = public_path('hot.bak');
            $hotExists = file_exists($hotPath);

            if (!$isLocalhost && $hotExists) {
                @rename($hotPath, $hotBakPath);
            }
        @endphp

        @viteReactRefresh
        @vite(['resources/js/app.jsx', "resources/js/Pages/{$page['component']}.jsx"])

        @php
            if (!$isLocalhost && file_exists($hotBakPath)) {
                @rename($hotBakPath, $hotPath);
            }
        @endphp
        @inertiaHead
    </head>
    <body class="font-sans antialiased">
        @inertia
    </body>
</html>
