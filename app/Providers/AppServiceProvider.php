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
