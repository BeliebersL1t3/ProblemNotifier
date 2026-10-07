import { Head } from '@inertiajs/react';
import { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Loader2, RefreshCw, SearchX, LayoutGrid, Grid3X3, Layers, List, Rows3, Search, MapPin, Trash2, AlertTriangle, CalendarPlus, Globe, Target, FileText, Megaphone, Lock, ArrowRightLeft, ChevronLeft, ChevronRight, Volume2, VolumeX, ExternalLink, CheckCheck, Clock, Flame } from 'lucide-react';
import { getDepartmentTheme } from '@/constants/departments';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
import { ActivityDetailModal } from '@/Components/CampusFix/ActivityDetailModal';
import { EmergencyIssueModal } from '@/Components/CampusFix/EmergencyIssueModal';
import { NewPeriodModal } from '@/Components/CampusFix/NewPeriodModal';
import { ScrollToTop } from '@/Components/CampusFix/ScrollToTop';
import { MobileBottomNav } from '@/Components/CampusFix/MobileBottomNav';
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
import { parseDeadlineToMs } from '@/lib/utils';


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

let lastChimePlayedAt = 0;

function playHarmonicChime(type = 'milestone') {
    try {
        const now = Date.now();
        // Debounce: prevent overlapping audio blasts (min 2.5s between chimes)
        if (now - lastChimePlayedAt < 2500) return false;

        const ctx = getAudioContext();
        if (!ctx) return false;

        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        lastChimePlayedAt = now;

        const playTone = (freq, startTime, duration, gainVal, waveType = 'sine') => {
            try {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = waveType;
                osc.frequency.setValueAtTime(freq, startTime);

                // Gentle Attack-Decay envelope
                gain.gain.setValueAtTime(0.001, startTime);
                gain.gain.exponentialRampToValueAtTime(gainVal, startTime + 0.04);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(startTime);
                osc.stop(startTime + duration);
            } catch (e) {}
        };

        const t = ctx.currentTime;
        if (type === 'emergency') {
            // Urgent 3-tone chime (C5 -> E5 -> G5)
            playTone(523.25, t, 0.28, 0.22, 'triangle');
            playTone(659.25, t + 0.14, 0.28, 0.22, 'triangle');
            playTone(783.99, t + 0.28, 0.45, 0.25, 'triangle');
        } else {
            // Elegant 2-tone hospitality chime (E5 -> B5 harmonic chime)
            playTone(659.25, t, 0.25, 0.18, 'sine');
            playTone(987.77, t + 0.16, 0.40, 0.18, 'sine');
        }

        return ctx.state === 'running';
    } catch (e) {
        return false;
    }
}

// Backward-compatible alias
function playAlarmBeep() {
    return playHarmonicChime('emergency');
}

