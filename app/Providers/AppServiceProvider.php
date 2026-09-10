<?php

namespace App\Providers;

use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;
use Inertia\Inertia;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        Vite::prefetch(concurrency: 3);

        // Auto-heal stale public/hot: If Vite dev server is not actively reachable, delete hot file
        if (file_exists(public_path('hot'))) {
            $hotContent = trim(@file_get_contents(public_path('hot')));
            $parsed = parse_url($hotContent);
            $host = $parsed['host'] ?? '127.0.0.1';
            $port = $parsed['port'] ?? 5173;

            $conn = @fsockopen($host, (int) $port, $errno, $errstr, 0.05);
            if (!$conn) {
                @unlink(public_path('hot'));
            } else {
                fclose($conn);
            }
        }

        // Share authenticated user (with role/department data) to every Inertia page
        Inertia::share([
            'auth' => function () {
                $user = auth()->user();
                if (!$user) return ['user' => null];
                return [
                    'user' => [
                        'id'          => $user->id,
                        'name'        => $user->name,
                        'email'       => $user->email,
                        'role'        => $user->role,
                        'department'  => $user->department,
                        'subdivision' => $user->subdivision,
                        'staff_name'  => $user->staff_name,
                    ],
                ];
            },
        ]);
    }
}
