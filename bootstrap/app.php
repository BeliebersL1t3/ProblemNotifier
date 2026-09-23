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
        $middleware->web(
            append: [
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
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );
    })->create();
