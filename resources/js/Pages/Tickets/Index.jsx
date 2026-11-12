import { useState, lazy, Suspense } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { 
    Ticket, CheckCircle2, XCircle, Clock, AlertCircle, 
    ArrowRight, UserCheck, Shield, Phone, Mail, Building2,
    Check, X, FileText, Search, Filter, RefreshCw, Crown, User,
    Sparkles, ChevronRight, ArrowLeft, ExternalLink, Loader2
} from 'lucide-react';

import { LeanHeader } from '@/Components/CampusFix/LeanHeader';
import { MobileBottomNav } from '@/Components/CampusFix/MobileBottomNav';
import { useLeanTheme } from '@/hooks/useLeanTheme';

const ExportTicketPdfModal = lazy(() => import('@/Components/Tickets/ExportTicketPdfModal').then(m => ({ default: m.ExportTicketPdfModal })));
import axios from 'axios';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';
import { DEPARTMENTS, getDepartmentTheme } from '@/constants/departments';
import { formatToLocalPhone } from '@/utils/phone';

export default function TicketsPage(props) {
    return <TicketsInner {...props} />;
}

function TicketsInner({ 
    tickets, 
    filters = {}, 
    pendingHodCount = 0, 
    pendingAdminCount = 0, 
    adminApprovedCount = 0,
    myTicketsCount = 0,
    myPendingCount = 0,
    departmentHods = {}
}) {
    const { t, lang } = useLanguage();
    const { isDark } = useLeanTheme();
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
        assignAsHod: false,
        processing: false,
        error: '',
    });

    const isUserAdmin = currentUser?.role === 'admin';
    const isUserHOD = Boolean(currentUser?.is_hod);

    const [exportPdfOpen, setExportPdfOpen] = useState(false);
    const [isSyncingSheet, setIsSyncingSheet] = useState(false);
    const [syncToast, setSyncToast] = useState('');

    // State for live WhatsApp verification per ticket (HOD/Admin)
    const [waCheckResults, setWaCheckResults] = useState({});

    const handleCheckWhatsApp = async (ticketId, phone) => {
        if (!phone) return;
        setWaCheckResults(prev => ({
            ...prev,
            [ticketId]: { checking: true, result: null }
        }));
        try {
            const res = await axios.post(route('tickets.checkWhatsApp'), { phone });
            setWaCheckResults(prev => ({
                ...prev,
                [ticketId]: { checking: false, result: res.data }
            }));
        } catch (err) {
            console.error('Failed to check WhatsApp status:', err);
            setWaCheckResults(prev => ({
                ...prev,
                [ticketId]: { 
                    checking: false, 
                    result: { 
                        success: false, 
                        bot_online: false, 
                        message: err.response?.data?.message || 'Gagal mengecek bot WhatsApp.' 
                    } 
                }
            }));
        }
    };

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
            console.error('Failed to sync tickets to spreadsheet:', err);
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

    const getTargetDeptFromTicket = (ticket) => {
        if (!ticket?.requested_value) return '';
        const parts = ticket.requested_value.split('::');
        return parts[0]?.trim() || '';
    };

    const openActionModal = (ticket, action, role) => {
        // If ticket is department_transfer and role is admin, default assignAsHod to applicant's current is_hod status
        const isApplicantHod = Boolean(ticket?.user?.is_hod);
        setActionModal({
            isOpen: true,
            ticket,
            action,
            role,
            notes: '',
            rejectionReason: '',
            assignAsHod: isApplicantHod,
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
            assignAsHod: false,
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
            assign_as_hod: (role === 'admin' && ticket.type === 'department_transfer' && action === 'approve')
                ? actionModal.assignAsHod
                : undefined,
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
        return formatToLocalPhone(phone) || '-';
    };

    const getTypeBadge = (type) => {
        switch (type) {
            case 'account_registration':
                return (
                    <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            isDark
                                ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}
                    >
                        <User className="w-3 h-3" /> {t('ticket_type_account_reg')}
                    </span>
                );
            case 'whatsapp_change':
                return (
                    <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            isDark
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                    >
                        <Phone className="w-3 h-3" /> {t('ticket_type_wa_change')}
                    </span>
                );
            case 'whatsapp_unlink':
                return (
                    <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            isDark
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                    >
                        <Phone className="w-3 h-3 text-rose-500" /> {t('ticket_type_wa_unlink')}
                    </span>
                );
            case 'password_reset':
                return (
                    <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            isDark
                                ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                : 'bg-sky-50 text-sky-700 border-sky-200'
                        }`}
                    >
                        <Shield className="w-3 h-3" /> {t('ticket_type_pwd_reset')}
                    </span>
                );
            case 'department_transfer':
                return (
                    <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            isDark
                                ? 'bg-teal-500/15 text-teal-300 border-teal-500/30'
                                : 'bg-teal-50 text-teal-700 border-teal-200'
                        }`}
                    >
                        <Building2 className="w-3 h-3" /> {t('ticket_type_dept_transfer')}
                    </span>
                );
            case 'name_change':
                return (
                    <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            isDark
                                ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}
                    >
                        <User className="w-3 h-3" /> {lang === 'id' ? 'Ubah Nama' : 'Name Change'}
                    </span>
                );
            default:
                return (
                    <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            isDark
                                ? 'bg-slate-800 text-slate-200 border-slate-700'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                    >
                        {type}
                    </span>
                );
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending_hod':
                return (
                    <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                            isDark
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                                : 'bg-amber-50 text-amber-800 border-amber-300'
                        }`}
                    >
                        <Clock className={`w-3.5 h-3.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} /> {t('ticket_status_pending_hod')}
                    </span>
                );
            case 'pending_admin':
                return (
                    <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                            isDark
                                ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                                : 'bg-sky-50 text-sky-700 border-sky-300'
                        }`}
                    >
                        <Clock className={`w-3.5 h-3.5 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} /> {t('ticket_status_waiting_admin')}
                    </span>
                );
            case 'approved':
                return (
                    <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                            isDark
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        }`}
                    >
                        <CheckCircle2 className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} /> {t('ticket_status_approved')}
                    </span>
                );
            case 'rejected':
                return (
                    <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                            isDark
                                ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                                : 'bg-rose-50 text-rose-700 border-rose-300'
                        }`}
                    >
                        <XCircle className={`w-3.5 h-3.5 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} /> {t('ticket_status_rejected')}
                    </span>
                );
            default:
                return (
                    <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                            isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'
                        }`}
                    >
                        {status}
                    </span>
                );
        }
    };

    return (
        <div
            className={`lean-root ${
                isDark ? 'lean-theme-dark text-slate-100' : 'lean-theme-light text-slate-800'
            } min-h-screen flex flex-col font-sans pb-24 md:pb-12 transition-colors duration-300 w-full max-w-full overflow-x-clip selection:bg-emerald-500 selection:text-white`}
        >
            <Head title={`${t('ticket_center_title')} - Telunas Resort`} />

            <LeanHeader activePage="tickets" />

            <main className="max-w-[1600px] 2xl:max-w-[1760px] w-full flex-1 mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-5">
                {/* Header Banner with Role-Differentiated Scope */}
                <div
                    className={`rounded-2xl p-5 sm:p-7 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 border shadow-lg transition-colors ${
                        isDark
                            ? 'bg-slate-900/80 border-slate-800 backdrop-blur-md'
                            : 'bg-white/95 border-slate-200 shadow-slate-200/60'
                    }`}
                >
                    <div className="flex items-start sm:items-center gap-4">
                        <div
                            className={`p-3.5 rounded-2xl border shadow-xs ${
                                isDark
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                        >
                            <Ticket className="w-7 h-7" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <h1 className={`text-xl sm:text-2xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {t('ticket_center_title')}
                                </h1>

                                {isUserAdmin ? (
                                    <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-600 text-white keep-white shadow-sm flex items-center gap-1.5">
                                        <Shield className="w-3.5 h-3.5" /> {t('ticket_admin_badge')}
                                    </span>
                                ) : isUserHOD ? (
                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-extrabold border shadow-xs flex items-center gap-1.5 ${
                                            isDark
                                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                                : 'bg-amber-100 text-amber-800 border-amber-300'
                                        }`}
                                    >
                                        <Crown className={`w-3.5 h-3.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} /> {t('ticket_hod_badge')} {currentUser?.department ? currentUser.department.toUpperCase() : ''}
                                    </span>
                                ) : (
                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-extrabold border shadow-xs flex items-center gap-1.5 ${
                                            isDark
                                                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                                : 'bg-sky-50 text-sky-700 border-sky-200'
                                        }`}
                                    >
                                        <User className="w-3.5 h-3.5" /> {t('ticket_staff_badge')} — {currentUser?.department ? currentUser.department.toUpperCase() : 'RESORT'}
                                    </span>
                                )}
                            </div>

                            <p className={`text-xs sm:text-sm mt-1.5 max-w-2xl leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
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
                                <div
                                    className={`flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-xs ${
                                        isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                                    }`}
                                >
                                    <div
                                        className={`p-2 rounded-lg border ${
                                            isDark ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-amber-100 text-amber-700 border-amber-200'
                                        }`}
                                    >
                                        <Crown className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('ticket_status_pending_hod')}</p>
                                        <p className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{pendingHodCount}</p>
                                    </div>
                                </div>

                                <div
                                    className={`flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-xs ${
                                        isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                                    }`}
                                >
                                    <div
                                        className={`p-2 rounded-lg border ${
                                            isDark ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-sky-100 text-sky-700 border-sky-200'
                                        }`}
                                    >
                                        <Shield className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('ticket_pending_admin_acc')}</p>
                                        <p className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{pendingAdminCount}</p>
                                    </div>
                                </div>

                                <div
                                    className={`flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-xs ${
                                        isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                                    }`}
                                >
                                    <div
                                        className={`p-2 rounded-lg border ${
                                            isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                        }`}
                                    >
                                        <CheckCircle2 className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('ticket_approved_count')}</p>
                                        <p className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{adminApprovedCount}</p>
                                    </div>
                                </div>
                            </>
                        )}

                        {isUserHOD && !isUserAdmin && (
                            <>
                                <div
                                    className={`flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-xs ${
                                        isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                                    }`}
                                >
                                    <div
                                        className={`p-2 rounded-lg border ${
                                            isDark ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-amber-100 text-amber-700 border-amber-200'
                                        }`}
                                    >
                                        <Crown className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('ticket_hod_review_count')} ({currentUser?.department})</p>
                                        <p className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{pendingHodCount}</p>
                                    </div>
                                </div>

                                <div
                                    className={`flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-xs ${
                                        isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                                    }`}
                                >
                                    <div
                                        className={`p-2 rounded-lg border ${
                                            isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                        }`}
                                    >
                                        <Ticket className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('ticket_my_tickets')}</p>
                                        <p className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{myTicketsCount}</p>
                                    </div>
                                </div>
                            </>
                        )}

                        {!isUserAdmin && !isUserHOD && (
                            <>
                                <div
                                    className={`flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-xs ${
                                        isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                                    }`}
                                >
                                    <div
                                        className={`p-2 rounded-lg border ${
                                            isDark ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-sky-100 text-sky-700 border-sky-200'
                                        }`}
                                    >
                                        <Clock className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('ticket_active_tickets')}</p>
                                        <p className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{myPendingCount}</p>
                                    </div>
                                </div>

                                <div
                                    className={`flex-1 sm:flex-initial flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-xs ${
                                        isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                                    }`}
                                >
                                    <div
                                        className={`p-2 rounded-lg border ${
                                            isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                        }`}
                                    >
                                        <Ticket className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('ticket_total_requests')}</p>
                                        <p className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{myTicketsCount}</p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Alur Verifikasi Timeline Mini Banner */}
                <div
                    className={`px-4 py-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-3 ${
                        isDark
                            ? 'bg-slate-900/60 border-slate-800 text-slate-400'
                            : 'bg-white/90 border-slate-200 text-slate-600'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{t('ticket_two_tier_title')}</span>
                        <span className="hidden sm:inline">{t('ticket_two_tier_flow')}</span>
                        <span className="sm:hidden">{t('ticket_two_tier_flow_short')}</span>
                    </div>
                    <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {isUserAdmin ? (
                            <span className={`font-semibold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{t('ticket_banner_admin')}</span>
                        ) : isUserHOD ? (
                            <span className={`font-semibold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{t('ticket_banner_hod')}</span>
                        ) : (
                            <span className={isDark ? 'text-sky-300' : 'text-sky-700'}>{t('ticket_banner_staff')}</span>
                        )}
                    </div>
                </div>

                {/* Filters & Search Toolbar */}
                <div
                    className={`p-3.5 sm:p-5 rounded-2xl border shadow-lg space-y-3 sm:space-y-4 ${
                        isDark
                            ? 'bg-slate-900/80 border-slate-800 backdrop-blur-md'
                            : 'bg-white/95 border-slate-200'
                    }`}
                >
                    {/* Tier 1: Status Filter Tabs */}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        {[
                            {
                                key: 'all',
                                label: t('ticket_all_status') || 'Semua Status',
                                shortLabel: lang === 'id' ? 'Semua' : 'All',
                            },
                            {
                                key: 'pending_hod',
                                label: isUserAdmin ? `${t('ticket_status_pending_hod')} (Monitor)` : t('ticket_status_pending_hod'),
                                shortLabel: lang === 'id' ? 'Tinjau HOD' : 'HOD Review',
                            },
                            {
                                key: 'pending_admin',
                                label: isUserAdmin ? t('ticket_status_pending_admin') : t('ticket_status_waiting_admin'),
                                shortLabel: isUserAdmin ? (lang === 'id' ? 'ACC Admin' : 'Admin ACC') : (lang === 'id' ? 'Tunggu Admin' : 'Wait Admin'),
                            },
                            {
                                key: 'approved',
                                label: t('ticket_status_approved') || 'Disetujui',
                                shortLabel: t('ticket_status_approved') || 'Disetujui',
                            },
                            {
                                key: 'rejected',
                                label: t('ticket_status_rejected') || 'Ditolak',
                                shortLabel: t('ticket_status_rejected') || 'Ditolak',
                            },
                        ].map(tab => {
                            const isActive = statusFilter === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => {
                                        setStatusFilter(tab.key);
                                        handleFilterChange(tab.key, undefined, undefined, undefined);
                                    }}
                                    className={`flex-1 sm:flex-initial text-center justify-center min-w-[90px] sm:min-w-0 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer select-none border ${
                                        isActive
                                            ? 'bg-emerald-600 border-emerald-500 text-white keep-white shadow-md shadow-emerald-600/20'
                                            : isDark
                                                ? 'bg-slate-950/70 text-slate-400 hover:text-white hover:bg-slate-800 border-slate-800'
                                                : 'bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-slate-200'
                                    }`}
                                >
                                    <span className="hidden sm:inline">{tab.label}</span>
                                    <span className="sm:hidden">{tab.shortLabel}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Tier 2: Search, Filters & Action Controls */}
                    <div
                        className={`pt-3 sm:pt-3.5 border-t flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-3 ${
                            isDark ? 'border-slate-800' : 'border-slate-200'
                        }`}
                    >
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 flex-1 min-w-0">
                            <div className="relative flex-1 min-w-0">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleFilterChange(undefined, undefined, search, undefined)}
                                    placeholder={t('ticket_search_placeholder')}
                                    className={`w-full pl-9 pr-8 py-2 text-xs rounded-xl border focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none ${
                                        isDark
                                            ? 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500'
                                            : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                                    }`}
                                />
                                {search && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearch('');
                                            handleFilterChange(undefined, undefined, '', undefined);
                                        }}
                                        className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full transition-colors cursor-pointer ${
                                            isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-800'
                                        }`}
                                        title="Clear search"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                {isUserAdmin && (
                                    <select
                                        value={departmentFilter}
                                        onChange={(e) => {
                                            setDepartmentFilter(e.target.value);
                                            handleFilterChange(undefined, undefined, undefined, e.target.value);
                                        }}
                                        className={`flex-1 sm:flex-initial border rounded-xl text-xs py-2 px-3 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none cursor-pointer ${
                                            isDark
                                                ? 'bg-slate-950 border-slate-700 text-slate-100'
                                                : 'bg-white border-slate-300 text-slate-900'
                                        }`}
                                    >
                                        <option value="all">{t('all_departments')}</option>
                                        {DEPARTMENTS.map(d => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                )}

                                <select
                                    value={typeFilter}
                                    onChange={(e) => {
                                        setTypeFilter(e.target.value);
                                        handleFilterChange(undefined, e.target.value, undefined, undefined);
                                    }}
                                    className={`flex-1 sm:flex-initial border rounded-xl text-xs py-2 px-3 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none cursor-pointer ${
                                        isDark
                                            ? 'bg-slate-950 border-slate-700 text-slate-100'
                                            : 'bg-white border-slate-300 text-slate-900'
                                    }`}
                                >
                                    <option value="all">{t('ticket_all_types')}</option>
                                    <option value="account_registration">{t('ticket_type_account_reg')}</option>
                                    <option value="whatsapp_change">{t('ticket_type_wa_change')}</option>
                                    <option value="whatsapp_unlink">{t('ticket_type_wa_unlink')}</option>
                                    <option value="password_reset">{t('ticket_type_pwd_reset')}</option>
                                    <option value="department_transfer">{t('ticket_type_dept_transfer')}</option>
                                    <option value="name_change">{lang === 'id' ? 'Perubahan Nama Akun' : 'Name Change'}</option>
                                </select>
                            </div>
                        </div>

                        {/* Right Group: Action Buttons */}
                        <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0 pt-1 sm:pt-0">
                            <button
                                type="button"
                                onClick={() => handleFilterChange(undefined, undefined, search, undefined)}
                                className={`p-2 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                                    isDark
                                        ? 'bg-slate-950 hover:bg-emerald-600 hover:text-white hover:border-emerald-500 text-slate-400 border-slate-800'
                                        : 'bg-slate-100 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 text-slate-600 border-slate-200'
                                }`}
                                title={t('ticket_refresh_btn')}
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>

                            {isUserAdmin && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setExportPdfOpen(true)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white keep-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all shrink-0 cursor-pointer"
                                        title={t('ticket_export_pdf_btn')}
                                    >
                                        <FileText className="w-4 h-4" />
                                        <span className="hidden sm:inline">{t('ticket_export_pdf_btn')}</span>
                                        <span className="sm:hidden">PDF</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSyncSheet}
                                        disabled={isSyncingSheet}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all shrink-0 disabled:opacity-60 cursor-pointer ${
                                            isDark
                                                ? 'bg-slate-950 hover:bg-slate-800 text-emerald-400 border-emerald-500/30'
                                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                        }`}
                                        title={t('ticket_sync_sheet_btn')}
                                    >
                                        {isSyncingSheet ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                        <span className="hidden sm:inline">{t('ticket_sync_sheet_btn')}</span>
                                        <span className="sm:hidden">Sync</span>
                                    </button>
                                    {tickets_sheet_url && (
                                        <a
                                            href={tickets_sheet_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className={`flex items-center gap-1.5 p-2 rounded-xl border transition-colors shrink-0 ${
                                                isDark
                                                    ? 'bg-slate-950 hover:bg-slate-800 text-emerald-300 border-emerald-500/30'
                                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                            }`}
                                            title={t('ticket_open_sheet_btn')}
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sync Toast Feedback */}
                {syncToast && (
                    <div
                        className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 shadow-md ${
                            isDark
                                ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-200'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className={`w-4 h-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                            <span>{syncToast}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSyncToast('')}
                            className={`px-2 py-0.5 text-xs font-bold cursor-pointer ${
                                isDark ? 'text-emerald-400 hover:text-white' : 'text-emerald-700 hover:text-emerald-900'
                            }`}
                        >
                            ✕
                        </button>
                    </div>
                )}

                    {/* Focused Single Ticket Indicator (from notification / direct link) */}
                    {filters?.id && (
                        <div
                            className={`flex items-center justify-between gap-3 p-3.5 rounded-2xl border text-xs shadow-sm ${
                                isDark
                                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-100'
                                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <Ticket className={`w-4 h-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                <span>
                                    {lang === 'id'
                                        ? `Menampilkan tiket spesifik (${tickets?.data?.[0]?.ticket_number ? '#' + tickets.data[0].ticket_number : 'ID #' + filters.id})`
                                        : `Viewing specific ticket (${tickets?.data?.[0]?.ticket_number ? '#' + tickets.data[0].ticket_number : 'ID #' + filters.id})`}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    router.get(route('tickets.index'), {}, { preserveState: true, preserveScroll: true });
                                }}
                                className={`flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                                    isDark
                                        ? 'text-emerald-300 hover:text-white bg-slate-900 hover:bg-slate-800 border-slate-700'
                                        : 'text-emerald-700 hover:text-emerald-900 bg-white hover:bg-emerald-100 border-emerald-200'
                                }`}
                            >
                                <X className="w-3.5 h-3.5" />
                                <span>{lang === 'id' ? 'Tampilkan Semua Tiket' : 'Show All Tickets'}</span>
                            </button>
                        </div>
                    )}

                    {/* Tickets Listing */}
                    {tickets?.data?.length === 0 ? (
                        <div
                            className={`rounded-2xl p-12 text-center border shadow-lg ${
                                isDark
                                    ? 'bg-slate-900/80 backdrop-blur-md border-slate-800'
                                    : 'bg-white/95 border-slate-200 shadow-slate-200/60'
                            }`}
                        >
                            <div
                                className={`w-16 h-16 rounded-full border flex items-center justify-center mx-auto mb-4 ${
                                    isDark
                                        ? 'bg-slate-950 border-slate-800 text-slate-400'
                                        : 'bg-slate-100 border-slate-200 text-slate-500'
                                }`}
                            >
                                <Ticket className="w-8 h-8" />
                            </div>
                            <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{t('ticket_empty_title')}</h3>
                            <p className={`text-xs sm:text-sm mt-1.5 max-w-md mx-auto ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
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
                                        className={`rounded-2xl border shadow-lg p-5 transition-all duration-200 ${
                                            isDark
                                                ? 'bg-slate-900/85 backdrop-blur-md border-slate-800 hover:border-emerald-500/40'
                                                : 'bg-white/95 border-slate-200 shadow-slate-200/60 hover:border-emerald-400'
                                        }`}
                                    >
                                        {/* Header Row: Ticket #, Type, and Status */}
                                        <div
                                            className={`flex flex-wrap items-center justify-between gap-3 pb-4 border-b ${
                                                isDark ? 'border-slate-800' : 'border-slate-200'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                <span
                                                    className={`font-mono text-xs font-bold px-2.5 py-1 rounded-lg border ${
                                                        isDark
                                                            ? 'text-emerald-300 bg-slate-950 border-slate-800'
                                                            : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                                    }`}
                                                >
                                                    #{ticket.ticket_number}
                                                </span>
                                                {getTypeBadge(ticket.type)}
                                                <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
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
                                                <p className={`text-[11px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('ticket_applicant')}</p>
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold ${
                                                            isDark
                                                                ? 'bg-slate-950 border-slate-800 text-emerald-400'
                                                                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                                        }`}
                                                    >
                                                        {ticket.staff_name ? ticket.staff_name.charAt(0).toUpperCase() : '?'}
                                                    </div>
                                                    <div>
                                                        <p className={`font-bold text-sm leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{ticket.staff_name}</p>
                                                        {ticket.email && (
                                                            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{ticket.email}</p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="pt-1 flex items-center gap-2">
                                                    <span
                                                        className="px-2.5 py-0.5 rounded text-[11px] font-bold"
                                                        style={{
                                                            backgroundColor: deptTheme.bg,
                                                            color: deptTheme.text,
                                                        }}
                                                    >
                                                        {ticket.department}
                                                    </span>
                                                    {ticket.subdivision && (
                                                        <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                            • {ticket.subdivision}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Column 2: Requested Detail */}
                                            <div className="space-y-2">
                                                <p className={`text-[11px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('ticket_request_detail')}</p>

                                                {ticket.type === 'account_registration' && (
                                                    <div className="space-y-1">
                                                        <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{t('ticket_requested_wa')}:</span>
                                                        <p className={`font-mono font-bold text-sm ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                                            {formatDisplayPhone(ticket.requested_value)}
                                                        </p>
                                                    </div>
                                                )}

                                                {(ticket.type === 'whatsapp_change' || ticket.type === 'whatsapp_unlink') && (
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{t('ticket_old_wa')}:</span>
                                                            <span className={`font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>{formatDisplayPhone(ticket.current_value)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{t('ticket_requested')}:</span>
                                                            <span className={`font-mono font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                                                {ticket.requested_value ? formatDisplayPhone(ticket.requested_value) : t('ticket_unlink_number')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Live WhatsApp Verification Widget (for HOD / Admin) */}
                                                {(isUserHOD || isUserAdmin) && (ticket.type === 'account_registration' || (ticket.type === 'whatsapp_change' && ticket.requested_value)) && (
                                                    <div
                                                        className={`mt-2.5 p-2.5 rounded-xl border text-[11px] space-y-2 ${
                                                            isDark
                                                                ? 'bg-slate-950/80 border-slate-800'
                                                                : 'bg-slate-50 border-slate-200'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className={`font-semibold flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                                                <Phone className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                                                <span>Status WhatsApp:</span>
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCheckWhatsApp(ticket.id, ticket.requested_value)}
                                                                disabled={waCheckResults[ticket.id]?.checking}
                                                                className={`px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 font-medium disabled:opacity-50 text-[10px] cursor-pointer ${
                                                                    isDark
                                                                        ? 'bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-100 border-slate-700'
                                                                        : 'bg-white hover:bg-emerald-600 hover:text-white text-slate-700 border-slate-300'
                                                                }`}
                                                                title="Cek apakah nomor ini aktif di WhatsApp"
                                                            >
                                                                {waCheckResults[ticket.id]?.checking ? (
                                                                    <>
                                                                        <Loader2 className={`w-3 h-3 animate-spin ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                                                        <span>Mengecek...</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <RefreshCw className="w-3 h-3" />
                                                                        <span>Cek WhatsApp</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>

                                                        {/* Check Result Display */}
                                                        {waCheckResults[ticket.id]?.result && (
                                                            <div className={`pt-1.5 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                                                {waCheckResults[ticket.id].result.bot_online && waCheckResults[ticket.id].result.exists === true && (
                                                                    <div className={`flex items-center gap-1.5 font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                                                                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                                                        <span>Nomor terdaftar & aktif di WhatsApp.</span>
                                                                    </div>
                                                                )}

                                                                {waCheckResults[ticket.id].result.bot_online && waCheckResults[ticket.id].result.exists === false && (
                                                                    <div
                                                                        className={`p-2 rounded-lg border space-y-1 ${
                                                                            isDark
                                                                                ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                                                                                : 'bg-rose-50 border-rose-200 text-rose-800'
                                                                        }`}
                                                                    >
                                                                        <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-rose-400' : 'text-rose-700'}`}>
                                                                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                                            <span>Nomor TIDAK terdaftar di WhatsApp!</span>
                                                                        </div>
                                                                        <p className={`text-[10px] ${isDark ? 'text-rose-200' : 'text-rose-700'}`}>
                                                                            Nomor ini tidak memiliki akun WhatsApp aktif. Disarankan untuk menolak atau meminta staf mengecek nomornya.
                                                                        </p>
                                                                    </div>
                                                                )}

                                                                {!waCheckResults[ticket.id].result.bot_online && (
                                                                    <div
                                                                        className={`p-2 rounded-lg border space-y-1.5 ${
                                                                            isDark
                                                                                ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                                                                                : 'bg-amber-50 border-amber-200 text-amber-900'
                                                                        }`}
                                                                    >
                                                                        <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                                                                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                                            <span>Bot WhatsApp Sedang Offline</span>
                                                                        </div>
                                                                        <p className={`text-[10px] leading-relaxed ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>
                                                                            Sistem tidak dapat memeriksa nomor otomatis saat ini. <strong>Disarankan untuk mengecek manual nomor WhatsApp pemohon sebelum menyetujui akun.</strong>
                                                                        </p>
                                                                        <a
                                                                            href={`https://wa.me/${ticket.requested_value ? ('62' + String(ticket.requested_value).replace(/^0+/, '')) : ''}`}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white keep-white font-semibold text-[10px] transition-colors"
                                                                        >
                                                                            <ExternalLink className="w-3 h-3" />
                                                                            <span>Buka Chat WhatsApp (Cek Manual)</span>
                                                                        </a>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {ticket.type === 'password_reset' && (
                                                    <div className="space-y-1">
                                                        <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{t('ticket_pwd_reset_title')}</p>
                                                        <p className={`text-[11px] italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                            {t('ticket_pwd_reset_hint')}
                                                        </p>
                                                    </div>
                                                )}

                                                {ticket.type === 'department_transfer' && (
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{t('ticket_origin_dept')}:</span>
                                                            <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{ticket.current_value || ticket.department}</span>
                                                            {ticket.user?.is_hod && (
                                                                <span
                                                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                                                        isDark
                                                                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                                                            : 'bg-amber-100 text-amber-800 border-amber-300'
                                                                    }`}
                                                                >
                                                                    HOD
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{t('ticket_target_dept')}:</span>
                                                            <span className={`font-bold ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>
                                                                {ticket.requested_value ? ticket.requested_value.replace('::', ' — ') : '-'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {ticket.type === 'name_change' && (
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{lang === 'id' ? 'Nama Saat Ini:' : 'Current Name:'}</span>
                                                            <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{ticket.current_value || ticket.staff_name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{lang === 'id' ? 'Nama Baru Diminta:' : 'Requested Name:'}</span>
                                                            <span className={`font-bold ${isDark ? 'text-indigo-300' : 'text-indigo-700'}`}>
                                                                {ticket.requested_value || '-'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {ticket.reason && (
                                                    <div
                                                        className={`p-2.5 rounded-xl border text-[11px] mt-2 ${
                                                            isDark
                                                                ? 'bg-slate-950/70 border-slate-800 text-slate-300'
                                                                : 'bg-slate-50 border-slate-200 text-slate-600'
                                                        }`}
                                                    >
                                                        <strong className={isDark ? 'text-white' : 'text-slate-900'}>{ticket.type === 'account_registration' ? t('ticket_desc_label') : t('ticket_reason_label')}:</strong> {ticket.reason}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Column 3: Verification Log Tracker */}
                                            <div
                                                className={`space-y-2.5 p-3.5 rounded-xl border ${
                                                    isDark
                                                        ? 'bg-slate-950/60 border-slate-800'
                                                        : 'bg-slate-50 border-slate-200'
                                                }`}
                                            >
                                                <p className={`text-[11px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('ticket_audit_trail')}</p>

                                                {/* Step 1: HOD Review */}
                                                <div className="text-[11px] space-y-0.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{t('ticket_step_hod')}:</span>
                                                        {ticket.hod_reviewed_at ? (
                                                            <span className={`font-semibold flex items-center gap-1 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                                                                <Check className="w-3 h-3" /> {t('ticket_completed')}
                                                            </span>
                                                        ) : (ticket.type === 'department_transfer' && ticket.user?.is_hod && !ticket.hod_id) ? (
                                                            <span className={`font-semibold flex items-center gap-1 ${isDark ? 'text-teal-400' : 'text-teal-700'}`}>
                                                                <Check className="w-3 h-3" /> {lang === 'id' ? 'Bypass (Pemohon HOD)' : 'Bypassed (HOD Applicant)'}
                                                            </span>
                                                        ) : (
                                                            <span className={`font-medium ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>{t('ticket_status_pending_hod')}</span>
                                                        )}
                                                    </div>
                                                    {ticket.hod && <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>{t('ticket_by_label')}: {ticket.hod.name}</p>}
                                                    {ticket.hod_notes && <p className={`italic ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>"{ticket.hod_notes}"</p>}
                                                    {ticket.type === 'department_transfer' && ticket.user?.is_hod && !ticket.hod_id && (
                                                        <p className={`italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{lang === 'id' ? 'Permohonan HOD langsung ke Admin' : 'HOD request routed directly to Admin'}</p>
                                                    )}
                                                </div>

                                                {/* Step 2: Admin ACC */}
                                                <div className={`text-[11px] space-y-0.5 pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                                    <div className="flex items-center justify-between">
                                                        <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{t('ticket_step_admin')}:</span>
                                                        {ticket.admin_reviewed_at ? (
                                                            <span className={`font-semibold flex items-center gap-1 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                                                                <Check className="w-3 h-3" /> {t('ticket_completed')}
                                                            </span>
                                                        ) : (
                                                            <span className={`font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('ticket_status_waiting_admin')}</span>
                                                        )}
                                                    </div>
                                                    {ticket.admin && <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>{t('ticket_by_label')}: {ticket.admin.name}</p>}
                                                    {ticket.admin_notes && <p className={`italic ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>"{ticket.admin_notes}"</p>}
                                                </div>

                                                {/* Rejection Alert Box */}
                                                {ticket.rejection_reason && (
                                                    <div
                                                        className={`pt-2 text-[11px] p-2.5 rounded-lg border ${
                                                            isDark
                                                                ? 'text-rose-300 bg-rose-950/40 border-rose-800/60'
                                                                : 'text-rose-800 bg-rose-50 border-rose-200'
                                                        }`}
                                                    >
                                                        <strong className={isDark ? 'text-rose-200' : 'text-rose-900'}>{t('ticket_rejection_reason_label')}:</strong> {ticket.rejection_reason}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Buttons Row */}
                                        <div
                                            className={`pt-3.5 border-t flex flex-wrap items-center justify-between gap-3 ${
                                                isDark ? 'border-slate-800' : 'border-slate-200'
                                            }`}
                                        >
                                            {/* Left: Role Context info */}
                                            <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                {!isUserAdmin && !isUserHOD && (
                                                    <span>{t('ticket_info_staff')}</span>
                                                )}
                                                {isUserHOD && !isUserAdmin && (
                                                    <span>{t('ticket_info_hod')}</span>
                                                )}
                                                {isUserAdmin && (
                                                    ticket.status === 'pending_hod' ? (
                                                        <span className={`font-medium inline-flex items-center gap-1.5 ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                                                            <Clock className={`w-3.5 h-3.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} /> {t('ticket_monitoring_hod')}
                                                        </span>
                                                    ) : (
                                                        <span>{t('ticket_info_admin')}</span>
                                                    )
                                                )}
                                            </div>

                                            {/* Right: Approval/Rejection Actions */}
                                            <div className="flex items-center gap-2">
                                                {/* Admin Monitoring Badge (No action button on pending_hod) */}
                                                {isUserAdmin && ticket.status === 'pending_hod' && !canHodReview && (
                                                    <span
                                                        className={`px-3 py-1 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
                                                            isDark
                                                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                                                                : 'bg-amber-50 text-amber-800 border-amber-300'
                                                        }`}
                                                    >
                                                        <Clock className={`w-3.5 h-3.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                                                        {lang === 'id' ? 'Menunggu HoD (Hanya Melihat)' : 'Pending HoD (View Only)'}
                                                    </span>
                                                )}
                                                {/* HOD Review Actions */}
                                                {canHodReview && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => openActionModal(ticket, 'reject', 'hod')}
                                                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                                                                isDark
                                                                    ? 'border-rose-500/40 text-rose-300 hover:bg-rose-500/15 hover:border-rose-500/70'
                                                                    : 'border-rose-300 text-rose-700 bg-rose-50/70 hover:bg-rose-100 hover:border-rose-400'
                                                            }`}
                                                        >
                                                            <X className="w-3.5 h-3.5" /> {t('ticket_btn_reject_hod')}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openActionModal(ticket, 'approve', 'hod')}
                                                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white keep-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                                                        >
                                                            <Check className="w-3.5 h-3.5" /> {t('ticket_btn_approve_hod')}
                                                        </button>
                                                    </>
                                                )}

                                                {/* Admin Final Review Actions */}
                                                {canAdminReview && !canHodReview && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => openActionModal(ticket, 'reject', 'admin')}
                                                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                                                                isDark
                                                                    ? 'border-rose-500/40 text-rose-300 hover:bg-rose-500/15 hover:border-rose-500/70'
                                                                    : 'border-rose-300 text-rose-700 bg-rose-50/70 hover:bg-rose-100 hover:border-rose-400'
                                                            }`}
                                                        >
                                                            <X className="w-3.5 h-3.5" /> {t('ticket_btn_reject_admin')}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openActionModal(ticket, 'approve', 'admin')}
                                                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white keep-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
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

            {/* Action Modal (Approval / Rejection) */}
            {actionModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
                    <div
                        className={`rounded-2xl max-w-lg w-full p-6 shadow-2xl border ${
                            isDark
                                ? 'bg-slate-900 border-slate-800 text-slate-100'
                                : 'bg-white border-slate-200 text-slate-900'
                        }`}
                    >
                        <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                            <h3 className={`text-base font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {actionModal.action === 'approve' ? (
                                    <>
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                        <span>{t('ticket_modal_confirm_title')}</span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-5 h-5 text-rose-500" />
                                        <span>{t('ticket_modal_reject_title')}</span>
                                    </>
                                )}
                            </h3>
                            <button
                                type="button"
                                onClick={closeActionModal}
                                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                                    isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={submitAction} className="mt-4 space-y-4">
                            <div
                                className={`p-3.5 rounded-xl text-xs space-y-1 border ${
                                    isDark
                                        ? 'bg-slate-950/80 text-slate-400 border-slate-800'
                                        : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}
                            >
                                <p><strong className={isDark ? 'text-white' : 'text-slate-900'}>{t('ticket_modal_ticket_num')}:</strong> #{actionModal.ticket?.ticket_number}</p>
                                <p><strong className={isDark ? 'text-white' : 'text-slate-900'}>{t('ticket_modal_applicant')}:</strong> {actionModal.ticket?.staff_name} ({actionModal.ticket?.department})</p>
                                <p className="flex items-center gap-2">
                                    <strong className={isDark ? 'text-white' : 'text-slate-900'}>{t('ticket_modal_type')}:</strong> {getTypeBadge(actionModal.ticket?.type)}
                                </p>
                            </div>

                            {actionModal.action === 'approve' && actionModal.role === 'admin' && actionModal.ticket?.type === 'department_transfer' && (() => {
                                const targetDept = getTargetDeptFromTicket(actionModal.ticket);
                                const existingHods = departmentHods[targetDept] || [];
                                const isApplicantCurrentHod = Boolean(actionModal.ticket?.user?.is_hod);

                                return (
                                    <div
                                        className={`p-3.5 rounded-xl border space-y-3 ${
                                            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <label className={`text-xs font-bold flex items-center gap-1.5 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                                <Crown className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                                                <span>{lang === 'id' ? 'Penetapan Peran di Departemen Baru:' : 'Role Assignment in Target Dept:'}</span>
                                            </label>
                                            {isApplicantCurrentHod && (
                                                <span
                                                    className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                                                        isDark
                                                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                                            : 'bg-amber-100 text-amber-800 border-amber-300'
                                                    }`}
                                                >
                                                    {lang === 'id' ? 'Pemohon: HOD' : 'Applicant: HOD'}
                                                </span>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            {/* Option 1: Tetapkan Sebagai HOD */}
                                            <label className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                                                actionModal.assignAsHod
                                                    ? (isDark
                                                        ? 'bg-emerald-500/15 border-emerald-500 text-white'
                                                        : 'bg-emerald-50 border-emerald-500 text-slate-900')
                                                    : (isDark
                                                        ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                                                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300')
                                            }`}>
                                                <input
                                                    type="radio"
                                                    name="assign_as_hod"
                                                    checked={actionModal.assignAsHod === true}
                                                    onChange={() => setActionModal(prev => ({ ...prev, assignAsHod: true }))}
                                                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                />
                                                <div className="text-xs">
                                                    <p className={`font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                        <Crown className={`w-3.5 h-3.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                                                        <span>{lang === 'id' ? 'Tetapkan sebagai Head of Department (HOD)' : 'Assign as Head of Department (HOD)'}</span>
                                                    </p>
                                                    <p className={`text-[11px] mt-0.5 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        {lang === 'id'
                                                            ? `Pengguna akan memegang hak akses & wewenang pimpinan di departemen ${targetDept || 'tujuan'}.`
                                                            : `User will hold HOD permissions and leadership in ${targetDept || 'target dept'}.`}
                                                    </p>
                                                </div>
                                            </label>

                                            {/* Option 2: Pindah sebagai Staf Biasa */}
                                            <label className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                                                actionModal.assignAsHod === false
                                                    ? (isDark
                                                        ? 'bg-amber-500/15 border-amber-500/60 text-white'
                                                        : 'bg-amber-50 border-amber-500 text-slate-900')
                                                    : (isDark
                                                        ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                                                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300')
                                            }`}>
                                                <input
                                                    type="radio"
                                                    name="assign_as_hod"
                                                    checked={actionModal.assignAsHod === false}
                                                    onChange={() => setActionModal(prev => ({ ...prev, assignAsHod: false }))}
                                                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                />
                                                <div className="text-xs">
                                                    <p className={`font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                        <User className={`w-3.5 h-3.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                                                        <span>{lang === 'id' ? 'Pindah sebagai Staf Biasa (Cabut status HOD)' : 'Transfer as Regular Staff (Revoke HOD status)'}</span>
                                                    </p>
                                                    <p className={`text-[11px] mt-0.5 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        {lang === 'id'
                                                            ? 'Hak akses pimpinan dicabut. Pengguna menjadi Department User biasa.'
                                                            : 'Leadership role revoked. User will become a regular Department User.'}
                                                    </p>
                                                </div>
                                            </label>
                                        </div>

                                        {/* Warning if Target Department already has active HOD(s) */}
                                        {existingHods.length > 0 && (
                                            <div
                                                className={`p-2.5 rounded-xl border text-[11px] space-y-1 ${
                                                    isDark
                                                        ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                                                        : 'bg-amber-50 border-amber-200 text-amber-900'
                                                }`}
                                            >
                                                <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                    <span>{lang === 'id' ? 'Info: Departemen Tujuan Sudah Memiliki HOD' : 'Info: Target Department Already Has an HOD'}</span>
                                                </div>
                                                <p className={`leading-relaxed ${isDark ? 'text-amber-200/90' : 'text-amber-800'}`}>
                                                    {lang === 'id'
                                                        ? `Departemen ${targetDept} saat ini dipimpin oleh: `
                                                        : `Department ${targetDept} is currently headed by: `}
                                                    <strong className={isDark ? 'text-white' : 'text-slate-900'}>
                                                        {existingHods.map(h => `${h.staff_name || h.name}${h.hod_title ? ` (${h.hod_title})` : ''}`).join(', ')}
                                                    </strong>.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {actionModal.action === 'reject' ? (
                                <div>
                                    <label className={`block text-xs font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {t('ticket_modal_reject_reason_label')} <span className="text-rose-500">*</span>
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={actionModal.rejectionReason}
                                        onChange={(e) => setActionModal(prev => ({ ...prev, rejectionReason: e.target.value }))}
                                        placeholder={t('ticket_modal_reject_reason_placeholder')}
                                        className={`w-full text-xs rounded-xl border p-2.5 focus:outline-none focus:ring-1 ${
                                            isDark
                                                ? 'bg-slate-950 border-rose-900/60 focus:border-rose-500 focus:ring-rose-500 text-slate-100 placeholder-slate-500'
                                                : 'bg-slate-50 border-rose-300 focus:border-rose-500 focus:ring-rose-500 text-slate-900 placeholder-slate-400'
                                        }`}
                                        required
                                    />
                                    <p className={`mt-1 text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {t('ticket_modal_reject_reason_hint')}
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <label className={`block text-xs font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {t('ticket_modal_notes_label')}
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={actionModal.notes}
                                        onChange={(e) => setActionModal(prev => ({ ...prev, notes: e.target.value }))}
                                        placeholder={t('ticket_modal_notes_placeholder')}
                                        className={`w-full text-xs rounded-xl border p-2.5 focus:outline-none focus:ring-1 ${
                                            isDark
                                                ? 'bg-slate-950 border-slate-800 focus:border-emerald-500 focus:ring-emerald-500 text-slate-100 placeholder-slate-500'
                                                : 'bg-slate-50 border-slate-300 focus:border-emerald-500 focus:ring-emerald-500 text-slate-900 placeholder-slate-400'
                                        }`}
                                    />
                                </div>
                            )}

                            {actionModal.error && (
                                <div
                                    className={`p-3 border text-xs rounded-xl ${
                                        isDark
                                            ? 'bg-rose-950/50 border-rose-800/60 text-rose-300'
                                            : 'bg-rose-50 border-rose-200 text-rose-700'
                                    }`}
                                >
                                    {actionModal.error}
                                </div>
                            )}

                            <div className={`flex items-center justify-end gap-2 pt-3 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <button
                                    type="button"
                                    onClick={closeActionModal}
                                    disabled={actionModal.processing}
                                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                                        isDark
                                            ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                    }`}
                                >
                                    {t('ticket_modal_btn_cancel')}
                                </button>

                                <button
                                    type="submit"
                                    disabled={actionModal.processing}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-md cursor-pointer ${
                                        actionModal.action === 'approve'
                                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white keep-white'
                                            : 'bg-rose-600 hover:bg-rose-500 text-white keep-white'
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
            {isUserAdmin && exportPdfOpen && (
                <Suspense fallback={null}>
                    <ExportTicketPdfModal
                        open={exportPdfOpen}
                        onOpenChange={setExportPdfOpen}
                        currentUser={currentUser}
                    />
                </Suspense>
            )}

            <MobileBottomNav currentTab="tickets" />
        </div>
    );
}
