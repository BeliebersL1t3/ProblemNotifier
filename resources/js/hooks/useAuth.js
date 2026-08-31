import { usePage } from '@inertiajs/react';

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
 */
export function useAuth() {
    const { auth } = usePage().props;
    const user = auth?.user ?? null;

    return {
        user,
        isAdmin:     user?.role === 'admin',
        isDeptUser:  user?.role === 'department',
        department:  user?.department ?? null,
        staffName:      user?.staff_name ?? user?.name ?? null,
        whatsappNumber: user?.whatsapp_number ?? null,
    };
}
