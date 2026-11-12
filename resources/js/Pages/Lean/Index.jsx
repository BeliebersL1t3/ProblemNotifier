import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
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
    ArrowUpDown,
    Image as ImageIcon,
    AlertCircle,
    ExternalLink,
    LogIn,
    LogOut,
    MessageSquare,
    Table,
    LayoutGrid,
    SlidersHorizontal,
    Search,
    Eye,
    EyeOff,
    RotateCcw,
    Sparkles,
    Wrench,
    WifiOff,
    CloudUpload,
    Send,
    HardDrive,
    Users,
    PauseCircle,
    Play,
    ArrowRightLeft,
    History,
    Lock,
    Award,
    CalendarClock
} from 'lucide-react';
import axios from 'axios';
import { LeanHeader } from '@/Components/CampusFix/LeanHeader';
import { MobileBottomNav } from '@/Components/CampusFix/MobileBottomNav';
import { useLeanTheme } from '@/hooks/useLeanTheme';
import {
    EtaPickerField,
    toJakartaDatetimeLocal,
    jakartaLocalToIso,
    parseEtaTimestampMs,
    formatEtaDisplayWib,
    getEtaBadgeInfo,
} from '@/Components/CampusFix/EtaPickerField';
import { LeanAnalyticsView } from '@/Components/CampusFix/LeanAnalyticsView';
import { resolveIssueResortAndZone } from '@/constants/locations';
import { DEPARTMENT_STAFF, normalizeDepartment } from '@/constants/staff';
import { useLanguage } from '@/context/LanguageContext';
import { compressImage } from '@/services/imageCompressor';
import {
    addToOutbox,
    getOutboxCount,
    getOutboxTickets,
    removeOutboxTicket,
    syncAllOutboxTickets,
    registerOutboxAutoSync
} from '@/services/offlineOutbox';



const URGENCY_COLORS = {
    'Darurat': '#f43f5e',
    'Tinggi': '#fb923c',
    'Sedang': '#facc15',
    'Rendah': '#10b981',
};

const DEFAULT_COLUMNS = {
    id: true,
    photo: true,
    title: true,
    location: true,
    dept: true,
    reporter: true,
    desc: true,
    status: true,
    eta: true,
    time: true,
};

