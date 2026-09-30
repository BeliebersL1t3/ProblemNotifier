import { useState, useEffect } from 'react';
import axios from 'axios';
import { Head, Link } from '@inertiajs/react';
import { 
    Users as UsersIcon, Plus, Search, Shield, ShieldCheck, ShieldAlert, 
    KeyRound, Building2, Phone, CheckCircle2, AlertCircle, Edit, Trash2, 
    RefreshCw, RotateCcw, Activity, Eye, Filter, Lock, ArrowLeft,
    Check, CheckSquare, Square, MinusSquare, FileSpreadsheet
} from 'lucide-react';

import { IssuesProvider } from '@/context/IssuesContext';
import { useLanguage } from '@/context/LanguageContext';
import { CampusFixHeader } from '@/Components/CampusFix/CampusFixHeader';
import { MobileBottomNav } from '@/Components/CampusFix/MobileBottomNav';
import { useAuth } from '@/hooks/useAuth';
import { UserModal } from '@/Components/Users/UserModal';
import { AuditTrailTab } from '@/Components/Users/AuditTrailTab';
import { BatchPermissionsModal } from '@/Components/Users/BatchPermissionsModal';
import { DEPARTMENTS, getDepartmentTheme } from '@/constants/departments';
import SubdivisionTag from '@/Components/CampusFix/SubdivisionTag';

export default function UsersPage({ initialUsers = [], initialStats = {} }) {
    return (
        <IssuesProvider>
            <UsersInner initialUsers={initialUsers} initialStats={initialStats} />
        </IssuesProvider>
    );
}

