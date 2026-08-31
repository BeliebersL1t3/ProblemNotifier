import { Head } from '@inertiajs/react';
import { useMemo, useState, useEffect, useRef } from 'react';
import { Loader2, RefreshCw, SearchX, LayoutGrid, Grid3X3, Layers, Search, MapPin, Trash2, AlertTriangle, CalendarPlus } from 'lucide-react';
import { getDepartmentTheme } from '@/constants/departments';

import { useLanguage } from '@/context/LanguageContext';
import { IssuesProvider, useIssues } from '@/context/IssuesContext';
import { CampusFixHeader } from '@/Components/CampusFix/CampusFixHeader';
import { AnalyticsBar } from '@/Components/CampusFix/AnalyticsBar';
import { FilterChips } from '@/Components/CampusFix/FilterChips';
import { IssueCard } from '@/Components/CampusFix/IssueCard';
import { ReportIssueModal } from '@/Components/CampusFix/ReportIssueModal';
import { EditIssueModal } from '@/Components/CampusFix/EditIssueModal';
import { TakeJobModal } from '@/Components/CampusFix/TakeJobModal';
import { ResolveIssueSheet } from '@/Components/CampusFix/ResolveIssueSheet';
import { SolvedDetailModal } from '@/Components/CampusFix/SolvedDetailModal';
import { ActivityDetailModal } from '@/Components/CampusFix/ActivityDetailModal';
import { EmergencyIssueModal } from '@/Components/CampusFix/EmergencyIssueModal';
import { NewPeriodModal } from '@/Components/CampusFix/NewPeriodModal';
import { ScrollToTop } from '@/Components/CampusFix/ScrollToTop';
import { Button } from '@/Components/UI/Button';
import { normalizeDepartment } from '@/constants/staff';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/UI/Dialog';
import { useAuth } from '@/hooks/useAuth';
import { ErrorBoundary } from '@/Components/CampusFix/ErrorBoundary';


let sharedAudioContext = null;

function getAudioContext() {
    try {
        if (!sharedAudioContext) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                sharedAudioContext = new AudioContextClass();
            }
        }
        if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
            sharedAudioContext.resume().catch(() => {});
        }
        return sharedAudioContext;
    } catch (e) {
        return null;
    }
}

function playAlarmBeep() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return false;

        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        const playPulse = (delayMs) => {
            setTimeout(() => {
                try {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(880, ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.2);

                    gain.gain.setValueAtTime(0.35, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

                    osc.connect(gain);
                    gain.connect(ctx.destination);

                    osc.start();
                    osc.stop(ctx.currentTime + 0.2);
                } catch (e) {}
            }, delayMs);
        };

        playPulse(0);
        playPulse(150);
        return ctx.state === 'running';
    } catch (e) {
        return false;
    }
}

