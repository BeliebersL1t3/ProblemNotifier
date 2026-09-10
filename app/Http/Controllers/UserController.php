<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\UserAuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class UserController extends Controller
{
    /**
     * Ensure only Administrators can access user management.
     */
    private function ensureAdmin()
    {
        $user = auth()->user();
        if (!$user || !$user->isAdmin()) {
            abort(403, 'Unauthorized. Hanya Administrator yang dapat mengakses manajemen akun.');
        }
    }

    /**
     * Default permission presets by role.
     */
    public static function getDefaultPermissions(string $role): array
    {
        if ($role === 'admin') {
            return [
                'can_view_all_departments' => true,
                'can_manage_issues'        => true,
                'can_delete_issues'        => true,
                'can_access_analytics'     => true,
                'can_access_calendar'      => true,
                'can_export_reports'       => true,
                'can_manage_categories'    => true,
            ];
        }

        if ($role === 'viewer') {
            return [
                'can_view_all_departments' => true,
                'can_manage_issues'        => false,
                'can_delete_issues'        => false,
                'can_access_analytics'     => true,
                'can_access_calendar'      => true,
                'can_export_reports'       => false,
                'can_manage_categories'    => false,
            ];
        }

        // Department user default
        return [
            'can_view_all_departments' => true,
            'can_manage_issues'        => true,
            'can_delete_issues'        => false,
            'can_access_analytics'     => true,
            'can_access_calendar'      => true,
            'can_export_reports'       => true,
            'can_manage_categories'    => false,
        ];
    }

    /**
     * Calculate barrier restrictions on a user's permissions.
     */
    private function analyzeRestrictions(User $user): array
    {
        if ($user->isAdmin()) {
            return [
                'has_restrictions' => false,
                'reasons'          => [],
            ];
        }

        $reasons = [];
        $p = $user->permissions ?? self::getDefaultPermissions($user->role);

        if (empty($p['can_view_all_departments'])) {
            $deptName = $user->department ?: 'Departemen Sendiri';
            $reasons[] = "Dibatasi hanya melihat departemen {$deptName}";
        }
        if (empty($p['can_manage_issues'])) {
            $reasons[] = 'Tidak dapat mengedit/mengelola isu';
        }
        if (empty($p['can_delete_issues'])) {
            $reasons[] = 'Tidak dapat menghapus isu';
        }
        if (empty($p['can_access_analytics'])) {
            $reasons[] = 'Tidak dapat mengakses Analytics';
        }
        if (empty($p['can_access_calendar'])) {
            $reasons[] = 'Tidak dapat mengakses Kalender Operasional';
        }
        if (empty($p['can_export_reports'])) {
            $reasons[] = 'Tidak dapat mengunduh laporan';
        }

        return [
            'has_restrictions' => count($reasons) > 0,
            'reasons'          => $reasons,
        ];
    }

    /**
     * List users (Web view & API).
     */
    public function index(Request $request)
    {
        $this->ensureAdmin();

        $query = User::query();

        // Status filter: active (default), archived, all
        $status = $request->query('status', 'active');
        if ($status === 'archived') {
            $query->onlyTrashed();
        } elseif ($status === 'all') {
            $query->withTrashed();
        }

        // Search query
        if ($search = trim($request->query('q', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('staff_name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('whatsapp_number', 'like', "%{$search}%")
                  ->orWhere('department', 'like', "%{$search}%")
                  ->orWhere('subdivision', 'like', "%{$search}%");
            });
        }

        // Role filter
        if ($role = $request->query('role')) {
            $query->where('role', $role);
        }

        // Department filter
        if ($dept = $request->query('department')) {
            $query->where('department', $dept);
        }

        $users = $query->orderBy('name')->get()->map(function (User $user) {
            $restrictionData = $this->analyzeRestrictions($user);
            return [
                'id'               => $user->id,
                'name'             => $user->name,
                'staff_name'       => $user->staff_name,
                'email'            => $user->email,
                'role'             => $user->role,
                'department'       => $user->department,
                'subdivision'      => $user->subdivision,
                'whatsapp_number'  => $user->whatsapp_number,
                'raw_password'     => $user->raw_password,
                'permissions'      => $user->permissions ?? self::getDefaultPermissions($user->role),
                'has_restrictions' => $restrictionData['has_restrictions'],
                'barrier_reasons'  => $restrictionData['reasons'],
                'is_archived'      => $user->trashed(),
                'deleted_at'       => $user->deleted_at?->toIso8601String(),
                'created_at'       => $user->created_at?->toIso8601String(),
            ];
        });

        // Summary statistics
        $allActive = User::all();
        $stats = [
            'total_users'       => $allActive->count(),
            'total_admins'      => $allActive->where('role', 'admin')->count(),
            'total_departments' => $allActive->where('role', 'department')->count(),
            'total_viewers'     => $allActive->where('role', 'viewer')->count(),
            'total_whatsapp'    => $allActive->whereNotNull('whatsapp_number')->where('whatsapp_number', '!=', '')->count(),
            'total_restricted'  => $allActive->filter(fn($u) => $this->analyzeRestrictions($u)['has_restrictions'])->count(),
            'total_archived'    => User::onlyTrashed()->count(),
        ];

        if ($request->wantsJson() || $request->is('api/*')) {
            return response()->json([
                'success' => true,
                'data'    => $users,
                'stats'   => $stats,
            ]);
        }

        return Inertia::render('Users', [
            'initialUsers' => $users,
            'initialStats' => $stats,
        ]);
    }

    /**
     * Create a new user.
     */
    public function store(Request $request)
    {
        $this->ensureAdmin();

        $validated = $request->validate([
            'name'            => 'required|string|max:255',
            'staff_name'      => 'nullable|string|max:255',
            'email'           => 'required|email|max:255|unique:users,email',
            'password'        => 'required|string|min:6',
            'role'            => 'required|in:admin,department,viewer',
            'department'      => 'nullable|string|max:100',
            'subdivision'     => 'nullable|string|max:100',
            'whatsapp_number' => 'nullable|string|max:30',
            'permissions'     => 'nullable|array',
        ]);

        $role = $validated['role'];
        $permissions = $validated['permissions'] ?? self::getDefaultPermissions($role);

        // Normalize WhatsApp phone
        $cleanPhone = !empty($validated['whatsapp_number']) 
            ? preg_replace('/[^0-9]/', '', $validated['whatsapp_number']) 
            : null;

        $user = User::create([
            'name'            => $validated['name'],
            'staff_name'      => $validated['staff_name'] ?: $validated['name'],
            'email'           => strtolower(trim($validated['email'])),
            'password'        => Hash::make($validated['password']),
            'raw_password'    => $validated['password'],
            'role'            => $role,
            'department'      => $validated['department'] ?? null,
            'subdivision'     => $validated['subdivision'] ?? null,
            'whatsapp_number' => $cleanPhone,
            'permissions'     => $permissions,
        ]);

        // Audit log
        UserAuditLog::record(
            auth()->user(),
            $user,
            'USER_CREATED',
            [
                'created_user' => [
                    'name'        => $user->name,
                    'email'       => $user->email,
                    'role'        => $user->role,
                    'department'  => $user->department,
                    'permissions' => $permissions,
                ]
            ]
        );

        return response()->json([
            'success' => true,
            'message' => "Akun {$user->name} ({$user->email}) berhasil dibuat.",
            'data'    => $user,
        ]);
    }

    /**
     * Update an existing user.
     */
    public function update(Request $request, $id)
    {
        $this->ensureAdmin();

        $user = User::withTrashed()->findOrFail($id);

        $validated = $request->validate([
            'name'            => 'required|string|max:255',
            'staff_name'      => 'nullable|string|max:255',
            'email'           => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password'        => 'nullable|string|min:6',
            'role'            => 'required|in:admin,department,viewer',
            'department'      => 'nullable|string|max:100',
            'subdivision'     => 'nullable|string|max:100',
            'whatsapp_number' => 'nullable|string|max:30',
            'permissions'     => 'nullable|array',
        ]);

        $before = [
            'name'            => $user->name,
            'staff_name'      => $user->staff_name,
            'email'           => $user->email,
            'role'            => $user->role,
            'department'      => $user->department,
            'subdivision'     => $user->subdivision,
            'whatsapp_number' => $user->whatsapp_number,
            'permissions'     => $user->permissions,
        ];

        $cleanPhone = !empty($validated['whatsapp_number']) 
            ? preg_replace('/[^0-9]/', '', $validated['whatsapp_number']) 
            : null;

        $user->name = $validated['name'];
        $user->staff_name = $validated['staff_name'] ?: $validated['name'];
        $user->email = strtolower(trim($validated['email']));
        $user->role = $validated['role'];
        $user->department = $validated['department'] ?? null;
        $user->subdivision = $validated['subdivision'] ?? null;
        $user->whatsapp_number = $cleanPhone;

        if (isset($validated['permissions'])) {
            $user->permissions = $validated['permissions'];
        }

        $passwordChanged = false;
        if (!empty($validated['password'])) {
            $user->password = Hash::make($validated['password']);
            $user->raw_password = $validated['password'];
            $passwordChanged = true;
        }

        $user->save();

        $after = [
            'name'            => $user->name,
            'staff_name'      => $user->staff_name,
            'email'           => $user->email,
            'role'            => $user->role,
            'department'      => $user->department,
            'subdivision'     => $user->subdivision,
            'whatsapp_number' => $user->whatsapp_number,
            'permissions'     => $user->permissions,
            'password_reset'  => $passwordChanged,
        ];

        // Audit log
        UserAuditLog::record(
            auth()->user(),
            $user,
            'USER_UPDATED',
            [
                'before' => $before,
                'after'  => $after,
            ]
        );

        return response()->json([
            'success' => true,
            'message' => "Akun {$user->name} berhasil diperbarui.",
            'data'    => $user,
        ]);
    }

    /**
     * Soft delete (archive) a user.
     */
    public function destroy(Request $request, $id)
    {
        $this->ensureAdmin();

        $user = User::findOrFail($id);

        // Security check: cannot delete yourself
        if ($user->id === auth()->id()) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak dapat menghapus atau meng-archive akun Anda sendiri yang sedang aktif.',
            ], 422);
        }

        $user->delete();

        UserAuditLog::record(
            auth()->user(),
            $user,
            'USER_ARCHIVED',
            [
                'archived_user' => [
                    'id'    => $user->id,
                    'name'  => $user->name,
                    'email' => $user->email,
                    'role'  => $user->role,
                ]
            ]
        );

        return response()->json([
            'success' => true,
            'message' => "Akun {$user->name} berhasil di-archive (Soft Deleted). Semua riwayat dan relasi data tetap aman.",
        ]);
    }

    /**
     * Restore a soft-deleted user.
     */
    public function restore(Request $request, $id)
    {
        $this->ensureAdmin();

        $user = User::onlyTrashed()->findOrFail($id);
        $user->restore();

        UserAuditLog::record(
            auth()->user(),
            $user,
            'USER_RESTORED',
            [
                'restored_user' => [
                    'id'    => $user->id,
                    'name'  => $user->name,
                    'email' => $user->email,
                ]
            ]
        );

        return response()->json([
            'success' => true,
            'message' => "Akun {$user->name} berhasil dipulihkan dan dapat digunakan kembali.",
        ]);
    }

    /**
     * Quick password reset.
     */
    public function resetPassword(Request $request, $id)
    {
        $this->ensureAdmin();

        $user = User::withTrashed()->findOrFail($id);

        $newPassword = $request->input('new_password') ?: 'telunas' . rand(100, 999);

        $user->password = Hash::make($newPassword);
        $user->raw_password = $newPassword;
        $user->save();

        UserAuditLog::record(
            auth()->user(),
            $user,
            'PASSWORD_RESET',
            [
                'reset_to' => $newPassword,
            ]
        );

        return response()->json([
            'success'      => true,
            'message'      => "Password akun {$user->name} berhasil direset.",
            'new_password' => $newPassword,
        ]);
    }

    /**
     * Fetch recent audit logs.
     */
    public function auditLogs(Request $request)
    {
        $this->ensureAdmin();

        $logs = UserAuditLog::with(['admin', 'targetUser'])
            ->latest()
            ->take(50)
            ->get();

        return response()->json([
            'success' => true,
            'data'    => $logs,
        ]);
    }
}