function UsersInner({ initialUsers, initialStats }) {
    const { lang } = useLanguage();
    const { user: currentUser } = useAuth();

    const [users, setUsers] = useState(initialUsers);
    const [stats, setStats] = useState(initialStats);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [deptFilter, setDeptFilter] = useState('all');
    const [hodFilter, setHodFilter] = useState(false);
    const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'archived' | 'all'
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

    // Selection helpers: in archived tab, selectable are archived; in active tab, active accounts; in all tab, all accounts
    const selectableUsers = statusFilter === 'archived'
        ? users.filter(u => u.is_archived)
        : statusFilter === 'active'
            ? users.filter(u => !u.is_archived)
            : users;

    const isAllSelected = selectableUsers.length > 0 && selectableUsers.every(u => selectedUserIds.includes(u.id));
    const isSomeSelected = selectedUserIds.length > 0 && !isAllSelected;

    const selectedIncludesSelf = selectedUserIds.includes(currentUser?.id);
    const effectiveDeleteCount = selectedUserIds.filter(id => id !== currentUser?.id).length;

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
        if (selectedUserIds.length === 0) return;
        setBatchQuickProcessing(true);
        try {
            const res = await axios.post('/api/users/batch-permissions', {
                user_ids: selectedUserIds,
                permissions: {
                    can_view_all_departments: enabled,
                },
            });
            if (res.data?.success) {
                showToast(
                    lang === 'id' 
                        ? `${selectedUserIds.length} akun berhasil ${enabled ? 'diberikan akses' : 'dibatasi dari'} semua departemen.`
                        : `${selectedUserIds.length} accounts successfully ${enabled ? 'granted access to' : 'restricted from'} all departments.`
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
            if (hodFilter) params.append('is_hod', '1');
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
    }, [searchQuery, roleFilter, deptFilter, statusFilter, hodFilter]);

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

    const handleToggleHod = async (targetUser) => {
        try {
            const res = await axios.post(`/api/users/${targetUser.id}/toggle-hod`);
            if (res.data?.success) {
                showToast(res.data.message);
                setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, is_hod: res.data.is_hod } : u));
            } else {
                showToast(res.data?.message || 'Gagal mengubah status HOD', true);
            }
        } catch (e) {
            showToast(e.response?.data?.message || 'Terjadi kesalahan sistem', true);
        }
    };

    return (
        <div className="min-h-screen bg-[#1C1B0E] text-[#FAFAFA] relative overflow-x-hidden selection:bg-[#C9AA71] selection:text-[#1C1B0E]">
            <Head title={lang === 'id' ? 'Kelola Akun & Hak Akses' : 'User Management'} />

            {/* Background Motif Wallpaper */}
            <div className="app-bg-wallpaper" />

            {/* Ambient Glow */}
            <div className="fixed top-12 left-1/2 -translate-x-1/2 w-[800px] h-[350px] pointer-events-none blur-[170px] opacity-15 rounded-full bg-[#C9AA71] z-0" />

            <div className="relative z-10">
                <CampusFixHeader mode="users" />

                <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 sm:py-10 pb-28 md:pb-10">
                    
                    {/* Header Banner & Breadcrumbs */}
                    <div className="rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl border border-white/10 bg-gradient-to-br from-[#2A281E] to-[#1C1B0E]">
                        <div className="flex items-center gap-4">
                            <Link 
                                href="/profile" 
                                className="p-2.5 rounded-xl bg-[#1C1B0E]/80 hover:bg-[#C9AA71] hover:text-[#1C1B0E] text-[#A19F8D] border border-white/10 transition-all cursor-pointer shadow-sm"
                                title="Kembali ke Profile"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </Link>
                            <div>
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#FAFAFA]">
                                        {lang === 'id' ? 'Manajemen Pengguna & Hak Akses' : 'User Management & Permissions'}
                                    </h1>
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#C9AA71] text-[#1C1B0E]">
                                        ADMIN HUB
                                    </span>
                                </div>
                                <p className="text-xs sm:text-sm text-[#A19F8D] mt-1">
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
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#C9AA71] hover:bg-[#b89960] text-[#1C1B0E] transition-all shadow-md hover:shadow-lg cursor-pointer"
                            >
                                <Plus className="h-4 w-4" />
                                <span>{lang === 'id' ? 'Tambah Akun' : 'New User'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Primary Tab Navigation: Users Management vs Audit Trail & Spreadsheet */}
                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 border-b border-[#3B3929] pb-3 mb-6">
                        <button
                            type="button"
                            onClick={() => setActiveMainTab('users')}
                            className={`flex items-center justify-center sm:justify-start gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                                activeMainTab === 'users'
                                    ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-md shadow-[#C9AA71]/20 font-black'
                                    : 'bg-[#2A281E] text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#3B3929] border border-[#3B3929]'
                            }`}
                        >
                            <UsersIcon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{lang === 'id' ? 'Daftar Pengguna' : 'Users Directory'}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                                activeMainTab === 'users' ? 'bg-[#1C1B0E]/20 text-[#1C1B0E]' : 'bg-[#1C1B0E] text-[#C9AA71]'
                            }`}>
                                {stats.total_users ?? 0}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveMainTab('audit')}
                            className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                                activeMainTab === 'audit'
                                    ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-md shadow-[#C9AA71]/20 font-black'
                                    : 'bg-[#2A281E] text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#3B3929] border border-[#3B3929]'
                            }`}
                        >
                            <Activity className={`h-4 w-4 shrink-0 ${activeMainTab === 'audit' ? 'text-[#1C1B0E]' : 'text-emerald-400'}`} />
                            <span className="truncate">{lang === 'id' ? 'Audit & Sheets' : 'Audit Trail'}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black shrink-0 ${
                                activeMainTab === 'audit'
                                    ? 'bg-[#1C1B0E] text-emerald-300'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            }`}>
                                LIVE SYNC
                            </span>
                        </button>
                    </div>

                    {activeMainTab === 'users' ? (
                        <>
                    {/* Quick Stats Grid - 6 Balanced Columns */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="rounded-xl border border-[#3B3929] bg-[#2A281E]/80 p-3.5 space-y-1">
                            <div className="text-[11px] font-bold text-[#A19F8D] uppercase tracking-wider">Total Akun</div>
                            <div className="text-xl font-extrabold text-[#FAFAFA]">{stats.total_users ?? 0}</div>
                        </div>

                        <div className="rounded-xl border border-[#3B3929] bg-[#2A281E]/80 p-3.5 space-y-1">
                            <div className="text-[11px] font-bold text-[#C9AA71] uppercase tracking-wider">Admin</div>
                            <div className="text-xl font-extrabold text-[#C9AA71]">{stats.total_admins ?? 0}</div>
                        </div>

                        <div className="rounded-xl border border-[#3B3929] bg-[#2A281E]/80 p-3.5 space-y-1">
                            <div className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">Departemen</div>
                            <div className="text-xl font-extrabold text-sky-400">{stats.total_departments ?? 0}</div>
                        </div>

                        {/* HOD Stat Card with 1-click Filter Toggle */}
                        <div 
                            onClick={() => {
                                if (roleFilter === 'hod') {
                                    setRoleFilter('all');
                                    setHodFilter(false);
                                } else {
                                    setRoleFilter('all');
                                    setHodFilter(prev => !prev);
                                }
                            }}
                            className={`rounded-xl border p-3.5 space-y-1 cursor-pointer transition-all ${
                                hodFilter || roleFilter === 'hod'
                                    ? 'border-amber-400 bg-amber-500/25 ring-1 ring-amber-400 shadow-md'
                                    : 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15'
                            }`}
                            title="Klik untuk filter hanya akun HOD"
                        >
                            <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                                <span>👑 HOD</span>
                                {(hodFilter || roleFilter === 'hod') && (
                                    <span className="text-[9px] font-black bg-amber-400 text-[#1C1B0E] px-1.5 py-0.2 rounded">
                                        AKTIF
                                    </span>
                                )}
                            </div>
                            <div className="text-xl font-extrabold text-amber-400">{stats.total_hod ?? 0}</div>
                        </div>

                        <div className="rounded-xl border border-[#3B3929] bg-[#2A281E]/80 p-3.5 space-y-1">
                            <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">WA Linked</div>
                            <div className="text-xl font-extrabold text-emerald-400">{stats.total_whatsapp ?? 0}</div>
                        </div>

                        <div className="rounded-xl border border-[#3B3929] bg-[#2A281E]/80 p-3.5 space-y-1">
                            <div className="text-[11px] font-bold text-[#A19F8D] uppercase tracking-wider">Di-Archive</div>
                            <div className="text-xl font-extrabold text-[#A19F8D]">{stats.total_archived ?? 0}</div>
                        </div>
                    </div>

                    {/* Filter & Search Bar - Fully Responsive, 0 Mobile Horizontal Scroll */}
                    <div className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/90 p-3.5 sm:p-4 shadow-xl space-y-3">
                        {/* Top: Full-Width Search Input */}
                        <div className="relative w-full">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A19F8D]" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={lang === 'id' ? 'Cari nama, email, departemen, nomor WA...' : 'Search name, email, department, phone...'}
                                className="w-full rounded-xl bg-[#1C1B0E] border border-[#3B3929] pl-10 pr-4 py-2.5 text-xs font-medium text-[#FAFAFA] placeholder-[#A19F8D] focus:border-[#C9AA71] focus:outline-none transition-colors"
                            />
                        </div>

                        {/* Bottom: Filter Controls & Status Tab without overflow-x scrolling */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                            {/* Role & Department Dropdowns (2 columns on mobile) */}
                            <div className="grid grid-cols-2 gap-2 flex-1">
                                {/* Role Filter */}
                                <select
                                    value={hodFilter ? 'hod' : roleFilter}
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (val === 'hod') {
                                            setRoleFilter('all');
                                            setHodFilter(true);
                                        } else {
                                            setHodFilter(false);
                                            setRoleFilter(val);
                                        }
                                    }}
                                    className="w-full rounded-xl bg-[#1C1B0E] border border-[#3B3929] px-3 py-2 text-xs font-medium text-[#FAFAFA] focus:border-[#C9AA71] focus:outline-none cursor-pointer truncate"
                                >
                                    <option value="all">Semua Role</option>
                                    <option value="admin">Administrator</option>
                                    <option value="department">Department</option>
                                    <option value="viewer">Viewer</option>
                                    <option value="hod">👑 HOD ({stats.total_hod ?? 0})</option>
                                </select>

                                {/* Department Filter */}
                                <select
                                    value={deptFilter}
                                    onChange={e => setDeptFilter(e.target.value)}
                                    className="w-full rounded-xl bg-[#1C1B0E] border border-[#3B3929] px-3 py-2 text-xs font-medium text-[#FAFAFA] focus:border-[#C9AA71] focus:outline-none cursor-pointer truncate"
                                >
                                    <option value="all">Semua Dept</option>
                                    {DEPARTMENTS.map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Status Filter Tabs (Aktif / Archived / Semua) */}
                            <div className="flex items-center rounded-xl border border-[#3B3929] bg-[#1C1B0E] p-1 text-xs font-bold shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('active')}
                                    className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg transition-all text-center ${
                                        statusFilter === 'active' ? 'bg-[#C9AA71] text-[#1C1B0E]' : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                                    }`}
                                >
                                    Aktif
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('archived')}
                                    className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg transition-all text-center ${
                                        statusFilter === 'archived' ? 'bg-[#C9AA71] text-[#1C1B0E]' : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                                    }`}
                                >
                                    Archived
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('all')}
                                    className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg transition-all text-center ${
                                        statusFilter === 'all' ? 'bg-[#C9AA71] text-[#1C1B0E]' : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                                    }`}
                                >
                                    Semua
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Toast Alert */}
                    {toastMessage && (
                        <div className={`p-4 rounded-xl border shadow-lg flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in slide-in-from-top-2 duration-200 ${
                            toastMessage.isError 
                                ? 'bg-red-500/20 border-red-500/40 text-red-200' 
                                : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                        }`}>
                            <div className="flex items-center gap-2">
                                {toastMessage.isError ? <AlertCircle className="h-4 w-4 text-red-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                                <span>{toastMessage.text}</span>
                            </div>
                            <button type="button" onClick={() => setToastMessage(null)} className="opacity-70 hover:opacity-100">
                                &times;
                            </button>
                        </div>
                    )}

                    {/* Batch Action Toolbar */}
                    {selectedUserIds.length > 0 && (
                        <div className="rounded-2xl border-2 border-[#C9AA71]/60 bg-gradient-to-r from-[#2A281E] via-[#332E1C] to-[#1C1B0E] p-4 sm:p-5 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[#C9AA71] text-[#1C1B0E] flex items-center justify-center font-black text-sm shadow-md shrink-0">
                                    {selectedUserIds.length}
                                </div>
                                <div>
                                    <div className="font-extrabold text-sm sm:text-base text-[#FAFAFA] flex items-center gap-2">
                                        <span>{selectedUserIds.length} Akun Dipilih</span>
                                        <button
                                            type="button"
                                            onClick={handleDeselectAll}
                                            className="text-xs text-[#A19F8D] hover:text-[#FAFAFA] underline cursor-pointer"
                                        >
                                            Batalkan
                                        </button>
                                    </div>
                                    <p className="text-xs text-[#A19F8D]">
                                        {statusFilter === 'archived' 
                                            ? 'Pulihkan massal akun yang dipilih agar aktif kembali.' 
                                            : 'Ubah izin massal atau archive (soft delete) akun terpilih dengan aman.'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                                {statusFilter === 'archived' ? (
                                    /* Batch Restore Button */
                                    <button
                                        type="button"
                                        onClick={handleBatchRestore}
                                        disabled={batchRestoreLoading}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md hover:shadow-lg cursor-pointer hover:scale-[1.02] disabled:opacity-50"
                                    >
                                        <RotateCcw className={`h-4 w-4 ${batchRestoreLoading ? 'animate-spin' : ''}`} />
                                        <span>{batchRestoreLoading ? 'Memulihkan...' : `Pulihkan ${selectedUserIds.length} Akun`}</span>
                                    </button>
                                ) : (
                                    <>
                                        {/* Quick Toggle: Batasi ke Departemen Sendiri */}
                                        <button
                                            type="button"
                                            onClick={() => handleQuickToggleViewAllDepts(false)}
                                            disabled={batchQuickProcessing || batchDeleteLoading}
                                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-950/50 hover:bg-amber-900/60 border border-amber-500/40 text-amber-300 hover:text-amber-200 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                                            title="Matikan 'Bisa Melihat Semua Departemen' untuk akun terpilih"
                                        >
                                            <Lock className="h-3.5 w-3.5 text-amber-400" />
                                            <span>Batasi Dept (OFF)</span>
                                        </button>

                                        {/* Quick Toggle: Buka Semua Departemen */}
                                        <button
                                            type="button"
                                            onClick={() => handleQuickToggleViewAllDepts(true)}
                                            disabled={batchQuickProcessing || batchDeleteLoading}
                                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 hover:text-emerald-200 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                                            title="Nyalakan 'Bisa Melihat Semua Departemen' untuk akun terpilih"
                                        >
                                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                                            <span>Buka Semua (ON)</span>
                                        </button>

                                        {/* Granular Batch Permissions Modal Button */}
                                        <button
                                            type="button"
                                            onClick={() => setIsBatchModalOpen(true)}
                                            disabled={batchQuickProcessing || batchDeleteLoading}
                                            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-[#C9AA71] hover:bg-[#b89960] text-[#1C1B0E] transition-all shadow-md hover:shadow-lg cursor-pointer hover:scale-[1.02] disabled:opacity-50"
                                        >
                                            <ShieldCheck className="h-4 w-4" />
                                            <span>Atur Izin...</span>
                                        </button>

                                        {/* Batch Soft Delete Button */}
                                        <button
                                            type="button"
                                            onClick={() => setIsBatchDeleteModalOpen(true)}
                                            disabled={batchQuickProcessing || batchDeleteLoading}
                                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-rose-950/70 hover:bg-rose-900 border border-rose-500/50 text-rose-300 hover:text-rose-100 transition-all shadow-md hover:shadow-lg cursor-pointer hover:scale-[1.02] disabled:opacity-50"
                                            title="Hapus / Archive (Soft Delete) akun yang dipilih"
                                        >
                                            <Trash2 className="h-4 w-4 text-rose-400" />
                                            <span>Hapus / Archive ({selectedUserIds.length})</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Mobile View: Responsive Card List (block md:hidden) - 0 Horizontal Scroll */}
                    <div className="block md:hidden space-y-3">
                        {/* Mobile Select All Header */}
                        {users.length > 0 && (
                            <div className="flex items-center justify-between px-2 py-1 text-xs text-[#A19F8D]">
                                <label className="flex items-center gap-2 cursor-pointer font-bold select-none text-[#FAFAFA]">
                                    <input 
                                        type="checkbox"
                                        checked={isAllSelected}
                                        ref={el => { if (el) el.indeterminate = isSomeSelected; }}
                                        onChange={handleSelectAll}
                                        className="w-4 h-4 rounded border-[#3B3929] bg-[#1C1B0E] text-[#C9AA71] accent-[#C9AA71] focus:ring-[#C9AA71] focus:ring-offset-0 cursor-pointer"
                                    />
                                    <span>{isAllSelected ? 'Batalkan Semua' : 'Pilih Semua Akun'}</span>
                                </label>
                                <span className="text-[11px] font-medium">{users.length} akun</span>
                            </div>
                        )}

                        {loading && users.length === 0 ? (
                            <div className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/90 p-8 text-center text-[#A19F8D]">
                                <RefreshCw className="h-6 w-6 animate-spin text-[#C9AA71] mx-auto mb-2" />
                                <span>Memuat daftar akun...</span>
                            </div>
                        ) : users.length === 0 ? (
                            <div className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/90 p-8 text-center text-[#A19F8D] space-y-2">
                                <UsersIcon className="h-8 w-8 mx-auto text-[#3B3929]" />
                                <div>Tidak ada akun yang sesuai dengan filter.</div>
                            </div>
                        ) : (
                            users.map(u => {
                                const deptTheme = u.department ? getDepartmentTheme(u.department) : { bg: '#C9AA71', text: '#1C1B0E' };
                                const isMe = u.id === currentUser?.id;
                                const isSelected = selectedUserIds.includes(u.id);

                                return (
                                    <div 
                                        key={u.id}
                                        className={`rounded-2xl border transition-all p-3.5 space-y-2.5 shadow-md ${
                                            isSelected 
                                                ? 'border-[#C9AA71] bg-[#C9AA71]/15 ring-1 ring-[#C9AA71]/40' 
                                                : u.is_archived
                                                    ? 'border-red-900/30 bg-red-950/15 opacity-75'
                                                    : 'border-[#3B3929] bg-[#2A281E]/90'
                                        }`}
                                    >
                                        {/* Top Row: Checkbox, Avatar, Name & Role Badge */}
                                        <div className="flex items-start justify-between gap-2.5">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <input 
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleSelectUser(u.id)}
                                                    className="w-4 h-4 rounded border-[#3B3929] bg-[#1C1B0E] text-[#C9AA71] accent-[#C9AA71] focus:ring-[#C9AA71] cursor-pointer shrink-0 mt-0.5"
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
                                                    <div className="font-bold text-sm text-[#FAFAFA] flex items-center gap-1.5 flex-wrap leading-tight">
                                                        <span className="truncate">{u.staff_name || u.name}</span>
                                                        {isMe && (
                                                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-[#C9AA71] text-[#1C1B0E]">
                                                                YOU
                                                            </span>
                                                        )}
                                                        {u.is_hod && (
                                                            <span 
                                                                className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                                                title={u.hod_title || 'Head of Department'}
                                                            >
                                                                👑 HOD
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] text-[#A19F8D] truncate mt-0.5">
                                                        {u.email}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Role Badge */}
                                            <div className="shrink-0">
                                                {u.role === 'admin' ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-[#C9AA71]/20 text-[#C9AA71] border border-[#C9AA71]/40">
                                                        <ShieldCheck className="h-3 w-3" />
                                                        Admin
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                                                        <Building2 className="h-3 w-3" />
                                                        Dept
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Middle Row: Department Tag & WhatsApp */}
                                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#3B3929]/50 text-xs">
                                            <div className="min-w-0">
                                                {u.department ? (
                                                    <SubdivisionTag
                                                        department={u.department}
                                                        subdivision={u.subdivision}
                                                        size="xs"
                                                    />
                                                ) : (
                                                    <span className="text-[#A19F8D] italic text-[11px]">Semua Dept</span>
                                                )}
                                            </div>

                                            <div>
                                                {u.whatsapp_number ? (
                                                    <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                                                        <Phone className="h-3 w-3" />
                                                        <span>+{u.whatsapp_number}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[#A19F8D]/50 text-[10px] italic">No WA</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Bottom Row: Status tags & Actions */}
                                        <div className="flex items-center justify-between gap-1 pt-1 border-t border-[#3B3929]/40">
                                            <div className="flex items-center gap-1 text-[10px]">
                                                {u.approval_status === 'pending_hod' && (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300">Pending HOD</span>
                                                )}
                                                {u.approval_status === 'pending_admin' && (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 text-sky-300">Pending Admin</span>
                                                )}
                                                {u.approval_status === 'rejected' && (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-300">Ditolak</span>
                                                )}
                                                {u.is_archived && (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-300">Archived</span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-1">
                                                {/* Quick Reset Password */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleResetPassword(u)}
                                                    title="Reset Password 1-Klik"
                                                    className="p-1.5 rounded-lg text-[#A19F8D] hover:text-[#C9AA71] hover:bg-[#1C1B0E] transition-all cursor-pointer"
                                                >
                                                    <KeyRound className="h-3.5 w-3.5" />
                                                </button>

                                                {/* Edit */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleEditUser(u)}
                                                    title="Edit Akun & Izin"
                                                    className="p-1.5 rounded-lg text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#1C1B0E] transition-all cursor-pointer"
                                                >
                                                    <Edit className="h-3.5 w-3.5" />
                                                </button>

                                                {/* Quick Toggle HOD */}
                                                {u.role !== 'admin' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleHod(u)}
                                                        title={u.is_hod ? `Cabut Status HOD (${u.staff_name || u.name})` : `Jadikan HOD Departemen (${u.staff_name || u.name})`}
                                                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                                            u.is_hod 
                                                                ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10' 
                                                                : 'text-[#A19F8D] hover:text-amber-400 hover:bg-[#1C1B0E]'
                                                        }`}
                                                    >
                                                        <span className="text-xs">👑</span>
                                                    </button>
                                                )}

                                                {/* Archive (Soft Delete) or Restore */}
                                                {u.is_archived ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRestoreUser(u)}
                                                        title="Pulihkan Akun Ini"
                                                        className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/20 transition-all cursor-pointer"
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
                                                                ? 'text-gray-600 cursor-not-allowed opacity-40' 
                                                                : 'text-[#A19F8D] hover:text-red-400 hover:bg-red-500/10 cursor-pointer'
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

                    {/* Desktop View: Compact Table (hidden md:block) - No Barrier Column */}
                    <div className="hidden md:block rounded-2xl border border-[#3B3929] bg-[#2A281E]/90 shadow-2xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="border-b border-[#3B3929] bg-[#1C1B0E]/80 text-[#A19F8D] uppercase tracking-wider font-bold">
                                        <th className="w-12 py-3.5 px-3 text-center">
                                            <input 
                                                type="checkbox"
                                                checked={isAllSelected}
                                                ref={el => { if (el) el.indeterminate = isSomeSelected; }}
                                                onChange={handleSelectAll}
                                                className="w-4 h-4 rounded border-[#3B3929] bg-[#1C1B0E] text-[#C9AA71] accent-[#C9AA71] focus:ring-[#C9AA71] focus:ring-offset-0 cursor-pointer"
                                                title={isAllSelected ? "Batalkan semua pilihan" : "Pilih semua akun"}
                                            />
                                        </th>
                                        <th className="py-3.5 px-4">Pengguna / Nama Staf</th>
                                        <th className="py-3.5 px-4">Peran (Role)</th>
                                        <th className="py-3.5 px-4">Departemen / Unit</th>
                                        <th className="py-3.5 px-4">WhatsApp Bot</th>
                                        <th className="py-3.5 px-4 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#3B3929]/50">
                                    {loading && users.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="py-16 text-center text-[#A19F8D]">
                                                <RefreshCw className="h-6 w-6 animate-spin text-[#C9AA71] mx-auto mb-2" />
                                                <span>Memuat daftar akun...</span>
                                            </td>
                                        </tr>
                                    ) : users.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="py-16 text-center text-[#A19F8D] space-y-2">
                                                <UsersIcon className="h-8 w-8 mx-auto text-[#3B3929]" />
                                                <div>Tidak ada akun yang sesuai dengan filter.</div>
                                            </td>
                                        </tr>
                                    ) : (
                                        users.map(u => {
                                            const deptTheme = u.department ? getDepartmentTheme(u.department) : { bg: '#C9AA71', text: '#1C1B0E' };
                                            const isMe = u.id === currentUser?.id;
                                            const isSelected = selectedUserIds.includes(u.id);

                                            return (
                                                <tr 
                                                    key={u.id} 
                                                    className={`hover:bg-[#1C1B0E]/40 transition-colors ${
                                                        isSelected ? 'bg-[#C9AA71]/15' : ''
                                                    } ${u.is_archived ? 'opacity-60 bg-red-950/10' : ''}`}
                                                >
                                                    {/* Select Row Checkbox */}
                                                    <td className="w-12 py-3 px-3 text-center" onClick={e => e.stopPropagation()}>
                                                        <input 
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => handleSelectUser(u.id)}
                                                            className="w-4 h-4 rounded border-[#3B3929] bg-[#1C1B0E] text-[#C9AA71] accent-[#C9AA71] focus:ring-[#C9AA71] focus:ring-offset-0 cursor-pointer"
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
                                                                <div className="font-bold text-sm text-[#FAFAFA] flex items-center gap-2 flex-wrap">
                                                                    <span>{u.staff_name || u.name}</span>
                                                                    {u.is_hod && (
                                                                        <span 
                                                                            className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                                                            title={u.hod_title || 'Head of Department'}
                                                                        >
                                                                            👑 HOD {u.hod_title ? `(${u.hod_title})` : ''}
                                                                        </span>
                                                                    )}
                                                                    {u.approval_status === 'pending_hod' && (
                                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                                            PENDING HOD
                                                                        </span>
                                                                    )}
                                                                    {u.approval_status === 'pending_admin' && (
                                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                                                            PENDING ADMIN
                                                                        </span>
                                                                    )}
                                                                    {u.approval_status === 'rejected' && (
                                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30" title={u.rejection_reason || 'Pendaftaran ditolak'}>
                                                                            DITOLAK
                                                                        </span>
                                                                    )}
                                                                    {isMe && (
                                                                        <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-[#C9AA71] text-[#1C1B0E]">
                                                                            YOU
                                                                        </span>
                                                                    )}
                                                                    {u.is_archived && (
                                                                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                                                                            ARCHIVED
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="text-[11px] text-[#A19F8D] truncate">
                                                                    {u.email}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Role */}
                                                    <td className="py-3 px-4">
                                                        {u.role === 'admin' ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#C9AA71]/20 text-[#C9AA71] border border-[#C9AA71]/40">
                                                                <ShieldCheck className="h-3.5 w-3.5" />
                                                                Administrator
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
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
                                                            <span className="text-[#A19F8D] italic">Semua Departemen</span>
                                                        )}
                                                    </td>

                                                    {/* WhatsApp status */}
                                                    <td className="py-3 px-4">
                                                        {u.whatsapp_number ? (
                                                            <div className="flex items-center gap-1.5 text-[#E3D1AA]">
                                                                <Phone className="h-3.5 w-3.5 text-emerald-400" />
                                                                <span className="font-mono text-[11px]">+{u.whatsapp_number}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[#A19F8D]/60 text-[11px] italic">Belum terhubung</span>
                                                        )}
                                                    </td>

                                                    {/* Actions */}
                                                    <td className="py-3 px-4 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            {/* Quick Reset Password */}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleResetPassword(u)}
                                                                title="Reset Password 1-Klik"
                                                                className="p-1.5 rounded-lg text-[#A19F8D] hover:text-[#C9AA71] hover:bg-[#1C1B0E] transition-all cursor-pointer"
                                                            >
                                                                <KeyRound className="h-4 w-4" />
                                                            </button>

                                                            {/* Edit */}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleEditUser(u)}
                                                                title="Edit Akun & Izin"
                                                                className="p-1.5 rounded-lg text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#1C1B0E] transition-all cursor-pointer"
                                                            >
                                                                <Edit className="h-4 w-4" />
                                                            </button>

                                                            {/* Quick Toggle HOD */}
                                                            {u.role !== 'admin' && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleToggleHod(u)}
                                                                    title={u.is_hod ? `Cabut Status HOD (${u.staff_name || u.name})` : `Jadikan HOD Departemen (${u.staff_name || u.name})`}
                                                                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                                                        u.is_hod 
                                                                            ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10' 
                                                                            : 'text-[#A19F8D] hover:text-amber-400 hover:bg-[#1C1B0E]'
                                                                    }`}
                                                                >
                                                                    <span className="text-xs">👑</span>
                                                                </button>
                                                            )}

                                                            {/* Archive (Soft Delete) or Restore */}
                                                            {u.is_archived ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRestoreUser(u)}
                                                                    title="Pulihkan Akun Ini"
                                                                    className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/20 transition-all cursor-pointer"
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
                                                                            ? 'text-gray-600 cursor-not-allowed opacity-40' 
                                                                            : 'text-[#A19F8D] hover:text-red-400 hover:bg-red-500/10 cursor-pointer'
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
            </div>

            {/* Mobile Bottom Navigation */}
            <MobileBottomNav />

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
                selectedUsers={users.filter(u => selectedUserIds.includes(u.id))}
                onBatchSuccess={handleBatchSuccess}
                showToast={showToast}
            />

            {/* Batch Delete Confirmation Modal */}
            {isBatchDeleteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-[#1C1B0E] p-6 shadow-2xl space-y-4">
                        <div className="flex items-center gap-3 text-rose-400">
                            <div className="w-11 h-11 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
                                <Trash2 className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-extrabold text-[#FAFAFA]">
                                    Archive (Soft Delete) Akun Massal
                                </h3>
                                <p className="text-xs text-[#A19F8D]">
                                    Konfirmasi penonaktifan akun terpilih
                                </p>
                            </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/30 text-xs space-y-2 text-[#FAFAFA]">
                            <p>
                                Anda akan meng-archive <strong className="text-rose-300 font-bold">{effectiveDeleteCount} akun</strong>.
                            </p>
                            <p className="text-[11px] text-[#A19F8D] leading-relaxed">
                                Akun yang di-archive tidak dapat login ke sistem lagi, namun seluruh riwayat isu, log penugasan, dan tiket tetap aman di database (Soft Delete). Anda dapat memulihkannya kapan saja di tab <strong>Archived</strong>.
                            </p>
                        </div>

                        {selectedIncludesSelf && (
                            <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
                                <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-bold text-amber-300">Proteksi Keamanan:</span> Akun Anda sendiri ({currentUser?.name || 'Administrator'}) otomatis dilewati dan tidak akan di-archive.
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsBatchDeleteModalOpen(false)}
                                disabled={batchDeleteLoading}
                                className="px-4 py-2 rounded-xl border border-[#3B3929] bg-[#2A281E] text-xs font-bold text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#3B3929] transition-all cursor-pointer disabled:opacity-50"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmBatchDelete}
                                disabled={batchDeleteLoading || effectiveDeleteCount === 0}
                                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
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