function DashboardInner() {
    const { issues, loading, error, fetchIssues } = useIssues();
    const { t, lang } = useLanguage();
    const { isDeptUser, department } = useAuth();
    const [query, setQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    // For department users, lock the dept filter to their department
    const [deptFilter, setDeptFilter] = useState(() => isDeptUser && department ? department : 'all');
    const [deptViewMode, setDeptViewMode] = useState('all'); // 'all' | 'assigned' | 'origin'
    const [viewDensity, setViewDensity] = useState(() => {
        try {
            return localStorage.getItem('campusfix_dashboard_density') || '3';
        } catch (e) {
            return '3';
        }
    });

    const handleDensityChange = (density) => {
        setViewDensity(density);
        try {
            localStorage.setItem('campusfix_dashboard_density', density);
        } catch (e) {}
    };

    const [reportOpen, setReportOpen] = useState(false);
    const [emergencyOpen, setEmergencyOpen] = useState(false);
    const [newPeriodOpen, setNewPeriodOpen] = useState(false);
    const [takeTarget, setTakeTarget] = useState(null);
    const [resolveTarget, setResolveTarget] = useState(null);
    const [detailTarget, setDetailTarget] = useState(null);
    const [activityDetailTarget, setActivityDetailTarget] = useState(null);
    const [editTarget, setEditTarget] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [isMuted, setIsMuted] = useState(false);
    const [now, setNow] = useState(Date.now());
    const soundedMilestones = useRef(new Set());

    const { deleteIssue, currentSheet } = useIssues();

    const handleConfirmDelete = async () => {
        if (!deleteTarget || isDeleting) return;
        setIsDeleting(true);
        setDeleteError('');
        try {
            await deleteIssue(deleteTarget);
            setDeleteTarget(null);
        } catch (err) {
            setDeleteError(err.message || 'Failed to delete issue.');
        } finally {
            setIsDeleting(false);
        }
    };

    // 1. Global user interaction listener to unlock Web Audio API Context
    useEffect(() => {
        const unlock = () => {
            const ctx = getAudioContext();
            if (ctx && ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }
        };
        window.addEventListener('click', unlock);
        window.addEventListener('pointerdown', unlock);
        window.addEventListener('keydown', unlock);
        return () => {
            window.removeEventListener('click', unlock);
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
        };
    }, []);

    // 2. 5-second ticker to check milestone alarms accurately as time passes
    useEffect(() => {
        const timer = setInterval(() => {
            setNow(Date.now());
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    // 3. Unclaimed overdue issues (status === 'open')
    const openOverdueCriticals = useMemo(() => {
        return issues.filter(i => {
            if (i.status !== 'open' || i.priority !== 'critical' || !i.deadline) return false;
            let deadlineTime = parseInt(i.deadline, 10);
            if (isNaN(deadlineTime) || deadlineTime <= 0) return false;
            if (deadlineTime < 10000000000) deadlineTime *= 1000;
            return now >= deadlineTime;
        });
    }, [issues, now]);

    // 4. In Progress overdue issues (status === 'progress')
    const progressOverdueCriticals = useMemo(() => {
        return issues.filter(i => {
            if (i.status !== 'progress' || i.priority !== 'critical' || !i.deadline) return false;
            let deadlineTime = parseInt(i.deadline, 10);
            if (isNaN(deadlineTime) || deadlineTime <= 0) return false;
            if (deadlineTime < 10000000000) deadlineTime *= 1000;
            return now >= deadlineTime;
        });
    }, [issues, now]);

    const totalOverdueCount = openOverdueCriticals.length + progressOverdueCriticals.length;

    // Continuous alarm for UNCLAIMED open overdue issues
    useEffect(() => {
        if (openOverdueCriticals.length > 0 && !isMuted) {
            playAlarmBeep();
            const interval = setInterval(() => {
                playAlarmBeep();
            }, 3500);
            return () => clearInterval(interval);
        }
    }, [openOverdueCriticals.length, isMuted]);

    // Short 1-shot milestone alarm burst for IN PROGRESS items at 5, 10, 15, 30, 60 minutes
    useEffect(() => {
        if (isMuted || progressOverdueCriticals.length === 0) return;
        const MILESTONES = [5, 10, 15, 30, 60];

        progressOverdueCriticals.forEach(issue => {
            let deadlineTime = parseInt(issue.deadline, 10);
            if (deadlineTime < 10000000000) deadlineTime *= 1000;
            const overdueMins = Math.floor((now - deadlineTime) / 60000);

            MILESTONES.forEach(m => {
                if (overdueMins >= m) {
                    const key = `${issue.id}-${m}`;
                    if (!soundedMilestones.current.has(key)) {
                        const played = playAlarmBeep();
                        if (played) {
                            soundedMilestones.current.add(key);
                        }
                    }
                }
            });
        });
    }, [progressOverdueCriticals, isMuted, now]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();

        // For department users, pre-filter to their department scope & perspective
        const deptScoped = isDeptUser && department
            ? issues.filter(issue => {
                const normUserDept = normalizeDepartment(department);
                const assigned = (Array.isArray(issue.assignedDepartments) 
                    ? issue.assignedDepartments 
                    : (issue.assignedDepartments ? String(issue.assignedDepartments).split(',') : [])
                ).map(d => normalizeDepartment(d.trim()));
                const tagged = (Array.isArray(issue.taggedDepartments) 
                    ? issue.taggedDepartments 
                    : (issue.taggedDepartments ? String(issue.taggedDepartments).split(',') : [])
                ).map(d => normalizeDepartment(d.trim()));
                const isOrigin = normalizeDepartment(issue.department) === normUserDept;
                const isAssigned = assigned.includes(normUserDept);
                const isTagged = tagged.includes(normUserDept);

                if (deptViewMode === 'assigned') return isAssigned;
                if (deptViewMode === 'origin') return isOrigin;
                if (deptViewMode === 'tagged') return isTagged;
                return isAssigned || isOrigin || isTagged;
              })
            : issues;

        const filtered = deptScoped.filter((issue) => {
            const matchesQuery =
                !q ||
                issue.title.toLowerCase().includes(q) ||
                issue.location.toLowerCase().includes(q) ||
                issue.description.toLowerCase().includes(q);

            const matchesCategory = categoryFilter === 'all'
                ? true
                : issue.category === categoryFilter.slice('category:'.length);

            const matchesStatus = statusFilter === 'all'
                ? true
                : issue.status === statusFilter;

            const matchesDept = deptFilter === 'all' ? true : (
                (Array.isArray(issue.assignedDepartments) && issue.assignedDepartments.includes(deptFilter)) ||
                issue.assignedDepartments === deptFilter ||
                issue.department === deptFilter || 
                (Array.isArray(issue.taggedDepartments) && issue.taggedDepartments.includes(deptFilter)) ||
                issue.taggedDepartments === deptFilter
            );

            return matchesQuery && matchesCategory && matchesStatus && matchesDept;
        });

        // Sort active critical issues to the top
        return filtered.sort((a, b) => {
            const aIsCriticalActive = a.priority === 'critical' && a.status !== 'solved';
            const bIsCriticalActive = b.priority === 'critical' && b.status !== 'solved';
            if (aIsCriticalActive && !bIsCriticalActive) return -1;
            if (bIsCriticalActive && !aIsCriticalActive) return 1;
            if (aIsCriticalActive && bIsCriticalActive) {
                if (a.status === 'open' && b.status === 'progress') return -1;
                if (a.status === 'progress' && b.status === 'open') return 1;
            }
            return (b.reportedAt || 0) - (a.reportedAt || 0);
        });
    }, [issues, query, categoryFilter, statusFilter, deptFilter, isDeptUser, department, deptViewMode]);

    const handleSelect = (issue) => {
        if (!issue) return;
        if (issue.status === 'open') setTakeTarget(issue);
        else if (issue.status === 'progress' || issue.status === 'pending') setResolveTarget(issue);
        else setDetailTarget(issue);
    };

    const renderSearchDropdown = (closeDropdown) => {
        if (!query || !query.trim()) return null;

        const q = query.trim().toLowerCase();
        const matches = issues.filter(issue => {
            const id = String(issue.id || '').toLowerCase();
            const title = (issue.title || '').toLowerCase();
            const desc = (issue.description || '').toLowerCase();
            const loc = (issue.location || '').toLowerCase();
            const dept = (issue.department || '').toLowerCase();
            const reporter = (issue.reporter || '').toLowerCase();
            const status = (issue.status || '').toLowerCase();
            return id.includes(q) || title.includes(q) || desc.includes(q) || loc.includes(q) || dept.includes(q) || reporter.includes(q) || status.includes(q);
        }).slice(0, 8);

        return (
            <div 
                className="absolute left-0 right-0 top-full mt-2 bg-[#2A281E] border border-[#3B3929] rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-2xl animate-in fade-in slide-in-from-top-2"
                style={{
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7), 0 0 20px rgba(201, 170, 113, 0.2)',
                }}
            >
                <div className="px-4 py-2.5 bg-[#1C1B0E]/90 border-b border-[#3B3929] flex items-center justify-between text-xs font-bold text-[#A19F8D]">
                    <div className="flex items-center gap-2">
                        <Search className="h-3.5 w-3.5 text-[#C9AA71]" />
                        <span>
                            <strong className="text-[#FAFAFA]">{matches.length}</strong> {lang === 'id' ? 'isu ditemukan' : 'issues found'}
                        </span>
                    </div>
                    <span className="text-[10px] text-[#C9AA71]/80 uppercase tracking-wider font-extrabold hidden sm:inline">
                        {lang === 'id' ? 'Klik untuk membuka' : 'Click to inspect'}
                    </span>
                </div>

                {matches.length === 0 ? (
                    <div className="p-5 text-center text-[#A19F8D]">
                        <p className="text-sm font-semibold text-[#FAFAFA] mb-1">
                            {lang === 'id' ? 'Tidak ada isu ditemukan' : 'No issues found'}
                        </p>
                    </div>
                ) : (
                    <div className="max-h-[360px] overflow-y-auto divide-y divide-[#3B3929]/40 custom-scrollbar">
                        {matches.map((issue) => {
                            const isSolved = issue.status === 'solved';
                            const isProgress = issue.status === 'progress';
                            const isPending = issue.status === 'pending';
                            const primaryDept = issue.department || issue.assignedDepartments?.[0] || 'General';
                            const dTheme = getDepartmentTheme(primaryDept);

                            return (
                                <div
                                    key={issue.id}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        closeDropdown?.();
                                        handleSelect(issue);
                                    }}
                                    className="p-3 hover:bg-[#353326]/80 active:bg-[#3B3929] transition-all cursor-pointer group flex items-center justify-between gap-3 select-none touch-manipulation"
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <img
                                            src={issue.imageUrl || '/barrier-placeholder.svg'}
                                            alt=""
                                            className="w-10 h-10 rounded-lg object-cover bg-black/40 border border-white/10 shrink-0"
                                        />

                                        <div className="min-w-0 flex-1 space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span
                                                    className="px-2 py-0.2 rounded text-[9px] font-black uppercase tracking-wider shadow-xs"
                                                    style={{
                                                        backgroundColor: dTheme.bg,
                                                        color: dTheme.bg === '#212121' ? '#FFFFFF' : dTheme.text,
                                                    }}
                                                >
                                                    {primaryDept}
                                                </span>

                                                <span
                                                    className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase ${
                                                        isSolved
                                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                            : isProgress
                                                                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                                                : isPending
                                                                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                                                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                    }`}
                                                >
                                                    {issue.status}
                                                </span>

                                                {issue.location && (
                                                    <span className="text-[10px] text-[#A19F8D] flex items-center gap-0.5">
                                                        📍 {issue.location}
                                                    </span>
                                                )}
                                            </div>

                                            <h4 className="text-xs font-bold text-[#FAFAFA] group-hover:text-[#C9AA71] truncate transition-colors">
                                                <span className="font-mono text-muted-foreground mr-1.5">#{issue.id}</span>
                                                {issue.title}
                                            </h4>
                                        </div>
                                    </div>

                                    <div className="shrink-0 text-right">
                                        <span className="text-[10px] font-extrabold text-[#C9AA71] group-hover:underline">
                                            {lang === 'id' ? 'Buka ➔' : 'View ➔'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20">
            <CampusFixHeader
                mode="dashboard"
                query={query}
                onQueryChange={setQuery}
                searchDropdown={renderSearchDropdown}
                onReport={() => setReportOpen(true)}
                onEmergency={() => setEmergencyOpen(true)}
                onNewPeriod={() => setNewPeriodOpen(true)}
            />

            {totalOverdueCount > 0 && (
                <div className="bg-red-600 text-white px-4 py-2.5 font-bold flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg border-b border-red-500 animate-pulse">
                    <div className="flex items-center gap-2 text-sm sm:text-base">
                        <span className="text-xl">🚨</span>
                        <span>
                            {t('overdue_alert')} ({totalOverdueCount}) — {openOverdueCriticals.length > 0 ? `${openOverdueCriticals.length} ${t('unclaimed')}` : ''}{openOverdueCriticals.length > 0 && progressOverdueCriticals.length > 0 ? ', ' : ''}{progressOverdueCriticals.length > 0 ? `${progressOverdueCriticals.length} ${t('in_progress')}` : ''}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsMuted(prev => !prev)}
                        className="px-3 py-1 text-xs font-extrabold rounded-lg bg-black/40 hover:bg-black/60 border border-white/30 transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
                    >
                        {isMuted ? `🔇 ${t('unmute_alarm')}` : `🔊 ${t('sound_active')}`}
                    </button>
                </div>
            )}

            <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                            {t('facility_dashboard')}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {t('dashboard_desc')}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setNewPeriodOpen(true)}
                            className="w-fit shrink-0 gap-2 border-[#C9AA71]/40 text-[#E3D1AA] hover:bg-[#C9AA71]/15 transition-all shadow-xs cursor-pointer"
                            title={`${t('period') || 'Sheets'}: ${currentSheet === 'all' ? (lang === 'id' ? 'Semua Sheet' : 'All Sheets') : (currentSheet || 'Default')}`}
                        >
                            <CalendarPlus className="h-4 w-4 text-[#C9AA71]" />
                            <span>{t('period') || 'Pilih Sheet'}</span>
                            {currentSheet && (
                                <span className="ml-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#C9AA71]/20 text-[#E3D1AA] border border-[#C9AA71]/30 max-w-[120px] truncate">
                                    {currentSheet === 'all' ? (lang === 'id' ? 'Semua' : 'All') : currentSheet}
                                </span>
                            )}
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchIssues}
                            disabled={loading}
                            className="w-fit shrink-0 gap-2"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            {t('sync_sheets')}
                        </Button>
                    </div>
                </div>

                {error && (
                    <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                        <span>{error}</span>
                        <Button variant="outline" size="sm" onClick={fetchIssues}>
                            Retry
                        </Button>
                    </div>
                )}

                <AnalyticsBar statusFilter={statusFilter} onStatusChange={setStatusFilter} />
                
                <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between border-b border-border/50 pb-4">
                    <FilterChips
                        categoryFilter={categoryFilter}
                        onCategoryChange={setCategoryFilter}
                        deptFilter={deptFilter}
                        onDeptChange={setDeptFilter}
                    />

                    <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto justify-between md:justify-end">
                        {isDeptUser && (
                            <div className="flex items-center rounded-xl bg-[#2A281E] p-1 border border-[#3B3929] text-xs font-bold shrink-0 max-w-full overflow-x-auto no-scrollbar flex-nowrap gap-0.5 shadow-sm">
                                <button
                                    type="button"
                                    onClick={() => setDeptViewMode('all')}
                                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                                        deptViewMode === 'all'
                                            ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    🌐 {t('all_my_scope')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeptViewMode('assigned')}
                                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                                        deptViewMode === 'assigned'
                                            ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    🎯 {t('to_fix')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeptViewMode('origin')}
                                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                                        deptViewMode === 'origin'
                                            ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    🏠 {t('reported_by_me')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeptViewMode('tagged')}
                                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                                        deptViewMode === 'tagged'
                                            ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    📢 {t('mentioned_me')}
                                </button>
                            </div>
                        )}

                        {/* View Density Selector (3 | 5 | 10) - Hidden on mobile view */}
                        <div className="hidden sm:flex items-center rounded-xl bg-[#2A281E] p-1 border border-[#3B3929] text-xs font-bold shrink-0 self-stretch sm:self-auto justify-center" title="Density View (3, 5, 10 columns)">
                            <button
                                type="button"
                                onClick={() => handleDensityChange('3')}
                                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                                    viewDensity === '3'
                                        ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                                title="3 Columns — Detail View (Standard)"
                            >
                                <LayoutGrid className="h-3.5 w-3.5" />
                                <span>3</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDensityChange('5')}
                                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                                    viewDensity === '5'
                                        ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                                title="5 Columns — Compact View"
                            >
                                <Grid3X3 className="h-3.5 w-3.5" />
                                <span>5</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDensityChange('10')}
                                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                                    viewDensity === '10'
                                        ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                                title="10 Columns — Micro Matrix View"
                            >
                                <Layers className="h-3.5 w-3.5" />
                                <span>10</span>
                            </button>
                        </div>
                    </div>
                </div>

                {loading && issues.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface py-20 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm font-medium text-muted-foreground">Connecting to Google Sheets...</p>
                    </div>
                ) : visible.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface py-16 text-center">
                        <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
                        <p className="font-semibold text-foreground">No issues match your filters</p>
                        <p className="text-sm text-muted-foreground">
                            Try a different keyword or reset the filter chips.
                        </p>
                    </div>
                ) : (
                    <div className={
                        viewDensity === '10'
                            ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-10 gap-2'
                            : viewDensity === '5'
                                ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5'
                                : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'
                    }>
                        {visible.map((issue) => (
                            <IssueCard
                                key={issue.id}
                                issue={issue}
                                onSelect={handleSelect}
                                onEdit={(item) => setEditTarget(item)}
                                onDelete={(item) => {
                                    setDeleteError('');
                                    setDeleteTarget(item);
                                }}
                                density={viewDensity}
                            />
                        ))}
                    </div>
                )}
            </main>

            <ReportIssueModal open={reportOpen} onOpenChange={setReportOpen} />
            <EmergencyIssueModal open={emergencyOpen} onOpenChange={setEmergencyOpen} />
            <NewPeriodModal open={newPeriodOpen} onOpenChange={setNewPeriodOpen} />
            <EditIssueModal issue={editTarget} open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)} />
            <TakeJobModal issue={takeTarget} onClose={() => setTakeTarget(null)} />
            <ResolveIssueSheet issue={resolveTarget} onClose={() => setResolveTarget(null)} />
            <SolvedDetailModal issue={detailTarget} onClose={() => setDetailTarget(null)} />
            <ActivityDetailModal 
                issue={activityDetailTarget} 
                onClose={() => setActivityDetailTarget(null)} 
                onEdit={(item) => setEditTarget(item)}
            />

            {/* Permanent Deletion Confirmation Modal */}
            <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!isDeleting) setDeleteTarget(null); }}>
                <DialogContent className="sm:max-w-md bg-[#1C1B0E] border border-red-500/40 text-[#FAFAFA] p-6 shadow-2xl">
                    <DialogHeader>
                        <div className="flex items-center gap-2 text-red-400">
                            <AlertTriangle className="h-5 w-5" />
                            <DialogTitle className="text-lg font-bold text-red-400">
                                {lang === 'id' ? 'Konfirmasi Hapus Isu' : 'Confirm Delete Issue'}
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-xs text-muted-foreground pt-1">
                            {lang === 'id' 
                                ? 'Apakah Anda yakin ingin menghapus isu ini secara permanen dari Google Sheets? Data yang dihapus tidak dapat dipulihkan.' 
                                : 'Are you sure you want to permanently delete this issue from Google Sheets? This action cannot be undone.'}
                        </DialogDescription>
                    </DialogHeader>

                    {deleteError && (
                        <div className="rounded-lg bg-destructive/15 p-3 text-xs font-medium text-destructive">
                            {deleteError}
                        </div>
                    )}

                    {deleteTarget && (
                        <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-xs space-y-1.5 font-mono">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">ID:</span>
                                <span className="font-bold text-[#C9AA71]">{deleteTarget.id}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Title:</span>
                                <span className="font-semibold text-foreground truncate max-w-[200px]">{deleteTarget.title}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Location:</span>
                                <span className="text-muted-foreground">{deleteTarget.location}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Origin Dept:</span>
                                <span className="text-[#C9AA71]">{deleteTarget.department || 'General'}</span>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="pt-2 gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDeleteTarget(null)}
                            disabled={isDeleting}
                            className="text-xs h-9 border-[#3B3929] hover:bg-[#2A281E]"
                        >
                            {lang === 'id' ? 'Batal' : 'Cancel'}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            className="text-xs h-9 gap-1.5 font-bold shadow-md cursor-pointer"
                        >
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            {isDeleting ? (lang === 'id' ? 'Menghapus...' : 'Deleting...') : (lang === 'id' ? 'Hapus Isu' : 'Delete Issue')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ScrollToTop />
        </div>
    );
}

export default function Dashboard() {
    return (
        <ErrorBoundary>
            <IssuesProvider>
                <Head title="Dashboard — Telunas Resort" />
                <DashboardInner />
            </IssuesProvider>
        </ErrorBoundary>
    );
}

