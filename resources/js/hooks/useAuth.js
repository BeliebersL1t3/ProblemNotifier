import { usePage } from '@inertiajs/react';
import { setDynamicStaffRoster } from '@/constants/staff';

/**
 * useAuth — Access the authenticated user and role helpers.
 *
 * Returns:
 *   user         — full user object from Inertia shared props
 *   isAdmin      — true if role === 'admin'
 *   isDeptUser   — true if role === 'department'
 *   department   — consolidated dept e.g. 'HR', 'GR'
 *   subdivision  — sub-unit e.g. 'Legal', 'Bar' (null for standalone depts)
 *   staffName    — display name e.g. 'Hendro Legal'
 *   activeStaffRoster — map of active department staff from database
 */
export function useAuth() {
    const { auth, active_staff_roster } = usePage().props;
    const user = auth?.user ?? null;
    const isAdmin = user?.role === 'admin';
    const permissions = user?.permissions ?? {};

    if (active_staff_roster) {
        setDynamicStaffRoster(active_staff_roster);
    }

    const hasPermission = (key, defaultVal = true) => {
        if (isAdmin) return true;
        if (permissions && permissions[key] !== undefined) return Boolean(permissions[key]);
        return defaultVal;
    };

    const avatarUrl = user?.avatar_url || (user?.avatar ? (user.avatar.startsWith('http') ? user.avatar : `/uploads/avatars/${user.avatar}`) : null);

    return {
        user,
        isAdmin,
        isHOD:       Boolean(user?.is_hod),
        isDeptUser:  user?.role === 'department',
        isViewer:    user?.role === 'viewer',
        department:  user?.department ?? null,
        subdivision: user?.subdivision ?? null,
        staffName:      user?.staff_name ?? user?.name ?? null,
        whatsappNumber: user?.whatsapp_number ?? null,
        avatar:         avatarUrl,
        avatarUrl,
        activeStaffRoster: active_staff_roster ?? null,
        permissions,
        // Specific capability helpers
        canViewAllDepartments: hasPermission('can_view_all_departments', true),
        canManageIssues:        hasPermission('can_manage_issues', true),
        canDeleteIssues:        isAdmin,
        canAccessAnalytics:     hasPermission('can_access_analytics', true),
        canAccessCalendar:      hasPermission('can_access_calendar', true),
        canSyncCalendar:        isAdmin || Boolean(user?.is_hod) || hasPermission('can_sync_google_calendar', false),
        canExportReports:       hasPermission('can_export_reports', true),
        canManageCategories:    hasPermission('can_manage_categories', false),
    };
}
