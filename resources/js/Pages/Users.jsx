import { useState, useEffect } from 'react';
import axios from 'axios';
import { Head, Link, usePage } from '@inertiajs/react';
import { 
    Users as UsersIcon, Plus, Search, Shield, ShieldCheck, ShieldAlert, 
    KeyRound, Building2, Phone, CheckCircle2, AlertCircle, Edit, Trash2, 
    RefreshCw, RotateCcw, Activity, Eye, Filter, Lock, ArrowLeft,
    Check, CheckSquare, Square, MinusSquare, FileSpreadsheet
} from 'lucide-react';

import { useLanguage } from '@/context/LanguageContext';
import { LeanHeader } from '@/Components/CampusFix/LeanHeader';
import { MobileBottomNav } from '@/Components/CampusFix/MobileBottomNav';
import { useLeanTheme } from '@/hooks/useLeanTheme';
import { useAuth } from '@/hooks/useAuth';
import { UserModal } from '@/Components/Users/UserModal';
import { AuditTrailTab } from '@/Components/Users/AuditTrailTab';
import { BatchPermissionsModal } from '@/Components/Users/BatchPermissionsModal';
import { DEPARTMENTS, getDepartmentTheme } from '@/constants/departments';
import SubdivisionTag from '@/Components/CampusFix/SubdivisionTag';

export default function UsersPage({ initialUsers = [], initialStats = {} }) {
    return <UsersInner initialUsers={initialUsers} initialStats={initialStats} />;
}

