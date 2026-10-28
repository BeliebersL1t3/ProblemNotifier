import React, { useState, useEffect, useMemo } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import { 
    AlertTriangle, 
    CheckCircle2, 
    Clock, 
    Plus, 
    Camera, 
    RefreshCw, 
    X, 
    ChevronRight, 
    User, 
    MapPin, 
    Building2, 
    ShieldCheck, 
    Trash2, 
    Filter,
    Check,
    ArrowLeft,
    Image as ImageIcon,
    AlertCircle,
    ExternalLink,
    LogIn,
    Power,
    MessageSquare,
    Table,
    LayoutGrid,
    SlidersHorizontal,
    Search,
    Eye,
    EyeOff,
    RotateCcw,
    BarChart3,
    Sparkles,
    Sun,
    Moon,
    Compass,
    Wrench,
    LayoutDashboard
} from 'lucide-react';
import axios from 'axios';
import { BotControlModal } from '@/Components/CampusFix/BotControlModal';
import { LeanAnalyticsView } from '@/Components/CampusFix/LeanAnalyticsView';



const URGENCY_COLORS = {
    'Darurat': '#f43f5e',
    'Tinggi': '#fb923c',
    'Sedang': '#facc15',
    'Rendah': '#10b981',
};

const COLUMN_DEFS = [
    { id: 'id', label: 'ID Isu', icon: '#' },
    { id: 'photo', label: 'Foto Bukti', icon: '📷' },
    { id: 'title', label: 'Judul Masalah', icon: '📝' },
    { id: 'category', label: 'Kategori AI', icon: '🤖' },
    { id: 'location', label: 'Lokasi', icon: '📍' },
    { id: 'dept', label: 'Departemen Tujuan', icon: '🏢' },
    { id: 'reporter', label: 'Nama Pelapor', icon: '👤' },
    { id: 'desc', label: 'Deskripsi Detail', icon: '📄' },
    { id: 'status', label: 'Status', icon: '🏷️' },
    { id: 'time', label: 'Waktu Pelaporan', icon: '🕒' },
];

const DEFAULT_COLUMNS = {
    id: true,
    photo: true,
    title: true,
    category: true,
    location: true,
    dept: true,
    reporter: true,
    desc: true,
    status: true,
    time: true,
};

