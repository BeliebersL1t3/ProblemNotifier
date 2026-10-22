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
    ExternalLink,
    AlertCircle
} from 'lucide-react';

export default function LeanIndex({ issues = [], departments = [], locations = [], currentUser = null }) {
    // --- Local Profile State (Stored in localStorage for quick field access) ---
    const [myDept, setMyDept] = useState(() => {
        if (currentUser?.department) return currentUser.department;
        return localStorage.getItem('lean_staff_dept') || 'Engineer';
    });
    const [myName, setMyName] = useState(() => {
        if (currentUser?.name) return currentUser.name;
        return localStorage.getItem('lean_staff_name') || 'Staf Lapangan';
    });
    const [showProfileModal, setShowProfileModal] = useState(false);

    // Save profile to localStorage
    useEffect(() => {
        localStorage.setItem('lean_staff_dept', myDept);
        localStorage.setItem('lean_staff_name', myName);
    }, [myDept, myName]);

    // --- UI Filters & View Modes ---
    // Tab: 'assigned_to_me' (Tugas Tim Saya) | 'reported_by_me' (Laporan Kami) | 'all' (Semua Isu)
    const [activeTab, setActiveTab] = useState('assigned_to_me');
    // Status Filter: 'all' | 'open' | 'in_progress' | 'resolved'
    const [statusFilter, setStatusFilter] = useState('all');

    // --- Modal States ---
    const [showReportModal, setShowReportModal] = useState(false);
    const [showResolveModal, setShowResolveModal] = useState(null); // issue object
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [lightboxImage, setLightboxImage] = useState(null);

    // --- Report Form State ---
    const [formLocation, setFormLocation] = useState('');
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
        if (!formLocation || !formTitle || formTargetDepts.length === 0) {
            alert('Mohon isi lokasi, judul masalah, dan departemen tujuan.');
            return;
        }

        setIsSubmitting(true);
        const data = new FormData();
        data.append('location', formLocation);
        data.append('title', formTitle);
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
                setFormLocation('');
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

    // --- Filter Issues based on Active Tab & Status ---
    const filteredIssues = useMemo(() => {
        return issues.filter((item) => {
            // 1. Tab filtering
            if (activeTab === 'assigned_to_me') {
                const targets = item.target_departments || [];
                const isTarget = targets.some((d) => d.toLowerCase() === myDept.toLowerCase());
                if (!isTarget) return false;
            } else if (activeTab === 'reported_by_me') {
                const isMyOrigin = (item.reporter_dept || '').toLowerCase() === myDept.toLowerCase();
                if (!isMyOrigin) return false;
            }
            // activeTab === 'all' includes all issues

            // 2. Status filtering
            if (statusFilter !== 'all' && item.status !== statusFilter) {
                return false;
            }

            return true;
        });
    }, [issues, activeTab, statusFilter, myDept]);

    // Counters for tabs
    const counts = useMemo(() => {
        const assigned = issues.filter((i) =>
            (i.target_departments || []).some((d) => d.toLowerCase() === myDept.toLowerCase())
        ).length;
        const reported = issues.filter((i) =>
            (i.reporter_dept || '').toLowerCase() === myDept.toLowerCase()
        ).length;
        const total = issues.length;

        const open = filteredIssues.filter((i) => i.status === 'open').length;
        const inProgress = filteredIssues.filter((i) => i.status === 'in_progress').length;
        const resolved = filteredIssues.filter((i) => i.status === 'resolved').length;

        return { assigned, reported, total, open, inProgress, resolved };
    }, [issues, filteredIssues, myDept]);

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans pb-24 md:pb-12">
            <Head title="Mode Lapangan (Sandbox) — Telunas Issue Tracker" />

            {/* TOP HEADER */}
            <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 shadow-md">
                <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
                    {/* Brand & Sandbox Pill */}
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-sm shadow-sm">
                            📱
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <h1 className="text-sm font-bold text-white tracking-tight">Mode Lapangan</h1>
                                <span className="text-[10px] bg-amber-500/20 border border-amber-500/40 text-amber-300 font-semibold px-1.5 py-0.2 rounded-full">
                                    Sandbox
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-400">Telunas Resorts Tracker</p>
                        </div>
                    </div>

                    {/* Profile & Navigation Switcher */}
                    <div className="flex items-center gap-2">
                        {/* Profile Chip */}
                        <button
                            onClick={() => setShowProfileModal(true)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-xs transition-colors"
                            title="Ubah identitas staf lapangan"
                        >
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="font-semibold text-slate-200 truncate max-w-[90px]">{myName}</span>
                            <span className="text-[10px] text-emerald-400 font-medium bg-emerald-950/80 px-1 rounded">
                                {myDept}
                            </span>
                        </button>

                        {/* Back to Full Dashboard / Login */}
                        <Link
                            href={currentUser ? route('dashboard') : route('login')}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors"
                            title={currentUser ? "Buka Mode Kantor (Dashboard Lengkap)" : "Ke Halaman Login"}
                        >
                            <ExternalLink className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT CONTAINER */}
            <main className="max-w-4xl mx-auto w-full px-4 pt-4 flex-1">
                {/* NOTICE BANNER: ISOLATED TESTING */}
                <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-slate-800/40 border border-amber-500/30 flex items-start justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2 text-amber-200">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold text-amber-300">Lingkungan Uji Coba Terisolasi (Sandbox)</p>
                            <p className="text-[11px] text-amber-200/80 mt-0.5 leading-relaxed">
                                Laporan di sini tidak masuk ke dashboard resmi dan tidak mengirim notifikasi WhatsApp. Bebas dipakai untuk simulasi.
                            </p>
                        </div>
                    </div>
                    {issues.length > 0 && (
                        <button
                            onClick={() => setShowResetConfirm(true)}
                            className="shrink-0 flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/60 px-2 py-1 rounded-md transition-colors"
                        >
                            <Trash2 className="w-3 h-3" />
                            Reset Data
                        </button>
                    )}
                </div>

                {/* 3 VISIBILITY TABS */}
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-800/80 rounded-xl border border-slate-700/80 mb-4 text-xs font-semibold">
                    <button
                        onClick={() => setActiveTab('assigned_to_me')}
                        className={`py-2 px-1 rounded-lg text-center transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
                            activeTab === 'assigned_to_me'
                                ? 'bg-emerald-600 text-white shadow-sm font-bold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                        }`}
                    >
                        <span>Tugas Tim Saya</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            activeTab === 'assigned_to_me' ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-700 text-slate-300'
                        }`}>
                            {counts.assigned}
                        </span>
                    </button>

                    <button
                        onClick={() => setActiveTab('reported_by_me')}
                        className={`py-2 px-1 rounded-lg text-center transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
                            activeTab === 'reported_by_me'
                                ? 'bg-emerald-600 text-white shadow-sm font-bold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                        }`}
                    >
                        <span>Laporan Kami</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            activeTab === 'reported_by_me' ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-700 text-slate-300'
                        }`}>
                            {counts.reported}
                        </span>
                    </button>

                    <button
                        onClick={() => setActiveTab('all')}
                        className={`py-2 px-1 rounded-lg text-center transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
                            activeTab === 'all'
                                ? 'bg-emerald-600 text-white shadow-sm font-bold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                        }`}
                    >
                        <span>Semua Isu Resort</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            activeTab === 'all' ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-700 text-slate-300'
                        }`}>
                            {counts.total}
                        </span>
                    </button>
                </div>

                {/* STATUS FILTER PILLS & ACTION BAR */}
                <div className="flex items-center justify-between gap-2 mb-4 overflow-x-auto pb-1">
                    <div className="flex items-center gap-1.5 text-xs">
                        <button
                            onClick={() => setStatusFilter('all')}
                            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                                statusFilter === 'all'
                                    ? 'bg-slate-200 text-slate-900 font-bold'
                                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                            }`}
                        >
                            Semua ({filteredIssues.length})
                        </button>
                        <button
                            onClick={() => setStatusFilter('open')}
                            className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                                statusFilter === 'open'
                                    ? 'bg-rose-500 text-white font-bold'
                                    : 'bg-slate-800 text-rose-400 hover:bg-slate-700 border border-slate-700'
                            }`}
                        >
                            <span className="w-2 h-2 rounded-full bg-rose-400" />
                            Baru ({counts.open})
                        </button>
                        <button
                            onClick={() => setStatusFilter('in_progress')}
                            className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                                statusFilter === 'in_progress'
                                    ? 'bg-amber-500 text-white font-bold'
                                    : 'bg-slate-800 text-amber-400 hover:bg-slate-700 border border-slate-700'
                            }`}
                        >
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            Dikerjakan ({counts.inProgress})
                        </button>
                        <button
                            onClick={() => setStatusFilter('resolved')}
                            className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                                statusFilter === 'resolved'
                                    ? 'bg-emerald-500 text-white font-bold'
                                    : 'bg-slate-800 text-emerald-400 hover:bg-slate-700 border border-slate-700'
                            }`}
                        >
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            Selesai ({counts.resolved})
                        </button>
                    </div>

                    {/* Quick Report Trigger on desktop */}
                    <button
                        onClick={() => setShowReportModal(true)}
                        className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all shrink-0"
                    >
                        <Plus className="w-4 h-4" />
                        Lapor Isu
                    </button>
                </div>

                {/* ISSUE CARDS LIST */}
                {filteredIssues.length === 0 ? (
                    <div className="py-16 text-center border-2 border-dashed border-slate-800 rounded-2xl p-6">
                        <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-3">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-300">Tidak ada masalah ditemukan</h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                            {activeTab === 'assigned_to_me'
                                ? `Belum ada tiket masalah yang ditujukan ke tim ${myDept}.`
                                : activeTab === 'reported_by_me'
                                ? `Tim ${myDept} belum melaporkan masalah ke departemen lain.`
                                : 'Belum ada masalah di dalam daftar.'}
                        </p>
                        <button
                            onClick={() => setShowReportModal(true)}
                            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all"
                        >
                            <Plus className="w-4 h-4" />
                            Buat Laporan Baru
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredIssues.map((issue) => {
                            const isAssignedToMyDept = (issue.target_departments || []).some(
                                (d) => d.toLowerCase() === myDept.toLowerCase()
                            );
                            const accs = issue.department_accs || {};
                            const myDeptAcc = accs[myDept];
                            const isMyDeptReady = myDeptAcc?.is_acc;

                            return (
                                <div
                                    key={issue.id}
                                    className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 hover:border-slate-600 transition-all shadow-sm space-y-3"
                                >
                                    {/* Card Header: Location + Status */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="px-2.5 py-1 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800/80 font-bold text-xs flex items-center gap-1">
                                                <MapPin className="w-3.5 h-3.5" />
                                                {issue.location}
                                            </span>

                                            {/* Status Badge */}
                                            {issue.status === 'open' && (
                                                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-semibold flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                                    Baru
                                                </span>
                                            )}
                                            {issue.status === 'in_progress' && (
                                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-semibold flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                                    Sedang Dikerjakan
                                                </span>
                                            )}
                                            {issue.status === 'resolved' && (
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                                    Selesai
                                                </span>
                                            )}
                                        </div>

                                        <span className="text-[11px] text-slate-400 shrink-0">
                                            {issue.created_at_human}
                                        </span>
                                    </div>

                                    {/* Title & Description */}
                                    <div>
                                        <h4 className="font-bold text-sm text-white leading-snug">{issue.title}</h4>
                                        {issue.description && (
                                            <p className="text-xs text-slate-300 mt-1 leading-relaxed whitespace-pre-line bg-slate-900/40 p-2.5 rounded-lg border border-slate-700/50">
                                                {issue.description}
                                            </p>
                                        )}
                                    </div>

                                    {/* Image Attachment (if any) */}
                                    {issue.image_url && (
                                        <div className="pt-1">
                                            <button
                                                type="button"
                                                onClick={() => setLightboxImage(issue.image_url)}
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
                                    <div className="pt-2 border-t border-slate-700/60 flex flex-wrap items-center gap-1.5 text-xs">
                                        <span className="text-slate-400 text-[11px]">Tujuan:</span>
                                        {(issue.target_departments || []).map((dept) => {
                                            const isThisAcc = accs[dept]?.is_acc;
                                            const accBy = accs[dept]?.acc_by;
                                            const isMyDeptThis = dept.toLowerCase() === myDept.toLowerCase();

                                            return (
                                                <div
                                                    key={dept}
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border transition-colors ${
                                                        isThisAcc
                                                            ? 'bg-emerald-950/80 border-emerald-600/70 text-emerald-300 font-semibold'
                                                            : 'bg-slate-900 border-slate-700 text-slate-400'
                                                    }`}
                                                >
                                                    {isThisAcc ? (
                                                        <>
                                                            <Check className="w-3 h-3 text-emerald-400" />
                                                            <span>{dept}: ACC ({accBy || 'Staf'})</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Clock className="w-3 h-3 text-amber-400" />
                                                            <span>{dept}: Menunggu ACC</span>
                                                            {/* If current user belongs to this dept and hasn't ACCed yet */}
                                                            {isMyDeptThis && issue.status !== 'resolved' && (
                                                                <button
                                                                    onClick={() => handleAcc(issue.id, dept)}
                                                                    className="ml-1 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-1.5 py-0.2 rounded shadow-sm"
                                                                >
                                                                    ACC
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* FOOTER: REPORTER & ACTION BUTTON */}
                                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                                        {/* Reporter / Claimed Info */}
                                        <div className="text-[11px] text-slate-400 space-y-0.5">
                                            <p>
                                                Pelapor: <strong className="text-slate-300">{issue.reporter_name}</strong> ({issue.reporter_dept})
                                            </p>
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

                                        {/* Action Buttons */}
                                        <div className="flex items-center gap-2 self-end sm:self-auto">
                                            {issue.status === 'open' && (
                                                <button
                                                    onClick={() => handleClaim(issue.id)}
                                                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
                                                >
                                                    <span>Kerjakan Tugas</span>
                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                </button>
                                            )}

                                            {issue.status === 'in_progress' && (
                                                <button
                                                    onClick={() => {
                                                        setShowResolveModal(issue);
                                                        setResolveNote('');
                                                        setResolveImage(null);
                                                        setResolveImagePreview(null);
                                                    }}
                                                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    <span>Tandai Selesai</span>
                                                </button>
                                            )}

                                            {issue.status === 'resolved' && (
                                                <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 bg-emerald-950/60 px-2 py-1 rounded-md border border-emerald-800/40">
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

            {/* FLOATING ACTION BUTTON (MOBILE-FIRST) */}
            <div className="fixed bottom-4 right-4 z-20 md:hidden">
                <button
                    onClick={() => setShowReportModal(true)}
                    className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white flex items-center justify-center shadow-2xl border-2 border-emerald-400/50 transition-all"
                    title="Lapor Masalah Baru"
                >
                    <Plus className="w-7 h-7" />
                </button>
            </div>

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
                            {/* 1. LOKASI */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                                    1. Lokasi Masalah *
                                </label>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mb-2">
                                    {['Villa 01', 'Villa 02', 'Villa 03', 'Villa 04', 'Villa 05', 'Main Lodge', 'Dining Room', 'Jetty'].map((loc) => (
                                        <button
                                            type="button"
                                            key={loc}
                                            onClick={() => setFormLocation(loc)}
                                            className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all truncate ${
                                                formLocation === loc
                                                    ? 'bg-emerald-600 text-white border-emerald-500 font-bold shadow-sm'
                                                    : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600'
                                            }`}
                                        >
                                            {loc}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    value={formLocation}
                                    onChange={(e) => setFormLocation(e.target.value)}
                                    placeholder="Atau ketik lokasi lain (contoh: Staff Village, Dapur)"
                                    className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                    required
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

                            {/* 4. DITUJUKAN KE DEPARTEMEN (MULTI-SELECT) */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                                    <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                                    4. Ditujukan ke Departemen (Bisa pilih lebih dari satu) *
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                    {departments.map((dept) => {
                                        const isSelected = formTargetDepts.includes(dept);
                                        return (
                                            <button
                                                type="button"
                                                key={dept}
                                                onClick={() => toggleTargetDept(dept)}
                                                className={`py-2 px-2.5 rounded-lg text-xs font-semibold border flex items-center justify-between transition-all ${
                                                    isSelected
                                                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                                                        : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
                                                }`}
                                            >
                                                <span>{dept}</span>
                                                {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
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
                                    <p className="font-bold text-slate-200">{myName} ({myDept})</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowProfileModal(true)}
                                    className="text-[11px] text-emerald-400 hover:underline"
                                >
                                    Ganti Nama
                                </button>
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

            {/* MODAL 3: GANTI PROFIL STAF (LOCAL STORAGE) */}
            {showProfileModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="font-bold text-base text-white">Identitas Staf Lapangan</h3>
                                <p className="text-xs text-slate-400">Atur nama & departemen Anda di HP ini</p>
                            </div>
                            <button
                                onClick={() => setShowProfileModal(false)}
                                className="text-slate-400 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1">
                                    Nama Staf
                                </label>
                                <input
                                    type="text"
                                    value={myName}
                                    onChange={(e) => setMyName(e.target.value)}
                                    className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                                    placeholder="Contoh: Budi Santoso"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1">
                                    Departemen Anda
                                </label>
                                <select
                                    value={myDept}
                                    onChange={(e) => setMyDept(e.target.value)}
                                    className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                                >
                                    {departments.map((d) => (
                                        <option key={d} value={d}>
                                            {d}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button
                                onClick={() => setShowProfileModal(false)}
                                className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all mt-2"
                            >
                                Simpan Identitas
                            </button>
                        </div>
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
        </div>
    );
}
