import { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import { 
    Ticket, CheckCircle2, XCircle, Clock, AlertCircle, 
    ArrowRight, UserCheck, Shield, Phone, Mail, Building2,
    Check, X, FileText, Search, Filter, RefreshCw, Crown, User,
    Sparkles, ChevronRight, ArrowLeft
} from 'lucide-react';

import { IssuesProvider } from '@/context/IssuesContext';
import { CampusFixHeader } from '@/Components/CampusFix/CampusFixHeader';
import { MobileBottomNav } from '@/Components/CampusFix/MobileBottomNav';
import { useAuth } from '@/hooks/useAuth';
import { DEPARTMENTS, getDepartmentTheme } from '@/constants/departments';

export default function TicketsPage(props) {
    return (
        <IssuesProvider>
            <TicketsInner {...props} />
        </IssuesProvider>
    );
}

function TicketsInner({ 
    tickets, 
    filters = {}, 
    pendingHodCount = 0, 
    pendingAdminCount = 0, 
    adminApprovedCount = 0,
    myTicketsCount = 0,
    myPendingCount = 0 
}) {
    const { user: currentUser } = useAuth();
    const [search, setSearch] = useState(filters?.search || '');
    const [statusFilter, setStatusFilter] = useState(filters?.status || 'all');
    const [typeFilter, setTypeFilter] = useState(filters?.type || 'all');
    const [departmentFilter, setDepartmentFilter] = useState(filters?.department || 'all');

    // Action Modal State (for rejection with reason or approval with notes)
    const [actionModal, setActionModal] = useState({
        isOpen: false,
        ticket: null,
        action: null, // 'approve' | 'reject'
        role: null,   // 'hod' | 'admin'
        notes: '',
        rejectionReason: '',
        processing: false,
        error: '',
    });

    const isUserAdmin = currentUser?.role === 'admin';
    const isUserHOD = Boolean(currentUser?.is_hod);

    const handleFilterChange = (newStatus, newType, newSearch, newDept) => {
        router.get(route('tickets.index'), {
            status: newStatus !== undefined ? newStatus : statusFilter,
            type: newType !== undefined ? newType : typeFilter,
            search: newSearch !== undefined ? newSearch : search,
            department: newDept !== undefined ? newDept : departmentFilter,
        }, {
            preserveState: true,
            preserveScroll: true,
        });
    };

    const openActionModal = (ticket, action, role) => {
        setActionModal({
            isOpen: true,
            ticket,
            action,
            role,
            notes: '',
            rejectionReason: '',
            processing: false,
            error: '',
        });
    };

    const closeActionModal = () => {
        setActionModal({
            isOpen: false,
            ticket: null,
            action: null,
            role: null,
            notes: '',
            rejectionReason: '',
            processing: false,
            error: '',
        });
    };

    const submitAction = (e) => {
        e.preventDefault();
        const { ticket, action, role, notes, rejectionReason } = actionModal;

        if (action === 'reject' && !rejectionReason.trim()) {
            setActionModal(prev => ({ ...prev, error: 'Alasan penolakan wajib diisi agar pemohon mengetahuinya.' }));
            return;
        }

        setActionModal(prev => ({ ...prev, processing: true, error: '' }));

        const endpoint = role === 'hod' 
            ? route('tickets.hodAction', ticket.id) 
            : route('tickets.adminAction', ticket.id);

        router.post(endpoint, {
            action,
            notes,
            rejection_reason: rejectionReason,
        }, {
            onSuccess: () => {
                closeActionModal();
            },
            onError: (errs) => {
                setActionModal(prev => ({ 
                    ...prev, 
                    processing: false, 
                    error: errs.message || errs.rejection_reason || 'Terjadi kesalahan saat memproses tiket.' 
                }));
            },
        });
    };

    const getTypeBadge = (type) => {
        switch (type) {
            case 'account_registration':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                        <User className="w-3 h-3" /> Pendaftaran Akun
                    </span>
                );
            case 'whatsapp_change':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <Phone className="w-3 h-3" /> Ganti WhatsApp
                    </span>
                );
            case 'whatsapp_unlink':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        <Phone className="w-3 h-3 text-rose-400" /> Lepas WhatsApp
                    </span>
                );
            case 'password_reset':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                        <Shield className="w-3 h-3" /> Reset Password
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/10 text-white/80 border border-white/10">
                        {type}
                    </span>
                );
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending_hod':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40">
                        <Clock className="w-3.5 h-3.5 text-amber-400" /> Menunggu HOD
                    </span>
                );
            case 'pending_admin':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/40">
                        <Clock className="w-3.5 h-3.5 text-sky-400" /> Menunggu Admin
                    </span>
                );
            case 'approved':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Disetujui (ACC)
                    </span>
                );
            case 'rejected':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/40">
                        <XCircle className="w-3.5 h-3.5 text-rose-400" /> Ditolak
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-white/70">
                        {status}
                    </span>
                );
        }
    };

    return (
        <div className="min-h-screen bg-[#1C1B0E] text-[#FAFAFA] relative overflow-x-hidden selection:bg-[#C9AA71] selection:text-[#1C1B0E]">
            <Head title="Pusat Persetujuan Tiket & Akun - Telunas Resort" />

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
                <CampusFixHeader mode="tickets" />

                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-28 md:pb-12 space-y-6">
                    
                    {/* Header Banner with Role-Differentiated Scope */}
                    <div className="rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 shadow-2xl border border-white/10 bg-gradient-to-br from-[#2A281E] to-[#1C1B0E]">
                        <div className="flex items-start sm:items-center gap-4">
                            <div className="p-3.5 rounded-2xl bg-[#C9AA71]/15 text-[#C9AA71] border border-[#C9AA71]/30 shadow-inner">
                                <Ticket className="w-7 h-7" />
                            </div>
                            <div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#FAFAFA]">
                                        Pusat Persetujuan Tiket
                                    </h1>

                                    {/* Role Identity Badge */}
                                    {isUserAdmin ? (
                                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-[#C9AA71] text-[#1C1B0E] shadow-md shadow-[#C9AA71]/20 flex items-center gap-1.5">
                                            <Shield className="w-3.5 h-3.5" /> ADMINISTRATOR — FINAL ACC
                                        </span>
                                    ) : isUserHOD ? (
                                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-md flex items-center gap-1.5">
                                            <Crown className="w-3.5 h-3.5 text-amber-400" /> HOD {currentUser?.department ? currentUser.department.toUpperCase() : ''}
                                        </span>
                                    ) : (
                                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-md flex items-center gap-1.5">
                                            <User className="w-3.5 h-3.5" /> STAF — {currentUser?.department ? currentUser.department.toUpperCase() : 'RESORT'}
                                        </span>
                                    )}
                                </div>

                                <p className="text-xs sm:text-sm text-[#A19F8D] mt-1.5 max-w-2xl leading-relaxed">
                                    {isUserAdmin ? (
                                        'Pusat persetujuan tiket seluruh departemen Telunas Resort. Otorisasi final untuk mengaktifkan akun, nomor WhatsApp bot, dan reset password.'
                                    ) : isUserHOD ? (
                                        `Tinjau dan verifikasi permohonan staf di naungan departemen ${currentUser?.department || 'Anda'} sebelum diteruskan ke Admin untuk ACC final.`
                                    ) : (
                                        'Pantau status pengajuan permohonan nomor WhatsApp bot dan reset kata sandi akun Anda secara real-time.'
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Quick Stats Highlights */}
                        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                            {isUserAdmin && (
                                <>
                                    <div className="flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#1C1B0E]/70 border border-[#3B3929] shadow-md">
                                        <div className="p-2 rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/30">
                                            <Shield className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider">Perlu ACC Final</p>
                                            <p className="text-lg font-extrabold text-[#FAFAFA]">{pendingAdminCount}</p>
                                        </div>
                                    </div>

                                    <div className="flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#1C1B0E]/70 border border-[#3B3929] shadow-md">
                                        <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                            <CheckCircle2 className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider">Telah Disetujui</p>
                                            <p className="text-lg font-extrabold text-[#FAFAFA]">{adminApprovedCount}</p>
                                        </div>
                                    </div>
                                </>
                            )}

                            {isUserHOD && !isUserAdmin && (
                                <>
                                    <div className="flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#1C1B0E]/70 border border-[#3B3929] shadow-md">
                                        <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                            <Crown className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider">Tinjauan HOD ({currentUser?.department})</p>
                                            <p className="text-lg font-extrabold text-[#FAFAFA]">{pendingHodCount}</p>
                                        </div>
                                    </div>

                                    <div className="flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#1C1B0E]/70 border border-[#3B3929] shadow-md">
                                        <div className="p-2 rounded-lg bg-[#C9AA71]/15 text-[#C9AA71] border border-[#C9AA71]/30">
                                            <Ticket className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider">Tiket Saya</p>
                                            <p className="text-lg font-extrabold text-[#FAFAFA]">{myTicketsCount}</p>
                                        </div>
                                    </div>
                                </>
                            )}

                            {!isUserAdmin && !isUserHOD && (
                                <>
                                    <div className="flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#1C1B0E]/70 border border-[#3B3929] shadow-md">
                                        <div className="p-2 rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/30">
                                            <Clock className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider">Tiket Berjalan</p>
                                            <p className="text-lg font-extrabold text-[#FAFAFA]">{myPendingCount}</p>
                                        </div>
                                    </div>

                                    <div className="flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#1C1B0E]/70 border border-[#3B3929] shadow-md">
                                        <div className="p-2 rounded-lg bg-[#C9AA71]/15 text-[#C9AA71] border border-[#C9AA71]/30">
                                            <Ticket className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider">Total Pengajuan</p>
                                            <p className="text-lg font-extrabold text-[#FAFAFA]">{myTicketsCount}</p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Alur Verifikasi Timeline Mini Banner */}
                    <div className="px-4 py-3 rounded-xl bg-[#2A281E]/60 border border-[#3B3929] text-xs text-[#A19F8D] flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-[#C9AA71] shrink-0" />
                            <span className="font-medium text-[#FAFAFA]">Alur Dua Tingkat:</span>
                            <span className="hidden sm:inline">1. Pengajuan Staf ➔ 2. Verifikasi HOD Departemen ➔ 3. ACC Final Administrator</span>
                            <span className="sm:hidden">Staf ➔ HOD ➔ Admin ACC</span>
                        </div>
                        <div className="text-[11px] text-[#A19F8D]">
                            {isUserAdmin ? (
                                <span className="text-[#C9AA71] font-semibold">Anda memiliki hak memberikan ACC Final & eksekusi langsung ke sistem.</span>
                            ) : isUserHOD ? (
                                <span className="text-amber-300 font-semibold">Anda berwenang merekomendasikan tiket departemen Anda ke Admin.</span>
                            ) : (
                                <span className="text-sky-300">Hubungi HOD atau Admin jika permohonan Anda memerlukan perhatian mendesak.</span>
                            )}
                        </div>
                    </div>

                    {/* Filters & Search Toolbar */}
                    <div className="bg-[#2A281E]/90 backdrop-blur-md p-4 rounded-2xl border border-[#3B3929] shadow-xl flex flex-col lg:flex-row gap-4 items-center justify-between">
                        {/* Status Tabs */}
                        <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto pb-2 lg:pb-0 scrollbar-none">
                            {[
                                { key: 'all', label: 'Semua Status' },
                                ...(isUserAdmin ? [] : [{ key: 'pending_hod', label: 'Menunggu HOD' }]),
                                { key: 'pending_admin', label: isUserAdmin ? 'Perlu ACC Admin' : 'Menunggu Admin' },
                                { key: 'approved', label: 'Disetujui' },
                                { key: 'rejected', label: 'Ditolak' },
                            ].map(tab => {
                                const isActive = statusFilter === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => {
                                            setStatusFilter(tab.key);
                                            handleFilterChange(tab.key, undefined, undefined, undefined);
                                        }}
                                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 ${
                                            isActive
                                                ? 'bg-gradient-to-r from-[#C9AA71] to-[#B39355] text-[#1C1B0E] font-bold shadow-md shadow-[#C9AA71]/20'
                                                : 'bg-[#1C1B0E]/60 text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#1C1B0E] border border-[#3B3929]/80'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Secondary Filters: Department (Admin Only), Type, and Search */}
                        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                            {/* Department Filter (Admin Only) */}
                            {isUserAdmin && (
                                <select
                                    value={departmentFilter}
                                    onChange={(e) => {
                                        setDepartmentFilter(e.target.value);
                                        handleFilterChange(undefined, undefined, undefined, e.target.value);
                                    }}
                                    className="bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] rounded-xl text-xs py-2 px-3 focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71]"
                                >
                                    <option value="all">Semua Departemen</option>
                                    {DEPARTMENTS.map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            )}

                            {/* Ticket Type Filter */}
                            <select
                                value={typeFilter}
                                onChange={(e) => {
                                    setTypeFilter(e.target.value);
                                    handleFilterChange(undefined, e.target.value, undefined, undefined);
                                }}
                                className="bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] rounded-xl text-xs py-2 px-3 focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71]"
                            >
                                <option value="all">Semua Tipe</option>
                                {(isUserAdmin || isUserHOD) && (
                                    <option value="account_registration">Pendaftaran Akun</option>
                                )}
                                <option value="whatsapp_change">Ganti WhatsApp</option>
                                <option value="whatsapp_unlink">Lepas WhatsApp</option>
                                <option value="password_reset">Reset Password</option>
                            </select>

                            {/* Search Input */}
                            <div className="relative flex-1 sm:w-64">
                                <Search className="w-4 h-4 text-[#A19F8D] absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleFilterChange(undefined, undefined, search, undefined)}
                                    placeholder="Cari tiket, staf, email..."
                                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] placeholder-[#A19F8D]/60 focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71]"
                                />
                            </div>

                            {/* Refresh Button */}
                            <button
                                onClick={() => handleFilterChange(undefined, undefined, search, undefined)}
                                className="p-2 rounded-xl bg-[#1C1B0E] hover:bg-[#C9AA71] hover:text-[#1C1B0E] text-[#A19F8D] border border-[#3B3929] transition-colors"
                                title="Refresh"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Tickets Listing */}
                    {tickets?.data?.length === 0 ? (
                        <div className="bg-[#2A281E]/80 backdrop-blur-md rounded-2xl p-12 text-center border border-[#3B3929] shadow-xl">
                            <div className="w-16 h-16 rounded-full bg-[#1C1B0E] border border-[#3B3929] flex items-center justify-center mx-auto mb-4 text-[#A19F8D]">
                                <Ticket className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-[#FAFAFA]">Tidak Ada Tiket Ditemukan</h3>
                            <p className="text-xs sm:text-sm text-[#A19F8D] mt-1.5 max-w-md mx-auto">
                                {!isUserAdmin && !isUserHOD
                                    ? 'Anda belum memiliki riwayat tiket aktif (perubahan nomor WhatsApp atau reset kata sandi).'
                                    : 'Tidak ada permohonan tiket yang cocok dengan kriteria filter saat ini.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {tickets?.data?.map((ticket) => {
                                const deptTheme = getDepartmentTheme(ticket.department);
                                
                                // HOD review privilege: Strictly HOD of ticket's department
                                const canHodReview = (ticket.status === 'pending_hod') && 
                                    (isUserHOD && currentUser?.department === ticket.department);
                                
                                // Admin review / final ACC privilege: Strictly Admin on forwarded tickets
                                const canAdminReview = isUserAdmin && (ticket.status === 'pending_admin');

                                return (
                                    <div 
                                        key={ticket.id} 
                                        className="bg-[#2A281E]/90 backdrop-blur-md rounded-2xl border border-[#3B3929] hover:border-[#C9AA71]/40 shadow-xl p-5 transition-all duration-200"
                                    >
                                        {/* Header Row: Ticket #, Type, and Status */}
                                        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#3B3929]/70">
                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                <span className="font-mono text-xs font-bold text-[#E3D1AA] bg-[#1C1B0E] px-2.5 py-1 rounded-lg border border-[#3B3929]">
                                                    #{ticket.ticket_number}
                                                </span>
                                                {getTypeBadge(ticket.type)}
                                                <span className="text-[11px] text-[#A19F8D]">
                                                    Diajukan: {new Date(ticket.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <div>
                                                {getStatusBadge(ticket.status)}
                                            </div>
                                        </div>

                                        {/* Content Grid: 3 Columns */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 py-4 text-xs">
                                            
                                            {/* Column 1: Staff Info */}
                                            <div className="space-y-2">
                                                <p className="text-[11px] uppercase font-bold text-[#A19F8D] tracking-wider">Pemohon</p>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-[#1C1B0E] border border-[#3B3929] flex items-center justify-center font-bold text-[#C9AA71]">
                                                        {ticket.staff_name ? ticket.staff_name.charAt(0).toUpperCase() : '?'}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-[#FAFAFA] text-sm leading-tight">{ticket.staff_name}</p>
                                                        {ticket.email && (
                                                            <p className="text-[#A19F8D] text-[11px]">{ticket.email}</p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="pt-1 flex items-center gap-2">
                                                    <span 
                                                        className="px-2.5 py-0.5 rounded text-[11px] font-bold"
                                                        style={{ 
                                                            backgroundColor: deptTheme.bg, 
                                                            color: deptTheme.text 
                                                        }}
                                                    >
                                                        {ticket.department}
                                                    </span>
                                                    {ticket.subdivision && (
                                                        <span className="text-[11px] text-[#A19F8D]">
                                                            • {ticket.subdivision}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Column 2: Requested Detail */}
                                            <div className="space-y-2">
                                                <p className="text-[11px] uppercase font-bold text-[#A19F8D] tracking-wider">Detail Permohonan</p>
                                                
                                                {ticket.type === 'account_registration' && (
                                                    <div className="space-y-1">
                                                        <span className="text-[#A19F8D]">Nomor WhatsApp Diajukan:</span>
                                                        <p className="font-mono font-bold text-[#C9AA71] text-sm">
                                                            +{ticket.requested_value}
                                                        </p>
                                                    </div>
                                                )}

                                                {(ticket.type === 'whatsapp_change' || ticket.type === 'whatsapp_unlink') && (
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[#A19F8D]">Nomor Lama:</span>
                                                            <span className="font-mono text-[#FAFAFA]">+{ticket.current_value || '-'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[#A19F8D]">Diajukan:</span>
                                                            <span className="font-mono font-bold text-emerald-400">
                                                                {ticket.requested_value ? `+${ticket.requested_value}` : 'Lepas Nomor (Unlink)'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {ticket.type === 'password_reset' && (
                                                    <div className="space-y-1">
                                                        <p className="text-[#FAFAFA] font-medium">Permohonan Reset Kata Sandi</p>
                                                        <p className="text-[#A19F8D] text-[11px] italic">
                                                            Kata sandi baru akan diaktifkan secara otomatis setelah disetujui Admin.
                                                        </p>
                                                    </div>
                                                )}

                                                {ticket.reason && (
                                                    <div className="p-2.5 rounded-xl bg-[#1C1B0E]/70 border border-[#3B3929] text-[11px] text-[#A19F8D] mt-2">
                                                        <strong className="text-[#FAFAFA]">Alasan:</strong> {ticket.reason}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Column 3: Verification Log Tracker */}
                                            <div className="space-y-2.5 bg-[#1C1B0E]/60 p-3.5 rounded-xl border border-[#3B3929]">
                                                <p className="text-[11px] uppercase font-bold text-[#A19F8D] tracking-wider">Jejak Verifikasi</p>
                                                
                                                {/* Step 1: HOD Review */}
                                                <div className="text-[11px] space-y-0.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-[#FAFAFA]">1. Tinjauan HOD:</span>
                                                        {ticket.hod_reviewed_at ? (
                                                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                                                <Check className="w-3 h-3" /> Selesai
                                                            </span>
                                                        ) : (
                                                            <span className="text-amber-400 font-medium">Menunggu HOD</span>
                                                        )}
                                                    </div>
                                                    {ticket.hod && <p className="text-[#A19F8D]">Oleh: {ticket.hod.name}</p>}
                                                    {ticket.hod_notes && <p className="text-[#E3D1AA] italic">"{ticket.hod_notes}"</p>}
                                                </div>

                                                {/* Step 2: Admin ACC */}
                                                <div className="text-[11px] space-y-0.5 pt-2 border-t border-[#3B3929]">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-[#FAFAFA]">2. ACC Final Admin:</span>
                                                        {ticket.admin_reviewed_at ? (
                                                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                                                <Check className="w-3 h-3" /> Selesai
                                                            </span>
                                                        ) : (
                                                            <span className="text-[#A19F8D] font-medium">Menunggu Admin</span>
                                                        )}
                                                    </div>
                                                    {ticket.admin && <p className="text-[#A19F8D]">Oleh: {ticket.admin.name}</p>}
                                                    {ticket.admin_notes && <p className="text-[#E3D1AA] italic">"{ticket.admin_notes}"</p>}
                                                </div>

                                                {/* Rejection Alert Box */}
                                                {ticket.rejection_reason && (
                                                    <div className="pt-2 text-[11px] text-rose-300 bg-rose-950/40 p-2.5 rounded-lg border border-rose-800/60">
                                                        <strong className="text-rose-200">Alasan Penolakan:</strong> {ticket.rejection_reason}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Buttons Row */}
                                        <div className="pt-3.5 border-t border-[#3B3929]/70 flex flex-wrap items-center justify-between gap-3">
                                            {/* Left: Role Context info */}
                                            <div className="text-[11px] text-[#A19F8D]">
                                                {!isUserAdmin && !isUserHOD && (
                                                    <span>Tiket Anda diproses sesuai antrean verifikasi resort.</span>
                                                )}
                                                {isUserHOD && !isUserAdmin && (
                                                    <span>Sebagai HOD, persetujuan Anda akan meneruskan tiket ini ke Administrator.</span>
                                                )}
                                                {isUserAdmin && (
                                                    <span>Sebagai Admin, persetujuan Anda adalah ACC Final yang langsung mengaktifkan data ke sistem.</span>
                                                )}
                                            </div>

                                            {/* Right: Approval/Rejection Actions */}
                                            <div className="flex items-center gap-2">
                                                {/* HOD Review Actions */}
                                                {canHodReview && (
                                                    <>
                                                        <button
                                                            onClick={() => openActionModal(ticket, 'reject', 'hod')}
                                                            className="px-3 py-1.5 rounded-xl border border-rose-500/40 text-rose-300 hover:bg-rose-500/15 hover:border-rose-500/70 text-xs font-semibold flex items-center gap-1.5 transition-all"
                                                        >
                                                            <X className="w-3.5 h-3.5" /> Tolak (HOD)
                                                        </button>
                                                        <button
                                                            onClick={() => openActionModal(ticket, 'approve', 'hod')}
                                                            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#C9AA71] to-[#B39355] text-[#1C1B0E] font-bold text-xs flex items-center gap-1.5 shadow-md shadow-[#C9AA71]/20 hover:brightness-110 transition-all"
                                                        >
                                                            <Check className="w-3.5 h-3.5" /> Setujui HOD (Teruskan ke Admin)
                                                        </button>
                                                    </>
                                                )}

                                                {/* Admin Final Review Actions */}
                                                {canAdminReview && !canHodReview && (
                                                    <>
                                                        <button
                                                            onClick={() => openActionModal(ticket, 'reject', 'admin')}
                                                            className="px-3 py-1.5 rounded-xl border border-rose-500/40 text-rose-300 hover:bg-rose-500/15 hover:border-rose-500/70 text-xs font-semibold flex items-center gap-1.5 transition-all"
                                                        >
                                                            <X className="w-3.5 h-3.5" /> Tolak Tiket
                                                        </button>
                                                        <button
                                                            onClick={() => openActionModal(ticket, 'approve', 'admin')}
                                                            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-900/30 transition-all"
                                                        >
                                                            <Check className="w-3.5 h-3.5" /> ACC Final (Admin)
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </main>
            </div>

            {/* Action Modal (Approval / Rejection) */}
            {actionModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
                    <div className="bg-[#2A281E] rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-[#3B3929] text-[#FAFAFA]">
                        <div className="flex items-center justify-between pb-3 border-b border-[#3B3929]">
                            <h3 className="text-base font-bold flex items-center gap-2">
                                {actionModal.action === 'approve' ? (
                                    <>
                                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                        <span>Konfirmasi Persetujuan Tiket</span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-5 h-5 text-rose-400" />
                                        <span>Penolakan Tiket (Wajib Alasan)</span>
                                    </>
                                )}
                            </h3>
                            <button
                                onClick={closeActionModal}
                                className="text-[#A19F8D] hover:text-[#FAFAFA] p-1 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={submitAction} className="mt-4 space-y-4">
                            <div className="bg-[#1C1B0E]/80 p-3.5 rounded-xl text-xs space-y-1 text-[#A19F8D] border border-[#3B3929]">
                                <p><strong className="text-[#FAFAFA]">Nomor Tiket:</strong> #{actionModal.ticket?.ticket_number}</p>
                                <p><strong className="text-[#FAFAFA]">Pemohon:</strong> {actionModal.ticket?.staff_name} ({actionModal.ticket?.department})</p>
                                <p className="flex items-center gap-2">
                                    <strong className="text-[#FAFAFA]">Jenis:</strong> {getTypeBadge(actionModal.ticket?.type)}
                                </p>
                            </div>

                            {actionModal.action === 'reject' ? (
                                <div>
                                    <label className="block text-xs font-bold text-[#FAFAFA] mb-1">
                                        Alasan Penolakan <span className="text-rose-400">*</span>
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={actionModal.rejectionReason}
                                        onChange={(e) => setActionModal(prev => ({ ...prev, rejectionReason: e.target.value }))}
                                        placeholder="Tuliskan alasan penolakan secara jelas. Alasan ini akan ditampilkan kepada pemohon saat mencoba login atau menerima notifikasi..."
                                        className="w-full text-xs rounded-xl bg-[#1C1B0E] border border-rose-900/60 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-[#FAFAFA] placeholder-[#A19F8D]/50"
                                        required
                                    />
                                    <p className="mt-1 text-[11px] text-[#A19F8D]">
                                        Alasan ini wajib diisi sesuai standar audit Telunas Resort.
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-bold text-[#FAFAFA] mb-1">
                                        Catatan Persetujuan (Opsional)
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={actionModal.notes}
                                        onChange={(e) => setActionModal(prev => ({ ...prev, notes: e.target.value }))}
                                        placeholder="Catatan verifikasi tambahan..."
                                        className="w-full text-xs rounded-xl bg-[#1C1B0E] border border-[#3B3929] focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71] text-[#FAFAFA] placeholder-[#A19F8D]/50"
                                    />
                                </div>
                            )}

                            {actionModal.error && (
                                <div className="p-3 bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs rounded-xl">
                                    {actionModal.error}
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#3B3929]">
                                <button
                                    type="button"
                                    onClick={closeActionModal}
                                    disabled={actionModal.processing}
                                    className="px-4 py-2 rounded-xl text-xs font-semibold text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#1C1B0E]"
                                >
                                    Batal
                                </button>

                                <button
                                    type="submit"
                                    disabled={actionModal.processing}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-lg ${
                                        actionModal.action === 'approve'
                                            ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-emerald-900/40'
                                            : 'bg-gradient-to-r from-rose-700 to-rose-600 hover:from-rose-600 hover:to-rose-500 text-white shadow-rose-900/40'
                                    }`}
                                >
                                    {actionModal.processing ? 'Memproses...' : (actionModal.action === 'approve' ? 'Konfirmasi Setujui' : 'Tolak Tiket')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <MobileBottomNav />
        </div>
    );
}
