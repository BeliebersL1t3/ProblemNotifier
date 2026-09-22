import React, { useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/Components/UI/Dialog';
import {
    Eye,
    FileText,
    User,
    MapPin,
    Building,
    Tag,
    Calendar,
    AlertCircle,
    CheckCircle2,
    Clock,
    PauseCircle,
    Wrench,
    Hourglass,
    ChevronRight,
    Edit3,
    RotateCcw,
    Camera,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { getDepartmentForStaff, normalizeDepartment } from '@/constants/staff';
import { getDepartmentTheme } from '@/constants/departments';
import { useAuth } from '@/hooks/useAuth';
import { formatDurationLabel, computeDurationFromTimestamps } from '@/lib/duration';

export function ActivityDetailModal({ issue, onClose, onOpenCardModal, onEdit, onRestore }) {
    const { t, lang } = useLanguage();
    const { isAdmin, isDeptUser, department } = useAuth();

    if (!issue) return null;

    const isArchived = Boolean(issue.isArchived || issue.statusDisplay === '0' || issue.displayStatus === '0');

    const userDept = normalizeDepartment(department);
    const originDept = normalizeDepartment(issue?.department);
    const takerDept = normalizeDepartment(getDepartmentForStaff(issue?.taker, issue));
    const pendingDept = normalizeDepartment(getDepartmentForStaff(issue?.pendingBy, issue));
    const solverDept = normalizeDepartment(getDepartmentForStaff(issue?.solver, issue));
    
    const assignedArr = Array.isArray(issue?.assignedDepartments) 
        ? issue.assignedDepartments 
        : (issue?.assignedDepartments ? String(issue.assignedDepartments).split(',') : []);
    const assignedDeptsNormalized = assignedArr.map(d => normalizeDepartment(d.trim())).filter(Boolean);

    const isPastContribution = Boolean(issue?._isPastContribution);
    const takerHasTransferred = Boolean(issue?.takerHasTransferred);

    const canEditReport = !isPastContribution && (isAdmin || (isDeptUser && userDept && userDept === originDept));
    const canEditClaim = !isPastContribution && (isAdmin || (isDeptUser && userDept && (
        (takerDept && userDept === takerDept) || 
        (takerHasTransferred && assignedDeptsNormalized.includes(userDept)) ||
        (!issue?.taker && assignedDeptsNormalized.includes(userDept))
    )));
    const canEditPending = !isPastContribution && (isAdmin || (isDeptUser && userDept && (
        (pendingDept && userDept === pendingDept) ||
        (!issue?.pendingBy && assignedDeptsNormalized.includes(userDept))
    )));
    const canEditSolved = !isPastContribution && (isAdmin || (isDeptUser && userDept && (
        (solverDept && userDept === solverDept) ||
        assignedDeptsNormalized.includes(userDept)
    )));

    const canEdit = !isPastContribution && (isAdmin || canEditReport || canEditClaim || canEditPending || canEditSolved);
    const locale = lang === 'id' ? 'id-ID' : 'en-US';

    // Robust Date Parser
    const parseSafeTimestamp = (raw, fallbackTime = 0) => {
        if (!raw) return fallbackTime;
        if (typeof raw === 'number') return raw > 10000000000 ? raw : raw * 1000;
        let str = String(raw).trim();
        if (/^\d+$/.test(str)) {
            const num = parseInt(str, 10);
            return num > 10000000000 ? num : num * 1000;
        }

        // Match "M d, H:i:s" or "M d, H:i" without year -> e.g. "Aug 27, 14:39:24" or "Agu 27, 14:39"
        const currentYear = new Date().getFullYear();
        const noYearMonthMatch = str.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{1,2})[:\.](\d{1,2})(?:[:\.](\d{1,2}))?/i);
        if (noYearMonthMatch) {
            const secPart = noYearMonthMatch[5] ? `:${noYearMonthMatch[5]}` : ':00';
            str = `${noYearMonthMatch[1]} ${noYearMonthMatch[2]}, ${currentYear} ${noYearMonthMatch[3]}:${noYearMonthMatch[4]}${secPart}`;
        }

        // Match DD/MM/YYYY or DD/MM/YY with optional time HH:mm
        const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:\s+(\d{1,2})[:\.](\d{1,2})(?:[:\.](\d{1,2}))?)?/);
        if (dmyMatch) {
            let day = parseInt(dmyMatch[1], 10);
            let month = parseInt(dmyMatch[2], 10) - 1;
            let year = parseInt(dmyMatch[3], 10);
            if (year < 100) year += 2000;
            let hour = parseInt(dmyMatch[4] || '0', 10);
            let min = parseInt(dmyMatch[5] || '0', 10);
            let sec = parseInt(dmyMatch[6] || '0', 10);
            const parsed = new Date(year, month, day, hour, min, sec).getTime();
            if (!isNaN(parsed)) return parsed;
        }

        const standard = new Date(str).getTime();
        if (!isNaN(standard)) return standard;
        return fallbackTime;
    };

    // Format Helpers
    const formatDateTime = (rawTime) => {
        if (!rawTime) return t('date_na');
        const ts = parseSafeTimestamp(rawTime, null);
        if (!ts) return String(rawTime);
        const d = new Date(ts);
        if (isNaN(d.getTime())) return String(rawTime);
        const dateStr = d.toLocaleDateString(locale, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
        const timeStr = d.toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit',
        });
        return `${dateStr} • ${timeStr}`;
    };

    const archiveLog = useMemo(() => {
        return (issue.editLogs || []).slice().reverse().find(l => l && (l.type === 'archive' || String(l.changes).toLowerCase().includes('arsip') || String(l.changes).toLowerCase().includes('archive')));
    }, [issue.editLogs]);
    const archivedRawDate = issue.archivedAtStr || issue.archivedAt || archiveLog?.date;
    const archivedDateFormatted = archivedRawDate ? formatDateTime(archivedRawDate) : null;

    // Build Chronologically Unified Timeline
    const timelineItems = useMemo(() => {
        const baseCreatedTime = parseSafeTimestamp(issue.reportedAt || issue.reportedAtIso, Date.now() - 3600000);

        // 1. Root Creation Event (ALWAYS STEP 1)
        const creationItem = {
            id: 'step-creation',
            type: 'creation',
            timestamp: baseCreatedTime,
            dateStr: formatDateTime(issue.reportedAt || issue.reportedAtIso),
            data: {
                reporter: issue.reporter || 'Anonymous',
                originDept: issue.department || 'General',
                location: issue.location || '-',
                category: issue.category || '-',
                priority: issue.priority || 'low',
                assignedDepartments: issue.assignedDepartments || [],
                taggedDepartments: issue.taggedDepartments || [],
                description: issue.description,
                imageUrl: issue.imageUrl,
                isLateUpload: issue.isLateUpload,
                lateDuration: issue.lateDuration,
                uploadedAtDateStr: issue.uploadedAt ? formatDateTime(issue.uploadedAt) : (issue.uploadedAtStr ? formatDateTime(issue.uploadedAtStr) : null),
            }
        };

        const computeDurationLabel = (createdTime, solveTime) => {
            return computeDurationFromTimestamps(createdTime, solveTime);
        };

        // Collect all raw progression events
        const rawEvents = [];

        // A. Edit, Claim & Status Rollback Logs (Column Y)
        if (Array.isArray(issue.editLogs) && issue.editLogs.length > 0) {
            issue.editLogs.forEach((log, lIdx) => {
                const lTime = parseSafeTimestamp(log.date, baseCreatedTime + 180000 + (lIdx * 60000));
                if (log.type === 'claim') {
                    rawEvents.push({
                        id: `step-claim-log-${lIdx}`,
                        type: 'claim',
                        timestamp: lTime,
                        dateStr: log.date ? formatDateTime(log.date) : t('date_na'),
                        data: {
                            taker: log.by || 'Technician',
                            takerDept: log.dept,
                        }
                    });
                } else if (log.type === 'solve') {
                    const solveDuration = log.duration || computeDurationLabel(baseCreatedTime, lTime);
                    rawEvents.push({
                        id: `step-solve-log-${lIdx}`,
                        type: 'solved',
                        timestamp: lTime,
                        dateStr: log.date ? formatDateTime(log.date) : t('date_na'),
                        data: {
                            solver: log.by || 'Technician',
                            solverDept: log.dept || solverDept,
                            durationLabel: solveDuration,
                            fixDescription: log.reason || log.changes || 'Pekerjaan diselesaikan',
                            proofImageUrl: log.proofImage || null,
                        }
                    });
                } else if (log.type === 'archive') {
                    rawEvents.push({
                        id: `step-archive-log-${lIdx}`,
                        type: 'archive',
                        timestamp: lTime,
                        dateStr: log.date ? formatDateTime(log.date) : t('date_na'),
                        data: {
                            by: log.by || 'Admin',
                            dept: log.dept,
                            changes: log.changes || 'Isu diarsipkan / disembunyikan dari dashboard operasional',
                        }
                    });
                } else if (log.type === 'restore') {
                    rawEvents.push({
                        id: `step-restore-log-${lIdx}`,
                        type: 'restore',
                        timestamp: lTime,
                        dateStr: log.date ? formatDateTime(log.date) : t('date_na'),
                        data: {
                            by: log.by || 'Admin',
                            dept: log.dept,
                            changes: log.changes || 'Isu dipulihkan kembali ke dashboard operasional',
                        }
                    });
                } else {
                    const isRevert = log.type === 'revert_status' || log.type === 'revert_and_edit';
                    
                    // Inferred Claim if rolled back from progress/pending
                    if (isRevert && (
                        log.from === 'progress' || 
                        log.from === 'pending' ||
                        String(log.changes).toLowerCase().includes('progress ➔') ||
                        String(log.statusChange).toLowerCase().includes('progress →')
                    )) {
                        rawEvents.push({
                            id: `step-claim-inferred-${lIdx}`,
                            type: 'claim',
                            timestamp: lTime - 60000,
                            dateStr: formatDateTime(lTime - 60000),
                            data: {
                                taker: log.by || 'Technician',
                                takerDept: log.dept,
                            }
                        });
                    }

                    // Inferred Solved milestone if rolled back from SOLVED
                    if (isRevert && (
                        log.from === 'solved' ||
                        String(log.changes).toLowerCase().includes('solved ➔') ||
                        String(log.statusChange).toLowerCase().includes('solved →')
                    )) {
                        const priorSolveTime = lTime - 60000;
                        const priorSolveDuration = computeDurationLabel(baseCreatedTime, priorSolveTime);
                        rawEvents.push({
                            id: `step-solved-inferred-${lIdx}`,
                            type: 'solved',
                            timestamp: priorSolveTime,
                            dateStr: formatDateTime(priorSolveTime),
                            data: {
                                solver: log.by || 'Technician',
                                solverDept: log.dept || solverDept,
                                durationLabel: priorSolveDuration,
                                fixDescription: 'Pekerjaan sempat diselesaikan sebelum dibuka kembali',
                                proofImageUrl: null,
                            }
                        });
                    }

                    rawEvents.push({
                        id: `step-edit-${lIdx}`,
                        type: isRevert ? 'rollback' : 'edit',
                        timestamp: lTime,
                        dateStr: log.date ? formatDateTime(log.date) : t('date_na'),
                        data: {
                            by: log.by || 'Staff',
                            dept: log.dept,
                            role: log.role,
                            statusChange: log.statusChange,
                            reason: log.reason,
                            changes: log.changes,
                            type: log.type,
                        }
                    });
                }
            });
        }

        // B. Pending History Events
        if (Array.isArray(issue.pendingTimeline) && issue.pendingTimeline.length > 0) {
            issue.pendingTimeline.forEach((pItem, pIdx) => {
                const pTime = parseSafeTimestamp(pItem.date, baseCreatedTime + 120000 + (pIdx * 60000));
                const pendingPerson = pItem.by || issue.pendingBy || 'Staff';

                rawEvents.push({
                    id: `step-claim-for-pending-${pIdx}`,
                    type: 'claim',
                    timestamp: pTime - 60000,
                    dateStr: formatDateTime(pTime - 60000),
                    data: {
                        taker: pendingPerson,
                        takerDept: takerDept,
                    }
                });

                rawEvents.push({
                    id: `step-pending-${pIdx}`,
                    type: 'pending',
                    timestamp: pTime,
                    dateStr: pItem.date ? formatDateTime(pItem.date) : formatDateTime(issue.takenAt || issue.reportedAt),
                    data: {
                        pendingBy: pendingPerson,
                        reason: pItem.reason || issue.pendingReason || '-',
                        imageUrl: pItem.image || (pIdx === issue.pendingTimeline.length - 1 ? issue.pendingImageUrl : null),
                    }
                });
            });
        } else if (issue.status === 'pending' || issue.pendingReason || issue.pendingBy) {
            const pTime = baseCreatedTime + 120000;
            const pendingPerson = issue.pendingBy || 'Staff';

            rawEvents.push({
                id: 'step-claim-for-pending-single',
                type: 'claim',
                timestamp: pTime - 60000,
                dateStr: formatDateTime(pTime - 60000),
                data: {
                    taker: pendingPerson,
                    takerDept: takerDept,
                }
            });

            rawEvents.push({
                id: 'step-pending-single',
                type: 'pending',
                timestamp: pTime,
                dateStr: formatDateTime(issue.takenAt || issue.reportedAt),
                data: {
                    pendingBy: pendingPerson,
                    reason: issue.pendingReason || '-',
                    imageUrl: issue.pendingImageUrl,
                }
            });
        }

        // C. Fallback Initial Claim Event for current active taker
        if (issue.taker && !['solved', 'open'].includes(issue.status)) {
            const claimTime = parseSafeTimestamp(issue.takenAt, baseCreatedTime + 60000);
            rawEvents.push({
                id: 'step-claim-current',
                type: 'claim',
                timestamp: claimTime,
                dateStr: formatDateTime(issue.takenAt || issue.reportedAt),
                data: {
                    taker: issue.taker || 'Technician',
                    takerDept: takerDept,
                }
            });
        }

        // D. Fallback Solved Event for currently solved card
        if (issue.status === 'solved') {
            const sTime = parseSafeTimestamp(issue.solvedAt, Date.now());
            const currentDuration = issue.durationLabel || computeDurationLabel(baseCreatedTime, sTime);
            rawEvents.push({
                id: 'step-solved-current',
                type: 'solved',
                timestamp: sTime,
                dateStr: formatDateTime(issue.solvedAt || sTime),
                data: {
                    solver: issue.solver || 'Technician',
                    solverDept: solverDept,
                    durationLabel: currentDuration,
                    fixDescription: issue.fixDescription,
                    proofImageUrl: issue.proofImageUrl,
                }
            });
        }

        // E. Current Archived Milestone (if issue is currently archived, ensure archive event is present)
        if (isArchived) {
            const hasArchiveEvent = rawEvents.some(e => e.type === 'archive');
            if (!hasArchiveEvent) {
                const archiveTime = parseSafeTimestamp(archivedRawDate, Date.now());
                const finalArchivedBy = (issue.archivedBy && issue.archivedBy !== 'Admin / Staff' && issue.archivedBy !== 'Staff') 
                    ? issue.archivedBy 
                    : (archiveLog?.by || 'Gardiono (Admin)');
                rawEvents.push({
                    id: 'step-archive-current',
                    type: 'archive',
                    timestamp: Math.max(archiveTime, baseCreatedTime + 180000),
                    dateStr: archivedDateFormatted || formatDateTime(archiveTime),
                    data: {
                        by: finalArchivedBy,
                        role: 'Admin',
                        changes: lang === 'id' 
                            ? 'Isu diarsipkan oleh Administrator (disembunyikan dari dashboard operasional)'
                            : 'Issue archived by Administrator (hidden from operational dashboard)',
                    }
                });
            }
        }

        // Event priority helper for deterministic same-minute tie breaking
        const getEventPriority = (ev) => {
            if (ev.type === 'creation') return 0;
            if (ev.type === 'rollback') {
                const change = String(ev.data?.statusChange || '').toLowerCase();
                // Rollbacks that release/re-open ticket MUST come before any new claim in the same minute
                if (change.includes('open')) return 1;
                return 4; // Resuming pending to progress
            }
            if (ev.type === 'claim') return 2;
            if (ev.type === 'pending') return 3;
            if (ev.type === 'edit') return 5;
            if (ev.type === 'solved') return 6;
            if (ev.type === 'archive' || ev.type === 'restore') return 8;
            return 9;
        };

        // Sort all raw events chronologically with tie-breaker
        rawEvents.sort((a, b) => {
            if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
            return getEventPriority(a) - getEventPriority(b);
        });

        // State Machine to eliminate redundant / duplicate claim & solve events
        const subsequentEvents = [];
        let currentCardState = 'open'; // 'open' | 'progress' | 'pending' | 'solved'
        let currentTaker = null;

        for (const ev of rawEvents) {
            if (ev.type === 'claim') {
                const claimTaker = ev.data?.taker;
                // A card can ONLY be claimed if it is currently in 'open' state!
                if (currentCardState !== 'open') {
                    continue;
                }
                currentCardState = 'progress';
                currentTaker = claimTaker;
                subsequentEvents.push(ev);
            } else if (ev.type === 'pending') {
                currentCardState = 'pending';
                subsequentEvents.push(ev);
            } else if (ev.type === 'rollback') {
                const statusChange = String(ev.data?.statusChange || '').toLowerCase();
                if (statusChange.includes('→ open') || statusChange.includes('➔ open')) {
                    currentCardState = 'open';
                    currentTaker = null;
                } else if (statusChange.includes('→ progress') || statusChange.includes('➔ progress') || statusChange.includes('→ in progress') || statusChange.includes('➔ in progress')) {
                    currentCardState = 'progress';
                }
                subsequentEvents.push(ev);
            } else if (ev.type === 'solved') {
                // If consecutive solve events appear without reopening in between, deduplicate and keep richest data
                if (currentCardState === 'solved') {
                    const lastEv = subsequentEvents[subsequentEvents.length - 1];
                    if (lastEv && lastEv.type === 'solved') {
                        if (ev.data?.proofImageUrl && !lastEv.data?.proofImageUrl) {
                            lastEv.data.proofImageUrl = ev.data.proofImageUrl;
                        }
                        if (ev.data?.durationLabel && (!lastEv.data?.durationLabel || lastEv.data.durationLabel === 'Solved')) {
                            lastEv.data.durationLabel = ev.data.durationLabel;
                        }
                    }
                    continue;
                }
                currentCardState = 'solved';
                subsequentEvents.push(ev);
            } else {
                subsequentEvents.push(ev);
            }
        }

        // Return creation FIRST, followed by all progression events in sequence
        return [creationItem, ...subsequentEvents];
    }, [issue, takerDept, solverDept, t, locale, isArchived, archivedRawDate, archivedDateFormatted, archiveLog, lang]);

    return (
        <Dialog open={!!issue} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl bg-[#181711] border border-[#3B3929] text-[#FAFAFA] shadow-2xl p-6">
                <DialogHeader className="border-b border-[#3B3929]/80 pb-4">
                    {(() => {
                        const isEmergency = (issue.category || '').toLowerCase() === 'emergency' || 
                                            String(issue.id || '').startsWith('SOS');
                        const isCritical = !isEmergency && (issue.priority === 'critical');
                        return (
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md border shadow-inner ${
                                        isEmergency
                                            ? 'text-red-400 bg-red-950/50 border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.25)]'
                                            : isCritical
                                                ? 'text-amber-400 bg-amber-950/50 border-amber-500/40'
                                                : 'text-[#C9AA71] bg-[#2A281E] border-[#3B3929]'
                                    }`}>
                                        {issue.id}
                                    </span>
                                    <DialogTitle className="text-lg font-bold text-foreground tracking-tight">
                                        {issue.title}
                                    </DialogTitle>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {isArchived && (
                                        <span className="inline-flex items-center gap-1.5 rounded-md bg-stone-700/40 px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-stone-300 border border-stone-500/50 shadow-inner">
                                            <span>🗄️</span>
                                            <span>{lang === 'id' ? 'DIARSIPKAN' : 'ARCHIVED'}</span>
                                            {archivedDateFormatted && (
                                                <span className="font-mono font-normal text-[11px] text-stone-400 lowercase tracking-normal">
                                                    • {archivedDateFormatted}
                                                </span>
                                            )}
                                            <span className="font-sans font-semibold text-[11px] text-amber-300/90 tracking-normal normal-case">
                                                (Oleh Admin: {issue.archivedBy && issue.archivedBy !== 'Admin / Staff' && issue.archivedBy !== 'Staff' ? issue.archivedBy : 'Gardiono'})
                                            </span>
                                        </span>
                                    )}
                                    {isEmergency && (
                                        <span className="inline-flex items-center gap-1.5 rounded-md bg-red-500/20 px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-red-400 border border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.25)]">
                                            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
                                            {lang === 'id' ? 'DARURAT (SOS)' : 'SOS EMERGENCY'}
                                        </span>
                                    )}
                                    {isPastContribution && (
                                        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300 border border-amber-500/40 shadow-xs">
                                            <span>🔒</span>
                                            <span>{lang === 'id' ? `Riwayat (${issue.department || 'Departemen Lama'}) - Mode Hanya Lihat (Read-Only)` : `Past Contribution (${issue.department || 'Former Dept'}) - View Only`}</span>
                                        </span>
                                    )}
                                    {isCritical && (
                                        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-amber-400 border border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.25)]">
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            {lang === 'id' ? 'PRIORITAS KRITIS' : 'CRITICAL PRIORITY'}
                                        </span>
                                    )}
                                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold font-mono border ${
                                        issue.status === 'solved' ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                                        issue.status === 'pending' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' :
                                        issue.status === 'progress' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                                        'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                    }`}>
                                        {issue.status?.toUpperCase() || 'OPEN'}
                                    </span>
                                </div>
                            </div>
                        );
                    })()}
                </DialogHeader>

                {/* ========================================================================= */}
                {/* UNIFIED CHRONOLOGICAL LIFECYCLE & AUDIT TIMELINE                          */}
                {/* ========================================================================= */}
                <div className="space-y-4 my-4">
                    {timelineItems.map((step, idx) => {
                        const stepNumber = idx + 1;

                        // ================= 1. CREATION =================
                        if (step.type === 'creation') {
                            return (
                                <div key={step.id} className="rounded-xl border border-blue-500/30 bg-[#1E1D16] p-4 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-blue-500" />
                                    
                                    <div className="flex items-center justify-between pb-3 border-b border-border/40">
                                        <div className="flex items-center gap-2">
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-black font-bold text-xs">
                                                {stepNumber}
                                            </span>
                                            <h3 className="font-bold text-sm text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                                                <FileText className="w-4 h-4" />
                                                {lang === 'id' ? 'Tahap 1: Laporan Dibuat (Open)' : 'Stage 1: Report Created (Open)'}
                                            </h3>
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium">
                                            📅 {step.dateStr}
                                        </span>
                                    </div>

                                    {step.data.isLateUpload && (
                                        <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-300">
                                            <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                            <div className="space-y-1 w-full">
                                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                                    <span className="font-bold text-amber-400">
                                                        {lang === 'id' ? '⏳ Laporan Susulan / Telat Terkirim' : '⏳ Delayed / Late Send Report'}
                                                    </span>
                                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-semibold border border-amber-500/30">
                                                        +{step.data.lateDuration || '>5m'}
                                                    </span>
                                                </div>
                                                <p className="text-stone-300 text-[11px] leading-relaxed">
                                                    {lang === 'id'
                                                        ? 'Laporan sempat tertahan di antrean offline karena perangkat kehilangan koneksi Wi-Fi saat mengirim di website, dan baru berhasil disinkronkan ke server setelah terhubung kembali.'
                                                        : 'Report was queued in offline outbox due to Wi-Fi connection loss on the website, and was synced once the device reconnected.'}
                                                </p>
                                                <div className="flex items-center gap-4 text-[10px] text-stone-400 font-mono pt-0.5 flex-wrap">
                                                    <span>📡 {lang === 'id' ? 'Waktu Input:' : 'Input Time:'} {step.dateStr}</span>
                                                    {step.data.uploadedAtDateStr && (
                                                        <span>🌐 {lang === 'id' ? 'Waktu Sinkron Server:' : 'Server Sync:'} {step.data.uploadedAtDateStr}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-xs">
                                        <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50">
                                            <User className="w-4 h-4 text-[#C9AA71] shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-muted-foreground">{lang === 'id' ? 'Pelapor' : 'Reporter'}</p>
                                                <p className="font-bold text-foreground text-sm">{step.data.reporter}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50">
                                            <Building className="w-4 h-4 text-[#C9AA71] shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-muted-foreground">{lang === 'id' ? 'Departemen Pelapor (Origin)' : 'Origin Department'}</p>
                                                <p className="font-bold text-foreground text-sm">🏠 {step.data.originDept}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50">
                                            <MapPin className="w-4 h-4 text-[#C9AA71] shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-muted-foreground">{lang === 'id' ? 'Lokasi' : 'Location'}</p>
                                                <p className="font-semibold text-foreground">{step.data.location}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50">
                                            <Tag className="w-4 h-4 text-[#C9AA71] shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-muted-foreground">{lang === 'id' ? 'Kategori' : 'Category'}</p>
                                                <p className="font-semibold text-foreground capitalize">{step.data.category}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {step.data.description && (
                                        <div className="mt-3 bg-black/30 p-3 rounded-lg border border-border/40 text-xs">
                                            <p className="text-muted-foreground font-semibold mb-1">{lang === 'id' ? 'Deskripsi Awal:' : 'Initial Description:'}</p>
                                            <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">"{step.data.description}"</p>
                                        </div>
                                    )}

                                    {step.data.imageUrl && (
                                        <div className="mt-3">
                                            <div className="relative aspect-[16/9] w-full max-h-36 rounded-lg overflow-hidden border border-border/40 bg-black/40">
                                                <img src={step.data.imageUrl} alt="Initial Issue" className="w-full h-full object-cover" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        // ================= 2. CLAIM / IN PROGRESS =================
                        if (step.type === 'claim') {
                            return (
                                <div key={step.id} className="rounded-xl border border-blue-500/30 bg-[#1E1D16] p-4 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-blue-500" />
                                    
                                    <div className="flex items-center justify-between pb-3 border-b border-border/40">
                                        <div className="flex items-center gap-2">
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-black font-bold text-xs">
                                                {stepNumber}
                                            </span>
                                            <h3 className="font-bold text-sm text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                                                <Wrench className="w-4 h-4" />
                                                {lang === 'id' ? 'Pekerjaan Diambil (In Progress)' : 'Job Claimed (In Progress)'}
                                            </h3>
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium">
                                            📅 {step.dateStr}
                                        </span>
                                    </div>

                                    <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50 mt-3 text-xs">
                                        <User className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-muted-foreground">{lang === 'id' ? 'Diambil Oleh (Petugas Klaim)' : 'Claimed By (Technician)'}</p>
                                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                                <p className="font-bold text-foreground text-sm">👷 {step.data.taker}</p>
                                                {step.data.takerDept && (
                                                    <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-semibold font-mono flex items-center gap-1">
                                                        <Building className="w-3 h-3" />
                                                        {step.data.takerDept}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        // ================= 3. PENDING DELAY =================
                        if (step.type === 'pending') {
                            return (
                                <div key={step.id} className="rounded-xl border border-orange-500/30 bg-[#1E1D16] p-4 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-orange-500" />
                                    
                                    <div className="flex items-center justify-between pb-3 border-b border-border/40">
                                        <div className="flex items-center gap-2">
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-black font-bold text-xs">
                                                {stepNumber}
                                            </span>
                                            <h3 className="font-bold text-sm text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                                                <Hourglass className="w-4 h-4" />
                                                {lang === 'id' ? 'Pekerjaan Ditunda (Pending)' : 'Job Delayed (Pending)'}
                                            </h3>
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium">
                                            📅 {step.dateStr}
                                        </span>
                                    </div>

                                    <div className="mt-3 space-y-2.5 text-xs">
                                        <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50">
                                            <User className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-muted-foreground">{lang === 'id' ? 'Ditunda Oleh' : 'Pending By'}</p>
                                                <p className="font-bold text-foreground text-sm">{step.data.pendingBy}</p>
                                            </div>
                                        </div>

                                        <div className="bg-black/30 p-3 rounded-lg border border-border/40">
                                            <p className="text-orange-400 font-semibold mb-1">{lang === 'id' ? 'Alasan Penundaan:' : 'Delay Reason:'}</p>
                                            <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">"{step.data.reason}"</p>
                                        </div>

                                        {step.data.imageUrl && (
                                            <div className="relative aspect-[16/9] w-full max-h-36 rounded-lg overflow-hidden border border-border/40 bg-black/40">
                                                <img src={step.data.imageUrl} alt="Pending Proof" className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        // ================= 4. STATUS ROLLBACK / REVERT =================
                        if (step.type === 'rollback') {
                            return (
                                <div key={step.id} className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-amber-500" />
                                    
                                    <div className="flex items-center justify-between pb-3 border-b border-amber-500/20">
                                        <div className="flex items-center gap-2">
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-black font-bold text-xs">
                                                {stepNumber}
                                            </span>
                                            <h3 className="font-bold text-sm text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                                                <RotateCcw className="w-4 h-4" />
                                                {lang === 'id' ? 'Mundur Progres (Status Rollback)' : 'Progress Rollback'}
                                            </h3>
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium">
                                            📅 {step.dateStr}
                                        </span>
                                    </div>

                                    <div className="mt-3 space-y-2 text-xs">
                                        <div className="flex items-center justify-between gap-2 flex-wrap bg-black/40 p-2.5 rounded-lg border border-amber-500/20">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-muted-foreground">{lang === 'id' ? 'Oleh:' : 'By:'}</span>
                                                <span className="font-bold text-foreground">{step.data.by}</span>
                                                {step.data.dept && (
                                                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono">
                                                        {step.data.dept}
                                                    </span>
                                                )}
                                            </div>
                                            {step.data.statusChange && (
                                                <div className="text-xs font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                                                    🔄 {step.data.statusChange}
                                                </div>
                                            )}
                                        </div>

                                        {step.data.reason && (
                                            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200">
                                                <strong>{lang === 'id' ? 'Alasan Mundur Status:' : 'Rollback Reason:'}</strong> "{step.data.reason}"
                                            </div>
                                        )}

                                        {step.data.changes && (
                                            <p className="text-foreground/90 font-mono text-[11px] bg-black/40 p-2 rounded border border-white/5">
                                                • {step.data.changes}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        // ================= 5. DATA EDITED =================
                        if (step.type === 'edit') {
                            return (
                                <div key={step.id} className="rounded-xl border border-sky-500/30 bg-[#1A222B]/60 p-4 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-sky-500" />
                                    
                                    <div className="flex items-center justify-between pb-3 border-b border-sky-500/20">
                                        <div className="flex items-center gap-2">
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-black font-bold text-xs">
                                                {stepNumber}
                                            </span>
                                            <h3 className="font-bold text-sm text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                                                <Edit3 className="w-4 h-4" />
                                                {lang === 'id' ? 'Informasi Kartu Diedit (Edit Log)' : 'Issue Details Modified'}
                                            </h3>
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium">
                                            📅 {step.dateStr}
                                        </span>
                                    </div>

                                    <div className="mt-3 space-y-2 text-xs">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-muted-foreground">{lang === 'id' ? 'Diedit Oleh:' : 'Edited By:'}</span>
                                            <span className="font-bold text-sky-300">{step.data.by}</span>
                                            {step.data.dept && (
                                                <span className="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[10px] font-mono">
                                                    {step.data.dept}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-foreground/90 font-mono text-[11px] bg-black/40 p-2.5 rounded border border-white/5 leading-relaxed">
                                            • {step.data.changes}
                                        </p>
                                    </div>
                                </div>
                            );
                        }

                        // ================= 6. SOLVED =================
                        if (step.type === 'solved') {
                            return (
                                <div key={step.id} className="rounded-xl border border-green-500/30 bg-[#1E1D16] p-4 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-green-500" />
                                    
                                    <div className="flex items-center justify-between pb-3 border-b border-border/40">
                                        <div className="flex items-center gap-2">
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-black font-bold text-xs">
                                                {stepNumber}
                                            </span>
                                            <h3 className="font-bold text-sm text-green-400 uppercase tracking-wider flex items-center gap-1.5">
                                                <CheckCircle2 className="w-4 h-4" />
                                                {lang === 'id' ? 'Pekerjaan Diselesaikan (Solved)' : 'Issue Resolved & Solved'}
                                            </h3>
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium">
                                            📅 {step.dateStr}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-xs">
                                        <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50">
                                            <User className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-muted-foreground">{lang === 'id' ? 'Diselesaikan Oleh' : 'Resolved By'}</p>
                                                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                                    <p className="font-bold text-foreground text-sm">{step.data.solver}</p>
                                                    {step.data.solverDept && (
                                                        <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/30 text-[10px] font-semibold font-mono flex items-center gap-1">
                                                            <Building className="w-3 h-3" />
                                                            {step.data.solverDept}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50">
                                            <Clock className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-muted-foreground">{lang === 'id' ? 'Total Waktu Penyelesaian' : 'Total Duration'}</p>
                                                <p className="font-semibold text-green-300">{formatDurationLabel(step.data.durationLabel)}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {step.data.fixDescription && (
                                        <div className="mt-3 bg-black/30 p-3 rounded-lg border border-border/40 text-xs">
                                            <p className="text-green-400 font-semibold mb-1">{lang === 'id' ? 'Catatan Perbaikan / Tindakan:' : 'Fix Description / Action Taken:'}</p>
                                            <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{step.data.fixDescription}</p>
                                        </div>
                                    )}

                                    {step.data.proofImageUrl && (
                                        <div className="mt-3">
                                            <div className="relative aspect-[16/9] w-full max-h-36 rounded-lg overflow-hidden border border-border/40 bg-black/40">
                                                <img src={step.data.proofImageUrl} alt="Proof of Resolution" className="w-full h-full object-cover" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        // ================= 7. ARCHIVED / RESTORED =================
                        if (step.type === 'archive' || step.type === 'restore') {
                            const isArchive = step.type === 'archive';
                            return (
                                <div key={step.id} className={`rounded-xl border ${isArchive ? 'border-red-500/30 bg-red-950/20' : 'border-emerald-500/30 bg-emerald-950/20'} p-4 shadow-sm relative overflow-hidden`}>
                                    <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${isArchive ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                    <div className="flex items-center justify-between pb-3 border-b border-border/40">
                                        <div className="flex items-center gap-2">
                                            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${isArchive ? 'bg-red-500' : 'bg-emerald-500'} text-black font-bold text-xs`}>
                                                {stepNumber}
                                            </span>
                                            <h3 className={`font-bold text-sm ${isArchive ? 'text-red-400' : 'text-emerald-400'} uppercase tracking-wider flex items-center gap-1.5`}>
                                                {isArchive ? '🗄️ Isu Diarsipkan / Dihapus' : '♻️ Isu Dipulihkan (Restored)'}
                                            </h3>
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium">
                                            📅 {step.dateStr}
                                        </span>
                                    </div>
                                    <div className="mt-3 space-y-2 text-xs">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-muted-foreground">{lang === 'id' ? 'Oleh:' : 'By:'}</span>
                                            <span className="font-bold text-foreground">
                                                {step.data.by && step.data.by !== 'Admin / Staff' && step.data.by !== 'Admin / Staf' && step.data.by !== 'Staff' 
                                                    ? step.data.by 
                                                    : (issue.archivedBy && issue.archivedBy !== 'Admin / Staff' && issue.archivedBy !== 'Staff' ? issue.archivedBy : 'Gardiono')}
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold tracking-wider">
                                                ADMIN
                                            </span>
                                        </div>
                                        {step.data.changes && (
                                            <p className="text-foreground/90 font-mono text-[11px] bg-black/40 p-2 rounded border border-white/5">
                                                • {step.data.changes}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        return null;
                    })}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#3B3929]/50">
                    <div className="flex items-center gap-2 flex-wrap">
                        {!isArchived && !isPastContribution && onOpenCardModal && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose?.();
                                    onOpenCardModal(issue);
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C9AA71]/20 hover:bg-[#C9AA71]/30 text-[#C9AA71] hover:text-[#FAFAFA] border border-[#C9AA71]/40 font-semibold text-xs transition-all shadow-sm cursor-pointer"
                            >
                                <Eye className="w-4 h-4" />
                                <span>{lang === 'id' ? 'Buka Tampilan Kartu Isu' : 'Open Issue Card'}</span>
                            </button>
                        )}
                        {!isArchived && !isPastContribution && canEdit && onEdit && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose?.();
                                    onEdit(issue);
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 hover:text-blue-300 border border-blue-500/40 font-semibold text-xs transition-all shadow-sm cursor-pointer"
                            >
                                <Edit3 className="w-4 h-4" />
                                <span>{lang === 'id' ? 'Edit & Mundur Status' : 'Edit & Rollback'}</span>
                            </button>
                        )}
                        {onRestore && isArchived && !isPastContribution && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose?.();
                                    onRestore(issue);
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white border border-emerald-400/50 font-semibold text-xs transition-all shadow-sm cursor-pointer"
                            >
                                <RotateCcw className="w-4 h-4" />
                                <span>{lang === 'id' ? 'Pulihkan Isu Ini' : 'Restore Issue'}</span>
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg bg-[#2A281E] hover:bg-[#3B3929] text-muted-foreground hover:text-[#FAFAFA] border border-[#3B3929] text-xs font-semibold transition-all cursor-pointer"
                    >
                        {lang === 'id' ? 'Tutup' : 'Close'}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
