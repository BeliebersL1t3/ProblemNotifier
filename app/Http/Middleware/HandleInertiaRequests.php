<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that is loaded on the first page visit.
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determine the current asset version.
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'auth' => [
                'user' => $request->user(),
            ],
            'active_staff_roster' => function () use ($request) {
                if (!$request->user()) {
                    return null;
                }
                return \Illuminate\Support\Facades\Cache::remember('active_staff_roster', 120, function () {
                    return \App\Models\User::where('is_active', true)
                        ->whereNotNull('department')
                        ->where('department', '!=', '')
                        ->where('role', '!=', 'viewer')
                        ->select('id', 'name', 'staff_name', 'department', 'subdivision')
                        ->get()
                        ->groupBy(function ($u) {
                            return trim($u->department);
                        })
                        ->map(function ($users) {
                            return $users->map(function ($u) {
                                return trim($u->staff_name ?: $u->name);
                            })->filter()->unique()->values()->all();
                        })
                        ->toArray();
                });
            },
            'tickets_sheet_url' => config('services.google.tickets_spreadsheet_id')
                ? 'https://docs.google.com/spreadsheets/d/' . config('services.google.tickets_spreadsheet_id') . '/edit?usp=sharing'
                : null,
        ];
    }
}
