import { useState, useEffect } from 'react';
import { Head, Link } from '@inertiajs/react';
import { 
    Users as UsersIcon, Plus, Search, Shield, ShieldCheck, ShieldAlert, 
    KeyRound, Building2, Phone, CheckCircle2, AlertCircle, Edit, Trash2, 
    RefreshCw, RotateCcw, Activity, Eye, Filter, Lock, ArrowLeft,
    Check, CheckSquare, Square, MinusSquare
} from 'lucide-react';

import { IssuesProvider } from '@/context/IssuesContext';
import { useLanguage } from '@/context/LanguageContext';
import { CampusFixHeader } from '@/Components/CampusFix/CampusFixHeader';
import { MobileBottomNav } from '@/Components/CampusFix/MobileBottomNav';
import { useAuth } from '@/hooks/useAuth';
import { UserModal } from '@/Components/Users/UserModal';
import { AuditLogDrawer } from '@/Components/Users/AuditLogDrawer';
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

    // Multi-Select & Batch Permission State
    const [selectedUserIds, setSelectedUserIds] = useState([]);
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [batchQuickProcessing, setBatchQuickProcessing] = useState(false);

    // Modals
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);

    // Toast notification
    const [toastMessage, setToastMessage] = useState(null);

    const showToast = (msg, isError = false) => {
        setToastMessage({ text: msg, isError });
        setTimeout(() => setToastMessage(null), 4000);
    };

    // Selection helpers
    const selectableUsers = users.filter(u => !u.is_archived);
    const isAllSelected = selectableUsers.length > 0 && selectableUsers.every(u => selectedUserIds.includes(u.id));
    const isSomeSelected = selectedUserIds.length > 0 && !isAllSelected;

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

    const handleQuickToggleViewAllDepts = async (enabled) => {
        if (selectedUserIds.length === 0) return;
        setBatchQuickProcessing(true);
        try {
            const res = await fetch('/api/users/batch-permissions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
                body: JSON.stringify({
                    user_ids: selectedUserIds,
                    permissions: {
                        can_view_all_departments: enabled,
                    },
                }),
            });
            const data = await res.json();
            if (data.success) {
                showToast(
                    enabled 
                        ? `Akses semua departemen dinyalakan untuk ${data.updated_count} akun.` 
                        : `Akses dibatasi ke departemen sendiri untuk ${data.updated_count} akun.`
                );
                handleBatchSuccess(data.updated_users || []);
            } else {
                showToast(data.message || 'Gagal mengubah izin.', true);
            }
        } catch (e) {
            showToast('Terjadi kesalahan jaringan.', true);
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

            const res = await fetch(`/api/users?${params.toString()}`, {
                headers: { 'Accept': 'application/json' }
            });
            const data = await res.json();
            if (data.success) {
                setUsers(data.data || []);
                if (data.stats) setStats(data.stats);
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
            const res = await fetch(`/api/users/${targetUser.id}`, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                }
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message || 'Akun berhasil di-archive');
                fetchUsers();
            } else {
                showToast(data.message || 'Gagal meng-archive akun', true);
            }
        } catch (e) {
            showToast('Terjadi kesalahan sistem', true);
        }
    };

    const handleRestoreUser = async (targetUser) => {
        const confirmMsg = lang === 'id'
            ? `Pulihkan akun ${targetUser.name} agar dapat aktif dan login kembali?`
            : `Restore account ${targetUser.name} so it can log in and be active again?`;

        if (!confirm(confirmMsg)) return;

        try {
            const res = await fetch(`/api/users/${targetUser.id}/restore`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                }
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message || 'Akun berhasil dipulihkan');
                fetchUsers();
            } else {
                showToast(data.message || 'Gagal memulihkan akun', true);
            }
        } catch (e) {
            showToast('Terjadi kesalahan sistem', true);
        }
    };

    const handleResetPassword = async (targetUser) => {
        const confirmMsg = lang === 'id'
            ? `Reset password untuk ${targetUser.name}?\nSistem akan membuat password baru dan mencatatnya ke audit log.`
            : `Reset password for ${targetUser.name}?\nThe system will generate a new password and log the action.`;

        if (!confirm(confirmMsg)) return;

        try {
            const res = await fetch(`/api/users/${targetUser.id}/reset-password`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                }
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Password ${targetUser.name} berhasil direset: "${data.new_password}"`);
                fetchUsers();
            } else {
                showToast(data.message || 'Gagal mereset password', true);
            }
        } catch (e) {
            showToast('Terjadi kesalahan sistem', true);
        }
    };

    const handleToggleHod = async (targetUser) => {
        try {
            const res = await fetch(`/api/users/${targetUser.id}/toggle-hod`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                }
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message);
                setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, is_hod: data.is_hod } : u));
            } else {
                showToast(data.message || 'Gagal mengubah status HOD', true);
            }
        } catch (e) {
            showToast('Terjadi kesalahan sistem', true);
        }
    };

    return (
        <div className="min-h-screen bg-[#1C1B0E] text-[#FAFAFA] relative overflow-x-hidden selection:bg-[#C9AA71] selection:text-[#1C1B0E]">
            <Head title={lang === 'id' ? 'Kelola Akun & Hak Akses' : 'User Management'} />

            {/* Background Lineart Pattern */}
            <div
                className="fixed inset-0 pointer-events-none opacity-25 z-0 bg-repeat"
                style={{
                    backgroundImage: "url('/bg-lineart.png')",
                    backgroundSize: '600px',
                }}
            />

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
                                        ? 'Kelola akun staf, kontrol pembatasan hak akses (Barrier), dan pantau riwayat keamanan resort'
                                        : 'Manage staff credentials, department scopes, access barriers, and security audit logs'}
                                </p>
                            </div>
                        </div>

                        {/* Top Action Buttons */}
                        <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
                            <button
                                type="button"
                                onClick={() => setIsAuditDrawerOpen(true)}
                                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#1C1B0E] hover:bg-[#3B3929] text-[#E3D1AA] border border-[#3B3929] transition-all cursor-pointer shadow-sm"
                            >
                                <Activity className="h-4 w-4 text-[#C9AA71]" />
                                <span>{lang === 'id' ? 'Audit Trail' : 'Security Logs'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={handleCreateUser}
                                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#C9AA71] hover:bg-[#b89960] text-[#1C1B0E] transition-all shadow-md hover:shadow-lg cursor-pointer"
                            >
                                <Plus className="h-4 w-4" />
                                <span>{lang === 'id' ? 'Tambah Akun' : 'New User'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
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
                            onClick={() => setHodFilter(prev => !prev)}
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
                                        FILTER
                                    </span>
                                )}
                            </div>
                            <div className="text-xl font-extrabold text-amber-400">{stats.total_hod ?? 0}</div>
                        </div>

                        <div className="rounded-xl border border-[#3B3929] bg-[#2A281E]/80 p-3.5 space-y-1">
                            <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">WA Linked</div>
                            <div className="text-xl font-extrabold text-emerald-400">{stats.total_whatsapp ?? 0}</div>
                        </div>

                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-1">
                            <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                                <span>🚧 Barrier</span>
                            </div>
                            <div className="text-xl font-extrabold text-amber-400">{stats.total_restricted ?? 0}</div>
                        </div>

                        <div className="rounded-xl border border-[#3B3929] bg-[#2A281E]/80 p-3.5 space-y-1">
                            <div className="text-[11px] font-bold text-[#A19F8D] uppercase tracking-wider">Di-Archive</div>
                            <div className="text-xl font-extrabold text-[#A19F8D]">{stats.total_archived ?? 0}</div>
                        </div>
                    </div>

                    {/* Filter & Search Bar */}
                    <div className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/90 p-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-3">
                        <div className="relative w-full md:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A19F8D]" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={lang === 'id' ? 'Cari nama, email, nomor WA...' : 'Search name, email, phone...'}
                                className="w-full rounded-xl bg-[#1C1B0E] border border-[#3B3929] pl-9 pr-3.5 py-2 text-xs font-medium text-[#FAFAFA] placeholder-[#A19F8D] focus:border-[#C9AA71] focus:outline-none"
                            />
                        </div>

                        <div className="flex items-center gap-2.5 w-full md:w-auto overflow-x-auto">
                            {/* Role Filter */}
                            <select
                                value={roleFilter}
                                onChange={e => {
                                    setRoleFilter(e.target.value);
                                    if (e.target.value === 'hod') {
                                        setHodFilter(false);
                                    }
                                }}
                                className="rounded-xl bg-[#1C1B0E] border border-[#3B3929] px-3 py-2 text-xs font-medium text-[#FAFAFA] focus:border-[#C9AA71] focus:outline-none cursor-pointer"
                            >
                                <option value="all">Semua Role</option>
                                <option value="admin">Administrator</option>
                                <option value="department">Department</option>
                                <option value="viewer">Viewer</option>
                                <option value="hod">👑 Head of Department (HOD)</option>
                            </select>

                            {/* Standalone HOD Filter Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    if (roleFilter === 'hod') {
                                        setRoleFilter('all');
                                    }
                                    setHodFilter(prev => !prev);
                                }}
                                className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                    hodFilter || roleFilter === 'hod'
                                        ? 'bg-amber-500/25 border-amber-500 text-amber-300 ring-1 ring-amber-500/60 shadow-sm'
                                        : 'bg-[#1C1B0E] border-[#3B3929] text-[#A19F8D] hover:text-[#FAFAFA] hover:border-white/20'
                                }`}
                                title="Filter akun Head of Department (HOD)"
                            >
                                <span>👑</span>
                                <span>HOD</span>
                                {stats.total_hod !== undefined && (
                                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                                        hodFilter || roleFilter === 'hod'
                                            ? 'bg-amber-400 text-[#1C1B0E]'
                                            : 'bg-white/10 text-[#A19F8D]'
                                    }`}>
                                        {stats.total_hod}
                                    </span>
                                )}
                            </button>

                            {/* Department Filter */}
                            <select
                                value={deptFilter}
                                onChange={e => setDeptFilter(e.target.value)}
                                className="rounded-xl bg-[#1C1B0E] border border-[#3B3929] px-3 py-2 text-xs font-medium text-[#FAFAFA] focus:border-[#C9AA71] focus:outline-none"
                            >
                                <option value="all">Semua Departemen</option>
                                {DEPARTMENTS.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>

                            {/* Status Filter (Active / Archived) */}
                            <div className="flex items-center rounded-xl border border-[#3B3929] bg-[#1C1B0E] p-0.5 text-xs font-bold shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('active')}
                                    className={`px-2.5 py-1.5 rounded-lg transition-all ${
                                        statusFilter === 'active' ? 'bg-[#C9AA71] text-[#1C1B0E]' : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                                    }`}
                                >
                                    Aktif
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('archived')}
                                    className={`px-2.5 py-1.5 rounded-lg transition-all ${
                                        statusFilter === 'archived' ? 'bg-[#C9AA71] text-[#1C1B0E]' : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                                    }`}
                                >
                                    Archived
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('all')}
                                    className={`px-2.5 py-1.5 rounded-lg transition-all ${
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
                                        Ubah izin massal dengan tombol cepat atau buka pengatur izin lengkap.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                                {/* Quick Toggle: Batasi ke Departemen Sendiri */}
                                <button
                                    type="button"
                                    onClick={() => handleQuickToggleViewAllDepts(false)}
                                    disabled={batchQuickProcessing}
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
                                    disabled={batchQuickProcessing}
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
                                    disabled={batchQuickProcessing}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold bg-[#C9AA71] hover:bg-[#b89960] text-[#1C1B0E] transition-all shadow-md hover:shadow-lg cursor-pointer hover:scale-[1.02] disabled:opacity-50"
                                >
                                    <ShieldCheck className="h-4 w-4" />
                                    <span>Atur Izin Lengkap...</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Users Data Table */}
                    <div className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/90 shadow-2xl overflow-hidden">
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
                                        <th className="py-3.5 px-4">Status Hak Akses (Barrier)</th>
                                        <th className="py-3.5 px-4 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#3B3929]/50">
                                    {loading && users.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="py-16 text-center text-[#A19F8D]">
                                                <RefreshCw className="h-6 w-6 animate-spin text-[#C9AA71] mx-auto mb-2" />
                                                <span>Memuat daftar akun...</span>
                                            </td>
                                        </tr>
                                    ) : users.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="py-16 text-center text-[#A19F8D] space-y-2">
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
                                                            disabled={u.is_archived}
                                                            className="w-4 h-4 rounded border-[#3B3929] bg-[#1C1B0E] text-[#C9AA71] accent-[#C9AA71] focus:ring-[#C9AA71] focus:ring-offset-0 cursor-pointer disabled:opacity-30"
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
                                                        ) : u.role === 'viewer' ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-500/20 text-slate-300 border border-slate-500/40">
                                                                <Eye className="h-3.5 w-3.5" />
                                                                Viewer
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

                                                    {/* Access & Barrier Logo */}
                                                    <td className="py-3 px-4">
                                                        {u.role === 'admin' ? (
                                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                                                <ShieldCheck className="h-3.5 w-3.5" />
                                                                <span>Akses Penuh (No Barrier)</span>
                                                            </div>
                                                        ) : u.has_restrictions ? (
                                                            <div 
                                                                className="relative group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/40 cursor-help"
                                                                title={u.barrier_reasons.join(' • ')}
                                                            >
                                                                <ShieldAlert className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                                                                <span>🚧 Barrier Aktif ({u.barrier_reasons.length})</span>

                                                                {/* Hover Tooltip Breakdown */}
                                                                <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2.5 rounded-xl bg-[#1C1B0E] border border-amber-500/40 shadow-2xl z-30 text-[11px] font-normal text-[#FAFAFA] space-y-1">
                                                                    <div className="font-bold text-amber-300 flex items-center gap-1 border-b border-white/10 pb-1">
                                                                        <span>Pembatasan Akun:</span>
                                                                    </div>
                                                                    <ul className="list-disc list-inside space-y-0.5 text-[#E3D1AA]">
                                                                        {u.barrier_reasons.map((r, i) => (
                                                                            <li key={i}>{r}</li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                                <span>Akses Standar</span>
                                                            </div>
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

            {/* Security Audit Trail Drawer */}
            <AuditLogDrawer
                isOpen={isAuditDrawerOpen}
                onClose={() => setIsAuditDrawerOpen(false)}
            />
        </div>
    );
}
