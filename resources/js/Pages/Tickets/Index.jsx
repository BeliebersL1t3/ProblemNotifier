import { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { 
    Ticket, CheckCircle2, XCircle, Clock, AlertCircle, 
    ArrowRight, UserCheck, Shield, Phone, Mail, Building2,
    Check, X, FileText, Search, Filter, RefreshCw
} from 'lucide-react';

import { IssuesProvider } from '@/context/IssuesContext';
import { CampusFixHeader } from '@/Components/CampusFix/CampusFixHeader';
import { MobileBottomNav } from '@/Components/CampusFix/MobileBottomNav';
import { useAuth } from '@/hooks/useAuth';

export default function TicketsPage(props) {
    return (
        <IssuesProvider>
            <TicketsInner {...props} />
        </IssuesProvider>
    );
}

function TicketsInner({ tickets, filters, pendingHodCount, pendingAdminCount }) {
    const { user: currentUser } = useAuth();
    const [search, setSearch] = useState(filters?.search || '');
    const [statusFilter, setStatusFilter] = useState(filters?.status || 'all');
    const [typeFilter, setTypeFilter] = useState(filters?.type || 'all');

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

    const handleFilterChange = (newStatus, newType, newSearch) => {
        router.get(route('tickets.index'), {
            status: newStatus !== undefined ? newStatus : statusFilter,
            type: newType !== undefined ? newType : typeFilter,
            search: newSearch !== undefined ? newSearch : search,
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
                return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">Pendaftaran Akun</span>;
            case 'whatsapp_change':
                return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">Ganti WhatsApp</span>;
            case 'whatsapp_unlink':
                return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">Lepas WhatsApp</span>;
            case 'password_reset':
                return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">Reset Password</span>;
            default:
                return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800">{type}</span>;
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending_hod':
                return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-3 h-3" /> Menunggu HOD</span>;
            case 'pending_admin':
                return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"><Clock className="w-3 h-3" /> Menunggu Admin</span>;
            case 'approved':
                return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3" /> Disetujui (ACC)</span>;
            case 'rejected':
                return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"><XCircle className="w-3 h-3" /> Ditolak</span>;
            default:
                return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">{status}</span>;
        }
    };

    const isUserAdmin = currentUser?.role === 'admin';
    const isUserHOD = currentUser?.is_hod;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 pb-20">
            <Head title="Pusat Persetujuan Tiket & Akun" />
            <CampusFixHeader />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
                {/* Header Title & Badges */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/80 mb-6">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                                <Ticket className="w-6 h-6" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                                    Pusat Persetujuan Tiket & Akun
                                </h1>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Kelola permohonan registrasi staf, nomor WhatsApp, dan reset password dengan alur persetujuan HOD & Admin.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Stats Highlights */}
                    <div className="flex flex-wrap items-center gap-3">
                        {isUserHOD && (
                            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs font-medium">
                                <Clock className="w-4 h-4 text-amber-600" />
                                <span>Menunggu HOD: <strong>{pendingHodCount}</strong></span>
                            </div>
                        )}
                        {isUserAdmin && (
                            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-50 border border-indigo-200/80 text-indigo-900 text-xs font-medium">
                                <Shield className="w-4 h-4 text-indigo-600" />
                                <span>Menunggu ACC Admin: <strong>{pendingAdminCount}</strong></span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Filters Bar */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-col md:flex-row gap-3 items-center justify-between">
                    {/* Status Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
                        {[
                            { key: 'all', label: 'Semua' },
                            { key: 'pending_hod', label: 'Menunggu HOD' },
                            { key: 'pending_admin', label: 'Menunggu Admin' },
                            { key: 'approved', label: 'Disetujui' },
                            { key: 'rejected', label: 'Ditolak' },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => {
                                    setStatusFilter(tab.key);
                                    handleFilterChange(tab.key, undefined, undefined);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                                    statusFilter === tab.key
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Search and Type Filter */}
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <select
                            value={typeFilter}
                            onChange={(e) => {
                                setTypeFilter(e.target.value);
                                handleFilterChange(undefined, e.target.value, undefined);
                            }}
                            className="rounded-lg border-slate-200 text-xs py-1.5 focus:border-indigo-500 focus:ring-indigo-500"
                        >
                            <option value="all">Semua Tipe</option>
                            <option value="account_registration">Pendaftaran Akun</option>
                            <option value="whatsapp_change">Ganti WhatsApp</option>
                            <option value="whatsapp_unlink">Lepas WhatsApp</option>
                            <option value="password_reset">Reset Password</option>
                        </select>

                        <div className="relative flex-1 md:w-64">
                            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleFilterChange(undefined, undefined, search)}
                                placeholder="Cari tiket, staf, email..."
                                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"
                            />
                        </div>

                        <button
                            onClick={() => handleFilterChange(undefined, undefined, search)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
                            title="Refresh"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Tickets List */}
                {tickets?.data?.length === 0 ? (
                    <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
                        <Ticket className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <h3 className="text-base font-semibold text-slate-800">Tidak Ada Tiket Ditemukan</h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                            Tidak ada permohonan tiket yang cocok dengan kriteria filter saat ini.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {tickets?.data?.map((ticket) => {
                            const canHodReview = (ticket.status === 'pending_hod') && (isUserAdmin || (isUserHOD && currentUser?.department === ticket.department));
                            const canAdminReview = isUserAdmin && (ticket.status === 'pending_admin' || ticket.status === 'pending_hod');

                            return (
                                <div 
                                    key={ticket.id} 
                                    className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 transition hover:shadow-md"
                                >
                                    {/* Top Row: Ticket Number, Type, Status */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-sm font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                                                #{ticket.ticket_number}
                                            </span>
                                            {getTypeBadge(ticket.type)}
                                        </div>
                                        <div>
                                            {getStatusBadge(ticket.status)}
                                        </div>
                                    </div>

                                    {/* Content Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4 text-xs">
                                        {/* Col 1: Staf / Pemohon Info */}
                                        <div className="space-y-1.5">
                                            <p className="text-slate-400 font-medium">Pemohon</p>
                                            <p className="font-semibold text-slate-900 text-sm">{ticket.staff_name}</p>
                                            <div className="flex items-center gap-1.5 text-slate-600">
                                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                                <span>{ticket.department}{ticket.subdivision ? ` • ${ticket.subdivision}` : ''}</span>
                                            </div>
                                            {ticket.email && (
                                                <div className="flex items-center gap-1.5 text-slate-600">
                                                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                                                    <span>{ticket.email}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Col 2: Data Perubahan */}
                                        <div className="space-y-1.5">
                                            <p className="text-slate-400 font-medium">Detail Permohonan</p>
                                            {ticket.type === 'account_registration' && (
                                                <div>
                                                    <p className="text-slate-700">Nomor WhatsApp Terdaftar:</p>
                                                    <p className="font-mono font-semibold text-indigo-600">+{ticket.requested_value}</p>
                                                </div>
                                            )}
                                            {(ticket.type === 'whatsapp_change' || ticket.type === 'whatsapp_unlink') && (
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-slate-500">Nomor Lama (Aktif):</span>
                                                        <span className="font-mono text-slate-800">+{ticket.current_value || '-'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-slate-500">Diajukan:</span>
                                                        <span className="font-mono font-semibold text-emerald-600">
                                                            {ticket.requested_value ? `+${ticket.requested_value}` : 'Lepas Nomor (Unlink)'}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                            {ticket.type === 'password_reset' && (
                                                <div>
                                                    <p className="text-slate-700">Reset Password Diajukan</p>
                                                    <p className="text-slate-500 italic">Password baru akan diterapkan setelah ACC Final Admin.</p>
                                                </div>
                                            )}
                                            {ticket.reason && (
                                                <p className="text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 mt-1">
                                                    <strong>Alasan:</strong> {ticket.reason}
                                                </p>
                                            )}
                                        </div>

                                        {/* Col 3: Riwayat Verifikasi */}
                                        <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                            <p className="text-slate-400 font-medium">Pemeriksaan</p>
                                            
                                            {/* HOD Status */}
                                            <div className="text-[11px]">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-semibold text-slate-700">1. HOD Review:</span>
                                                    {ticket.hod_reviewed_at ? (
                                                        <span className="text-emerald-600 font-medium">✓ Selesai</span>
                                                    ) : (
                                                        <span className="text-amber-600 font-medium">Menunggu</span>
                                                    )}
                                                </div>
                                                {ticket.hod && <p className="text-slate-500">Oleh: {ticket.hod.name}</p>}
                                                {ticket.hod_notes && <p className="text-slate-600 italic">"{ticket.hod_notes}"</p>}
                                            </div>

                                            {/* Admin Status */}
                                            <div className="text-[11px] pt-1 border-t border-slate-200">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-semibold text-slate-700">2. Admin ACC:</span>
                                                    {ticket.admin_reviewed_at ? (
                                                        <span className="text-emerald-600 font-medium">✓ Selesai</span>
                                                    ) : (
                                                        <span className="text-slate-400 font-medium">Menunggu</span>
                                                    )}
                                                </div>
                                                {ticket.admin && <p className="text-slate-500">Oleh: {ticket.admin.name}</p>}
                                                {ticket.admin_notes && <p className="text-slate-600 italic">"{ticket.admin_notes}"</p>}
                                            </div>

                                            {/* Rejection Reason if any */}
                                            {ticket.rejection_reason && (
                                                <div className="pt-1 text-[11px] text-rose-700 bg-rose-50 p-1.5 rounded border border-rose-200">
                                                    <strong>Alasan Penolakan:</strong> {ticket.rejection_reason}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Buttons Row */}
                                    {(canHodReview || canAdminReview) && (
                                        <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
                                            {canHodReview && (
                                                <>
                                                    <button
                                                        onClick={() => openActionModal(ticket, 'reject', 'hod')}
                                                        className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-medium flex items-center gap-1.5"
                                                    >
                                                        <X className="w-3.5 h-3.5" /> Tolak (HOD)
                                                    </button>
                                                    <button
                                                        onClick={() => openActionModal(ticket, 'approve', 'hod')}
                                                        className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                                                    >
                                                        <Check className="w-3.5 h-3.5" /> Setujui HOD (Teruskan ke Admin)
                                                    </button>
                                                </>
                                            )}

                                            {canAdminReview && !canHodReview && (
                                                <>
                                                    <button
                                                        onClick={() => openActionModal(ticket, 'reject', 'admin')}
                                                        className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-medium flex items-center gap-1.5"
                                                    >
                                                        <X className="w-3.5 h-3.5" /> Tolak Tiket
                                                    </button>
                                                    <button
                                                        onClick={() => openActionModal(ticket, 'approve', 'admin')}
                                                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                                                    >
                                                        <Check className="w-3.5 h-3.5" /> ACC Final (Admin)
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Action Modal (Approval / Rejection) */}
            {actionModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                {actionModal.action === 'approve' ? (
                                    <>
                                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                        <span>Konfirmasi Persetujuan Tiket</span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-5 h-5 text-rose-600" />
                                        <span>Penolakan Tiket (Wajib Alasan)</span>
                                    </>
                                )}
                            </h3>
                            <button
                                onClick={closeActionModal}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={submitAction} className="mt-4 space-y-4">
                            <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1 text-slate-700 border border-slate-100">
                                <p><strong>Nomor Tiket:</strong> #{actionModal.ticket?.ticket_number}</p>
                                <p><strong>Staf:</strong> {actionModal.ticket?.staff_name} ({actionModal.ticket?.department})</p>
                                <p><strong>Jenis:</strong> {getTypeBadge(actionModal.ticket?.type)}</p>
                            </div>

                            {actionModal.action === 'reject' ? (
                                <div>
                                    <label className="block text-xs font-bold text-slate-800 mb-1">
                                        Alasan Penolakan <span className="text-rose-500">*</span>
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={actionModal.rejectionReason}
                                        onChange={(e) => setActionModal(prev => ({ ...prev, rejectionReason: e.target.value }))}
                                        placeholder="Tuliskan alasan penolakan secara jelas. Alasan ini akan ditampilkan kepada pengguna saat mencoba login atau menerima notifikasi WhatsApp..."
                                        className="w-full text-xs rounded-lg border-slate-300 focus:border-rose-500 focus:ring-rose-500"
                                        required
                                    />
                                    <p className="mt-1 text-[11px] text-slate-400">
                                        Alasan ini wajib diisi sesuai kebijakan Telunas Resort.
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-bold text-slate-800 mb-1">
                                        Catatan Persetujuan (Opsional)
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={actionModal.notes}
                                        onChange={(e) => setActionModal(prev => ({ ...prev, notes: e.target.value }))}
                                        placeholder="Catatan tambahan untuk pemohon atau admin..."
                                        className="w-full text-xs rounded-lg border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>
                            )}

                            {actionModal.error && (
                                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                                    {actionModal.error}
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={closeActionModal}
                                    disabled={actionModal.processing}
                                    className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
                                >
                                    Batal
                                </button>

                                <button
                                    type="submit"
                                    disabled={actionModal.processing}
                                    className={`px-4 py-2 rounded-lg text-xs font-semibold text-white shadow-sm transition ${
                                        actionModal.action === 'approve'
                                            ? 'bg-emerald-600 hover:bg-emerald-700'
                                            : 'bg-rose-600 hover:bg-rose-700'
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