function DashboardInner() {
    const {
        issues,
        loading,
        error,
        fetchIssues,
        outboxCount,
        isSyncingOutbox,
        syncOfflineOutbox,
        deleteIssue,
        currentSheet,
        setCurrentSheet,
    } = useIssues();
    const { t, lang } = useLanguage();
    const { isDeptUser, department, isAdmin, isHOD, canViewAllDepartments, canDeleteIssues, canManageIssues, staffName, user } = useAuth();

    // Helper: Check if current user personally contributed to this issue in the past
    const isPastContributor = (issue) => {
        if (!user) return false;
        const myNames = [user.name, user.staff_name, staffName].filter(Boolean).map(n => String(n).trim().toLowerCase());
        const matchesUser = (val) => {
            if (!val) return false;
            const s = String(val).trim().toLowerCase();
            return myNames.some(name => s === name || s.includes(name) || name.includes(s));
        };

        if (issue.user_id && String(issue.user_id) === String(user.id)) return true;
        if (matchesUser(issue.reporter)) return true;
        if (matchesUser(issue.taker)) return true;
        if (matchesUser(issue.solver)) return true;
        if (matchesUser(issue.pendingBy)) return true;

        if (Array.isArray(issue.pendingTimeline)) {
            if (issue.pendingTimeline.some(item => matchesUser(item?.by || item?.staff))) return true;
        }

        if (Array.isArray(issue.editLogs)) {
            if (issue.editLogs.some(log => matchesUser(log?.by || log?.user || log?.author))) return true;
        }

        return false;
    };

    // Helper: Check if current user personally reported/created this issue
    const isReportedByMe = (issue) => {
        if (!user) return false;
        const myNames = [user.name, user.staff_name, staffName].filter(Boolean).map(n => String(n).trim().toLowerCase());
        const matchesUser = (val) => {
            if (!val) return false;
            const s = String(val).trim().toLowerCase();
            return myNames.some(name => s === name || s.includes(name) || name.includes(s));
        };

        if (issue.user_id && String(issue.user_id) === String(user.id)) return true;
        if (matchesUser(issue.reporter)) return true;
        return false;
    };
    const [query, setQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    // For department users without full-view permission, lock the dept filter to their department
    const [deptFilter, setDeptFilter] = useState(() => isDeptUser && department && !canViewAllDepartments ? department : 'all');
    const [deptViewMode, setDeptViewMode] = useState('all'); // 'all' | 'assigned' | 'origin'
    const [viewDensity, setViewDensity] = useState(() => {
        try {
            const saved = localStorage.getItem('campusfix_dashboard_density');
            if (saved === 'compact') return 'compact';
            if (saved === 'grid' || saved === '10') return '10';
            if (saved === '5') return '5';
            if (saved === 'list') return 'list';
            if (saved === '3') return '3';
            return '3';
        } catch (e) {
            return '3';
        }
    });

    const feedContainerRef = useRef(null);
    const prevPositionsRef = useRef(new Map());

    const handleDensityChange = (density) => {
        if (density === viewDensity) return;

        // Snapshot current card positions before layout change (FLIP - First)
        if (feedContainerRef.current) {
            const cardElements = feedContainerRef.current.querySelectorAll('[data-flip-id]');
            const positions = new Map();
            cardElements.forEach(el => {
                const id = el.getAttribute('data-flip-id');
                if (id) {
                    positions.set(id, el.getBoundingClientRect());
                }
            });
            prevPositionsRef.current = positions;
        }

        setViewDensity(density);
        try {
            localStorage.setItem('campusfix_dashboard_density', density);
        } catch (e) {}

        if (density === 'compact' && typeof window !== 'undefined' && window.scrollY > 100) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Smooth layout morphing animation (FLIP - Last, Invert, Play)
    useIsomorphicLayoutEffect(() => {
        const prevPositions = prevPositionsRef.current;
        if (!prevPositions || prevPositions.size === 0 || !feedContainerRef.current) return;

        const currentCardElements = feedContainerRef.current.querySelectorAll('[data-flip-id]');
        currentCardElements.forEach(el => {
            const id = el.getAttribute('data-flip-id');
            const prevRect = prevPositions.get(id);
            if (!prevRect) return;

            const currentRect = el.getBoundingClientRect();
            const dx = prevRect.left - currentRect.left;
            const dy = prevRect.top - currentRect.top;
            const dw = prevRect.width / (currentRect.width || 1);
            const dh = prevRect.height / (currentRect.height || 1);

            // Animate if position or size delta is noticeable
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || Math.abs(dw - 1) > 0.02 || Math.abs(dh - 1) > 0.02) {
                const clampedDw = Math.max(0.65, Math.min(1.4, dw));
                const clampedDh = Math.max(0.65, Math.min(1.4, dh));

                el.animate([
                    {
                        transformOrigin: 'top left',
                        transform: `translate3d(${dx}px, ${dy}px, 0) scale(${clampedDw}, ${clampedDh})`,
                        opacity: 0.88
                    },
                    {
                        transformOrigin: 'top left',
                        transform: 'translate3d(0, 0, 0) scale(1, 1)',
                        opacity: 1
                    }
                ], {
                    duration: 320,
                    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    fill: 'none'
                });
            }
        });

        prevPositionsRef.current = new Map();
    }, [viewDensity]);

    const [reportOpen, setReportOpen] = useState(false);
    const [emergencyOpen, setEmergencyOpen] = useState(false);
    const [newPeriodOpen, setNewPeriodOpen] = useState(false);
    const [takeTarget, setTakeTarget] = useState(null);
    const [resolveTarget, setResolveTarget] = useState(null);
    const [detailTarget, setDetailTarget] = useState(null);
    const [activityDetailTarget, setActivityDetailTarget] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [isMuted, setIsMuted] = useState(() => {
        try {
            return localStorage.getItem('campusfix_alarm_muted') === 'true';
        } catch (e) {
            return false;
        }
    });

    const [highlightedIssueId, setHighlightedIssueId] = useState(null);
    const pendingOpenIssueId = useRef(null);

    const toggleMute = () => {
        setIsMuted(prev => {
            const next = !prev;
            try {
                localStorage.setItem('campusfix_alarm_muted', String(next));
            } catch (e) {}
            return next;
        });
    };

    // Auto-open issue or report modal or filter from URL
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('report') === '1') {
            setReportOpen(true);
            try {
                window.history.replaceState({}, '', window.location.pathname);
            } catch (e) {}
        }
        if (params.get('filter') === 'reassign_needed') {
            setDeptViewMode('reassign_needed');
        }

        const targetIssueId = params.get('issue') || params.get('id') || params.get('search');
        const targetSheet = params.get('sheet');
        if (targetIssueId) {
            focusAndOpenIssue(targetIssueId, targetSheet);
        } else if (pendingOpenIssueId.current) {
            focusAndOpenIssue(pendingOpenIssueId.current);
        }
    }, [issues, loading]);

    // Handle custom event from NotificationDropdown or other components
    useEffect(() => {
        const handleOpenIssueEvent = (e) => {
            const { issueId, sheet } = e.detail || {};
            if (issueId) {
                focusAndOpenIssue(issueId, sheet);
            }
        };

        window.addEventListener('campusfix-open-issue', handleOpenIssueEvent);
        return () => window.removeEventListener('campusfix-open-issue', handleOpenIssueEvent);
    }, [issues, loading, currentSheet]);

    const [now, setNow] = useState(Date.now());
    const soundedMilestones = useRef(new Set());

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

    // 3. Department-scoped Overdue Critical & Emergency Issues
    const isIssueInMyAlarmScope = (issue) => {
        if (isAdmin || canViewAllDepartments) return true;
        const isEmergency = (issue.category || '').toLowerCase() === 'emergency' 
            || String(issue.id || '').toUpperCase().startsWith('SOS') 
            || String(issue.assignedDepartments || '').toLowerCase().includes('all');
        if (isEmergency) return true;
        if (!department) return false;
        const normUserDept = normalizeDepartment(department);
        const assigned = (Array.isArray(issue.assignedDepartments) 
            ? issue.assignedDepartments 
            : (issue.assignedDepartments ? String(issue.assignedDepartments).split(',') : [])
        ).map(d => normalizeDepartment(d.trim()));
        return assigned.includes(normUserDept);
    };

    // Acknowledge / Snooze state persisted in localStorage
    const [acknowledgedMap, setAcknowledgedMap] = useState(() => {
        try {
            const raw = localStorage.getItem('campusfix_acknowledged_alarms');
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    });

    const isIssueAcknowledged = (issueId) => {
        const expiresAt = acknowledgedMap[issueId];
        return Boolean(expiresAt && expiresAt > now);
    };

    const acknowledgeIssue = (issueId) => {
        const snoozeUntil = Date.now() + 30 * 60 * 1000; // 30 minutes snooze
        setAcknowledgedMap(prev => {
            const next = { ...prev, [issueId]: snoozeUntil };
            try {
                localStorage.setItem('campusfix_acknowledged_alarms', JSON.stringify(next));
            } catch (e) {}
            return next;
        });
    };

    const acknowledgeAll = () => {
        const snoozeUntil = Date.now() + 30 * 60 * 1000;
        setAcknowledgedMap(prev => {
            const next = { ...prev };
            scopedOverdueIssues.forEach(i => {
                next[i.id] = snoozeUntil;
            });
            try {
                localStorage.setItem('campusfix_acknowledged_alarms', JSON.stringify(next));
            } catch (e) {}
            return next;
        });
    };

    // Filter scoped overdue critical & emergency issues
    // Note: The visual banner stays active as long as the issue is unresolved,
    // while repetitive audio escalation stops after 6 hours (360 mins).
    const scopedOverdueIssues = useMemo(() => {
        return (issues || []).filter(i => {
            const isArchived = Boolean(i.isArchived || i.statusDisplay === '0' || i.displayStatus === '0');
            if (isArchived) return false;
            if (i.status !== 'open' && i.status !== 'progress') return false;

            const isEmergency = (i.category || '').toLowerCase() === 'emergency' 
                || String(i.id || '').toUpperCase().startsWith('SOS');
            const isCritical = i.priority === 'critical';

            // Must be emergency SOS or critical priority
            if (!isEmergency && !isCritical) return false;

            // If critical and not emergency, ensure deadline is defined and overdue
            if (!isEmergency) {
                if (!i.deadline) return false;
                const deadlineTime = parseDeadlineToMs(i.deadline);
                if (!deadlineTime || now < deadlineTime) return false;
            }

            return isIssueInMyAlarmScope(i);
        }).sort((a, b) => {
            const aIsEmerg = (a.category || '').toLowerCase() === 'emergency' || String(a.id || '').toUpperCase().startsWith('SOS') ? 1 : 0;
            const bIsEmerg = (b.category || '').toLowerCase() === 'emergency' || String(b.id || '').toUpperCase().startsWith('SOS') ? 1 : 0;
            if (aIsEmerg !== bIsEmerg) return bIsEmerg - aIsEmerg;
            const aTime = parseDeadlineToMs(a.deadline) || parseDeadlineToMs(a.reportedAt) || 0;
            const bTime = parseDeadlineToMs(b.deadline) || parseDeadlineToMs(b.reportedAt) || 0;
            return aTime - bTime;
        });
    }, [issues, now, department, isAdmin, canViewAllDepartments]);

    const openOverdueCriticals = useMemo(() => {
        return scopedOverdueIssues.filter(i => i.status === 'open');
    }, [scopedOverdueIssues]);

    const progressOverdueCriticals = useMemo(() => {
        return scopedOverdueIssues.filter(i => i.status === 'progress');
    }, [scopedOverdueIssues]);

    const totalOverdueCount = scopedOverdueIssues.length;

    // Milestone constants:
    // OPEN: 1, 2, 3, 4, 5, 10, 15, 20, 25, 30 mins, 1, 2, 3, 4, 5, 6 hours
    // PROGRESS: hourly only (1, 2, 3, 4, 5, 6 hours)
    const OPEN_MILESTONES = useMemo(() => [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 60, 120, 180, 240, 300, 360], []);
    const PROGRESS_MILESTONES = useMemo(() => [60, 120, 180, 240, 300, 360], []);

    // Reference to track sounded milestones per issue
    const soundedMilestonesMap = useRef(new Map());
    const hasInitializedCatchUp = useRef(false);

    // Audio chime dispatcher with smart catch-up (no rapid-fire blast on page open)
    useEffect(() => {
        if (isMuted || scopedOverdueIssues.length === 0) return;

        // Catch-up on initial load: skip obsolete past milestones and play at most 1 welcome chime
        if (!hasInitializedCatchUp.current) {
            hasInitializedCatchUp.current = true;
            let hasUnacknowledged = false;

            scopedOverdueIssues.forEach(issue => {
                const deadlineTime = parseDeadlineToMs(issue.deadline);
                if (!deadlineTime) return;
                const overdueMins = Math.floor((now - deadlineTime) / 60000);
                const targetMilestones = issue.status === 'progress' ? PROGRESS_MILESTONES : OPEN_MILESTONES;

                let issueSet = soundedMilestonesMap.current.get(issue.id);
                if (!issueSet) {
                    issueSet = new Set();
                    soundedMilestonesMap.current.set(issue.id, issueSet);
                }

                targetMilestones.filter(m => m <= overdueMins).forEach(m => issueSet.add(m));

                if (!isIssueAcknowledged(issue.id)) {
                    hasUnacknowledged = true;
                }
            });

            if (hasUnacknowledged) {
                const hasEmergency = scopedOverdueIssues.some(i => i.category === 'emergency');
                playHarmonicChime(hasEmergency ? 'emergency' : 'milestone');
            }
            return;
        }

        // Live ticker checking
        scopedOverdueIssues.forEach(issue => {
            if (isIssueAcknowledged(issue.id)) return;

            const deadlineTime = parseDeadlineToMs(issue.deadline);
            if (!deadlineTime) return;
            const overdueMins = Math.floor((now - deadlineTime) / 60000);
            const targetMilestones = issue.status === 'progress' ? PROGRESS_MILESTONES : OPEN_MILESTONES;

            let issueSet = soundedMilestonesMap.current.get(issue.id);
            if (!issueSet) {
                issueSet = new Set();
                soundedMilestonesMap.current.set(issue.id, issueSet);
            }

            const unplayed = targetMilestones.filter(m => overdueMins >= m && !issueSet.has(m));
            if (unplayed.length > 0) {
                unplayed.forEach(m => issueSet.add(m));
                const chimeType = issue.category === 'emergency' ? 'emergency' : 'milestone';
                playHarmonicChime(chimeType);
            }
        });
    }, [scopedOverdueIssues, isMuted, now, acknowledgedMap, OPEN_MILESTONES, PROGRESS_MILESTONES]);

    // Slider active index
    const [sliderIndex, setSliderIndex] = useState(0);

    // Keep slider index bounded
    useEffect(() => {
        if (sliderIndex >= scopedOverdueIssues.length && scopedOverdueIssues.length > 0) {
            setSliderIndex(0);
        }
    }, [scopedOverdueIssues.length, sliderIndex]);

    // Count of past contributions from former departments
    const pastContribCount = useMemo(() => {
        if (!department || canViewAllDepartments || isAdmin) return 0;
        const normUserDept = normalizeDepartment(department);
        return (issues || []).filter(issue => {
            const assigned = (Array.isArray(issue.assignedDepartments) 
                ? issue.assignedDepartments 
                : (issue.assignedDepartments ? String(issue.assignedDepartments).split(',') : [])
            ).map(d => normalizeDepartment(d.trim()));

            const tagged = (Array.isArray(issue.taggedDepartments) 
                ? issue.taggedDepartments 
                : (issue.taggedDepartments ? String(issue.taggedDepartments).split(',') : [])
            ).map(d => normalizeDepartment(d.trim()));

            const originDept = normalizeDepartment(issue.department || '');
            const inCurrentDeptScope = assigned.includes(normUserDept) || tagged.includes(normUserDept) || originDept === normUserDept;
            return isPastContributor(issue) && !inCurrentDeptScope;
        }).length;
    }, [issues, department, canViewAllDepartments, isAdmin, user, staffName]);

    // Auto-hide fallback: if user has no past contributions, ensure view mode doesn't get stuck on past_contributions
    useEffect(() => {
        if (pastContribCount === 0 && deptViewMode === 'past_contributions') {
            setDeptViewMode('all');
        }
    }, [pastContribCount, deptViewMode]);

    // Issues needing reassignment: Active issues (progress or pending) where taker has transferred
    const reassignNeededCount = useMemo(() => {
        const normUserDept = department ? normalizeDepartment(department) : null;
        const normDeptFilter = (deptFilter && deptFilter !== 'all') ? normalizeDepartment(deptFilter) : null;
        const targetDept = normDeptFilter || (isAdmin ? null : normUserDept);

        return issues.filter(issue => {
            const isArchived = Boolean(issue.isArchived || issue.statusDisplay === '0' || issue.displayStatus === '0');
            if (isArchived) return false;
            const isActive = issue.status === 'progress' || issue.status === 'pending';
            if (!isActive || !issue.takerHasTransferred) return false;

            if (isAdmin && !targetDept) return true;

            const assigned = (Array.isArray(issue.assignedDepartments) 
                ? issue.assignedDepartments 
                : (issue.assignedDepartments ? String(issue.assignedDepartments).split(',') : [])
            ).map(d => normalizeDepartment(d.trim()));

            return Boolean(targetDept && assigned.includes(targetDept));
        }).length;
    }, [issues, department, deptFilter, isAdmin]);

    // Unassigned (Belum Diambil / Butuh PIC) count
    const unassignedCount = useMemo(() => {
        const normUserDept = department ? normalizeDepartment(department) : null;
        const normDeptFilter = (deptFilter && deptFilter !== 'all') ? normalizeDepartment(deptFilter) : null;
        const targetDept = normDeptFilter || (isAdmin ? null : normUserDept);

        return (issues || []).filter(issue => {
            const isArchived = Boolean(issue.isArchived || issue.statusDisplay === '0' || issue.displayStatus === '0');
            if (isArchived || issue.status === 'solved') return false;
            const isUnclaimed = issue.status === 'open' || !issue.taker || String(issue.taker).trim() === '';
            if (!isUnclaimed) return false;

            if (isAdmin && !targetDept) return true;

            const assigned = (Array.isArray(issue.assignedDepartments) 
                ? issue.assignedDepartments 
                : (issue.assignedDepartments ? String(issue.assignedDepartments).split(',') : [])
            ).map(d => normalizeDepartment(d.trim()));

            return Boolean(targetDept && (assigned.includes(targetDept) || assigned.includes('ALL')));
        }).length;
    }, [issues, department, deptFilter, isAdmin]);

    // Urgent (Darurat SOS & Terlambat Overdue) count
    const urgentCount = useMemo(() => {
        const normUserDept = department ? normalizeDepartment(department) : null;
        const normDeptFilter = (deptFilter && deptFilter !== 'all') ? normalizeDepartment(deptFilter) : null;
        const targetDept = normDeptFilter || (isAdmin ? null : normUserDept);

        return (issues || []).filter(issue => {
            const isArchived = Boolean(issue.isArchived || issue.statusDisplay === '0' || issue.displayStatus === '0');
            if (isArchived || issue.status === 'solved') return false;

            const isEmergency = (issue.category || '').toLowerCase() === 'emergency' 
                || String(issue.id || '').toUpperCase().startsWith('SOS');
            const deadlineMs = issue.deadline ? parseDeadlineToMs(issue.deadline) : null;
            const isOverdue = Boolean(deadlineMs && deadlineMs < now);

            if (!isEmergency && !isOverdue) return false;

            if (isAdmin && !targetDept) return true;

            const assigned = (Array.isArray(issue.assignedDepartments) 
                ? issue.assignedDepartments 
                : (issue.assignedDepartments ? String(issue.assignedDepartments).split(',') : [])
            ).map(d => normalizeDepartment(d.trim()));
            const originDept = normalizeDepartment(issue.department || '');

            return isEmergency || Boolean(targetDept && (assigned.includes(targetDept) || originDept === targetDept));
        }).length;
    }, [issues, department, deptFilter, isAdmin, now]);

    // Auto-hide fallback: if no issues need reassignment, ensure view mode doesn't get stuck on reassign_needed
    useEffect(() => {
        if (reassignNeededCount === 0 && deptViewMode === 'reassign_needed') {
            setDeptViewMode('all');
        }
    }, [reassignNeededCount, deptViewMode]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const sourceIssues = issues;

        // Determine active department scope context
        const normUserDept = department ? normalizeDepartment(department) : null;
        const normDeptFilter = (deptFilter && deptFilter !== 'all') ? normalizeDepartment(deptFilter) : null;
        // The effective department being inspected (either specific dropdown selection, or the user's primary dept)
        const targetDept = normDeptFilter || (isAdmin ? null : normUserDept);

        // Apply Scope Perspective Tab Filtering
        const deptScoped = sourceIssues.reduce((acc, issue) => {
            const assigned = (Array.isArray(issue.assignedDepartments) 
                ? issue.assignedDepartments 
                : (issue.assignedDepartments ? String(issue.assignedDepartments).split(',') : [])
            ).map(d => normalizeDepartment(d.trim()));

            const tagged = (Array.isArray(issue.taggedDepartments) 
                ? issue.taggedDepartments 
                : (issue.taggedDepartments ? String(issue.taggedDepartments).split(',') : [])
            ).map(d => normalizeDepartment(d.trim()));

            const originDept = normalizeDepartment(issue.department || '');
            const isEmergency = (issue.category || '').toLowerCase() === 'emergency' 
                || String(issue.id || '').startsWith('SOS')
                || assigned.some(d => String(d).trim().toUpperCase() === 'ALL')
                || tagged.some(d => String(d).trim().toUpperCase() === 'ALL');

            const isAssignedToTarget = Boolean(
                targetDept && (
                    assigned.includes(targetDept) || 
                    assigned.some(d => String(d).trim().toUpperCase() === 'ALL') ||
                    isEmergency
                )
            );
            const isTaggedToTarget = Boolean(
                targetDept && (
                    tagged.includes(targetDept) || 
                    tagged.some(d => String(d).trim().toUpperCase() === 'ALL')
                )
            );
            const isOriginOfTarget = Boolean(targetDept && originDept === targetDept);
            const isReportedByCurrentMe = isReportedByMe(issue);
            const isPastContrib = isPastContributor(issue);

            // Confidential Issue Security:
            // If issue is marked as confidential and user is not admin,
            // only allow if user's own department or user itself is directly involved.
            if (issue.isConfidential && !isAdmin) {
                const isUserInvolved = Boolean(
                    (normUserDept && (assigned.includes(normUserDept) || tagged.includes(normUserDept) || originDept === normUserDept)) ||
                    isReportedByCurrentMe
                );
                if (!isUserInvolved) {
                    return acc;
                }
            }

            // 1. Tab "Reported By Me" (Dibuat Oleh Saya Pribadi)
            if (deptViewMode === 'origin') {
                if (isReportedByCurrentMe) {
                    const inCurrentDept = normUserDept && originDept === normUserDept;
                    acc.push(inCurrentDept || isAdmin ? issue : { ...issue, _isPastContribution: true });
                }
                return acc;
            }

            // 2. Tab "To Fix" (Tugas Perbaikan Departemen)
            if (deptViewMode === 'assigned') {
                if (isAssignedToTarget || isEmergency) {
                    acc.push(issue);
                }
                return acc;
            }

            // 2b. Tab "Unassigned / Open" (Belum Diambil / Butuh PIC)
            if (deptViewMode === 'unassigned') {
                const isArchived = Boolean(issue.isArchived || issue.statusDisplay === '0' || issue.displayStatus === '0');
                const isUnclaimed = !isArchived && issue.status !== 'solved' && (issue.status === 'open' || !issue.taker || String(issue.taker).trim() === '');
                if (isUnclaimed) {
                    if (isAdmin && !targetDept) {
                        acc.push(issue);
                    } else if (isAssignedToTarget) {
                        acc.push(issue);
                    }
                }
                return acc;
            }

            // 2c. Tab "Urgent" (Darurat SOS & Terlambat Overdue)
            if (deptViewMode === 'urgent') {
                const isArchived = Boolean(issue.isArchived || issue.statusDisplay === '0' || issue.displayStatus === '0');
                if (!isArchived && issue.status !== 'solved') {
                    const deadlineMs = issue.deadline ? parseDeadlineToMs(issue.deadline) : null;
                    const isOverdue = Boolean(deadlineMs && deadlineMs < now);
                    if (isEmergency || isOverdue) {
                        if (isAdmin && !targetDept) {
                            acc.push(issue);
                        } else if (isAssignedToTarget || originDept === targetDept) {
                            acc.push(issue);
                        }
                    }
                }
                return acc;
            }

            // 3. Tab "Mentioned Me" (Departemen Ditandai / Dimention)
            if (deptViewMode === 'tagged') {
                if (isTaggedToTarget) {
                    acc.push(issue);
                }
                return acc;
            }

            // 4. Tab "Past Contributions" (Riwayat Kontribusi Departemen Lama)
            if (deptViewMode === 'past_contributions') {
                const inCurrentDeptScope = normUserDept && (assigned.includes(normUserDept) || tagged.includes(normUserDept) || originDept === normUserDept);
                if (isPastContrib && !inCurrentDeptScope) {
                    acc.push({
                        ...issue,
                        _isPastContribution: true,
                    });
                }
                return acc;
            }

            // 4b. Tab "Needs Reassignment" (Perlu Reassignment karena staf mutasi)
            if (deptViewMode === 'reassign_needed') {
                const isActive = issue.status === 'progress' || issue.status === 'pending';
                if (isActive && issue.takerHasTransferred) {
                    if (isAdmin && !targetDept) {
                        acc.push(issue);
                    } else if (isAssignedToTarget) {
                        acc.push(issue);
                    }
                }
                return acc;
            }

            // 5. Tab "All My Scope" (Default Scope)
            // If user has full resort access and no specific department is selected, include all
            if (canViewAllDepartments && !normDeptFilter) {
                acc.push(issue);
                return acc;
            }

            // 🚨 Emergency & critical fast-track issues are island-wide alerts, ALWAYS in scope for everyone in "All My Scope"
            if (isEmergency) {
                acc.push(issue);
                return acc;
            }

            if (isAssignedToTarget || isOriginOfTarget || isTaggedToTarget) {
                acc.push(issue);
                return acc;
            }

            return acc;
        }, []);

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

            const issueAssigned = (Array.isArray(issue.assignedDepartments) 
                ? issue.assignedDepartments 
                : (issue.assignedDepartments ? String(issue.assignedDepartments).split(',') : [])
            ).map(d => normalizeDepartment(d.trim()));

            const issueTagged = (Array.isArray(issue.taggedDepartments) 
                ? issue.taggedDepartments 
                : (issue.taggedDepartments ? String(issue.taggedDepartments).split(',') : [])
            ).map(d => normalizeDepartment(d.trim()));

            const issueIsEmergency = (issue.category || '').toLowerCase() === 'emergency' 
                || String(issue.id || '').startsWith('SOS')
                || issueAssigned.some(d => String(d).trim().toUpperCase() === 'ALL')
                || issueTagged.some(d => String(d).trim().toUpperCase() === 'ALL');

            const matchesDept = (deptFilter === 'all' || deptViewMode !== 'all' || Boolean(issue._isPastContribution) || issueIsEmergency) ? true : (
                issueAssigned.includes(normDeptFilter) ||
                issueAssigned.some(d => String(d).trim().toUpperCase() === 'ALL') ||
                issueTagged.includes(normDeptFilter) ||
                issueTagged.some(d => String(d).trim().toUpperCase() === 'ALL') ||
                normalizeDepartment(issue.department) === normDeptFilter
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
    }, [issues, query, categoryFilter, statusFilter, deptFilter, isDeptUser, department, deptViewMode, staffName, user, isAdmin, now]);

    const handleSelect = (issue) => {
        if (!issue) return;
        if (issue._isPastContribution) {
            setActivityDetailTarget(issue);
            return;
        }
        if (issue.status === 'open') setTakeTarget(issue);
        else if (issue.status === 'progress' || issue.status === 'pending') setResolveTarget(issue);
        else setDetailTarget(issue);
    };

    const focusAndOpenIssue = (targetId, targetSheet = null) => {
        if (!targetId) return;
        const cleanId = String(targetId).trim();
        if (!cleanId) return;

        // If sheet is specified and different, switch sheet
        if (targetSheet && currentSheet && targetSheet !== currentSheet && setCurrentSheet) {
            setCurrentSheet(targetSheet);
        }

        // If still loading or issues list empty, queue it
        if (loading && issues.length === 0) {
            pendingOpenIssueId.current = cleanId;
            return;
        }

        // Search in active issues
        const found = issues.find(i => String(i.id).toLowerCase() === cleanId.toLowerCase());

        if (found) {
            if (canViewAllDepartments || isAdmin) {
                setDeptFilter('all');
            }
            setCategoryFilter('all');
            setStatusFilter('all');
            setDeptViewMode('all');
            setQuery('');

            // Highlight issue card
            setHighlightedIssueId(found.id);
            setTimeout(() => {
                setHighlightedIssueId(prev => (prev === found.id ? null : prev));
            }, 6000);

            // Smooth scroll into view
            setTimeout(() => {
                const el = document.getElementById(`issue-card-${found.id}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 250);

            // Automatically open appropriate modal/sheet
            handleSelect(found);
            pendingOpenIssueId.current = null;

            // Clean query params from URL without reload
            try {
                const url = new URL(window.location.href);
                url.searchParams.delete('issue');
                url.searchParams.delete('id');
                url.searchParams.delete('search');
                window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
            } catch (e) {}
        } else if (loading) {
            pendingOpenIssueId.current = cleanId;
        }
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
        <div className="min-h-screen bg-[#1C1B0E] text-[#FAFAFA] relative overflow-x-clip antialiased selection:bg-[#C9AA71]/30">
            {/* Background Motif Wallpaper */}
            <div className="app-bg-wallpaper" />

            {/* Warm Ambient Glow */}
            <div className="fixed top-12 left-1/2 -translate-x-1/2 w-[750px] h-[380px] pointer-events-none blur-[160px] opacity-15 rounded-full bg-[#C9AA71] z-0" />

            <div className="relative z-10">
                <CampusFixHeader
                mode="dashboard"
                query={query}
                onQueryChange={setQuery}
                searchDropdown={renderSearchDropdown}
                onReport={() => setReportOpen(true)}
                onEmergency={() => setEmergencyOpen(true)}
                onNewPeriod={() => setNewPeriodOpen(true)}
            />

            {outboxCount > 0 && (
                <div className="bg-amber-500 text-[#1C1B0E] px-4 py-2 text-xs font-bold flex items-center justify-between gap-3 shadow-md border-b border-amber-600">
                    <div className="flex items-center gap-2">
                        <span className={isSyncingOutbox ? "animate-spin" : "animate-pulse text-base"}>
                            {isSyncingOutbox ? "🔄" : "📡"}
                        </span>
                        <span>
                            {isSyncingOutbox
                                ? (lang === 'id' ? 'Menyinkronkan laporan offline ke server...' : 'Syncing offline reports to server...')
                                : `${outboxCount} ${lang === 'id' ? 'laporan tersimpan di memori HP (menunggu koneksi Wi-Fi). Waktu asli tetap tersimpan.' : 'reports saved locally (waiting for Wi-Fi). Original timestamp preserved.'}`}
                        </span>
                    </div>
                    {!isSyncingOutbox && (
                        <button
                            type="button"
                            onClick={syncOfflineOutbox}
                            className="px-2.5 py-1 text-[11px] font-black rounded-lg bg-[#1C1B0E] text-[#E3D1AA] hover:bg-black transition-all cursor-pointer shrink-0"
                        >
                            {lang === 'id' ? 'Kirim Sekarang' : 'Sync Now'}
                        </button>
                    )}
                </div>
            )}

            {totalOverdueCount > 0 && (() => {
                const activeIssue = scopedOverdueIssues[sliderIndex] || scopedOverdueIssues[0];
                if (!activeIssue) return null;

                const activeDeadline = parseDeadlineToMs(activeIssue.deadline) || parseDeadlineToMs(activeIssue.reportedAt);
                const activeOverdueMins = activeDeadline ? Math.max(0, Math.floor((now - activeDeadline) / 60000)) : 0;
                const formatOverdueTime = (mins) => {
                    if (mins >= 60) {
                        const h = Math.floor(mins / 60);
                        const m = mins % 60;
                        return `${h} ${lang === 'id' ? 'jam' : 'hr'}${m > 0 ? ` ${m}m` : ''}`;
                    }
                    return `${mins} ${lang === 'id' ? 'menit' : 'mins'}`;
                };

                const targetMilestones = activeIssue.status === 'progress' ? PROGRESS_MILESTONES : OPEN_MILESTONES;
                const nextM = targetMilestones.find(m => m > activeOverdueMins);
                const nextMilestoneText = nextM
                    ? (nextM >= 60 ? `${nextM / 60} ${lang === 'id' ? 'jam' : 'hr'}` : `${nextM}m`)
                    : (lang === 'id' ? 'Maks (>6 jam)' : 'Max (>6 hrs)');

                const isAck = isIssueAcknowledged(activeIssue.id);
                const isEmergency = (activeIssue.category || '').toLowerCase() === 'emergency' || String(activeIssue.id || '').toUpperCase().startsWith('SOS');
                const hasMultiple = scopedOverdueIssues.length > 1;

                return (
                    <div className={`relative px-4 py-3 text-white shadow-xl border-b transition-all ${
                        isEmergency 
                            ? 'bg-gradient-to-r from-red-700 via-rose-700 to-red-800 border-red-500' 
                            : isAck 
                                ? 'bg-gradient-to-r from-amber-950 via-[#2A2315] to-amber-900/90 border-amber-600/40 text-amber-100'
                                : 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 border-red-500'
                    }`}>
                        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
                            {/* Left: Issue Info & Slider Controls */}
                            <div className="flex items-center gap-3 w-full md:w-auto min-w-0">
                                {hasMultiple && (
                                    <div className="flex items-center gap-1 shrink-0 bg-black/40 rounded-lg p-0.5 border border-white/20">
                                        <button
                                            type="button"
                                            onClick={() => setSliderIndex(prev => (prev > 0 ? prev - 1 : scopedOverdueIssues.length - 1))}
                                            className="p-1 hover:bg-white/20 rounded transition-all cursor-pointer"
                                            title={lang === 'id' ? 'Isu Sebelumnya' : 'Previous Issue'}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </button>
                                        <span className="text-[11px] font-mono font-bold px-1.5 min-w-[36px] text-center">
                                            {sliderIndex + 1}/{scopedOverdueIssues.length}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setSliderIndex(prev => (prev < scopedOverdueIssues.length - 1 ? prev + 1 : 0))}
                                            className="p-1 hover:bg-white/20 rounded transition-all cursor-pointer"
                                            title={lang === 'id' ? 'Isu Berikutnya' : 'Next Issue'}
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}

                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="text-xl shrink-0">
                                        {isEmergency ? '🔥' : '🚨'}
                                    </span>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-extrabold text-sm sm:text-base truncate max-w-[280px] sm:max-w-[420px]">
                                                {activeIssue.title}
                                            </span>
                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${
                                                activeIssue.status === 'open' 
                                                    ? 'bg-red-950 text-red-200 border border-red-400/50' 
                                                    : 'bg-amber-950 text-amber-200 border border-amber-400/50'
                                            }`}>
                                                {activeIssue.status === 'open' ? (lang === 'id' ? 'Belum Diambil' : 'Unclaimed') : (lang === 'id' ? 'Sedang Dikerjakan' : 'In Progress')}
                                            </span>
                                            {isAck && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-900/80 text-emerald-200 border border-emerald-400/50 shrink-0">
                                                    ✓ {lang === 'id' ? 'Snooze Aktif (30m)' : 'Snoozed (30m)'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs opacity-90 text-[11px] mt-0.5 flex-wrap">
                                            <span>
                                                📍 {activeIssue.location || 'Resort'}
                                            </span>
                                            <span>•</span>
                                            <span className="font-bold">
                                                ⏱️ {lang === 'id' ? 'Terlambat:' : 'Overdue:'} {formatOverdueTime(activeOverdueMins)}
                                            </span>
                                            <span>•</span>
                                            <span>
                                                🔔 {lang === 'id' ? 'Eskalasi berikutnya:' : 'Next escalation:'} {nextMilestoneText}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex items-center gap-2 shrink-0 self-end md:self-auto flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => focusAndOpenIssue(activeIssue.id, activeIssue.sheet)}
                                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white/20 hover:bg-white/30 text-white transition-all flex items-center gap-1.5 cursor-pointer border border-white/20"
                                >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    <span>{lang === 'id' ? 'Buka Tiket' : 'View'}</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => acknowledgeIssue(activeIssue.id)}
                                    disabled={isAck}
                                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                                        isAck
                                            ? 'bg-emerald-900/60 text-emerald-200 border border-emerald-500/40 cursor-default opacity-80'
                                            : 'bg-black/40 hover:bg-black/60 text-white border border-white/30'
                                    }`}
                                    title={lang === 'id' ? 'Matikan bunyi alarm untuk isu ini selama 30 menit' : 'Snooze alarm audio for 30 minutes'}
                                >
                                    <CheckCheck className="h-3.5 w-3.5" />
                                    <span>{isAck ? (lang === 'id' ? 'Diakui (30m)' : 'Acked (30m)') : (lang === 'id' ? 'Acknowledge' : 'Acknowledge')}</span>
                                </button>

                                {hasMultiple && (
                                    <button
                                        type="button"
                                        onClick={acknowledgeAll}
                                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-black/30 hover:bg-black/50 text-white/90 border border-white/20 transition-all cursor-pointer"
                                        title={lang === 'id' ? 'Acknowledge & Snooze semua isu yang sedang terlambat selama 30 menit' : 'Acknowledge all overdue issues for 30 minutes'}
                                    >
                                        <span>{lang === 'id' ? 'Ack Semua' : 'Ack All'}</span>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={toggleMute}
                                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-black/40 hover:bg-black/60 border border-white/30 transition-all cursor-pointer flex items-center gap-1.5"
                                    title={isMuted ? 'Unmute' : 'Mute'}
                                >
                                    {isMuted ? <VolumeX className="h-3.5 w-3.5 text-red-200" /> : <Volume2 className="h-3.5 w-3.5 text-emerald-300" />}
                                    <span>{isMuted ? t('unmute_alarm') : t('sound_active')}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 pb-36 md:pb-8">
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
                
                {/* Toolbar & Filter Section (Two-Tier Structured Bar) */}
                <div className="space-y-3.5 border-b border-border/50 pb-4">
                    {/* Tier 1: Primary Scope Tabs & Density Selector */}
                    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                        <div className="flex items-center justify-center lg:justify-start gap-2.5 w-full lg:w-auto">
                            {canViewAllDepartments && !isAdmin && (
                                <div 
                                    className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-semibold shadow-xs shrink-0"
                                    title={lang === 'id' 
                                        ? 'Wewenang Akun: Anda memiliki izin akses untuk memantau isu seluruh departemen resort Telunas.' 
                                        : 'Account Permission: You have permission to view and monitor all Telunas resort departments.'}
                                >
                                    <Globe className="h-4 w-4 text-sky-400 shrink-0" />
                                    <span>{lang === 'id' ? 'Lintas Seluruh Departemen' : 'All Departments Access'}</span>
                                </div>
                            )}
                            {(isDeptUser || isAdmin) && (
                                <div className="flex items-center rounded-2xl bg-[#2A281E] p-1.5 border border-[#3B3929] text-xs font-bold w-fit mx-auto lg:mx-0 max-w-full overflow-x-auto no-scrollbar flex-nowrap gap-1 sm:gap-1.5 shadow-md">
                                    {isAdmin ? (
                                        /* Admin Monitoring Scope Tabs */
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setDeptViewMode('all')}
                                                title={lang === 'id' ? 'Semua Isu Seluruh Resort' : 'All Issues Resort-wide'}
                                                className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                    deptViewMode === 'all'
                                                        ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                                        : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                <Globe className="w-4 h-4 shrink-0" />
                                                {deptViewMode === 'all' && <span className="sm:hidden">{lang === 'id' ? 'Semua' : 'All'}</span>}
                                                <span className="hidden sm:inline">{lang === 'id' ? 'Semua Isu' : 'All Issues'}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeptViewMode('unassigned')}
                                                title={lang === 'id' ? `Belum Diambil (${unassignedCount} isu belum ada PIC)` : `Unassigned (${unassignedCount} issues unclaimed)`}
                                                className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                    deptViewMode === 'unassigned'
                                                        ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                                        : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                <Clock className="w-4 h-4 shrink-0" />
                                                {deptViewMode === 'unassigned' && <span className="sm:hidden">{lang === 'id' ? 'Belum PIC' : 'Unclaimed'}</span>}
                                                <span className="hidden sm:inline">{lang === 'id' ? 'Belum Diambil' : 'Unassigned'}</span>
                                                {unassignedCount > 0 && (
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                        deptViewMode === 'unassigned'
                                                            ? 'bg-[#1C1B0E] text-[#C9AA71]'
                                                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                    }`}>
                                                        {unassignedCount}
                                                    </span>
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeptViewMode('urgent')}
                                                title={lang === 'id' ? `Darurat & Terlambat (${urgentCount} tiket darurat/lewat deadline)` : `Emergency & Overdue (${urgentCount} urgent tickets)`}
                                                className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                    deptViewMode === 'urgent'
                                                        ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-red-600 text-white shadow-md font-extrabold ring-1 ring-red-400'
                                                        : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10'
                                                }`}
                                            >
                                                <Flame className="w-4 h-4 shrink-0" />
                                                {deptViewMode === 'urgent' && <span className="sm:hidden">{lang === 'id' ? 'Darurat' : 'Urgent'}</span>}
                                                <span className="hidden sm:inline">{lang === 'id' ? 'Darurat & Terlambat' : 'Emergency & Overdue'}</span>
                                                {urgentCount > 0 && (
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                        deptViewMode === 'urgent'
                                                            ? 'bg-white text-red-600'
                                                            : 'bg-red-500/25 text-red-300 border border-red-500/40'
                                                    }`}>
                                                        {urgentCount}
                                                    </span>
                                                )}
                                            </button>
                                            {reassignNeededCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setDeptViewMode('reassign_needed')}
                                                    className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                        deptViewMode === 'reassign_needed'
                                                            ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-amber-500 text-black shadow-md font-extrabold'
                                                            : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                                                    }`}
                                                    title={lang === 'id' 
                                                        ? `Tugas Perlu Reassign (${reassignNeededCount} pekerjaan aktif yang pemegangnya pindah departemen)` 
                                                        : `Needs Reassignment (${reassignNeededCount} active tasks whose taker transferred out)`}
                                                >
                                                    <ArrowRightLeft className="w-4 h-4 shrink-0" />
                                                    {deptViewMode === 'reassign_needed' && <span className="sm:hidden">Reassign</span>}
                                                    <span className="hidden sm:inline">{lang === 'id' ? 'Perlu Reassign' : 'Needs Reassign'}</span>
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                        deptViewMode === 'reassign_needed'
                                                            ? 'bg-black text-amber-400'
                                                            : 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                                                    }`}>
                                                        {reassignNeededCount}
                                                    </span>
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setDeptViewMode('origin')}
                                                title={lang === 'id' ? 'Dibuat Oleh Saya' : 'Reported By Me'}
                                                className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                    deptViewMode === 'origin'
                                                        ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                                        : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                <FileText className="w-4 h-4 shrink-0" />
                                                {deptViewMode === 'origin' && <span className="sm:hidden">{lang === 'id' ? 'Saya' : 'Mine'}</span>}
                                                <span className="hidden sm:inline">{lang === 'id' ? 'Dibuat Oleh Saya' : 'Reported By Me'}</span>
                                            </button>
                                        </>
                                    ) : isHOD ? (
                                        /* HOD Leadership Scope Tabs */
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setDeptViewMode('all')}
                                                title={lang === 'id' ? 'Semua Departemen Saya' : 'All My Department Scope'}
                                                className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                    deptViewMode === 'all'
                                                        ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                                        : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                <Globe className="w-4 h-4 shrink-0" />
                                                {deptViewMode === 'all' && <span className="sm:hidden">Dept</span>}
                                                <span className="hidden sm:inline">{lang === 'id' ? 'Semua Departemen' : 'All Department'}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeptViewMode('unassigned')}
                                                title={lang === 'id' ? `Belum Diambil Tim (${unassignedCount} tugas belum dikerjakan staf)` : `Team Unclaimed (${unassignedCount} unclaimed by staff)`}
                                                className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                    deptViewMode === 'unassigned'
                                                        ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                                        : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                <Clock className="w-4 h-4 shrink-0" />
                                                {deptViewMode === 'unassigned' && <span className="sm:hidden">{lang === 'id' ? 'Belum PIC' : 'Unclaimed'}</span>}
                                                <span className="hidden sm:inline">{lang === 'id' ? 'Belum Diambil Tim' : 'Team Unclaimed'}</span>
                                                {unassignedCount > 0 && (
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                        deptViewMode === 'unassigned'
                                                            ? 'bg-[#1C1B0E] text-[#C9AA71]'
                                                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                    }`}>
                                                        {unassignedCount}
                                                    </span>
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeptViewMode('assigned')}
                                                title={t('to_fix')}
                                                className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                    deptViewMode === 'assigned'
                                                        ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                                        : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                <Target className="w-4 h-4 shrink-0" />
                                                {deptViewMode === 'assigned' && <span className="sm:hidden">{lang === 'id' ? 'Tugas' : 'Tasks'}</span>}
                                                <span className="hidden sm:inline">{t('to_fix')}</span>
                                            </button>
                                            {reassignNeededCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setDeptViewMode('reassign_needed')}
                                                    className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                        deptViewMode === 'reassign_needed'
                                                            ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-amber-500 text-black shadow-md font-extrabold'
                                                            : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                                                    }`}
                                                    title={lang === 'id' 
                                                        ? `Tugas Perlu Reassign (${reassignNeededCount} pekerjaan aktif yang pemegangnya pindah departemen)` 
                                                        : `Needs Reassignment (${reassignNeededCount} active tasks whose taker transferred out)`}
                                                >
                                                    <ArrowRightLeft className="w-4 h-4 shrink-0" />
                                                    {deptViewMode === 'reassign_needed' && <span className="sm:hidden">Reassign</span>}
                                                    <span className="hidden sm:inline">{lang === 'id' ? 'Perlu Reassign' : 'Needs Reassign'}</span>
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                        deptViewMode === 'reassign_needed'
                                                            ? 'bg-black text-amber-400'
                                                            : 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                                                    }`}>
                                                        {reassignNeededCount}
                                                    </span>
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setDeptViewMode('origin')}
                                                title={t('reported_by_me')}
                                                className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                    deptViewMode === 'origin'
                                                        ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                                        : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                <FileText className="w-4 h-4 shrink-0" />
                                                {deptViewMode === 'origin' && <span className="sm:hidden">{lang === 'id' ? 'Saya' : 'Mine'}</span>}
                                                <span className="hidden sm:inline">{t('reported_by_me')}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeptViewMode('tagged')}
                                                title={lang === 'id' ? 'Mention Departemen' : 'Department Mentions'}
                                                className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                    deptViewMode === 'tagged'
                                                        ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                                        : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                <Megaphone className="w-4 h-4 shrink-0" />
                                                {deptViewMode === 'tagged' && <span className="sm:hidden">Mention</span>}
                                                <span className="hidden sm:inline">{lang === 'id' ? 'Mention Departemen' : 'Mentions'}</span>
                                            </button>
                                        </>
                                    ) : (
                                        /* Regular Staff Operational Scope Tabs */
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setDeptViewMode('all')}
                                                title={t('all_my_scope')}
                                                className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                    deptViewMode === 'all'
                                                        ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                                        : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                <Globe className="w-4 h-4 shrink-0" />
                                                {deptViewMode === 'all' && <span className="sm:hidden">{lang === 'id' ? 'Semua' : 'All'}</span>}
                                                <span className="hidden sm:inline">{t('all_my_scope')}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeptViewMode('assigned')}
                                                title={t('to_fix')}
                                                className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                    deptViewMode === 'assigned'
                                                        ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                                        : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                <Target className="w-4 h-4 shrink-0" />
                                                {deptViewMode === 'assigned' && <span className="sm:hidden">{lang === 'id' ? 'Tugas' : 'Tasks'}</span>}
                                                <span className="hidden sm:inline">{t('to_fix')}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeptViewMode('origin')}
                                                title={t('reported_by_me')}
                                                className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                    deptViewMode === 'origin'
                                                        ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                                        : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                <FileText className="w-4 h-4 shrink-0" />
                                                {deptViewMode === 'origin' && <span className="sm:hidden">{lang === 'id' ? 'Saya' : 'Mine'}</span>}
                                                <span className="hidden sm:inline">{t('reported_by_me')}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeptViewMode('tagged')}
                                                title={t('mentioned_me')}
                                                className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                    deptViewMode === 'tagged'
                                                        ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                                        : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                <Megaphone className="w-4 h-4 shrink-0" />
                                                {deptViewMode === 'tagged' && <span className="sm:hidden">Mention</span>}
                                                <span className="hidden sm:inline">{t('mentioned_me')}</span>
                                            </button>
                                            {pastContribCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setDeptViewMode('past_contributions')}
                                                    className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                        deptViewMode === 'past_contributions'
                                                            ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                                            : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                    }`}
                                                    title={lang === 'id' 
                                                        ? `Riwayat Kontribusi (${pastContribCount} isu)` 
                                                        : `Past Contributions (${pastContribCount} issues)`}
                                                >
                                                    <Lock className="w-4 h-4 shrink-0" />
                                                    {deptViewMode === 'past_contributions' && <span className="sm:hidden">{lang === 'id' ? 'Riwayat' : 'Past'}</span>}
                                                    <span className="hidden sm:inline">{lang === 'id' ? 'Riwayat' : 'Past Contributions'}</span>
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                        deptViewMode === 'past_contributions'
                                                            ? 'bg-[#1C1B0E] text-[#C9AA71]'
                                                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                    }`}>
                                                        {pastContribCount}
                                                    </span>
                                                </button>
                                            )}
                                            {reassignNeededCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setDeptViewMode('reassign_needed')}
                                                    className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
                                                        deptViewMode === 'reassign_needed'
                                                            ? 'px-3 py-1.5 sm:px-3.5 sm:py-2 bg-amber-500 text-black shadow-md font-extrabold'
                                                            : 'px-2.5 py-1.5 sm:px-2.5 sm:py-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                                                    }`}
                                                    title={lang === 'id' 
                                                        ? `Tugas Perlu Reassign (${reassignNeededCount} pekerjaan aktif yang pemegangnya pindah departemen)` 
                                                        : `Needs Reassignment (${reassignNeededCount} active tasks whose taker transferred out)`}
                                                >
                                                    <ArrowRightLeft className="w-4 h-4 shrink-0" />
                                                    {deptViewMode === 'reassign_needed' && <span className="sm:hidden">Reassign</span>}
                                                    <span className="hidden sm:inline">{lang === 'id' ? 'Perlu Reassign' : 'Needs Reassign'}</span>
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                        deptViewMode === 'reassign_needed'
                                                            ? 'bg-black text-amber-400'
                                                            : 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                                                    }`}>
                                                        {reassignNeededCount}
                                                    </span>
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Desktop View: 5 Options (List | Compact | 3 | 5 | 10) */}
                        <div className="hidden sm:flex items-center rounded-2xl bg-[#2A281E] p-1.5 border border-[#3B3929] text-xs font-bold shrink-0 self-end lg:self-center shadow-md gap-1" title="View Options (List, Compact, 3, 5, 10 columns)">
                            <button
                                type="button"
                                onClick={() => handleDensityChange('list')}
                                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
                                    viewDensity === 'list'
                                        ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                }`}
                                title="List View — Detailed Operational Feed"
                            >
                                <List className="h-3.5 w-3.5" />
                                <span>List</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDensityChange('compact')}
                                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
                                    viewDensity === 'compact'
                                        ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                }`}
                                title="Compact List — 2-Line Row View with Photo"
                            >
                                <Rows3 className="h-3.5 w-3.5" />
                                <span>Compact</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDensityChange('3')}
                                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
                                    viewDensity === '3'
                                        ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                }`}
                                title="3 Columns — Detail View (Standard)"
                            >
                                <LayoutGrid className="h-3.5 w-3.5" />
                                <span>3</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDensityChange('5')}
                                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
                                    viewDensity === '5'
                                        ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                }`}
                                title="5 Columns — Compact View"
                            >
                                <Grid3X3 className="h-3.5 w-3.5" />
                                <span>5</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDensityChange('10')}
                                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
                                    viewDensity === '10' || viewDensity === 'grid'
                                        ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                }`}
                                title="10 Columns — Micro Matrix View"
                            >
                                <Layers className="h-3.5 w-3.5" />
                                <span>10</span>
                            </button>
                        </div>
                    </div>

                    {/* Tier 2: Secondary Filter Bar (Desktop FilterChips on Left; mobile toolbar is in Floating Dock) */}
                    <div className="hidden sm:flex items-center justify-start pt-0.5 w-full">
                        <div className="min-w-0 shrink">
                            <FilterChips
                                categoryFilter={categoryFilter}
                                onCategoryChange={setCategoryFilter}
                                deptFilter={deptFilter}
                                onDeptChange={setDeptFilter}
                            />
                        </div>
                    </div>
                </div>

                {deptViewMode === 'reassign_needed' && (
                    <div className="rounded-xl border border-amber-500/35 bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-amber-950/30 p-4 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md animate-in fade-in duration-200 backdrop-blur-xs">
                        <div className="flex items-start sm:items-center gap-3">
                            <span className="text-2xl shrink-0 p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30">🔄</span>
                            <div>
                                <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wide flex items-center gap-2">
                                    {lang === 'id' ? 'Tugas Tertinggal / Perlu Reassign (Staf Mutasi)' : 'Orphaned Tasks Needing Reassignment (Transferred Staff)'}
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-black">
                                        {reassignNeededCount}
                                    </span>
                                </h3>
                                <p className="text-xs text-amber-200/80 mt-0.5 leading-relaxed">
                                    {lang === 'id' 
                                        ? 'Menampilkan tugas aktif (In Progress / Pending) yang staf pemegangnya telah pindah ke departemen lain. Segera alihkan (reassign) ke staf aktif di departemen terkait agar tidak terbengkalai.' 
                                        : 'Showing active tasks (In Progress / Pending) whose claimant staff has moved to another department. Please reassign to an active team member to keep operations moving.'}
                                </p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeptViewMode('all')}
                            className="w-fit text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10 cursor-pointer shrink-0"
                        >
                            ← {lang === 'id' ? 'Kembali ke Semua Isu' : 'Back to All Issues'}
                        </Button>
                    </div>
                )}

                {deptViewMode === 'urgent' && (
                    <div className="rounded-xl border border-red-500/35 bg-gradient-to-r from-red-950/40 via-red-900/20 to-red-950/30 p-4 text-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md animate-in fade-in duration-200 backdrop-blur-xs">
                        <div className="flex items-start sm:items-center gap-3">
                            <span className="text-2xl shrink-0 p-1.5 rounded-lg bg-red-500/15 border border-red-500/30">🔥</span>
                            <div>
                                <h3 className="text-sm font-bold text-red-300 uppercase tracking-wide flex items-center gap-2">
                                    {lang === 'id' ? 'Isu Darurat & Terlambat (Overdue SLA)' : 'Emergency & Overdue Issues'}
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500 text-white">
                                        {urgentCount}
                                    </span>
                                </h3>
                                <p className="text-xs text-red-200/80 mt-0.5 leading-relaxed">
                                    {lang === 'id' 
                                        ? 'Menampilkan tiket darurat (SOS) dan laporan yang telah melewati batas waktu estimasi deadline SLA. Memerlukan penanganan atau eskalasi segera.' 
                                        : 'Showing emergency (SOS) alerts and issues that have exceeded their target deadline. Immediate attention or escalation required.'}
                                </p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeptViewMode('all')}
                            className="w-fit text-xs border-red-500/40 text-red-300 hover:bg-red-500/10 cursor-pointer shrink-0"
                        >
                            ← {lang === 'id' ? 'Kembali ke Semua Isu' : 'Back to All Issues'}
                        </Button>
                    </div>
                )}

                {deptViewMode === 'unassigned' && (
                    <div className="rounded-xl border border-sky-500/35 bg-gradient-to-r from-sky-950/40 via-sky-900/20 to-sky-950/30 p-4 text-sky-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md animate-in fade-in duration-200 backdrop-blur-xs">
                        <div className="flex items-start sm:items-center gap-3">
                            <span className="text-2xl shrink-0 p-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30">⏳</span>
                            <div>
                                <h3 className="text-sm font-bold text-sky-300 uppercase tracking-wide flex items-center gap-2">
                                    {lang === 'id' ? (isAdmin ? 'Laporan Belum Diambil (Butuh PIC)' : 'Tugas Belum Diambil Tim') : 'Unassigned / Open Issues'}
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-500 text-black">
                                        {unassignedCount}
                                    </span>
                                </h3>
                                <p className="text-xs text-sky-200/80 mt-0.5 leading-relaxed">
                                    {lang === 'id' 
                                        ? (isAdmin ? 'Menampilkan tiket laporan yang belum diambil oleh staf atau teknisi lapangan. Pantau agar tidak ada kendala yang terbengkalai.' : 'Menampilkan tugas perbaikan departemen Anda yang belum diambil oleh anggota tim.')
                                        : 'Showing issues that have not yet been claimed by field technicians or team members.'}
                                </p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeptViewMode('all')}
                            className="w-fit text-xs border-sky-500/40 text-sky-300 hover:bg-sky-500/10 cursor-pointer shrink-0"
                        >
                            ← {lang === 'id' ? 'Kembali ke Semua Isu' : 'Back to All Issues'}
                        </Button>
                    </div>
                )}

                {loading && issues.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface py-20 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm font-medium text-muted-foreground">
                            Connecting to Google Sheets...
                        </p>
                    </div>
                ) : visible.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface py-16 text-center">
                        <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
                        <p className="font-semibold text-foreground">
                            {lang === 'id' ? 'Tidak ada isu yang cocok dengan filter' : 'No issues match your filters'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {lang === 'id' ? 'Coba kata kunci lain atau reset filter.' : 'Try a different keyword or reset the filter chips.'}
                        </p>
                    </div>
                ) : (
                    <div
                        ref={feedContainerRef}
                        className={
                            viewDensity === 'compact'
                                ? 'flex flex-col gap-2 w-full'
                                : viewDensity === 'list'
                                    ? 'flex flex-col gap-3 w-full'
                                    : (viewDensity === 'grid' || viewDensity === '10')
                                        ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-10 gap-2'
                                        : viewDensity === '5'
                                            ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5'
                                            : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'
                        }
                    >
                        {visible.map((issue) => (
                            <IssueCard
                                key={issue.id}
                                issue={issue}
                                onSelect={handleSelect}
                                onDelete={issue._isPastContribution ? undefined : (item) => {
                                    setDeleteError('');
                                    setDeleteTarget(item);
                                }}
                                density={viewDensity}
                                isHighlighted={highlightedIssueId === issue.id}
                            />
                        ))}
                    </div>
                )}
            </main>

            <ReportIssueModal open={reportOpen} onOpenChange={setReportOpen} />
            <EmergencyIssueModal open={emergencyOpen} onOpenChange={setEmergencyOpen} />
            <NewPeriodModal open={newPeriodOpen} onOpenChange={setNewPeriodOpen} />
            <TakeJobModal 
                issue={takeTarget} 
                onClose={() => setTakeTarget(null)} 
            />
            <ResolveIssueSheet 
                issue={resolveTarget} 
                onClose={() => setResolveTarget(null)} 
            />
            <SolvedDetailModal issue={detailTarget} onClose={() => setDetailTarget(null)} />
            <ActivityDetailModal 
                issue={activityDetailTarget} 
                onClose={() => setActivityDetailTarget(null)} 
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
                                ? 'Isu ini akan dihapus dari dashboard operasional. Riwayat data tetap tersimpan aman di spreadsheet (display status: 0).' 
                                : 'This issue will be removed from the operational dashboard. Historical data remains securely recorded in the spreadsheet (display status: 0).'}
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

            {/* Mobile Floating Dock Toolbar (Category, Department & View Density) */}
            <div 
                className="fixed inset-x-0 z-30 flex justify-center pointer-events-none px-4 sm:hidden animate-in fade-in slide-in-from-bottom-3 duration-300"
                style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.75rem)' }}
            >
                <div 
                    className="pointer-events-auto flex items-center rounded-2xl bg-[#2A281E]/95 backdrop-blur-xl p-1.5 border border-[#3B3929]/90 shadow-[0_12px_36px_rgba(0,0,0,0.65)] gap-1 ring-1 ring-white/5" 
                    title="Filters & View Options"
                >
                    <FilterChips
                        categoryFilter={categoryFilter}
                        onCategoryChange={setCategoryFilter}
                        deptFilter={deptFilter}
                        onDeptChange={setDeptFilter}
                        isMobileToolbar={true}
                    />
                    <div className="h-5 w-px bg-[#3B3929] mx-1.5 shrink-0" />
                    <button
                        type="button"
                        onClick={() => handleDensityChange('3')}
                        className={`p-2.5 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                            viewDensity === '3' || viewDensity === 'list'
                                ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                        }`}
                        title="List View"
                    >
                        <LayoutGrid className="h-5 w-5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => handleDensityChange('compact')}
                        className={`p-2.5 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                            viewDensity === 'compact'
                                ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                        }`}
                        title="Compact View"
                    >
                        <Rows3 className="h-5 w-5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => handleDensityChange('10')}
                        className={`p-2.5 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                            viewDensity === '10' || viewDensity === 'grid' || viewDensity === '5'
                                ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                        }`}
                        title="Grid View"
                    >
                        <Grid3X3 className="h-5 w-5" />
                    </button>
                </div>
            </div>

            <ScrollToTop />
            <MobileBottomNav currentTab="dashboard" onReport={() => setReportOpen(true)} />
            </div>
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