export default function LeanIndex({ 
    issues = [], 
    departments = [], 
    locations = ['TBR', 'TPI', 'Kantor'], 
    currentUser = null,
    staffDirectory = [],
    spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/1hF2X6DrcWvOv4h77T_B4pmcNklO2-Zq2CzAiAR-UYIg/edit?usp=sharing',
    monthGids = {},
    needsAutoReconcile = false,
}) {
    const { props: pageProps } = usePage();
    const authUser = pageProps?.auth?.user || null;
    const { lang, setLang } = useLanguage();
    const isEn = lang === 'en';

    const columnDefs = useMemo(() => [
        { id: 'id', label: isEn ? 'Issue ID' : 'ID Isu', icon: '#' },
        { id: 'photo', label: isEn ? 'Photo Proof' : 'Foto Bukti', icon: '📷' },
        { id: 'title', label: isEn ? 'Issue Title' : 'Judul Masalah', icon: '📝' },
        { id: 'location', label: isEn ? 'Location' : 'Lokasi', icon: '📍' },
        { id: 'dept', label: isEn ? 'Target Department' : 'Departemen Tujuan', icon: '🏢' },
        { id: 'reporter', label: isEn ? 'Reporter Name' : 'Nama Pelapor', icon: '👤' },
        { id: 'desc', label: isEn ? 'Detailed Description' : 'Deskripsi Detail', icon: '📄' },
        { id: 'status', label: 'Status', icon: '🏷️' },
        { id: 'eta', label: isEn ? 'Est. Completion' : 'Target Selesai', icon: '⏰' },
        { id: 'time', label: isEn ? 'Reported Time' : 'Waktu Pelaporan', icon: '🕒' },
    ], [isEn]);

    const prevLangRef = useRef(lang);
    useEffect(() => {
        if (prevLangRef.current === lang) return;
        prevLangRef.current = lang;
        if (typeof navigator === 'undefined' || navigator.onLine) {
            router.reload({
                only: ['issues'],
                preserveScroll: true,
                preserveState: true,
            });
        }
    }, [lang]);

    // --- Supervisor / Department Account Info ---
    const myName = currentUser?.name || 'Supervisor';
    const myDept = currentUser?.department || 'Supervisor';

    // --- Unified staff suggestions for fast autocomplete (DB users + fallback static list) ---
    const staffSuggestions = useMemo(() => {
        const map = new Map();

        // 1. Database users first (has whatsapp_number and accurate dept)
        (staffDirectory || []).forEach(u => {
            if (u.name) {
                map.set(u.name.toLowerCase().trim(), {
                    name: u.name,
                    department: u.department || '',
                    subdivision: u.subdivision || '',
                    phone: u.whatsapp_number || '',
                });
            }
        });

        // 2. Fallback static roster from constants/staff.js
        if (DEPARTMENT_STAFF) {
            Object.entries(DEPARTMENT_STAFF).forEach(([dept, roster]) => {
                if (Array.isArray(roster)) {
                    roster.forEach(name => {
                        const key = name.toLowerCase().trim();
                        if (!map.has(key)) {
                            map.set(key, {
                                name,
                                department: dept,
                                subdivision: '',
                                phone: '',
                            });
                        }
                    });
                }
            });
        }

        return Array.from(map.values());
    }, [staffDirectory]);

    // --- UI Filters & View Modes ---
    // Department Filter: 'all' | specific department (supports ?dept= query param)
    const [selectedDeptFilter, setSelectedDeptFilter] = useState(() => {
        if (typeof window !== 'undefined') {
            const deptParam = new URLSearchParams(window.location.search).get('dept');
            if (deptParam) {
                if (deptParam.toLowerCase() === 'all') return 'all';
                const norm = normalizeDepartment(deptParam);
                const matched = (departments || []).find((d) => d.toLowerCase() === norm.toLowerCase());
                return matched || norm;
            }
        }
        return 'all';
    });
    // Month Tab Switcher: 'all' | 1..12
    const [selectedMonthFilter, setSelectedMonthFilter] = useState('all');

    // --- ERP Customization States ---
    const [visibleColumns, setVisibleColumns] = useState(() => {
        try {
            const saved = localStorage.getItem('lean_erp_columns');
            if (saved) {
                const parsed = JSON.parse(saved);
                delete parsed.category;
                return { ...DEFAULT_COLUMNS, ...parsed };
            }
        } catch (err) {
            console.warn('[LeanIndex] Failed parsing lean_erp_columns from localStorage:', err);
        }
        return DEFAULT_COLUMNS;
    });

    const [viewMode, setViewMode] = useState(() => {
        if (typeof window !== 'undefined') {
            const viewParam = new URLSearchParams(window.location.search).get('view');
            if (viewParam === 'analytics') return 'analytics';
            if (viewParam === 'table') return 'table';
            if (viewParam === 'cards') return 'cards';
            if (window.innerWidth < 768) return 'cards';
            try {
                return localStorage.getItem('lean_erp_view_mode') || 'cards';
            } catch (err) {
                console.warn('[LeanIndex] Failed reading lean_erp_view_mode:', err);
                return 'cards';
            }
        }
        return 'cards';
    });

    const lastListViewRef = useRef(viewMode === 'table' ? 'table' : 'cards');
    useEffect(() => {
        if (viewMode === 'cards' || viewMode === 'table') {
            lastListViewRef.current = viewMode;
        }
    }, [viewMode]);

    const handleViewModeChange = (nextView) => {
        setViewMode(nextView);
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            if (nextView === 'analytics') {
                url.searchParams.set('view', 'analytics');
            } else {
                url.searchParams.delete('view');
            }
            window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
        }
    };

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
    const [focusMapRequest, setFocusMapRequest] = useState(null);
    const [returnTicket, setReturnTicket] = useState(null);

    const handleNavigateToMap = (issue) => {
        if (!issue) return;
        const res = resolveIssueResortAndZone(issue);
        if (res.isOffice || !res.resort) return;

        setReturnTicket({
            issue,
            previousViewMode: viewMode,
        });
        setSelectedDetailIssue(null);
        handleViewModeChange('analytics');
        setActiveAnalyticsTab('executive');
        setFocusMapRequest({
            resort: res.resort,
            zoneId: res.zoneId,
            timestamp: Date.now(),
            issueTitle: issue.title,
            issueId: issue.id,
        });
    };

    // Quick Sort Mode: 'status' | 'newest' | 'oldest' | 'waiting_acc'
    const [sortBy, setSortBy] = useState(() => {
        try {
            return localStorage.getItem('telunas_field_sort_by') || 'status';
        } catch (err) {
            console.warn('[LeanIndex] Failed reading telunas_field_sort_by:', err);
            return 'status';
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem('telunas_field_sort_by', sortBy);
        } catch (err) {
            console.warn('[LeanIndex] Failed saving telunas_field_sort_by:', err);
        }
    }, [sortBy]);

    // Save preferences to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('lean_erp_columns', JSON.stringify(visibleColumns));
        } catch (err) {
            console.warn('[LeanIndex] Failed saving lean_erp_columns:', err);
        }
    }, [visibleColumns]);

    useEffect(() => {
        try {
            if (viewMode !== 'table' || (typeof window !== 'undefined' && window.innerWidth >= 768)) {
                localStorage.setItem('lean_erp_view_mode', viewMode);
            }
        } catch (err) {
            console.warn('[LeanIndex] Failed saving lean_erp_view_mode:', err);
        }
    }, [viewMode]);

    // Theme preference (dark / light) synced across Lean pages & header
    const { theme, isDark } = useLeanTheme();

    const toggleColumn = (colId) => {
        setVisibleColumns((prev) => ({ ...prev, [colId]: !prev[colId] }));
    };

    const setAllColumns = (val) => {
        const next = {};
        columnDefs.forEach((c) => { next[c.id] = val; });
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

    // --- Real-time Auto-refresh Polling (Every 4 seconds for fresh issues sync) ---
    useEffect(() => {
        const pollTimer = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                router.reload({
                    only: ['issues'],
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
    const [showClaimModal, setShowClaimModal] = useState(null);
    const [showProgressModal, setShowProgressModal] = useState(null);
    const [showPendingModal, setShowPendingModal] = useState(null);
    const [showTransferModal, setShowTransferModal] = useState(null);
    const [lightboxImage, setLightboxImage] = useState(null);
    const [issueToDelete, setIssueToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [actionNotice, setActionNotice] = useState(null);
    const [nowMs, setNowMs] = useState(() => Date.now());

    // Keep latest issues accessible to global event listeners & deep-link handlers
    const issuesRef = useRef(issues);
    issuesRef.current = issues;
    const pendingOpenIssueRef = useRef(null);

    const findIssueMatch = (issueList, rawIdentifier) => {
        if (!rawIdentifier || !Array.isArray(issueList)) return null;
        const cleaned = String(rawIdentifier).trim().replace(/^#/, '').toLowerCase();
        if (!cleaned) return null;
        return (
            issueList.find((i) => String(i.id) === cleaned) ||
            issueList.find((i) => (i.issue_code || '').toLowerCase() === cleaned) ||
            issueList.find((i) => `lean-${i.id}` === cleaned) ||
            issueList.find((i) => (i.title || '').toLowerCase().includes(cleaned)) ||
            null
        );
    };

    useEffect(() => {
        const applyUrlParams = () => {
            if (typeof window === 'undefined') return;
            const url = new URL(window.location.href);
            const params = url.searchParams;
            let shouldCleanUrl = false;

            const viewParam = params.get('view');
            if (viewParam === 'analytics') {
                setViewMode('analytics');
            } else if (viewParam === 'table') {
                setViewMode('table');
            } else if (viewParam === 'cards') {
                setViewMode('cards');
            }

            const deptParam = params.get('dept');
            if (deptParam) {
                if (deptParam.toLowerCase() === 'all') {
                    setSelectedDeptFilter('all');
                } else {
                    const norm = normalizeDepartment(deptParam);
                    const matched = (departments || []).find((d) => d.toLowerCase() === norm.toLowerCase());
                    setSelectedDeptFilter(matched || norm);
                }
            }

            const reportParam = params.get('report');
            if (reportParam === '1' || reportParam === 'true') {
                setShowReportModal(true);
                params.delete('report');
                shouldCleanUrl = true;
            }

            const issueParam = params.get('issue') || params.get('id') || params.get('search');
            if (issueParam) {
                const found = findIssueMatch(issuesRef.current, issueParam);
                if (found) {
                    setSelectedDetailIssue(found);
                    pendingOpenIssueRef.current = null;
                } else {
                    pendingOpenIssueRef.current = issueParam;
                }
                params.delete('issue');
                params.delete('id');
                params.delete('search');
                shouldCleanUrl = true;
            }

            if (shouldCleanUrl) {
                const nextSearch = params.toString();
                const cleanPath = url.pathname + (nextSearch ? `?${nextSearch}` : '') + url.hash;
                window.history.replaceState(window.history.state, '', cleanPath);
            }
        };

        applyUrlParams();
        const removeNavigateListener = router.on('navigate', applyUrlParams);

        const handleOpenIssueEvent = (e) => {
            const targetIdentifier = e.detail?.issueId;
            if (!targetIdentifier) return;
            const found = findIssueMatch(issuesRef.current, targetIdentifier);
            if (found) {
                setSelectedDetailIssue(found);
                pendingOpenIssueRef.current = null;
            } else {
                pendingOpenIssueRef.current = targetIdentifier;
                router.reload({ only: ['issues'], preserveScroll: true, preserveState: true });
            }
        };

        window.addEventListener('campusfix-open-issue', handleOpenIssueEvent);
        return () => {
            removeNavigateListener();
            window.removeEventListener('campusfix-open-issue', handleOpenIssueEvent);
        };
    }, [departments]);

    useEffect(() => {
        if (!pendingOpenIssueRef.current) return;
        const found = findIssueMatch(issues, pendingOpenIssueRef.current);
        if (found) {
            setSelectedDetailIssue(found);
            pendingOpenIssueRef.current = null;
        }
    }, [issues]);

    useEffect(() => {
        const timer = setInterval(() => setNowMs(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    const showNotice = (type, text) => {
        setActionNotice({ type, text, id: Date.now() });
    };

    useEffect(() => {
        if (!actionNotice) return;
        const t = setTimeout(() => setActionNotice(null), 5000);
        return () => clearTimeout(t);
    }, [actionNotice]);

    // Check if logged-in account is Admin or belongs to the issue's target department(s)
    const canManageIssue = (issue) => {
        if (!issue || !currentUser) return false;
        if (typeof issue.can_manage === 'boolean') return issue.can_manage;
        if (currentUser.is_admin) return true;
        const userDept = normalizeDepartment(currentUser.department).toLowerCase();
        if (!userDept) return false;
        const targets = Array.isArray(issue.target_departments) ? issue.target_departments : [];
        return targets.some((d) => normalizeDepartment(d).toLowerCase() === userDept);
    };

    // Unified candidate worker list for multi-select worker pickers per issue
    const getWorkersPoolForIssue = (issue) => {
        const seen = new Set();
        const result = [];
        const addName = (raw) => {
            const name = String(raw || '').trim();
            if (!name) return;
            const key = name.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                result.push(name);
            }
        };

        // 1. Existing workers on this issue first
        if (issue) {
            (issue.active_workers || []).forEach(addName);
            (issue.initial_workers || []).forEach(addName);
            (issue.progress_workers || []).forEach(addName);
            (issue.contributors || []).forEach(addName);
        }

        // 2. Current user (if matched dept or non-admin dept user)
        if (currentUser && (currentUser.staff_name || currentUser.name)) {
            const uName = currentUser.staff_name || currentUser.name;
            if (!currentUser.is_admin) {
                addName(uName);
            }
        }

        // 3. Matching staff from live database directory & static roster for issue target_departments
        const targetDeptsNorm = (issue?.target_departments || []).map((d) =>
            normalizeDepartment(d).toLowerCase()
        );
        if (targetDeptsNorm.length === 0 && myDept && myDept !== 'Supervisor') {
            targetDeptsNorm.push(normalizeDepartment(myDept).toLowerCase());
        }

        (staffDirectory || []).forEach((u) => {
            const uDeptNorm = normalizeDepartment(u.department || '').toLowerCase();
            if (u.name && uDeptNorm && targetDeptsNorm.includes(uDeptNorm)) {
                addName(u.name);
            }
        });

        if (DEPARTMENT_STAFF) {
            Object.entries(DEPARTMENT_STAFF).forEach(([deptKey, roster]) => {
                if (targetDeptsNorm.includes(normalizeDepartment(deptKey).toLowerCase()) && Array.isArray(roster)) {
                    roster.forEach(addName);
                }
            });
        }

        return result;
    };

    const formatDateTimeId = (isoStr, withShortDateStyle = false) => {
        if (!isoStr) return '';
        try {
            const localeCode = isEn ? 'en-US' : 'id-ID';
            if (withShortDateStyle) {
                return new Date(isoStr).toLocaleString(localeCode, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                });
            }
            return new Date(isoStr).toLocaleString(localeCode, {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch (err) {
            console.warn('[LeanIndex] Failed formatting date:', err);
            return isoStr;
        }
    };

    const formatRelativeTime = (isoStr, fallbackHuman) => {
        if (!isoStr) return fallbackHuman || '';
        try {
            const dt = new Date(isoStr);
            if (isNaN(dt.getTime())) return fallbackHuman || '';
            const diffSec = Math.floor((Date.now() - dt.getTime()) / 1000);
            if (diffSec < 45) return isEn ? 'Just now' : 'Baru saja';
            const diffMin = Math.floor(diffSec / 60);
            if (diffMin < 60) return isEn ? `${diffMin} min ago` : `${diffMin} menit yang lalu`;
            const diffHour = Math.floor(diffMin / 60);
            if (diffHour < 24) return isEn ? `${diffHour} hr${diffHour > 1 ? 's' : ''} ago` : `${diffHour} jam yang lalu`;
            const diffDay = Math.floor(diffHour / 24);
            if (diffDay < 30) return isEn ? `${diffDay} day${diffDay > 1 ? 's' : ''} ago` : `${diffDay} hari yang lalu`;
            return dt.toLocaleDateString(isEn ? 'en-US' : 'id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (err) {
            console.warn('[LeanIndex] Failed formatting relative time:', err);
            return fallbackHuman || '';
        }
    };

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

    // --- Mobile & Offline Outbox State ---
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [outboxCount, setOutboxCount] = useState(0);
    const [outboxTickets, setOutboxTickets] = useState([]);
    const [showOutboxModal, setShowOutboxModal] = useState(false);
    const [isSyncingOutbox, setIsSyncingOutbox] = useState(false);
    const [startInProgress, setStartInProgress] = useState(false);
    const [staffReporterName, setStaffReporterName] = useState('');
    const [staffReporterDept, setStaffReporterDept] = useState('');
    const [staffReporterPhone, setStaffReporterPhone] = useState('');
    const [staffSearchQuery, setStaffSearchQuery] = useState('');
    const [showStaffDropdown, setShowStaffDropdown] = useState(false);
    const [assignedWorkers, setAssignedWorkers] = useState([]);
    const [customWorkerInput, setCustomWorkerInput] = useState('');
    const [formEta, setFormEta] = useState('');

    // Coworkers in the recording leader's department for assigning
    const myDeptTeammates = useMemo(() => {
        const set = new Set();
        const list = [];

        // 1. Current user always included first
        if (myName && myName !== 'Supervisor') {
            set.add(myName.toLowerCase());
            list.push(myName);
        }

        // 2. Teammates from staffDirectory matching myDept
        (staffDirectory || []).forEach(u => {
            const name = u.name;
            if (name && u.department && myDept && u.department.toLowerCase() === myDept.toLowerCase()) {
                if (!set.has(name.toLowerCase())) {
                    set.add(name.toLowerCase());
                    list.push(name);
                }
            }
        });

        // 3. Fallback static roster for myDept from DEPARTMENT_STAFF
        if (DEPARTMENT_STAFF && myDept && DEPARTMENT_STAFF[myDept]) {
            DEPARTMENT_STAFF[myDept].forEach(name => {
                if (!set.has(name.toLowerCase())) {
                    set.add(name.toLowerCase());
                    list.push(name);
                }
            });
        }

        if (list.length === 0 && myName) {
            list.push(myName);
        }

        return list;
    }, [staffDirectory, myDept, myName]);

    // Toggle multi-select worker
    const toggleAssignedWorker = (name) => {
        setAssignedWorkers(prev => {
            if (prev.includes(name)) {
                return prev.filter(n => n !== name);
            }
            return [...prev, name];
        });
    };

    // Add custom worker name
    const handleAddCustomWorker = () => {
        const trimmed = customWorkerInput.trim();
        if (trimmed && !assignedWorkers.includes(trimmed)) {
            setAssignedWorkers(prev => [...prev, trimmed]);
            setCustomWorkerInput('');
        }
    };

    // Filter staff suggestions by name, department, or phone
    const filteredStaff = useMemo(() => {
        const query = staffSearchQuery.trim().toLowerCase();
        if (!query) return staffSuggestions.slice(0, 10);
        return staffSuggestions.filter(s =>
            s.name.toLowerCase().includes(query) ||
            (s.department && s.department.toLowerCase().includes(query)) ||
            (s.phone && s.phone.includes(query))
        ).slice(0, 15);
    }, [staffSuggestions, staffSearchQuery]);

    const handleSelectStaff = (staff) => {
        setStaffReporterName(staff.name);
        setStaffSearchQuery(staff.name);
        setStaffReporterDept(staff.department || '');
        if (staff.phone) {
            setStaffReporterPhone(staff.phone);
        }
        setShowStaffDropdown(false);
    };

    // Fetch outbox tickets & status
    const refreshOutbox = async () => {
        try {
            const count = await getOutboxCount();
            setOutboxCount(count);
            if (showOutboxModal) {
                const tickets = await getOutboxTickets();
                setOutboxTickets(tickets);
            }
        } catch (err) {
            console.error('[Index] Error fetching outbox count:', err);
        }
    };

    useEffect(() => {
        refreshOutbox();

        const cleanupAutoSync = registerOutboxAutoSync(({ isOnline: online, outboxCount: count }) => {
            setIsOnline(online);
            setOutboxCount(count);
        });

        const handleOutboxUpdate = (e) => {
            if (e.detail?.count !== undefined) {
                setOutboxCount(e.detail.count);
            } else {
                refreshOutbox();
            }
        };

        const handleOutboxSynced = (e) => {
            refreshOutbox();
            router.reload({ only: ['issues'], preserveScroll: true, preserveState: true });
        };

        window.addEventListener('telunas:outbox-updated', handleOutboxUpdate);
        window.addEventListener('telunas:outbox-synced', handleOutboxSynced);

        return () => {
            cleanupAutoSync();
            window.removeEventListener('telunas:outbox-updated', handleOutboxUpdate);
            window.removeEventListener('telunas:outbox-synced', handleOutboxSynced);
        };
    }, [showOutboxModal]);

    // Silent self-healing reconciliation when SQL has unsynced changes for Google Sheets
    const autoSyncAttemptedRef = useRef(false);
    useEffect(() => {
        if (!needsAutoReconcile || !isOnline) {
            autoSyncAttemptedRef.current = false;
            return;
        }
        if (autoSyncAttemptedRef.current) return;
        autoSyncAttemptedRef.current = true;

        axios
            .post('/lapangan/auto-sync')
            .then((res) => {
                const data = res?.data;
                if (data?.remaining > 0) {
                    autoSyncAttemptedRef.current = false;
                } else if (data?.synced > 0) {
                    router.reload({ only: ['needsAutoReconcile'], preserveScroll: true, preserveState: true });
                }
            })
            .catch((err) => {
                console.warn('[AutoSyncSheets] Background reconcile deferred:', err);
            });
    }, [needsAutoReconcile, isOnline]);

    // Manual Outbox Sync
    const handleManualSync = async () => {
        if (!navigator.onLine) {
            alert(isEn
                ? 'Your device is currently offline (not connected to internet/Wi-Fi). Please connect to the internet first.'
                : 'Perangkat Anda saat ini masih offline (belum terhubung ke internet/Wi-Fi). Silakan hubungkan internet terlebih dahulu.');
            return;
        }

        setIsSyncingOutbox(true);
        try {
            const result = await syncAllOutboxTickets();
            await refreshOutbox();
            const tickets = await getOutboxTickets();
            setOutboxTickets(tickets);

            if (result.synced > 0) {
                router.reload({ only: ['issues'], preserveScroll: true, preserveState: true });
                alert(isEn
                    ? `✅ Successfully synced ${result.synced} report(s) to the server & Google Sheets!`
                    : `✅ Berhasil menyinkronkan ${result.synced} laporan ke server & Google Sheets!`);
            } else if (result.failed > 0) {
                alert(isEn
                    ? `⚠️ ${result.failed} report(s) failed to send. Please check your connection and try again.`
                    : `⚠️ Ada ${result.failed} laporan yang gagal terkirim. Silakan periksa koneksi dan coba lagi.`);
            }
        } catch (err) {
            console.error('[Index] Manual sync error:', err);
            alert(isEn ? `Failed to sync queue: ${err.message}` : `Gagal menyinkronkan antrean: ${err.message}`);
        } finally {
            setIsSyncingOutbox(false);
        }
    };

    // Delete single outbox item
    const handleDeleteOutboxItem = async (id) => {
        if (!confirm(isEn
            ? 'Are you sure you want to delete this draft report from your device queue?'
            : 'Apakah Anda yakin ingin menghapus draf laporan ini dari antrean HP?')) {
            return;
        }
        try {
            await removeOutboxTicket(id);
            const tickets = await getOutboxTickets();
            setOutboxTickets(tickets);
            setOutboxCount(tickets.length);
        } catch (err) {
            console.error('[Index] Error deleting outbox item:', err);
            alert(isEn ? `Failed to delete draft: ${err.message}` : `Gagal menghapus draf: ${err.message}`);
        }
    };

    // --- Workflow Action Form States ---
    const [resolveNote, setResolveNote] = useState('');
    const [resolveImage, setResolveImage] = useState(null);
    const [resolveImagePreview, setResolveImagePreview] = useState(null);
    const [resolveWorkers, setResolveWorkers] = useState([]);
    const [resolveCustomWorker, setResolveCustomWorker] = useState('');

    const [claimWorkers, setClaimWorkers] = useState([]);
    const [claimCustomWorker, setClaimCustomWorker] = useState('');
    const [claimNote, setClaimNote] = useState('');
    const [claimEta, setClaimEta] = useState('');
    const [claimNotifyReporter, setClaimNotifyReporter] = useState(true);

    const [progressComment, setProgressComment] = useState('');
    const [progressWorkers, setProgressWorkers] = useState([]);
    const [progressCustomWorker, setProgressCustomWorker] = useState('');
    const [progressEta, setProgressEta] = useState('');
    const [progressNotifyReporter, setProgressNotifyReporter] = useState(true);

    const [pendingReason, setPendingReason] = useState('');
    const [pendingEta, setPendingEta] = useState('');

    const [transferTargetDept, setTransferTargetDept] = useState('');
    const [transferReason, setTransferReason] = useState('');

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

    // Submit Report (Discussion-Verified Workflow with Client-Side Compression & Offline Support)
    const handleReportSubmit = async (e) => {
        e.preventDefault();
        if (!formTitle.trim()) {
            alert(isEn ? 'Please enter the issue title / problem found.' : 'Mohon isi judul / masalah yang ditemukan.');
            return;
        }

        const fullLocation = formDetailLoc.trim()
            ? `${formMainLoc} - ${formDetailLoc.trim()}`
            : formMainLoc;

        // Reporter is the staff who came to discuss; clean name without "(via ...)"
        const staffNameTrimmed = (staffReporterName || staffSearchQuery).trim();
        const actualReporter = staffNameTrimmed || myName;
        const actualReporterDept = staffReporterDept || null;

        // Responsible department: locked to the recording leader's department
        const resolvedDept = (myDept && myDept !== 'Supervisor') ? myDept : (formTargetDepts[0] || 'Engineer');
        const targetDepts = [resolvedDept];

        // Assigned workers string
        const workersStr = startInProgress
            ? (assignedWorkers.length > 0 ? assignedWorkers.join(', ') : myName)
            : null;
        const etaIso = startInProgress && formEta ? jakartaLocalToIso(formEta) : null;

        setIsSubmitting(true);

        try {
            // Compress image client-side if attached
            let compressed = null;
            if (formImage) {
                try {
                    compressed = await compressImage(formImage);
                } catch (cErr) {
                    console.warn('[ReportSubmit] Compression fallback to raw file:', cErr);
                }
            }

            // Offline mode: store directly in IndexedDB outbox
            if (!navigator.onLine) {
                await addToOutbox({
                    title: formTitle.trim(),
                    description: formDescription,
                    location: fullLocation,
                    target_departments: targetDepts,
                    reporter_name: actualReporter,
                    reporter_dept: actualReporterDept,
                    reporter_phone: staffReporterPhone.trim(),
                    start_in_progress: startInProgress,
                    assigned_workers: workersStr,
                    estimated_completion_at: etaIso,
                    imageBlob: compressed?.blob || formImage || null,
                    imageName: compressed?.file?.name || formImage?.name || 'offline_photo.jpg',
                    imagePreview: compressed?.dataUrl || formImagePreview,
                });

                alert(isEn
                    ? '📱 Offline Mode: Report & photo safely saved on your device! It will automatically upload once Wi-Fi / Starlink reconnects.'
                    : '📱 Mode Offline: Laporan & foto telah tersimpan aman di HP Anda! Laporan akan otomatis terkirim begitu HP Anda kembali terhubung ke sinyal Wi-Fi / Starlink.');
                setShowReportModal(false);
                setFormDetailLoc('');
                setFormTitle('');
                setFormDescription('');
                setFormImage(null);
                setFormImagePreview(null);
                setStaffReporterName('');
                setStaffReporterDept('');
                setStaffReporterPhone('');
                setStaffSearchQuery('');
                setAssignedWorkers([]);
                setCustomWorkerInput('');
                setFormEta('');
                setStartInProgress(false);
                setShowStaffDropdown(false);
                setIsSubmitting(false);
                await refreshOutbox();
                return;
            }

            // Online mode: submit to backend
            const data = new FormData();
            data.append('location', fullLocation);
            data.append('title', formTitle.trim());
            data.append('description', formDescription);
            targetDepts.forEach((d) => data.append('target_departments[]', d));
            data.append('reporter_name', actualReporter);
            if (actualReporterDept) {
                data.append('reporter_dept', actualReporterDept);
            }
            if (staffReporterPhone.trim()) {
                data.append('reporter_phone', staffReporterPhone.trim());
            }
            if (startInProgress) {
                data.append('start_in_progress', '1');
                if (workersStr) {
                    data.append('assigned_workers', workersStr);
                }
                if (etaIso) {
                    data.append('estimated_completion_at', etaIso);
                }
            }
            if (compressed?.file) {
                data.append('image', compressed.file);
            } else if (formImage) {
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
                    setStaffReporterName('');
                    setStaffReporterDept('');
                    setStaffReporterPhone('');
                    setStaffSearchQuery('');
                    setAssignedWorkers([]);
                    setCustomWorkerInput('');
                    setFormEta('');
                    setStartInProgress(false);
                    setShowStaffDropdown(false);
                    setIsSubmitting(false);
                },
                onError: async (err) => {
                    console.error('[ReportSubmit] Online submission error:', err);
                    if (!navigator.onLine) {
                        try {
                            await addToOutbox({
                                title: formTitle.trim(),
                                description: formDescription,
                                location: fullLocation,
                                target_departments: targetDepts,
                                reporter_name: actualReporter,
                                reporter_dept: actualReporterDept,
                                reporter_phone: staffReporterPhone.trim(),
                                start_in_progress: startInProgress,
                                assigned_workers: workersStr,
                                estimated_completion_at: etaIso,
                                imageBlob: compressed?.blob || formImage || null,
                                imageName: compressed?.file?.name || formImage?.name || 'offline_photo.jpg',
                                imagePreview: compressed?.dataUrl || formImagePreview,
                            });
                            alert(isEn
                                ? '⚠️ Connection dropped while sending. Your report has been safely queued offline on your device.'
                                : '⚠️ Koneksi terputus saat pengiriman. Laporan telah diamankan di antrean offline HP Anda.');
                            setFormEta('');
                            setShowReportModal(false);
                            await refreshOutbox();
                        } catch (saveErr) {
                            console.error('[ReportSubmit] Failed fallback to outbox:', saveErr);
                        }
                    }
                    setIsSubmitting(false);
                },
            });
        } catch (submitErr) {
            console.error('[ReportSubmit] Unexpected error:', submitErr);
            alert(isEn
                ? `Failed to process report: ${submitErr.message || 'System error'}`
                : `Gagal memproses laporan: ${submitErr.message || 'Kesalahan sistem'}`);
            setIsSubmitting(false);
        }
    };

    // Trigger ACC for a department
    const handleAcc = (issueId, dept) => {
        router.post(`/lapangan/issues/${issueId}/acc`, {
            dept: dept,
            staff_name: myName,
        }, { preserveScroll: true });
    };

    const toggleListWorker = (setter, name) => {
        const lower = String(name).toLowerCase().trim();
        setter((prev) => {
            const exists = prev.some((n) => String(n).toLowerCase().trim() === lower);
            return exists
                ? prev.filter((n) => String(n).toLowerCase().trim() !== lower)
                : [...prev, name];
        });
    };

    const addCustomListWorker = (inputVal, setInputVal, list, setList) => {
        const trimmed = inputVal.trim();
        if (!trimmed) return;
        const exists = list.some((w) => w.toLowerCase() === trimmed.toLowerCase());
        if (!exists) {
            setList((prev) => [...prev, trimmed]);
        }
        setInputVal('');
    };

    const extractErrorMsg = (errors, fallback) => {
        if (!errors) return fallback;
        if (typeof errors === 'string') return errors;
        const firstKey = Object.keys(errors)[0];
        if (firstKey && errors[firstKey]) {
            return Array.isArray(errors[firstKey]) ? errors[firstKey][0] : errors[firstKey];
        }
        return fallback;
    };

    // Open & Submit Claim / Start Working (or Resume Pending -> Progress) Modal
    const openClaimModal = (issue) => {
        if (!issue) return;
        const existingActive = Array.isArray(issue.active_workers) && issue.active_workers.length > 0
            ? issue.active_workers
            : (issue.claimed_by_name ? issue.claimed_by_name.split(',').map((s) => s.trim()).filter(Boolean) : []);
        const defaultWorkers = existingActive.length > 0
            ? existingActive
            : (!currentUser?.is_admin && (currentUser?.staff_name || currentUser?.name) ? [currentUser.staff_name || currentUser.name] : []);
        setClaimWorkers(defaultWorkers);
        setClaimCustomWorker('');
        setClaimNote('');
        setClaimEta(toJakartaDatetimeLocal(issue.estimated_completion_at));
        setClaimNotifyReporter(true);
        setShowClaimModal(issue);
    };

    const handleClaimSubmit = (e) => {
        e.preventDefault();
        if (!showClaimModal) return;
        if (claimWorkers.length === 0) {
            alert(isEn ? 'Select at least 1 assigned worker.' : 'Pilih minimal 1 pekerja yang ditugaskan.');
            return;
        }
        const isResuming = showClaimModal.status === 'pending';
        const notifyOnResume = claimNotifyReporter;
        const hadPriorEta = Boolean(showClaimModal.estimated_completion_at);
        setIsSubmitting(true);
        router.post(`/lapangan/issues/${showClaimModal.id}/claim`, {
            workers: claimWorkers,
            note: claimNote.trim(),
            dept: (myDept && myDept !== 'Supervisor') ? myDept : (showClaimModal.target_departments?.[0] || ''),
            notify_reporter: isResuming ? notifyOnResume : true,
            estimated_completion_at: claimEta ? jakartaLocalToIso(claimEta) : null,
            clear_eta: hadPriorEta && !claimEta,
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setShowClaimModal(null);
                setClaimWorkers([]);
                setClaimCustomWorker('');
                setClaimNote('');
                setClaimEta('');
                setClaimNotifyReporter(true);
                setIsSubmitting(false);
                showNotice(
                    'success',
                    isResuming
                        ? (notifyOnResume
                            ? (isEn ? 'Issue resumed to In Progress & reporter notified via WA.' : 'Isu dilanjutkan ke tahap Progress & pelapor dikabari via WA.')
                            : (isEn ? 'Issue resumed to In Progress.' : 'Isu dilanjutkan ke tahap Progress.'))
                        : (isEn ? 'Issue marked as In Progress.' : 'Isu mulai dikerjakan (In Progress).')
                );
            },
            onError: (errors) => {
                setIsSubmitting(false);
                showNotice('error', extractErrorMsg(
                    errors,
                    isResuming
                        ? (isEn ? 'Failed to resume issue to In Progress. Please verify department permissions.' : 'Gagal melanjutkan isu ke tahap Progress. Pastikan hak akses departemen sesuai.')
                        : (isEn ? 'Failed to claim issue. Please verify department permissions.' : 'Gagal mengambil pekerjaan. Pastikan hak akses departemen sesuai.')
                ));
            },
        });
    };

    // Open & Submit Progress Comment + Team Update Modal
    const openProgressModal = (issue) => {
        if (!issue) return;
        const currentActive = Array.isArray(issue.active_workers) && issue.active_workers.length > 0
            ? issue.active_workers
            : (issue.claimed_by_name ? issue.claimed_by_name.split(',').map((s) => s.trim()).filter(Boolean) : []);
        setProgressWorkers(currentActive);
        setProgressCustomWorker('');
        setProgressComment('');
        setProgressEta(toJakartaDatetimeLocal(issue.estimated_completion_at));
        setProgressNotifyReporter(true);
        setShowProgressModal(issue);
    };

    const handleProgressSubmit = (e) => {
        e.preventDefault();
        if (!showProgressModal) return;
        if (progressWorkers.length === 0) {
            alert(isEn
                ? 'At least 1 active worker is required while status is In Progress.'
                : 'Minimal harus ada 1 pekerja aktif saat status In Progress.');
            return;
        }
        const hadPriorEta = Boolean(showProgressModal.estimated_completion_at);
        setIsSubmitting(true);
        router.post(`/lapangan/issues/${showProgressModal.id}/progress`, {
            comment: progressComment.trim(),
            workers: progressWorkers,
            notify_reporter: progressNotifyReporter,
            estimated_completion_at: progressEta ? jakartaLocalToIso(progressEta) : null,
            clear_eta: hadPriorEta && !progressEta,
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setShowProgressModal(null);
                setProgressComment('');
                setProgressWorkers([]);
                setProgressCustomWorker('');
                setProgressEta('');
                setIsSubmitting(false);
                showNotice('success', progressNotifyReporter
                    ? (isEn ? 'Progress & team saved, WA update sent to reporter.' : 'Progress & tim disimpan, info WA dikirim ke pelapor.')
                    : (isEn ? 'Progress & team updated successfully.' : 'Progress & tim berhasil diperbarui.')
                );
            },
            onError: (errors) => {
                setIsSubmitting(false);
                showNotice('error', extractErrorMsg(errors, isEn ? 'Failed to save progress update.' : 'Gagal menyimpan update progress.'));
            },
        });
    };

    // Open & Submit Pending Modal
    const openPendingModal = (issue) => {
        if (!issue) return;
        setPendingReason(issue.status === 'pending' ? (issue.pending_reason || '') : '');
        setPendingEta(toJakartaDatetimeLocal(issue.estimated_completion_at));
        setShowPendingModal(issue);
    };

    const handlePendingSubmit = (e) => {
        e.preventDefault();
        if (!showPendingModal) return;
        if (!pendingReason.trim()) {
            alert(isEn ? 'Pending reason is required.' : 'Alasan pending wajib diisi.');
            return;
        }
        const hadPriorEta = Boolean(showPendingModal.estimated_completion_at);
        setIsSubmitting(true);
        router.post(`/lapangan/issues/${showPendingModal.id}/pending`, {
            reason: pendingReason.trim(),
            estimated_completion_at: pendingEta ? jakartaLocalToIso(pendingEta) : null,
            clear_eta: hadPriorEta && !pendingEta,
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setShowPendingModal(null);
                setPendingReason('');
                setPendingEta('');
                setIsSubmitting(false);
                showNotice('success', isEn
                    ? 'Issue status updated to Pending & reporter notified.'
                    : 'Status isu diperbarui menjadi Pending & pelapor dikabari.');
            },
            onError: (errors) => {
                setIsSubmitting(false);
                showNotice('error', extractErrorMsg(errors, isEn ? 'Failed to update status to Pending.' : 'Gagal mengubah status ke Pending.'));
            },
        });
    };

    // Open & Submit Resolve Modal (Mandatory note, Optional photo, Cumulative final_workers)
    const openResolveModal = (issue) => {
        if (!issue) return;
        const currentActive = Array.isArray(issue.active_workers) && issue.active_workers.length > 0
            ? issue.active_workers
            : (issue.claimed_by_name ? issue.claimed_by_name.split(',').map((s) => s.trim()).filter(Boolean) : []);
        const fallbackWorker = (!currentUser?.is_admin && (currentUser?.staff_name || currentUser?.name))
            ? [currentUser.staff_name || currentUser.name]
            : [];
        setResolveWorkers(currentActive.length > 0 ? currentActive : fallbackWorker);
        setResolveCustomWorker('');
        setResolveNote('');
        setResolveImage(null);
        setResolveImagePreview(null);
        setShowResolveModal(issue);
    };

    const handleResolveSubmit = async (e) => {
        e.preventDefault();
        if (!showResolveModal) return;
        if (!resolveNote.trim()) {
            alert(isEn ? 'Resolution description / note is required.' : 'Deskripsi / catatan penyelesaian wajib diisi.');
            return;
        }
        if (resolveWorkers.length === 0) {
            alert(isEn ? 'Select at least 1 worker who resolved / contributed.' : 'Pilih minimal 1 pekerja yang menyelesaikan / berkontribusi.');
            return;
        }

        setIsSubmitting(true);
        try {
            let compressed = null;
            if (resolveImage) {
                try {
                    compressed = await compressImage(resolveImage);
                } catch (cErr) {
                    console.warn('[ResolveSubmit] Compression fallback:', cErr);
                }
            }

            const data = new FormData();
            data.append('dept', (myDept && myDept !== 'Supervisor') ? myDept : (showResolveModal.target_departments?.[0] || ''));
            data.append('staff_name', resolveWorkers.join(', '));
            resolveWorkers.forEach((w) => data.append('final_workers[]', w));
            data.append('note', resolveNote.trim());
            if (compressed?.file) {
                data.append('proof_image', compressed.file);
            } else if (resolveImage) {
                data.append('proof_image', resolveImage);
            }

            router.post(`/lapangan/issues/${showResolveModal.id}/resolve`, data, {
                preserveScroll: true,
                onSuccess: () => {
                    setShowResolveModal(null);
                    setResolveNote('');
                    setResolveImage(null);
                    setResolveImagePreview(null);
                    setResolveWorkers([]);
                    setResolveCustomWorker('');
                    setIsSubmitting(false);
                    showNotice('success', isEn
                        ? 'Issue marked as Resolved & contributor list recorded!'
                        : 'Isu berhasil ditandai Selesai & daftar kontributor tercatat!');
                },
                onError: (errors) => {
                    setIsSubmitting(false);
                    showNotice('error', extractErrorMsg(errors, isEn ? 'Failed to mark issue as resolved.' : 'Gagal menandai isu selesai.'));
                },
            });
        } catch (err) {
            console.error('[ResolveSubmit] Unexpected error:', err);
            setIsSubmitting(false);
            showNotice('error', isEn
                ? `Failed to process resolution: ${err.message}`
                : `Gagal memproses penyelesaian: ${err.message}`);
        }
    };

    // Open & Submit Transfer Modal (Alihkan ke Dept Lain)
    const openTransferModal = (issue) => {
        if (!issue) return;
        const currentTargets = (issue.target_departments || []).map((d) => normalizeDepartment(d).toLowerCase());
        const candidates = (departments || []).filter((d) =>
            currentTargets.length !== 1 || normalizeDepartment(d).toLowerCase() !== currentTargets[0]
        );
        setTransferTargetDept(candidates[0] || departments?.[0] || '');
        setTransferReason('');
        setShowTransferModal(issue);
    };

    const handleTransferSubmit = (e) => {
        e.preventDefault();
        if (!showTransferModal) return;
        if (!transferTargetDept) {
            alert(isEn ? 'Select a new target department.' : 'Pilih departemen tujuan baru.');
            return;
        }
        if (!transferReason.trim()) {
            alert(isEn ? 'Department transfer reason is required.' : 'Alasan pengalihan departemen wajib diisi.');
            return;
        }
        setIsSubmitting(true);
        router.post(`/lapangan/issues/${showTransferModal.id}/transfer`, {
            to_department: transferTargetDept,
            reason: transferReason.trim(),
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setShowTransferModal(null);
                setTransferTargetDept('');
                setTransferReason('');
                setIsSubmitting(false);
                showNotice('success', isEn
                    ? `Issue successfully transferred to ${transferTargetDept}.`
                    : `Isu berhasil dialihkan ke departemen ${transferTargetDept}.`);
            },
            onError: (errors) => {
                setIsSubmitting(false);
                showNotice('error', extractErrorMsg(errors, isEn ? 'Failed to transfer department.' : 'Gagal mengalihkan departemen.'));
            },
        });
    };

    // Trigger Soft Delete Issue
    const handleDeleteConfirm = () => {
        if (!issueToDelete) return;
        setIsDeleting(true);
        router.delete(`/lapangan/issues/${issueToDelete.id}`, {
            preserveScroll: true,
            onSuccess: () => {
                setIssueToDelete(null);
                setIsDeleting(false);
                if (selectedDetailIssue?.id === issueToDelete.id) {
                    setSelectedDetailIssue(null);
                }
                showNotice('success', isEn
                    ? 'Ticket removed from dashboard.'
                    : 'Tiket berhasil dihapus dari dashboard.');
            },
            onError: (errors) => {
                setIsDeleting(false);
                showNotice('error', extractErrorMsg(errors, isEn
                    ? 'Failed to delete ticket. Please verify department permissions.'
                    : 'Gagal menghapus tiket. Pastikan Anda memiliki izin departemen yang sesuai.'));
            },
        });
    };

    // --- Filter & Sort Issues based on Status Checklist, Department, Live Search & Sort Mode ---
    const filteredIssues = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const urgencyWeight = {
            'Darurat': 4,
            'Tinggi': 3,
            'Sedang': 2,
            'Rendah': 1,
        };

        const result = issues.filter((item) => {
            // Month tab switcher filter (12 tab bulanan Google Sheet)
            if (selectedMonthFilter !== 'all') {
                if (!item.created_at) return false;
                const d = new Date(item.created_at);
                if (isNaN(d.getTime())) return false;
                if (d.getMonth() + 1 !== parseInt(selectedMonthFilter, 10)) {
                    return false;
                }
            }

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

        // 4. Sort Cepat Multi-Criteria
        return result.sort((a, b) => {
            if (sortBy === 'newest') {
                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            }

            if (sortBy === 'oldest') {
                return new Date(a.created_at || 0) - new Date(b.created_at || 0);
            }

            if (sortBy === 'eta_urgent') {
                const aIsResolved = a.status === 'resolved';
                const bIsResolved = b.status === 'resolved';
                if (aIsResolved !== bIsResolved) {
                    return aIsResolved ? 1 : -1;
                }

                const aEta = parseEtaTimestampMs(a.estimated_completion_at);
                const bEta = parseEtaTimestampMs(b.estimated_completion_at);

                if (aEta !== null && bEta !== null) {
                    if (aEta !== bEta) return aEta - bEta;
                } else if (aEta !== null || bEta !== null) {
                    return aEta !== null ? -1 : 1;
                }

                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            }

            if (sortBy === 'waiting_acc') {
                // Priority: tiket yang belum ACC dari semua departemen atau belum resolved
                const aIsResolved = a.status === 'resolved';
                const bIsResolved = b.status === 'resolved';
                if (aIsResolved !== bIsResolved) {
                    return aIsResolved ? 1 : -1; // belum selesai di atas
                }

                const aAccs = a.department_accs || {};
                const bAccs = b.department_accs || {};
                const aTargets = a.target_departments || [];
                const bTargets = b.target_departments || [];

                const aPendingAcc = aTargets.some((d) => !aAccs[d]?.is_acc);
                const bPendingAcc = bTargets.some((d) => !bAccs[d]?.is_acc);

                if (aPendingAcc !== bPendingAcc) {
                    return aPendingAcc ? -1 : 1; // yang menunggu ACC di atas
                }

                // Tie-breaker: newest first
                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            }

            // Default: 'status' (Prioritas Status Terbuka / Sedang Dikerjakan)
            // Urutan: Open (4) > Pending (3) > In Progress (2) > Resolved (1)
            const statusWeight = { open: 4, pending: 3, in_progress: 2, resolved: 1 };
            const weightA = statusWeight[a.status] || 0;
            const weightB = statusWeight[b.status] || 0;

            if (weightB !== weightA) {
                return weightB - weightA;
            }

            // Secondary: Non-resolved issues before resolved issues
            const aIsResolved = a.status === 'resolved';
            const bIsResolved = b.status === 'resolved';
            if (aIsResolved !== bIsResolved) {
                return aIsResolved ? 1 : -1;
            }

            // Tie-breaker: newest first
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
    }, [issues, selectedMonthFilter, selectedStatuses, selectedDeptFilter, searchQuery, sortBy]);

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

    const formatDeptDisplay = (dept) => {
        if (!dept) return dept;
        if (isEn && (dept === 'Umum' || dept === 'Lainnya')) return 'General';
        return dept;
    };

    const formatMainLocDisplay = (loc) => {
        if (isEn && loc === 'Kantor') return 'Office';
        return loc;
    };

    const getEtaChipClasses = (badge) => {
        if (!badge) return '';
        if (badge.state === 'overdue') {
            return isDark
                ? 'bg-rose-950/75 text-rose-300 border-rose-500/50'
                : 'bg-rose-50 text-rose-700 border-rose-300';
        }
        if (badge.state === 'due_soon') {
            return isDark
                ? 'bg-amber-950/75 text-amber-300 border-amber-500/50'
                : 'bg-amber-50 text-amber-800 border-amber-300';
        }
        if (badge.state === 'on_time') {
            return isDark
                ? 'bg-emerald-950/75 text-emerald-300 border-emerald-600/40'
                : 'bg-emerald-50 text-emerald-700 border-emerald-300';
        }
        if (badge.state === 'late_resolved') {
            return isDark
                ? 'bg-amber-950/75 text-amber-300 border-amber-600/40'
                : 'bg-amber-50 text-amber-800 border-amber-300';
        }
        return isDark
            ? 'bg-sky-950/70 text-sky-300 border-sky-600/40'
            : 'bg-sky-50 text-sky-700 border-sky-200';
    };

    return (
        <div className={`lean-root ${isDark ? 'lean-theme-dark text-slate-100' : 'lean-theme-light text-slate-800'} flex flex-col font-sans pb-24 md:pb-12 transition-colors duration-300 w-full max-w-full overflow-x-clip min-h-screen`}>
            <Head title="Dashboard — Telunas Issue Tracker" />
            <LeanHeader
                activePage="dashboard"
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                currentUser={currentUser}
                outboxProps={{
                    outboxCount,
                    isOnline,
                    onOpenOutbox: async () => {
                        const tickets = await getOutboxTickets();
                        setOutboxTickets(tickets);
                        setShowOutboxModal(true);
                    },
                }}
            />

            {/* MAIN CONTENT CONTAINER */}
            <main className="w-full px-4 sm:px-6 lg:px-8 pt-4 flex-1">

                {/* OUTBOX BANNER: TICKETS QUEUED IN PHONE STORAGE */}
                {outboxCount > 0 && (
                    <div className={`mb-4 p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-md transition-all ${
                        isDark
                            ? 'bg-gradient-to-r from-amber-950/70 via-slate-900/90 to-amber-950/50 border-amber-500/60 text-amber-200'
                            : 'bg-amber-50/95 border-amber-300 text-amber-950 shadow-sm'
                    }`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                                <CloudUpload className="w-4 h-4 animate-bounce" />
                            </div>
                            <div className="min-w-0">
                                <p className="font-bold text-xs truncate">
                                    {isEn
                                        ? `${outboxCount} Report(s) Saved on Device (Offline Outbox)`
                                        : `Ada ${outboxCount} Laporan Tersimpan di HP (Offline Outbox)`}
                                </p>
                                <p className={`text-[11px] mt-0.5 leading-relaxed truncate ${isDark ? 'text-amber-300/80' : 'text-amber-800'}`}>
                                    {isOnline
                                        ? (isEn ? 'Signal restored! Tickets are ready to sync to the Cloud server & Google Sheets.' : 'Sinyal pulih! Tiket siap disinkronkan ke server Cloud & Google Sheets.')
                                        : (isEn ? 'Device is currently offline (0 bars). Tickets are safely stored on your device.' : 'Perangkat sedang offline (0 bar). Tiket tersimpan aman di memori HP.')}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                            <button
                                type="button"
                                onClick={handleManualSync}
                                disabled={!isOnline || isSyncingOutbox}
                                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                                {isSyncingOutbox ? (
                                    <>
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        <span>{isEn ? 'Sending...' : 'Mengirim...'}</span>
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-3.5 h-3.5" />
                                        <span>{isEn ? 'Send Now' : 'Kirim Sekarang'}</span>
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    const tickets = await getOutboxTickets();
                                    setOutboxTickets(tickets);
                                    setShowOutboxModal(true);
                                }}
                                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors ${
                                    isDark
                                        ? 'border-amber-600/50 hover:bg-amber-900/40 text-amber-300'
                                        : 'border-amber-300 hover:bg-amber-100 text-amber-900'
                                }`}
                                title={isEn ? 'Open queue list' : 'Buka daftar antrean'}
                            >
                                <Eye className="w-3.5 h-3.5" />
                                <span>{isEn ? 'Details' : 'Detail'}</span>
                            </button>
                        </div>
                    </div>
                )}


                {/* ERP CONTROLS BAR: SEARCH, DEPT, SORT, VIEW MODE, STATUS CHECKLIST */}
                {viewMode !== 'analytics' && (
                    <>
                        <div className="space-y-2.5 mb-3">
                    {/* Row 1: Search Bar Full Width */}
                    <div className="relative w-full">
                        <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={isEn ? 'Search ID, title, reporter, location...' : 'Cari ID, judul, pelapor, lokasi...'}
                            className={`w-full text-xs rounded-xl pl-8 pr-7 py-2.5 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 shadow-sm transition-all border ${
                                isDark
                                    ? 'bg-slate-800/90 border-slate-700 text-slate-200 placeholder-slate-500'
                                    : 'bg-white/95 border-slate-300 text-slate-900 placeholder-slate-400 shadow-xs'
                            }`}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}
                                title={isEn ? 'Clear search' : 'Hapus pencarian'}
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Row 2: Balanced Grid on Mobile for Month, Dept & Sort, Flex on Desktop */}
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                        {/* Month Tab Switcher (12 Tab Bulanan Google Sheet) */}
                        <div className="w-full sm:w-auto">
                            <select
                                value={selectedMonthFilter}
                                onChange={(e) => setSelectedMonthFilter(e.target.value)}
                                className={`w-full sm:w-auto text-xs font-semibold rounded-xl px-3 py-2 focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-sm border truncate ${
                                    isDark
                                        ? 'bg-slate-800/90 border-slate-700 text-slate-200'
                                        : 'bg-white/95 border-slate-300 text-slate-800 shadow-xs'
                                }`}
                                title={isEn ? 'Select Month Tab (12 Monthly Tabs)' : 'Pilih Tab Bulan (12 Tab Bulanan)'}
                            >
                                <option value="all">{isEn ? '📅 All Months (All Tabs)' : '📅 Semua Bulan (Semua Tab)'}</option>
                                <option value="1">{isEn ? 'January' : 'Januari'}</option>
                                <option value="2">{isEn ? 'February' : 'Februari'}</option>
                                <option value="3">{isEn ? 'March' : 'Maret'}</option>
                                <option value="4">April</option>
                                <option value="5">{isEn ? 'May' : 'Mei'}</option>
                                <option value="6">{isEn ? 'June' : 'Juni'}</option>
                                <option value="7">{isEn ? 'July' : 'Juli'}</option>
                                <option value="8">{isEn ? 'August' : 'Agustus'}</option>
                                <option value="9">September</option>
                                <option value="10">{isEn ? 'October' : 'Oktober'}</option>
                                <option value="11">November</option>
                                <option value="12">{isEn ? 'December' : 'Desember'}</option>
                            </select>
                        </div>

                        {/* Department Filter */}
                        <div className="w-full sm:w-auto">
                            <select
                                value={selectedDeptFilter}
                                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                                className={`w-full sm:w-auto text-xs font-semibold rounded-xl px-3 py-2 focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-sm border truncate ${
                                    isDark
                                        ? 'bg-slate-800/90 border-slate-700 text-slate-200'
                                        : 'bg-white/95 border-slate-300 text-slate-800 shadow-xs'
                                }`}
                            >
                                <option value="all">{isEn ? 'All Depts (All)' : 'Semua Dept (All)'}</option>
                                {departments.map((dept) => (
                                    <option key={dept} value={dept}>{formatDeptDisplay(dept)}</option>
                                ))}
                            </select>
                        </div>

                        {/* Sort Cepat Control */}
                        <div className="w-full sm:w-auto relative flex items-center">
                            <ArrowUpDown className="w-3.5 h-3.5 text-emerald-500 absolute left-2.5 sm:left-3 pointer-events-none" />
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className={`w-full sm:w-auto text-xs font-semibold rounded-xl pl-7 sm:pl-8 pr-3 py-2 focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-sm border truncate ${
                                    isDark
                                        ? 'bg-slate-800/90 border-slate-700 text-slate-200 hover:border-slate-600'
                                        : 'bg-white/95 border-slate-300 text-slate-800 shadow-xs hover:border-slate-400'
                                }`}
                                title={isEn ? 'Quickly sort ticket list' : 'Urutkan daftar tiket secara cepat'}
                            >
                                <option value="newest">{isEn ? '🕒 Newest' : '🕒 Terbaru'}</option>
                                <option value="oldest">{isEn ? '⏳ Oldest' : '⏳ Terlama'}</option>
                                <option value="status">{isEn ? '📊 Progress Status' : '📊 Status Progres'}</option>
                                <option value="eta_urgent">{isEn ? '⏰ Urgent / Overdue ETA' : '⏰ Target Selesai Terdekat'}</option>
                                <option value="waiting_acc">{isEn ? '🚨 Awaiting ACC' : '🚨 Menunggu ACC'}</option>
                            </select>
                        </div>

                        {/* Actions group: Mobile View Switcher, Desktop New Report & Column Customizer */}
                        <div className="w-full md:w-auto col-span-2 md:col-span-1 md:ml-auto flex items-center justify-between md:justify-end gap-2">
                            {/* Compact Mobile Card / ERP Table Switcher */}
                            <div
                                className={`inline-flex md:hidden items-center p-0.5 rounded-xl border shadow-xs ${
                                    isDark
                                        ? 'bg-slate-900/90 border-slate-700'
                                        : 'bg-slate-100 border-slate-200'
                                }`}
                                role="group"
                                aria-label={isEn ? 'Switch list view' : 'Ubah tampilan daftar'}
                            >
                                <button
                                    type="button"
                                    onClick={() => handleViewModeChange('cards')}
                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                        viewMode === 'cards'
                                            ? 'bg-emerald-600 text-white keep-white shadow-xs'
                                            : isDark
                                            ? 'text-slate-400 hover:text-slate-200'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                                    <span>{isEn ? 'Cards' : 'Kartu'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleViewModeChange('table')}
                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                        viewMode === 'table'
                                            ? 'bg-emerald-600 text-white keep-white shadow-xs'
                                            : isDark
                                            ? 'text-slate-400 hover:text-slate-200'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    <Table className="w-3.5 h-3.5 shrink-0" />
                                    <span>{isEn ? 'Table' : 'Tabel'}</span>
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowReportModal(true)}
                                className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white keep-white font-bold text-xs rounded-xl shadow-md hover:shadow-emerald-600/30 transition-all cursor-pointer shrink-0"
                                title={isEn ? 'Report New Issue' : 'Laporkan Masalah Baru'}
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>{isEn ? 'New Report' : 'Lapor Baru'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowColumnModal(true)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm border ${
                                    isDark
                                        ? 'bg-slate-800/90 hover:bg-slate-700 border-slate-700 hover:border-emerald-500/50 text-slate-200'
                                        : 'bg-white/95 hover:bg-slate-50 border-slate-300 hover:border-slate-400 text-slate-800 shadow-xs'
                                }`}
                                title={isEn ? 'Choose which data/columns to display' : 'Pilih data/kolom apa saja yang ingin ditampilkan'}
                            >
                                <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-500" />
                                <span>{isEn ? 'Columns' : 'Tampilan'}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                                    isDark
                                        ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60'
                                        : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                }`}>
                                    {activeColumnCount}/{columnDefs.length}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Row 3: MULTI-SELECT STATUS CHECKLIST PILLS & PRESETS */}
                <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4 p-2 sm:p-2.5 rounded-xl border backdrop-blur-md transition-all ${
                    isDark ? 'bg-slate-800/60 border-slate-800' : 'bg-white/80 border-slate-200/90 shadow-xs'
                }`}>
                    {/* Status Checklist Pills: 4-Column Grid on Mobile (Non-scrollable, fits 100% width), Flex on Desktop */}
                    <div className="grid grid-cols-4 gap-1 sm:flex sm:items-center sm:gap-1.5 w-full sm:w-auto">
                        {/* Open Checkbox Pill */}
                        <button
                            type="button"
                            onClick={() => toggleStatus('open')}
                            className={`flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-1 py-1.5 sm:px-2.5 sm:py-1 rounded-lg font-semibold text-[11px] sm:text-xs transition-all border ${
                                selectedStatuses.open
                                    ? isDark
                                        ? 'bg-rose-950/80 border-rose-500/60 text-rose-300 shadow-sm'
                                        : 'bg-rose-50 border-rose-300 text-rose-800 shadow-xs'
                                    : isDark
                                    ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400'
                                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
                            }`}
                        >
                            <span className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded flex items-center justify-center text-[9px] sm:text-[10px] border shrink-0 ${
                                selectedStatuses.open ? 'bg-rose-500 border-rose-400 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                            }`}>
                                {selectedStatuses.open && '✓'}
                            </span>
                            <span className="truncate">Open</span>
                            <span className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                                isDark ? 'bg-slate-900/80 text-white' : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}>
                                {counts.open}
                            </span>
                        </button>

                        {/* Progress Checkbox Pill */}
                        <button
                            type="button"
                            onClick={() => toggleStatus('in_progress')}
                            className={`flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-1 py-1.5 sm:px-2.5 sm:py-1 rounded-lg font-semibold text-[11px] sm:text-xs transition-all border ${
                                selectedStatuses.in_progress
                                    ? isDark
                                        ? 'bg-amber-950/80 border-amber-500/60 text-amber-300 shadow-sm'
                                        : 'bg-amber-50 border-amber-300 text-amber-800 shadow-xs'
                                    : isDark
                                    ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400'
                                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
                            }`}
                        >
                            <span className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded flex items-center justify-center text-[9px] sm:text-[10px] border shrink-0 ${
                                selectedStatuses.in_progress ? 'bg-amber-500 border-amber-400 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                            }`}>
                                {selectedStatuses.in_progress && '✓'}
                            </span>
                            <span className="truncate hidden xs:inline">{isEn ? 'In Progress' : 'Progress'}</span>
                            <span className="truncate xs:hidden">Prog</span>
                            <span className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                                isDark ? 'bg-slate-900/80 text-white' : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                                {counts.inProgress}
                            </span>
                        </button>

                        {/* Pending / Tertunda Checkbox Pill */}
                        <button
                            type="button"
                            onClick={() => toggleStatus('pending')}
                            className={`flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-1 py-1.5 sm:px-2.5 sm:py-1 rounded-lg font-semibold text-[11px] sm:text-xs transition-all border ${
                                selectedStatuses.pending
                                    ? isDark
                                        ? 'bg-orange-950/80 border-orange-500/60 text-orange-300 shadow-sm'
                                        : 'bg-orange-50 border-orange-300 text-orange-800 shadow-xs'
                                    : isDark
                                    ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400'
                                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
                            }`}
                        >
                            <span className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded flex items-center justify-center text-[9px] sm:text-[10px] border shrink-0 ${
                                selectedStatuses.pending ? 'bg-orange-500 border-orange-400 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                            }`}>
                                {selectedStatuses.pending && '✓'}
                            </span>
                            <span className="truncate hidden xs:inline">{isEn ? 'Pending' : 'Tertunda'}</span>
                            <span className="truncate xs:hidden">{isEn ? 'Hold' : 'Tunda'}</span>
                            <span className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                                isDark ? 'bg-slate-900/80 text-white' : 'bg-orange-100 text-orange-800 border border-orange-200'
                            }`}>
                                {counts.pending}
                            </span>
                        </button>

                        {/* Resolved / Selesai Checkbox Pill */}
                        <button
                            type="button"
                            onClick={() => toggleStatus('resolved')}
                            className={`flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-1 py-1.5 sm:px-2.5 sm:py-1 rounded-lg font-semibold text-[11px] sm:text-xs transition-all border ${
                                selectedStatuses.resolved
                                    ? isDark
                                        ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-sm'
                                        : 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs'
                                    : isDark
                                    ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400'
                                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
                            }`}
                        >
                            <span className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded flex items-center justify-center text-[9px] sm:text-[10px] border shrink-0 ${
                                selectedStatuses.resolved ? 'bg-emerald-500 border-emerald-400 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                            }`}>
                                {selectedStatuses.resolved && '✓'}
                            </span>
                            <span className="truncate">{isEn ? 'Resolved' : 'Selesai'}</span>
                            <span className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                                isDark ? 'bg-slate-900/80 text-white' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}>
                                {counts.resolved}
                            </span>
                        </button>
                    </div>

                    {/* Quick Presets: 3-column grid on mobile, inline on desktop */}
                    <div className="grid grid-cols-3 sm:flex items-center gap-1.5 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-slate-700/40 sm:border-transparent w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={() => setStatusPreset('all')}
                            className={`px-2 py-1 sm:py-0.5 rounded-md border text-center text-[11px] sm:text-xs font-medium transition-all ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                                    : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-300 shadow-xs'
                            }`}
                        >
                            {isEn ? 'All' : 'Semua'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusPreset('active')}
                            className={`px-2 py-1 sm:py-0.5 rounded-md border text-center text-[11px] sm:text-xs font-semibold transition-all ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border-slate-700'
                                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 shadow-xs'
                            }`}
                        >
                            {isEn ? 'Active Issues' : 'Isu Aktif'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusPreset('resolved')}
                            className={`px-2 py-1 sm:py-0.5 rounded-md border text-center text-[11px] sm:text-xs font-semibold transition-all ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-emerald-200 border-slate-700'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 shadow-xs'
                            }`}
                        >
                            {isEn ? 'Resolved Only' : 'Selesai Saja'}
                        </button>
                    </div>
                </div>
                    </>
                )}

                {/* DATA PRESENTATION: ANALYTICS VIEW OR EMPTY STATE OR ERP TABLE / CARDS */}
                {viewMode === 'analytics' ? (
                    <LeanAnalyticsView
                        issues={issues}
                        departments={departments}
                        theme={theme}
                        activeTab={activeAnalyticsTab}
                        onTabChange={setActiveAnalyticsTab}
                        onSelectIssue={setSelectedDetailIssue}
                        focusMapRequest={focusMapRequest}
                        spreadsheetUrl={spreadsheetUrl}
                        monthGids={monthGids}
                    />
                ) : filteredIssues.length === 0 ? (
                    <div className="py-16 text-center border-2 border-dashed border-slate-800 rounded-2xl p-6">
                        <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-3">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-300">
                            {isEn ? 'No issues found' : 'Tidak ada masalah ditemukan'}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                            {searchQuery
                                ? (isEn ? `No issues matched the keyword "${searchQuery}".` : `Tidak ditemukan isu yang cocok dengan kata kunci "${searchQuery}".`)
                                : selectedDeptFilter !== 'all'
                                ? (isEn ? `No issues found for ${formatDeptDisplay(selectedDeptFilter)} department.` : `Tidak ada masalah untuk departemen ${selectedDeptFilter}.`)
                                : (isEn ? 'No issues in the list yet.' : 'Belum ada masalah di dalam daftar.')}
                        </p>
                        <div className="mt-4 flex items-center justify-center gap-2">
                            {searchQuery ? (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                                >
                                    {isEn ? 'Reset Search' : 'Reset Pencarian'}
                                </button>
                            ) : (
                                <p className="text-[11px] text-slate-500 italic">
                                    {isEn
                                        ? 'New issue reporting is centrally managed via the WhatsApp Bot.'
                                        : 'Pelaporan isu baru dilakukan secara terpusat melalui WhatsApp Bot.'}
                                </p>
                            )}
                        </div>
                    </div>
                ) : viewMode === 'table' ? (
                    /* --- VIEW 1: ERP SPREADSHEET TABLE --- */
                    <div className={`rounded-2xl overflow-hidden border shadow-xl transition-all ${
                        isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200 shadow-sm'
                    }`}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-[11px] border-collapse">
                                <thead>
                                    <tr className={`font-bold border-b uppercase tracking-wider text-[10px] ${
                                        isDark ? 'bg-slate-900/90 text-slate-300 border-slate-700/80' : 'bg-slate-100 text-slate-700 border-slate-200'
                                    }`}>
                                        {visibleColumns.id && <th className="py-2.5 px-2 whitespace-nowrap">{isEn ? 'Issue ID' : 'ID Isu'}</th>}
                                        {visibleColumns.photo && <th className="py-2.5 px-1 text-center whitespace-nowrap">{isEn ? 'Photo' : 'Foto'}</th>}
                                        {visibleColumns.title && <th className="py-2.5 px-2 min-w-[110px] max-w-[160px]">{isEn ? 'Issue Title' : 'Judul Masalah'}</th>}
                                        {visibleColumns.location && <th className="py-2.5 px-2 whitespace-nowrap">{isEn ? 'Location' : 'Lokasi'}</th>}
                                        {visibleColumns.dept && <th className="py-2.5 px-2 whitespace-nowrap">{isEn ? 'Department' : 'Departemen'}</th>}
                                        {visibleColumns.reporter && <th className="py-2.5 px-2 whitespace-nowrap">{isEn ? 'Reporter' : 'Pelapor'}</th>}
                                        {visibleColumns.desc && <th className="py-2.5 px-2 min-w-[130px] max-w-[180px]">{isEn ? 'Description' : 'Deskripsi'}</th>}
                                        {visibleColumns.status && <th className="py-2.5 px-2 whitespace-nowrap">Status</th>}
                                        {visibleColumns.eta && <th className="py-2.5 px-2 whitespace-nowrap">{isEn ? 'Est. Completion' : 'Target Selesai'}</th>}
                                        {visibleColumns.time && <th className="py-2.5 px-2 whitespace-nowrap">{isEn ? 'Time' : 'Waktu'}</th>}
                                        <th className="py-2.5 px-1.5 text-center whitespace-nowrap">{isEn ? 'Action' : 'Aksi'}</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y font-medium ${
                                    isDark ? 'divide-slate-700/60' : 'divide-slate-200'
                                }`}>
                                    {filteredIssues.map((issue) => {
                                        const accs = issue.department_accs || {};

                                        return (
                                            <tr
                                                key={issue.id}
                                                onClick={() => setSelectedDetailIssue(issue)}
                                                className={`cursor-pointer transition-colors group ${
                                                    isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'
                                                }`}
                                                title={isEn ? 'Click row to view full issue details' : 'Klik baris untuk melihat rincian lengkap isu'}
                                            >
                                                {/* ID ISU */}
                                                {visibleColumns.id && (
                                                    <td className={`py-2 px-2 font-mono font-bold whitespace-nowrap text-[11px] ${
                                                        isDark ? 'text-amber-300' : 'text-amber-700'
                                                    }`}>
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
                                                                className={`w-8 h-8 rounded-md overflow-hidden border inline-block transition-all hover:scale-105 ${
                                                                    isDark ? 'border-slate-700 hover:border-emerald-500' : 'border-slate-300 hover:border-emerald-500'
                                                                }`}
                                                                title={isEn ? 'Click to view photo' : 'Klik untuk lihat foto'}
                                                            >
                                                                <img src={issue.image_url} alt="" className="w-full h-full object-cover" />
                                                            </button>
                                                        ) : (
                                                            <span className="text-slate-400 text-[10px] italic">-</span>
                                                        )}
                                                    </td>
                                                )}

                                                {/* JUDUL MASALAH */}
                                                {visibleColumns.title && (
                                                    <td className={`py-2 px-2 font-semibold leading-snug max-w-[160px] truncate ${
                                                        isDark ? 'text-white' : 'text-slate-900'
                                                    }`} title={issue.title}>
                                                        {issue.title}
                                                    </td>
                                                )}

                                                {/* LOKASI */}
                                                {visibleColumns.location && (
                                                    <td className="py-2 px-2 whitespace-nowrap">
                                                        <span
                                                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold text-[10px] max-w-[170px] truncate border ${
                                                                isDark
                                                                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                                                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                            }`}
                                                            title={issue.location}
                                                        >
                                                            <MapPin className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
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
                                                                                ? isDark
                                                                                    ? 'bg-amber-950/80 border-amber-500 text-amber-200'
                                                                                    : 'bg-amber-100 border-amber-400 text-amber-900'
                                                                                : isThisAcc
                                                                                ? isDark
                                                                                    ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                                                                                    : 'bg-emerald-100 border-emerald-400 text-emerald-800'
                                                                                : isDark
                                                                                ? 'bg-slate-900 border-slate-700 text-slate-300'
                                                                                : 'bg-slate-100 border-slate-300 text-slate-700'
                                                                        }`}
                                                                    >
                                                                        {formatDeptDisplay(dept)} {isWorking ? (isEn ? '🟡 Working' : '🟡 Dikerjakan') : isThisAcc ? '✓' : ''}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>
                                                )}

                                                {/* NAMA PELAPOR */}
                                                {visibleColumns.reporter && (
                                                    <td className="py-2 px-2 whitespace-nowrap">
                                                        <div className={`font-semibold leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                            {issue.reporter_name}
                                                        </div>
                                                        <div className={`text-[9px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                            {issue.reporter_dept ? formatDeptDisplay(issue.reporter_dept) : (isEn ? 'Staff' : 'Staf')}
                                                        </div>
                                                    </td>
                                                )}

                                                {/* DESKRIPSI */}
                                                {visibleColumns.desc && (
                                                    <td className={`py-2 px-2 text-[11px] max-w-[180px] truncate ${
                                                        isDark ? 'text-slate-300' : 'text-slate-600'
                                                    }`} title={issue.description}>
                                                        {issue.description || <span className="text-slate-400 italic">{isEn ? 'No description' : 'Tidak ada keterangan'}</span>}
                                                    </td>
                                                )}

                                                {/* STATUS BADGE */}
                                                {visibleColumns.status && (
                                                    <td className="py-2 px-2 whitespace-nowrap">
                                                        {issue.status === 'open' && (
                                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 border ${
                                                                isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-rose-100 text-rose-800 border-rose-300'
                                                            }`}>
                                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                                Open
                                                            </span>
                                                        )}
                                                        {issue.status === 'in_progress' && (
                                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 border ${
                                                                isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-amber-100 text-amber-800 border-amber-300'
                                                            }`}>
                                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                                {isEn ? 'In Progress' : 'Progress'}
                                                            </span>
                                                        )}
                                                        {issue.status === 'pending' && (
                                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 border ${
                                                                isDark ? 'bg-orange-500/20 text-orange-300 border-orange-500/40' : 'bg-orange-100 text-orange-800 border-orange-300'
                                                            }`}>
                                                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                                {isEn ? 'Pending' : 'Tertunda'}
                                                            </span>
                                                        )}
                                                        {issue.status === 'resolved' && (
                                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 border ${
                                                                isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                            }`}>
                                                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                                                {isEn ? 'Resolved' : 'Selesai'}
                                                            </span>
                                                        )}
                                                    </td>
                                                )}

                                                {/* PERKIRAAN WAKTU SELESAI (ETA) */}
                                                {visibleColumns.eta && (() => {
                                                    const etaBadge = getEtaBadgeInfo(issue, nowMs, isEn);
                                                    return (
                                                        <td className="py-2 px-2 whitespace-nowrap">
                                                            {etaBadge ? (
                                                                <div
                                                                    className={`inline-flex flex-col gap-0.5 px-1.5 py-0.5 rounded border text-[9.5px] leading-tight ${getEtaChipClasses(etaBadge)}`}
                                                                    title={etaBadge.formattedFullTarget}
                                                                >
                                                                    <span className="font-bold flex items-center gap-1">
                                                                        <CalendarClock className="w-2.5 h-2.5 shrink-0" />
                                                                        <span>{etaBadge.formattedTarget}</span>
                                                                    </span>
                                                                    <span className="text-[9px] font-semibold opacity-90">
                                                                        {etaBadge.statusLabel}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-slate-400 text-[10px] italic">—</span>
                                                            )}
                                                        </td>
                                                    );
                                                })()}

                                                {/* WAKTU PELAPORAN */}
                                                {visibleColumns.time && (
                                                    <td className={`py-2 px-2 whitespace-nowrap text-[10px] ${
                                                        isDark ? 'text-slate-400' : 'text-slate-500'
                                                    }`}>
                                                        {formatRelativeTime(issue.created_at, issue.created_at_human)}
                                                    </td>
                                                )}

                                                {/* AKSI HAPUS */}
                                                <td className="py-2 px-1.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                    {canManageIssue(issue) ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setIssueToDelete(issue)}
                                                            className={`p-1 rounded-md border transition ${
                                                                isDark
                                                                    ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30 hover:border-rose-500/60'
                                                                    : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                                                            }`}
                                                            title={isEn ? 'Delete / Hide Ticket' : 'Hapus / Sembunyikan Tiket'}
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-400">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    /* --- VIEW 2: VISUAL CARD VIEW (MODERN RESPONSIVE GRID - OPTION 1 & 2) --- */
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                        {filteredIssues.map((issue) => {
                            const accs = issue.department_accs || {};

                            // Status theme for Option 1 & 2 (Top Accent Bar, Left Stripe, and Subtly Tinted Plates)
                            const statusTheme = {
                                open: {
                                    borderLeft: 'border-l-rose-500 hover:border-l-rose-600',
                                    topBar: 'bg-rose-500',
                                    headerBg: isDark ? 'bg-rose-950/20' : 'bg-rose-50/60',
                                },
                                in_progress: {
                                    borderLeft: 'border-l-sky-500 hover:border-l-sky-600',
                                    topBar: 'bg-sky-500',
                                    headerBg: isDark ? 'bg-sky-950/20' : 'bg-sky-50/60',
                                },
                                pending: {
                                    borderLeft: 'border-l-amber-500 hover:border-l-amber-600',
                                    topBar: 'bg-amber-500',
                                    headerBg: isDark ? 'bg-amber-950/20' : 'bg-amber-50/60',
                                },
                                resolved: {
                                    borderLeft: 'border-l-emerald-500 hover:border-l-emerald-600',
                                    topBar: 'bg-emerald-500',
                                    headerBg: isDark ? 'bg-emerald-950/20' : 'bg-emerald-50/60',
                                },
                            }[issue.status] || {
                                borderLeft: 'border-l-slate-400 hover:border-l-slate-500',
                                topBar: 'bg-slate-400',
                                headerBg: isDark ? 'bg-slate-900/30' : 'bg-slate-50/60',
                            };

                            const isResolved = issue.status === 'resolved';

                            return (
                                <div
                                    key={issue.id}
                                    onClick={() => setSelectedDetailIssue(issue)}
                                    className={`relative rounded-2xl border-2 border-l-[6px] transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden group hover:-translate-y-1.5 ${statusTheme.borderLeft} ${
                                        isDark
                                            ? 'bg-slate-800/95 border-slate-700/90 hover:border-slate-600 shadow-lg hover:shadow-2xl ring-1 ring-white/5'
                                            : 'bg-white border-slate-300/90 hover:border-slate-400 shadow-md hover:shadow-xl ring-1 ring-slate-900/5'
                                    }`}
                                    title={isEn ? 'Click card to view full issue details' : 'Klik kartu untuk melihat rincian lengkap isu'}
                                >
                                    {/* Option 2: Top Status Accent Bar */}
                                    <div className={`h-1.5 w-full shrink-0 ${statusTheme.topBar}`} />

                                    <div>
                                        {/* Option 2: Card Header Plate with Divider */}
                                        <div className={`p-3.5 sm:p-4 border-b transition-colors ${statusTheme.headerBg} ${
                                            isDark ? 'border-slate-700/70' : 'border-slate-200/90'
                                        }`}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {/* ID Isu */}
                                                    {visibleColumns.id && (
                                                        <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-xs border shadow-2xs ${
                                                            isDark ? 'bg-slate-900 border-slate-700 text-amber-300' : 'bg-white border-slate-300 text-slate-800 font-extrabold'
                                                        }`}>
                                                            #{issue.issue_code || ('LEAN-' + issue.id)}
                                                        </span>
                                                    )}

                                                    {/* Status Badge */}
                                                    {visibleColumns.status && (
                                                        <>
                                                            {issue.status === 'open' && (
                                                                <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30 text-[10px] font-bold flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                                    Open
                                                                </span>
                                                            )}
                                                            {issue.status === 'in_progress' && (
                                                                <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30 text-[10px] font-bold flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                                                                    {isEn ? 'In Progress' : 'Progress'}
                                                                </span>
                                                            )}
                                                            {issue.status === 'pending' && (
                                                                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                                    {isEn ? 'Pending' : 'Tertunda'}
                                                                </span>
                                                            )}
                                                            {issue.status === 'resolved' && (
                                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                                                                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                                                    {isEn ? 'Resolved' : 'Selesai'}
                                                                </span>
                                                            )}
                                                        </>
                                                    )}

                                                    {/* Transfer Badge */}
                                                    {issue.transfer_history && issue.transfer_history.length > 0 && (
                                                        <span
                                                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1"
                                                            title={isEn
                                                                ? `Transferred ${issue.transfer_history.length} time(s)`
                                                                : `Dialihkan ${issue.transfer_history.length} kali`}
                                                        >
                                                            <RotateCcw className="w-2.5 h-2.5 text-amber-500" />
                                                            <span>{issue.transfer_history.length}x {isEn ? 'Transferred' : 'Dialihkan'}</span>
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Time & Delete Action */}
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {visibleColumns.time && (
                                                        <span className={`text-[10px] font-semibold flex items-center gap-1 ${
                                                            isDark ? 'text-slate-400' : 'text-slate-500'
                                                        }`}>
                                                            <Clock className="w-3 h-3" />
                                                            {formatRelativeTime(issue.created_at, issue.created_at_human)}
                                                        </span>
                                                    )}
                                                    {canManageIssue(issue) && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setIssueToDelete(issue);
                                                            }}
                                                            className={`opacity-0 group-hover:opacity-100 p-1 rounded-md transition-opacity ${
                                                                isDark
                                                                    ? 'hover:bg-rose-950/80 text-slate-500 hover:text-rose-400 border border-transparent hover:border-rose-800'
                                                                    : 'hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-transparent hover:border-rose-200'
                                                            }`}
                                                            title={isEn ? 'Delete / Hide Ticket' : 'Hapus / Sembunyikan Tiket'}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card Body Content */}
                                        <div className="p-3.5 sm:p-4 space-y-3">
                                            {/* Title & Location Meta */}
                                            <div className="space-y-1.5">
                                                {visibleColumns.title && (
                                                    <h4 className={`font-bold text-sm leading-snug line-clamp-2 group-hover:text-emerald-500 transition-colors ${
                                                        isDark ? 'text-white' : 'text-slate-900'
                                                    }`}>
                                                        {issue.title}
                                                    </h4>
                                                )}

                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {/* Lokasi */}
                                                    {visibleColumns.location && (
                                                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] flex items-center gap-1 border shadow-2xs ${
                                                            isDark
                                                                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
                                                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                        }`}>
                                                            <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                                                            <span className="truncate max-w-[150px]">{issue.location}</span>
                                                        </span>
                                                    )}

                                                    {/* Perkiraan Waktu Selesai (ETA) Badge */}
                                                    {visibleColumns.eta && (() => {
                                                        const etaBadge = getEtaBadgeInfo(issue, nowMs, isEn);
                                                        if (!etaBadge) return null;
                                                        return (
                                                            <span
                                                                className={`px-2 py-0.5 rounded-md font-bold text-[10px] flex items-center gap-1 border shadow-2xs ${getEtaChipClasses(etaBadge)}`}
                                                                title={`${isEn ? 'Est. Completion' : 'Target Selesai'}: ${etaBadge.formattedFullTarget}`}
                                                            >
                                                                <CalendarClock className="w-3 h-3 shrink-0" />
                                                                <span>{etaBadge.formattedTarget}</span>
                                                                <span className="opacity-75">&bull;</span>
                                                                <span>{etaBadge.statusLabel}</span>
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </div>

                                            {/* Description Snippet */}
                                            {visibleColumns.desc && issue.description && (
                                                <p className={`text-xs leading-relaxed line-clamp-2 p-2.5 rounded-lg border text-ellipsis ${
                                                    isDark
                                                        ? 'bg-slate-900/60 text-slate-300 border-slate-700/60'
                                                        : 'bg-slate-50/80 text-slate-600 border-slate-200'
                                                }`}>
                                                    {issue.description}
                                                </p>
                                            )}

                                            {/* Photo Thumbnail Preview (Landscape with View Badge) */}
                                            {visibleColumns.photo && issue.image_url && (
                                                <div className="pt-0.5">
                                                    <div
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setLightboxImage(issue.image_url);
                                                        }}
                                                        className="group/img relative rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700/60 w-full h-32 bg-slate-950/50 block shadow-xs"
                                                    >
                                                        <img
                                                            src={issue.image_url}
                                                            alt={isEn ? 'Issue Evidence' : 'Bukti Masalah'}
                                                            className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex items-end justify-between p-2">
                                                            <span className="text-[10px] text-white keep-white font-medium bg-black/60 px-2 py-0.5 rounded-md backdrop-blur-xs flex items-center gap-1">
                                                                <Eye className="w-3 h-3" /> {isEn ? 'Evidence Photo' : 'Foto Bukti'}
                                                            </span>
                                                            <span className="text-[9px] text-slate-200 keep-white font-medium">{isEn ? 'Click to zoom' : 'Klik perbesar'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Target Departments & ACC Badges */}
                                            {visibleColumns.dept && (
                                                <div className={`pt-2 border-t flex flex-wrap items-center gap-1.5 ${
                                                    isDark ? 'border-slate-700/60' : 'border-slate-200'
                                                }`}>
                                                    <span className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        {isEn ? 'Target:' : 'Tujuan:'}
                                                    </span>
                                                    {(issue.target_departments || []).map((dept) => {
                                                        const isThisDeptClaimed = issue.claimed_by_dept && (
                                                            issue.claimed_by_dept.toLowerCase() === dept.toLowerCase()
                                                        );
                                                        const isThisAcc = accs[dept]?.is_acc || isThisDeptClaimed;
                                                        const isWorking = issue.status === 'in_progress' && isThisDeptClaimed;

                                                        return (
                                                            <div
                                                                key={dept}
                                                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border transition-colors shadow-2xs ${
                                                                    isWorking
                                                                        ? (isDark ? 'bg-amber-950/80 border-amber-500/70 text-amber-200 font-semibold' : 'bg-amber-50 border-amber-300 text-amber-900 font-semibold')
                                                                        : isThisAcc
                                                                        ? (isDark ? 'bg-emerald-950/80 border-emerald-600/70 text-emerald-300 font-semibold' : 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold')
                                                                        : (isDark ? 'bg-slate-900 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600')
                                                                }`}
                                                            >
                                                                {isWorking ? (
                                                                    <>
                                                                        <Clock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                                                                        <span>{formatDeptDisplay(dept)}: {isEn ? 'Working' : 'Dikerjakan'}</span>
                                                                    </>
                                                                ) : isThisAcc ? (
                                                                    <>
                                                                        <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                                                        <span>{formatDeptDisplay(dept)}: ACC</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Clock className="w-2.5 h-2.5 opacity-50 shrink-0" />
                                                                        <span>{formatDeptDisplay(dept)}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Card Footer: Pelapor & Assignee Info with Subtle Tint */}
                                    <div className={`p-3.5 sm:p-4 pt-2.5 border-t flex items-center justify-between gap-2 text-xs transition-colors ${
                                        isDark ? 'bg-slate-900/40 border-slate-700/70' : 'bg-slate-50/70 border-slate-200/90'
                                    }`}>
                                        {/* Pelapor */}
                                        {visibleColumns.reporter ? (
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                                                    isDark ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/60' : 'bg-emerald-100 text-emerald-800'
                                                }`}>
                                                    {(issue.reporter_name || 'U').substring(0, 1).toUpperCase()}
                                                </div>
                                                <span className={`text-[11px] truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                                    <strong className={isDark ? 'text-white' : 'text-slate-900'}>{issue.reporter_name}</strong>
                                                    {issue.reporter_dept && (
                                                        <span className={`text-[10px] ml-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>({formatDeptDisplay(issue.reporter_dept)})</span>
                                                    )}
                                                </span>
                                            </div>
                                        ) : <div />}

                                        {/* Status / Worker Badge */}
                                        <div className="shrink-0 flex items-center gap-1 flex-wrap justify-end">
                                            {issue.status === 'pending' && issue.pending_reason && (
                                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border max-w-[170px] truncate ${
                                                    isDark ? 'bg-orange-950/60 text-orange-300 border-orange-800/50' : 'bg-orange-50 text-orange-800 border-orange-200'
                                                }`} title={`Pending: ${issue.pending_reason}`}>
                                                    ⏳ {issue.pending_reason}
                                                </span>
                                            )}
                                            {((Array.isArray(issue.active_workers) && issue.active_workers.length > 0) || issue.claimed_by_name) && (
                                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border flex items-center gap-1 max-w-[180px] truncate ${
                                                    isDark ? 'bg-amber-950/60 text-amber-300 border-amber-800/40' : 'bg-amber-50 text-amber-800 border-amber-200'
                                                }`} title={`${isEn ? 'Team' : 'Tim'}: ${(issue.active_workers?.length ? issue.active_workers.join(', ') : issue.claimed_by_name)}`}>
                                                    <Users className="w-2.5 h-2.5 shrink-0" />
                                                    <span className="truncate">{issue.active_workers?.length ? issue.active_workers.join(', ') : issue.claimed_by_name}</span>
                                                </span>
                                            )}
                                            {isResolved && (
                                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border flex items-center gap-1 ${
                                                    isDark ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                }`}>
                                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                                    {Array.isArray(issue.contributors) && issue.contributors.length > 0
                                                        ? (isEn ? `Resolved (${issue.contributors.length} Team)` : `Selesai (${issue.contributors.length} Tim)`)
                                                        : (isEn ? 'Resolved' : 'Selesai')}
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

            {/* MODAL 1: REPORT ISSUE MODAL (DISCUSSION-VERIFIED WORKFLOW) */}
            {showReportModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                        {/* Header */}
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
                            <div>
                                <h3 className="font-bold text-base text-white flex items-center gap-1.5">
                                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                                    {isEn ? 'Log Field Discussion' : 'Catat Hasil Diskusi Lapangan'}
                                </h3>
                                <p className="text-xs text-slate-400">
                                    {isEn
                                        ? 'Direct verbal verification → Automatic system entry'
                                        : 'Verifikasi verbal langsung → Input sistem otomatis'}
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setShowReportModal(false);
                                    setShowStaffDropdown(false);
                                }}
                                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Form Body */}
                        <form onSubmit={handleReportSubmit} className="p-4 overflow-y-auto space-y-4 flex-1">
                            {/* IDENTITAS PENCATAT (READONLY BADGE) */}
                            <div className="p-3 rounded-xl bg-slate-800/80 border border-emerald-500/30 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                                        <ShieldCheck className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                                            {isEn ? 'Responsible Department' : 'Departemen Penanggung Jawab'}
                                        </div>
                                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                            <span>{formatDeptDisplay(myDept)}</span>
                                            <span className="text-slate-500">&bull;</span>
                                            <span className="text-slate-300 font-normal">{myName}</span>
                                        </div>
                                    </div>
                                </div>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                                    {isEn ? 'Official Recorder' : 'Pencatat Resmi'}
                                </span>
                            </div>

                            {/* 1. STAF PELAPOR (YANG DATANG BERDISKUSI) DENGAN AUTOCOMPLETE */}
                            <div className="relative">
                                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                                    <span className="flex items-center gap-1">
                                        <User className="w-3.5 h-3.5 text-indigo-400" />
                                        {isEn ? '1. Reporting Staff *' : '1. Staf yang Datang Melapor *'}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-normal">
                                        {isEn ? 'Search / type staff name' : 'Cari / ketik nama staf'}
                                    </span>
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={staffSearchQuery}
                                        onChange={(e) => {
                                            setStaffSearchQuery(e.target.value);
                                            setStaffReporterName(e.target.value);
                                            setShowStaffDropdown(true);
                                        }}
                                        onFocus={() => setShowStaffDropdown(true)}
                                        placeholder={isEn ? 'Type staff name (e.g., Budi / Siti / Hendra)...' : 'Ketik nama staf (contoh: Budi / Siti / Hendra)...'}
                                        className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                                        required
                                    />
                                    {staffSearchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setStaffSearchQuery('');
                                                setStaffReporterName('');
                                                setStaffReporterPhone('');
                                                setShowStaffDropdown(false);
                                            }}
                                            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                {/* Autocomplete dropdown */}
                                {showStaffDropdown && filteredStaff.length > 0 && (
                                    <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-30 max-h-48 overflow-y-auto divide-y divide-slate-700/60">
                                        {filteredStaff.map((staff, idx) => (
                                            <button
                                                type="button"
                                                key={idx}
                                                onClick={() => handleSelectStaff(staff)}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-700 flex items-center justify-between transition-colors"
                                            >
                                                <div>
                                                    <p className="font-semibold text-white">{staff.name}</p>
                                                    <p className="text-[10px] text-slate-400">
                                                        {staff.department ? `${formatDeptDisplay(staff.department)} ` : ''}
                                                        {staff.subdivision ? `(${staff.subdivision})` : ''}
                                                    </p>
                                                </div>
                                                {staff.phone && (
                                                    <span className="text-[10px] text-emerald-400 font-mono">
                                                        {staff.phone}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* WhatsApp Phone input */}
                                <div className="mt-2">
                                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                                        {isEn ? 'Reporter WhatsApp Number (For automatic status notifications):' : 'No. WhatsApp Staf Pelapor (Untuk notifikasi status otomatis):'}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="tel"
                                            value={staffReporterPhone}
                                            onChange={(e) => setStaffReporterPhone(e.target.value)}
                                            placeholder={isEn ? 'Example: 08123456789 or 628...' : 'Contoh: 08123456789 atau 628...'}
                                            className="w-full text-xs bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                        {isEn
                                            ? 'WA Bot will send ticket confirmation, progress/pending/transfer updates, and resolution notices to this number.'
                                            : 'Bot WA akan mengirimkan konfirmasi tiket, update progress/pending/pengalihan, hingga info selesai ke nomor ini.'}
                                    </p>
                                </div>
                            </div>

                            {/* 2. LOKASI (TBR, TPI, Kantor + Detail) */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                                    {isEn ? '2. Issue Location *' : '2. Lokasi Masalah *'}
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
                                            {formatMainLocDisplay(loc)}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    value={formDetailLoc}
                                    onChange={(e) => setFormDetailLoc(e.target.value)}
                                    placeholder={isEn ? 'Specific detail (e.g., Villa 05 / Jetty / Room 12)' : 'Detail spesifik (contoh: Villa 05 / Jetty / Kamar 12)'}
                                    className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            {/* 3. ISU / JUDUL */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                    {isEn ? '3. Issue / Title *' : '3. Isu / Masalah *'}
                                </label>
                                <input
                                    type="text"
                                    value={formTitle}
                                    onChange={(e) => setFormTitle(e.target.value)}
                                    placeholder={isEn ? 'Example: Leaking sink pipe / AC not cooling' : 'Contoh: Pipa wastafel bocor / AC tidak dingin'}
                                    className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                    required
                                />
                            </div>

                            {/* 4. DESKRIPSI ISU */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1">
                                    {isEn ? '4. Issue Description (Discussion Details)' : '4. Deskripsi Isu (Rincian Hasil Diskusi)'}
                                </label>
                                <textarea
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    placeholder={isEn ? 'Explain details discussed (e.g., Water dripping heavily under the sink cabinet)' : 'Jelaskan detail yang dibahas (contoh: Air menetes deras ke lantai kolong wastafel)'}
                                    rows={2}
                                    className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            {/* 5. FOTO BUKTI */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                                    <Camera className="w-3.5 h-3.5 text-emerald-400" />
                                    {isEn ? '5. Photo Proof (Phone Camera / Gallery)' : '5. Foto Bukti (Kamera HP / Galeri)'}
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
                                        <span className="text-xs font-semibold text-slate-300">
                                            {isEn ? 'Take Photo / Choose File' : 'Ambil Foto / Pilih File'}
                                        </span>
                                        <span className="text-[10px] text-slate-500 mt-0.5">
                                            {isEn ? 'Supports phone camera directly' : 'Bisa langsung pakai kamera HP'}
                                        </span>
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

                            {/* 6. TOGGLE LANGSUNG DIKERJAKAN (IN PROGRESS) & PENUGASAN MULTI-TEKNISI */}
                            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 hover:border-slate-600 transition-colors space-y-3">
                                <label className="flex items-start gap-3 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={startInProgress}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            setStartInProgress(checked);
                                            if (checked && assignedWorkers.length === 0 && myName) {
                                                setAssignedWorkers([myName]);
                                            }
                                        }}
                                        className="w-4 h-4 mt-0.5 rounded text-amber-500 bg-slate-700 border-slate-600 focus:ring-amber-500 cursor-pointer"
                                    />
                                    <div>
                                        <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                                            {isEn ? '⚡ Start Working Immediately (In Progress)' : '⚡ Langsung Dikerjakan Sekarang (In Progress)'}
                                        </span>
                                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                                            {isEn
                                                ? 'Check this if your department is starting the repair right away without waiting in the Open queue.'
                                                : 'Centang jika departemen Anda langsung mengeksekusi perbaikan tanpa menunggu antrean Open.'}
                                        </p>
                                    </div>
                                </label>

                                {startInProgress && (
                                    <div className="pt-2 border-t border-slate-700/80 space-y-2">
                                        <label className="block text-[11px] font-bold text-slate-300">
                                            {isEn ? 'Assigned / Handled by whom? (Select one or more):' : 'Ditugaskan / Dikerjakan oleh siapa? (Pilih satu atau lebih):'}
                                        </label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {myDeptTeammates.map((workerName) => {
                                                const isAssigned = assignedWorkers.includes(workerName);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={workerName}
                                                        onClick={() => toggleAssignedWorker(workerName)}
                                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer ${
                                                            isAssigned
                                                                ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                                                                : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:text-slate-200'
                                                        }`}
                                                    >
                                                        <span>{workerName}</span>
                                                        {isAssigned && <Check className="w-3 h-3 text-white shrink-0" />}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Input nama teknisi tambahan jika belum ada di list */}
                                        <div className="flex items-center gap-2 pt-1">
                                            <input
                                                type="text"
                                                value={customWorkerInput}
                                                onChange={(e) => setCustomWorkerInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleAddCustomWorker();
                                                    }
                                                }}
                                                placeholder={isEn ? 'Add another technician name...' : 'Tambah nama teknisi lain...'}
                                                className="flex-1 text-xs bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddCustomWorker}
                                                className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                                            >
                                                {isEn ? '+ Add' : '+ Tambah'}
                                            </button>
                                        </div>

                                        {assignedWorkers.length > 0 && (
                                            <p className="text-[10px] text-amber-300/90 font-medium">
                                                {isEn ? 'Assigned:' : 'Ditugaskan:'} <span className="font-bold text-white">{assignedWorkers.join(', ')}</span>
                                            </p>
                                        )}

                                        <div className="pt-1">
                                            <EtaPickerField
                                                value={formEta}
                                                onChange={setFormEta}
                                                isEn={isEn}
                                                isDark={isDark}
                                                accent="amber"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Offline Notice if connection dropped */}
                            {!isOnline && (
                                <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs flex items-center gap-2">
                                    <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
                                    <span className="text-[11px] leading-tight">
                                        {isEn
                                            ? 'Device is offline (0 bars). Report & photo will be stored locally and auto-uploaded when signal returns.'
                                            : 'Perangkat sedang offline (0 bar). Laporan & foto akan disimpan di memori HP dan otomatis di-upload saat mendapatkan sinyal.'}
                                    </span>
                                </div>
                            )}

                            {/* Submit Button */}
                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className={`w-full py-3 rounded-xl font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer keep-white ${
                                        !isOnline
                                            ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/40'
                                            : startInProgress
                                            ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white shadow-amber-900/40'
                                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
                                    }`}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            <span>{isEn ? 'Saving Report...' : 'Menyimpan Laporan...'}</span>
                                        </>
                                    ) : !isOnline ? (
                                        <>
                                            <HardDrive className="w-4 h-4" />
                                            <span>{isEn ? 'Save to Device Queue (Offline)' : 'Simpan di Antrean HP (Offline)'}</span>
                                        </>
                                    ) : startInProgress ? (
                                        <>
                                            <Send className="w-4 h-4" />
                                            <span>{isEn ? 'Save & Start Working (In Progress)' : 'Simpan & Mulai Kerjakan (In Progress)'}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-4 h-4" />
                                            <span>{isEn ? 'Save & Submit Report' : 'Simpan & Kirim Laporan'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: RESOLVE / TANDAI SELESAI */}
            {showResolveModal && (() => {
                const pool = getWorkersPoolForIssue(showResolveModal);
                const chipMap = new Map();
                [...pool, ...resolveWorkers].forEach((n) => {
                    const key = String(n).toLowerCase().trim();
                    if (key && !chipMap.has(key)) chipMap.set(key, String(n).trim());
                });
                const workerChips = Array.from(chipMap.values());

                return (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="font-bold text-base text-white flex items-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                        {isEn ? 'Mark Issue Resolved' : 'Tandai Masalah Selesai'}
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        #{showResolveModal.issue_code || showResolveModal.id} &bull; {showResolveModal.location} — {showResolveModal.title}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowResolveModal(null)}
                                    className="text-slate-400 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <form onSubmit={handleResolveSubmit} className="space-y-3.5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-200 mb-1">
                                        {isEn ? 'Resolution Description / Notes ' : 'Deskripsi / Catatan Penyelesaian '}
                                        <span className="text-rose-400">{isEn ? '* (Required)' : '* (Wajib)'}</span>
                                    </label>
                                    <textarea
                                        value={resolveNote}
                                        onChange={(e) => setResolveNote(e.target.value)}
                                        placeholder={isEn
                                            ? 'Explain the repair completed (e.g., Pipe seal replaced, tested with no leaks)'
                                            : 'Jelaskan tindakan perbaikan yang dilakukan (Contoh: Pipa telah diganti seal baru, sudah dites tidak bocor)'}
                                        rows={3}
                                        required
                                        className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center gap-1">
                                        <Camera className="w-3.5 h-3.5 text-emerald-400" />
                                        {isEn ? 'Resolution Proof Photo ' : 'Foto Bukti Selesai '}
                                        <span className="text-[10px] font-normal text-slate-400">
                                            {isEn ? '(Optional — please attach whenever possible per SOP)' : '(Opsional — sebisa mungkin dilampirkan sesuai SOP)'}
                                        </span>
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
                                            <span>{isEn ? 'Take Repair Proof Photo (Optional)' : 'Ambil Foto Hasil Perbaikan (Opsional)'}</span>
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

                                {/* Tim Penyelesai / Kontributor Final */}
                                <div className="p-3 rounded-xl bg-slate-800/70 border border-slate-700 space-y-2">
                                    <label className="block text-xs font-bold text-slate-200 flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                                        {isEn ? 'Resolved By / Final Contributors *' : 'Tim yang Menyelesaikan / Berkontribusi Akhir *'}
                                    </label>
                                    {Array.isArray(showResolveModal.contributors) && showResolveModal.contributors.length > 0 && (
                                        <p className="text-[10px] text-emerald-300/80">
                                            {isEn ? 'Previously recorded contributors:' : 'Kontributor tercatat sebelumnya:'}{' '}
                                            <span className="font-semibold">{showResolveModal.contributors.join(', ')}</span>{' '}
                                            {isEn ? '(retained cumulatively for evaluation).' : '(akan tetap terakumulasi untuk evaluasi).'}
                                        </p>
                                    )}
                                    <div className="flex flex-wrap gap-1.5">
                                        {workerChips.map((workerName) => {
                                            const selected = resolveWorkers.some((w) => String(w).toLowerCase().trim() === workerName.toLowerCase());
                                            return (
                                                <button
                                                    type="button"
                                                    key={workerName}
                                                    onClick={() => toggleListWorker(setResolveWorkers, workerName)}
                                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 transition-all cursor-pointer ${
                                                        selected
                                                            ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                                                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                                                    }`}
                                                >
                                                    <span>{workerName}</span>
                                                    {selected && <Check className="w-3 h-3 text-white shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="flex items-center gap-2 pt-1">
                                        <input
                                            type="text"
                                            value={resolveCustomWorker}
                                            onChange={(e) => setResolveCustomWorker(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    addCustomListWorker(resolveCustomWorker, setResolveCustomWorker, resolveWorkers, setResolveWorkers);
                                                }
                                            }}
                                            placeholder={isEn ? 'Add another worker name...' : 'Tambah nama pekerja lain...'}
                                            className="flex-1 text-xs bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => addCustomListWorker(resolveCustomWorker, setResolveCustomWorker, resolveWorkers, setResolveWorkers)}
                                            className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-slate-200 cursor-pointer"
                                        >
                                            {isEn ? '+ Add' : '+ Tambah'}
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-2 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowResolveModal(null)}
                                        className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                                    >
                                        {isEn ? 'Cancel' : 'Batal'}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-md cursor-pointer"
                                    >
                                        {isSubmitting
                                            ? (isEn ? 'Saving...' : 'Menyimpan...')
                                            : (isEn ? 'Confirm Resolved' : 'Konfirmasi Selesai')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })()}

            {/* MODAL 2B: CLAIM / MULAI KERJAKAN */}
            {showClaimModal && (() => {
                const pool = getWorkersPoolForIssue(showClaimModal);
                const chipMap = new Map();
                [...pool, ...claimWorkers].forEach((n) => {
                    const key = String(n).toLowerCase().trim();
                    if (key && !chipMap.has(key)) chipMap.set(key, String(n).trim());
                });
                const workerChips = Array.from(chipMap.values());
                const isResuming = showClaimModal.status === 'pending';

                return (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="font-bold text-base text-white flex items-center gap-1.5">
                                        <Play className={`w-4 h-4 ${isResuming ? 'text-sky-400' : 'text-amber-400'}`} />
                                        {isResuming
                                            ? (isEn ? 'Resume to In Progress' : 'Lanjutkan ke Progress')
                                            : (isEn ? 'Start Working (Claim)' : 'Mulai Kerjakan Isu (Claim)')}
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        #{showClaimModal.issue_code || showClaimModal.id} &bull; {showClaimModal.title}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowClaimModal(null)}
                                    className="text-slate-400 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <form onSubmit={handleClaimSubmit} className="space-y-3.5">
                                <div className="p-3 rounded-xl bg-slate-800/70 border border-slate-700 space-y-2">
                                    <label className="block text-xs font-bold text-slate-200 flex items-center gap-1.5">
                                        <Users className={`w-3.5 h-3.5 ${isResuming ? 'text-sky-400' : 'text-amber-400'}`} />
                                        {isEn ? 'Select Assigned Worker(s) * (Multiple allowed)' : 'Pilih Pekerja yang Mengerjakan * (Bisa lebih dari 1)'}
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {workerChips.map((workerName) => {
                                            const selected = claimWorkers.some((w) => String(w).toLowerCase().trim() === workerName.toLowerCase());
                                            return (
                                                <button
                                                    type="button"
                                                    key={workerName}
                                                    onClick={() => toggleListWorker(setClaimWorkers, workerName)}
                                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 transition-all cursor-pointer ${
                                                        selected
                                                            ? (isResuming
                                                                ? 'bg-sky-600 text-white border-sky-500 shadow-xs'
                                                                : 'bg-amber-600 text-white border-amber-500 shadow-xs')
                                                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                                                    }`}
                                                >
                                                    <span>{workerName}</span>
                                                    {selected && <Check className="w-3 h-3 text-white shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="flex items-center gap-2 pt-1">
                                        <input
                                            type="text"
                                            value={claimCustomWorker}
                                            onChange={(e) => setClaimCustomWorker(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    addCustomListWorker(claimCustomWorker, setClaimCustomWorker, claimWorkers, setClaimWorkers);
                                                }
                                            }}
                                            placeholder={isEn ? 'Add another worker name...' : 'Tambah nama pekerja lain...'}
                                            className={`flex-1 text-xs bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white placeholder-slate-500 focus:outline-none ${isResuming ? 'focus:border-sky-500' : 'focus:border-amber-500'}`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => addCustomListWorker(claimCustomWorker, setClaimCustomWorker, claimWorkers, setClaimWorkers)}
                                            className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-slate-200 cursor-pointer"
                                        >
                                            {isEn ? '+ Add' : '+ Tambah'}
                                        </button>
                                    </div>
                                    {claimWorkers.length > 0 && (
                                        <p className={`text-[11px] ${isResuming ? 'text-sky-300' : 'text-amber-300'}`}>
                                            {isEn ? 'Selected' : 'Terpilih'} ({claimWorkers.length}): <strong className="text-white">{claimWorkers.join(', ')}</strong>
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1">
                                        {isResuming
                                            ? (isEn ? 'Resume Progress Note (Optional)' : 'Catatan Lanjut Progress (Opsional)')
                                            : (isEn ? 'Initial Work Note (Optional)' : 'Catatan Awal Pengerjaan (Opsional)')}
                                    </label>
                                    <textarea
                                        value={claimNote}
                                        onChange={(e) => setClaimNote(e.target.value)}
                                        placeholder={isResuming
                                            ? (isEn ? 'Example: Spare parts have arrived, resuming on-site installation' : 'Contoh: Material sparepart sudah tiba, lanjut pemasangan di lokasi')
                                            : (isEn ? 'Example: Team bringing tools to the location now' : 'Contoh: Tim membawa peralatan menuju lokasi sekarang')}
                                        rows={2}
                                        className={`w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none ${isResuming ? 'focus:border-sky-500' : 'focus:border-amber-500'}`}
                                    />
                                </div>

                                <EtaPickerField
                                    value={claimEta}
                                    onChange={setClaimEta}
                                    isEn={isEn}
                                    isDark={isDark}
                                    accent={isResuming ? 'sky' : 'amber'}
                                />

                                {isResuming && (
                                    <label className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-700/40 flex items-start gap-2.5 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={claimNotifyReporter}
                                            onChange={(e) => setClaimNotifyReporter(e.target.checked)}
                                            className="w-4 h-4 mt-0.5 rounded text-emerald-500 bg-slate-700 border-slate-600 focus:ring-emerald-500 cursor-pointer"
                                        />
                                        <div>
                                            <span className="text-xs font-bold text-emerald-300 block">
                                                {isEn ? 'Send this progress update to reporter WhatsApp' : 'Kirim info progress ini ke WhatsApp pelapor'}
                                            </span>
                                            <span className="text-[10px] text-slate-400">
                                                {showClaimModal.reporter_phone
                                                    ? (isEn
                                                        ? `Auto-sent to ${showClaimModal.reporter_name} (${showClaimModal.reporter_phone}).`
                                                        : `Dikirim otomatis ke ${showClaimModal.reporter_name} (${showClaimModal.reporter_phone}).`)
                                                    : (isEn
                                                        ? 'Enabled by default (reporter WA number not recorded on this ticket yet).'
                                                        : 'Aktif secara default (No. WA pelapor belum tercatat di tiket ini).')}
                                            </span>
                                        </div>
                                    </label>
                                )}

                                <div className="pt-2 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowClaimModal(null)}
                                        className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                                    >
                                        {isEn ? 'Cancel' : 'Batal'}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting || claimWorkers.length === 0}
                                        className={`flex-1 py-2 rounded-lg ${
                                            isResuming
                                                ? 'bg-sky-600 hover:bg-sky-500'
                                                : 'bg-amber-600 hover:bg-amber-500'
                                        } disabled:opacity-50 text-white text-xs font-bold shadow-md cursor-pointer`}
                                    >
                                        {isSubmitting
                                            ? (isEn ? 'Saving...' : 'Menyimpan...')
                                            : (isResuming
                                                ? (isEn ? 'Resume Progress' : 'Lanjutkan Progress')
                                                : (isEn ? 'Start Working' : 'Mulai Kerjakan'))}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })()}

            {/* MODAL 2C: UPDATE PROGRESS & TIM */}
            {showProgressModal && (() => {
                const pool = getWorkersPoolForIssue(showProgressModal);
                const chipMap = new Map();
                [...pool, ...progressWorkers].forEach((n) => {
                    const key = String(n).toLowerCase().trim();
                    if (key && !chipMap.has(key)) chipMap.set(key, String(n).trim());
                });
                const workerChips = Array.from(chipMap.values());

                return (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="font-bold text-base text-white flex items-center gap-1.5">
                                        <MessageSquare className="w-4 h-4 text-sky-400" />
                                        {isEn ? 'Update Progress & Assigned Team' : 'Update Progress & Tim Pelaksana'}
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        #{showProgressModal.issue_code || showProgressModal.id} &bull; {showProgressModal.title}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowProgressModal(null)}
                                    className="text-slate-400 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <form onSubmit={handleProgressSubmit} className="space-y-3.5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-200 mb-1">
                                        {isEn ? 'Work Progress Comment' : 'Komentar Perkembangan Pekerjaan'}
                                    </label>
                                    <textarea
                                        value={progressComment}
                                        onChange={(e) => setProgressComment(e.target.value)}
                                        placeholder={isEn
                                            ? 'Example: Pipe line disassembled, waiting for adhesive to cure and elbow replacement...'
                                            : 'Contoh: Jalur pipa sudah dibongkar, menunggu pengeringan lem dan penggantian elbow...'}
                                        rows={3}
                                        className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                                    />
                                </div>

                                <div className="p-3 rounded-xl bg-slate-800/70 border border-slate-700 space-y-2">
                                    <label className="block text-xs font-bold text-slate-200 flex items-center justify-between">
                                        <span className="flex items-center gap-1.5">
                                            <Users className="w-3.5 h-3.5 text-sky-400" />
                                            {isEn ? 'Active Workers Now (Add / Remove)' : 'Pekerja Aktif Sekarang (Tambah / Kurangi)'}
                                        </span>
                                        <span className="text-[10px] font-normal text-slate-400">
                                            {isEn ? 'Min. 1 worker' : 'Min. 1 pekerja'}
                                        </span>
                                    </label>
                                    <p className="text-[10px] text-slate-400 leading-snug">
                                        {isEn
                                            ? 'Click a name to add or remove from the active team. Removed workers remain recorded in contributor evaluation data.'
                                            : 'Klik nama untuk menambah atau mengeluarkan dari tim aktif. Pekerja yang dikurangi tetap tersimpan dalam data kontributor evaluasi.'}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {workerChips.map((workerName) => {
                                            const selected = progressWorkers.some((w) => String(w).toLowerCase().trim() === workerName.toLowerCase());
                                            return (
                                                <button
                                                    type="button"
                                                    key={workerName}
                                                    onClick={() => toggleListWorker(setProgressWorkers, workerName)}
                                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 transition-all cursor-pointer ${
                                                        selected
                                                            ? 'bg-sky-600 text-white border-sky-500 shadow-xs'
                                                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                                                    }`}
                                                >
                                                    <span>{workerName}</span>
                                                    {selected && <Check className="w-3 h-3 text-white shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="flex items-center gap-2 pt-1">
                                        <input
                                            type="text"
                                            value={progressCustomWorker}
                                            onChange={(e) => setProgressCustomWorker(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    addCustomListWorker(progressCustomWorker, setProgressCustomWorker, progressWorkers, setProgressWorkers);
                                                }
                                            }}
                                            placeholder={isEn ? 'Add new worker name...' : 'Tambah nama pekerja baru...'}
                                            className="flex-1 text-xs bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => addCustomListWorker(progressCustomWorker, setProgressCustomWorker, progressWorkers, setProgressWorkers)}
                                            className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-slate-200 cursor-pointer"
                                        >
                                            {isEn ? '+ Add' : '+ Tambah'}
                                        </button>
                                    </div>
                                </div>

                                <EtaPickerField
                                    value={progressEta}
                                    onChange={setProgressEta}
                                    isEn={isEn}
                                    isDark={isDark}
                                    accent="sky"
                                />

                                {/* WA Notify Toggle (Checked by default) */}
                                <label className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-700/40 flex items-start gap-2.5 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={progressNotifyReporter}
                                        onChange={(e) => setProgressNotifyReporter(e.target.checked)}
                                        className="w-4 h-4 mt-0.5 rounded text-emerald-500 bg-slate-700 border-slate-600 focus:ring-emerald-500 cursor-pointer"
                                    />
                                    <div>
                                        <span className="text-xs font-bold text-emerald-300 block">
                                            {isEn ? 'Send this progress update to reporter WhatsApp' : 'Kirim info progress ini ke WhatsApp pelapor'}
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                            {showProgressModal.reporter_phone
                                                ? (isEn
                                                    ? `Auto-sent to ${showProgressModal.reporter_name} (${showProgressModal.reporter_phone}).`
                                                    : `Dikirim otomatis ke ${showProgressModal.reporter_name} (${showProgressModal.reporter_phone}).`)
                                                : (isEn
                                                    ? 'Enabled by default (reporter WA number not recorded on this ticket yet).'
                                                    : 'Aktif secara default (No. WA pelapor belum tercatat di tiket ini).')}
                                        </span>
                                    </div>
                                </label>

                                <div className="pt-2 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowProgressModal(null)}
                                        className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                                    >
                                        {isEn ? 'Cancel' : 'Batal'}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting || progressWorkers.length === 0}
                                        className="flex-1 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold shadow-md cursor-pointer"
                                    >
                                        {isSubmitting
                                            ? (isEn ? 'Saving...' : 'Menyimpan...')
                                            : (isEn ? 'Save Update' : 'Simpan Update')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })()}

            {/* MODAL 2D: PENDING / TUNDA */}
            {showPendingModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="font-bold text-base text-white flex items-center gap-1.5">
                                    <PauseCircle className="w-4 h-4 text-orange-400" />
                                    {showPendingModal.status === 'pending'
                                        ? (isEn ? 'Update Pending Reason' : 'Update Alasan Pending')
                                        : (isEn ? 'Put Issue on Hold (Pending)' : 'Tunda Isu (Pending)')}
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    #{showPendingModal.issue_code || showPendingModal.id} &bull; {showPendingModal.title}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowPendingModal(null)}
                                className="text-slate-400 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handlePendingSubmit} className="space-y-3.5">
                            <div className="p-2.5 rounded-lg bg-orange-950/30 border border-orange-500/30 text-[11px] text-orange-200 leading-relaxed">
                                {isEn ? (
                                    <>Ticket status will be set to <strong>Pending</strong> and the reporter will automatically receive an update with the hold reason via WhatsApp.</>
                                ) : (
                                    <>Status tiket akan diubah ke <strong>Pending</strong> dan pelapor akan otomatis mendapatkan pemberitahuan beserta alasan penundaan melalui WhatsApp.</>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-200 mb-1">
                                    {isEn ? 'Pending / Blocker Reason ' : 'Alasan Pending / Kendala '}
                                    <span className="text-rose-400">{isEn ? '* (Required)' : '* (Wajib)'}</span>
                                </label>
                                <textarea
                                    value={pendingReason}
                                    onChange={(e) => setPendingReason(e.target.value)}
                                    placeholder={isEn
                                        ? 'Example: Waiting for valve spare part from Batam tomorrow morning / Waiting for guest room check-out at 12:00'
                                        : 'Contoh: Menunggu sparepart valve tiba dari Batam besok pagi / Menunggu kamar tamu check-out jam 12:00'}
                                    rows={3}
                                    required
                                    className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                                />
                            </div>

                            <EtaPickerField
                                value={pendingEta}
                                onChange={setPendingEta}
                                isEn={isEn}
                                isDark={isDark}
                                accent="orange"
                                label={isEn
                                    ? 'Estimated Completion / Resume Time (Optional • WIB)'
                                    : 'Perkiraan Selesai / Ditangani Kembali (Opsional • WIB)'}
                            />

                            <div className="pt-2 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowPendingModal(null)}
                                    className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                                >
                                    {isEn ? 'Cancel' : 'Batal'}
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-bold shadow-md cursor-pointer"
                                >
                                    {isSubmitting
                                        ? (isEn ? 'Saving...' : 'Menyimpan...')
                                        : (isEn ? 'Save Pending Status' : 'Simpan Status Pending')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2E: ALIHKAN KE DEPARTEMEN LAIN */}
            {showTransferModal && (() => {
                const currentTargets = (showTransferModal.target_departments || []).map((d) =>
                    normalizeDepartment(d).toLowerCase()
                );
                const availableDepts = (departments || []).filter((d) =>
                    currentTargets.length !== 1 || normalizeDepartment(d).toLowerCase() !== currentTargets[0]
                );

                return (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="font-bold text-base text-white flex items-center gap-1.5">
                                        <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
                                        {isEn ? 'Transfer to Another Department' : 'Alihkan ke Departemen Lain'}
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        #{showTransferModal.issue_code || showTransferModal.id} &bull; {isEn ? 'From' : 'Dari'} {(showTransferModal.target_departments || []).map(formatDeptDisplay).join(', ')}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowTransferModal(null)}
                                    className="text-slate-400 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <form onSubmit={handleTransferSubmit} className="space-y-3.5">
                                <div className="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-[11px] text-indigo-200 leading-relaxed">
                                    {isEn ? (
                                        <>The issue will return to <strong>Open</strong> status for the new target department, current active team and ETA target will be cleared while contributor history remains preserved, and the reporter will be notified via WA.</>
                                    ) : (
                                        <>Isu akan dikembalikan ke status <strong>Open</strong> untuk departemen tujuan baru, tim aktif &amp; target waktu selesai saat ini dikosongkan, riwayat kontributor tetap aman, dan pelapor dikabari via WA.</>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-200 mb-1">
                                        {isEn ? 'New Target Department ' : 'Departemen Tujuan Baru '}<span className="text-rose-400">*</span>
                                    </label>
                                    <select
                                        value={transferTargetDept}
                                        onChange={(e) => setTransferTargetDept(e.target.value)}
                                        required
                                        className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                                    >
                                        {availableDepts.map((dept) => (
                                            <option key={dept} value={dept}>{formatDeptDisplay(dept)}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-200 mb-1">
                                        {isEn ? 'Transfer Reason ' : 'Alasan Pengalihan '}
                                        <span className="text-rose-400">{isEn ? '* (Required)' : '* (Wajib)'}</span>
                                    </label>
                                    <textarea
                                        value={transferReason}
                                        onChange={(e) => setTransferReason(e.target.value)}
                                        placeholder={isEn
                                            ? 'Example: After on-site inspection, the issue is on the Wi-Fi Access Point network managed by the IT team.'
                                            : 'Contoh: Setelah dicek di lokasi, kendala berada pada jaringan Wi-Fi Access Point yang menjadi wewenang tim IT.'}
                                        rows={3}
                                        required
                                        className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                                    />
                                </div>

                                <div className="pt-2 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowTransferModal(null)}
                                        className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                                    >
                                        {isEn ? 'Cancel' : 'Batal'}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-md cursor-pointer"
                                    >
                                        {isSubmitting
                                            ? (isEn ? 'Transferring...' : 'Mengalihkan...')
                                            : (isEn ? 'Confirm Transfer' : 'Konfirmasi Pengalihan')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })()}



            {/* MODAL: DETAIL ISU LENGKAP (SESUAI PREFERENSI KOLOM ERP) */}
            {activeDetailIssue && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
                    }`}>
                        {/* Header Modal */}
                        <div className={`p-4 border-b flex items-start justify-between gap-3 ${
                            isDark ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-slate-50'
                        }`}>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {visibleColumns.id && (
                                        <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${
                                            isDark ? 'text-amber-300 bg-slate-800 border-slate-700' : 'text-amber-800 bg-amber-50 border-amber-300'
                                        }`}>
                                            #{activeDetailIssue.issue_code || ('LEAN-' + activeDetailIssue.id)}
                                        </span>
                                    )}
                                    {visibleColumns.status && (
                                        <span className="text-[11px] font-bold">
                                            {activeDetailIssue.status === 'open' && (
                                                <span className={`px-2 py-0.5 rounded-full inline-flex items-center gap-1 border ${
                                                    isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-rose-100 text-rose-800 border-rose-300'
                                                }`}>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Open
                                                </span>
                                            )}
                                            {activeDetailIssue.status === 'in_progress' && (
                                                <span className={`px-2 py-0.5 rounded-full inline-flex items-center gap-1 border ${
                                                    isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-amber-100 text-amber-800 border-amber-300'
                                                }`}>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {isEn ? 'In Progress' : 'Progress'}
                                                </span>
                                            )}
                                            {activeDetailIssue.status === 'pending' && (
                                                <span className={`px-2 py-0.5 rounded-full inline-flex items-center gap-1 border ${
                                                    isDark ? 'bg-orange-500/20 text-orange-300 border-orange-500/40' : 'bg-orange-100 text-orange-800 border-orange-300'
                                                }`}>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> {isEn ? 'Pending' : 'Tertunda'}
                                                </span>
                                            )}
                                            {activeDetailIssue.status === 'resolved' && (
                                                <span className={`px-2 py-0.5 rounded-full inline-flex items-center gap-1 border ${
                                                    isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                }`}>
                                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> {isEn ? 'Resolved' : 'Selesai'}
                                                </span>
                                            )}
                                        </span>
                                    )}
                                </div>
                                {visibleColumns.title ? (
                                    <h3 className={`font-bold text-base leading-snug ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {activeDetailIssue.title}
                                    </h3>
                                ) : (
                                    <h3 className={`font-bold text-sm italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {isEn ? 'Field Issue Details' : 'Detail Isu Lapangan'}
                                    </h3>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedDetailIssue(null)}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                                    isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body Modal (Scrollable) */}
                        <div className="p-4 overflow-y-auto space-y-4 flex-1">
                            {/* PANEL AKSI STATUS & HAK AKSES DEPARTEMEN */}
                            {activeDetailIssue.status !== 'resolved' && (
                                canManageIssue(activeDetailIssue) ? (
                                    <div className={`p-3 rounded-xl border space-y-2 ${
                                        isDark ? 'bg-slate-800/70 border-emerald-500/30' : 'bg-emerald-50/60 border-emerald-200'
                                    }`}>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className={`text-[11px] font-bold flex items-center gap-1.5 ${
                                                isDark ? 'text-emerald-300' : 'text-emerald-800'
                                            }`}>
                                                <Wrench className="w-3.5 h-3.5" />
                                                {isEn ? 'Manage Issue Status & Progress' : 'Kelola Status & Progress Isu'}
                                            </span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                                                isDark ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300' : 'bg-white border-emerald-300 text-emerald-700'
                                            }`}>
                                                {currentUser?.is_admin ? (isEn ? 'Admin Access' : 'Akses Admin') : `Dept: ${formatDeptDisplay(myDept)}`}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {(activeDetailIssue.status === 'open' || activeDetailIssue.status === 'pending') && (
                                                <button
                                                    type="button"
                                                    onClick={() => openClaimModal(activeDetailIssue)}
                                                    className={`px-3 py-1.5 rounded-lg text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer ${
                                                        activeDetailIssue.status === 'pending'
                                                            ? 'bg-sky-600 hover:bg-sky-500'
                                                            : 'bg-amber-600 hover:bg-amber-500'
                                                    }`}
                                                >
                                                    <Play className="w-3.5 h-3.5" />
                                                    <span>{activeDetailIssue.status === 'pending' ? (isEn ? 'Resume Progress' : 'Lanjutkan Progress') : (isEn ? 'Start Working' : 'Mulai Kerjakan')}</span>
                                                </button>
                                            )}

                                            {activeDetailIssue.status === 'in_progress' && (
                                                <button
                                                    type="button"
                                                    onClick={() => openProgressModal(activeDetailIssue)}
                                                    className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                                                >
                                                    <MessageSquare className="w-3.5 h-3.5" />
                                                    <span>{isEn ? 'Update Progress & Team' : 'Update Progress & Tim'}</span>
                                                </button>
                                            )}

                                            <button
                                                type="button"
                                                onClick={() => openPendingModal(activeDetailIssue)}
                                                className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                                            >
                                                <PauseCircle className="w-3.5 h-3.5" />
                                                <span>{activeDetailIssue.status === 'pending' ? (isEn ? 'Update Pending Reason' : 'Update Alasan Pending') : (isEn ? 'Put on Hold / Pending' : 'Tunda / Pending')}</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => openResolveModal(activeDetailIssue)}
                                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                                            >
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                <span>{isEn ? 'Mark Resolved' : 'Tandai Selesai'}</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => openTransferModal(activeDetailIssue)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                                                    isDark
                                                        ? 'bg-indigo-950/60 hover:bg-indigo-900/80 border-indigo-500/40 text-indigo-300'
                                                        : 'bg-indigo-50 hover:bg-indigo-100 border-indigo-300 text-indigo-700'
                                                }`}
                                            >
                                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                                <span>{isEn ? 'Transfer to Another Dept' : 'Alihkan ke Dept Lain'}</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                                        isDark ? 'bg-slate-800/50 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-700'
                                    }`}>
                                        <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-bold">{isEn ? 'View-Only Mode' : 'Mode Lihat Saja'}</p>
                                            <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                                {!currentUser
                                                    ? (isEn
                                                        ? 'Please log in with the handling department account to update this issue status.'
                                                        : 'Silakan login terlebih dahulu menggunakan akun departemen penangan untuk mengubah status isu.')
                                                    : (isEn
                                                        ? `You are logged in as ${myName} (${formatDeptDisplay(myDept)}). Only owners of the target department (${(activeDetailIssue.target_departments || []).map(formatDeptDisplay).join(', ')}) or Admin can update this issue status.`
                                                        : `Anda masuk sebagai ${myName} (${myDept}). Hanya pemilik departemen tujuan (${(activeDetailIssue.target_departments || []).join(', ')}) atau Admin yang dapat mengubah status isu ini.`)}
                                            </p>
                                        </div>
                                    </div>
                                )
                            )}

                            {/* Callout Alasan Pending Aktif */}
                            {activeDetailIssue.status === 'pending' && activeDetailIssue.pending_reason && (
                                <div className={`p-3 rounded-xl border space-y-1 text-xs ${
                                    isDark ? 'bg-orange-950/40 border-orange-500/40 text-orange-200' : 'bg-orange-50 border-orange-300 text-orange-900'
                                }`}>
                                    <div className="flex items-center justify-between gap-2 font-bold">
                                        <span className="flex items-center gap-1.5">
                                            <PauseCircle className="w-4 h-4 text-orange-500" />
                                            {isEn ? 'Pending / On Hold Status' : 'Status Pending / Tertunda'}
                                        </span>
                                        {activeDetailIssue.pending_since && (
                                            <span className="text-[10px] font-medium opacity-80">
                                                {isEn ? 'Since:' : 'Sejak:'} {formatDateTimeId(activeDetailIssue.pending_since)}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs leading-relaxed">
                                        {isEn ? 'Reason:' : 'Alasan:'} <strong>{activeDetailIssue.pending_reason}</strong>
                                    </p>
                                </div>
                            )}

                            {/* Grid Informasi Utama */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {visibleColumns.location && (() => {
                                    const locInfo = resolveIssueResortAndZone(activeDetailIssue);
                                    const canNavigate = !locInfo.isOffice && (locInfo.resort === 'TBR' || locInfo.resort === 'TPI');

                                    return (
                                        <div
                                            onClick={canNavigate ? () => handleNavigateToMap(activeDetailIssue) : undefined}
                                            className={`p-2.5 rounded-xl border transition-all ${
                                                canNavigate
                                                    ? isDark
                                                        ? 'bg-slate-800/90 border-slate-700/80 hover:bg-slate-750 hover:border-emerald-500/60 cursor-pointer group shadow-sm'
                                                        : 'bg-slate-50 border-slate-200 hover:bg-emerald-50/50 hover:border-emerald-300 cursor-pointer group shadow-2xs'
                                                    : isDark
                                                    ? 'bg-slate-800/80 border-slate-700/80'
                                                    : 'bg-slate-50 border-slate-200'
                                            }`}
                                            title={
                                                canNavigate
                                                    ? (isEn ? `Click to view location pin on ${locInfo.resort} Map` : `Klik untuk melihat titik lokasi pada Denah ${locInfo.resort}`)
                                                    : (isEn ? 'Office Location (Island map not available)' : 'Lokasi Kantor / Office (Denah pulau tidak tersedia)')
                                            }
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[10px] font-medium block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{isEn ? 'Issue Location' : 'Lokasi Masalah'}</span>
                                                {canNavigate ? (
                                                    <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 transition-colors ${
                                                        isDark
                                                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 group-hover:bg-emerald-500 group-hover:text-slate-950'
                                                            : 'bg-emerald-100 text-emerald-800 border-emerald-200 group-hover:bg-emerald-600 group-hover:text-white'
                                                    }`}>
                                                        <span>{isEn ? `${locInfo.resort} Map` : `Peta ${locInfo.resort}`}</span>
                                                        <ExternalLink className="w-2.5 h-2.5" />
                                                    </span>
                                                ) : (
                                                    <span className={`text-[9.5px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{isEn ? 'Office' : 'Kantor'}</span>
                                                )}
                                            </div>
                                            <span className={`text-xs font-bold flex items-center gap-1 mt-0.5 ${
                                                isDark ? 'text-emerald-300 group-hover:text-emerald-200' : 'text-emerald-700 group-hover:text-emerald-800'
                                            }`}>
                                                <MapPin className={`w-3.5 h-3.5 ${canNavigate ? (isDark ? 'text-emerald-400 group-hover:scale-110' : 'text-emerald-600 group-hover:scale-110') : 'text-slate-400'} transition-transform`} />
                                                {activeDetailIssue.location}
                                            </span>
                                            {(() => {
                                                const gmapMatch = activeDetailIssue.location?.match(/https:\/\/maps\.google\.com\S+/);
                                                if (!gmapMatch) return null;
                                                return (
                                                    <a
                                                        href={gmapMatch[0]}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className={`inline-flex items-center gap-1 text-[10px] font-bold mt-1 underline ${
                                                            isDark ? 'text-sky-400 hover:text-sky-300' : 'text-sky-600 hover:text-sky-700'
                                                        }`}
                                                        title={isEn ? 'Open coordinates in Google Maps' : 'Buka titik koordinat di Google Maps'}
                                                    >
                                                        <span>{isEn ? 'Open Google Maps Pin' : 'Buka Pin Google Maps'}</span>
                                                        <ExternalLink className="w-2.5 h-2.5" />
                                                    </a>
                                                );
                                            })()}
                                        </div>
                                    );
                                })()}

                                {visibleColumns.time && (
                                    <div className={`p-2.5 rounded-xl border ${
                                        isDark ? 'bg-slate-800/80 border-slate-700/80' : 'bg-slate-50 border-slate-200'
                                    }`}>
                                        <span className={`text-[10px] font-medium block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{isEn ? 'Reported Time' : 'Waktu Pelaporan'}</span>
                                        <span className={`text-xs font-semibold flex items-center gap-1 mt-0.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                                            {formatRelativeTime(activeDetailIssue.created_at, activeDetailIssue.created_at_human) || activeDetailIssue.created_at}
                                        </span>
                                    </div>
                                )}

                                {visibleColumns.reporter && (
                                    <div className={`p-2.5 rounded-xl border ${
                                        isDark ? 'bg-slate-800/80 border-slate-700/80' : 'bg-slate-50 border-slate-200'
                                    }`}>
                                        <span className={`text-[10px] font-medium block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{isEn ? 'Reporter' : 'Pelapor'}</span>
                                        <span className={`text-xs font-semibold flex items-center gap-1 mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            <User className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                            {activeDetailIssue.reporter_name}
                                            {activeDetailIssue.reporter_dept && (
                                                <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                    ({formatDeptDisplay(activeDetailIssue.reporter_dept)})
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                )}

                                {visibleColumns.eta && (() => {
                                    const etaBadge = getEtaBadgeInfo(activeDetailIssue, nowMs, isEn);
                                    return (
                                        <div className={`p-2.5 rounded-xl border ${
                                            isDark ? 'bg-slate-800/80 border-slate-700/80' : 'bg-slate-50 border-slate-200'
                                        }`}>
                                            <span className={`text-[10px] font-medium block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                {isEn ? 'Estimated Completion' : 'Perkiraan Selesai (ETA)'}
                                            </span>
                                            {etaBadge ? (
                                                <div className="mt-0.5 flex items-center justify-between gap-2 flex-wrap">
                                                    <span className={`text-xs font-bold flex items-center gap-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                        <CalendarClock className={`w-3.5 h-3.5 shrink-0 ${
                                                            etaBadge.isOverdue
                                                                ? 'text-rose-500'
                                                                : etaBadge.isOnTime
                                                                ? 'text-emerald-500'
                                                                : 'text-sky-500'
                                                        }`} />
                                                        <span>{etaBadge.formattedFullTarget}</span>
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getEtaChipClasses(etaBadge)}`}>
                                                        {etaBadge.statusLabel}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className={`text-xs italic flex items-center gap-1 mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                    <CalendarClock className="w-3.5 h-3.5 opacity-60 shrink-0" />
                                                    <span>{isEn ? 'Not specified' : 'Belum ditentukan'}</span>
                                                </span>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Departemen Dituju & Penerima */}
                            {visibleColumns.dept && (
                                <div className={`p-3 rounded-xl border space-y-1.5 ${
                                    isDark ? 'bg-slate-800/60 border-slate-700/80' : 'bg-slate-50 border-slate-200'
                                }`}>
                                    <span className={`text-[10px] font-semibold block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{isEn ? 'Target Department & Issue Assignee:' : 'Departemen Dituju & Penerima Isu:'}</span>
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
                                                            ? isDark
                                                                ? 'bg-amber-950/80 border-amber-500 text-amber-200'
                                                                : 'bg-amber-100 border-amber-400 text-amber-900'
                                                            : isThisAcc
                                                            ? isDark
                                                                ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                                                                : 'bg-emerald-100 border-emerald-400 text-emerald-800'
                                                            : activeDetailIssue.status === 'in_progress'
                                                            ? isDark
                                                                ? 'bg-slate-900 border-amber-800/40 text-slate-300'
                                                                : 'bg-white border-amber-300 text-amber-900'
                                                            : isDark
                                                            ? 'bg-slate-900 border-slate-700 text-slate-300'
                                                            : 'bg-white border-slate-300 text-slate-700'
                                                    }`}
                                                >
                                                    <span>{formatDeptDisplay(dept)}</span>
                                                    {isWorking ? (
                                                        <span className={`text-[10px] font-bold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{isEn ? `🟡 Working (${activeDetailIssue.claimed_by_name})` : `🟡 Dikerjakan (${activeDetailIssue.claimed_by_name})`}</span>
                                                    ) : isThisAcc ? (
                                                        <span className={`text-[10px] font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{isEn ? '✓ Accepted' : '✓ Diterima'} {accBy && `(${accBy})`}</span>
                                                    ) : activeDetailIssue.status === 'in_progress' ? (
                                                        <span className={`text-[10px] ${isDark ? 'text-amber-400/80' : 'text-amber-700'}`}>{isEn ? `In Progress (${activeDetailIssue.claimed_by_name || 'Team'})` : `Diproses (${activeDetailIssue.claimed_by_name || 'Tim'})`}</span>
                                                    ) : (
                                                        <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{isEn ? 'Waiting' : 'Menunggu'}</span>
                                                    )}
                                                </span>
                                            );
                                        })}
                                        {/* Jika diambil oleh staf dari departemen lain (misal cross-department) */}
                                        {activeDetailIssue.claimed_by_dept && !(activeDetailIssue.target_departments || []).map(d => d.toLowerCase()).includes(activeDetailIssue.claimed_by_dept.toLowerCase()) && (
                                            <span className={`px-2 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 ${
                                                isDark ? 'bg-amber-950/80 border-amber-500 text-amber-200' : 'bg-amber-100 border-amber-400 text-amber-900'
                                            }`}>
                                                <span>{formatDeptDisplay(activeDetailIssue.claimed_by_dept)}</span>
                                                <span className={`text-[10px] font-bold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{isEn ? `🟡 Working (${activeDetailIssue.claimed_by_name})` : `🟡 Dikerjakan (${activeDetailIssue.claimed_by_name})`}</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Deskripsi Lengkap */}
                            {visibleColumns.desc && (
                                <div className="space-y-1">
                                    <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{isEn ? 'Full Issue Description:' : 'Deskripsi Lengkap Masalah:'}</span>
                                    <div className={`p-3 rounded-xl border text-xs leading-relaxed whitespace-pre-line ${
                                        isDark ? 'bg-slate-950/70 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                                    }`}>
                                        {activeDetailIssue.description || <span className={`italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{isEn ? 'No additional description attached.' : 'Tidak ada deskripsi tambahan yang dilampirkan.'}</span>}
                                    </div>
                                </div>
                            )}

                            {/* Foto Bukti */}
                            {visibleColumns.photo && activeDetailIssue.image_url && (
                                <div className="space-y-1.5">
                                    <span className={`text-xs font-bold flex items-center gap-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                        <Camera className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                        {isEn ? 'Attached Issue Photo:' : 'Lampiran Foto Masalah:'}
                                    </span>
                                    <div
                                        onClick={() => setLightboxImage(activeDetailIssue.image_url)}
                                        className={`relative rounded-xl overflow-hidden border cursor-pointer group max-h-56 flex items-center justify-center ${
                                            isDark ? 'border-slate-700 bg-black/40' : 'border-slate-300 bg-slate-100'
                                        }`}
                                        title={isEn ? 'Click to enlarge photo' : 'Klik untuk perbesar foto'}
                                    >
                                        <img
                                            src={activeDetailIssue.image_url}
                                            alt={isEn ? 'Photo proof' : 'Bukti'}
                                            className="max-h-56 w-full object-cover group-hover:scale-105 transition-transform"
                                        />
                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="text-xs font-bold text-white bg-black/70 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                                                <Eye className="w-4 h-4" /> {isEn ? 'Click to Enlarge' : 'Klik untuk Perbesar'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Status Penugasan, Kontributor & Penyelesaian */}
                            {visibleColumns.status && (
                                activeDetailIssue.claimed_by_name ||
                                activeDetailIssue.resolved_by_name ||
                                (activeDetailIssue.active_workers && activeDetailIssue.active_workers.length > 0) ||
                                (activeDetailIssue.contributors && activeDetailIssue.contributors.length > 0)
                            ) && (
                                <div className={`p-3 rounded-xl border space-y-2 text-xs ${
                                    isDark ? 'bg-slate-800/50 border-slate-700/80' : 'bg-slate-50 border-slate-200'
                                }`}>
                                    <div className={`font-bold flex items-center gap-1.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                        <Award className="w-3.5 h-3.5 text-emerald-500" />
                                        <span>{isEn ? 'Assigned Team & Evaluation Contributors' : 'Tim Pelaksana & Kontributor Evaluasi'}</span>
                                    </div>

                                    {activeDetailIssue.active_workers && activeDetailIssue.active_workers.length > 0 && activeDetailIssue.status !== 'resolved' && (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className={`text-[11px] ${isDark ? 'text-amber-300' : 'text-amber-800 font-semibold'}`}>{isEn ? 'Active Workers:' : 'Pekerja Aktif:'}</span>
                                            {activeDetailIssue.active_workers.map((w) => (
                                                <span key={w} className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                                    isDark ? 'bg-amber-950/70 border-amber-500/40 text-amber-200' : 'bg-amber-100 border-amber-300 text-amber-900'
                                                }`}>
                                                    {w}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {activeDetailIssue.initial_workers && activeDetailIssue.initial_workers.length > 0 && (
                                        <p className={`text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                            {isEn ? 'Initial Workers (Claim):' : 'Pekerja Awal (Claim):'} <strong>{activeDetailIssue.initial_workers.join(', ')}</strong>
                                        </p>
                                    )}

                                    {activeDetailIssue.claimed_by_name && (!activeDetailIssue.active_workers || activeDetailIssue.active_workers.length === 0) && activeDetailIssue.status !== 'resolved' && (
                                        <p className={isDark ? 'text-amber-300' : 'text-amber-800 font-medium'}>
                                            {isEn ? 'Handled by:' : 'Dikerjakan oleh:'} <strong>{activeDetailIssue.claimed_by_name}</strong> ({formatDeptDisplay(activeDetailIssue.claimed_by_dept)})
                                        </p>
                                    )}

                                    {activeDetailIssue.resolved_by_name && (
                                        <div className={`p-2.5 rounded-lg border space-y-2 ${
                                            isDark ? 'bg-emerald-950/30 border-emerald-700/40 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                        }`}>
                                            <p>
                                                {isEn ? 'Resolved by:' : 'Diselesaikan oleh:'} <strong>{activeDetailIssue.resolved_by_name}</strong> ({formatDeptDisplay(activeDetailIssue.resolved_by_dept)})
                                            </p>
                                            {activeDetailIssue.resolution_note && (
                                                <p className="text-[11px] italic">"{activeDetailIssue.resolution_note}"</p>
                                            )}
                                            {activeDetailIssue.resolution_image_url && (
                                                <div
                                                    onClick={() => setLightboxImage(activeDetailIssue.resolution_image_url)}
                                                    className="relative rounded-lg overflow-hidden border border-emerald-500/30 cursor-pointer max-h-40 flex items-center justify-center bg-black/40"
                                                    title={isEn ? 'Click to enlarge resolution photo' : 'Klik untuk perbesar foto bukti selesai'}
                                                >
                                                    <img
                                                        src={activeDetailIssue.resolution_image_url}
                                                        alt={isEn ? 'Resolution proof' : 'Bukti Penyelesaian'}
                                                        className="max-h-40 w-full object-cover"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {activeDetailIssue.contributors && activeDetailIssue.contributors.length > 0 && (
                                        <div className={`pt-1.5 border-t flex flex-wrap items-center gap-1.5 ${
                                            isDark ? 'border-slate-700/60' : 'border-slate-200'
                                        }`}>
                                            <span className={`text-[11px] font-semibold ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}>
                                                {isEn ? `All Contributors (${activeDetailIssue.contributors.length}):` : `Seluruh Kontributor (${activeDetailIssue.contributors.length}):`}
                                            </span>
                                            {activeDetailIssue.contributors.map((c) => (
                                                <span key={c} className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                    isDark ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                                }`}>
                                                    {c}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Timeline Komentar Progress & Aktivitas */}
                            {activeDetailIssue.progress_logs && activeDetailIssue.progress_logs.length > 0 && (
                                <div className={`p-3 rounded-xl border space-y-2 text-xs ${
                                    isDark ? 'bg-slate-900/90 border-sky-900/50' : 'bg-sky-50/60 border-sky-200'
                                }`}>
                                    <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-sky-400' : 'text-sky-800'}`}>
                                        <History className="w-3.5 h-3.5" />
                                        <span>{isEn ? `Comments & Activity Timeline (${activeDetailIssue.progress_logs.length})` : `Timeline Komentar & Aktivitas (${activeDetailIssue.progress_logs.length})`}</span>
                                    </div>
                                    <div className="space-y-1.5 pl-2.5 border-l-2 border-sky-500/40">
                                        {activeDetailIssue.progress_logs.map((log, idx) => {
                                            const prevLog = idx > 0 ? activeDetailIssue.progress_logs[idx - 1] : null;
                                            const isResumedFromPendingLog = log.type === 'claim' && (
                                                prevLog?.type === 'pending' ||
                                                String(log.message || '').toLowerCase().includes('dari status pending')
                                            );
                                            const effectiveLogType = isResumedFromPendingLog ? 'progress' : log.type;

                                            const badgeStyles = isDark ? ({
                                                claim: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
                                                progress: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
                                                pending: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
                                                transfer: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
                                                resolved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                                            }[effectiveLogType] || 'bg-slate-500/20 text-slate-300 border-slate-500/30') : ({
                                                claim: 'bg-amber-100 text-amber-800 border-amber-300',
                                                progress: 'bg-sky-100 text-sky-800 border-sky-300',
                                                pending: 'bg-orange-100 text-orange-800 border-orange-300',
                                                transfer: 'bg-indigo-100 text-indigo-800 border-indigo-300',
                                                resolved: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                                            }[effectiveLogType] || 'bg-slate-100 text-slate-700 border-slate-300');

                                            const typeText = {
                                                claim: isEn ? 'Claim / Start' : 'Claim / Kerja',
                                                progress: 'Progress',
                                                pending: 'Pending',
                                                transfer: isEn ? 'Transferred' : 'Dialihkan',
                                                resolved: isEn ? 'Resolved' : 'Selesai',
                                            }[effectiveLogType] || effectiveLogType;

                                            return (
                                                <div key={log.id || idx} className={`p-2 rounded-lg border space-y-1 ${
                                                    isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white border-sky-200 shadow-2xs'
                                                }`}>
                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold border ${badgeStyles}`}>
                                                                {typeText}
                                                            </span>
                                                            <span className={`font-bold text-[11px] ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                                                {log.actor}
                                                            </span>
                                                            {log.actor_dept && (
                                                                <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                                    ({formatDeptDisplay(log.actor_dept)})
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                            {formatDateTimeId(log.created_at)}
                                                        </span>
                                                    </div>
                                                    {log.message && (
                                                        <p className={`text-[11px] leading-snug ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                                            {log.message}
                                                        </p>
                                                    )}
                                                    {(log.estimated_completion_at || log.eta_cleared || log.cleared_eta || log.sla_status) && (
                                                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                                            {log.estimated_completion_at && (
                                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                                                    isDark ? 'bg-sky-950/70 text-sky-300 border-sky-700/60' : 'bg-sky-50 text-sky-800 border-sky-200'
                                                                }`}>
                                                                    <CalendarClock className="w-2.5 h-2.5 shrink-0" />
                                                                    <span>
                                                                        {isEn ? 'Target:' : 'Target:'}{' '}
                                                                        {formatEtaDisplayWib(log.estimated_completion_at, isEn, false)}
                                                                    </span>
                                                                </span>
                                                            )}
                                                            {(log.eta_cleared || log.cleared_eta) && (
                                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                                                    isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-300'
                                                                }`}>
                                                                    <RotateCcw className="w-2.5 h-2.5 shrink-0" />
                                                                    <span>{isEn ? 'ETA target cleared' : 'Target selesai dikosongkan'}</span>
                                                                </span>
                                                            )}
                                                            {log.sla_status && (
                                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                                                    log.sla_status === 'on_time'
                                                                        ? (isDark ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60' : 'bg-emerald-50 text-emerald-800 border-emerald-200')
                                                                        : (isDark ? 'bg-amber-950/70 text-amber-300 border-amber-700/60' : 'bg-amber-50 text-amber-800 border-amber-200')
                                                                }`}>
                                                                    <span>
                                                                        {log.sla_status === 'on_time'
                                                                            ? (isEn ? 'SLA: On Time' : 'SLA: Tepat Waktu')
                                                                            : (isEn ? 'SLA: Overdue' : 'SLA: Melewati Target')}
                                                                    </span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                        {Array.isArray(log.workers) && log.workers.length > 0 && (
                                                            <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                {isEn ? 'Team:' : 'Tim:'} <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{log.workers.join(', ')}</strong>
                                                            </span>
                                                        )}
                                                        {log.notified_wa && (
                                                            <span className="text-[9.5px] text-emerald-400 font-semibold ml-auto">
                                                                {isEn ? 'Reporter WA Sent ✓' : 'WA Pelapor Terkirim ✓'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Riwayat Pengalihan Departemen (Transfer History) */}
                            {activeDetailIssue.transfer_history && activeDetailIssue.transfer_history.length > 0 && (
                                <div className={`p-3 rounded-xl border space-y-2 text-xs ${
                                    isDark ? 'bg-slate-900/90 border-amber-900/50' : 'bg-amber-50/70 border-amber-300'
                                }`}>
                                    <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        <span>{isEn ? `Department Transfer History (${activeDetailIssue.transfer_history.length}x)` : `Riwayat Pengalihan Departemen (${activeDetailIssue.transfer_history.length}x)`}</span>
                                    </div>
                                    <div className="space-y-1.5 pl-2 border-l-2 border-amber-500/40">
                                        {activeDetailIssue.transfer_history.map((hist, idx) => (
                                            <div key={idx} className={`p-2 rounded-lg border space-y-0.5 ${
                                                isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white border-amber-200 shadow-2xs'
                                            }`}>
                                                <div className={`flex items-center justify-between text-[11px] font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                                    <span>
                                                        <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>{formatDeptDisplay(hist.from_department)}</span>
                                                        <span className="text-amber-500 mx-1.5">➔</span>
                                                        <span className={isDark ? 'text-emerald-400' : 'text-emerald-700'}>{formatDeptDisplay(hist.to_department)}</span>
                                                    </span>
                                                    <span className={`text-[10px] font-normal ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                        {hist.transferred_at ? formatDateTimeId(hist.transferred_at, true) : ''}
                                                    </span>
                                                </div>
                                                <p className={`text-[11px] italic ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                                    "{hist.reason}"
                                                </p>
                                                <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                    {isEn ? 'By:' : 'Oleh:'} <strong className={isDark ? 'text-slate-400' : 'text-slate-600'}>{hist.transferred_by}</strong>
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer Modal */}
                        <div className={`p-3 border-t flex items-center justify-between gap-2 flex-wrap ${
                            isDark ? 'border-slate-800 bg-slate-950/80' : 'border-slate-200 bg-slate-50'
                        }`}>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowColumnModal(true)}
                                    className={`text-[11px] flex items-center gap-1.5 transition-colors ${
                                        isDark ? 'text-slate-400 hover:text-emerald-400' : 'text-slate-600 hover:text-emerald-700'
                                    }`}
                                    title={isEn ? 'Customize columns shown in modal & table' : 'Ubah kolom yang ditampilkan di modal & tabel'}
                                >
                                    <SlidersHorizontal className="w-3.5 h-3.5" />
                                    <span>{isEn ? `Customize View (${activeColumnCount}/${columnDefs.length})` : `Sesuaikan Tampilan Data (${activeColumnCount}/${columnDefs.length})`}</span>
                                </button>
                                {canManageIssue(activeDetailIssue) && (
                                    <button
                                        type="button"
                                        onClick={() => setIssueToDelete(activeDetailIssue)}
                                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition ${
                                            isDark
                                                ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/30'
                                                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                                        }`}
                                    >
                                        <Trash2 className="w-3 h-3 text-rose-500" />
                                        <span>{isEn ? 'Delete Ticket' : 'Hapus Tiket'}</span>
                                    </button>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedDetailIssue(null)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                                }`}
                            >
                                {isEn ? 'Close' : 'Tutup'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* LIGHTBOX MODAL */}
            {lightboxImage && (
                <div
                    onClick={() => setLightboxImage(null)}
                    className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center p-4 cursor-pointer animate-in fade-in"
                >
                    <div className="relative max-w-3xl max-h-[90vh]">
                        <img
                            src={lightboxImage}
                            alt={isEn ? 'Enlarged proof' : 'Bukti Besar'}
                            className="max-w-full max-h-[90vh] object-contain rounded-lg"
                        />
                        <button
                            onClick={() => setLightboxImage(null)}
                            className="absolute -top-10 right-0 text-white text-xs font-semibold bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full"
                        >
                            {isEn ? 'Close [X]' : 'Tutup [X]'}
                        </button>
                    </div>
                </div>
            )}

            {/* TOAST FEEDBACK NOTIFICATION */}
            {actionNotice && (
                <div className="fixed top-16 right-4 z-[80] max-w-sm animate-in slide-in-from-top-3 fade-in">
                    <div className={`px-4 py-3 rounded-xl border shadow-2xl flex items-start gap-2.5 text-xs backdrop-blur-md ${
                        actionNotice.type === 'error'
                            ? 'bg-rose-950/95 border-rose-500/60 text-rose-200'
                            : 'bg-emerald-950/95 border-emerald-500/60 text-emerald-200'
                    }`}>
                        {actionNotice.type === 'error' ? (
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        )}
                        <span className="font-semibold leading-snug">{actionNotice.text}</span>
                        <button
                            type="button"
                            onClick={() => setActionNotice(null)}
                            className="ml-2 text-slate-400 hover:text-white shrink-0"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL 5: ERP COLUMN CUSTOMIZER */}
            {showColumnModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
                    }`}>
                        {/* Header */}
                        <div className={`p-4 border-b flex items-center justify-between ${
                            isDark ? 'border-slate-800' : 'border-slate-200'
                        }`}>
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                                    <SlidersHorizontal className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{isEn ? 'Customize Data View' : 'Kustomisasi Tampilan Data'}</h3>
                                    <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {isEn ? `Select fields to display (${activeColumnCount} of ${columnDefs.length} active)` : `Pilih data yang ingin dimunculkan (${activeColumnCount} dari ${columnDefs.length} aktif)`}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowColumnModal(false)}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                    isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Column Toggles List */}
                        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
                            {columnDefs.map((col) => {
                                const isVisible = !!visibleColumns[col.id];
                                return (
                                    <button
                                        key={col.id}
                                        type="button"
                                        onClick={() => toggleColumn(col.id)}
                                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                                            isVisible
                                                ? isDark
                                                    ? 'bg-slate-800/90 border-emerald-500/50 text-white'
                                                    : 'bg-emerald-50/70 border-emerald-300 text-slate-900'
                                                : isDark
                                                ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:border-slate-700'
                                                : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-base">{col.icon}</span>
                                            <span className={isVisible ? (isDark ? 'text-white font-bold' : 'text-slate-900 font-bold') : (isDark ? 'text-slate-400' : 'text-slate-500')}>{col.label}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {isVisible ? (
                                                <span className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${
                                                    isDark ? 'text-emerald-400 bg-emerald-950/80 border-emerald-800/60' : 'text-emerald-800 bg-emerald-100 border-emerald-300'
                                                }`}>
                                                    <Eye className="w-3 h-3" />
                                                    {isEn ? 'Shown' : 'Tampil'}
                                                </span>
                                            ) : (
                                                <span className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${
                                                    isDark ? 'text-slate-500 bg-slate-800/60 border-slate-800' : 'text-slate-500 bg-slate-200 border-slate-300'
                                                }`}>
                                                    <EyeOff className="w-3 h-3" />
                                                    {isEn ? 'Hidden' : 'Disembunyikan'}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Actions Footer */}
                        <div className={`p-3 border-t flex items-center justify-between gap-2 ${
                            isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
                        }`}>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setAllColumns(true)}
                                    className={`px-2.5 py-1.5 text-[11px] rounded-lg transition-colors ${
                                        isDark ? 'text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700' : 'text-slate-700 hover:text-slate-900 bg-slate-200 hover:bg-slate-300'
                                    }`}
                                >
                                    {isEn ? 'Select All' : 'Pilih Semua'}
                                </button>
                                <button
                                    type="button"
                                    onClick={resetColumns}
                                    className={`px-2.5 py-1.5 text-[11px] rounded-lg transition-colors flex items-center gap-1 ${
                                        isDark ? 'text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800' : 'text-slate-600 hover:text-slate-800 bg-slate-200 hover:bg-slate-300'
                                    }`}
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
                                {isEn ? 'Done' : 'Selesai'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                    <h3 className="font-bold text-sm text-white">{isEn ? 'Delete Ticket' : 'Hapus Tiket'} #{issueToDelete.issue_code || ('LEAN-' + issueToDelete.id)}</h3>
                                    <p className="text-[11px] text-slate-400">{isEn ? 'Soft Delete & Spreadsheet Sync' : 'Soft Delete & Sinkronisasi Spreadsheet'}</p>
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
                                    <span>{isEn ? 'Location:' : 'Lokasi:'} <strong className="text-slate-300">{issueToDelete.location}</strong></span>
                                    <span>•</span>
                                    <span>{isEn ? 'Reporter:' : 'Pelapor:'} <strong className="text-slate-300">{issueToDelete.reporter_name}</strong></span>
                                </div>
                            </div>

                            <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-xl text-xs space-y-1 text-amber-200/90 leading-relaxed">
                                <p className="font-semibold text-amber-300 flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    {isEn ? 'Data Integrity Policy:' : 'Kebijakan Integritas Data:'}
                                </p>
                                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-200/80">
                                    {isEn ? (
                                        <>
                                            <li>This ticket will be <strong>hidden from the dashboard &amp; charts</strong>.</li>
                                            <li>Data in <strong>Google Spreadsheet is NOT DELETED</strong>, instead marked inactive (<strong>Active in Dashboard = 0</strong>).</li>
                                            <li>Your name and deletion time will be automatically audited.</li>
                                        </>
                                    ) : (
                                        <>
                                            <li>Tiket ini akan <strong>disembunyikan dari dashboard &amp; grafik</strong>.</li>
                                            <li>Data di <strong>Google Spreadsheet TIDAK DIHAPUS</strong>, melainkan ditandai non-aktif (<strong>Aktif di Dashboard = 0</strong>).</li>
                                            <li>Nama dan waktu penghapusan akan diaudit secara otomatis.</li>
                                        </>
                                    )}
                                </ul>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                    {isEn ? 'Deleted By Authenticated Account:' : 'Dihapus Oleh Akun Terautentikasi:'}
                                </label>
                                <div className="w-full bg-slate-800/70 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-xs font-semibold flex items-center justify-between gap-2">
                                    <span className="truncate">{currentUser?.staff_name || myName}</span>
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400 shrink-0">
                                        {currentUser?.is_admin ? 'Admin' : formatDeptDisplay(myDept)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end gap-2.5">
                            <button
                                type="button"
                                onClick={() => setIssueToDelete(null)}
                                disabled={isDeleting}
                                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                            >
                                {isEn ? 'Cancel' : 'Batal'}
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteConfirm}
                                disabled={isDeleting}
                                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-600/30 flex items-center gap-1.5 transition disabled:opacity-50"
                            >
                                <Trash2 className={`w-3.5 h-3.5 ${isDeleting ? 'animate-spin' : ''}`} />
                                <span>{isDeleting ? (isEn ? 'Deleting...' : 'Menghapus...') : (isEn ? 'Delete Ticket' : 'Hapus Tiket')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* UNIFIED MOBILE BOTTOM NAVIGATION */}
            <MobileBottomNav
                currentTab={viewMode === 'analytics' ? 'analytics' : 'dashboard'}
                onReport={() => setShowReportModal(true)}
                onSelectDashboard={() =>
                    handleViewModeChange(viewMode === 'analytics' ? lastListViewRef.current : viewMode)
                }
                onSelectAnalytics={() => handleViewModeChange('analytics')}
            />

            {/* MODAL 6: OFFLINE OUTBOX MODAL (HP LOCAL STORAGE QUEUE) */}
            {showOutboxModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className={`w-full max-w-lg border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col ${
                        isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
                    }`}>
                        {/* Header */}
                        <div className={`p-4 border-b flex items-center justify-between ${
                            isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
                        }`}>
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center">
                                    <CloudUpload className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {isEn ? 'Device Offline Queue (Outbox)' : 'Antrean Offline HP (Outbox)'}
                                    </h3>
                                    <p className="text-[11px] text-slate-400">
                                        {outboxTickets.length} {isEn ? 'ticket(s) saved in device memory' : 'tiket tersimpan di memori perangkat'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowOutboxModal(false)}
                                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Outbox Content List */}
                        <div className="p-4 overflow-y-auto space-y-3 flex-1">
                            {outboxTickets.length === 0 ? (
                                <div className="text-center py-8 text-slate-400">
                                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2 opacity-80" />
                                    <p className="font-bold text-xs">{isEn ? 'Queue Clean / Empty' : 'Antrean Bersih / Kosong'}</p>
                                    <p className="text-[11px] mt-0.5 max-w-xs mx-auto">
                                        {isEn
                                            ? 'All reports from this device have been sent to the Cloud server and synced to Google Sheets.'
                                            : 'Semua laporan dari HP ini telah berhasil dikirim ke server Cloud dan disinkronkan ke Google Sheets.'}
                                    </p>
                                </div>
                            ) : (
                                outboxTickets.map((item) => (
                                    <div
                                        key={item.id}
                                        className={`p-3 rounded-xl border flex gap-3 items-start justify-between transition-all ${
                                            isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200 shadow-xs'
                                        }`}
                                    >
                                        {/* Photo thumbnail */}
                                        <div className="w-14 h-14 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                                            {item.imagePreview ? (
                                                <img src={item.imagePreview} alt={isEn ? 'Photo' : 'Foto'} className="w-full h-full object-cover" />
                                            ) : (
                                                <ImageIcon className="w-5 h-5 text-slate-500" />
                                            )}
                                        </div>

                                        {/* Ticket Details */}
                                        <div className="min-w-0 flex-1">
                                            <h4 className={`font-bold text-xs truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                {item.title}
                                            </h4>
                                            <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400 mt-0.5">
                                                <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                                                <span className="truncate">{item.location}</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                                {item.target_departments?.map((d) => (
                                                    <span key={d} className="text-[9.5px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                                                        {formatDeptDisplay(d)}
                                                    </span>
                                                ))}
                                                <span className="text-[9.5px] text-slate-500 ml-auto">
                                                    {new Date(item.createdAt).toLocaleTimeString(isEn ? 'en-US' : 'id-ID', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            {item.estimated_completion_at && (
                                                <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                                    <CalendarClock className="w-2.5 h-2.5 shrink-0" />
                                                    <span>
                                                        {isEn ? 'Target:' : 'Target:'}{' '}
                                                        {formatEtaDisplayWib(item.estimated_completion_at, isEn, true)}
                                                    </span>
                                                </div>
                                            )}
                                            {item.errorMessage && (
                                                <p className="text-[10px] text-rose-400 mt-1 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/40 truncate">
                                                    {isEn ? 'Failed:' : 'Gagal:'} {item.errorMessage}
                                                </p>
                                            )}
                                        </div>

                                        {/* Delete Action */}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteOutboxItem(item.id)}
                                            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors shrink-0 cursor-pointer"
                                            title={isEn ? 'Cancel and delete this draft' : 'Batalkan dan hapus draf ini'}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Footer */}
                        <div className={`p-3.5 border-t flex items-center justify-between gap-3 ${
                            isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
                        }`}>
                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                <span className={`text-[11px] font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                    {isOnline ? (isEn ? 'Online (Ready to Send)' : 'Online (Siap Kirim)') : (isEn ? 'Offline (Waiting for Signal)' : 'Offline (Menunggu Sinyal)')}
                                </span>
                            </div>
                            {outboxTickets.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleManualSync}
                                    disabled={!isOnline || isSyncingOutbox}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                                >
                                    {isSyncingOutbox ? (
                                        <>
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                            <span>{isEn ? 'Sending...' : 'Mengirim...'}</span>
                                        </>
                                    ) : (
                                        <>
                                            <CloudUpload className="w-3.5 h-3.5" />
                                            <span>{isEn ? `Send All (${outboxTickets.length})` : `Kirim Semua (${outboxTickets.length})`}</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* FLOATING QUICK-RETURN TO TICKET BUTTON */}
            {returnTicket && viewMode === 'analytics' && (
                <div className="fixed bottom-24 md:bottom-6 right-4 sm:right-6 z-50 flex items-center gap-2 bg-slate-900/95 border border-sky-500/60 shadow-2xl shadow-sky-950/50 rounded-2xl p-2 pl-3.5 backdrop-blur-md animate-in slide-in-from-bottom-4 duration-200">
                    <button
                        type="button"
                        onClick={() => {
                            handleViewModeChange(returnTicket.previousViewMode || 'cards');
                            setSelectedDetailIssue(returnTicket.issue);
                            setReturnTicket(null);
                        }}
                        className="flex items-center gap-2 text-xs font-bold text-sky-300 hover:text-white transition-colors cursor-pointer"
                    >
                        <ArrowLeft className="w-4 h-4 text-sky-400 animate-pulse" />
                        <span>{isEn ? 'Back to Ticket' : 'Kembali ke Tiket'} #{returnTicket.issue.issue_code || returnTicket.issue.id}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setReturnTicket(null)}
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs ml-1 transition-colors cursor-pointer"
                        title={isEn ? 'Dismiss back button' : 'Tutup tombol kembali'}
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
}