function UsersInner({ initialUsers, initialStats }) {
    const { lang } = useLanguage();
    const { isDark } = useLeanTheme();
    const { user: currentUser } = useAuth();

    const [users, setUsers] = useState(initialUsers);
    const [stats, setStats] = useState(initialStats);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [deptFilter, setDeptFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'archived'
    const [loading, setLoading] = useState(false);

    // Multi-Select & Batch Action State
    const [selectedUserIds, setSelectedUserIds] = useState([]);
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
    const [batchQuickProcessing, setBatchQuickProcessing] = useState(false);
    const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);
    const [batchRestoreLoading, setBatchRestoreLoading] = useState(false);

    // Modals
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [activeMainTab, setActiveMainTab] = useState('users'); // 'users' | 'audit'

    // Toast notification
    const [toastMessage, setToastMessage] = useState(null);

    const showToast = (msg, isError = false) => {
        setToastMessage({ text: msg, isError });
        setTimeout(() => setToastMessage(null), 4000);
    };

    // Reset selection when changing status tabs
    useEffect(() => {
        setSelectedUserIds([]);
    }, [statusFilter]);

    // Selection helpers: in archived tab, selectable are archived; in active tab, only department/staff accounts (admins excluded from auto-select all)
    const selectableUsers = statusFilter === 'archived'
        ? users.filter(u => u.is_archived)
        : users.filter(u => !u.is_archived && u.role !== 'admin');

    const isAllSelected = selectableUsers.length > 0 && selectableUsers.every(u => selectedUserIds.includes(u.id));
    const isSomeSelected = selectedUserIds.length > 0 && !isAllSelected;

    const selectedUsers = users.filter(u => selectedUserIds.includes(u.id));
    const selectedAdminUsers = selectedUsers.filter(u => u.role === 'admin');
    const selectedDeptUsers = selectedUsers.filter(u => u.role !== 'admin');
    const selectedIncludesSelf = selectedUserIds.includes(currentUser?.id);

    // Only non-admin active users can be deleted via batch (excluding current user and admins)
    const effectiveDeleteCount = selectedUsers.filter(u => u.id !== currentUser?.id && u.role !== 'admin').length;

    const handleSelectAll = () => {
        if (isAllSelected) {
            setSelectedUserIds([]);
        } else {
            setSelectedUserIds(selectableUsers.map(u => u.id));
        }
    };

    const handleSelectUser = (id) => {
        setSelectedUserIds(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const handleDeselectAll = () => {
        setSelectedUserIds([]);
    };

    const handleBatchSuccess = (updatedUsersList) => {
        if (updatedUsersList && updatedUsersList.length > 0) {
            setUsers(prev => {
                const updatedMap = new Map(updatedUsersList.map(u => [u.id, u]));
                return prev.map(u => updatedMap.get(u.id) || u);
            });
        } else {
            fetchUsers();
        }
        setSelectedUserIds([]);
    };

    const handleConfirmBatchDelete = async () => {
        if (selectedUserIds.length === 0) return;
        setBatchDeleteLoading(true);
        try {
            const res = await axios.post('/api/users/batch-destroy', {
                user_ids: selectedUserIds,
            });
            if (res.data?.success) {
                showToast(res.data.message || `${res.data.archived_count} akun berhasil di-archive`);
                setIsBatchDeleteModalOpen(false);
                setSelectedUserIds([]);
                fetchUsers();
            } else {
                showToast(res.data?.message || 'Gagal meng-archive akun', true);
            }
        } catch (e) {
            showToast(e.response?.data?.message || 'Terjadi kesalahan sistem saat menghapus akun', true);
        } finally {
            setBatchDeleteLoading(false);
        }
    };

    const handleBatchRestore = async () => {
        if (selectedUserIds.length === 0) return;
        const confirmMsg = lang === 'id'
            ? `Pulihkan ${selectedUserIds.length} akun yang dipilih agar aktif kembali?`
            : `Restore ${selectedUserIds.length} selected accounts so they become active again?`;
        if (!confirm(confirmMsg)) return;

        setBatchRestoreLoading(true);
        try {
            const res = await axios.post('/api/users/batch-restore', {
                user_ids: selectedUserIds,
            });
            if (res.data?.success) {
                showToast(res.data.message || `${res.data.restored_count} akun berhasil dipulihkan`);
                setSelectedUserIds([]);
                fetchUsers();
            } else {
                showToast(res.data?.message || 'Gagal memulihkan akun', true);
            }
        } catch (e) {
            showToast(e.response?.data?.message || 'Terjadi kesalahan sistem saat memulihkan akun', true);
        } finally {
            setBatchRestoreLoading(false);
        }
    };

    const handleQuickToggleViewAllDepts = async (enabled) => {
        const targetIds = selectedUsers.filter(u => u.role !== 'admin').map(u => u.id);
        if (targetIds.length === 0) {
            showToast(lang === 'id' ? 'Akun Administrator selalu memiliki akses ke seluruh departemen.' : 'Administrator accounts always have full department access.', true);
            return;
        }
        setBatchQuickProcessing(true);
        try {
            const res = await axios.post('/api/users/batch-permissions', {
                user_ids: targetIds,
                permissions: {
                    can_view_all_departments: enabled,
                },
            });
            if (res.data?.success) {
                const noticeMsg = selectedAdminUsers.length > 0
                    ? (lang === 'id' ? ` (Akun Administrator dilewati karena memiliki akses penuh).` : ` (Administrator accounts skipped due to full access).`)
                    : '';
                showToast(
                    (lang === 'id' 
                        ? `${targetIds.length} akun staf berhasil ${enabled ? 'diberikan akses' : 'dibatasi dari'} semua departemen.`
                        : `${targetIds.length} staff accounts successfully ${enabled ? 'granted access to' : 'restricted from'} all departments.`) + noticeMsg
                );
                fetchUsers();
            } else {
                showToast(res.data?.message || 'Gagal memperbarui wewenang akun', true);
            }
        } catch (e) {
            showToast(e.response?.data?.message || 'Terjadi kesalahan sistem', true);
        } finally {
            setBatchQuickProcessing(false);
        }
    };

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchQuery) params.append('q', searchQuery);
            if (roleFilter !== 'all') params.append('role', roleFilter);
            if (deptFilter !== 'all') params.append('department', deptFilter);
            if (statusFilter) params.append('status', statusFilter);

            const res = await axios.get(`/api/users?${params.toString()}`);
            if (res.data?.success) {
                setUsers(res.data.data || []);
                if (res.data.stats) setStats(res.data.stats);
            }
        } catch (e) {
            console.error('Failed to fetch users:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchUsers();
        }, 250);
        return () => clearTimeout(timer);
    }, [searchQuery, roleFilter, deptFilter, statusFilter]);

    const handleCreateUser = () => {
        setSelectedUser(null);
        setIsUserModalOpen(true);
    };

    const handleEditUser = (u) => {
        setSelectedUser(u);
        setIsUserModalOpen(true);
    };

    const handleArchiveUser = async (targetUser) => {
        if (targetUser.id === currentUser?.id) {
            alert(lang === 'id' ? 'Anda tidak dapat meng-archive akun Anda sendiri yang sedang aktif.' : 'You cannot archive your own active account.');
            return;
        }

        const confirmMsg = lang === 'id'
            ? `Archive (Soft Delete) akun ${targetUser.name}?\nAkun ini tidak akan bisa login lagi, namun seluruh riwayat data isu dan pelaporan tetap aman.`
            : `Archive (Soft Delete) account ${targetUser.name}?\nThis account won't be able to log in, but all historical issue reports and logs remain safe.`;

        if (!confirm(confirmMsg)) return;

        try {
            const res = await axios.delete(`/api/users/${targetUser.id}`);
            if (res.data?.success) {
                showToast(res.data.message || 'Akun berhasil di-archive');
                fetchUsers();
            } else {
                showToast(res.data?.message || 'Gagal meng-archive akun', true);
            }
        } catch (e) {
            showToast(e.response?.data?.message || 'Terjadi kesalahan sistem', true);
        }
    };

    const handleRestoreUser = async (targetUser) => {
        const confirmMsg = lang === 'id'
            ? `Pulihkan akun ${targetUser.name} agar dapat aktif dan login kembali?`
            : `Restore account ${targetUser.name} so it can log in and be active again?`;

        if (!confirm(confirmMsg)) return;

        try {
            const res = await axios.post(`/api/users/${targetUser.id}/restore`);
            if (res.data?.success) {
                showToast(res.data.message || 'Akun berhasil dipulihkan');
                fetchUsers();
            } else {
                showToast(res.data?.message || 'Gagal memulihkan akun', true);
            }
        } catch (e) {
            showToast(e.response?.data?.message || 'Terjadi kesalahan sistem', true);
        }
    };

    const handleResetPassword = async (targetUser) => {
        if (targetUser.approval_status && targetUser.approval_status !== 'approved') {
            showToast(lang === 'id' ? 'Akun belum disetujui (Pending). Tidak dapat mereset password akun ini.' : 'Account is pending approval. Cannot reset password for this account.', true);
            return;
        }

        const confirmMsg = lang === 'id'
            ? `Reset password untuk ${targetUser.name}?\nSistem akan membuat password baru dan mencatatnya ke audit log.`
            : `Reset password for ${targetUser.name}?\nThe system will generate a new password and log the action.`;

        if (!confirm(confirmMsg)) return;

        try {
            const res = await axios.post(`/api/users/${targetUser.id}/reset-password`);
            if (res.data?.success) {
                showToast(`Password ${targetUser.name} berhasil direset: "${res.data.new_password}"`);
                fetchUsers();
            } else {
                showToast(res.data?.message || 'Gagal mereset password', true);
            }
        } catch (e) {
            showToast(e.response?.data?.message || 'Terjadi kesalahan sistem', true);
        }
    };


    return (
        <div
            className={`lean-root ${
                isDark ? 'lean-theme-dark text-slate-100' : 'lean-theme-light text-slate-800'
            } min-h-screen flex flex-col font-sans pb-28 md:pb-12 transition-colors duration-300 w-full max-w-full overflow-x-clip selection:bg-emerald-500 selection:text-white`}
        >
            <Head title={lang === 'id' ? 'Kelola Akun & Hak Akses' : 'User Management'} />

            <LeanHeader activePage="users" />

            <main className="mx-auto w-full max-w-[1600px] 2xl:max-w-[1760px] flex-1 space-y-5 px-4 pt-6 sm:px-6 lg:px-8">
                {/* Header Banner & Breadcrumbs */}
                <div
                    className={`rounded-2xl p-5 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border shadow-lg transition-colors liquid-glass-card`}
                >
                    <div className="flex items-center gap-4">
                        <Link
                            href="/profile"
                            className={`p-2.5 rounded-xl border transition-all cursor-pointer shadow-xs ${
                                isDark
                                    ? 'bg-slate-800/90 hover:bg-emerald-600 hover:text-white hover:border-emerald-500 text-slate-300 border-slate-700'
                                    : 'bg-slate-100 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 text-slate-600 border-slate-200'
                            }`}
                            title={lang === 'id' ? 'Kembali ke Profile' : 'Back to Profile'}
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h1
                                    className={`text-xl sm:text-2xl font-extrabold tracking-tight ${
                                        isDark ? 'text-white' : 'text-slate-900'
                                    }`}
                                >
                                    {lang === 'id' ? 'Manajemen Pengguna & Hak Akses' : 'User Management & Permissions'}
                                </h1>
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white keep-white shadow-xs">
                                    ADMIN HUB
                                </span>
                            </div>
                            <p className={`text-xs sm:text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {lang === 'id'
                                    ? 'Kelola akun staf, wewenang departemen, hak akses, dan pantau riwayat keamanan resort'
                                    : 'Manage staff credentials, department scopes, access permissions, and security audit logs'}
                            </p>
                        </div>
                    </div>

                    {/* Top Action Buttons */}
                    <div className="flex items-center gap-2.5 w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={handleCreateUser}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                        >
                            <Plus className="h-4 w-4" />
                            <span>{lang === 'id' ? 'Tambah Akun' : 'New User'}</span>
                        </button>
                    </div>
                </div>

                {/* Primary Tab Navigation: Users Management vs Audit Trail & Spreadsheet */}
                <div
                    className={`grid grid-cols-2 sm:flex sm:items-center gap-2 border-b pb-3 ${
                        isDark ? 'border-white/10' : 'border-slate-200/70'
                    }`}
                >
                    <button
                        type="button"
                        onClick={() => setActiveMainTab('users')}
                        className={`flex items-center justify-center sm:justify-start gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer border ${
                            activeMainTab === 'users'
                                ? 'bg-emerald-600 border-emerald-500 text-white keep-white shadow-md shadow-emerald-600/20'
                                : isDark
                                    ? 'liquid-glass-subtle text-slate-300 hover:text-white'
                                    : 'liquid-glass-subtle text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <UsersIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{lang === 'id' ? 'Daftar Pengguna' : 'Users Directory'}</span>
                        <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                                activeMainTab === 'users'
                                    ? 'bg-white/20 text-white keep-white'
                                    : isDark
                                        ? 'bg-slate-800 text-emerald-400'
                                        : 'bg-emerald-50 text-emerald-700'
                            }`}
                        >
                            {stats.total_users ?? 0}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveMainTab('audit')}
                        className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer border ${
                            activeMainTab === 'audit'
                                ? 'bg-emerald-600 border-emerald-500 text-white keep-white shadow-md shadow-emerald-600/20'
                                : isDark
                                    ? 'liquid-glass-subtle text-slate-300 hover:text-white'
                                    : 'liquid-glass-subtle text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Activity className={`h-4 w-4 shrink-0 ${activeMainTab === 'audit' ? 'text-white' : 'text-emerald-500'}`} />
                        <span className="truncate">{lang === 'id' ? 'Audit & Sheets' : 'Audit Trail'}</span>
                        <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black shrink-0 ${
                                activeMainTab === 'audit'
                                    ? 'bg-white/20 text-white keep-white'
                                    : isDark
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                        >
                            LIVE SYNC
                        </span>
                    </button>
                </div>

                {activeMainTab === 'users' ? (
                    <>
                        {/* Quick Stats Grid - 4 Balanced Columns, All Clickable with Two-Way Filter Sync */}
                        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {/* Total Akun Stat Card */}
                            <div
                                onClick={() => {
                                    setStatusFilter('active');
                                    setRoleFilter('all');
                                }}
                                className={`rounded-2xl border p-3.5 space-y-1 cursor-pointer transition-all hover:scale-[1.01] liquid-glass-card liquid-glass-interactive ${
                                    statusFilter === 'active' && roleFilter === 'all'
                                        ? 'liquid-glass-tint-emerald outline-2 outline-emerald-500 -outline-offset-2'
                                        : ''
                                }`}
                                title={lang === 'id' ? 'Klik untuk tampilkan semua akun aktif' : 'Click to show all active accounts'}
                            >
                                <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center justify-between ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    <span>{lang === 'id' ? 'Total Akun' : 'Total Accounts'}</span>
                                    {statusFilter === 'active' && roleFilter === 'all' && (
                                        <span className="text-[9px] font-black bg-emerald-600 text-white keep-white px-1.5 py-0.5 rounded">
                                            AKTIF
                                        </span>
                                    )}
                                </div>
                                <div className={`text-xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{stats.total_users ?? 0}</div>
                            </div>

                            {/* Admin Stat Card */}
                            <div
                                onClick={() => {
                                    if (roleFilter === 'admin' && statusFilter === 'active') {
                                        setRoleFilter('all');
                                    } else {
                                        setStatusFilter('active');
                                        setRoleFilter('admin');
                                    }
                                }}
                                className={`rounded-2xl border p-3.5 space-y-1 cursor-pointer transition-all hover:scale-[1.01] liquid-glass-card liquid-glass-interactive liquid-glass-tint-emerald ${
                                    roleFilter === 'admin' && statusFilter === 'active'
                                        ? 'outline-2 outline-emerald-400 -outline-offset-2'
                                        : ''
                                }`}
                                title={lang === 'id' ? 'Klik untuk filter akun Administrator' : 'Click to filter Administrator accounts'}
                            >
                                <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center justify-between ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                                    <span>Admin</span>
                                    {roleFilter === 'admin' && statusFilter === 'active' && (
                                        <span className="text-[9px] font-black bg-emerald-600 text-white keep-white px-1.5 py-0.5 rounded">
                                            AKTIF
                                        </span>
                                    )}
                                </div>
                                <div className={`text-xl font-extrabold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>{stats.total_admins ?? 0}</div>
                            </div>

                            {/* User Biasa / Departemen Stat Card */}
                            <div
                                onClick={() => {
                                    if (roleFilter === 'department' && statusFilter === 'active') {
                                        setRoleFilter('all');
                                    } else {
                                        setStatusFilter('active');
                                        setRoleFilter('department');
                                    }
                                }}
                                className={`rounded-2xl border p-3.5 space-y-1 cursor-pointer transition-all hover:scale-[1.01] liquid-glass-card liquid-glass-interactive liquid-glass-tint-sky ${
                                    roleFilter === 'department' && statusFilter === 'active'
                                        ? 'outline-2 outline-sky-400 -outline-offset-2'
                                        : ''
                                }`}
                                title={lang === 'id' ? 'Klik untuk filter akun User Biasa / Departemen' : 'Click to filter Department accounts'}
                            >
                                <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center justify-between ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                                    <span>{lang === 'id' ? 'User Biasa / Staf' : 'Department Staff'}</span>
                                    {roleFilter === 'department' && statusFilter === 'active' && (
                                        <span className="text-[9px] font-black bg-sky-600 text-white keep-white px-1.5 py-0.5 rounded">
                                            AKTIF
                                        </span>
                                    )}
                                </div>
                                <div className={`text-xl font-extrabold ${isDark ? 'text-sky-300' : 'text-sky-700'}`}>{stats.total_departments ?? 0}</div>
                            </div>

                            {/* Di-Archive Stat Card */}
                            <div
                                onClick={() => {
                                    if (statusFilter === 'archived') {
                                        setStatusFilter('active');
                                    } else {
                                        setStatusFilter('archived');
                                    }
                                }}
                                className={`rounded-2xl border p-3.5 space-y-1 cursor-pointer transition-all hover:scale-[1.01] liquid-glass-card liquid-glass-interactive ${
                                    statusFilter === 'archived'
                                        ? 'liquid-glass-tint-rose outline-2 outline-rose-400 -outline-offset-2'
                                        : ''
                                }`}
                                title={lang === 'id' ? 'Klik untuk filter akun yang di-archive' : 'Click to filter archived accounts'}
                            >
                                <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center justify-between ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    <span>Di-Archive</span>
                                    {statusFilter === 'archived' && (
                                        <span className="text-[9px] font-black bg-rose-600 text-white keep-white px-1.5 py-0.5 rounded">
                                            AKTIF
                                        </span>
                                    )}
                                </div>
                                <div className={`text-xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{stats.total_archived ?? 0}</div>
                            </div>
                        </div>

                        {/* Filter & Search Bar */}
                        <div
                            className="rounded-2xl border p-3.5 sm:p-4 shadow-lg space-y-3 liquid-glass-card"
                        >
                            {/* Top: Full-Width Search Input */}
                            <div className="relative w-full">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder={lang === 'id' ? 'Cari nama, email, departemen, nomor WA...' : 'Search name, email, department, phone...'}
                                    className={`w-full rounded-xl border pl-10 pr-4 py-2.5 text-xs font-medium focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-colors liquid-glass-control ${
                                        isDark
                                            ? 'text-slate-100 placeholder-slate-500'
                                            : 'text-slate-900 placeholder-slate-400'
                                    }`}
                                />
                            </div>

                            {/* Bottom: Filter Controls & Status Tab */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                                <div className="grid grid-cols-2 gap-2 flex-1">
                                    {/* Role Filter */}
                                    <select
                                        value={roleFilter}
                                        onChange={e => setRoleFilter(e.target.value)}
                                        className={`w-full rounded-xl border px-3 py-2 text-xs font-medium focus:border-emerald-500 focus:outline-none cursor-pointer truncate liquid-glass-control ${
                                            isDark
                                                ? 'text-slate-100'
                                                : 'text-slate-900'
                                        }`}
                                    >
                                        <option value="all">Semua Role</option>
                                        <option value="admin">Administrator</option>
                                        <option value="department">User Biasa / Staf</option>
                                    </select>

                                    {/* Department Filter */}
                                    <select
                                        value={deptFilter}
                                        onChange={e => setDeptFilter(e.target.value)}
                                        className={`w-full rounded-xl border px-3 py-2 text-xs font-medium focus:border-emerald-500 focus:outline-none cursor-pointer truncate liquid-glass-control ${
                                            isDark
                                                ? 'text-slate-100'
                                                : 'text-slate-900'
                                        }`}
                                    >
                                        <option value="all">Semua Dept</option>
                                        {DEPARTMENTS.map(d => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Status Filter Tabs (Aktif / Archived) */}
                                <div
                                    className="flex items-center rounded-xl border p-1 text-xs font-bold shrink-0 liquid-glass-subtle"
                                >
                                    <button
                                        type="button"
                                        onClick={() => setStatusFilter('active')}
                                        className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                                            statusFilter === 'active'
                                                ? 'bg-emerald-600 text-white keep-white shadow-xs'
                                                : isDark
                                                    ? 'text-slate-400 hover:text-white'
                                                    : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        Aktif ({stats.total_users ?? 0})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setStatusFilter('archived')}
                                        className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                                            statusFilter === 'archived'
                                                ? 'bg-emerald-600 text-white keep-white shadow-xs'
                                                : isDark
                                                    ? 'text-slate-400 hover:text-white'
                                                    : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        Archived ({stats.total_archived ?? 0})
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Toast Alert */}
                        {toastMessage && (
                            <div
                                className={`p-4 rounded-xl border shadow-lg flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in slide-in-from-top-2 duration-200 ${
                                    toastMessage.isError
                                        ? isDark
                                            ? 'bg-rose-500/20 border-rose-500/40 text-rose-200'
                                            : 'bg-rose-50 border-rose-200 text-rose-800'
                                        : isDark
                                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    {toastMessage.isError ? (
                                        <AlertCircle className={`h-4 w-4 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} />
                                    ) : (
                                        <CheckCircle2 className={`h-4 w-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                    )}
                                    <span>{toastMessage.text}</span>
                                </div>
                                <button type="button" onClick={() => setToastMessage(null)} className="opacity-70 hover:opacity-100 cursor-pointer">
                                    &times;
                                </button>
                            </div>
                        )}

                        {/* Batch Action Toolbar */}
                        {selectedUserIds.length > 0 && (
                            <div
                                className="rounded-2xl border-2 p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-300 liquid-glass-card liquid-glass-tint-emerald"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white keep-white flex items-center justify-center font-black text-sm shadow-md shrink-0">
                                        {selectedUserIds.length}
                                    </div>
                                    <div>
                                        <div className={`font-extrabold text-sm sm:text-base flex items-center gap-2 flex-wrap ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            <span>
                                                {selectedAdminUsers.length > 0 && selectedDeptUsers.length > 0
                                                    ? `${selectedUserIds.length} Akun Dipilih (${selectedDeptUsers.length} Staf, ${selectedAdminUsers.length} Admin)`
                                                    : selectedAdminUsers.length > 0
                                                        ? `${selectedAdminUsers.length} Akun Administrator Dipilih`
                                                        : `${selectedDeptUsers.length} Akun Staf Dipilih`}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={handleDeselectAll}
                                                className={`text-xs underline cursor-pointer ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                                            >
                                                Batalkan
                                            </button>
                                        </div>
                                        <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                            {statusFilter === 'archived'
                                                ? 'Pulihkan massal akun yang dipilih agar aktif kembali.'
                                                : selectedAdminUsers.length > 0
                                                    ? 'Akun Administrator memiliki hak penuh inheren dan dilindungi dari pembatasan akses.'
                                                    : 'Ubah izin massal atau archive (soft delete) akun staf terpilih dengan aman.'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                                    {statusFilter === 'archived' ? (
                                        <button
                                            type="button"
                                            onClick={handleBatchRestore}
                                            disabled={batchRestoreLoading}
                                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white keep-white transition-all shadow-md cursor-pointer disabled:opacity-50"
                                        >
                                            <RotateCcw className={`h-4 w-4 ${batchRestoreLoading ? 'animate-spin' : ''}`} />
                                            <span>{batchRestoreLoading ? 'Memulihkan...' : `Pulihkan ${selectedUserIds.length} Akun`}</span>
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => handleQuickToggleViewAllDepts(false)}
                                                disabled={batchQuickProcessing || batchDeleteLoading || selectedDeptUsers.length === 0}
                                                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed ${
                                                    isDark
                                                        ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300'
                                                        : 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800'
                                                }`}
                                                title={selectedDeptUsers.length === 0 ? 'Akun Administrator tidak dapat dibatasi departemennya' : "Matikan 'Bisa Melihat Semua Departemen' untuk staf terpilih"}
                                            >
                                                <Lock className="h-3.5 w-3.5" />
                                                <span>Batasi Dept (OFF)</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleQuickToggleViewAllDepts(true)}
                                                disabled={batchQuickProcessing || batchDeleteLoading || selectedDeptUsers.length === 0}
                                                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed ${
                                                    isDark
                                                        ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/40 text-emerald-300'
                                                        : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800'
                                                }`}
                                                title={selectedDeptUsers.length === 0 ? 'Akun Administrator sudah memiliki hak akses penuh' : "Nyalakan 'Bisa Melihat Semua Departemen' untuk staf terpilih"}
                                            >
                                                <Check className="h-3.5 w-3.5" />
                                                <span>Buka Semua (ON)</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (selectedDeptUsers.length === 0) {
                                                        showToast(lang === 'id' ? 'Akun Administrator memiliki hak akses penuh inheren dan tidak dapat diubah izinnya via matriks staf.' : 'Administrator accounts have full inherent permissions.', true);
                                                        return;
                                                    }
                                                    setIsBatchModalOpen(true);
                                                }}
                                                disabled={batchQuickProcessing || batchDeleteLoading || selectedDeptUsers.length === 0}
                                                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white keep-white transition-all shadow-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                                title={selectedDeptUsers.length === 0 ? 'Izin Administrator tidak dapat diubah via matriks staf' : 'Atur hak akses granular staf terpilih'}
                                            >
                                                <ShieldCheck className="h-4 w-4" />
                                                <span>Atur Izin...</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (effectiveDeleteCount === 0) {
                                                        showToast(lang === 'id' ? 'Akun Administrator dan akun sendiri dilindungi dari penghapusan massal.' : 'Administrator accounts and your own account are protected from batch deletion.', true);
                                                        return;
                                                    }
                                                    setIsBatchDeleteModalOpen(true);
                                                }}
                                                disabled={batchQuickProcessing || batchDeleteLoading || effectiveDeleteCount === 0}
                                                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                                    isDark
                                                        ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/40 text-rose-300'
                                                        : 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700'
                                                }`}
                                                title={effectiveDeleteCount === 0 ? 'Akun yang dipilih dilindungi dari penghapusan massal' : `Archive ${effectiveDeleteCount} akun staf yang dipilih`}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                <span>Hapus / Archive ({effectiveDeleteCount})</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Mobile View: Responsive Card List (block md:hidden) */}
                        <div className="block md:hidden space-y-3">
                            {users.length > 0 && (
                                <div className={`flex items-center justify-between px-2 py-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    <label className={`flex items-center gap-2 cursor-pointer font-bold select-none ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                        <input
                                            type="checkbox"
                                            checked={isAllSelected}
                                            ref={el => { if (el) el.indeterminate = isSomeSelected; }}
                                            onChange={handleSelectAll}
                                            className={`w-4 h-4 rounded text-emerald-600 accent-emerald-600 focus:ring-emerald-500 cursor-pointer ${
                                                isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white'
                                            }`}
                                        />
                                        <span>
                                            {isAllSelected
                                                ? 'Batalkan Semua'
                                                : statusFilter === 'active'
                                                    ? 'Pilih Semua Staf'
                                                    : 'Pilih Semua Akun'}
                                        </span>
                                    </label>
                                    <span className="text-[11px] font-medium">{users.length} akun</span>
                                </div>
                            )}

                            {loading && users.length === 0 ? (
                                <div
                                    className={`rounded-2xl border p-8 text-center liquid-glass-card ${
                                        isDark ? 'text-slate-400' : 'text-slate-500'
                                    }`}
                                >
                                    <RefreshCw className="h-6 w-6 animate-spin text-emerald-500 mx-auto mb-2" />
                                    <span>Memuat daftar akun...</span>
                                </div>
                            ) : users.length === 0 ? (
                                <div
                                    className={`rounded-2xl border p-8 text-center space-y-2 liquid-glass-card ${
                                        isDark ? 'text-slate-400' : 'text-slate-500'
                                    }`}
                                >
                                    <UsersIcon className={`h-8 w-8 mx-auto ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
                                    <div>Tidak ada akun yang sesuai dengan filter.</div>
                                </div>
                            ) : (
                                users.map(u => {
                                    const deptTheme = u.department ? getDepartmentTheme(u.department) : { bg: '#059669', text: '#FFFFFF' };
                                    const isMe = u.id === currentUser?.id;
                                    const isSelected = selectedUserIds.includes(u.id);

                                    return (
                                        <div
                                            key={u.id}
                                            className={`rounded-2xl border transition-all p-3.5 space-y-2.5 shadow-sm liquid-glass-card liquid-glass-interactive ${
                                                isSelected
                                                    ? 'liquid-glass-tint-emerald outline-2 outline-emerald-500 -outline-offset-2'
                                                    : u.is_archived
                                                        ? 'liquid-glass-tint-rose opacity-85'
                                                        : ''
                                            }`}
                                        >
                                            {/* Top Row */}
                                            <div className="flex items-start justify-between gap-2.5">
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleSelectUser(u.id)}
                                                        className={`w-4 h-4 rounded text-emerald-600 accent-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0 mt-0.5 ${
                                                            isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white'
                                                        }`}
                                                    />
                                                    <div
                                                        className="w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-sm shrink-0 border border-white/10 shadow-xs overflow-hidden"
                                                        style={{ backgroundColor: deptTheme.bg, color: deptTheme.text }}
                                                    >
                                                        {(u.avatar_url || (u.avatar ? (u.avatar.startsWith('http') ? u.avatar : `/uploads/avatars/${u.avatar}`) : null)) ? (
                                                            <img
                                                                src={u.avatar_url || (u.avatar.startsWith('http') ? u.avatar : `/uploads/avatars/${u.avatar}`)}
                                                                alt={u.name}
                                                                className="w-full h-full object-cover rounded-xl"
                                                            />
                                                        ) : (
                                                            u.name.charAt(0).toUpperCase()
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className={`font-bold text-sm flex items-center gap-1.5 flex-wrap leading-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                                            <span className="truncate">{u.staff_name || u.name}</span>
                                                            {isMe && (
                                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-600 text-white keep-white">
                                                                    YOU
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className={`text-[11px] truncate mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                            {u.email}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Role Badge */}
                                                <div className="shrink-0">
                                                    {u.role === 'admin' ? (
                                                        <span
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold border ${
                                                                isDark
                                                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                            }`}
                                                        >
                                                            <ShieldCheck className="h-3 w-3" />
                                                            Admin
                                                        </span>
                                                    ) : (
                                                        <span
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                                                isDark
                                                                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                                                    : 'bg-sky-50 text-sky-700 border-sky-200'
                                                            }`}
                                                        >
                                                            <Building2 className="h-3 w-3" />
                                                            Dept
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Middle Row */}
                                            <div className={`flex items-center justify-between gap-2 pt-1.5 border-t text-xs ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                                                <div className="min-w-0">
                                                    {u.department ? (
                                                        <SubdivisionTag
                                                            department={u.department}
                                                            subdivision={u.subdivision}
                                                            size="xs"
                                                        />
                                                    ) : (
                                                        <span className={`italic text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Semua Dept</span>
                                                    )}
                                                </div>

                                                <div>
                                                    {u.whatsapp_number ? (
                                                        <div className={`flex items-center gap-1 text-[11px] font-mono ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                                                            <Phone className="h-3 w-3" />
                                                            <span>{u.whatsapp_number}</span>
                                                        </div>
                                                    ) : (
                                                        <span className={`text-[10px] italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No WA</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Bottom Row */}
                                            <div className={`flex items-center justify-between gap-1 pt-1.5 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-100'}`}>
                                                <div className="flex items-center gap-1 text-[10px]">
                                                    {u.is_archived && (
                                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isDark ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-100 text-rose-800'}`}>Archived</span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleResetPassword(u)}
                                                        title="Reset Password 1-Klik"
                                                        className={`p-1.5 rounded-lg transition-all ${
                                                            isDark
                                                                ? 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800 cursor-pointer'
                                                                : 'text-slate-500 hover:text-emerald-700 hover:bg-slate-100 cursor-pointer'
                                                        }`}
                                                    >
                                                        <KeyRound className="h-3.5 w-3.5" />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleEditUser(u)}
                                                        title="Edit Akun & Izin"
                                                        className={`p-1.5 rounded-lg transition-all ${
                                                            isDark
                                                                ? 'text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer'
                                                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer'
                                                        }`}
                                                    >
                                                        <Edit className="h-3.5 w-3.5" />
                                                    </button>

                                                    {u.is_archived ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRestoreUser(u)}
                                                            title="Pulihkan Akun Ini"
                                                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                                                isDark ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-emerald-700 hover:bg-emerald-50'
                                                            }`}
                                                        >
                                                            <RotateCcw className="h-3.5 w-3.5" />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleArchiveUser(u)}
                                                            disabled={isMe}
                                                            title={isMe ? 'Anda tidak dapat meng-archive akun sendiri' : 'Archive (Soft Delete) Akun'}
                                                            className={`p-1.5 rounded-lg transition-all ${
                                                                isMe
                                                                    ? 'text-slate-500 cursor-not-allowed opacity-40'
                                                                    : isDark
                                                                        ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 cursor-pointer'
                                                                        : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
                                                            }`}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Desktop View: Compact Table (hidden md:block) */}
                        <div
                            className="hidden md:block rounded-2xl border shadow-xl overflow-hidden liquid-glass-card"
                        >
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr
                                            className={`border-b uppercase tracking-wider font-bold ${
                                                isDark
                                                    ? 'border-slate-800 bg-slate-950/70 text-slate-400'
                                                    : 'border-slate-200 bg-slate-50 text-slate-500'
                                            }`}
                                        >
                                            <th className="w-12 py-3.5 px-3 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={isAllSelected}
                                                    ref={el => { if (el) el.indeterminate = isSomeSelected; }}
                                                    onChange={handleSelectAll}
                                                    className={`w-4 h-4 rounded text-emerald-600 accent-emerald-600 focus:ring-emerald-500 cursor-pointer ${
                                                        isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white'
                                                    }`}
                                                    title={isAllSelected ? 'Batalkan semua pilihan' : statusFilter === 'active' ? 'Pilih semua staf departemen (Akun Admin dikecualikan)' : 'Pilih semua akun'}
                                                />
                                            </th>
                                            <th className="py-3.5 px-4">Pengguna / Nama Staf</th>
                                            <th className="py-3.5 px-4">Peran (Role)</th>
                                            <th className="py-3.5 px-4">Departemen / Unit</th>
                                            <th className="py-3.5 px-4">WhatsApp Bot</th>
                                            <th className="py-3.5 px-4 text-right">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className={`divide-y ${isDark ? 'divide-slate-800/80' : 'divide-slate-100'}`}>
                                        {loading && users.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className={`py-16 text-center ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                    <RefreshCw className="h-6 w-6 animate-spin text-emerald-500 mx-auto mb-2" />
                                                    <span>Memuat daftar akun...</span>
                                                </td>
                                            </tr>
                                        ) : users.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className={`py-16 text-center space-y-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                    <UsersIcon className={`h-8 w-8 mx-auto ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
                                                    <div>Tidak ada akun yang sesuai dengan filter.</div>
                                                </td>
                                            </tr>
                                        ) : (
                                            users.map(u => {
                                                const deptTheme = u.department ? getDepartmentTheme(u.department) : { bg: '#059669', text: '#FFFFFF' };
                                                const isMe = u.id === currentUser?.id;
                                                const isSelected = selectedUserIds.includes(u.id);

                                                return (
                                                    <tr
                                                        key={u.id}
                                                        className={`transition-colors ${
                                                            isSelected
                                                                ? isDark ? 'bg-emerald-500/15' : 'bg-emerald-50/90'
                                                                : u.is_archived
                                                                    ? isDark ? 'opacity-65 bg-rose-950/15' : 'opacity-70 bg-rose-50/40'
                                                                    : isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50/90'
                                                        }`}
                                                    >
                                                        <td className="w-12 py-3 px-3 text-center" onClick={e => e.stopPropagation()}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => handleSelectUser(u.id)}
                                                                className={`w-4 h-4 rounded text-emerald-600 accent-emerald-600 focus:ring-emerald-500 cursor-pointer ${
                                                                    isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white'
                                                                }`}
                                                            />
                                                        </td>

                                                        {/* User & Staff Name */}
                                                        <td className="py-3 px-4">
                                                            <div className="flex items-center gap-3">
                                                                <div
                                                                    className="w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-sm shrink-0 border border-white/10 shadow-xs overflow-hidden"
                                                                    style={{ backgroundColor: deptTheme.bg, color: deptTheme.text }}
                                                                >
                                                                    {(u.avatar_url || (u.avatar ? (u.avatar.startsWith('http') ? u.avatar : `/uploads/avatars/${u.avatar}`) : null)) ? (
                                                                        <img
                                                                            src={u.avatar_url || (u.avatar.startsWith('http') ? u.avatar : `/uploads/avatars/${u.avatar}`)}
                                                                            alt={u.name}
                                                                            className="w-full h-full object-cover rounded-xl"
                                                                        />
                                                                    ) : (
                                                                        u.name.charAt(0).toUpperCase()
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className={`font-bold text-sm flex items-center gap-2 flex-wrap ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                                                        <span>{u.staff_name || u.name}</span>
                                                                        {isMe && (
                                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-600 text-white keep-white">
                                                                                YOU
                                                                            </span>
                                                                        )}
                                                                        {u.is_archived && (
                                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-rose-100 text-rose-800 border-rose-300'}`}>
                                                                                ARCHIVED
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                        {u.email}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {/* Role */}
                                                        <td className="py-3 px-4">
                                                            {u.role === 'admin' ? (
                                                                <span
                                                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                                                        isDark
                                                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                                                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                    }`}
                                                                >
                                                                    <ShieldCheck className="h-3.5 w-3.5" />
                                                                    Administrator
                                                                </span>
                                                            ) : (
                                                                <span
                                                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                                                        isDark
                                                                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                                                            : 'bg-sky-50 text-sky-700 border-sky-200'
                                                                    }`}
                                                                >
                                                                    <Building2 className="h-3.5 w-3.5" />
                                                                    Department
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* Department & Subdiv */}
                                                        <td className="py-3 px-4">
                                                            {u.department ? (
                                                                <SubdivisionTag
                                                                    department={u.department}
                                                                    subdivision={u.subdivision}
                                                                    size="sm"
                                                                />
                                                            ) : (
                                                                <span className={`italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Semua Departemen</span>
                                                            )}
                                                        </td>

                                                        {/* WhatsApp status */}
                                                        <td className="py-3 px-4">
                                                            {u.whatsapp_number ? (
                                                                <div className={`flex items-center gap-1.5 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                                                    <Phone className="h-3.5 w-3.5 text-emerald-500" />
                                                                    <span className="font-mono text-[11px] font-medium">{u.whatsapp_number}</span>
                                                                </div>
                                                            ) : (
                                                                <span className={`text-[11px] italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Belum terhubung</span>
                                                            )}
                                                        </td>

                                                        {/* Actions */}
                                                        <td className="py-3 px-4 text-right">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleResetPassword(u)}
                                                                    title="Reset Password 1-Klik"
                                                                    className={`p-1.5 rounded-lg transition-all ${
                                                                        isDark
                                                                            ? 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800 cursor-pointer'
                                                                            : 'text-slate-500 hover:text-emerald-700 hover:bg-slate-100 cursor-pointer'
                                                                    }`}
                                                                >
                                                                    <KeyRound className="h-4 w-4" />
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleEditUser(u)}
                                                                    title="Edit Akun & Izin"
                                                                    className={`p-1.5 rounded-lg transition-all ${
                                                                        isDark
                                                                            ? 'text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer'
                                                                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer'
                                                                    }`}
                                                                >
                                                                    <Edit className="h-4 w-4" />
                                                                </button>

                                                                {u.is_archived ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRestoreUser(u)}
                                                                        title="Pulihkan Akun Ini"
                                                                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                                                            isDark ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-emerald-700 hover:bg-emerald-50'
                                                                        }`}
                                                                    >
                                                                        <RotateCcw className="h-4 w-4" />
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleArchiveUser(u)}
                                                                        disabled={isMe}
                                                                        title={isMe ? 'Anda tidak dapat meng-archive akun sendiri' : 'Archive (Soft Delete) Akun'}
                                                                        className={`p-1.5 rounded-lg transition-all ${
                                                                            isMe
                                                                                ? 'text-slate-500 cursor-not-allowed opacity-40'
                                                                                : isDark
                                                                                    ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 cursor-pointer'
                                                                                    : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
                                                                        }`}
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                ) : (
                    <AuditTrailTab />
                )}
            </main>

            {/* Mobile Bottom Navigation */}
            <MobileBottomNav currentTab="users" />

            {/* User Modal (Create & Edit) */}
            <UserModal
                isOpen={isUserModalOpen}
                onClose={() => setIsUserModalOpen(false)}
                user={selectedUser}
                onSaved={() => {
                    showToast(selectedUser ? 'Akun berhasil diperbarui' : 'Akun baru berhasil dibuat');
                    fetchUsers();
                }}
            />

            {/* Batch Permissions Modal */}
            <BatchPermissionsModal
                isOpen={isBatchModalOpen}
                onClose={() => setIsBatchModalOpen(false)}
                selectedUsers={users.filter(u => selectedUserIds.includes(u.id) && u.role !== 'admin')}
                onBatchSuccess={handleBatchSuccess}
                showToast={showToast}
            />

            {/* Batch Delete Confirmation Modal */}
            {isBatchDeleteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
                    <div
                        className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl space-y-4 liquid-glass-modal ${
                            isDark ? 'liquid-glass-dark text-slate-100' : 'liquid-glass-light text-slate-900'
                        }`}
                    >
                        <div className="flex items-center gap-3 text-rose-500">
                            <div
                                className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
                                    isDark ? 'bg-rose-500/15 border-rose-500/30 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-600'
                                }`}
                            >
                                <Trash2 className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className={`text-base font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    Archive (Soft Delete) Akun Massal
                                </h3>
                                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Konfirmasi penonaktifan akun terpilih
                                </p>
                            </div>
                        </div>

                        <div
                            className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                                isDark ? 'bg-rose-950/30 border-rose-500/30 text-slate-200' : 'bg-rose-50 border-rose-200 text-slate-800'
                            }`}
                        >
                            <p>
                                Anda akan meng-archive <strong className={`font-bold ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>{effectiveDeleteCount} akun</strong>.
                            </p>
                            <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                Akun yang di-archive tidak dapat login ke sistem lagi, namun seluruh riwayat isu, log penugasan, dan tiket tetap aman di database (Soft Delete). Anda dapat memulihkannya kapan saja di tab <strong>Archived</strong>.
                            </p>
                        </div>

                        {selectedIncludesSelf && (
                            <div
                                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                                    isDark ? 'bg-amber-500/15 border-amber-500/40 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-900'
                                }`}
                            >
                                <AlertCircle className={`h-4 w-4 shrink-0 mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                                <div>
                                    <span className={`font-bold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>Proteksi Keamanan:</span> Akun Anda sendiri ({currentUser?.name || 'Administrator'}) otomatis dilewati dan tidak akan di-archive.
                                </div>
                            </div>
                        )}

                        {selectedAdminUsers.length > 0 && (
                            <div
                                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                                    isDark ? 'bg-sky-500/15 border-sky-500/40 text-sky-200' : 'bg-sky-50 border-sky-200 text-sky-900'
                                }`}
                            >
                                <ShieldCheck className={`h-4 w-4 shrink-0 mt-0.5 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
                                <div>
                                    <span className={`font-bold ${isDark ? 'text-sky-300' : 'text-sky-800'}`}>Proteksi Administrator:</span> {selectedAdminUsers.length} akun Administrator otomatis dilindungi dan tidak dapat di-archive secara massal.
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsBatchDeleteModalOpen(false)}
                                disabled={batchDeleteLoading}
                                className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer disabled:opacity-50 ${
                                    isDark
                                        ? 'border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800'
                                        : 'border-slate-300 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmBatchDelete}
                                disabled={batchDeleteLoading || effectiveDeleteCount === 0}
                                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white keep-white text-xs font-extrabold shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                {batchDeleteLoading ? (
                                    <>
                                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                        <span>Memproses...</span>
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="h-3.5 w-3.5" />
                                        <span>Ya, Archive ({effectiveDeleteCount})</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
