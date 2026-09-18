import { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { 
    Ticket, CheckCircle2, XCircle, Clock, AlertCircle, 
    ArrowRight, UserCheck, Shield, Phone, Mail, Building2,
    Check, X, FileText, Search, Filter, RefreshCw, Crown, User,
    Sparkles, ChevronRight, ArrowLeft, ExternalLink, Loader2
} from 'lucide-react';

import { IssuesProvider } from '@/context/IssuesContext';
import { CampusFixHeader } from '@/Components/CampusFix/CampusFixHeader';
import { MobileBottomNav } from '@/Components/CampusFix/MobileBottomNav';
import { ExportTicketPdfModal } from '@/Components/Tickets/ExportTicketPdfModal';
import axios from 'axios';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';
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
    const { t, lang } = useLanguage();
    const { user: currentUser } = useAuth();
    const { tickets_sheet_url } = usePage().props;
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

    const [exportPdfOpen, setExportPdfOpen] = useState(false);
    const [isSyncingSheet, setIsSyncingSheet] = useState(false);
    const [syncToast, setSyncToast] = useState('');

    const handleSyncSheet = async () => {
        if (isSyncingSheet) return;
        setIsSyncingSheet(true);
        setSyncToast('');
        try {
            const res = await axios.post('/tickets/sync-sheet');
            if (res.data?.success) {
                setSyncToast(res.data.message || t('ticket_sync_success_toast'));
                setTimeout(() => setSyncToast(''), 5000);
            }
        } catch (err) {
            setSyncToast(t('ticket_sync_failed_toast'));
            setTimeout(() => setSyncToast(''), 5000);
        } finally {
            setIsSyncingSheet(false);
        }
    };

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
            setActionModal(prev => ({ ...prev, error: t('ticket_modal_reject_reason_required') }));
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
                    error: errs.message || errs.rejection_reason || t('ticket_modal_error_default') 
                }));
            },
        });
    };

    const formatDisplayPhone = (phone) => {
        if (!phone || phone === '-') return '-';
        let digits = String(phone).replace(/\D/g, '');
        if (digits.startsWith('00')) digits = digits.slice(2);
        else if (digits.startsWith('0')) digits = digits.slice(1);
        if (digits.startsWith('8')) digits = '62' + digits;
        if (!digits) return '-';
        return `+${digits}`;
    };

    const getTypeBadge = (type) => {
        switch (type) {
            case 'account_registration':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                        <User className="w-3 h-3" /> {t('ticket_type_account_reg')}
                    </span>
                );
            case 'whatsapp_change':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <Phone className="w-3 h-3" /> {t('ticket_type_wa_change')}
                    </span>
                );
            case 'whatsapp_unlink':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        <Phone className="w-3 h-3 text-rose-400" /> {t('ticket_type_wa_unlink')}
                    </span>
                );
            case 'password_reset':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                        <Shield className="w-3 h-3" /> {t('ticket_type_pwd_reset')}
                    </span>
                );
            case 'department_transfer':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/15 text-teal-300 border border-teal-500/30">
                        <Building2 className="w-3 h-3" /> {t('ticket_type_dept_transfer')}
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
                        <Clock className="w-3.5 h-3.5 text-amber-400" /> {t('ticket_status_pending_hod')}
                    </span>
                );
            case 'pending_admin':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/40">
                        <Clock className="w-3.5 h-3.5 text-sky-400" /> {t('ticket_status_waiting_admin')}
                    </span>
                );
            case 'approved':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> {t('ticket_status_approved')}
                    </span>
                );
            case 'rejected':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/40">
                        <XCircle className="w-3.5 h-3.5 text-rose-400" /> {t('ticket_status_rejected')}
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
            <Head title={`${t('ticket_center_title')} - Telunas Resort`} />

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
                                        {t('ticket_center_title')}
                                    </h1>

                                    {/* Role Identity Badge */}
                                    {isUserAdmin ? (
                                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-[#C9AA71] text-[#1C1B0E] shadow-md shadow-[#C9AA71]/20 flex items-center gap-1.5">
                                            <Shield className="w-3.5 h-3.5" /> {t('ticket_admin_badge')}
                                        </span>
                                    ) : isUserHOD ? (
                                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-md flex items-center gap-1.5">
                                            <Crown className="w-3.5 h-3.5 text-amber-400" /> {t('ticket_hod_badge')} {currentUser?.department ? currentUser.department.toUpperCase() : ''}
                                        </span>
                                    ) : (
                                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-md flex items-center gap-1.5">
                                            <User className="w-3.5 h-3.5" /> {t('ticket_staff_badge')} — {currentUser?.department ? currentUser.department.toUpperCase() : 'RESORT'}
                                        </span>
                                    )}
                                </div>

                                <p className="text-xs sm:text-sm text-[#A19F8D] mt-1.5 max-w-2xl leading-relaxed">
                                    {isUserAdmin ? (
                                        t('ticket_admin_desc')
                                    ) : isUserHOD ? (
                                        t('ticket_hod_desc')
                                    ) : (
                                        t('ticket_staff_desc')
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
                                            <p className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider">{t('ticket_pending_admin_acc')}</p>
                                            <p className="text-lg font-extrabold text-[#FAFAFA]">{pendingAdminCount}</p>
                                        </div>
                                    </div>

                                    <div className="flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#1C1B0E]/70 border border-[#3B3929] shadow-md">
                                        <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                            <CheckCircle2 className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider">{t('ticket_approved_count')}</p>
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
                                            <p className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider">{t('ticket_hod_review_count')} ({currentUser?.department})</p>
                                            <p className="text-lg font-extrabold text-[#FAFAFA]">{pendingHodCount}</p>
                                        </div>
                                    </div>

                                    <div className="flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#1C1B0E]/70 border border-[#3B3929] shadow-md">
                                        <div className="p-2 rounded-lg bg-[#C9AA71]/15 text-[#C9AA71] border border-[#C9AA71]/30">
                                            <Ticket className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider">{t('ticket_my_tickets')}</p>
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
                                            <p className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider">{t('ticket_active_tickets')}</p>
                                            <p className="text-lg font-extrabold text-[#FAFAFA]">{myPendingCount}</p>
                                        </div>
                                    </div>

                                    <div className="flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#1C1B0E]/70 border border-[#3B3929] shadow-md">
                                        <div className="p-2 rounded-lg bg-[#C9AA71]/15 text-[#C9AA71] border border-[#C9AA71]/30">
                                            <Ticket className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider">{t('ticket_total_requests')}</p>
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
                            <span className="font-medium text-[#FAFAFA]">{t('ticket_two_tier_title')}</span>
                            <span className="hidden sm:inline">{t('ticket_two_tier_flow')}</span>
                            <span className="sm:hidden">{t('ticket_two_tier_flow_short')}</span>
                        </div>
                        <div className="text-[11px] text-[#A19F8D]">
                            {isUserAdmin ? (
                                <span className="text-[#C9AA71] font-semibold">{t('ticket_banner_admin')}</span>
                            ) : isUserHOD ? (
                                <span className="text-amber-300 font-semibold">{t('ticket_banner_hod')}</span>
                            ) : (
                                <span className="text-sky-300">{t('ticket_banner_staff')}</span>
                            )}
                        </div>
                    </div>

                    {/* Filters & Search Toolbar */}
                    <div className="bg-[#2A281E]/90 backdrop-blur-md p-4 rounded-2xl border border-[#3B3929] shadow-xl flex flex-col lg:flex-row gap-4 items-center justify-between">
                        {/* Status Tabs */}
                        <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto pb-2 lg:pb-0 scrollbar-none">
                            {[
                                { key: 'all', label: t('ticket_all_status') },
                                ...(isUserAdmin ? [] : [{ key: 'pending_hod', label: t('ticket_status_pending_hod') }]),
                                { key: 'pending_admin', label: isUserAdmin ? t('ticket_status_pending_admin') : t('ticket_status_waiting_admin') },
                                { key: 'approved', label: t('ticket_status_approved') },
                                { key: 'rejected', label: t('ticket_status_rejected') },
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
                                    <option value="all">{t('all_departments')}</option>
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
                                <option value="all">{t('ticket_all_types')}</option>
                                {(isUserAdmin || isUserHOD) && (
                                    <option value="account_registration">{t('ticket_type_account_reg')}</option>
                                )}
                                <option value="whatsapp_change">{t('ticket_type_wa_change')}</option>
                                <option value="whatsapp_unlink">{t('ticket_type_wa_unlink')}</option>
                                <option value="password_reset">{t('ticket_type_pwd_reset')}</option>
                                <option value="department_transfer">{t('ticket_type_dept_transfer')}</option>
                            </select>

                            {/* Search Input */}
                            <div className="relative flex-1 sm:w-64">
                                <Search className="w-4 h-4 text-[#A19F8D] absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleFilterChange(undefined, undefined, search, undefined)}
                                    placeholder={t('ticket_search_placeholder')}
                                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] placeholder-[#A19F8D]/60 focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71]"
                                />
                            </div>

                            {/* Refresh Button */}
                            <button
                                onClick={() => handleFilterChange(undefined, undefined, search, undefined)}
                                className="p-2 rounded-xl bg-[#1C1B0E] hover:bg-[#C9AA71] hover:text-[#1C1B0E] text-[#A19F8D] border border-[#3B3929] transition-colors"
                                title={t('ticket_refresh_btn')}
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>

                            {/* Admin Controls: Export PDF & Google Spreadsheet */}
                            {isUserAdmin && (
                                <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                                    <button
                                        type="button"
                                        onClick={() => setExportPdfOpen(true)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-[#C9AA71] to-[#B39355] hover:brightness-110 text-[#1C1B0E] font-bold text-xs shadow-md transition-all shrink-0"
                                        title={t('ticket_export_pdf_btn')}
                                    >
                                        <FileText className="w-4 h-4" />
                                        <span className="hidden sm:inline">{t('ticket_export_pdf_btn')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSyncSheet}
                                        disabled={isSyncingSheet}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1C1B0E] hover:bg-[#2A281E] text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-all shrink-0 disabled:opacity-60"
                                        title={t('ticket_sync_sheet_btn')}
                                    >
                                        {isSyncingSheet ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                        <span className="hidden sm:inline">{t('ticket_sync_sheet_btn')}</span>
                                    </button>
                                    {tickets_sheet_url && (
                                        <a
                                            href={tickets_sheet_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-1.5 p-2 rounded-xl bg-[#1C1B0E] hover:bg-[#2A281E] text-emerald-300 border border-emerald-500/30 transition-colors shrink-0"
                                            title={t('ticket_open_sheet_btn')}
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sync Toast Feedback */}
                    {syncToast && (
                        <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-950/60 text-emerald-200 text-xs flex items-center justify-between gap-3 shadow-lg">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span>{syncToast}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSyncToast('')}
                                className="text-emerald-400 hover:text-white px-2 py-0.5 text-xs font-bold"
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    {/* Tickets Listing */}
                    {tickets?.data?.length === 0 ? (
                        <div className="bg-[#2A281E]/80 backdrop-blur-md rounded-2xl p-12 text-center border border-[#3B3929] shadow-xl">
                            <div className="w-16 h-16 rounded-full bg-[#1C1B0E] border border-[#3B3929] flex items-center justify-center mx-auto mb-4 text-[#A19F8D]">
                                <Ticket className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-[#FAFAFA]">{t('ticket_empty_title')}</h3>
                            <p className="text-xs sm:text-sm text-[#A19F8D] mt-1.5 max-w-md mx-auto">
                                {!isUserAdmin && !isUserHOD
                                    ? t('ticket_empty_staff')
                                    : t('ticket_empty_filter')}
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
                                                    {t('ticket_submitted_at')}: {new Date(ticket.created_at).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
                                                <p className="text-[11px] uppercase font-bold text-[#A19F8D] tracking-wider">{t('ticket_applicant')}</p>
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
                                                <p className="text-[11px] uppercase font-bold text-[#A19F8D] tracking-wider">{t('ticket_request_detail')}</p>
                                                
                                                {ticket.type === 'account_registration' && (
                                                    <div className="space-y-1">
                                                        <span className="text-[#A19F8D]">{t('ticket_requested_wa')}:</span>
                                                        <p className="font-mono font-bold text-[#C9AA71] text-sm">
                                                            {formatDisplayPhone(ticket.requested_value)}
                                                        </p>
                                                    </div>
                                                )}

                                                {(ticket.type === 'whatsapp_change' || ticket.type === 'whatsapp_unlink') && (
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[#A19F8D]">{t('ticket_old_wa')}:</span>
                                                            <span className="font-mono text-[#FAFAFA]">{formatDisplayPhone(ticket.current_value)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[#A19F8D]">{t('ticket_requested')}:</span>
                                                            <span className="font-mono font-bold text-emerald-400">
                                                                {ticket.requested_value ? formatDisplayPhone(ticket.requested_value) : t('ticket_unlink_number')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {ticket.type === 'password_reset' && (
                                                    <div className="space-y-1">
                                                        <p className="text-[#FAFAFA] font-medium">{t('ticket_pwd_reset_title')}</p>
                                                        <p className="text-[#A19F8D] text-[11px] italic">
                                                            {t('ticket_pwd_reset_hint')}
                                                        </p>
                                                    </div>
                                                )}

                                                {ticket.type === 'department_transfer' && (
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[#A19F8D]">{t('ticket_origin_dept')}:</span>
                                                            <span className="font-semibold text-[#FAFAFA]">{ticket.current_value || ticket.department}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[#A19F8D]">{t('ticket_target_dept')}:</span>
                                                            <span className="font-bold text-teal-300">
                                                                {ticket.requested_value ? ticket.requested_value.replace('::', ' — ') : '-'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {ticket.reason && (
                                                    <div className="p-2.5 rounded-xl bg-[#1C1B0E]/70 border border-[#3B3929] text-[11px] text-[#A19F8D] mt-2">
                                                        <strong className="text-[#FAFAFA]">{t('ticket_reason_label')}:</strong> {ticket.reason}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Column 3: Verification Log Tracker */}
                                            <div className="space-y-2.5 bg-[#1C1B0E]/60 p-3.5 rounded-xl border border-[#3B3929]">
                                                <p className="text-[11px] uppercase font-bold text-[#A19F8D] tracking-wider">{t('ticket_audit_trail')}</p>
                                                
                                                {/* Step 1: HOD Review */}
                                                <div className="text-[11px] space-y-0.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-[#FAFAFA]">{t('ticket_step_hod')}:</span>
                                                        {ticket.hod_reviewed_at ? (
                                                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                                                <Check className="w-3 h-3" /> {t('ticket_completed')}
                                                            </span>
                                                        ) : (
                                                            <span className="text-amber-400 font-medium">{t('ticket_status_pending_hod')}</span>
                                                        )}
                                                    </div>
                                                    {ticket.hod && <p className="text-[#A19F8D]">{t('ticket_by_label')}: {ticket.hod.name}</p>}
                                                    {ticket.hod_notes && <p className="text-[#E3D1AA] italic">"{ticket.hod_notes}"</p>}
                                                </div>

                                                {/* Step 2: Admin ACC */}
                                                <div className="text-[11px] space-y-0.5 pt-2 border-t border-[#3B3929]">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-[#FAFAFA]">{t('ticket_step_admin')}:</span>
                                                        {ticket.admin_reviewed_at ? (
                                                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                                                <Check className="w-3 h-3" /> {t('ticket_completed')}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[#A19F8D] font-medium">{t('ticket_status_waiting_admin')}</span>
                                                        )}
                                                    </div>
                                                    {ticket.admin && <p className="text-[#A19F8D]">{t('ticket_by_label')}: {ticket.admin.name}</p>}
                                                    {ticket.admin_notes && <p className="text-[#E3D1AA] italic">"{ticket.admin_notes}"</p>}
                                                </div>

                                                {/* Rejection Alert Box */}
                                                {ticket.rejection_reason && (
                                                    <div className="pt-2 text-[11px] text-rose-300 bg-rose-950/40 p-2.5 rounded-lg border border-rose-800/60">
                                                        <strong className="text-rose-200">{t('ticket_rejection_reason_label')}:</strong> {ticket.rejection_reason}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Buttons Row */}
                                        <div className="pt-3.5 border-t border-[#3B3929]/70 flex flex-wrap items-center justify-between gap-3">
                                            {/* Left: Role Context info */}
                                            <div className="text-[11px] text-[#A19F8D]">
                                                {!isUserAdmin && !isUserHOD && (
                                                    <span>{t('ticket_info_staff')}</span>
                                                )}
                                                {isUserHOD && !isUserAdmin && (
                                                    <span>{t('ticket_info_hod')}</span>
                                                )}
                                                {isUserAdmin && (
                                                    <span>{t('ticket_info_admin')}</span>
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
                                                            <X className="w-3.5 h-3.5" /> {t('ticket_btn_reject_hod')}
                                                        </button>
                                                        <button
                                                            onClick={() => openActionModal(ticket, 'approve', 'hod')}
                                                            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#C9AA71] to-[#B39355] text-[#1C1B0E] font-bold text-xs flex items-center gap-1.5 shadow-md shadow-[#C9AA71]/20 hover:brightness-110 transition-all"
                                                        >
                                                            <Check className="w-3.5 h-3.5" /> {t('ticket_btn_approve_hod')}
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
                                                            <X className="w-3.5 h-3.5" /> {t('ticket_btn_reject_admin')}
                                                        </button>
                                                        <button
                                                            onClick={() => openActionModal(ticket, 'approve', 'admin')}
                                                            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-900/30 transition-all"
                                                        >
                                                            <Check className="w-3.5 h-3.5" /> {t('ticket_btn_approve_admin')}
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
                                        <span>{t('ticket_modal_confirm_title')}</span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-5 h-5 text-rose-400" />
                                        <span>{t('ticket_modal_reject_title')}</span>
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
                                <p><strong className="text-[#FAFAFA]">{t('ticket_modal_ticket_num')}:</strong> #{actionModal.ticket?.ticket_number}</p>
                                <p><strong className="text-[#FAFAFA]">{t('ticket_modal_applicant')}:</strong> {actionModal.ticket?.staff_name} ({actionModal.ticket?.department})</p>
                                <p className="flex items-center gap-2">
                                    <strong className="text-[#FAFAFA]">{t('ticket_modal_type')}:</strong> {getTypeBadge(actionModal.ticket?.type)}
                                </p>
                            </div>

                            {actionModal.action === 'reject' ? (
                                <div>
                                    <label className="block text-xs font-bold text-[#FAFAFA] mb-1">
                                        {t('ticket_modal_reject_reason_label')} <span className="text-rose-400">*</span>
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={actionModal.rejectionReason}
                                        onChange={(e) => setActionModal(prev => ({ ...prev, rejectionReason: e.target.value }))}
                                        placeholder={t('ticket_modal_reject_reason_placeholder')}
                                        className="w-full text-xs rounded-xl bg-[#1C1B0E] border border-rose-900/60 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-[#FAFAFA] placeholder-[#A19F8D]/50"
                                        required
                                    />
                                    <p className="mt-1 text-[11px] text-[#A19F8D]">
                                        {t('ticket_modal_reject_reason_hint')}
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-bold text-[#FAFAFA] mb-1">
                                        {t('ticket_modal_notes_label')}
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={actionModal.notes}
                                        onChange={(e) => setActionModal(prev => ({ ...prev, notes: e.target.value }))}
                                        placeholder={t('ticket_modal_notes_placeholder')}
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
                                    {t('ticket_modal_btn_cancel')}
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
                                    {actionModal.processing ? t('ticket_modal_processing') : (actionModal.action === 'approve' ? t('ticket_modal_btn_confirm_approve') : t('ticket_modal_btn_confirm_reject'))}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Ekspor PDF Rekapitulasi Tiket (Admin Only) */}
            {isUserAdmin && (
                <ExportTicketPdfModal
                    open={exportPdfOpen}
                    onOpenChange={setExportPdfOpen}
                    currentUser={currentUser}
                />
            )}

            <MobileBottomNav />
        </div>
    );
}
