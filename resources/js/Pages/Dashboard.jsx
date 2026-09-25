import { Head } from '@inertiajs/react';
import { useMemo, useState, useEffect, useRef } from 'react';
import { Loader2, RefreshCw, SearchX, LayoutGrid, Grid3X3, Layers, Search, MapPin, Trash2, AlertTriangle, CalendarPlus, Globe, Target, FileText, Megaphone, Lock, ArrowRightLeft } from 'lucide-react';
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
        archivedIssues,
        loadingArchived,
        fetchArchivedIssues,
        restoreIssue,
    } = useIssues();
    const { t, lang } = useLanguage();
    const { isDeptUser, department, isAdmin, canViewAllDepartments, canDeleteIssues, canManageIssues, staffName, user } = useAuth();

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
    const [showArchiveTab, setShowArchiveTab] = useState(false);
    const [restoringIssueId, setRestoringIssueId] = useState(null);
    const [takeTarget, setTakeTarget] = useState(null);
    const [resolveTarget, setResolveTarget] = useState(null);
    const [detailTarget, setDetailTarget] = useState(null);
    const [activityDetailTarget, setActivityDetailTarget] = useState(null);
    const [editTarget, setEditTarget] = useState(null);
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
    }, [issues, loading, archivedIssues]);

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
    }, [issues, loading, archivedIssues, currentSheet]);

    // Fetch archived issues when Admin is active or period sheet changes
    useEffect(() => {
        if (isAdmin && fetchArchivedIssues) {
            fetchArchivedIssues();
        }
    }, [isAdmin, currentSheet, fetchArchivedIssues]);

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

    const handleRestore = async (issue) => {
        if (!issue || restoringIssueId) return;
        setRestoringIssueId(issue.id);
        try {
            await restoreIssue(issue);
        } catch (err) {
            alert(err.message || (lang === 'id' ? 'Gagal memulihkan isu.' : 'Failed to restore issue.'));
        } finally {
            setRestoringIssueId(null);
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
            const isArchived = Boolean(i.isArchived || i.statusDisplay === '0' || i.displayStatus === '0');
            if (isArchived) return false;
            if (i.status !== 'open' || i.priority !== 'critical' || !i.deadline) return false;
            const deadlineTime = parseDeadlineToMs(i.deadline);
            if (!deadlineTime) return false;
            return now >= deadlineTime;
        });
    }, [issues, now]);

    // 4. In Progress overdue issues (status === 'progress')
    const progressOverdueCriticals = useMemo(() => {
        return issues.filter(i => {
            const isArchived = Boolean(i.isArchived || i.statusDisplay === '0' || i.displayStatus === '0');
            if (isArchived) return false;
            if (i.status !== 'progress' || i.priority !== 'critical' || !i.deadline) return false;
            const deadlineTime = parseDeadlineToMs(i.deadline);
            if (!deadlineTime) return false;
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
            const deadlineTime = parseDeadlineToMs(issue.deadline);
            if (!deadlineTime) return;
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
        const targetDept = normDeptFilter || normUserDept;

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

    // Auto-hide fallback: if no issues need reassignment, ensure view mode doesn't get stuck on reassign_needed
    useEffect(() => {
        if (reassignNeededCount === 0 && deptViewMode === 'reassign_needed') {
            setDeptViewMode('all');
        }
    }, [reassignNeededCount, deptViewMode]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const sourceIssues = showArchiveTab ? (archivedIssues || []) : issues;

        // Determine active department scope context
        const normUserDept = department ? normalizeDepartment(department) : null;
        const normDeptFilter = (deptFilter && deptFilter !== 'all') ? normalizeDepartment(deptFilter) : null;
        // The effective department being inspected (either specific dropdown selection, or the user's primary dept)
        const targetDept = normDeptFilter || normUserDept;

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
            const isAssignedToTarget = Boolean(targetDept && assigned.includes(targetDept));
            const isTaggedToTarget = Boolean(targetDept && tagged.includes(targetDept));
            const isOriginOfTarget = Boolean(targetDept && originDept === targetDept);

            const isReportedByCurrentMe = isReportedByMe(issue);
            const isPastContrib = isPastContributor(issue);

            // 1. Tab "Reported By Me" (Dibuat Oleh Saya Pribadi)
            if (deptViewMode === 'origin') {
                if (isReportedByCurrentMe) {
                    const inCurrentDept = normUserDept && originDept === normUserDept;
                    acc.push(inCurrentDept ? issue : { ...issue, _isPastContribution: true });
                }
                return acc;
            }

            // 2. Tab "To Fix" (Tugas Perbaikan Departemen)
            if (deptViewMode === 'assigned') {
                if (isAssignedToTarget) {
                    acc.push(issue);
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
            const isEmergency = (issue.category || '').toLowerCase() === 'emergency' 
                || String(issue.id || '').startsWith('SOS')
                || assigned.some(d => String(d).trim().toUpperCase() === 'ALL')
                || tagged.some(d => String(d).trim().toUpperCase() === 'ALL');

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

            const matchesDept = (deptFilter === 'all' || deptViewMode !== 'all' || Boolean(issue._isPastContribution)) ? true : (
                (Array.isArray(issue.assignedDepartments) && issue.assignedDepartments.includes(deptFilter)) ||
                issue.assignedDepartments === deptFilter ||
                issue.department === deptFilter || 
                (Array.isArray(issue.taggedDepartments) && issue.taggedDepartments.includes(deptFilter)) ||
                issue.taggedDepartments === deptFilter
            );

            return matchesQuery && matchesCategory && matchesStatus && matchesDept;
        });

        if (showArchiveTab) {
            return filtered.sort((a, b) => (b.reportedAt || 0) - (a.reportedAt || 0));
        }

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
    }, [issues, archivedIssues, showArchiveTab, query, categoryFilter, statusFilter, deptFilter, isDeptUser, department, deptViewMode, staffName, user]);

    const handleSelect = (issue) => {
        if (!issue) return;
        if (showArchiveTab || issue.isArchived || issue.displayStatus === '0' || issue._isPastContribution) {
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

        // Search in active issues first, then archived
        const found = issues.find(i => String(i.id).toLowerCase() === cleanId.toLowerCase())
            || (archivedIssues || []).find(i => String(i.id).toLowerCase() === cleanId.toLowerCase());

        if (found) {
            const isArchived = Boolean(found.isArchived || found.statusDisplay === '0' || found.displayStatus === '0');
            if (isArchived) {
                setShowArchiveTab(true);
            } else {
                setShowArchiveTab(false);
                if (canViewAllDepartments || isAdmin) {
                    setDeptFilter('all');
                }
                setCategoryFilter('all');
                setStatusFilter('all');
                setDeptViewMode('all');
                setQuery('');
            }

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
        <div className="min-h-screen bg-[#1C1B0E] text-[#FAFAFA] relative overflow-hidden antialiased selection:bg-[#C9AA71]/30">
            {/* Background Motif Pattern Overlay (Palm Lineart) */}
            <div 
                className="fixed inset-0 pointer-events-none opacity-25 z-0 bg-repeat"
                style={{
                    backgroundImage: "url('/bg-lineart.png')",
                    backgroundSize: '600px',
                }}
            />

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
                        onClick={toggleMute}
                        className="px-3 py-1 text-xs font-extrabold rounded-lg bg-black/40 hover:bg-black/60 border border-white/30 transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
                    >
                        {isMuted ? `🔇 ${t('unmute_alarm')}` : `🔊 ${t('sound_active')}`}
                    </button>
                </div>
            )}

            <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 pb-28 md:pb-8">
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

                        {isAdmin && (
                            <Button
                                variant={showArchiveTab ? "default" : "outline"}
                                size="sm"
                                onClick={() => setShowArchiveTab(prev => !prev)}
                                className={`w-fit shrink-0 gap-1.5 transition-all shadow-xs cursor-pointer ${
                                    showArchiveTab
                                        ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-500 font-bold'
                                        : 'border-[#3B3929] hover:bg-[#2A281E] text-muted-foreground hover:text-foreground'
                                }`}
                                title="Buka Tab Arsip / Sampah Isu (Soft-deleted)"
                            >
                                <span>🗄️</span>
                                <span>{lang === 'id' ? 'Arsip / Sampah' : 'Archive / Trash'}</span>
                                {archivedIssues && archivedIssues.length > 0 && (
                                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                        {archivedIssues.length}
                                    </span>
                                )}
                            </Button>
                        )}
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

                    <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto justify-center md:justify-end">
                        {canViewAllDepartments && !isAdmin && (
                            <div 
                                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-semibold shadow-xs shrink-0"
                                title={lang === 'id' 
                                    ? 'Wewenang Akun: Anda memiliki izin akses untuk memantau isu seluruh departemen resort Telunas.' 
                                    : 'Account Permission: You have permission to view and monitor all Telunas resort departments.'}
                            >
                                <Globe className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                                <span>{lang === 'id' ? 'Lintas Seluruh Departemen' : 'All Departments Access'}</span>
                            </div>
                        )}
                        {(isDeptUser || isAdmin) && (
                            <div className="flex items-center justify-center rounded-2xl bg-[#2A281E] p-1.5 border border-[#3B3929] text-xs font-bold shrink-0 max-w-full overflow-x-auto no-scrollbar flex-nowrap gap-1.5 shadow-md mx-auto md:mx-0">
                                <button
                                    type="button"
                                    onClick={() => setDeptViewMode('all')}
                                    title={t('all_my_scope')}
                                    className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                                        deptViewMode === 'all'
                                            ? 'px-3.5 py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                            : 'p-2.5 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    }`}
                                >
                                    <Globe className="w-5 h-5 shrink-0" />
                                    <span className={deptViewMode === 'all' ? 'inline font-bold' : 'hidden sm:inline'}>{t('all_my_scope')}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeptViewMode('assigned')}
                                    title={t('to_fix')}
                                    className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                                        deptViewMode === 'assigned'
                                            ? 'px-3.5 py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                            : 'p-2.5 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    }`}
                                >
                                    <Target className="w-5 h-5 shrink-0" />
                                    <span className={deptViewMode === 'assigned' ? 'inline font-bold' : 'hidden sm:inline'}>{t('to_fix')}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeptViewMode('origin')}
                                    title={t('reported_by_me')}
                                    className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                                        deptViewMode === 'origin'
                                            ? 'px-3.5 py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                            : 'p-2.5 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    }`}
                                >
                                    <FileText className="w-5 h-5 shrink-0" />
                                    <span className={deptViewMode === 'origin' ? 'inline font-bold' : 'hidden sm:inline'}>{t('reported_by_me')}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeptViewMode('tagged')}
                                    title={t('mentioned_me')}
                                    className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                                        deptViewMode === 'tagged'
                                            ? 'px-3.5 py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                            : 'p-2.5 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    }`}
                                >
                                    <Megaphone className="w-5 h-5 shrink-0" />
                                    <span className={deptViewMode === 'tagged' ? 'inline font-bold' : 'hidden sm:inline'}>{t('mentioned_me')}</span>
                                </button>
                                {pastContribCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setDeptViewMode('past_contributions')}
                                        className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                                            deptViewMode === 'past_contributions'
                                                ? 'px-3.5 py-2 bg-[#C9AA71] text-[#1C1B0E] shadow-md font-extrabold'
                                                : 'p-2.5 text-muted-foreground hover:text-foreground hover:bg-white/5'
                                        }`}
                                        title={lang === 'id' 
                                            ? `Riwayat Kontribusi (${pastContribCount} isu)` 
                                            : `Past Contributions (${pastContribCount} issues)`}
                                    >
                                        <Lock className="w-5 h-5 shrink-0" />
                                        <span className={deptViewMode === 'past_contributions' ? 'inline font-bold' : 'hidden sm:inline'}>
                                            {lang === 'id' ? 'Riwayat' : 'Past Contributions'}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
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
                                        className={`rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                                            deptViewMode === 'reassign_needed'
                                                ? 'px-3.5 py-2 bg-amber-500 text-black shadow-md font-extrabold'
                                                : 'p-2.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                                        }`}
                                        title={lang === 'id' 
                                            ? `Staf Mutasi (${reassignNeededCount} isu)` 
                                            : `Transferred Staff (${reassignNeededCount} issues)`}
                                    >
                                        <ArrowRightLeft className="w-5 h-5 shrink-0" />
                                        <span className={deptViewMode === 'reassign_needed' ? 'inline font-bold' : 'hidden sm:inline'}>
                                            {lang === 'id' ? 'Staf Mutasi' : 'Transferred Staff'}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                            deptViewMode === 'reassign_needed'
                                                ? 'bg-black text-amber-400'
                                                : 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                                        }`}>
                                            {reassignNeededCount}
                                        </span>
                                    </button>
                                )}
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

                {showArchiveTab && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">🗄️</span>
                            <div>
                                <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wide">
                                    {lang === 'id' ? 'Arsip & Sampah Isu (Soft-Deleted)' : 'Issue Archive & Trash'}
                                </h3>
                                <p className="text-xs text-amber-200/80">
                                    {lang === 'id' 
                                        ? 'Isu di bawah ini disembunyikan dari dashboard operasional. Anda dapat memulihkan (restore) kapan saja ke status asalnya.' 
                                        : 'Issues below are hidden from the active dashboard. You can restore them anytime to their exact previous state.'}
                                </p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowArchiveTab(false)}
                            className="w-fit text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10 cursor-pointer shrink-0"
                        >
                            ← {lang === 'id' ? 'Kembali ke Isu Aktif' : 'Back to Active Issues'}
                        </Button>
                    </div>
                )}

                {(showArchiveTab ? loadingArchived : loading) && (showArchiveTab ? (archivedIssues || []).length === 0 : issues.length === 0) ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface py-20 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm font-medium text-muted-foreground">
                            {showArchiveTab ? 'Memuat arsip isu...' : 'Connecting to Google Sheets...'}
                        </p>
                    </div>
                ) : visible.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface py-16 text-center">
                        <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
                        <p className="font-semibold text-foreground">
                            {showArchiveTab 
                                ? (lang === 'id' ? 'Tidak ada isu di dalam arsip / sampah' : 'No issues in archive / trash')
                                : (lang === 'id' ? 'Tidak ada isu yang cocok dengan filter' : 'No issues match your filters')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {showArchiveTab 
                                ? (lang === 'id' ? 'Semua isu saat ini berstatus aktif di dashboard operasional.' : 'All issues are currently active.')
                                : (lang === 'id' ? 'Coba kata kunci lain atau reset filter.' : 'Try a different keyword or reset the filter chips.')}
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
                                onEdit={showArchiveTab || issue._isPastContribution ? undefined : (item) => setEditTarget(item)}
                                onDelete={showArchiveTab || issue._isPastContribution ? undefined : (item) => {
                                    setDeleteError('');
                                    setDeleteTarget(item);
                                }}
                                onRestore={showArchiveTab ? handleRestore : undefined}
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
            <EditIssueModal issue={editTarget} open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)} />
            <TakeJobModal issue={takeTarget} onClose={() => setTakeTarget(null)} />
            <ResolveIssueSheet issue={resolveTarget} onClose={() => setResolveTarget(null)} />
            <SolvedDetailModal issue={detailTarget} onClose={() => setDetailTarget(null)} />
            <ActivityDetailModal 
                issue={activityDetailTarget} 
                onClose={() => setActivityDetailTarget(null)} 
                onEdit={activityDetailTarget?._isPastContribution ? undefined : (item) => setEditTarget(item)}
                onRestore={activityDetailTarget?._isPastContribution ? undefined : handleRestore}
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
                                ? 'Isu ini akan disembunyikan dari dashboard operasional dan dipindahkan ke Arsip / Sampah. Admin dapat memulihkannya kembali kapan saja.' 
                                : 'This issue will be hidden from the operational dashboard and moved to Archive / Trash. Admins can restore it at any time.'}
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

