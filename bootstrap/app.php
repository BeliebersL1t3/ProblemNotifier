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
        $middleware->web(append: [
            \App\Http\Middleware\HandleInertiaRequests::class,
            \Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets::class,
            \App\Http\Middleware\SecurityHeaders::class,
        ]);

        $middleware->validateCsrfTokens(except: [
            'api/staff-directory',
            'api/reset-whatsapp-password',
            'api/issues',
            'api/issues/*',
            'api/sheets',
            'api/sheets/*',
            'api/categories',
            'api/categories/*',
            'api/operations',
            'api/operations/*',
            'api/users',
            'api/users/*',
            'api/user-audit-logs',
            'notifications/*',
            'notifications/read-all',
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