export default function LeanIndex({ issues = [], departments = [], locations = ['TBR', 'TPI', 'Kantor'], currentUser = null, aiPendingCount = 0 }) {
    // --- Supervisor Account Info (Universal for all supervisors) ---
    const myName = currentUser?.name || 'Supervisor';
    const myDept = 'Supervisor';

    const [isRetryingAi, setIsRetryingAi] = useState(false);

    const handleRetryAi = () => {
        setIsRetryingAi(true);
        router.post('/lapangan/ai/retry', {}, {
            preserveScroll: true,
            onFinish: () => setIsRetryingAi(false),
        });
    };

    // --- UI Filters & View Modes ---
    // Department Filter: 'all' | specific department
    const [selectedDeptFilter, setSelectedDeptFilter] = useState('all');

    // --- ERP Customization States ---
    const [visibleColumns, setVisibleColumns] = useState(() => {
        try {
            const saved = localStorage.getItem('lean_erp_columns');
            if (saved) return { ...DEFAULT_COLUMNS, ...JSON.parse(saved) };
        } catch (e) {}
        return DEFAULT_COLUMNS;
    });

    const [viewMode, setViewMode] = useState(() => {
        return localStorage.getItem('lean_erp_view_mode') || 'table';
    });

    // Multi-select status checklist
    const [selectedStatuses, setSelectedStatuses] = useState({
        open: true,
        in_progress: true,
        pending: true,
        resolved: true,
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [showColumnModal, setShowColumnModal] = useState(false);
    const [activeAnalyticsTab, setActiveAnalyticsTab] = useState('executive');

    // Save preferences to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('lean_erp_columns', JSON.stringify(visibleColumns));
        } catch (e) {}
    }, [visibleColumns]);

    useEffect(() => {
        try {
            localStorage.setItem('lean_erp_view_mode', viewMode);
        } catch (e) {}
    }, [viewMode]);

    // Theme preference (dark / light) with LocalStorage persistence
    const [theme, setTheme] = useState(() => {
        try {
            return localStorage.getItem('telunas_field_theme') || 'dark';
        } catch (e) {
            return 'dark';
        }
    });

    const isDark = theme === 'dark';

    useEffect(() => {
        try {
            localStorage.setItem('telunas_field_theme', theme);
        } catch (e) {}
    }, [theme]);

    const toggleColumn = (colId) => {
        setVisibleColumns((prev) => ({ ...prev, [colId]: !prev[colId] }));
    };

    const setAllColumns = (val) => {
        const next = {};
        COLUMN_DEFS.forEach((c) => { next[c.id] = val; });
        setVisibleColumns(next);
    };

    const resetColumns = () => {
        setVisibleColumns(DEFAULT_COLUMNS);
    };

    const toggleStatus = (statusKey) => {
        setSelectedStatuses((prev) => {
            const next = { ...prev, [statusKey]: !prev[statusKey] };
            const hasAny = Object.values(next).some(Boolean);
            return hasAny ? next : prev;
        });
    };

    const setStatusPreset = (preset) => {
        if (preset === 'all') {
            setSelectedStatuses({ open: true, in_progress: true, pending: true, resolved: true });
        } else if (preset === 'active') {
            setSelectedStatuses({ open: true, in_progress: true, pending: true, resolved: false });
        } else if (preset === 'resolved') {
            setSelectedStatuses({ open: false, in_progress: false, pending: false, resolved: true });
        }
    };

    const activeColumnCount = useMemo(() => {
        return Object.values(visibleColumns).filter(Boolean).length;
    }, [visibleColumns]);

    // --- WhatsApp Bot V2 Control State ---
    const [botControlModalOpen, setBotControlModalOpen] = useState(false);
    const [botStatus, setBotStatus] = useState(null);

    const fetchBotStatus = async () => {
        try {
            const res = await axios.get('/api/bot/status');
            if (res.data) {
                setBotStatus(res.data);
            }
        } catch (e) {}
    };

    useEffect(() => {
        fetchBotStatus();
        const timer = setInterval(fetchBotStatus, 5000);
        return () => clearInterval(timer);
    }, []);

    // --- Real-time Auto-refresh Polling (Every 4 seconds for fresh issues sync) ---
    useEffect(() => {
        const pollTimer = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                router.reload({
                    only: ['issues', 'aiPendingCount'],
                    preserveScroll: true,
                    preserveState: true,
                });
            }
        }, 4000);

        return () => clearInterval(pollTimer);
    }, []);

    // --- Modal States ---
    const [selectedDetailIssue, setSelectedDetailIssue] = useState(null);
    const [showReportModal, setShowReportModal] = useState(false);
    const [showResolveModal, setShowResolveModal] = useState(null); // issue object
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [lightboxImage, setLightboxImage] = useState(null);
    const [issueToDelete, setIssueToDelete] = useState(null);
    const [deleteSupervisorName, setDeleteSupervisorName] = useState(myName || 'Supervisor');
    const [isDeleting, setIsDeleting] = useState(false);

    // Keep activeDetailIssue reactively in sync with fresh issues from polling
    const activeDetailIssue = useMemo(() => {
        if (!selectedDetailIssue) return null;
        return issues.find((i) => i.id === selectedDetailIssue.id) || selectedDetailIssue;
    }, [issues, selectedDetailIssue]);

    // --- Report Form State ---
    const [formMainLoc, setFormMainLoc] = useState('TBR');
    const [formDetailLoc, setFormDetailLoc] = useState('');
    const [formTitle, setFormTitle] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formTargetDepts, setFormTargetDepts] = useState(['Engineer']);
    const [formImage, setFormImage] = useState(null);
    const [formImagePreview, setFormImagePreview] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- Resolve Form State ---
    const [resolveNote, setResolveNote] = useState('');
    const [resolveImage, setResolveImage] = useState(null);
    const [resolveImagePreview, setResolveImagePreview] = useState(null);

    // Toggle target department in form
    const toggleTargetDept = (dept) => {
        setFormTargetDepts((prev) => {
            if (prev.includes(dept)) {
                if (prev.length === 1) return prev; // Keep at least one
                return prev.filter((d) => d !== dept);
            }
            return [...prev, dept];
        });
    };

    // Handle Report Image selection
    const handleImageChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setFormImage(file);
            setFormImagePreview(URL.createObjectURL(file));
        }
    };

    // Handle Resolve Image selection
    const handleResolveImageChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setResolveImage(file);
            setResolveImagePreview(URL.createObjectURL(file));
        }
    };

    // Submit Report
    const handleReportSubmit = (e) => {
        e.preventDefault();
        if (!formTitle.trim() || formTargetDepts.length === 0) {
            alert('Mohon isi judul masalah dan departemen tujuan.');
            return;
        }

        const fullLocation = formDetailLoc.trim()
            ? `${formMainLoc} - ${formDetailLoc.trim()}`
            : formMainLoc;

        setIsSubmitting(true);
        const data = new FormData();
        data.append('location', fullLocation);
        data.append('title', formTitle.trim());
        data.append('description', formDescription);
        formTargetDepts.forEach((d) => data.append('target_departments[]', d));
        data.append('reporter_name', myName);
        data.append('reporter_dept', myDept);
        if (formImage) {
            data.append('image', formImage);
        }

        router.post('/lapangan/issues', data, {
            onSuccess: () => {
                setShowReportModal(false);
                setFormDetailLoc('');
                setFormTitle('');
                setFormDescription('');
                setFormImage(null);
                setFormImagePreview(null);
                setIsSubmitting(false);
            },
            onError: () => setIsSubmitting(false),
        });
    };

    // Trigger ACC for a department
    const handleAcc = (issueId, dept) => {
        router.post(`/lapangan/issues/${issueId}/acc`, {
            dept: dept,
            staff_name: myName,
        }, { preserveScroll: true });
    };

    // Trigger Claim
    const handleClaim = (issueId) => {
        router.post(`/lapangan/issues/${issueId}/claim`, {
            dept: myDept,
            staff_name: myName,
        }, { preserveScroll: true });
    };

    // Trigger Resolve
    const handleResolveSubmit = (e) => {
        e.preventDefault();
        if (!showResolveModal) return;

        setIsSubmitting(true);
        const data = new FormData();
        data.append('dept', myDept);
        data.append('staff_name', myName);
        data.append('note', resolveNote);
        if (resolveImage) {
            data.append('proof_image', resolveImage);
        }

        router.post(`/lapangan/issues/${showResolveModal.id}/resolve`, data, {
            onSuccess: () => {
                setShowResolveModal(null);
                setResolveNote('');
                setResolveImage(null);
                setResolveImagePreview(null);
                setIsSubmitting(false);
            },
            onError: () => setIsSubmitting(false),
        });
    };

    // Trigger Reset Sandbox
    const handleResetSandbox = () => {
        router.post('/lapangan/reset', {}, {
            onSuccess: () => setShowResetConfirm(false),
        });
    };

    // Trigger Soft Delete Issue
    const handleDeleteConfirm = () => {
        if (!issueToDelete) return;
        setIsDeleting(true);
        router.delete(`/lapangan/issues/${issueToDelete.id}`, {
            data: {
                deleted_by: deleteSupervisorName.trim() || myName || 'Supervisor',
            },
            preserveScroll: true,
            onSuccess: () => {
                setIssueToDelete(null);
                setIsDeleting(false);
                if (selectedDetailIssue?.id === issueToDelete.id) {
                    setSelectedDetailIssue(null);
                }
            },
            onError: () => {
                setIsDeleting(false);
                alert('Gagal menghapus tiket. Silakan coba lagi.');
            },
        });
    };

    // --- Filter Issues based on Status Checklist, Department & Live Search ---
    const filteredIssues = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return issues.filter((item) => {
            // 1. Department filter (all vs 1 dept)
            if (selectedDeptFilter !== 'all') {
                const targets = item.target_departments || [];
                const matches = targets.some((d) => d.toLowerCase() === selectedDeptFilter.toLowerCase());
                if (!matches) return false;
            }

            // 2. Status checklist filtering
            if (!selectedStatuses[item.status]) {
                return false;
            }

            // 3. Live Search
            if (q) {
                const code = (item.issue_code || ('LEAN-' + item.id)).toLowerCase();
                const title = (item.title || '').toLowerCase();
                const desc = (item.description || '').toLowerCase();
                const loc = (item.location || '').toLowerCase();
                const rep = (item.reporter_name || '').toLowerCase();
                const dept = (item.reporter_dept || '').toLowerCase();
                const targetsStr = (item.target_departments || []).join(' ').toLowerCase();
                if (
                    !code.includes(q) &&
                    !title.includes(q) &&
                    !desc.includes(q) &&
                    !loc.includes(q) &&
                    !rep.includes(q) &&
                    !dept.includes(q) &&
                    !targetsStr.includes(q)
                ) {
                    return false;
                }
            }

            return true;
        });
    }, [issues, selectedStatuses, selectedDeptFilter, searchQuery]);

    // Counters for status filters and totals
    const counts = useMemo(() => {
        const total = issues.length;

        // Base items for accurate status breakdown
        const baseItems = issues.filter((item) => {
            if (selectedDeptFilter !== 'all') {
                const targets = item.target_departments || [];
                if (!targets.some((d) => d.toLowerCase() === selectedDeptFilter.toLowerCase())) return false;
            }
            return true;
        });

        const open = baseItems.filter((i) => i.status === 'open').length;
        const inProgress = baseItems.filter((i) => i.status === 'in_progress').length;
        const pending = baseItems.filter((i) => i.status === 'pending').length;
        const resolved = baseItems.filter((i) => i.status === 'resolved').length;

        return { total, open, inProgress, pending, resolved };
    }, [issues, selectedDeptFilter]);

    return (
        <div className={`lean-root ${isDark ? 'lean-theme-dark text-slate-100' : 'lean-theme-light text-slate-800'} flex flex-col font-sans pb-24 md:pb-12 transition-colors duration-300`}>
            <Head title="Mode Lapangan (Sandbox) — Telunas Issue Tracker" />

            {/* TOP HEADER */}
            <header className={`sticky top-0 z-30 backdrop-blur-md border-b px-4 sm:px-6 lg:px-8 py-2.5 shadow-xs transition-colors duration-200 ${
                isDark
                    ? 'bg-slate-900/95 border-slate-800 shadow-slate-950/40'
                    : 'bg-white/95 border-slate-200 shadow-slate-200/50'
            }`}>
                <div className="w-full flex items-center justify-between gap-3 flex-wrap lg:flex-nowrap">
                    {/* Brand & Sandbox Pill */}
                    <div className="flex items-center gap-2.5 shrink-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm border shadow-xs ${
                            isDark ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                            📱
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <h1 className={`text-sm font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    Mode Lapangan
                                </h1>
                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full border ${
                                    isDark ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-800'
                                }`}>
                                    Sandbox
                                </span>
                            </div>
                            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Telunas Resorts Tracker</p>
                        </div>
                    </div>

                    {/* Analytics 3 Tabs (Centered in Header when in Analytics View) */}
                    {viewMode === 'analytics' && (
                        <div className={`flex items-center gap-1 p-1 rounded-xl border shrink-0 overflow-x-auto max-w-full order-last lg:order-none w-full lg:w-auto justify-center ${
                            isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200 shadow-xs'
                        }`}>
                            <button
                                type="button"
                                onClick={() => setActiveAnalyticsTab('executive')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                                    activeAnalyticsTab === 'executive'
                                        ? 'bg-teal-500 text-slate-950 shadow-sm shadow-teal-500/30'
                                        : isDark
                                        ? 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                                }`}
                            >
                                <Compass className="w-3.5 h-3.5" />
                                <span>Ringkasan Eksekutif</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveAnalyticsTab('maintenance')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                                    activeAnalyticsTab === 'maintenance'
                                        ? 'bg-teal-500 text-slate-950 shadow-sm shadow-teal-500/30'
                                        : isDark
                                        ? 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                                }`}
                            >
                                <Wrench className="w-3.5 h-3.5" />
                                <span>Maintenance</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveAnalyticsTab('sla_performance')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                                    activeAnalyticsTab === 'sla_performance'
                                        ? 'bg-teal-500 text-slate-950 shadow-sm shadow-teal-500/30'
                                        : isDark
                                        ? 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                                }`}
                            >
                                <Clock className="w-3.5 h-3.5" />
                                <span>Performa & SLA</span>
                            </button>
                        </div>
                    )}

                    {/* Profile & Navigation Switcher & Bot Controls */}
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Quick Theme Toggle (Icon Only) */}
                        <button
                            type="button"
                            onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                            className={`h-8.5 w-8.5 flex items-center justify-center rounded-lg border transition-all shadow-xs cursor-pointer ${
                                isDark
                                    ? 'bg-slate-800/90 hover:bg-slate-700 text-amber-300 border-slate-700'
                                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                            title={isDark ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
                            aria-label="Toggle Tema"
                        >
                            {isDark ? (
                                <Sun className="w-4 h-4 text-amber-400" />
                            ) : (
                                <Moon className="w-4 h-4 text-slate-600" />
                            )}
                        </button>

                        {/* WhatsApp Bot V2 Status & Control Button */}
                        <button
                            type="button"
                            onClick={() => setBotControlModalOpen(true)}
                            className={`h-8.5 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-bold transition-all shadow-xs cursor-pointer ${
                                botStatus?.connected
                                    ? (isDark ? 'bg-emerald-950/70 hover:bg-emerald-900/80 border-emerald-600/50 text-emerald-300' : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800')
                                    : (isDark ? 'bg-rose-950/70 hover:bg-rose-900/80 border-rose-600/50 text-rose-300' : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-800')
                            }`}
                            title="Klik untuk Kontrol Bot WA (Lihat Status / Matikan / Nyalakan)"
                        >
                            <span className={`w-2 h-2 rounded-full ${botStatus?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                            <span className="hidden sm:inline">Bot WA:</span>
                            <span>{botStatus?.connected ? 'Online' : 'Offline'}</span>
                            <Power className="w-3 h-3 opacity-60 ml-0.5" />
                        </button>

                        {/* Supervisor Account Profile Pill */}
                        <div
                            className={`h-8.5 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs shadow-xs ${
                                isDark ? 'bg-slate-800/90 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                            }`}
                            title={currentUser ? `Login sebagai ${myName} (${currentUser.department || 'Supervisor'})` : 'Mode Tamu / Belum Login'}
                        >
                            <span className={`w-2 h-2 rounded-full ${currentUser ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            <span className="font-bold truncate max-w-[100px] sm:max-w-[120px]">{myName}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                                isDark ? 'text-emerald-400 bg-emerald-950/80 border-emerald-800/60' : 'text-emerald-800 bg-emerald-100 border-emerald-200'
                            }`}>
                                {currentUser?.is_admin ? 'Admin' : 'Supervisor'}
                            </span>
                        </div>

                        {/* Back to Full Dashboard / Login */}
                        {currentUser ? (
                            <Link
                                href={route('dashboard')}
                                className={`h-8.5 w-8.5 flex items-center justify-center rounded-lg border transition-all shadow-xs ${
                                    isDark
                                        ? 'bg-slate-800/90 hover:bg-emerald-950 hover:text-emerald-300 text-slate-300 border-slate-700 hover:border-emerald-600/60'
                                        : 'bg-white hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 border-slate-200 hover:border-emerald-300'
                                }`}
                                title="Kembali ke Dashboard Utama (Mode Kantor)"
                                aria-label="Kembali ke Dashboard Utama"
                            >
                                <LayoutDashboard className="w-4 h-4" />
                            </Link>
                        ) : (
                            <Link
                                href={route('login')}
                                className={`h-8.5 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-bold transition-all shadow-xs ${
                                    isDark
                                        ? 'bg-amber-950/60 hover:bg-amber-900/80 border-amber-500/50 text-amber-300'
                                        : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800'
                                }`}
                                title="Masuk ke Akun Anda"
                            >
                                <LogIn className="w-3.5 h-3.5" />
                                <span>Masuk</span>
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT CONTAINER */}
            <main className="w-full px-4 sm:px-6 lg:px-8 pt-4 flex-1">
                {/* NOTICE BANNER: ISOLATED TESTING */}
                <div className={`mb-4 p-3.5 rounded-xl border flex items-start justify-between gap-3 text-xs backdrop-blur-md transition-all ${
                    isDark
                        ? 'bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-slate-800/40 border-amber-500/30'
                        : 'bg-amber-50/95 border-amber-300/80 text-amber-950 shadow-sm'
                }`}>
                    <div className={`flex items-start gap-2.5 ${isDark ? 'text-amber-200' : 'text-amber-950'}`}>
                        <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                        <div>
                            <p className={`font-bold ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>Lingkungan Uji Coba Terisolasi (Sandbox)</p>
                            <p className={`text-[11px] mt-0.5 leading-relaxed ${isDark ? 'text-amber-200/80' : 'text-amber-800'}`}>
                                Laporan di sini tidak masuk ke dashboard resmi dan tidak mengirim notifikasi WhatsApp. Bebas dipakai untuk simulasi.
                            </p>
                        </div>
                    </div>
                    {issues.length > 0 && (
                        <button
                            onClick={() => setShowResetConfirm(true)}
                            className={`shrink-0 flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors ${
                                isDark
                                    ? 'text-rose-400 hover:text-rose-300 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/60'
                                    : 'text-rose-700 hover:text-rose-800 bg-rose-100 hover:bg-rose-200 border border-rose-300 font-semibold shadow-xs'
                            }`}
                        >
                            <Trash2 className="w-3 h-3" />
                            Reset Data
                        </button>
                    )}
                </div>


                {/* ERP CONTROLS BAR: SEARCH, DEPT, COLUMN CUSTOMIZER, VIEW MODE */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 mb-3">
                    {/* Live Search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Cari ID, judul, pelapor, lokasi..."
                            className={`w-full text-xs rounded-xl pl-8 pr-7 py-2 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 shadow-sm transition-all border ${
                                isDark
                                    ? 'bg-slate-800/90 border-slate-700 text-slate-200 placeholder-slate-500'
                                    : 'bg-white/95 border-slate-300 text-slate-900 placeholder-slate-400 shadow-xs'
                            }`}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className={`absolute right-2.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}
                                title="Hapus pencarian"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Department Filter (1 Dept vs All) */}
                        <div className="flex items-center gap-1.5 shrink-0">
                            <select
                                value={selectedDeptFilter}
                                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                                className={`text-xs font-semibold rounded-xl px-3 py-2 focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-sm border ${
                                    isDark
                                        ? 'bg-slate-800/90 border-slate-700 text-slate-200'
                                        : 'bg-white/95 border-slate-300 text-slate-800 shadow-xs'
                                }`}
                            >
                                <option value="all">Semua Dept (All)</option>
                                {departments.map((dept) => (
                                    <option key={dept} value={dept}>{dept}</option>
                                ))}
                            </select>
                        </div>

                        {/* Column Customizer Button */}
                        <button
                            type="button"
                            onClick={() => setShowColumnModal(true)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm shrink-0 border ${
                                isDark
                                    ? 'bg-slate-800/90 hover:bg-slate-700 border-slate-700 hover:border-emerald-500/50 text-slate-200'
                                    : 'bg-white/95 hover:bg-slate-50 border-slate-300 hover:border-slate-400 text-slate-800 shadow-xs'
                            }`}
                            title="Pilih data/kolom apa saja yang ingin ditampilkan"
                        >
                            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Tampilan</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                                isDark
                                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60'
                                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            }`}>
                                {activeColumnCount}/{COLUMN_DEFS.length}
                            </span>
                        </button>

                        {/* View Mode Switcher (Table ERP vs Cards vs Analytics) */}
                        <div className={`flex items-center p-0.5 rounded-xl shrink-0 border ${
                            isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-slate-100 border-slate-300 shadow-xs'
                        }`}>
                            <button
                                type="button"
                                onClick={() => setViewMode('table')}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    viewMode === 'table'
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : isDark
                                        ? 'text-slate-400 hover:text-slate-200'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                                }`}
                                title="Tampilan Tabel Spreadsheet ERP"
                            >
                                <Table className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Tabel ERP</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('cards')}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    viewMode === 'cards'
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : isDark
                                        ? 'text-slate-400 hover:text-slate-200'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                                }`}
                                title="Tampilan Kartu Visual"
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Kartu</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('analytics')}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    viewMode === 'analytics'
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : isDark
                                        ? 'text-slate-400 hover:text-slate-200'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                                }`}
                                title="Analisa Audit & Mitigasi Kerusakan"
                            >
                                <BarChart3 className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Analitik AI</span>
                                {aiPendingCount > 0 && (
                                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* MULTI-SELECT STATUS CHECKLIST PILLS & PRESETS */}
                <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 p-2.5 rounded-xl border backdrop-blur-md transition-all ${
                    isDark ? 'bg-slate-800/60 border-slate-800' : 'bg-white/80 border-slate-200/90 shadow-xs'
                }`}>
                    {/* Status Checklist Pills */}
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span className={`text-[11px] font-semibold mr-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Filter Status:</span>

                        {/* Open Checkbox Pill */}
                        <button
                            type="button"
                            onClick={() => toggleStatus('open')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold text-xs transition-all border ${
                                selectedStatuses.open
                                    ? isDark
                                        ? 'bg-rose-950/80 border-rose-500/60 text-rose-300 shadow-sm'
                                        : 'bg-rose-50 border-rose-300 text-rose-800 shadow-xs'
                                    : isDark
                                    ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400'
                                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
                            }`}
                        >
                            <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] border ${
                                selectedStatuses.open ? 'bg-rose-500 border-rose-400 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                            }`}>
                                {selectedStatuses.open && '✓'}
                            </span>
                            <span>Open</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                isDark ? 'bg-slate-900/80 text-white' : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}>
                                {counts.open}
                            </span>
                        </button>

                        {/* Progress Checkbox Pill */}
                        <button
                            type="button"
                            onClick={() => toggleStatus('in_progress')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold text-xs transition-all border ${
                                selectedStatuses.in_progress
                                    ? isDark
                                        ? 'bg-amber-950/80 border-amber-500/60 text-amber-300 shadow-sm'
                                        : 'bg-amber-50 border-amber-300 text-amber-800 shadow-xs'
                                    : isDark
                                    ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400'
                                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
                            }`}
                        >
                            <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] border ${
                                selectedStatuses.in_progress ? 'bg-amber-500 border-amber-400 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                            }`}>
                                {selectedStatuses.in_progress && '✓'}
                            </span>
                            <span>Progress</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                isDark ? 'bg-slate-900/80 text-white' : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                                {counts.inProgress}
                            </span>
                        </button>

                        {/* Pending / Tertunda Checkbox Pill */}
                        <button
                            type="button"
                            onClick={() => toggleStatus('pending')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold text-xs transition-all border ${
                                selectedStatuses.pending
                                    ? isDark
                                        ? 'bg-orange-950/80 border-orange-500/60 text-orange-300 shadow-sm'
                                        : 'bg-orange-50 border-orange-300 text-orange-800 shadow-xs'
                                    : isDark
                                    ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400'
                                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
                            }`}
                        >
                            <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] border ${
                                selectedStatuses.pending ? 'bg-orange-500 border-orange-400 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                            }`}>
                                {selectedStatuses.pending && '✓'}
                            </span>
                            <span>Tertunda</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                isDark ? 'bg-slate-900/80 text-white' : 'bg-orange-100 text-orange-800 border border-orange-200'
                            }`}>
                                {counts.pending}
                            </span>
                        </button>

                        {/* Resolved / Selesai Checkbox Pill */}
                        <button
                            type="button"
                            onClick={() => toggleStatus('resolved')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold text-xs transition-all border ${
                                selectedStatuses.resolved
                                    ? isDark
                                        ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-sm'
                                        : 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs'
                                    : isDark
                                    ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400'
                                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
                            }`}
                        >
                            <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] border ${
                                selectedStatuses.resolved ? 'bg-emerald-500 border-emerald-400 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                            }`}>
                                {selectedStatuses.resolved && '✓'}
                            </span>
                            <span>Selesai</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                isDark ? 'bg-slate-900/80 text-white' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}>
                                {counts.resolved}
                            </span>
                        </button>
                    </div>

                    {/* Quick Presets */}
                    <div className="flex items-center gap-1 text-[11px] self-end sm:self-auto">
                        <span className={`${isDark ? 'text-slate-500' : 'text-slate-500'} mr-1 hidden sm:inline font-medium`}>Preset:</span>
                        <button
                            type="button"
                            onClick={() => setStatusPreset('all')}
                            className={`px-2.5 py-0.5 rounded-md border text-xs font-medium transition-all ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                                    : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-300 shadow-xs'
                            }`}
                        >
                            Semua
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusPreset('active')}
                            className={`px-2.5 py-0.5 rounded-md border text-xs font-semibold transition-all ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border-slate-700'
                                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 shadow-xs'
                            }`}
                        >
                            Isu Aktif
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusPreset('resolved')}
                            className={`px-2.5 py-0.5 rounded-md border text-xs font-semibold transition-all ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-emerald-200 border-slate-700'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 shadow-xs'
                            }`}
                        >
                            Selesai Saja
                        </button>
                    </div>
                </div>

                {/* DATA PRESENTATION: ANALYTICS VIEW OR EMPTY STATE OR ERP TABLE / CARDS */}
                {viewMode === 'analytics' ? (
                    <LeanAnalyticsView
                        issues={issues}
                        departments={departments}
                        aiPendingCount={aiPendingCount}
                        onRetryAi={handleRetryAi}
                        isRetrying={isRetryingAi}
                        theme={theme}
                        activeTab={activeAnalyticsTab}
                        onTabChange={setActiveAnalyticsTab}
                        onSelectIssue={setSelectedDetailIssue}
                    />
                ) : filteredIssues.length === 0 ? (
                    <div className="py-16 text-center border-2 border-dashed border-slate-800 rounded-2xl p-6">
                        <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-3">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-300">Tidak ada masalah ditemukan</h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                            {searchQuery
                                ? `Tidak ditemukan isu yang cocok dengan kata kunci "${searchQuery}".`
                                : selectedDeptFilter !== 'all'
                                ? `Tidak ada masalah untuk departemen ${selectedDeptFilter}.`
                                : 'Belum ada masalah di dalam daftar.'}
                        </p>
                        <div className="mt-4 flex items-center justify-center gap-2">
                            {searchQuery ? (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                                >
                                    Reset Pencarian
                                </button>
                            ) : (
                                <p className="text-[11px] text-slate-500 italic">
                                    Pelaporan isu baru dilakukan secara terpusat melalui WhatsApp Bot.
                                </p>
                            )}
                        </div>
                    </div>
                ) : viewMode === 'table' ? (
                    /* --- VIEW 1: ERP SPREADSHEET TABLE --- */
                    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl overflow-hidden shadow-xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-[11px] border-collapse">
                                <thead>
                                    <tr className="bg-slate-900/90 text-slate-300 font-bold border-b border-slate-700/80 uppercase tracking-wider text-[10px]">
                                        {visibleColumns.id && <th className="py-2 px-2 whitespace-nowrap">ID Isu</th>}
                                        {visibleColumns.photo && <th className="py-2 px-1 text-center whitespace-nowrap">Foto</th>}
                                        {visibleColumns.title && <th className="py-2 px-2 min-w-[110px] max-w-[160px]">Judul Masalah</th>}
                                        {visibleColumns.category && <th className="py-2 px-2 whitespace-nowrap">Kategori AI</th>}
                                        {visibleColumns.location && <th className="py-2 px-2 whitespace-nowrap">Lokasi</th>}
                                        {visibleColumns.dept && <th className="py-2 px-2 whitespace-nowrap">Departemen</th>}
                                        {visibleColumns.reporter && <th className="py-2 px-2 whitespace-nowrap">Pelapor</th>}
                                        {visibleColumns.desc && <th className="py-2 px-2 min-w-[130px] max-w-[180px]">Deskripsi</th>}
                                        {visibleColumns.status && <th className="py-2 px-2 whitespace-nowrap">Status</th>}
                                        {visibleColumns.time && <th className="py-2 px-2 whitespace-nowrap">Waktu</th>}
                                        <th className="py-2 px-1.5 text-center whitespace-nowrap">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/60 font-medium">
                                    {filteredIssues.map((issue) => {
                                        const accs = issue.department_accs || {};

                                        return (
                                            <tr
                                                key={issue.id}
                                                onClick={() => setSelectedDetailIssue(issue)}
                                                className="hover:bg-slate-700/50 cursor-pointer transition-colors group"
                                                title="Klik baris untuk melihat rincian lengkap isu"
                                            >
                                                {/* ID ISU */}
                                                {visibleColumns.id && (
                                                    <td className="py-2 px-2 font-mono font-bold text-amber-300 whitespace-nowrap text-[11px]">
                                                        #{issue.issue_code || ('LEAN-' + issue.id)}
                                                    </td>
                                                )}

                                                {/* FOTO BUKTI */}
                                                {visibleColumns.photo && (
                                                    <td className="py-2 px-1 text-center">
                                                        {issue.image_url ? (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setLightboxImage(issue.image_url);
                                                                }}
                                                                className="w-8 h-8 rounded-md overflow-hidden border border-slate-700 hover:border-emerald-500 inline-block transition-all hover:scale-105"
                                                                title="Klik untuk lihat foto"
                                                            >
                                                                <img src={issue.image_url} alt="" className="w-full h-full object-cover" />
                                                            </button>
                                                        ) : (
                                                            <span className="text-slate-600 text-[10px] italic">-</span>
                                                        )}
                                                    </td>
                                                )}

                                                {/* JUDUL MASALAH */}
                                                {visibleColumns.title && (
                                                    <td className="py-2 px-2 text-white font-semibold leading-snug max-w-[160px] truncate" title={issue.title}>
                                                        {issue.title}
                                                    </td>
                                                )}

                                                {/* KATEGORI AI */}
                                                {visibleColumns.category && (
                                                    <td className="py-2 px-2 whitespace-nowrap text-[11px]">
                                                        {issue.ai_category ? (
                                                            <div className="flex flex-col">
                                                                <span className="font-semibold text-sky-300 flex items-center gap-1">
                                                                    <Sparkles className="w-2.5 h-2.5 text-sky-400 shrink-0" />
                                                                    {issue.ai_category}
                                                                </span>
                                                                {issue.ai_sub_category && (
                                                                    <span className="text-[9px] text-slate-400 block truncate max-w-[130px]" title={issue.ai_sub_category}>
                                                                        {issue.ai_sub_category}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-500 text-[10px] italic">
                                                                {issue.ai_status === 'pending' ? '⏳ Antrean' : '-'}
                                                            </span>
                                                        )}
                                                    </td>
                                                )}

                                                {/* LOKASI */}
                                                {visibleColumns.location && (
                                                    <td className="py-2 px-2 whitespace-nowrap text-slate-300">
                                                        <span
                                                            className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 px-1.5 py-0.5 rounded font-bold text-[10px] max-w-[170px] truncate"
                                                            title={issue.location}
                                                        >
                                                            <MapPin className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                                            <span className="truncate">{issue.location}</span>
                                                        </span>
                                                    </td>
                                                )}

                                                {/* DEPARTEMEN TUJUAN */}
                                                {visibleColumns.dept && (
                                                    <td className="py-2 px-2 whitespace-nowrap">
                                                        <div className="flex flex-wrap gap-1">
                                                            {(issue.target_departments || []).map((dept) => {
                                                                const isThisDeptClaimed = issue.claimed_by_dept && (
                                                                    issue.claimed_by_dept.toLowerCase() === dept.toLowerCase()
                                                                );
                                                                const isThisAcc = accs[dept]?.is_acc || isThisDeptClaimed;
                                                                const isWorking = issue.status === 'in_progress' && isThisDeptClaimed;

                                                                return (
                                                                    <span
                                                                        key={dept}
                                                                        className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                                                                            isWorking
                                                                                ? 'bg-amber-950/80 border-amber-500 text-amber-200'
                                                                                : isThisAcc
                                                                                ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                                                                                : 'bg-slate-900 border-slate-700 text-slate-300'
                                                                        }`}
                                                                    >
                                                                        {dept} {isWorking ? '🟡 Dikerjakan' : isThisAcc ? '✓' : ''}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>
                                                )}

                                                {/* NAMA PELAPOR */}
                                                {visibleColumns.reporter && (
                                                    <td className="py-2 px-2 whitespace-nowrap text-slate-300">
                                                        <div className="font-semibold text-white leading-tight">{issue.reporter_name}</div>
                                                        <div className="text-[9px] text-slate-400 leading-tight">{issue.reporter_dept || 'Staf'}</div>
                                                    </td>
                                                )}

                                                {/* DESKRIPSI */}
                                                {visibleColumns.desc && (
                                                    <td className="py-2 px-2 text-slate-300 text-[11px] max-w-[180px] truncate" title={issue.description}>
                                                        {issue.description || <span className="text-slate-600 italic">Tidak ada keterangan</span>}
                                                    </td>
                                                )}

                                                {/* STATUS BADGE */}
                                                {visibleColumns.status && (
                                                    <td className="py-2 px-2 whitespace-nowrap">
                                                        {issue.status === 'open' && (
                                                            <span className="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-semibold inline-flex items-center gap-1">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                                                Open
                                                            </span>
                                                        )}
                                                        {issue.status === 'in_progress' && (
                                                            <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-semibold inline-flex items-center gap-1">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                                                Progress
                                                            </span>
                                                        )}
                                                        {issue.status === 'pending' && (
                                                            <span className="px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/40 text-[10px] font-semibold inline-flex items-center gap-1">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                                                Tertunda
                                                            </span>
                                                        )}
                                                        {issue.status === 'resolved' && (
                                                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-semibold inline-flex items-center gap-1">
                                                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                                                Selesai
                                                            </span>
                                                        )}
                                                    </td>
                                                )}

                                                {/* WAKTU PELAPORAN */}
                                                {visibleColumns.time && (
                                                    <td className="py-2 px-2 whitespace-nowrap text-[10px] text-slate-400">
                                                        {issue.created_at_human}
                                                    </td>
                                                )}

                                                {/* AKSI HAPUS */}
                                                <td className="py-2 px-1.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIssueToDelete(issue);
                                                            setDeleteSupervisorName(myName || 'Supervisor');
                                                        }}
                                                        className="p-1 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:border-rose-500/60 transition"
                                                        title="Hapus / Sembunyikan Tiket"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    /* --- VIEW 2: VISUAL CARD VIEW --- */
                    <div className="space-y-3">
                        {filteredIssues.map((issue) => {
                            const accs = issue.department_accs || {};

                            return (
                                <div
                                    key={issue.id}
                                    onClick={() => setSelectedDetailIssue(issue)}
                                    className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 hover:border-emerald-500/50 cursor-pointer transition-all shadow-sm space-y-3 group"
                                    title="Klik kartu untuk melihat rincian lengkap isu"
                                >
                                    {/* Card Header: Issue Code + Location + Status + Time */}
                                    <div className="flex items-start justify-between gap-2 flex-wrap">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {/* ID Isu */}
                                            {visibleColumns.id && (
                                                <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-amber-300 font-mono font-bold text-xs">
                                                    #{issue.issue_code || ('LEAN-' + issue.id)}
                                                </span>
                                            )}

                                            {/* Lokasi */}
                                            {visibleColumns.location && (
                                                <span className="px-2.5 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800/80 font-bold text-xs flex items-center gap-1">
                                                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                                                    {issue.location}
                                                </span>
                                            )}

                                            {/* Kategori AI */}
                                            {issue.ai_category && (
                                                <span className="px-2.5 py-0.5 rounded-md bg-sky-950/80 text-sky-300 border border-sky-800/80 font-bold text-xs flex items-center gap-1">
                                                    <Sparkles className="w-3 h-3 text-sky-400" />
                                                    {issue.ai_category}
                                                </span>
                                            )}

                                            {/* Status Badge */}
                                            {visibleColumns.status && (
                                                <>
                                                    {issue.status === 'open' && (
                                                        <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-semibold flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                                            Open
                                                        </span>
                                                    )}
                                                    {issue.status === 'in_progress' && (
                                                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-semibold flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                                            Progress
                                                        </span>
                                                    )}
                                                    {issue.status === 'pending' && (
                                                        <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/40 text-[11px] font-semibold flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                                            Tertunda
                                                        </span>
                                                    )}
                                                    {issue.status === 'resolved' && (
                                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold flex items-center gap-1">
                                                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                                            Selesai
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        {/* Waktu Pelaporan & Aksi Cepat */}
                                        <div className="flex items-center gap-2">
                                            {visibleColumns.time && (
                                                <span className="text-[11px] text-slate-400 shrink-0 font-medium flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {issue.created_at_human}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIssueToDelete(issue);
                                                    setDeleteSupervisorName(myName || 'Supervisor');
                                                }}
                                                className="opacity-0 group-hover:opacity-100 p-1 rounded-md bg-slate-900 hover:bg-rose-950/80 text-slate-500 hover:text-rose-400 border border-slate-700/80 hover:border-rose-800 transition"
                                                title="Hapus / Sembunyikan Tiket"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Pelapor Info */}
                                    {visibleColumns.reporter && (
                                        <div className="flex items-center gap-1.5 text-xs text-slate-300">
                                            <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                            <span>Pelapor: <strong className="text-white">{issue.reporter_name}</strong> <span className="text-slate-400">({issue.reporter_dept || 'Staf'})</span></span>
                                        </div>
                                    )}

                                    {/* Title & Description */}
                                    <div>
                                        {visibleColumns.title && (
                                            <h4 className="font-bold text-sm text-white leading-snug">{issue.title}</h4>
                                        )}
                                        {visibleColumns.desc && issue.description && (
                                            <p className="text-xs text-slate-300 mt-1 leading-relaxed whitespace-pre-line bg-slate-900/40 p-2.5 rounded-lg border border-slate-700/50">
                                                {issue.description}
                                            </p>
                                        )}
                                    </div>

                                    {/* Image Attachment (if any) */}
                                    {visibleColumns.photo && issue.image_url && (
                                        <div className="pt-1">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setLightboxImage(issue.image_url);
                                                }}
                                                className="group relative rounded-lg overflow-hidden border border-slate-700 max-w-[200px] block"
                                            >
                                                <img
                                                    src={issue.image_url}
                                                    alt="Bukti Masalah"
                                                    className="w-full h-28 object-cover group-hover:scale-105 transition-transform"
                                                />
                                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <span className="text-[10px] text-white font-semibold bg-black/60 px-2 py-1 rounded">
                                                        Lihat Foto
                                                    </span>
                                                </div>
                                            </button>
                                        </div>
                                    )}

                                    {/* TARGET DEPARTMENTS & ACC CHIPS */}
                                    {visibleColumns.dept && (
                                        <div className="pt-2 border-t border-slate-700/60 flex flex-wrap items-center gap-1.5 text-xs">
                                            <span className="text-slate-400 text-[11px]">Tujuan:</span>
                                            {(issue.target_departments || []).map((dept) => {
                                                const isThisDeptClaimed = issue.claimed_by_dept && (
                                                    issue.claimed_by_dept.toLowerCase() === dept.toLowerCase()
                                                );
                                                const isThisAcc = accs[dept]?.is_acc || isThisDeptClaimed;
                                                const accBy = accs[dept]?.acc_by || (isThisDeptClaimed ? issue.claimed_by_name : null);
                                                const isWorking = issue.status === 'in_progress' && isThisDeptClaimed;

                                                return (
                                                    <div
                                                        key={dept}
                                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border transition-colors ${
                                                            isWorking
                                                                ? 'bg-amber-950/80 border-amber-500/70 text-amber-200 font-semibold'
                                                                : isThisAcc
                                                                ? 'bg-emerald-950/80 border-emerald-600/70 text-emerald-300 font-semibold'
                                                                : 'bg-slate-900 border-slate-700 text-slate-400'
                                                        }`}
                                                    >
                                                        {isWorking ? (
                                                            <>
                                                                <Clock className="w-3 h-3 text-amber-400" />
                                                                <span>{dept}: Dikerjakan ({issue.claimed_by_name || 'Staf'})</span>
                                                            </>
                                                        ) : isThisAcc ? (
                                                            <>
                                                                <Check className="w-3 h-3 text-emerald-400" />
                                                                <span>{dept}: ACC ({accBy || 'Staf'})</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Clock className="w-3 h-3 text-slate-500" />
                                                                <span>{dept}: Menunggu ACC</span>
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* FOOTER: REPORTER & PROGRESS ASSIGNEE INFO */}
                                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                                        <div className="text-[11px] text-slate-400 space-y-0.5">
                                            {issue.claimed_by_name && (
                                                <p className="text-amber-300">
                                                    Dikerjakan oleh: <strong>{issue.claimed_by_name}</strong> ({issue.claimed_by_dept})
                                                </p>
                                            )}
                                            {issue.resolved_by_name && (
                                                <p className="text-emerald-300">
                                                    Diselesaikan oleh: <strong>{issue.resolved_by_name}</strong> ({issue.resolved_by_dept})
                                                    {issue.resolution_note && ` — "${issue.resolution_note}"`}
                                                </p>
                                            )}
                                        </div>

                                        {/* Read-Only Status Indicator */}
                                        <div className="self-end sm:self-auto">
                                            {issue.status === 'open' && (
                                                <span className="text-[10px] text-slate-500 italic">
                                                    Menunggu respon tim via WhatsApp
                                                </span>
                                            )}
                                            {issue.status === 'in_progress' && (
                                                <span className="text-[11px] text-amber-300 font-medium bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                                                    Dalam Pengerjaan
                                                </span>
                                            )}
                                            {issue.status === 'pending' && (
                                                <span className="text-[11px] text-orange-300 font-medium bg-orange-950/40 px-2 py-0.5 rounded border border-orange-800/40">
                                                    Tertunda
                                                </span>
                                            )}
                                            {issue.status === 'resolved' && (
                                                <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    Telah Beres
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* MODAL 1: REPORT ISSUE MODAL (ULTRA-LEAN 6 ELEMENTS) */}
            {showReportModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        {/* Header */}
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-base text-white">Lapor Masalah Baru</h3>
                                <p className="text-xs text-slate-400">Hanya 6 elemen cepat untuk eksekusi lapangan</p>
                            </div>
                            <button
                                onClick={() => setShowReportModal(false)}
                                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Form Body */}
                        <form onSubmit={handleReportSubmit} className="p-4 overflow-y-auto space-y-4 flex-1">
                            {/* 1. LOKASI (TBR, TPI, Kantor + Detail) */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                                    1. Lokasi Masalah *
                                </label>
                                <div className="grid grid-cols-3 gap-2 mb-2">
                                    {['TBR', 'TPI', 'Kantor'].map((loc) => (
                                        <button
                                            type="button"
                                            key={loc}
                                            onClick={() => setFormMainLoc(loc)}
                                            className={`py-2 px-3 rounded-lg text-xs font-bold border text-center transition-all ${
                                                formMainLoc === loc
                                                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-2 ring-emerald-500/30'
                                                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'
                                            }`}
                                        >
                                            {loc}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    value={formDetailLoc}
                                    onChange={(e) => setFormDetailLoc(e.target.value)}
                                    placeholder="Detail spesifik (contoh: Villa 05 / Jetty / Kamar 12)"
                                    className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            {/* 2. ISU / JUDUL */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                    2. Isu / Masalah *
                                </label>
                                <input
                                    type="text"
                                    value={formTitle}
                                    onChange={(e) => setFormTitle(e.target.value)}
                                    placeholder="Contoh: Pipa wastafel bocor / AC tidak dingin"
                                    className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                    required
                                />
                            </div>

                            {/* 3. DESKRIPSI ISU */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1">
                                    3. Deskripsi Isu (Rincian Kondisi)
                                </label>
                                <textarea
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    placeholder="Jelaskan detailnya (contoh: Air menetes deras ke lantai kolong wastafel)"
                                    rows={2}
                                    className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            {/* 4. DITUJUKAN KE DEPARTEMEN (11 DEPARTEMEN RESMI) */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                                    <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                                    4. Ditujukan ke Departemen (11 Departemen) *
                                </label>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                                    {departments.map((dept) => {
                                        const isSelected = formTargetDepts.includes(dept);
                                        return (
                                            <button
                                                type="button"
                                                key={dept}
                                                onClick={() => toggleTargetDept(dept)}
                                                className={`py-2 px-2 rounded-lg text-xs font-semibold border flex items-center justify-between transition-all ${
                                                    isSelected
                                                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                                                        : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
                                                }`}
                                            >
                                                <span className="truncate">{dept}</span>
                                                {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0 ml-1" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 5. FOTO BUKTI */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                                    <Camera className="w-3.5 h-3.5 text-emerald-400" />
                                    5. Foto Bukti (Kamera HP / Galeri)
                                </label>
                                {formImagePreview ? (
                                    <div className="relative rounded-lg overflow-hidden border border-slate-700 max-h-48 bg-black/40 flex items-center justify-center">
                                        <img src={formImagePreview} alt="Preview" className="max-h-48 object-contain" />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFormImage(null);
                                                setFormImagePreview(null);
                                            }}
                                            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-black text-white"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-700 hover:border-slate-600 rounded-xl cursor-pointer bg-slate-800/40 hover:bg-slate-800/70 transition-colors">
                                        <Camera className="w-6 h-6 text-slate-400 mb-1" />
                                        <span className="text-xs font-semibold text-slate-300">Ambil Foto / Pilih File</span>
                                        <span className="text-[10px] text-slate-500 mt-0.5">Bisa langsung pakai kamera HP</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={handleImageChange}
                                            className="hidden"
                                        />
                                    </label>
                                )}
                            </div>

                            {/* 6. PELAPOR */}
                            <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700 text-xs flex items-center justify-between">
                                <div>
                                    <span className="text-[11px] text-slate-400">6. Pelapor:</span>
                                    <p className="font-bold text-slate-200">{myName} (Supervisor)</p>
                                </div>
                            </div>

                            {/* Submit Button */}
                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isSubmitting ? (
                                        <span>Mengirim Laporan...</span>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-4 h-4" />
                                            <span>Kirim Laporan (Done)</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: RESOLVE / TANDAI SELESAI */}
            {showResolveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="font-bold text-base text-white">Tandai Masalah Selesai</h3>
                                <p className="text-xs text-slate-400">
                                    {showResolveModal.location} — {showResolveModal.title}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowResolveModal(null)}
                                className="text-slate-400 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleResolveSubmit} className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1">
                                    Catatan Penyelesaian (Opsional)
                                </label>
                                <textarea
                                    value={resolveNote}
                                    onChange={(e) => setResolveNote(e.target.value)}
                                    placeholder="Contoh: Pipa telah diganti seal baru, sudah dites tidak bocor lagi"
                                    rows={2}
                                    className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                                    <Camera className="w-3.5 h-3.5 text-emerald-400" />
                                    Foto Bukti Selesai (Opsional)
                                </label>
                                {resolveImagePreview ? (
                                    <div className="relative rounded-lg overflow-hidden border border-slate-700 max-h-36 bg-black/40 flex items-center justify-center">
                                        <img src={resolveImagePreview} alt="Preview" className="max-h-36 object-contain" />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setResolveImage(null);
                                                setResolveImagePreview(null);
                                            }}
                                            className="absolute top-2 right-2 p-1 rounded-full bg-black/70 text-white"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <label className="flex items-center justify-center gap-2 p-3 border border-dashed border-slate-700 hover:border-slate-600 rounded-lg cursor-pointer bg-slate-800/40 text-xs text-slate-300">
                                        <Camera className="w-4 h-4 text-slate-400" />
                                        <span>Ambil Foto Hasil Perbaikan</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={handleResolveImageChange}
                                            className="hidden"
                                        />
                                    </label>
                                )}
                            </div>

                            <div className="pt-2 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowResolveModal(null)}
                                    className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md"
                                >
                                    {isSubmitting ? 'Menyimpan...' : 'Konfirmasi Selesai'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}



            {/* MODAL 4: RESET CONFIRMATION */}
            {showResetConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4">
                        <div className="flex items-center gap-2 text-rose-400">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <h3 className="font-bold text-sm text-white">Reset Seluruh Data Simulasi?</h3>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                            Tindakan ini akan mengosongkan seluruh tiket uji coba di Sandbox. Cocok dilakukan jika sesi latihan telah selesai.
                        </p>
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                onClick={() => setShowResetConfirm(false)}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleResetSandbox}
                                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md"
                            >
                                Ya, Kosongkan Data
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: DETAIL ISU LENGKAP (SESUAI PREFERENSI KOLOM ERP) */}
            {activeDetailIssue && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95">
                        {/* Header Modal */}
                        <div className="p-4 border-b border-slate-800 flex items-start justify-between gap-3 bg-slate-950/70">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {visibleColumns.id && (
                                        <span className="font-mono text-xs font-bold text-amber-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                                            #{activeDetailIssue.issue_code || ('LEAN-' + activeDetailIssue.id)}
                                        </span>
                                    )}
                                    {visibleColumns.status && (
                                        <span className="text-[11px] font-bold">
                                            {activeDetailIssue.status === 'open' && (
                                                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Open
                                                </span>
                                            )}
                                            {activeDetailIssue.status === 'in_progress' && (
                                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Progress
                                                </span>
                                            )}
                                            {activeDetailIssue.status === 'pending' && (
                                                <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/40 inline-flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400" /> Tertunda
                                                </span>
                                            )}
                                            {activeDetailIssue.status === 'resolved' && (
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Selesai
                                                </span>
                                            )}
                                        </span>
                                    )}
                                    {visibleColumns.category && activeDetailIssue.ai_urgency && (
                                        <span
                                            className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                                            style={{
                                                backgroundColor: `${URGENCY_COLORS[activeDetailIssue.ai_urgency] || '#facc15'}20`,
                                                borderColor: `${URGENCY_COLORS[activeDetailIssue.ai_urgency] || '#facc15'}50`,
                                                color: URGENCY_COLORS[activeDetailIssue.ai_urgency] || '#facc15',
                                            }}
                                        >
                                            Urgensi: {activeDetailIssue.ai_urgency}
                                        </span>
                                    )}
                                </div>
                                {visibleColumns.title ? (
                                    <h3 className="font-bold text-base text-white leading-snug">
                                        {activeDetailIssue.title}
                                    </h3>
                                ) : (
                                    <h3 className="font-bold text-sm text-slate-400 italic">
                                        Detail Isu Lapangan
                                    </h3>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedDetailIssue(null)}
                                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors shrink-0"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body Modal (Scrollable) */}
                        <div className="p-4 overflow-y-auto space-y-4 flex-1">
                            {/* Grid Informasi Utama */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {visibleColumns.location && (
                                    <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
                                        <span className="text-[10px] text-slate-400 font-medium block">Lokasi Masalah</span>
                                        <span className="text-xs font-bold text-emerald-300 flex items-center gap-1 mt-0.5">
                                            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                                            {activeDetailIssue.location}
                                        </span>
                                    </div>
                                )}

                                {visibleColumns.time && (
                                    <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
                                        <span className="text-[10px] text-slate-400 font-medium block">Waktu Pelaporan</span>
                                        <span className="text-xs font-semibold text-slate-200 flex items-center gap-1 mt-0.5">
                                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                                            {activeDetailIssue.created_at_human || activeDetailIssue.created_at}
                                        </span>
                                    </div>
                                )}

                                {visibleColumns.reporter && (
                                    <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
                                        <span className="text-[10px] text-slate-400 font-medium block">Pelapor</span>
                                        <span className="text-xs font-semibold text-white flex items-center gap-1 mt-0.5">
                                            <User className="w-3.5 h-3.5 text-emerald-400" />
                                            {activeDetailIssue.reporter_name} <span className="text-slate-400 text-[11px]">({activeDetailIssue.reporter_dept || 'Staf'})</span>
                                        </span>
                                    </div>
                                )}

                                {visibleColumns.category && (
                                    <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
                                        <span className="text-[10px] text-slate-400 font-medium block">Kategori AI</span>
                                        <span className="text-xs font-semibold text-sky-300 flex items-center gap-1 mt-0.5">
                                            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                                            {activeDetailIssue.ai_category || '-'} {activeDetailIssue.ai_sub_category && `• ${activeDetailIssue.ai_sub_category}`}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Departemen Dituju & ACC */}
                            {visibleColumns.dept && (
                                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-1.5">
                                    <span className="text-[10px] text-slate-400 font-semibold block">Departemen Dituju & Respon:</span>
                                    <div className="flex flex-wrap gap-1.5 items-center">
                                        {(activeDetailIssue.target_departments || []).map((dept) => {
                                            const isThisDeptClaimed = activeDetailIssue.claimed_by_dept && (
                                                activeDetailIssue.claimed_by_dept.toLowerCase() === dept.toLowerCase()
                                            );
                                            const isThisAcc = activeDetailIssue.department_accs?.[dept]?.is_acc || isThisDeptClaimed;
                                            const accBy = activeDetailIssue.department_accs?.[dept]?.acc_by || (isThisDeptClaimed ? activeDetailIssue.claimed_by_name : null);
                                            const isWorking = activeDetailIssue.status === 'in_progress' && isThisDeptClaimed;

                                            return (
                                                <span
                                                    key={dept}
                                                    className={`px-2 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 ${
                                                        isWorking
                                                            ? 'bg-amber-950/80 border-amber-500 text-amber-200'
                                                            : isThisAcc
                                                            ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                                                            : activeDetailIssue.status === 'in_progress'
                                                            ? 'bg-slate-900 border-amber-800/40 text-slate-300'
                                                            : 'bg-slate-900 border-slate-700 text-slate-300'
                                                    }`}
                                                >
                                                    <span>{dept}</span>
                                                    {isWorking ? (
                                                        <span className="text-[10px] text-amber-300 font-bold">🟡 Dikerjakan ({activeDetailIssue.claimed_by_name})</span>
                                                    ) : isThisAcc ? (
                                                        <span className="text-[10px] text-emerald-400 font-bold">✓ Diterima {accBy && `(${accBy})`}</span>
                                                    ) : activeDetailIssue.status === 'in_progress' ? (
                                                        <span className="text-[10px] text-amber-400/80">Diproses ({activeDetailIssue.claimed_by_name || 'Tim'})</span>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-500">Menunggu</span>
                                                    )}
                                                </span>
                                            );
                                        })}
                                        {/* Jika diambil oleh staf dari departemen lain (misal cross-department) */}
                                        {activeDetailIssue.claimed_by_dept && !(activeDetailIssue.target_departments || []).map(d => d.toLowerCase()).includes(activeDetailIssue.claimed_by_dept.toLowerCase()) && (
                                            <span className="px-2 py-1 rounded-lg text-xs font-semibold border bg-amber-950/80 border-amber-500 text-amber-200 flex items-center gap-1.5">
                                                <span>{activeDetailIssue.claimed_by_dept}</span>
                                                <span className="text-[10px] text-amber-300 font-bold">🟡 Dikerjakan ({activeDetailIssue.claimed_by_name})</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Deskripsi Lengkap */}
                            {visibleColumns.desc && (
                                <div className="space-y-1">
                                    <span className="text-xs font-bold text-slate-300">Deskripsi Lengkap Masalah:</span>
                                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-200 leading-relaxed whitespace-pre-line">
                                        {activeDetailIssue.description || <span className="italic text-slate-500">Tidak ada deskripsi tambahan yang dilampirkan.</span>}
                                    </div>
                                </div>
                            )}

                            {/* Foto Bukti */}
                            {visibleColumns.photo && activeDetailIssue.image_url && (
                                <div className="space-y-1.5">
                                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1">
                                        <Camera className="w-3.5 h-3.5 text-emerald-400" />
                                        Lampiran Foto Masalah:
                                    </span>
                                    <div
                                        onClick={() => setLightboxImage(activeDetailIssue.image_url)}
                                        className="relative rounded-xl overflow-hidden border border-slate-700 cursor-pointer group bg-black/40 max-h-56 flex items-center justify-center"
                                        title="Klik untuk perbesar foto"
                                    >
                                        <img
                                            src={activeDetailIssue.image_url}
                                            alt="Bukti"
                                            className="max-h-56 w-full object-cover group-hover:scale-105 transition-transform"
                                        />
                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="text-xs font-bold text-white bg-black/70 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                                                <Eye className="w-4 h-4" /> Klik untuk Perbesar
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Analisa Cerdas AI / RCA & Mitigasi */}
                            {visibleColumns.category && activeDetailIssue.ai_analysis && (
                                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-sky-900/50 space-y-2.5">
                                    <div className="flex items-center gap-1.5 text-sky-400 font-bold text-xs">
                                        <Sparkles className="w-3.5 h-3.5" />
                                        Analisis Cerdas & Rekomendasi Audit (RCA)
                                    </div>
                                    {activeDetailIssue.ai_analysis.dugaan_akar_masalah && (
                                        <div>
                                            <span className="text-[10px] text-slate-400 font-semibold block">Dugaan Akar Masalah Teknis:</span>
                                            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                                                {activeDetailIssue.ai_analysis.dugaan_akar_masalah}
                                            </p>
                                        </div>
                                    )}
                                    {activeDetailIssue.ai_analysis.tindakan_mitigasi_pencegahan && (
                                        <div className="pt-2 border-t border-slate-800">
                                            <span className="text-[10px] text-emerald-400 font-semibold block">Rekomendasi Tindakan Pencegahan:</span>
                                            <p className="text-xs text-emerald-200 mt-0.5 leading-relaxed">
                                                {activeDetailIssue.ai_analysis.tindakan_mitigasi_pencegahan}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Status Penugasan & Penyelesaian */}
                            {visibleColumns.status && (activeDetailIssue.claimed_by_name || activeDetailIssue.resolved_by_name) && (
                                <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/80 space-y-1 text-xs">
                                    {activeDetailIssue.claimed_by_name && (
                                        <p className="text-amber-300">
                                            Dikerjakan oleh: <strong>{activeDetailIssue.claimed_by_name}</strong> ({activeDetailIssue.claimed_by_dept})
                                        </p>
                                    )}
                                    {activeDetailIssue.resolved_by_name && (
                                        <p className="text-emerald-300">
                                            Diselesaikan oleh: <strong>{activeDetailIssue.resolved_by_name}</strong> ({activeDetailIssue.resolved_by_dept})
                                            {activeDetailIssue.resolution_note && ` — "${activeDetailIssue.resolution_note}"`}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer Modal */}
                        <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowColumnModal(true)}
                                    className="text-[11px] text-slate-400 hover:text-emerald-400 flex items-center gap-1.5 transition-colors"
                                    title="Ubah kolom yang ditampilkan di modal & tabel"
                                >
                                    <SlidersHorizontal className="w-3.5 h-3.5" />
                                    <span>Sesuaikan Tampilan Data ({activeColumnCount}/{COLUMN_DEFS.length})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIssueToDelete(activeDetailIssue);
                                        setDeleteSupervisorName(myName || 'Supervisor');
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-semibold flex items-center gap-1 transition"
                                >
                                    <Trash2 className="w-3 h-3 text-rose-400" />
                                    <span>Hapus Tiket</span>
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedDetailIssue(null)}
                                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* LIGHTBOX MODAL */}
            {lightboxImage && (
                <div
                    onClick={() => setLightboxImage(null)}
                    className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 cursor-pointer animate-in fade-in"
                >
                    <div className="relative max-w-3xl max-h-[90vh]">
                        <img
                            src={lightboxImage}
                            alt="Bukti Besar"
                            className="max-w-full max-h-[90vh] object-contain rounded-lg"
                        />
                        <button
                            onClick={() => setLightboxImage(null)}
                            className="absolute -top-10 right-0 text-white text-xs font-semibold bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full"
                        >
                            Tutup [X]
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL 5: ERP COLUMN CUSTOMIZER */}
            {showColumnModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                                    <SlidersHorizontal className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-white">Kustomisasi Tampilan Data</h3>
                                    <p className="text-[11px] text-slate-400">Pilih data yang ingin dimunculkan ({activeColumnCount} dari {COLUMN_DEFS.length} aktif)</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowColumnModal(false)}
                                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Column Toggles List */}
                        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
                            {COLUMN_DEFS.map((col) => {
                                const isVisible = !!visibleColumns[col.id];
                                return (
                                    <button
                                        key={col.id}
                                        type="button"
                                        onClick={() => toggleColumn(col.id)}
                                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                                            isVisible
                                                ? 'bg-slate-800/90 border-emerald-500/50 text-white'
                                                : 'bg-slate-900/60 border-slate-800 text-slate-500 hover:border-slate-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-base">{col.icon}</span>
                                            <span className={isVisible ? 'text-white' : 'text-slate-400'}>{col.label}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {isVisible ? (
                                                <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                                                    <Eye className="w-3 h-3" />
                                                    Tampil
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-[11px] text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-800">
                                                    <EyeOff className="w-3 h-3" />
                                                    Disembunyikan
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Actions Footer */}
                        <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setAllColumns(true)}
                                    className="px-2.5 py-1.5 text-[11px] text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    Pilih Semua
                                </button>
                                <button
                                    type="button"
                                    onClick={resetColumns}
                                    className="px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    Reset
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowColumnModal(false)}
                                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all"
                            >
                                Selesai
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* BOT CONTROL MODAL (CONFIGURED FOR BOT V2) */}
            <BotControlModal
                open={botControlModalOpen}
                onOpenChange={setBotControlModalOpen}
                botStatus={botStatus}
                onRefreshStatus={fetchBotStatus}
                botVersion="v2"
            />

            {/* MODAL: DELETE / SOFT DELETE ISSUE */}
            {issueToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-800 bg-rose-950/30 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
                                    <Trash2 className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-white">Hapus Tiket #{issueToDelete.issue_code || ('LEAN-' + issueToDelete.id)}</h3>
                                    <p className="text-[11px] text-slate-400">Soft Delete & Sinkronisasi Spreadsheet</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIssueToDelete(null)}
                                disabled={isDeleting}
                                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl space-y-1">
                                <div className="text-xs font-bold text-white line-clamp-2">{issueToDelete.title}</div>
                                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                    <span>Lokasi: <strong className="text-slate-300">{issueToDelete.location}</strong></span>
                                    <span>•</span>
                                    <span>Pelapor: <strong className="text-slate-300">{issueToDelete.reporter_name}</strong></span>
                                </div>
                            </div>

                            <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-xl text-xs space-y-1 text-amber-200/90 leading-relaxed">
                                <p className="font-semibold text-amber-300 flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    Kebijakan Integritas Data:
                                </p>
                                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-200/80">
                                    <li>Tiket ini akan <strong>disembunyikan dari dashboard & grafik</strong>.</li>
                                    <li>Data di <strong>Google Spreadsheet TIDAK DIHAPUS</strong>, melainkan ditandai non-aktif (<strong>Aktif di Dashboard = 0</strong>).</li>
                                    <li>Nama dan waktu penghapusan akan diaudit secara otomatis.</li>
                                </ul>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                    Nama Supervisor yang Menghapus:
                                </label>
                                <input
                                    type="text"
                                    value={deleteSupervisorName}
                                    onChange={(e) => setDeleteSupervisorName(e.target.value)}
                                    placeholder="Contoh: Pak Budi (Supervisor)"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-rose-500"
                                    disabled={isDeleting}
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end gap-2.5">
                            <button
                                type="button"
                                onClick={() => setIssueToDelete(null)}
                                disabled={isDeleting}
                                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteConfirm}
                                disabled={isDeleting}
                                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-600/30 flex items-center gap-1.5 transition disabled:opacity-50"
                            >
                                <Trash2 className={`w-3.5 h-3.5 ${isDeleting ? 'animate-spin' : ''}`} />
                                <span>{isDeleting ? 'Menghapus...' : 'Hapus Tiket'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
