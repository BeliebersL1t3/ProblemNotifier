<?php

namespace App\Http\Controllers;

use App\Models\DashboardNotification;
use App\Models\User;
use App\Models\UserAuditLog;
use App\Services\GoogleService;
use App\Services\IssueSheetRepository;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
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
                'can_access_analytics'     => true,
                'can_access_calendar'      => true,
                'can_sync_google_calendar' => true,
                'can_export_reports'       => true,
                'can_manage_categories'    => true,
            ];
        }

        // Department user default
        return [
            'can_view_all_departments' => false,
            'can_manage_issues'        => true,
            'can_access_analytics'     => true,
            'can_access_calendar'      => true,
            'can_sync_google_calendar' => false,
            'can_export_reports'       => true,
            'can_manage_categories'    => false,
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
            if ($role === 'hod') {
                $query->where('is_hod', true);
            } else {
                $query->where('role', $role);
            }
        }

        // Dedicated HOD filter
        if ($request->has('is_hod')) {
            $query->where('is_hod', $request->boolean('is_hod'));
        }

        // Department filter
        if ($dept = $request->query('department')) {
            $query->where('department', $dept);
        }

        $users = $query->orderBy('name')->get()->map(function (User $user) {
            return [
                'id'               => $user->id,
                'name'             => $user->name,
                'staff_name'       => $user->staff_name,
                'email'            => $user->email,
                'role'             => $user->role,
                'department'       => $user->department,
                'subdivision'      => $user->subdivision,
                'whatsapp_number'  => $user->whatsapp_number,
                'is_hod'           => (bool) $user->is_hod,
                'hod_title'        => $user->hod_title,
                'approval_status'  => $user->approval_status ?? 'approved',
                'is_active'        => (bool) ($user->is_active ?? true),
                'rejection_reason' => $user->rejection_reason,
                'permissions'      => $user->permissions ?? self::getDefaultPermissions($user->role),
                'avatar'           => $user->avatar,
                'avatar_url'       => $user->avatar_url,
                'is_archived'      => $user->trashed(),
                'deleted_at'       => $user->deleted_at?->toIso8601String(),
                'created_at'       => $user->created_at?->toIso8601String(),
            ];
        });

        // Summary statistics (Optimized: database aggregate query instead of hydrating full models)
        $aggregate = User::query()
            ->selectRaw('
                COUNT(*) as total_users,
                SUM(CASE WHEN role = "admin" THEN 1 ELSE 0 END) as total_admins,
                SUM(CASE WHEN role = "department" THEN 1 ELSE 0 END) as total_departments,
                SUM(CASE WHEN role = "viewer" THEN 1 ELSE 0 END) as total_viewers,
                SUM(CASE WHEN is_hod = 1 THEN 1 ELSE 0 END) as total_hod,
                SUM(CASE WHEN whatsapp_number IS NOT NULL AND whatsapp_number != "" THEN 1 ELSE 0 END) as total_whatsapp
            ')
            ->first();

        $stats = [
            'total_users'       => (int) ($aggregate->total_users ?? 0),
            'total_admins'      => (int) ($aggregate->total_admins ?? 0),
            'total_departments' => (int) ($aggregate->total_departments ?? 0),
            'total_viewers'     => (int) ($aggregate->total_viewers ?? 0),
            'total_hod'         => (int) ($aggregate->total_hod ?? 0),
            'total_whatsapp'    => (int) ($aggregate->total_whatsapp ?? 0),
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
            'role'            => 'required|in:admin,department',
            'department'      => 'nullable|string|max:100',
            'subdivision'     => 'nullable|string|max:100',
            'whatsapp_number' => 'required|string|max:30',
            'is_hod'          => 'nullable|boolean',
            'hod_title'       => 'nullable|string|max:100',
            'permissions'     => 'nullable|array',
        ]);

        $role = $validated['role'];
        $permissions = $validated['permissions'] ?? self::getDefaultPermissions($role);

        // Normalize WhatsApp phone
        $cleanPhone = !empty($validated['whatsapp_number']) 
            ? preg_replace('/[^0-9]/', '', $validated['whatsapp_number']) 
            : null;
        if (!empty($cleanPhone) && str_starts_with($cleanPhone, '0')) {
            $cleanPhone = '62' . substr($cleanPhone, 1);
        }

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
            'is_hod'          => $request->boolean('is_hod'),
            'hod_title'       => $validated['hod_title'] ?? null,
            'approval_status' => 'approved',
            'is_active'       => true,
            'notify_whatsapp_tickets' => true,
            'permissions'     => $permissions,
        ]);

        if (!empty($cleanPhone)) {
            try {
                \Illuminate\Support\Facades\Http::timeout(1)->post('http://127.0.0.1:3000/sync-staff');
            } catch (\Throwable $e) {}
        }

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
                    'is_hod'      => $user->is_hod,
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
            'role'            => 'required|in:admin,department',
            'department'      => 'nullable|string|max:100',
            'subdivision'     => 'nullable|string|max:100',
            'whatsapp_number' => 'nullable|string|max:30',
            'is_hod'          => 'nullable|boolean',
            'hod_title'       => 'nullable|string|max:100',
            'is_active'       => 'nullable|boolean',
            'approval_status' => 'nullable|in:approved,pending_hod,pending_admin,rejected',
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
            'is_hod'          => $user->is_hod,
            'is_active'       => $user->is_active,
            'permissions'     => $user->permissions,
        ];

        $cleanPhone = !empty($validated['whatsapp_number']) 
            ? preg_replace('/[^0-9]/', '', $validated['whatsapp_number']) 
            : null;
        if (!empty($cleanPhone) && str_starts_with($cleanPhone, '0')) {
            $cleanPhone = '62' . substr($cleanPhone, 1);
        }

        $user->name = trim($validated['name']);
        $user->staff_name = !empty($validated['staff_name']) ? trim($validated['staff_name']) : trim($validated['name']);

        $newEmail = trim($validated['email']);
        if (strtolower($user->email) !== strtolower($newEmail)) {
            $user->email = strtolower($newEmail);
        }
        // Security checks: Admin protection
        if ($user->id === auth()->id() && $validated['role'] !== 'admin') {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak dapat menurunkan peran (demote) akun Admin Anda sendiri.',
            ], 422);
        }

        $willBeInactive = $request->has('is_active') && !$request->boolean('is_active');
        $isDemoting = ($before['role'] === 'admin') && ($validated['role'] !== 'admin');
        if ($before['role'] === 'admin' && ($isDemoting || $willBeInactive)) {
            $remainingAdmins = User::where('role', 'admin')
                ->where('is_active', true)
                ->where('id', '!=', $user->id)
                ->count();
            if ($remainingAdmins === 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Tidak dapat mengubah peran atau menonaktifkan akun Administrator aktif terakhir di sistem.',
                ], 422);
            }
        }

        $user->role = $validated['role'];
        $user->department = $validated['department'] ?? null;
        $user->subdivision = $validated['subdivision'] ?? null;
        $user->whatsapp_number = $cleanPhone;
        if (empty($cleanPhone)) {
            $user->notify_whatsapp_tickets = false;
        }

        $actingAdmin = auth()->user();
        $wasHod = (bool) $user->is_hod;
        if ($request->has('is_hod')) {
            $user->is_hod = $request->boolean('is_hod');
        }
        if ($request->has('hod_title')) {
            $user->hod_title = $user->is_hod ? $request->input('hod_title') : null;
        } elseif (!$user->is_hod) {
            $user->hod_title = null;
        }
        if ($request->has('is_active')) {
            $user->is_active = $request->boolean('is_active');
        }
        if ($request->has('approval_status')) {
            $user->approval_status = $request->input('approval_status');
        }

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

        // If HOD status was changed, notify user and other admins with acting admin info
        if ($wasHod !== (bool) $user->is_hod) {
            \App\Services\TicketNotificationService::notifyHodStatusChange(
                $user,
                (bool) $user->is_hod,
                $actingAdmin,
                $user->hod_title
            );
        }

        // If department was changed, notify HOD of old department if this staff has active claimed issues needing reassignment
        $oldDepartment = $before['department'] ?? null;
        $newDepartment = $user->department ?? null;
        if (!empty($oldDepartment) && !empty($newDepartment) && strcasecmp($oldDepartment, $newDepartment) !== 0) {
            $this->notifyHodOfTransferredStaffActiveIssues($user, $oldDepartment, $newDepartment);
        }

        // Notify WhatsApp bot to sync staff memory in real-time
        try {
            \Illuminate\Support\Facades\Http::timeout(1)->post('http://127.0.0.1:3000/sync-staff');
        } catch (\Throwable $e) {}

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
     * Batch update permissions for multiple users.
     */
    public function batchUpdatePermissions(Request $request)
    {
        $this->ensureAdmin();

        $validated = $request->validate([
            'user_ids'    => 'required|array|min:1',
            'user_ids.*'  => 'integer|exists:users,id',
            'permissions' => 'nullable|array',
            'action'      => 'nullable|string|in:set,reset_default,enable_all,disable_all',
        ]);

        $admin = auth()->user();
        $targetUsers = User::whereIn('id', $validated['user_ids'])->get();
        $updatedCount = 0;
        $updatedUsersList = [];

        foreach ($targetUsers as $target) {
            if ($target->isAdmin()) {
                continue;
            }

            $before = [
                'name'        => $target->name,
                'staff_name'  => $target->staff_name,
                'email'       => $target->email,
                'role'        => $target->role,
                'department'  => $target->department,
                'permissions' => $target->permissions,
            ];

            $action = $validated['action'] ?? 'set';
            $currentPerms = $target->permissions ?? self::getDefaultPermissions($target->role);

            if ($action === 'reset_default') {
                $currentPerms = self::getDefaultPermissions($target->role);
            } elseif ($action === 'enable_all') {
                foreach (array_keys(self::getDefaultPermissions($target->role)) as $key) {
                    $currentPerms[$key] = true;
                }
            } elseif ($action === 'disable_all') {
                foreach (array_keys(self::getDefaultPermissions($target->role)) as $key) {
                    $currentPerms[$key] = false;
                }
            } else {
                if (!empty($validated['permissions'])) {
                    foreach ($validated['permissions'] as $permKey => $permVal) {
                        $currentPerms[$permKey] = (bool) $permVal;
                    }
                }
            }

            $target->permissions = $currentPerms;
            $target->save();

            $affectedAccounts[] = [
                'id'          => $target->id,
                'name'        => $target->staff_name ?: $target->name,
                'department'  => $target->department,
                'subdivision' => $target->subdivision,
                'role'        => $target->role,
            ];

            $updatedUsersList[] = [
                'id'               => $target->id,
                'name'             => $target->name,
                'staff_name'       => $target->staff_name,
                'email'            => $target->email,
                'role'             => $target->role,
                'department'       => $target->department,
                'subdivision'      => $target->subdivision,
                'whatsapp_number'  => $target->whatsapp_number,
                'permissions'      => $target->permissions,
                'avatar'           => $target->avatar,
                'avatar_url'       => $target->avatar_url,
                'is_archived'      => $target->trashed(),
                'deleted_at'       => $target->deleted_at?->toIso8601String(),
                'created_at'       => $target->created_at?->toIso8601String(),
            ];

            $updatedCount++;
        }

        // Record EXACTLY ONE consolidated audit log entry for this batch operation
        if ($updatedCount > 0) {
            $namesSample = array_slice(array_column($affectedAccounts, 'name'), 0, 3);
            $targetLabel = "{$updatedCount} Akun (" . implode(', ', $namesSample) . ($updatedCount > 3 ? ', ...' : '') . ')';

            UserAuditLog::record(
                $admin,
                null,
                'BATCH_PERMISSIONS_UPDATED',
                [
                    'batch'              => true,
                    'account_count'      => $updatedCount,
                    'action_applied'     => $validated['action'] ?? 'set',
                    'permission_changes' => $validated['permissions'] ?? [],
                    'accounts'           => $affectedAccounts,
                ],
                null,
                null,
                $targetLabel
            );
        }

        return response()->json([
            'success'       => true,
            'message'       => "Berhasil memperbarui hak akses untuk {$updatedCount} akun.",
            'updated_count' => $updatedCount,
            'updated_users' => $updatedUsersList,
        ]);
    }

    /**
     * Batch soft delete (archive) multiple users.
     */
    public function batchDestroy(Request $request)
    {
        $this->ensureAdmin();

        $validated = $request->validate([
            'user_ids'   => 'required|array|min:1',
            'user_ids.*' => 'integer',
        ]);

        $admin = auth()->user();
        $targetUsers = User::whereIn('id', $validated['user_ids'])->get();

        $affectedAccounts = [];
        $skippedAccounts = [];
        $hasWhatsapp = false;

        // Count current active administrators in the system to protect against deleting the last admin
        $activeAdminsCount = User::where('role', 'admin')
            ->where('is_active', true)
            ->count();

        foreach ($targetUsers as $target) {
            // Rule 1: Cannot delete currently logged in administrator
            if ($target->id === $admin->id) {
                $skippedAccounts[] = "{$target->name} (Akun Anda sendiri)";
                continue;
            }

            // Rule 2: Cannot delete the last active administrator
            if ($target->isAdmin() && $target->is_active) {
                if ($activeAdminsCount <= 1) {
                    $skippedAccounts[] = "{$target->name} (Administrator aktif terakhir di sistem)";
                    continue;
                }
                $activeAdminsCount--;
            }

            $target->delete();

            $affectedAccounts[] = [
                'id'         => $target->id,
                'name'       => $target->staff_name ?: $target->name,
                'email'      => $target->email,
                'role'       => $target->role,
                'department' => $target->department,
            ];

            if (!empty($target->whatsapp_number)) {
                $hasWhatsapp = true;
            }
        }

        // Notify WhatsApp bot to sync staff in real-time if any account had a phone number
        if ($hasWhatsapp) {
            try {
                \Illuminate\Support\Facades\Http::timeout(1)->post('http://127.0.0.1:3000/sync-staff');
            } catch (\Throwable $e) {}
        }

        // Record consolidated audit log
        $archivedCount = count($affectedAccounts);
        if ($archivedCount > 0) {
            $namesSample = array_slice(array_column($affectedAccounts, 'name'), 0, 3);
            $targetLabel = "{$archivedCount} Akun (" . implode(', ', $namesSample) . ($archivedCount > 3 ? ', ...' : '') . ')';

            UserAuditLog::record(
                $admin,
                null,
                'BATCH_USERS_ARCHIVED',
                [
                    'batch'            => true,
                    'account_count'    => $archivedCount,
                    'accounts'         => $affectedAccounts,
                    'skipped_accounts' => $skippedAccounts,
                ],
                null,
                null,
                $targetLabel
            );
        }

        $message = $archivedCount > 0
            ? "Berhasil meng-archive (Soft Delete) {$archivedCount} akun." . (count($skippedAccounts) > 0 ? ' (' . count($skippedAccounts) . ' akun dilewati: ' . implode(', ', $skippedAccounts) . ')' : '')
            : 'Tidak ada akun yang di-archive. ' . (count($skippedAccounts) > 0 ? '(' . implode(', ', $skippedAccounts) . ')' : '');

        return response()->json([
            'success'          => $archivedCount > 0,
            'message'          => $message,
            'archived_count'   => $archivedCount,
            'skipped_count'    => count($skippedAccounts),
            'skipped_accounts' => $skippedAccounts,
        ]);
    }

    /**
     * Batch restore multiple soft-deleted users.
     */
    public function batchRestore(Request $request)
    {
        $this->ensureAdmin();

        $validated = $request->validate([
            'user_ids'   => 'required|array|min:1',
            'user_ids.*' => 'integer',
        ]);

        $admin = auth()->user();
        $targetUsers = User::onlyTrashed()->whereIn('id', $validated['user_ids'])->get();

        $restoredAccounts = [];
        $hasWhatsapp = false;

        foreach ($targetUsers as $target) {
            $target->restore();

            $restoredAccounts[] = [
                'id'         => $target->id,
                'name'       => $target->staff_name ?: $target->name,
                'email'      => $target->email,
                'role'       => $target->role,
                'department' => $target->department,
            ];

            if (!empty($target->whatsapp_number)) {
                $hasWhatsapp = true;
            }
        }

        if ($hasWhatsapp) {
            try {
                \Illuminate\Support\Facades\Http::timeout(1)->post('http://127.0.0.1:3000/sync-staff');
            } catch (\Throwable $e) {}
        }

        $restoredCount = count($restoredAccounts);
        if ($restoredCount > 0) {
            $namesSample = array_slice(array_column($restoredAccounts, 'name'), 0, 3);
            $targetLabel = "{$restoredCount} Akun (" . implode(', ', $namesSample) . ($restoredCount > 3 ? ', ...' : '') . ')';

            UserAuditLog::record(
                $admin,
                null,
                'BATCH_USERS_RESTORED',
                [
                    'batch'         => true,
                    'account_count' => $restoredCount,
                    'accounts'      => $restoredAccounts,
                ],
                null,
                null,
                $targetLabel
            );
        }

        return response()->json([
            'success'        => $restoredCount > 0,
            'message'        => "Berhasil memulihkan {$restoredCount} akun. Akun kini aktif kembali.",
            'restored_count' => $restoredCount,
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

        // Security check: cannot delete the last active administrator
        if ($user->isAdmin() && $user->is_active) {
            $remainingAdmins = User::where('role', 'admin')
                ->where('is_active', true)
                ->where('id', '!=', $user->id)
                ->count();
            if ($remainingAdmins === 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Tidak dapat menghapus atau meng-archive akun Administrator aktif terakhir di sistem.',
                ], 422);
            }
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

        $limit = min((int) $request->input('limit', 100), 500);

        $logs = UserAuditLog::with(['admin', 'targetUser'])
            ->latest()
            ->take($limit)
            ->get();

        $auditSheet = app(\App\Services\AuditSheetService::class);

        return response()->json([
            'success'         => true,
            'data'            => $logs,
            'total_count'     => UserAuditLog::count(),
            'spreadsheet_url' => $auditSheet->getSpreadsheetUrl(),
            'spreadsheet_id'  => $auditSheet->getSpreadsheetId(),
        ]);
    }

    /**
     * Full sync of all audit logs to Google Spreadsheet.
     */
    public function syncAuditSheet(Request $request)
    {
        $this->ensureAdmin();

        try {
            $service = app(\App\Services\AuditSheetService::class);
            $result = $service->syncAllLogs();

            return response()->json([
                'success'         => true,
                'count'           => $result['count'] ?? 0,
                'spreadsheet_url' => $result['sheet_url'] ?? $service->getSpreadsheetUrl(),
                'message'         => $result['message'] ?? 'Berhasil menyinkronkan data ke Google Spreadsheet.',
            ]);
        } catch (\Throwable $e) {
            Log::error('UserController@syncAuditSheet failed: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Gagal menyinkronkan ke Google Spreadsheet: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Toggle HOD status for a user.
     */
    public function toggleHod(Request $request, $id)
    {
        $this->ensureAdmin();

        $actingAdmin = auth()->user();
        $user = User::withTrashed()->findOrFail($id);
        $user->is_hod = !$user->is_hod;
        if ($request->filled('hod_title')) {
            $user->hod_title = $request->input('hod_title');
        } elseif (!$user->is_hod) {
            $user->hod_title = null;
        }
        $user->save();

        UserAuditLog::record(
            $actingAdmin,
            $user,
            $user->is_hod ? 'USER_PROMOTED_HOD' : 'USER_DEMOTED_HOD',
            ['is_hod' => $user->is_hod, 'hod_title' => $user->hod_title]
        );

        // Notify user about HOD status change and who did it
        \App\Services\TicketNotificationService::notifyHodStatusChange(
            $user,
            (bool) $user->is_hod,
            $actingAdmin,
            $user->hod_title
        );

        return response()->json([
            'success' => true,
            'message' => $user->is_hod ? "Akun {$user->name} dijadikan HOD." : "Status HOD {$user->name} dicabut.",
            'is_hod'  => $user->is_hod,
            'hod_title' => $user->hod_title,
        ]);
    }

    /**
     * Notify HOD of the former department if a transferred staff member has active claimed issues needing reassignment.
     * Note: Per workflow rules, Admin will only receive notification AFTER the HOD has reviewed/actioned/reassigned the issue.
     */
    private function notifyHodOfTransferredStaffActiveIssues(User $user, string $oldDepartment, string $newDepartment): void
    {
        try {
            /** @var GoogleService $googleService */
            $googleService = app(GoogleService::class);
            $sheets = $googleService->listSheets();
            $latestSheet = !empty($sheets) ? end($sheets) : 'Sheet1';
            $rows = $googleService->readRows($latestSheet);
            if (empty($rows) || count($rows) <= 1) {
                return;
            }

            $userNames = array_map('strtolower', array_filter([
                trim($user->name ?? ''),
                trim($user->staff_name ?? '')
            ]));

            $activeIssuesCount = 0;
            $sampleTitles = [];

            // Skip header row
            for ($i = 1; $i < count($rows); $i++) {
                $row = $rows[$i];
                if (empty($row) || IssueSheetRepository::isArchived($row)) {
                    continue;
                }

                $status = strtolower(trim($row[IssueSheetRepository::COL_STATUS] ?? ''));
                if (!in_array($status, ['open', 'progress', 'pending'])) {
                    continue;
                }

                $rawTaker = trim($row[IssueSheetRepository::COL_TAKER] ?? '');
                if (empty($rawTaker)) {
                    continue;
                }

                $cleanTaker = strtolower(trim(preg_replace('/\s*via\s+WhatsApp/i', '', $rawTaker)));
                $baseTaker = trim(preg_replace('/\s*\([^)]*\)/', '', $cleanTaker));

                $isTakerMatch = false;
                foreach ($userNames as $uName) {
                    if (strcasecmp($uName, $baseTaker) === 0 || stripos($baseTaker, $uName) !== false || stripos($uName, $baseTaker) !== false) {
                        $isTakerMatch = true;
                        break;
                    }
                }

                if ($isTakerMatch) {
                    $assignedDepts = IssueSheetRepository::getAssignedDepartments($row);
                    $originDept = trim($row[IssueSheetRepository::COL_ORIGIN_DEPT] ?? '');
                    $normOldDept = IssueSheetRepository::normalizeDeptKey($oldDepartment);
                    
                    $inOldDeptScope = in_array($normOldDept, array_map(fn($d) => IssueSheetRepository::normalizeDeptKey($d), $assignedDepts))
                        || (!empty($originDept) && IssueSheetRepository::normalizeDeptKey($originDept) === $normOldDept);

                    if ($inOldDeptScope) {
                        $activeIssuesCount++;
                        $issueId = trim($row[IssueSheetRepository::COL_ID] ?? "#{$i}");
                        $issueTitle = trim($row[IssueSheetRepository::COL_TITLE] ?? 'Isu');
                        if (count($sampleTitles) < 2) {
                            $sampleTitles[] = "{$issueId} ({$issueTitle})";
                        }
                    }
                }
            }

            if ($activeIssuesCount > 0) {
                $staffDisplayName = $user->staff_name ?: $user->name;
                $sampleText = implode(', ', $sampleTitles);
                if ($activeIssuesCount > count($sampleTitles)) {
                    $sampleText .= " dan " . ($activeIssuesCount - count($sampleTitles)) . " lainnya";
                }

                // Send notification ONLY to HOD of the old department (admin receives only after HOD ACC)
                DashboardNotification::create([
                    'department'  => $oldDepartment,
                    'role_target' => 'hod',
                    'type'        => 'issue_progress',
                    'title'       => "⚠️ Staf Dimutasi: {$staffDisplayName} (Perlu Reassignment)",
                    'message'     => "Staf {$staffDisplayName} telah dimutasi dari {$oldDepartment} ke {$newDepartment}. Terdapat {$activeIssuesCount} tiket aktif yang sebelumnya diklaim ({$sampleText}) dan memerlukan penugasan ulang oleh HOD.",
                    'link'        => "/dashboard?dept=" . urlencode($oldDepartment) . "&filter=reassign_needed",
                    'is_read'     => false,
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning("Failed to notify HOD of transferred staff active issues: " . $e->getMessage());
        }
    }
}
