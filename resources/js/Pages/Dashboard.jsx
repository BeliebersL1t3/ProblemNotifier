import { Head } from '@inertiajs/react';
import { useMemo, useState, useEffect, useRef } from 'react';
import { Loader2, RefreshCw, SearchX } from 'lucide-react';

import { useLanguage } from '@/context/LanguageContext';
import { IssuesProvider, useIssues } from '@/context/IssuesContext';
import { CampusFixHeader } from '@/Components/CampusFix/CampusFixHeader';
import { AnalyticsBar } from '@/Components/CampusFix/AnalyticsBar';
import { FilterChips } from '@/Components/CampusFix/FilterChips';
import { IssueCard } from '@/Components/CampusFix/IssueCard';
import { ReportIssueModal } from '@/Components/CampusFix/ReportIssueModal';
import { TakeJobModal } from '@/Components/CampusFix/TakeJobModal';
import { ResolveIssueSheet } from '@/Components/CampusFix/ResolveIssueSheet';
import { SolvedDetailModal } from '@/Components/CampusFix/SolvedDetailModal';
import { EmergencyIssueModal } from '@/Components/CampusFix/EmergencyIssueModal';
import { ExportPdfModal } from '@/Components/CampusFix/ExportPdfModal';
import { NewPeriodModal } from '@/Components/CampusFix/NewPeriodModal';
import { ScrollToTop } from '@/Components/CampusFix/ScrollToTop';
import { Button } from '@/Components/UI/Button';

export default function Dashboard() {
    return (
        <IssuesProvider>
            <Head title="Dashboard — Telunas Resort" />
            <DashboardInner />
        </IssuesProvider>
    );
}

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
    const { t } = useLanguage();
    const [query, setQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all'); // 'all' or 'category:xxx'
    const [statusFilter, setStatusFilter] = useState('all');    // 'all', 'open', 'progress', 'pending', 'solved'
    const [deptFilter, setDeptFilter] = useState('all');
    const [reportOpen, setReportOpen] = useState(false);
    const [emergencyOpen, setEmergencyOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const [newPeriodOpen, setNewPeriodOpen] = useState(false);
    const [takeTarget, setTakeTarget] = useState(null);
    const [resolveTarget, setResolveTarget] = useState(null);
    const [detailTarget, setDetailTarget] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [now, setNow] = useState(Date.now());
    const soundedMilestones = useRef(new Set());

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
        const filtered = issues.filter((issue) => {
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
            
            // For all other cases (or ties in critical status), sort newest first
            return (b.reportedAt || 0) - (a.reportedAt || 0);
        });
    }, [issues, query, categoryFilter, statusFilter, deptFilter]);

    const handleSelect = (issue) => {
        if (issue.status === 'open') setTakeTarget(issue);
        if (issue.status === 'open') setClaimTarget(issue);
        else if (issue.status === 'progress' || issue.status === 'pending') setResolveTarget(issue);
        else setDetailTarget(issue);
    };

    return (
        <div className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20">
            <CampusFixHeader
                mode="dashboard"
                query={query}
                onQueryChange={setQuery}
                onReport={() => setReportOpen(true)}
                onEmergency={() => setEmergencyOpen(true)}
                onExport={() => setExportOpen(true)}
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

                {error && (
                    <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                        <span>{error}</span>
                        <Button variant="outline" size="sm" onClick={fetchIssues}>
                            Retry
                        </Button>
                    </div>
                )}

                <AnalyticsBar />
                
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-border/50 pb-4">
                    <FilterChips
                        categoryFilter={categoryFilter}
                        onCategoryChange={setCategoryFilter}
                        statusFilter={statusFilter}
                        onStatusChange={setStatusFilter}
                        deptFilter={deptFilter}
                        onDeptChange={setDeptFilter}
                    />
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
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {visible.map((issue) => (
                            <IssueCard key={issue.id} issue={issue} onSelect={handleSelect} />
                        ))}
                    </div>
                )}
            </main>

            <ReportIssueModal open={reportOpen} onOpenChange={setReportOpen} />
            <EmergencyIssueModal open={emergencyOpen} onOpenChange={setEmergencyOpen} />
            <ExportPdfModal open={exportOpen} onOpenChange={setExportOpen} />
            <NewPeriodModal open={newPeriodOpen} onOpenChange={setNewPeriodOpen} />
            <TakeJobModal issue={takeTarget} onClose={() => setTakeTarget(null)} />
            <ResolveIssueSheet issue={resolveTarget} onClose={() => setResolveTarget(null)} />
            <SolvedDetailModal issue={detailTarget} onClose={() => setDetailTarget(null)} />
            <ScrollToTop />
        </div>
    );
}

