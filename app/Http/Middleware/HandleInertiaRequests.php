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
                        ->where(function ($q) {
                            $q->whereNull('approval_status')
                              ->orWhere('approval_status', 'approved');
                        })
                        ->whereNotNull('department')
                        ->where('department', '!=', '')
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
            'archived_staff_names' => function () use ($request) {
                if (!$request->user()) {
                    return [];
                }
                return \Illuminate\Support\Facades\Cache::remember('archived_staff_names', 120, function () {
                    return \App\Models\User::withTrashed()
                        ->where(function ($q) {
                            $q->whereNotNull('deleted_at')
                              ->orWhere('is_active', false)
                              ->orWhere('approval_status', '!=', 'approved');
                        })
                        ->select('name', 'staff_name', 'department')
                        ->get()
                        ->flatMap(function ($u) {
                            $names = [trim($u->name ?? ''), trim($u->staff_name ?? '')];
                            $dept = trim($u->department ?? '');
                            $expanded = [];
                            foreach ($names as $n) {
                                if (!$n) continue;
                                $expanded[] = $n;
                                // Expand variations like "Dani IT" -> "Dani", "Dani (IT)"
                                if ($dept && preg_match('/\s+' . preg_quote($dept, '/') . '$/i', $n)) {
                                    $base = trim(preg_replace('/\s+' . preg_quote($dept, '/') . '$/i', '', $n));
                                    if ($base) {
                                        $expanded[] = $base;
                                        $expanded[] = "{$base} ({$dept})";
                                    }
                                }
                            }
                            return $expanded;
                        })
                        ->filter()
                        ->unique()
                        ->values()
                        ->all();
                });
            },
            'tickets_sheet_url' => config('services.google.tickets_spreadsheet_id')
                ? 'https://docs.google.com/spreadsheets/d/' . config('services.google.tickets_spreadsheet_id') . '/edit?usp=sharing'
                : null,
        ];
    }
}
