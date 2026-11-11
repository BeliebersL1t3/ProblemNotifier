<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Trusted proxies are configured dynamically via config/trustedproxy.php (TRUSTED_PROXIES env).
        // Keeping TRUSTED_PROXIES empty prevents X-Forwarded-For IP spoofing when exposed directly on a VPS.

        $middleware->web(
            append: [
                \App\Http\Middleware\RestrictToTelunasNetwork::class,
                \App\Http\Middleware\HandleInertiaRequests::class,
                \Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets::class,
                \App\Http\Middleware\SecurityHeaders::class,
            ],
            replace: [
                \Illuminate\Foundation\Http\Middleware\PreventRequestForgery::class => \App\Http\Middleware\VerifyCsrfToken::class,
            ]
        );

        $middleware->validateCsrfTokens(except: [
            'api/staff-directory',
            'api/reset-whatsapp-password',
        ]);

        $middleware->alias([
            'bot.key'     => \App\Http\Middleware\VerifyBotApiKey::class,
            'bot.or.auth' => \App\Http\Middleware\VerifyBotOrAuth::class,
        ]);

        $middleware->priority([
            \Illuminate\Cookie\Middleware\EncryptCookies::class,
            \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
            \Illuminate\Session\Middleware\StartSession::class,
            \Illuminate\View\Middleware\ShareErrorsFromSession::class,
            \Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
            \App\Http\Middleware\RestrictToTelunasNetwork::class,
            \Illuminate\Routing\Middleware\SubstituteBindings::class,
            \Illuminate\Auth\Middleware\Authenticate::class,
            \App\Http\Middleware\HandleInertiaRequests::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request, \Throwable $e) => ($request->expectsJson() && !$request->header('X-Inertia')) || $request->is('api/*'),
        );
    })->create();
