<?php

namespace App\Http\Middleware;

use Carbon\Carbon;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

class SetAppLocale
{
    public const ALLOWED_LOCALES = ['id', 'en'];
    public const DEFAULT_LOCALE = 'id';

    public function handle(Request $request, Closure $next): Response
    {
        $locale = $this->resolveLocale($request);

        App::setLocale($locale);
        Carbon::setLocale($locale);

        return $next($request);
    }

    public function resolveLocale(Request $request): string
    {
        $headerLocale = strtolower(trim((string) $request->header('X-Telunas-Locale', '')));
        if (in_array($headerLocale, self::ALLOWED_LOCALES, true)) {
            return $headerLocale;
        }

        $cookieLocale = strtolower(trim((string) $request->cookie('telunas_locale', '')));
        if (in_array($cookieLocale, self::ALLOWED_LOCALES, true)) {
            return $cookieLocale;
        }

        return self::DEFAULT_LOCALE;
    }
}

