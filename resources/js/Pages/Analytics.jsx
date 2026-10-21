import axios from 'axios';
import { Head } from '@inertiajs/react';
import { useMemo, useState, useEffect, useRef, lazy, Suspense } from 'react';
import { 
    Loader2, Wrench, Sparkles, Laptop, Anchor, ShieldAlert, Utensils, Building, Hammer, Zap,
    Droplets, Building2, Bug, Tag, User, HelpCircle, Download, AlertTriangle, Layers, Database, Clock, CheckSquare, Check, Eye, ChevronRight,
    ClipboardList, PauseCircle, CheckCircle2, Filter, SlidersHorizontal, ChevronDown, ChevronUp, Archive,
    Calendar, Target, FileText, Megaphone, Globe, Palette, LayoutGrid, BarChart3, Search
} from 'lucide-react';
import anime from 'animejs';
import {
    PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList
} from 'recharts';

import { IssuesProvider, useIssues, DEFAULT_CATEGORIES } from '@/context/IssuesContext';
import { useLanguage } from '@/context/LanguageContext';
import { ALL_DEPARTMENTS, normalizeDepartment } from '@/constants/staff';
import { getDepartmentColor, getDepartmentTheme, getDepartmentTextColor, getDepartmentLightColor, getDepartmentDarkColor, getDepartmentVeryDarkColor } from '@/constants/departments';
import { CampusFixHeader } from '@/Components/CampusFix/CampusFixHeader';
import { MobileBottomNav } from '@/Components/CampusFix/MobileBottomNav';
import { ScrollToTop } from '@/Components/CampusFix/ScrollToTop';

const ExportPdfModal = lazy(() => import('@/Components/CampusFix/ExportPdfModal').then(m => ({ default: m.ExportPdfModal })));
import { MonthlyReportScheduleModal } from '@/Components/CampusFix/MonthlyReportScheduleModal';
import { ActivityDetailModal } from '@/Components/CampusFix/ActivityDetailModal';
import { EditDescriptionModal } from '@/Components/CampusFix/EditDescriptionModal';
import { TakeJobModal } from '@/Components/CampusFix/TakeJobModal';
import { ResolveIssueSheet } from '@/Components/CampusFix/ResolveIssueSheet';
import { SolvedDetailModal } from '@/Components/CampusFix/SolvedDetailModal';
import { Button } from '@/Components/UI/Button';
import { Tooltip } from '@/Components/UI/Tooltip';
import { useAuth } from '@/hooks/useAuth';

const safeArray = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
    return [];
};

export default function Analytics() {
    return (
        <IssuesProvider>
            <Head title="Analytics — Telunas Resort" />
            <AnalyticsInner />
        </IssuesProvider>
    );
}

const DEPARTMENT_ICONS = {
    'Legal': ShieldAlert,
    'Finance': Database,
    'Yayasan': Building2,
    'HR': User,
    'Procurement': ClipboardList,
    'OE': Zap,
    'IT': Laptop,
    'IT & Technology': Laptop,
    'Reservasi': Tag,
    'Sales/Marketing': Building,
    'Reservasi, Mkt, Sales': Tag,
    'GR': Building,
    'Service': Utensils,
    'Spa': Droplets,
    'F&B': Utensils,
    'Food & Beverage': Utensils,
    'Bar': Utensils,
    'Tekong': Anchor,
    'TiRek': Wrench,
    'HK': Sparkles,
    'Housekeeping': Sparkles,
    'Pest Control': Bug,
    'Fasilitas': Building2,
    'Engineer': Hammer,
    'Engineering': Hammer,
    'Maintenance': Wrench,
    'Security': ShieldAlert,
};

const DEPT_ABBREVIATIONS = {
    'engineer': 'ENG',
    'tekong': 'TKG',
    'pest control': 'PC',
    'security': 'SEC',
    'fasilitas': 'FAS',
    'hk': 'HK',
    'housekeeping': 'HK',
    'f&b': 'F&B',
    'service': 'SRV',
    'bar': 'BAR',
    'gr': 'GR',
    'guest relations': 'GR',
    'spa': 'SPA',
    'tirek': 'TRK',
    'oe': 'OE',
    'it': 'IT',
    'procurement': 'PROC',
    'sales/marketing': 'S/M',
    'sales marketing': 'S/M',
    'reservasi': 'RSV',
    'finance': 'FIN',
    'legal': 'LGL',
    'hr': 'HR',
    'human resources': 'HR',
};

const getDeptAbbreviation = (deptName) => {
    if (!deptName) return '';
    const key = deptName.toLowerCase().trim();
    if (DEPT_ABBREVIATIONS[key]) return DEPT_ABBREVIATIONS[key];
    if (deptName.length > 5) return deptName.slice(0, 4).toUpperCase();
    return deptName.toUpperCase();
};

const TIME_RANGES = [
    { id: 'all', labelKey: 'all_time', label: 'All Time' },
    { id: 'today', labelKey: 'today', label: 'Today' },
    { id: '3d', labelKey: 'days_3', label: '3 Days' },
    { id: '1w', labelKey: 'week_1', label: '1 Week' },
    { id: '2w', labelKey: 'weeks_2', label: '2 Weeks' },
    { id: '3w', labelKey: 'weeks_3', label: '3 Weeks' },
    { id: '4w', labelKey: 'weeks_4', label: '4 Weeks' },
    { id: '1m', labelKey: 'month_1', label: '1 Month' },
    { id: '3m', labelKey: 'months_3', label: '3 Months' },
    { id: '6m', labelKey: 'months_6', label: '6 Months' },
    { id: '1y', labelKey: 'year_1', label: '1 Year' },
];

const COLORS = [
    '#f59e0b', '#3b82f6', '#eab308', '#57534e', '#15803d', 
    '#7c3aed', '#0891b2', '#dc2626', '#db2777', '#94a3b8'
];


const CustomDepartmentBar = (props) => {
    const { x, y, width, height, payload, index, selectedDepartmentFilters = [] } = props;
    if (!width || !height || height <= 0) return null;

    const deptName = payload?.name || '';
    const IconComponent = DEPARTMENT_ICONS[deptName] || Wrench;
    const barColor = getDepartmentColor(deptName, index);
    const isSelected = selectedDepartmentFilters.some(d => d.toLowerCase() === deptName.toLowerCase());

    const iconSize = Math.min(Math.max(width * 0.45, 16), 30);
    const centerX = x + width / 2;
    const centerY = height > iconSize + 8 ? y + Math.min(height / 2, 35) : y + height / 2;
    const textColor = getDepartmentTextColor(deptName);

    return (
        <g style={{ cursor: 'pointer' }}>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                rx={6}
                ry={6}
                fill={barColor}
                stroke={isSelected ? '#F59E0B' : 'transparent'}
                strokeWidth={isSelected ? 3 : 0}
                opacity={selectedDepartmentFilters.length > 0 ? (isSelected ? 1 : 0.45) : 1}
                className="transition-all duration-200"
            />
            {height > 14 && (
                <g 
                    transform={`translate(${centerX}, ${centerY}) rotate(-30)`}
                    style={{ pointerEvents: 'none' }}
                >
                    <g transform={`translate(${-iconSize / 2}, ${-iconSize / 2})`}>
                        <IconComponent 
                            size={iconSize} 
                            color={textColor} 
                            opacity={0.45} 
                            strokeWidth={2.2} 
                        />
                    </g>
                </g>
            )}
        </g>
    );
};

function AnalyticsInner() {
    const { issues, loading: contextLoading, error, fetchIssues, availableSheets, currentSheet } = useIssues();
    const { isAdmin, isHOD, isDeptUser, department, canAccessAnalytics, canExportReports, canViewAllDepartments } = useAuth();
    const [selectedSheets, setSelectedSheets] = useState(() => {
        return currentSheet ? [currentSheet] : (availableSheets && availableSheets.length > 0 ? [availableSheets[0]] : ['2026']);
    });
    const [sheetDataMap, setSheetDataMap] = useState({});
    const [fetchingSheets, setFetchingSheets] = useState({});

    // Populate cache with currentSheet data when available
    useEffect(() => {
        if (currentSheet && issues && issues.length >= 0) {
            setSheetDataMap(prev => ({ ...prev, [currentSheet]: issues }));
        }
    }, [currentSheet, issues]);

    // Ensure selectedSheets initializes when availableSheets or currentSheet becomes ready
    useEffect(() => {
        if (selectedSheets.length === 0) {
            if (currentSheet) {
                setSelectedSheets([currentSheet]);
            } else if (availableSheets && availableSheets.length > 0) {
                setSelectedSheets([availableSheets[0]]);
            }
        }
    }, [availableSheets, currentSheet, selectedSheets.length]);

    // Fetch missing sheets dynamically when selectedSheets changes
    useEffect(() => {
        const fetchMissing = async () => {
            for (const sheet of selectedSheets) {
                if (!sheetDataMap[sheet] && !fetchingSheets[sheet]) {
                    setFetchingSheets(prev => ({ ...prev, [sheet]: true }));
                    try {
                        const res = await axios.get('/api/issues', { params: { sheet } });
                        if (res.data?.success) {
                            setSheetDataMap(prev => ({ ...prev, [sheet]: res.data.data }));
                        }
                    } catch (e) {
                        console.error('Failed to fetch sheet data for:', sheet, e);
                    } finally {
                        setFetchingSheets(prev => ({ ...prev, [sheet]: false }));
                    }
                }
            }
        };
        fetchMissing();
    }, [selectedSheets, sheetDataMap, fetchingSheets]);

    // Combined issues from all selected sheets (strictly scoped to department for dept users, ALWAYS including island-wide emergency alerts)
    const combinedIssues = useMemo(() => {
        if (!selectedSheets || selectedSheets.length === 0) return issues || [];
        let all = [];
        const seenIds = new Set();
        selectedSheets.forEach(sheetName => {
            const list = sheetDataMap[sheetName] || (sheetName === currentSheet ? issues : []);
            list.forEach(item => {
                const uniqueKey = `${sheetName}-${item.id}`;
                if (!seenIds.has(uniqueKey)) {
                    seenIds.add(uniqueKey);
                    all.push({ ...item, _sheet: sheetName, isArchived: false });
                }
            });
        });

        if (isDeptUser && department && !canViewAllDepartments) {
            const userDeptNorm = normalizeDepartment(department).toLowerCase();
            return all.filter(issue => {
                // 🚨 Emergency & critical fast-track issues are island-wide alerts, ALWAYS in scope for everyone!
                const isEmergency = (issue.category || '').toLowerCase() === 'emergency'
                    || String(issue.id || '').startsWith('SOS')
                    || safeArray(issue.assignedDepartments).some(d => String(d).trim().toUpperCase() === 'ALL')
                    || safeArray(issue.taggedDepartments).some(d => String(d).trim().toUpperCase() === 'ALL');

                if (isEmergency) return true;

                const assigned = safeArray(issue.assignedDepartments).map(d => normalizeDepartment(d).toLowerCase());
                const tagged = safeArray(issue.taggedDepartments).map(d => normalizeDepartment(d).toLowerCase());
                const originDept = normalizeDepartment(issue.department || '').toLowerCase();

                return assigned.includes(userDeptNorm) || tagged.includes(userDeptNorm) || originDept === userDeptNorm;
            });
        }
        return all;
    }, [selectedSheets, sheetDataMap, currentSheet, issues, isDeptUser, department, canViewAllDepartments]);

    const isFetchingAnySheet = Object.values(fetchingSheets).some(Boolean);
    const loading = contextLoading && combinedIssues.length === 0 && !error;

    const toggleSheet = (sheetName) => {
        if (selectedSheets.includes(sheetName)) {
            // Keep at least one sheet selected
            if (selectedSheets.length === 1) return;
            setSelectedSheets(prev => prev.filter(s => s !== sheetName));
        } else {
            setSelectedSheets(prev => [...prev, sheetName]);
        }
    };

    const toggleAllSheets = () => {
        const allList = availableSheets && availableSheets.length > 0 ? availableSheets : [currentSheet || '2026'];
        if (selectedSheets.length === allList.length) {
            setSelectedSheets(currentSheet ? [currentSheet] : [allList[0]]);
        } else {
            setSelectedSheets([...allList]);
        }
    };

    // Time Range Filter State ('all' | 'today' | '3d' | '1w' | '2w' | '3w' | '4w' | '1m' | '3m' | '6m' | '1y')
    const [timeRange, setTimeRange] = useState('all');
    const [deptLimit, setDeptLimit] = useState(10); // 5 | 10 | 15 | 20 | 'all'

    const timeFilteredIssues = useMemo(() => {
        if (!combinedIssues || combinedIssues.length === 0) return [];
        if (timeRange === 'all') return combinedIssues;

        const now = Date.now();
        const MS_PER_DAY = 24 * 60 * 60 * 1000;

        let cutoff = 0;

        if (timeRange === 'today') {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            cutoff = startOfToday.getTime();
        } else if (timeRange === '3d') {
            cutoff = now - 3 * MS_PER_DAY;
        } else if (timeRange === '1w') {
            cutoff = now - 7 * MS_PER_DAY;
        } else if (timeRange === '2w') {
            cutoff = now - 14 * MS_PER_DAY;
        } else if (timeRange === '3w') {
            cutoff = now - 21 * MS_PER_DAY;
        } else if (timeRange === '4w') {
            cutoff = now - 28 * MS_PER_DAY;
        } else if (timeRange === '1m') {
            cutoff = now - 30 * MS_PER_DAY;
        } else if (timeRange === '3m') {
            cutoff = now - 90 * MS_PER_DAY;
        } else if (timeRange === '6m') {
            cutoff = now - 180 * MS_PER_DAY;
        } else if (timeRange === '1y') {
            cutoff = now - 365 * MS_PER_DAY;
        }

        return combinedIssues.filter(issue => {
            const rawTime = issue.isArchived
                ? (issue.archivedAt || (issue.archivedAtStr ? new Date(issue.archivedAtStr).getTime() : issue.reportedAt))
                : (issue.reportedAt || (issue.reportedAtIso ? new Date(issue.reportedAtIso).getTime() : 0));
            if (!rawTime) return true; // Keep if date is unspecified
            return rawTime >= cutoff;
        });
    }, [combinedIssues, timeRange]);
    const { t, lang } = useLanguage();
    const [timelineLimit, setTimelineLimit] = useState(20);
    const [searchQuery, setSearchQuery] = useState('');
    const [exportOpen, setExportOpen] = useState(false);
    const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
    const [selectedActivityIssue, setSelectedActivityIssue] = useState(null);
    const [cardModalTarget, setCardModalTarget] = useState(null);
    const [editTarget, setEditTarget] = useState(null);

    const handleOpenIssueCard = (issue) => {
        setCardModalTarget(issue);
    };
    const [selectedStatusFilters, setSelectedStatusFilters] = useState([]);
    const [showArchivedInTimeline, setShowArchivedInTimeline] = useState(false);
    // Department filter: empty by default so it shows all issues within the user's scope
    const [selectedDepartmentFilters, setSelectedDepartmentFilters] = useState([]);
    const [deptFilterMode, setDeptFilterMode] = useState('assigned');
    const [allRelatedViewType, setAllRelatedViewType] = useState('matrix'); // 'matrix' | 'chart'
    const [allRelatedSort, setAllRelatedSort] = useState('total'); // 'total' | 'incoming' | 'outgoing' | 'tagged'
    const [allRelatedSearch, setAllRelatedSearch] = useState('');
    const [deptColorMode, setDeptColorMode] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('telunas_dept_chart_color_mode_v2');
            if (saved === 'status' || saved === 'dept') {
                return saved;
            }
        }
        return 'status';
    });

    const handleSetDeptColorMode = (mode) => {
        setDeptColorMode(mode);
        if (typeof window !== 'undefined') {
            localStorage.setItem('telunas_dept_chart_color_mode_v2', mode);
        }
    };
    const [showDetailedFilters, setShowDetailedFilters] = useState(false);
    const timelineRef = useRef(null);
    const chartsContainerRef = useRef(null);
    const recentActivityRef = useRef(null);
    const [chartsVisible, setChartsVisible] = useState(true);
    const prevTimelineHash = useRef('');

    const activeDetailedFilterCount = selectedDepartmentFilters.length;

    const handleDepartmentBarClick = (entry) => {
        const deptName = entry?.name || entry?.payload?.name;
        if (!deptName) return;
        setSelectedDepartmentFilters(prev => {
            const lower = deptName.toLowerCase();
            const exists = prev.some(d => d.toLowerCase() === lower);
            return exists ? prev.filter(d => d.toLowerCase() !== lower) : [...prev, deptName];
        });
        recentActivityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Precomputed stats for the mini stat filter cards in Recent Activity
    const analyticsStats = useMemo(() => {
        const list = timeFilteredIssues || [];
        const currentDisplayList = list;

        const isEmergency = (i) => String(i.id || '').toUpperCase().startsWith('SOS') || (i.category || '').toLowerCase() === 'emergency';
        const emergencyList = currentDisplayList.filter(isEmergency);

        return {
            total: currentDisplayList.length,
            open: currentDisplayList.filter(i => i.status === 'open').length,
            progress: currentDisplayList.filter(i => i.status === 'progress').length,
            pending: currentDisplayList.filter(i => i.status === 'pending').length,
            solved: currentDisplayList.filter(i => i.status === 'solved').length,
            archived: 0,
            emergencyTotal: emergencyList.length,
            emergencyActive: emergencyList.filter(i => i.status !== 'solved').length,
            emergencySolved: emergencyList.filter(i => i.status === 'solved').length,
        };
    }, [timeFilteredIssues]);



    const analyticsCards = [
        {
            key: 'total_reports',
            status: 'all',
            label: t('total_reports') || 'Total Reports',
            value: analyticsStats.total,
            Icon: ClipboardList,
            accent: 'bg-primary/10 text-primary',
            activeRing: 'ring-primary border-primary shadow-[0_0_12px_rgba(201,170,113,0.25)]',
            activeAccent: 'bg-primary/25 text-primary',
        },
        {
            key: 'needs_fixing',
            status: 'open',
            label: t('needs_fixing') || 'Needs Fixing',
            value: analyticsStats.open,
            Icon: AlertTriangle,
            accent: 'bg-[var(--status-open)]/15 text-status-open',
            activeRing: 'ring-status-open border-status-open shadow-[0_0_12px_rgba(245,158,11,0.25)]',
            activeAccent: 'bg-status-open/30 text-status-open',
        },
        {
            key: 'in_progress',
            status: 'progress',
            label: t('in_progress') || 'In Progress',
            value: analyticsStats.progress,
            Icon: Clock,
            accent: 'bg-[var(--status-progress)]/20 text-status-progress',
            activeRing: 'ring-status-progress border-status-progress shadow-[0_0_12px_rgba(59,130,246,0.25)]',
            activeAccent: 'bg-status-progress/35 text-status-progress',
        },
        {
            key: 'pending',
            status: 'pending',
            label: t('pending') || 'Pending',
            value: analyticsStats.pending,
            Icon: PauseCircle,
            accent: 'bg-status-pending/20 text-status-pending',
            activeRing: 'ring-status-pending border-status-pending shadow-[0_0_12px_rgba(249,115,22,0.25)]',
            activeAccent: 'bg-status-pending/35 text-status-pending',
        },
        {
            key: 'resolved',
            status: 'solved',
            label: t('resolved') || 'Resolved',
            value: analyticsStats.solved,
            Icon: CheckCircle2,
            accent: 'bg-[var(--status-solved)]/15 text-status-solved',
            activeRing: 'ring-status-solved border-status-solved shadow-[0_0_12px_rgba(16,185,129,0.25)]',
            activeAccent: 'bg-status-solved/30 text-status-solved',
        },
        {
            key: 'emergency',
            status: 'emergency',
            label: lang === 'id' ? 'Insiden Darurat' : 'Emergency SOS',
            value: analyticsStats.emergencyTotal,
            badge: analyticsStats.emergencyActive > 0 
                ? (lang === 'id' ? `${analyticsStats.emergencyActive} aktif` : `${analyticsStats.emergencyActive} active`)
                : null,
            Icon: AlertTriangle,
            accent: 'bg-red-500/15 text-red-400',
            activeRing: 'ring-red-500 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.35)]',
            activeAccent: 'bg-red-500/30 text-red-400',
        },
    ];

    const handleStatusCardClick = (status) => {
        if (status === 'all') {
            setSelectedStatusFilters([]);
        } else {
            setSelectedStatusFilters(prev => {
                if (prev.length === 1 && prev[0] === status) {
                    return [];
                }
                return [status];
            });
        }
    };

    // Intersection Observer for Scroll Animation (Charts)
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setChartsVisible(true);
                }
            },
            { threshold: 0.05 }
        );

        if (chartsContainerRef.current) {
            observer.observe(chartsContainerRef.current);
        }

        return () => observer.disconnect();
    }, []);


    const departmentData = useMemo(() => {
        if (!timeFilteredIssues || timeFilteredIssues.length === 0) return [];
        const counts = {};
        const userDeptNorm = isDeptUser && department ? normalizeDepartment(department).toLowerCase() : null;

        const getIssueState = (issue) => {
            if (issue.status === 'solved') return 'solved';
            if (issue.status === 'open') return 'unclaimed';
            return 'inProgress'; // 'progress', 'pending', etc.
        };

        const addDeptCount = (deptName, state) => {
            if (!deptName) return;
            const trimmed = deptName.trim();
            const lower = trimmed.toLowerCase();
            if (!trimmed || lower === 'emergency' || lower === 'undefined' || lower === 'unknown' || lower === 'all' || lower === 'none') return;
            if (!counts[trimmed]) {
                counts[trimmed] = { total: 0, unclaimed: 0, inProgress: 0, solved: 0 };
            }
            counts[trimmed].total += 1;
            if (state === 'solved') {
                counts[trimmed].solved += 1;
            } else if (state === 'inProgress') {
                counts[trimmed].inProgress += 1;
            } else {
                counts[trimmed].unclaimed += 1;
            }
        };

        timeFilteredIssues.filter(i => !i.isArchived).forEach(issue => {
            const state = getIssueState(issue);

            if (isDeptUser && userDeptNorm) {
                // =========================================================================
                // DEPARTMENT USER PERSPECTIVE (Incoming vs Outgoing vs Tagged vs All Scope)
                // =========================================================================
                const rawOrigin = (issue.department || '').trim();
                const originNorm = normalizeDepartment(rawOrigin).toLowerCase();
                const assigns = safeArray(issue.assignedDepartments).map(d => (d || '').trim()).filter(Boolean);
                const tags = safeArray(issue.taggedDepartments).map(d => (d || '').trim()).filter(Boolean);

                if (deptFilterMode === 'assigned') {
                    // INCOMING (Pekerjaan Masuk untuk kita): Siapa yang melapor / menugaskan tiket ke departemen kita?
                    const isAssignedToMe = assigns.some(d => normalizeDepartment(d).toLowerCase() === userDeptNorm) || (assigns.length === 0 && originNorm === userDeptNorm);
                    if (isAssignedToMe) {
                        addDeptCount(rawOrigin || 'Unknown', state);
                    }
                } else if (deptFilterMode === 'origin') {
                    // OUTGOING (Permintaan Keluar dari kita): Tiket yang dilaporkan oleh kita ditugaskan ke departemen mana?
                    if (originNorm === userDeptNorm) {
                        if (assigns.length > 0) {
                            assigns.forEach(d => addDeptCount(d, state));
                        } else {
                            addDeptCount(rawOrigin || department, state);
                        }
                    }
                } else if (deptFilterMode === 'tagged') {
                    // TAGGED (Di-tag / CC): Siapa pelapor tiket di mana kita di-tag?
                    const isTaggedMe = tags.some(d => normalizeDepartment(d).toLowerCase() === userDeptNorm);
                    if (isTaggedMe) {
                        addDeptCount(rawOrigin, state);
                    }
                } else {
                    // ALL SCOPE: Seluruh departemen yang berinteraksi dengan kita
                    const partnerDepts = new Set();
                    if (rawOrigin && !['emergency', 'undefined', 'unknown'].includes(originNorm)) {
                        partnerDepts.add(rawOrigin);
                    }
                    assigns.forEach(d => { if (d && d !== 'ALL') partnerDepts.add(d); });
                    tags.forEach(d => { if (d && d !== 'ALL' && d !== 'None') partnerDepts.add(d); });
                    partnerDepts.forEach(d => addDeptCount(d, state));
                }
            } else {
                // =========================================================================
                // ADMIN MACRO PERSPECTIVE (Resort-wide Workload & Reporting)
                // =========================================================================
                if (deptFilterMode === 'origin') {
                    addDeptCount(issue.department, state);
                } else if (deptFilterMode === 'tagged') {
                    safeArray(issue.taggedDepartments).forEach(d => addDeptCount(d, state));
                } else if (deptFilterMode === 'all') {
                    const depts = new Set();
                    const rawOrigin = (issue.department || '').trim();
                    if (rawOrigin && !['emergency', 'undefined', 'unknown'].includes(rawOrigin.toLowerCase())) {
                        depts.add(rawOrigin);
                    }
                    safeArray(issue.assignedDepartments).forEach(d => { if (d && d !== 'ALL') depts.add(d); });
                    safeArray(issue.taggedDepartments).forEach(d => { if (d && d !== 'ALL' && d !== 'None') depts.add(d); });
                    depts.forEach(dept => addDeptCount(dept, state));
                } else {
                    // Default: 'assigned'
                    const assigns = safeArray(issue.assignedDepartments);
                    if (assigns.length > 0) {
                        assigns.forEach(d => addDeptCount(d, state));
                    } else {
                        addDeptCount(issue.department, state);
                    }
                }
            }
        });

        const totalDepts = Object.keys(counts).length;
        const sorted = Object.keys(counts)
            .map(dept => {
                const shortName = getDeptAbbreviation(dept);
                const stat = counts[dept];
                const total = stat.total || 0;
                const unclaimed = stat.unclaimed || 0;
                const inProgress = stat.inProgress || 0;
                const solved = stat.solved || 0;
                const handled = inProgress + solved;
                const solvedPct = handled > 0 ? Math.round((solved / handled) * 100) : 0;
                return { 
                    name: dept, 
                    shortName: shortName,
                    displayName: totalDepts > 6 ? shortName : dept,
                    Issues: total,
                    total: total,
                    unclaimed: unclaimed,
                    inProgress: inProgress,
                    solved: solved,
                    handled: handled,
                    solvedPct: solvedPct,
                };
            })
            .sort((a, b) => b.Issues - a.Issues);

        if (deptLimit === 'all') return sorted;
        return sorted.slice(0, Number(deptLimit));
    }, [timeFilteredIssues, deptLimit, deptFilterMode, isDeptUser, department]);

    const deptSummaryStats = useMemo(() => {
        let unclaimed = 0;
        let inProgress = 0;
        let solved = 0;
        departmentData.forEach(d => {
            unclaimed += (d.unclaimed || 0);
            inProgress += (d.inProgress || 0);
            solved += (d.solved || 0);
        });
        return { 
            unclaimed, 
            inProgress, 
            solved, 
            handled: inProgress + solved, 
            total: unclaimed + inProgress + solved 
        };
    }, [departmentData]);

    // Detailed Role Matrix Data for "Semua Terkait"
    const allRelatedMatrixData = useMemo(() => {
        if (!timeFilteredIssues || timeFilteredIssues.length === 0) return [];

        const matrix = {};

        const getIssueState = (issue) => {
            if (issue.status === 'solved') return 'solved';
            if (issue.status === 'open') return 'unclaimed';
            return 'inProgress';
        };

        const initDept = (deptName) => {
            if (!deptName) return null;
            const trimmed = deptName.trim();
            const lower = trimmed.toLowerCase();
            if (!trimmed || ['emergency', 'undefined', 'unknown', 'all', 'none'].includes(lower)) return null;
            if (!matrix[trimmed]) {
                matrix[trimmed] = {
                    name: trimmed,
                    shortName: getDeptAbbreviation(trimmed),
                    totalRelated: 0,
                    // 1. Tugas Masuk (Workload to resolve)
                    incoming: {
                        total: 0,
                        unclaimed: 0,
                        inProgress: 0,
                        solved: 0,
                    },
                    // 2. Laporan Keluar (Outbound requests to other depts)
                    outgoing: {
                        total: 0,
                        unclaimed: 0,
                        inProgress: 0,
                        solved: 0,
                    },
                    // 3. Ditandai (Tagged / CC)
                    tagged: {
                        total: 0,
                        unclaimed: 0,
                        inProgress: 0,
                        solved: 0,
                    },
                    // 4. Internal (Dibuat & Dikerjakan oleh dept yang sama)
                    internal: {
                        total: 0,
                        unclaimed: 0,
                        inProgress: 0,
                        solved: 0,
                    }
                };
            }
            return matrix[trimmed];
        };

        timeFilteredIssues.filter(i => !i.isArchived).forEach(issue => {
            const state = getIssueState(issue);
            const rawOrigin = (issue.department || '').trim();
            const originNorm = normalizeDepartment(rawOrigin).toLowerCase();
            const isValidOrigin = rawOrigin && !['emergency', 'undefined', 'unknown', 'all', 'none'].includes(originNorm);

            const assigns = safeArray(issue.assignedDepartments)
                .map(d => (d || '').trim())
                .filter(d => d && !['ALL', 'none', 'undefined', 'unknown'].includes(d.toLowerCase()));

            const tags = safeArray(issue.taggedDepartments)
                .map(d => (d || '').trim())
                .filter(d => d && !['ALL', 'none', 'None', 'undefined', 'unknown'].includes(d.toLowerCase()));

            const touchedInThisIssue = new Set();

            // A. Check Assigned Departments (Tugas Masuk)
            if (assigns.length > 0) {
                assigns.forEach(assignedDept => {
                    const assignedDeptObj = initDept(assignedDept);
                    if (assignedDeptObj) {
                        const isSelfHandled = isValidOrigin && normalizeDepartment(assignedDept).toLowerCase() === originNorm;
                        if (isSelfHandled) {
                            assignedDeptObj.internal.total += 1;
                            assignedDeptObj.internal[state] += 1;
                            assignedDeptObj.incoming.total += 1;
                            assignedDeptObj.incoming[state] += 1;
                        } else {
                            assignedDeptObj.incoming.total += 1;
                            assignedDeptObj.incoming[state] += 1;
                        }
                        touchedInThisIssue.add(assignedDeptObj.name);
                    }
                });
            } else if (isValidOrigin) {
                // If no assigned departments specified, origin dept is responsible
                const originDeptObj = initDept(rawOrigin);
                if (originDeptObj) {
                    originDeptObj.internal.total += 1;
                    originDeptObj.internal[state] += 1;
                    originDeptObj.incoming.total += 1;
                    originDeptObj.incoming[state] += 1;
                    touchedInThisIssue.add(originDeptObj.name);
                }
            }

            // B. Check Origin Department (Laporan Keluar)
            if (isValidOrigin) {
                const originDeptObj = initDept(rawOrigin);
                if (originDeptObj) {
                    const hasExternalAssignees = assigns.some(d => normalizeDepartment(d).toLowerCase() !== originNorm);
                    if (hasExternalAssignees) {
                        originDeptObj.outgoing.total += 1;
                        originDeptObj.outgoing[state] += 1;
                    }
                    touchedInThisIssue.add(originDeptObj.name);
                }
            }

            // C. Check Tagged Departments (Ditandai / CC)
            tags.forEach(taggedDept => {
                const taggedDeptObj = initDept(taggedDept);
                if (taggedDeptObj) {
                    taggedDeptObj.tagged.total += 1;
                    taggedDeptObj.tagged[state] += 1;
                    touchedInThisIssue.add(taggedDeptObj.name);
                }
            });

            // Increment totalRelated uniquely per issue for each involved department
            touchedInThisIssue.forEach(deptName => {
                if (matrix[deptName]) {
                    matrix[deptName].totalRelated += 1;
                }
            });
        });

        // Convert to array and calculate rates
        let list = Object.values(matrix).map(item => {
            const incomingDoneRate = item.incoming.total > 0 ? Math.round((item.incoming.solved / item.incoming.total) * 100) : 0;
            const outgoingDoneRate = item.outgoing.total > 0 ? Math.round((item.outgoing.solved / item.outgoing.total) * 100) : 0;
            return {
                ...item,
                incomingDoneRate,
                outgoingDoneRate
            };
        });

        // Filtering by search
        if (allRelatedSearch.trim()) {
            const q = allRelatedSearch.trim().toLowerCase();
            list = list.filter(item => 
                item.name.toLowerCase().includes(q) || 
                item.shortName.toLowerCase().includes(q)
            );
        }

        // Sorting
        list.sort((a, b) => {
            if (allRelatedSort === 'incoming') {
                return b.incoming.total - a.incoming.total || b.totalRelated - a.totalRelated;
            }
            if (allRelatedSort === 'outgoing') {
                return b.outgoing.total - a.outgoing.total || b.totalRelated - a.totalRelated;
            }
            if (allRelatedSort === 'tagged') {
                return b.tagged.total - a.tagged.total || b.totalRelated - a.totalRelated;
            }
            return b.totalRelated - a.totalRelated || b.incoming.total - a.incoming.total;
        });

        return list;
    }, [timeFilteredIssues, allRelatedSort, allRelatedSearch]);

    const allRelatedMacroSummary = useMemo(() => {
        let totalInteractions = 0;
        let incomingTotal = 0;
        let outgoingTotal = 0;
        let taggedTotal = 0;
        let internalTotal = 0;

        allRelatedMatrixData.forEach(d => {
            totalInteractions += d.totalRelated;
            incomingTotal += d.incoming.total;
            outgoingTotal += d.outgoing.total;
            taggedTotal += d.tagged.total;
            internalTotal += d.internal.total;
        });

        return {
            totalInteractions,
            incomingTotal,
            outgoingTotal,
            taggedTotal,
            internalTotal
        };
    }, [allRelatedMatrixData]);

    // Intelligent integer Y-Axis configuration without decimals
    const deptYAxisConfig = useMemo(() => {
        if (!departmentData || departmentData.length === 0) {
            return { domain: [0, 5], ticks: [0, 1, 2, 3, 4, 5] };
        }

        const maxVal = Math.max(
            ...departmentData.map(d => Math.max(d.unclaimed || 0, (d.inProgress || 0) + (d.solved || 0))),
            0
        );

        if (maxVal <= 0) {
            return { domain: [0, 5], ticks: [0, 1, 2, 3, 4, 5] };
        }

        let step = 1;
        if (maxVal <= 5) {
            step = 1;
        } else if (maxVal <= 10) {
            step = 2;
        } else if (maxVal <= 25) {
            step = 5;
        } else if (maxVal <= 50) {
            step = 10;
        } else if (maxVal <= 100) {
            step = 20;
        } else {
            const roughStep = maxVal / 5;
            const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
            const normalized = roughStep / magnitude;
            if (normalized <= 1.5) step = magnitude;
            else if (normalized <= 3.5) step = 2 * magnitude;
            else if (normalized <= 7.5) step = 5 * magnitude;
            else step = 10 * magnitude;
        }

        step = Math.max(1, Math.round(step));
        const maxTick = Math.ceil(maxVal / step) * step;
        const ticks = [];
        for (let i = 0; i <= maxTick; i += step) {
            ticks.push(i);
        }

        return { domain: [0, maxTick], ticks };
    }, [departmentData]);

    // Bar 1 (Belum Diambil) Label Renderer: inside number & top total
    const renderUnclaimedBarLabels = (props) => {
        const { x, y, width, height, value } = props;
        if (!value || value <= 0) return null;
        const isTallEnough = height >= 14;

        return (
            <g pointerEvents="none">
                {isTallEnough && (
                    <text
                        x={x + width / 2}
                        y={y + height / 2}
                        fill="#FFFFFF"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={10}
                        fontWeight="bold"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
                    >
                        {value}
                    </text>
                )}
                <text
                    x={x + width / 2}
                    y={y - 5}
                    fill="#C9AA71"
                    textAnchor="middle"
                    dominantBaseline="auto"
                    fontSize={11}
                    fontWeight="bold"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95)' }}
                >
                    {value}
                </text>
            </g>
        );
    };

    // Bar 2 Lower (Sedang Dikerjakan) Label Renderer: inside number & top total if solved == 0
    const renderInProgressBarLabels = (props) => {
        const { x, y, width, height, value, index } = props;
        const entry = departmentData[index];
        const inProgressVal = entry ? entry.inProgress : value;
        if (!inProgressVal || inProgressVal <= 0) return null;
        const isTopSegment = !entry || (entry.solved || 0) === 0;

        return (
            <g pointerEvents="none">
                {height >= 14 && (
                    <text
                        x={x + width / 2}
                        y={y + height / 2}
                        fill="#FFFFFF"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={10}
                        fontWeight="bold"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
                    >
                        {inProgressVal}
                    </text>
                )}
                {isTopSegment && (
                    <text
                        x={x + width / 2}
                        y={y - 5}
                        fill="#C9AA71"
                        textAnchor="middle"
                        dominantBaseline="auto"
                        fontSize={11}
                        fontWeight="bold"
                        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95)' }}
                    >
                        {inProgressVal}
                    </text>
                )}
            </g>
        );
    };

    // Bar 2 Upper (Sudah Selesai) Label Renderer: inside number & top total handled
    const renderSolvedBarLabels = (props) => {
        const { x, y, width, height, value, index } = props;
        const entry = departmentData[index];
        const solvedVal = entry ? entry.solved : value;
        if (!solvedVal || solvedVal <= 0) return null;
        const handledTotal = entry ? (entry.inProgress || 0) + (entry.solved || 0) : value;

        return (
            <g pointerEvents="none">
                {height >= 14 && (
                    <text
                        x={x + width / 2}
                        y={y + height / 2}
                        fill="#FFFFFF"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={10}
                        fontWeight="bold"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
                    >
                        {solvedVal}
                    </text>
                )}
                <text
                    x={x + width / 2}
                    y={y - 5}
                    fill="#C9AA71"
                    textAnchor="middle"
                    dominantBaseline="auto"
                    fontSize={11}
                    fontWeight="bold"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95)' }}
                >
                    {handledTotal}
                </text>
            </g>
        );
    };

    // Timeline Data -> Activity Log
    const activityLog = useMemo(() => {
        if (!timeFilteredIssues || timeFilteredIssues.length === 0) return [];
        
        let events = [];
        
        timeFilteredIssues.forEach(issue => {
            if (issue.isArchived) {
                if (!isAdmin || !showArchivedInTimeline) return;

                const currentYear = new Date().getFullYear();
                let dateStr = String(issue.archivedAtStr || '').trim();
                const noYearMatch = dateStr.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{1,2})[:\.](\d{1,2})(?:[:\.](\d{1,2}))?/i);
                if (noYearMatch) {
                    const secPart = noYearMatch[5] ? `:${noYearMatch[5]}` : ':00';
                    dateStr = `${noYearMatch[1]} ${noYearMatch[2]}, ${currentYear} ${noYearMatch[3]}:${noYearMatch[4]}${secPart}`;
                }
                const parsedArchiveTime = dateStr ? new Date(dateStr).getTime() : (issue.archivedAt || issue.reportedAt || Date.now());
                const archiveTime = isNaN(parsedArchiveTime) ? (issue.archivedAt || issue.reportedAt || Date.now()) : parsedArchiveTime;

                events.push({
                    id: `${issue.id}-archived`,
                    issueId: issue.id,
                    title: issue.title,
                    type: 'archive',
                    date: archiveTime,
                    person: issue.archivedBy && issue.archivedBy !== 'Staff' && issue.archivedBy !== 'Admin / Staff' ? issue.archivedBy : 'Admin',
                    reason: lang === 'id' ? 'Isu diarsipkan oleh Admin' : 'Issue archived by Admin',
                    originalIssue: issue,
                });
                return;
            }

            const rawTime = issue.reportedAt || (issue.reportedAtIso ? new Date(issue.reportedAtIso).getTime() : 0) || Date.now();
            const issueEvents = [];
            
            // 1. Created
            if (rawTime) {
                issueEvents.push({
                    id: `${issue.id}-created`,
                    issueId: issue.id,
                    title: issue.title,
                    type: 'create',
                    date: rawTime,
                    person: issue.reporter || 'Anonymous',
                    originalIssue: issue
                });
            }
            
            // Track all claims (both logged in editLogs, inferred from rollbacks, and active)
            const recordedClaimPersons = new Set();

            // 2. Edit & Claim & Status Reversion Events from editLogs
            if (Array.isArray(issue.editLogs) && issue.editLogs.length > 0) {
                issue.editLogs.forEach((log, logIdx) => {
                    const currentYear = new Date().getFullYear();
                    let dateStr = String(log.date || '').trim();
                    const noYearMatch = dateStr.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{1,2})[:\.](\d{1,2})(?:[:\.](\d{1,2}))?/i);
                    if (noYearMatch) {
                        const secPart = noYearMatch[5] ? `:${noYearMatch[5]}` : ':00';
                        dateStr = `${noYearMatch[1]} ${noYearMatch[2]}, ${currentYear} ${noYearMatch[3]}:${noYearMatch[4]}${secPart}`;
                    }
                    const parsedTime = dateStr ? new Date(dateStr).getTime() : (rawTime + 3000);
                    const baseTime = isNaN(parsedTime) ? (rawTime + 3000) : parsedTime;
                    const validTime = baseTime + (logIdx * 500);

                    if (log.type === 'claim') {
                        recordedClaimPersons.add(log.by);
                        issueEvents.push({
                            id: `${issue.id}-claim-log-${logIdx}`,
                            issueId: issue.id,
                            title: issue.title,
                            type: 'claim',
                            date: validTime,
                            person: `${log.by || 'Technician'}${log.dept ? ` (${log.dept})` : ''}`,
                            originalIssue: issue
                        });
                    } else if (log.type === 'solve') {
                        issueEvents.push({
                            id: `${issue.id}-solve-log-${logIdx}`,
                            issueId: issue.id,
                            title: issue.title,
                            type: 'solve',
                            date: validTime,
                            person: `${log.by || 'Technician'}${log.dept ? ` (${log.dept})` : ''}`,
                            originalIssue: issue
                        });
                    } else {
                        const isRevert = log.type === 'revert_status' || log.type === 'revert_and_edit';

                        // Inferred claim if staff rolled back without prior explicit claim log
                        if (isRevert && (
                            log.from === 'progress' || 
                            log.from === 'pending' ||
                            String(log.changes).toLowerCase().includes('progress ➔') ||
                            String(log.statusChange).toLowerCase().includes('progress →')
                        )) {
                            if (!recordedClaimPersons.has(log.by)) {
                                recordedClaimPersons.add(log.by);
                                issueEvents.push({
                                    id: `${issue.id}-claim-inferred-${logIdx}`,
                                    issueId: issue.id,
                                    title: issue.title,
                                    type: 'claim',
                                    date: validTime - 60000,
                                    person: `${log.by || 'Technician'}${log.dept ? ` (${log.dept})` : ''}`,
                                    originalIssue: issue
                                });
                            }
                        }

                        // Inferred solved milestone if staff rolled back from solved
                        if (isRevert && (
                            log.from === 'solved' || 
                            String(log.changes).toLowerCase().includes('solved ➔') ||
                            String(log.statusChange).toLowerCase().includes('solved →')
                        )) {
                            issueEvents.push({
                                id: `${issue.id}-solved-inferred-${logIdx}`,
                                issueId: issue.id,
                                title: issue.title,
                                type: 'solve',
                                date: validTime - 60000,
                                person: `${log.by || 'Technician'}${log.dept ? ` (${log.dept})` : ''}`,
                                originalIssue: issue
                            });
                        }

                        issueEvents.push({
                            id: `${issue.id}-edit-${logIdx}`,
                            issueId: issue.id,
                            title: issue.title,
                            type: isRevert ? 'revert' : 'edit',
                            date: validTime,
                            person: `${log.by || 'Staff'}${log.dept ? ` (${log.dept})` : ''}`,
                            reason: log.reason || log.changes,
                            statusChange: log.statusChange,
                            changes: log.changes,
                            originalIssue: issue,
                            editLog: log
                        });
                    }
                });
            }

            // 3. Pending Timeline
            if (issue.pendingTimeline && issue.pendingTimeline.length > 0) {
                issue.pendingTimeline.forEach((pt, idx) => {
                    let dateStr = String(pt.date || '').trim();
                    const currentYear = new Date().getFullYear();
                    const noYearMatch = dateStr.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{1,2})[:\.](\d{1,2})(?:[:\.](\d{1,2}))?/i);
                    if (noYearMatch) {
                        const secPart = noYearMatch[5] ? `:${noYearMatch[5]}` : ':00';
                        dateStr = `${noYearMatch[1]} ${noYearMatch[2]}, ${currentYear} ${noYearMatch[3]}:${noYearMatch[4]}${secPart}`;
                    }
                    const parsedPt = dateStr ? new Date(dateStr).getTime() : (rawTime + 120000);
                    const basePt = isNaN(parsedPt) ? (rawTime + 120000) : parsedPt;
                    let pd = basePt + (idx * 500);
                    const pendingPerson = pt.by || issue.pendingBy || 'Unknown';

                    if (!recordedClaimPersons.has(pendingPerson)) {
                        recordedClaimPersons.add(pendingPerson);
                        issueEvents.push({
                            id: `${issue.id}-claim-for-pending-${idx}`,
                            issueId: issue.id,
                            title: issue.title,
                            type: 'claim',
                            date: pd - 60000,
                            person: pendingPerson,
                            originalIssue: issue
                        });
                    }

                    issueEvents.push({
                        id: `${issue.id}-pending-${idx}`,
                        issueId: issue.id,
                        title: issue.title,
                        type: 'pending',
                        date: pd,
                        person: pendingPerson,
                        reason: pt.reason,
                        originalIssue: issue
                    });
                });
            } else if (issue.status === 'pending') {
                const pendingPerson = issue.pendingBy || 'Unknown';
                if (!recordedClaimPersons.has(pendingPerson)) {
                    recordedClaimPersons.add(pendingPerson);
                    issueEvents.push({
                        id: `${issue.id}-claim-for-pending-fb`,
                        issueId: issue.id,
                        title: issue.title,
                        type: 'claim',
                        date: rawTime + 60000,
                        person: pendingPerson,
                        originalIssue: issue
                    });
                }

                issueEvents.push({
                    id: `${issue.id}-pending-fb`,
                    issueId: issue.id,
                    title: issue.title,
                    type: 'pending',
                    date: rawTime + 120000, 
                    person: pendingPerson,
                    reason: issue.pendingReason,
                    originalIssue: issue
                });
            }

            // 4. Fallback Active Claim (guarantee representation for in-progress issues and active takers)
            const isProgressStatus = ['progress', 'in_progress'].includes(issue.status);
            if (isProgressStatus) {
                const hasClaimEvent = issueEvents.some(ev => ev.type === 'claim');
                if (!hasClaimEvent) {
                    const claimDate = issue.takenAt ? new Date(issue.takenAt).getTime() : (rawTime + 60000);
                    issueEvents.push({
                        id: `${issue.id}-claimed-fallback`,
                        issueId: issue.id,
                        title: issue.title,
                        type: 'claim',
                        date: isNaN(claimDate) ? (rawTime + 60000) : claimDate,
                        person: issue.taker || 'Technician',
                        originalIssue: issue
                    });
                }
            } else if (issue.taker && !['solved', 'open'].includes(issue.status) && !recordedClaimPersons.has(issue.taker)) {
                const claimDate = issue.takenAt ? new Date(issue.takenAt).getTime() : (rawTime + 60000);
                issueEvents.push({
                    id: `${issue.id}-claimed-active`,
                    issueId: issue.id,
                    title: issue.title,
                    type: 'claim',
                    date: isNaN(claimDate) ? (rawTime + 60000) : claimDate,
                    person: issue.taker,
                    originalIssue: issue
                });
            }
            
            // 5. Fallback Solved Event (only if not already logged)
            if (issue.status === 'solved') {
                const hasLoggedSolve = issueEvents.some(ev => ev.type === 'solve');
                if (!hasLoggedSolve) {
                    const sDate = issue.solvedAt ? new Date(issue.solvedAt).getTime() : (rawTime + 3600000);
                    issueEvents.push({
                        id: `${issue.id}-solved`,
                        issueId: issue.id,
                        title: issue.title,
                        type: 'solve',
                        date: isNaN(sDate) ? rawTime + 3600000 : sDate,
                        person: issue.solver || 'Unknown',
                        originalIssue: issue
                    });
                }
            }

            // Sort per-issue events
            const getEventPriorityAsc = (ev) => {
                if (ev.type === 'create') return 0;
                if (ev.type === 'revert') {
                    const change = String(ev.statusChange || '').toLowerCase();
                    if (change.includes('open')) return 1;
                    return 4;
                }
                if (ev.type === 'claim') return 2;
                if (ev.type === 'pending') return 3;
                if (ev.type === 'edit') return 5;
                if (ev.type === 'solve') return 6;
                return 9;
            };

            issueEvents.sort((a, b) => {
                if (a.date !== b.date) return a.date - b.date;
                return getEventPriorityAsc(a) - getEventPriorityAsc(b);
            });

            // State Machine per-issue deduplication
            let currentCardState = 'open';
            let currentTaker = null;

            for (const ev of issueEvents) {
                if (ev.type === 'claim') {
                    const takerName = String(ev.person || '').split(' (')[0].trim();
                    if (currentCardState !== 'open') {
                        continue;
                    }
                    currentCardState = 'progress';
                    currentTaker = takerName;
                    events.push(ev);
                } else if (ev.type === 'pending') {
                    currentCardState = 'pending';
                    events.push(ev);
                } else if (ev.type === 'revert') {
                    const statusChange = String(ev.statusChange || '').toLowerCase();
                    if (statusChange.includes('→ open') || statusChange.includes('➔ open')) {
                        currentCardState = 'open';
                        currentTaker = null;
                    } else if (statusChange.includes('→ progress') || statusChange.includes('➔ progress')) {
                        currentCardState = 'progress';
                    }
                    events.push(ev);
                } else if (ev.type === 'solve') {
                    if (currentCardState === 'solved') {
                        continue;
                    }
                    currentCardState = 'solved';
                    events.push(ev);
                } else {
                    events.push(ev);
                }
            }
        });
        
        // Sort descending with event type tie-breaking
        const typePriority = { archive: 7, create: 6, claim: 5, pending: 4, edit: 3, revert: 2, solve: 1 };
        events.sort((a, b) => {
            if (b.date !== a.date) return b.date - a.date;
            return (typePriority[a.type] || 9) - (typePriority[b.type] || 9);
        });

        const typeMap = {
            'archive': 'archived',
            'create': 'open',
            'claim': 'progress',
            'pending': 'pending',
            'solve': 'solved',
            'revert': 'revert',
            'edit': 'edit'
        };
        
        // Setup deduplication tracking when emergency urgency filter is applied
        const isEmergencyFilterActive = selectedStatusFilters.includes('emergency');
        const shouldDeduplicateByIssue = isEmergencyFilterActive;
        const seenIssueIds = new Set();

        const filtered = events.filter(ev => {
            // Search Query Filter
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchesQuery = (
                    (ev.title && ev.title.toLowerCase().includes(q)) ||
                    (ev.person && ev.person.toLowerCase().includes(q)) ||
                    (ev.issueId && ev.issueId.toLowerCase().includes(q)) ||
                    (ev.type && ev.type.toLowerCase().includes(q)) ||
                    (ev.reason && ev.reason.toLowerCase().includes(q)) ||
                    (ev.originalIssue?.department && ev.originalIssue.department.toLowerCase().includes(q))
                );
                if (!matchesQuery) return false;
            }

            const currentStatus = (ev.originalIssue?.status || 'open').toLowerCase();
            const isEmergencyIssue = String(ev.issueId || '').toUpperCase().startsWith('SOS') || (ev.originalIssue?.category || '').toLowerCase() === 'emergency';

            const statusToAllowedEventTypes = {
                solved: ['solve'],
                pending: ['pending'],
                progress: ['claim'],
                in_progress: ['claim'],
                open: ['create'],
                archived: ['archive']
            };
            const allowedTypes = statusToAllowedEventTypes[currentStatus] || [];
            const isCurrentStatusEvent = allowedTypes.includes(ev.type) || 
                (ev.type === 'revert' && String(ev.statusChange || '').toLowerCase().includes(currentStatus));

            // 1. Status Filter (matches current status of the issue)
            if (selectedStatusFilters.length > 0) {
                const isEmergencySelected = selectedStatusFilters.includes('emergency');
                const selectedStatuses = selectedStatusFilters.filter(f => f !== 'emergency');

                if (isEmergencySelected) {
                    if (!isEmergencyIssue) return false;

                    // Strictly show only the current status event (hide past edits, old created logs, etc.)
                    if (!isCurrentStatusEvent) return false;

                    // If combined with other status filters (e.g. SOS + Solved), must also match that status
                    if (selectedStatuses.length > 0 && !selectedStatuses.includes(currentStatus)) return false;
                } else if (selectedStatuses.length > 0) {
                    // Regular status filters (open, progress, pending, solved)
                    const isStatusMatch = selectedStatuses.includes(currentStatus);
                    if (!isStatusMatch || !isCurrentStatusEvent) return false;
                }
            }

            // 2. Combinable Department Filters with Mode (assigned | origin | tagged | all)
            if (selectedDepartmentFilters.length > 0) {
                const issueDept = normalizeDepartment(ev.originalIssue?.department || '').toLowerCase().trim();
                const assigned = safeArray(ev.originalIssue?.assignedDepartments).map(d => normalizeDepartment(d).toLowerCase().trim());
                const tagged = safeArray(ev.originalIssue?.taggedDepartments).map(d => normalizeDepartment(d).toLowerCase().trim());

                const matchesDept = selectedDepartmentFilters.some(selDept => {
                    const s = normalizeDepartment(selDept).toLowerCase().trim();
                    const isAssigned = assigned.includes(s) || (assigned.length === 0 && issueDept === s);
                    const isOrigin = (issueDept === s);
                    const isTagged = tagged.includes(s);

                    if (deptFilterMode === 'origin') {
                        return isOrigin;
                    } else if (deptFilterMode === 'tagged') {
                        return isTagged;
                    } else if (deptFilterMode === 'all') {
                        return isAssigned || isOrigin || isTagged;
                    } else {
                        // Default: 'assigned'
                        return isAssigned;
                    }
                });

                if (!matchesDept) return false;
            }

            // If emergency filter is active, guarantee exactly 1 entry per issue showing its latest status event
            if (shouldDeduplicateByIssue && isEmergencyIssue) {
                if (seenIssueIds.has(ev.issueId)) {
                    return false;
                }
                seenIssueIds.add(ev.issueId);
            }

            return true;
        });

        return timelineLimit === 'all' ? filtered : filtered.slice(0, timelineLimit);
    }, [timeFilteredIssues, timelineLimit, searchQuery, selectedStatusFilters, selectedDepartmentFilters, deptFilterMode, showArchivedInTimeline]);

    // Scroll-Linked Animation for Timeline Items
    useEffect(() => {
        if (loading || activityLog.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        if (entry.target.getAttribute('data-animated') !== 'true') {
                            entry.target.setAttribute('data-animated', 'true');
                            anime({
                                targets: entry.target,
                                translateY: [20, 0],
                                opacity: [0, 1],
                                easing: 'easeOutQuart',
                                duration: 400,
                            });
                        }
                    }
                });
            },
            {
                threshold: 0.05,
                rootMargin: '0px 0px -20px 0px'
            }
        );

        const items = document.querySelectorAll('.timeline-item');
        items.forEach((item) => observer.observe(item));

        return () => {
            observer.disconnect();
        };
    }, [activityLog.length, loading]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-transparent">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!canAccessAnalytics) {
        return (
            <div className="min-h-screen bg-[#1C1B0E] text-[#FAFAFA] flex flex-col justify-between relative overflow-x-clip">
                {/* Background Motif Wallpaper */}
                <div className="app-bg-wallpaper" />
                <div className="relative z-10">
                    <CampusFixHeader mode="analytics" />
                    <main className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto my-20 space-y-5">
                        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                            <ShieldAlert className="h-12 w-12 mx-auto" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-xl font-extrabold text-[#FAFAFA]">
                                {lang === 'id' ? 'Akses Analytics Dibatasi' : 'Analytics Access Restricted'}
                            </h2>
                            <p className="text-xs text-[#A19F8D] leading-relaxed">
                                {lang === 'id' 
                                    ? 'Akun Anda dibatasi untuk mengakses data performa & statistik analitik resort. Hubungi Administrator jika Anda membutuhkan izin ini.' 
                                    : 'Your account is restricted from accessing resort performance and analytics data. Please contact an Administrator if you need access.'}
                            </p>
                        </div>
                        <a
                            href="/dashboard"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#C9AA71] text-[#1C1B0E] hover:bg-[#D4B883] transition-all shadow-md"
                        >
                            {lang === 'id' ? 'Kembali ke Dashboard' : 'Back to Dashboard'}
                        </a>
                    </main>
                </div>
                <MobileBottomNav currentTab="analytics" />
            </div>
        );
    }

    const renderAllRelatedMatrixCards = () => {
        return (
            <div className="w-full space-y-4 pt-1">
                {/* Matrix Filter Bar: Badges + Search + Sort */}
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#232118] p-3 rounded-xl border border-[#3B3929]">
                    {/* Macro Badges */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <div className="flex items-center gap-1.5 bg-[#1C1B0E] px-2.5 py-1 rounded-lg border border-emerald-500/30 text-emerald-400 font-semibold shadow-xs">
                            <span className="font-bold text-xs">↓</span>
                            <span>{t('matrix_incoming_tasks')}:</span>
                            <span className="font-mono font-bold text-emerald-300">{allRelatedMacroSummary.incomingTotal}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-[#1C1B0E] px-2.5 py-1 rounded-lg border border-rose-500/30 text-rose-400 font-semibold shadow-xs">
                            <span className="font-bold text-xs">↑</span>
                            <span>{t('matrix_outgoing_reports')}:</span>
                            <span className="font-mono font-bold text-rose-300">{allRelatedMacroSummary.outgoingTotal}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-[#1C1B0E] px-2.5 py-1 rounded-lg border border-slate-500/30 text-slate-300 font-semibold shadow-xs">
                            <span>📢</span>
                            <span>{t('matrix_tagged_cc')}:</span>
                            <span className="font-mono font-bold text-slate-200">{allRelatedMacroSummary.taggedTotal}</span>
                        </div>
                        {allRelatedMacroSummary.internalTotal > 0 && (
                            <div className="flex items-center gap-1.5 bg-[#1C1B0E] px-2.5 py-1 rounded-lg border border-[#C9AA71]/30 text-[#C9AA71] font-semibold shadow-xs">
                                <span>🏠</span>
                                <span>{t('matrix_internal_label')}:</span>
                                <span className="font-mono font-bold text-[#E2C38A]">{allRelatedMacroSummary.internalTotal}</span>
                            </div>
                        )}
                    </div>

                    {/* Search & Sort Controls */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1 md:w-52">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            <input 
                                type="text"
                                value={allRelatedSearch}
                                onChange={(e) => setAllRelatedSearch(e.target.value)}
                                placeholder={t('matrix_search_placeholder')}
                                className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg bg-[#1C1B0E] border border-[#3B3929] text-foreground focus:outline-none focus:border-[#C9AA71] placeholder:text-muted-foreground/60"
                            />
                        </div>
                        <select
                            value={allRelatedSort}
                            onChange={(e) => setAllRelatedSort(e.target.value)}
                            className="appearance-none px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#1C1B0E] border border-[#3B3929] text-[#C9AA71] focus:outline-none focus:border-[#C9AA71] cursor-pointer shadow-xs"
                        >
                            <option value="total" className="bg-[#2A281E] text-[#FAFAFA]">{t('matrix_sort_total')}</option>
                            <option value="incoming" className="bg-[#2A281E] text-[#FAFAFA]">{t('matrix_sort_incoming')}</option>
                            <option value="outgoing" className="bg-[#2A281E] text-[#FAFAFA]">{t('matrix_sort_outgoing')}</option>
                            <option value="tagged" className="bg-[#2A281E] text-[#FAFAFA]">{t('matrix_sort_tagged')}</option>
                        </select>
                    </div>
                </div>

                {/* Matrix Cards Grid */}
                {allRelatedMatrixData.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 max-h-[640px] overflow-y-auto pr-1">
                        {allRelatedMatrixData.map((item) => {
                            const isSelected = selectedDepartmentFilters.some(d => d.toLowerCase() === item.name.toLowerCase());
                            const deptColor = getDepartmentColor(item.name);

                            return (
                                <div
                                    key={item.name}
                                    onClick={() => handleDepartmentBarClick({ name: item.name })}
                                    className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none bg-[#232118] hover:bg-[#28261C] flex flex-col justify-between gap-3 ${
                                        isSelected 
                                            ? 'border-[#C9AA71] ring-2 ring-[#C9AA71]/40 shadow-lg' 
                                            : 'border-[#3B3929] hover:border-[#5A5540]'
                                    }`}
                                >
                                    {/* Card Header */}
                                    <div className="flex items-center justify-between gap-2 border-b border-[#3B3929] pb-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span 
                                                className="w-3 h-3 rounded-full shrink-0 shadow-sm" 
                                                style={{ backgroundColor: deptColor }}
                                            />
                                            <span className="font-bold text-[#FAFAFA] text-sm truncate" title={item.name}>
                                                {item.name}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground font-mono bg-[#1C1B0E] px-1.5 py-0.5 rounded border border-[#3B3929] shrink-0">
                                                #{item.shortName}
                                            </span>
                                        </div>
                                        <span className="bg-[#C9AA71]/15 text-[#C9AA71] border border-[#C9AA71]/30 px-2 py-0.5 rounded-full font-bold text-[11px] shrink-0">
                                            {item.totalRelated} {lang === 'id' ? 'Isu Terkait' : 'Related'}
                                        </span>
                                    </div>

                                    {/* 3 Pillars Breakdown */}
                                    <div className="space-y-2 text-xs">
                                        {/* 1. Tugas Masuk (Workload To Fix) */}
                                        <div className="p-2 rounded-lg bg-[#1C1B0E] border border-emerald-500/20 space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-[11px]">
                                                    <span className="font-black text-xs">↓</span>
                                                    <span>{t('matrix_incoming_tasks')}</span>
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-mono font-bold text-emerald-400 text-xs">{item.incoming.total}</span>
                                                    {item.incoming.total > 0 && (
                                                        <span className="text-[10px] text-emerald-400/80 font-medium">({item.incomingDoneRate}% {lang === 'id' ? 'selesai' : 'done'})</span>
                                                    )}
                                                </div>
                                            </div>

                                            {item.incoming.total > 0 ? (
                                                <>
                                                    {/* Segmented Progress Bar */}
                                                    <div className="w-full h-1.5 rounded-full bg-[#2A281E] overflow-hidden flex">
                                                        {item.incoming.unclaimed > 0 && (
                                                            <div 
                                                                className="h-full bg-slate-500" 
                                                                style={{ width: `${(item.incoming.unclaimed / item.incoming.total) * 100}%` }} 
                                                                title={`Belum Diambil: ${item.incoming.unclaimed}`}
                                                            />
                                                        )}
                                                        {item.incoming.inProgress > 0 && (
                                                            <div 
                                                                className="h-full bg-amber-500" 
                                                                style={{ width: `${(item.incoming.inProgress / item.incoming.total) * 100}%` }} 
                                                                title={`Sedang Dikerjakan: ${item.incoming.inProgress}`}
                                                            />
                                                        )}
                                                        {item.incoming.solved > 0 && (
                                                            <div 
                                                                className="h-full bg-emerald-500" 
                                                                style={{ width: `${(item.incoming.solved / item.incoming.total) * 100}%` }} 
                                                                title={`Selesai: ${item.incoming.solved}`}
                                                            />
                                                        )}
                                                    </div>
                                                    {/* Micro Counters */}
                                                    <div className="flex items-center justify-between text-[10.5px] text-[#A19F8D] pt-0.5">
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"></span>
                                                            <span>{lang === 'id' ? 'Belum' : 'Open'}: <strong className="text-slate-300 font-mono">{item.incoming.unclaimed}</strong></span>
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                                                            <span>{lang === 'id' ? 'Proses' : 'Prog'}: <strong className="text-amber-300 font-mono">{item.incoming.inProgress}</strong></span>
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                                                            <span>{lang === 'id' ? 'Selesai' : 'Done'}: <strong className="text-emerald-300 font-mono">{item.incoming.solved}</strong></span>
                                                        </span>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="text-[10px] text-muted-foreground italic">
                                                    {lang === 'id' ? 'Tidak ada tugas masuk' : 'No incoming tasks'}
                                                </div>
                                            )}
                                        </div>

                                        {/* 2. Laporan Keluar (Outgoing Requests) */}
                                        <div className="p-2 rounded-lg bg-[#1C1B0E] border border-rose-500/20 space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-rose-400 font-bold flex items-center gap-1.5 text-[11px]">
                                                    <span className="font-black text-xs">↑</span>
                                                    <span>{t('matrix_outgoing_reports')}</span>
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-mono font-bold text-rose-400 text-xs">{item.outgoing.total}</span>
                                                    {item.outgoing.total > 0 && (
                                                        <span className="text-[10px] text-rose-400/80 font-medium">({item.outgoingDoneRate}% {lang === 'id' ? 'selesai' : 'done'})</span>
                                                    )}
                                                </div>
                                            </div>

                                            {item.outgoing.total > 0 ? (
                                                <>
                                                    {/* Segmented Progress Bar */}
                                                    <div className="w-full h-1.5 rounded-full bg-[#2A281E] overflow-hidden flex">
                                                        {(item.outgoing.unclaimed + item.outgoing.inProgress) > 0 && (
                                                            <div 
                                                                className="h-full bg-amber-500" 
                                                                style={{ width: `${((item.outgoing.unclaimed + item.outgoing.inProgress) / item.outgoing.total) * 100}%` }} 
                                                                title={`Diproses di luar: ${item.outgoing.unclaimed + item.outgoing.inProgress}`}
                                                            />
                                                        )}
                                                        {item.outgoing.solved > 0 && (
                                                            <div 
                                                                className="h-full bg-emerald-500" 
                                                                style={{ width: `${(item.outgoing.solved / item.outgoing.total) * 100}%` }} 
                                                                title={`Selesai: ${item.outgoing.solved}`}
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="flex items-center justify-between text-[10.5px] text-[#A19F8D] pt-0.5">
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                                                            <span>{lang === 'id' ? 'Diproses luar' : 'Pending'}: <strong className="text-amber-300 font-mono">{item.outgoing.unclaimed + item.outgoing.inProgress}</strong></span>
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                                                            <span>{lang === 'id' ? 'Selesai di luar' : 'Solved'}: <strong className="text-emerald-300 font-mono">{item.outgoing.solved}</strong></span>
                                                        </span>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="text-[10px] text-muted-foreground italic">
                                                    {lang === 'id' ? 'Tidak ada laporan keluar' : 'No outgoing reports'}
                                                </div>
                                            )}
                                        </div>

                                        {/* 3. Footer Row: Ditandai & Internal Badge */}
                                        <div className="flex items-center justify-between pt-0.5 text-[11px]">
                                            <div className="flex items-center gap-1.5 text-slate-400">
                                                <span>📢</span>
                                                <span>{t('matrix_tagged_cc')}:</span>
                                                <strong className="text-slate-200 font-mono">{item.tagged.total}</strong>
                                            </div>

                                            {item.internal.total > 0 && (
                                                <div className="flex items-center gap-1 text-[#C9AA71] bg-[#1C1B0E] px-2 py-0.5 rounded border border-[#C9AA71]/30 text-[10.5px]">
                                                    <span>🏠</span>
                                                    <span>{item.internal.total} {lang === 'id' ? 'Internal' : 'Internal'}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex h-48 items-center justify-center text-muted-foreground">{t('matrix_no_depts')}</div>
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
                mode="analytics" 
                query={searchQuery} 
                onQueryChange={setSearchQuery} 
            />

            <main className="mx-auto max-w-[1600px] 2xl:max-w-[1760px] p-4 sm:p-6 lg:p-8 flex flex-col gap-8 pb-28 md:pb-8">
                
                {error && (
                    <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive shadow-sm">
                        <div className="flex items-center gap-2.5">
                            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                            <span>{error}</span>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => fetchIssues()} className="shrink-0">
                            Retry
                        </Button>
                    </div>
                )}

                {/* Unified Consolidated Analytics Control Bar (Sheets Dropdown + Time Range Dropdown + Export) */}
                <div className="bg-[#1C1B0E]/90 backdrop-blur-md p-4 sm:p-5 rounded-2xl shadow-sm border border-[#3B3929] flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all">
                    {/* Left: Dropdown Controls for Sheets and Time Range */}
                    <div className="flex flex-wrap items-center gap-3.5 sm:gap-4 flex-1">
                        {/* 1. Sheet / Period Selector Dropdown */}
                        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1 sm:flex-initial">
                            <Tooltip content={t('tooltip_sheet_selector')} position="top">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 cursor-help">
                                    <Layers className="h-3.5 w-3.5 text-[#C9AA71]" />
                                    <span>{t('select_sheets') || (lang === 'id' ? 'Tahun / Sheet' : 'Period / Sheet')}:</span>
                                    {isFetchingAnySheet && <Loader2 className="h-3 w-3 animate-spin text-[#C9AA71]" />}
                                </label>
                            </Tooltip>
                            <div className="relative">
                                <select
                                    value={
                                        selectedSheets.length === (availableSheets?.length || 1) && (availableSheets?.length || 1) > 1
                                            ? 'all'
                                            : (selectedSheets[0] || (currentSheet || '2026'))
                                    }
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'all') {
                                            const allList = availableSheets && availableSheets.length > 0 ? availableSheets : [currentSheet || '2026'];
                                            setSelectedSheets([...allList]);
                                        } else {
                                            setSelectedSheets([val]);
                                        }
                                    }}
                                    className="w-full appearance-none px-3.5 py-2 pr-9 text-xs font-bold rounded-xl border border-[#3B3929] bg-[#2A281E] text-[#FAFAFA] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#C9AA71] h-10 shadow-sm"
                                >
                                    {availableSheets && availableSheets.length > 1 && (
                                        <option value="all" className="bg-[#2A281E] text-[#FAFAFA] font-bold">
                                            📚 {t('all_sheets')} ({combinedIssues.length} {t('total_issues')})
                                        </option>
                                    )}
                                    {(availableSheets && availableSheets.length > 0 ? availableSheets : [currentSheet || '2026']).map(sheetName => {
                                        const count = sheetDataMap[sheetName]?.length;
                                        return (
                                            <option key={sheetName} value={sheetName} className="bg-[#2A281E] text-[#FAFAFA]">
                                                📄 Sheet {sheetName} {count !== undefined ? `(${count} isu)` : ''}
                                            </option>
                                        );
                                    })}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground">
                                    <ChevronDown className="h-4 w-4 text-[#C9AA71]" />
                                </div>
                            </div>
                        </div>

                        {/* 2. Time Range Dropdown */}
                        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1 sm:flex-initial">
                            <Tooltip content={t('tooltip_time_range')} position="top">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 cursor-help">
                                    <Clock className="h-3.5 w-3.5 text-[#C9AA71]" />
                                    <span>{t('time_range') || (lang === 'id' ? 'Rentang Waktu' : 'Time Range')}:</span>
                                </label>
                            </Tooltip>
                            <div className="relative">
                                <select
                                    value={timeRange}
                                    onChange={(e) => setTimeRange(e.target.value)}
                                    className="w-full appearance-none px-3.5 py-2 pr-9 text-xs font-bold rounded-xl border border-[#3B3929] bg-[#2A281E] text-[#FAFAFA] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#C9AA71] h-10 shadow-sm"
                                >
                                    {TIME_RANGES.map(range => {
                                        const labelText = t(range.labelKey) || range.label;
                                        return (
                                            <option key={range.id} value={range.id} className="bg-[#2A281E] text-[#FAFAFA]">
                                                ⏱️ {labelText}
                                            </option>
                                        );
                                    })}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground">
                                    <ChevronDown className="h-4 w-4 text-[#C9AA71]" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Real-time Stats Badge + Export PDF Action */}
                    <div className="flex items-center gap-2.5 shrink-0 self-end md:self-auto flex-wrap pt-2 md:pt-0 border-t md:border-t-0 border-[#3B3929]/50 w-full md:w-auto justify-between md:justify-end">
                        <div className="flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl bg-[#2A281E] border border-[#3B3929] text-[#C9AA71]">
                            <Database className="h-3.5 w-3.5" />
                            <span>
                                <strong className="text-foreground">{timeFilteredIssues.length}</strong> / {combinedIssues.length} {t('total_issues')}
                            </span>
                        </div>

                        {canExportReports ? (
                            <Tooltip content={lang === 'id' ? 'Ekspor laporan analitik ke format dokumen PDF atau spreadsheet Excel (.xlsx)' : 'Export analytics reports to PDF or Excel (.xlsx) spreadsheet'} position="top">
                                <button
                                    type="button"
                                    onClick={() => setExportOpen(true)}
                                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 bg-[#C9AA71] text-[#1C1B0E] hover:bg-[#D4B883] border border-[#C9AA71] shadow-sm hover:shadow-md active:scale-95 cursor-pointer font-extrabold"
                                    title={t('export_report') || 'Ekspor Laporan'}
                                >
                                    <Download className="h-4 w-4" />
                                    <span>{t('export_report') || 'Ekspor Laporan'}</span>
                                </button>
                            </Tooltip>
                        ) : (
                            <div 
                                className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-[#1C1B0E] text-[#A19F8D]/50 border border-[#3B3929] cursor-not-allowed select-none"
                                title={lang === 'id' ? 'Izin export laporan dinonaktifkan oleh Administrator' : 'Report export disabled by Administrator'}
                            >
                                <Download className="h-4 w-4 opacity-40" />
                                <span>{t('export_report') || 'Ekspor Laporan'} ({lang === 'id' ? 'Dibatasi' : 'Restricted'})</span>
                            </div>
                        )}

                        {(isAdmin || isHOD) && (
                            <Tooltip content={lang === 'id' ? 'Atur jadwal pengiriman rekap PDF bulanan otomatis' : 'Configure automated monthly PDF report'} position="top">
                                <button
                                    type="button"
                                    onClick={() => setScheduleModalOpen(true)}
                                    className="px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 bg-[#242217] text-[#C9AA71] hover:bg-[#C9AA71]/20 border border-[#C9AA71]/60 shadow-sm hover:shadow-md active:scale-95 cursor-pointer font-extrabold"
                                    title={lang === 'id' ? 'Jadwal Laporan Bulanan (Admin & HOD)' : 'Automated Monthly Report Settings'}
                                >
                                    <Calendar className="h-4 w-4 text-[#C9AA71]" />
                                    <span>{lang === 'id' ? 'Jadwal Bulanan' : 'Monthly Schedule'}</span>
                                </button>
                            </Tooltip>
                        )}
                    </div>
                </div>

                {/* Dedicated Emergency & Critical Incident Spotlight Panel */}
                <div className={`p-5 rounded-2xl border transition-all duration-300 shadow-md ${
                    analyticsStats.emergencyActive > 0 
                        ? 'bg-gradient-to-br from-red-950/70 via-[#1C1B0E] to-red-950/30 border-red-500/60 shadow-[0_0_25px_rgba(239,68,68,0.25)]' 
                        : analyticsStats.emergencyTotal > 0
                            ? 'bg-[#1C1B0E]/90 border-red-900/40 shadow-sm'
                            : 'bg-[#1C1B0E]/60 border-[#3B3929]/70'
                }`}>
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                        {/* Left: Info & Details */}
                        <div className="flex items-start sm:items-center gap-3.5">
                            <div className={`p-2.5 rounded-xl border shrink-0 ${
                                analyticsStats.emergencyActive > 0
                                    ? 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.4)]'
                                    : analyticsStats.emergencyTotal > 0
                                        ? 'bg-red-950/40 text-red-400 border-red-900/50'
                                        : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50'
                            }`}>
                                <AlertTriangle className="h-6 w-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <h2 className="text-base sm:text-lg font-extrabold text-[#FAFAFA] flex items-center gap-2">
                                        <span>{lang === 'id' ? 'Pemantauan Insiden Darurat (SOS Fast-Track)' : 'Emergency Incident Tracking (SOS Fast-Track)'}</span>
                                    </h2>
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-red-950/60 border border-red-500/40 text-red-300">
                                        {lang === 'id' ? 'Ditugaskan ke SEMUA Tim' : 'Assigned to ALL Teams'}
                                    </span>
                                </div>
                                <p className="text-xs text-[#A19F8D] mt-0.5 leading-relaxed">
                                    {lang === 'id'
                                        ? 'Laporan darurat disiarkan ke seluruh resort tanpa departemen tunggal. Pantau status dan kecepatan tanggap krisis di sini.'
                                        : 'Emergency fast-track reports broadcast to the entire island without a single department owner. Monitor crisis status and resolution here.'}
                                </p>
                            </div>
                        </div>

                        {/* Right: Metrics Pills + Filter Action */}
                        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap self-stretch lg:self-auto justify-between lg:justify-end border-t lg:border-t-0 border-[#3B3929]/60 pt-3 lg:pt-0">
                            {/* Stat: Total */}
                            <div className="flex flex-col items-center px-3 py-1.5 rounded-xl bg-[#2A281E] border border-[#3B3929] min-w-[70px]">
                                <span className="text-[10px] font-bold text-[#A19F8D] uppercase tracking-wider">
                                    {lang === 'id' ? 'Total Insiden' : 'Total Incidents'}
                                </span>
                                <span className="text-lg font-black text-[#FAFAFA] font-mono">
                                    {analyticsStats.emergencyTotal}
                                </span>
                            </div>

                            {/* Stat: Active */}
                            <div className={`flex flex-col items-center px-3 py-1.5 rounded-xl border min-w-[75px] ${
                                analyticsStats.emergencyActive > 0
                                    ? 'bg-red-950/60 border-red-500/50 text-red-300 ring-1 ring-red-500/30'
                                    : 'bg-[#2A281E] border-[#3B3929] text-emerald-400'
                            }`}>
                                <span className="text-[10px] font-bold uppercase tracking-wider">
                                    {lang === 'id' ? 'Aktif' : 'Active'}
                                </span>
                                <span className="text-lg font-black font-mono flex items-center gap-1">
                                    {analyticsStats.emergencyActive > 0 && <span className="h-2 w-2 rounded-full bg-red-400 animate-ping inline-block" />}
                                    {analyticsStats.emergencyActive}
                                </span>
                            </div>

                            {/* Stat: Solved */}
                            <div className="flex flex-col items-center px-3 py-1.5 rounded-xl bg-[#2A281E] border border-[#3B3929] min-w-[70px]">
                                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                                    {lang === 'id' ? 'Selesai' : 'Solved'}
                                </span>
                                <span className="text-lg font-black text-emerald-300 font-mono">
                                    {analyticsStats.emergencySolved}
                                </span>
                            </div>

                            {/* Filter Toggle Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    handleStatusCardClick('emergency');
                                    recentActivityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 border cursor-pointer shadow-md select-none ${
                                    selectedStatusFilters.includes('emergency')
                                        ? 'bg-red-600 hover:bg-red-500 text-white border-red-400 ring-2 ring-red-500/50 scale-105'
                                        : 'bg-red-950/40 hover:bg-red-900/60 text-red-300 border-red-800/60 hover:border-red-500'
                                }`}
                                title={lang === 'id' ? 'Filter hanya laporan darurat' : 'Filter emergency reports only'}
                            >
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <span>
                                    {selectedStatusFilters.includes('emergency')
                                        ? (lang === 'id' ? '✕ Lepas Filter Darurat' : '✕ Clear Emergency Filter')
                                        : (lang === 'id' ? 'Lihat Tiket Darurat' : 'View Emergency Tickets')}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Charts Section: Department Distribution Chart */}
                <div ref={chartsContainerRef} className="flex flex-col gap-6">

                    {/* Department Chart (Full Width at Bottom) */}
                    <div className="chart-card bg-surface p-5 sm:p-6 rounded-2xl shadow-sm border border-border/50 flex flex-col">


                        {/* Header Row 1: Title & Main Mode Switcher */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between w-full gap-3 pb-3 border-b border-border/40">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-bold text-foreground">{t('issues_by_department')}</h2>
                                    {selectedDepartmentFilters.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDepartmentFilters([])}
                                            className="text-xs font-semibold text-[#C9AA71] hover:underline cursor-pointer bg-[#2A281E] px-2 py-0.5 rounded border border-[#3B3929]"
                                        >
                                            ✕ {lang === 'id' ? 'Reset Dept' : 'Reset Dept'}
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {isDeptUser ? (
                                        <>
                                            {deptFilterMode === 'assigned' && (lang === 'id' ? `Departemen asal yang meminta bantuan / menugaskan tiket kepada ${department}` : `Origin departments requesting help from / assigned to ${department}`)}
                                            {deptFilterMode === 'origin' && (lang === 'id' ? `Departemen tujuan yang ditugaskan untuk memperbaiki tiket dari ${department}` : `Target departments assigned to fix issues reported by ${department}`)}
                                            {deptFilterMode === 'tagged' && (lang === 'id' ? `Departemen terkait pada tiket di mana ${department} ditandai (CC)` : `Partner departments on tickets where ${department} is tagged (CC)`)}
                                            {deptFilterMode === 'all' && (lang === 'id' ? `Seluruh departemen yang berinteraksi dengan ${department} (tugas masuk, keluar, dan tag)` : `All departments interacting with ${department} (incoming, outgoing, and tagged)`)}
                                        </>
                                    ) : (
                                        <>
                                            {deptFilterMode === 'assigned' && (lang === 'id' ? 'Beban perbaikan: Jumlah tiket yang ditugaskan ke tiap departemen di resort' : 'Repair workload: Total issues assigned to each department in the resort')}
                                            {deptFilterMode === 'origin' && (lang === 'id' ? 'Volume pelaporan: Jumlah tiket yang dilaporkan oleh tiap departemen' : 'Reporting volume: Total issues discovered and reported by each department')}
                                            {deptFilterMode === 'tagged' && (lang === 'id' ? 'Koordinasi: Departemen yang paling sering ditandai (CC)' : 'Coordination: Departments most frequently tagged (CC)')}
                                            {deptFilterMode === 'all' && (lang === 'id' ? 'Total keterlibatan: Gabungan seluruh peran departemen di resort' : 'Total involvement: Combined department activity across the resort')}
                                        </>
                                    )}
                                </p>
                            </div>
                            
                            <div className="flex items-center gap-2 flex-wrap shrink-0">
                                {/* Mode Selector with Role-Adaptive Buttons */}
                                <div className="flex items-center rounded-lg bg-[#2A281E] p-0.5 border border-[#3B3929] text-xs">
                                    <Tooltip content={isDeptUser ? t('tooltip_incoming_dept') : t('tooltip_assigned_dept')} position="top">
                                        <button
                                            type="button"
                                            onClick={() => setDeptFilterMode('assigned')}
                                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                deptFilterMode === 'assigned'
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] font-bold shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            <Target className="w-3.5 h-3.5 shrink-0" />
                                            <span>{isDeptUser ? t('dept_mode_incoming') : t('dept_mode_assigned')}</span>
                                        </button>
                                    </Tooltip>
                                    <Tooltip content={isDeptUser ? t('tooltip_outgoing_dept') : t('tooltip_origin_dept')} position="top">
                                        <button
                                            type="button"
                                            onClick={() => setDeptFilterMode('origin')}
                                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                deptFilterMode === 'origin'
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] font-bold shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            <FileText className="w-3.5 h-3.5 shrink-0" />
                                            <span>{isDeptUser ? t('dept_mode_outgoing') : t('dept_mode_origin')}</span>
                                        </button>
                                    </Tooltip>
                                    <Tooltip content={t('tooltip_tagged_dept')} position="top">
                                        <button
                                            type="button"
                                            onClick={() => setDeptFilterMode('tagged')}
                                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                deptFilterMode === 'tagged'
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] font-bold shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            <Megaphone className="w-3.5 h-3.5 shrink-0" />
                                            <span>{t('dept_mode_tagged')}</span>
                                        </button>
                                    </Tooltip>
                                    {!isDeptUser && (
                                        <Tooltip content={t('tooltip_all_related_dept')} position="top">
                                            <button
                                                type="button"
                                                onClick={() => setDeptFilterMode('all')}
                                                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                    deptFilterMode === 'all'
                                                        ? 'bg-[#C9AA71] text-[#1C1B0E] font-bold shadow-sm'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                <Globe className="w-3.5 h-3.5 shrink-0" />
                                                <span>{t('dept_mode_all')}</span>
                                            </button>
                                        </Tooltip>
                                    )}
                                </div>

                                {/* View Switcher for All Related (Matrix Cards vs Bar Chart) */}
                                {!isDeptUser && deptFilterMode === 'all' && (
                                    <div className="flex items-center rounded-lg bg-[#2A281E] p-0.5 border border-[#3B3929] text-xs">
                                        <Tooltip content={lang === 'id' ? 'Tampilan kartu matriks peran interaktif' : 'Interactive role matrix cards'} position="top">
                                            <button
                                                type="button"
                                                onClick={() => setAllRelatedViewType('matrix')}
                                                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                    allRelatedViewType === 'matrix'
                                                        ? 'bg-[#C9AA71] text-[#1C1B0E] font-bold shadow-sm'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                                                <span>{t('dept_view_matrix')}</span>
                                            </button>
                                        </Tooltip>
                                        <Tooltip content={lang === 'id' ? 'Tampilan grafik batang standar' : 'Standard bar chart'} position="top">
                                            <button
                                                type="button"
                                                onClick={() => setAllRelatedViewType('chart')}
                                                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                    allRelatedViewType === 'chart'
                                                        ? 'bg-[#C9AA71] text-[#1C1B0E] font-bold shadow-sm'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                                                <span>{t('dept_view_chart')}</span>
                                            </button>
                                        </Tooltip>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Header Row 2: Secondary Toolbar (Only when in chart mode) */}
                        {(deptFilterMode !== 'all' || allRelatedViewType === 'chart') && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-2.5 pt-3 mb-3">
                                {/* Tri-Tone Status Legend */}
                                <div className="flex flex-wrap items-center gap-3 bg-[#2A281E] px-3 py-1.5 rounded-xl border border-[#3B3929] text-[11px] shadow-xs">
                                    {/* Batang 1: Belum Diambil */}
                                    <div className="flex items-center gap-1.5 font-semibold text-[#FAFAFA]" title={deptColorMode === 'status' ? (lang === 'id' ? 'Batang 1 (Abu-abu): Belum diambil sama sekali' : 'Bar 1 (Slate): Unclaimed') : (lang === 'id' ? 'Batang 1: Warna Gelap (Belum diambil)' : 'Bar 1: Dark shade (Unclaimed)')}>
                                        <span className={`w-3 h-2.5 rounded-[3px] ${deptColorMode === 'status' ? 'bg-[#475569] border border-[#64748B]' : 'bg-slate-800 border border-slate-600'} inline-block shadow-xs`}></span>
                                        <span className="text-muted-foreground">{lang === 'id' ? 'Belum Diambil' : 'Unclaimed'}:</span>
                                        <span className="font-bold text-[#C9AA71] font-mono">{deptSummaryStats.unclaimed}</span>
                                    </div>
                                    <div className="h-3 w-px bg-[#3B3929]"></div>
                                    {/* Batang 2 Segmen 1: Sedang Dikerjakan */}
                                    <div className="flex items-center gap-1.5 font-semibold text-[#FAFAFA]" title={deptColorMode === 'status' ? (lang === 'id' ? 'Batang 2 Bawah (Oranye): Sedang dikerjakan' : 'Bar 2 Bottom (Amber): In progress') : (lang === 'id' ? 'Batang 2 Bawah: Warna Asli (Sedang dikerjakan)' : 'Bar 2 Bottom: Base color (In progress)')}>
                                        <span className={`w-3 h-2.5 rounded-[3px] ${deptColorMode === 'status' ? 'bg-[#F59E0B] border border-amber-300/40' : 'bg-[#E58C36] border border-amber-400'} inline-block shadow-xs`}></span>
                                        <span className="text-muted-foreground">{lang === 'id' ? 'Sedang Dikerjakan' : 'In Progress'}:</span>
                                        <span className="font-bold text-amber-400 font-mono">{deptSummaryStats.inProgress}</span>
                                    </div>
                                    <div className="h-3 w-px bg-[#3B3929]"></div>
                                    {/* Batang 2 Segmen 2: Sudah Selesai */}
                                    <div className="flex items-center gap-1.5 font-semibold text-[#FAFAFA]" title={deptColorMode === 'status' ? (lang === 'id' ? 'Batang 2 Atas (Hijau): Sudah selesai' : 'Bar 2 Top (Emerald): Finished / solved') : (lang === 'id' ? 'Batang 2 Atas: Warna Terang (Sudah selesai)' : 'Bar 2 Top: Light shade (Finished / solved)')}>
                                        <span className={`w-3 h-2.5 rounded-[3px] ${deptColorMode === 'status' ? 'bg-[#10B981] border border-emerald-300/40' : 'bg-emerald-300 border border-emerald-200'} inline-block shadow-xs`}></span>
                                        <span className="text-muted-foreground">{lang === 'id' ? 'Selesai' : 'Solved'}:</span>
                                        <span className="font-bold text-emerald-400 font-mono">{deptSummaryStats.solved}</span>
                                    </div>
                                </div>

                                {/* Controls: Color Mode Selector + Department Amount Selector */}
                                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                    {/* Color Mode Selector (Warna Dept vs Warna Statis) */}
                                    <div className="flex items-center rounded-lg bg-[#2A281E] p-0.5 border border-[#3B3929] text-xs shadow-xs">
                                        <Tooltip content={lang === 'id' ? 'Gunakan gradasi kecerahan warna asli departemen (Gelap = Belum, Normal = Proses, Terang = Selesai)' : 'Use department brightness shades: Dark (Unclaimed), Normal (Progress), Light (Solved)'} position="top">
                                            <button
                                                type="button"
                                                onClick={() => handleSetDeptColorMode('dept')}
                                                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                    deptColorMode === 'dept'
                                                        ? 'bg-[#C9AA71] text-[#1C1B0E] font-bold shadow-sm'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                <Palette className="w-3.5 h-3.5 shrink-0" />
                                                <span>{lang === 'id' ? 'Warna Dept' : 'Dept Colors'}</span>
                                            </button>
                                        </Tooltip>
                                        <Tooltip content={lang === 'id' ? 'Gunakan warna status standar universal (Abu-abu = Belum, Oranye = Proses, Hijau = Selesai)' : 'Use universal status colors: Slate (Unclaimed), Orange (Progress), Green (Solved)'} position="top">
                                            <button
                                                type="button"
                                                onClick={() => handleSetDeptColorMode('status')}
                                                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                    deptColorMode === 'status'
                                                        ? 'bg-[#C9AA71] text-[#1C1B0E] font-bold shadow-sm'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                <Layers className="w-3.5 h-3.5 shrink-0" />
                                                <span>{lang === 'id' ? 'Warna Status' : 'Status Colors'}</span>
                                            </button>
                                        </Tooltip>
                                    </div>

                                    {/* Department Amount Selector (5, 10, 15, 20, All) */}
                                    <Tooltip content={t('tooltip_dept_limit')} position="top">
                                        <div className="flex items-center gap-1.5 text-xs">
                                            <select
                                                value={deptLimit}
                                                onChange={(e) => setDeptLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                                className="appearance-none px-3 py-1 text-xs font-bold rounded-lg border border-[#3B3929] bg-[#2A281E] text-[#C9AA71] cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                                            >
                                                <option value={5} className="bg-[#2A281E] text-[#FAFAFA]">Top 5</option>
                                                <option value={10} className="bg-[#2A281E] text-[#FAFAFA]">Top 10</option>
                                                <option value={15} className="bg-[#2A281E] text-[#FAFAFA]">Top 15</option>
                                                <option value={20} className="bg-[#2A281E] text-[#FAFAFA]">Top 20</option>
                                                <option value="all" className="bg-[#2A281E] text-[#FAFAFA]">{t('all_items')}</option>
                                            </select>
                                        </div>
                                    </Tooltip>
                                </div>
                            </div>
                        )}

                        {deptFilterMode === 'all' && allRelatedViewType === 'matrix' ? (
                            renderAllRelatedMatrixCards()
                        ) : (
                            <div className={`w-full ${departmentData.length > 6 ? 'h-[360px] sm:h-[400px]' : 'h-[330px] sm:h-[360px]'}`}>
                            {departmentData.length > 0 ? (
                                chartsVisible && (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart 
                                            data={departmentData} 
                                            margin={{ top: 24, right: 20, left: -10, bottom: departmentData.length > 6 ? 20 : 8 }}
                                            barCategoryGap={departmentData.length <= 5 ? "28%" : "18%"}
                                            barGap={4}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3B3929" />
                                            <XAxis 
                                                dataKey="displayName" 
                                                axisLine={false} 
                                                tickLine={false} 
                                                interval={0}
                                                angle={departmentData.length > 6 ? -35 : 0}
                                                textAnchor={departmentData.length > 6 ? 'end' : 'middle'}
                                                height={departmentData.length > 6 ? 44 : 28}
                                                dy={departmentData.length > 6 ? 4 : 0}
                                                tick={{ 
                                                    fontSize: departmentData.length > 12 ? 9.5 : (departmentData.length > 6 ? 10 : 11), 
                                                    fill: '#A19F8D', 
                                                    fontWeight: 600, 
                                                    cursor: 'pointer' 
                                                }} 
                                                onClick={(e) => handleDepartmentBarClick({ name: e?.value })}
                                            />
                                            <YAxis 
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{ fontSize: 12, fill: '#A19F8D' }}
                                                allowDecimals={false}
                                                domain={deptYAxisConfig.domain}
                                                ticks={deptYAxisConfig.ticks}
                                            />
                                            <RechartsTooltip 
                                                cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                                                wrapperStyle={{ pointerEvents: 'auto' }}
                                                content={({ active, payload }) => {
                                                    if (!active || !payload || !payload.length) return null;
                                                    const item = payload[0]?.payload;
                                                    if (!item) return null;
                                                    const isStatusMode = deptColorMode === 'status';
                                                    const veryDarkColor = isStatusMode ? '#475569' : getDepartmentVeryDarkColor(item.name);
                                                    const baseColor = isStatusMode ? '#F59E0B' : getDepartmentColor(item.name);
                                                    const lightColor = isStatusMode ? '#10B981' : getDepartmentLightColor(item.name);
                                                    const isSelected = selectedDepartmentFilters.some(d => d.toLowerCase() === item.name.toLowerCase());
                                                    return (
                                                        <div 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDepartmentBarClick({ name: item.name });
                                                            }}
                                                            className={`bg-[#2A281E] border ${isSelected ? 'border-[#C9AA71] ring-2 ring-[#C9AA71]/40' : 'border-[#3B3929]'} rounded-xl p-3.5 shadow-2xl text-xs space-y-2.5 min-w-[245px] cursor-pointer hover:border-[#C9AA71] transition-all select-none`}
                                                        >
                                                            <div className="flex items-center justify-between gap-2 border-b border-[#3B3929] pb-2">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <span 
                                                                        className="w-3 h-3 rounded-full shrink-0 shadow-xs" 
                                                                        style={{ backgroundColor: getDepartmentColor(item.name) }} 
                                                                    />
                                                                    <span className="font-bold text-[#FAFAFA] text-sm truncate">{item.name}</span>
                                                                </div>
                                                                <span className="text-[10px] text-muted-foreground font-mono bg-[#1C1B0E] px-1.5 py-0.5 rounded border border-[#3B3929] shrink-0">
                                                                    #{item.shortName}
                                                                </span>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between text-foreground">
                                                                    <span className="text-muted-foreground">{lang === 'id' ? 'Total Masalah' : 'Total Issues'}:</span>
                                                                    <span className="font-bold font-mono text-sm">{item.total}</span>
                                                                </div>

                                                                {/* Batang 1: Belum Diambil */}
                                                                <div 
                                                                    className="flex items-center justify-between font-semibold px-2 py-1 rounded-md border" 
                                                                    style={{ backgroundColor: `${veryDarkColor}50`, borderColor: `${veryDarkColor}90`, color: '#FAFAFA' }}
                                                                >
                                                                    <span className="flex items-center gap-1.5">
                                                                        <span className="w-2.5 h-2.5 rounded-xs inline-block shadow-sm border border-white/20" style={{ backgroundColor: veryDarkColor }}></span>
                                                                        <span>{lang === 'id' ? '1. Belum Diambil' : '1. Unclaimed'}:</span>
                                                                    </span>
                                                                    <span className="font-mono">{item.unclaimed} <span className="text-[10px] opacity-75">({item.total > 0 ? Math.round((item.unclaimed / item.total) * 100) : 0}%)</span></span>
                                                                </div>

                                                                {/* Batang 2: Sudah Diambil (Stacked: Sedang Dikerjakan + Selesai) */}
                                                                <div className="p-2 rounded-lg bg-[#1C1B0E]/70 border border-[#3B3929] space-y-1.5">
                                                                    <div className="flex items-center justify-between text-[11px] font-bold text-[#C9AA71] border-b border-[#3B3929]/50 pb-1">
                                                                        <span>{lang === 'id' ? '2. Diambil & Selesai' : '2. Handled Bar'}:</span>
                                                                        <span className="font-mono">{item.handled} <span className="text-[10px] opacity-80 font-normal">({item.total > 0 ? Math.round((item.handled / item.total) * 100) : 0}%)</span></span>
                                                                    </div>
                                                                    
                                                                    {/* Sedang Dikerjakan */}
                                                                    <div 
                                                                        className="flex items-center justify-between font-semibold px-1.5 py-0.5 rounded text-[11px]" 
                                                                        style={{ backgroundColor: `${baseColor}20`, color: '#FAFAFA' }}
                                                                    >
                                                                        <span className="flex items-center gap-1.5">
                                                                            <span className="w-2 h-2 rounded-xs inline-block shadow-sm" style={{ backgroundColor: baseColor }}></span>
                                                                            <span>{lang === 'id' ? 'Sedang Dikerjakan' : 'In Progress'}:</span>
                                                                        </span>
                                                                        <span className="font-mono">{item.inProgress} <span className="text-[10px] opacity-75">({item.handled > 0 ? Math.round((item.inProgress / item.handled) * 100) : 0}%)</span></span>
                                                                    </div>

                                                                    {/* Sudah Selesai */}
                                                                    <div 
                                                                        className="flex items-center justify-between font-semibold px-1.5 py-0.5 rounded text-[11px]" 
                                                                        style={{ backgroundColor: `${lightColor}20`, color: '#FAFAFA' }}
                                                                    >
                                                                        <span className="flex items-center gap-1.5">
                                                                            <span className="w-2 h-2 rounded-xs inline-block shadow-sm" style={{ backgroundColor: lightColor }}></span>
                                                                            <span>{lang === 'id' ? 'Sudah Selesai' : 'Solved'}:</span>
                                                                        </span>
                                                                        <span className="font-mono">{item.solved} <span className="text-[10px] opacity-75">({item.handled > 0 ? Math.round((item.solved / item.handled) * 100) : 0}%)</span></span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {/* Click to filter hint */}
                                                            <div className="pt-1.5 border-t border-[#3B3929]/70 flex items-center justify-center gap-1 text-[10px] text-[#C9AA71] font-semibold">
                                                                <span>👆</span>
                                                                <span>{isSelected ? (lang === 'id' ? 'Ketuk untuk lepas filter' : 'Tap to unfilter') : (lang === 'id' ? 'Ketuk untuk filter tiket ini' : 'Tap to filter this department')}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                }}
                                            />
                                            {/* Batang 1: Belum Diambil sama sekali */}
                                            <Bar 
                                                dataKey="unclaimed" 
                                                name={lang === 'id' ? 'Belum Diambil' : 'Unclaimed'} 
                                                stackId="unclaimed"
                                                maxBarSize={38}
                                                radius={[4, 4, 0, 0]}
                                                onClick={(data) => handleDepartmentBarClick(data)}
                                                cursor="pointer"
                                            >
                                                <LabelList content={renderUnclaimedBarLabels} />
                                                {departmentData.map((entry, index) => {
                                                    const isSelected = selectedDepartmentFilters.some(d => d.toLowerCase() === entry.name.toLowerCase());
                                                    const fillColor = deptColorMode === 'status' ? '#475569' : getDepartmentVeryDarkColor(entry.name);
                                                    return (
                                                        <Cell 
                                                            key={`cell-unclaimed-${index}`} 
                                                            fill={fillColor}
                                                            stroke={isSelected ? '#F59E0B' : 'transparent'}
                                                            strokeWidth={isSelected ? 1.5 : 0}
                                                            opacity={selectedDepartmentFilters.length > 0 ? (isSelected ? 1 : 0.35) : 1}
                                                        />
                                                    );
                                                })}
                                            </Bar>
                                            {/* Batang 2 Bagian Bawah: Sedang Dikerjakan */}
                                            <Bar 
                                                dataKey="inProgress" 
                                                name={lang === 'id' ? 'Sedang Dikerjakan' : 'In Progress'} 
                                                stackId="handled"
                                                maxBarSize={38}
                                                radius={entry => entry?.solved > 0 ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                                                onClick={(data) => handleDepartmentBarClick(data)}
                                                cursor="pointer"
                                            >
                                                <LabelList content={renderInProgressBarLabels} />
                                                {departmentData.map((entry, index) => {
                                                    const isSelected = selectedDepartmentFilters.some(d => d.toLowerCase() === entry.name.toLowerCase());
                                                    const fillColor = deptColorMode === 'status' ? '#F59E0B' : getDepartmentColor(entry.name);
                                                    return (
                                                        <Cell 
                                                            key={`cell-inprogress-${index}`} 
                                                            fill={fillColor}
                                                            stroke={isSelected ? '#F59E0B' : 'transparent'}
                                                            strokeWidth={isSelected ? 1.5 : 0}
                                                            opacity={selectedDepartmentFilters.length > 0 ? (isSelected ? 1 : 0.35) : 1}
                                                        />
                                                    );
                                                })}
                                            </Bar>
                                            {/* Batang 2 Bagian Atas: Sudah Selesai */}
                                            <Bar 
                                                dataKey="solved" 
                                                name={lang === 'id' ? 'Sudah Selesai' : 'Solved'} 
                                                stackId="handled"
                                                maxBarSize={38}
                                                radius={[4, 4, 0, 0]}
                                                onClick={(data) => handleDepartmentBarClick(data)}
                                                cursor="pointer"
                                            >
                                                <LabelList content={renderSolvedBarLabels} />
                                                {departmentData.map((entry, index) => {
                                                    const isSelected = selectedDepartmentFilters.some(d => d.toLowerCase() === entry.name.toLowerCase());
                                                    const fillColor = deptColorMode === 'status' ? '#10B981' : getDepartmentLightColor(entry.name);
                                                    return (
                                                        <Cell 
                                                            key={`cell-solved-${index}`} 
                                                            fill={fillColor}
                                                            stroke={isSelected ? '#F59E0B' : 'transparent'}
                                                            strokeWidth={isSelected ? 1.5 : 0}
                                                            opacity={selectedDepartmentFilters.length > 0 ? (isSelected ? 1 : 0.35) : 1}
                                                        />
                                                    );
                                                })}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                )
                            ) : (
                                <div className="flex h-full items-center justify-center text-muted-foreground">{t('no_data')}</div>
                            )}
                        </div>
                    )}
                </div>
            </div>

                {/* Animated Timeline Section */}
                <div ref={recentActivityRef} className="bg-surface p-6 rounded-2xl shadow-sm border border-border/50 flex flex-col gap-5">
                    {/* Header Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                                <Clock className="h-5 w-5 text-[#C9AA71]" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-foreground">{t('recent_activity')}</h2>
                                <p className="text-xs text-muted-foreground">
                                    {lang === 'id' ? 'Klik kartu status atau grafik di atas untuk memfilter aktivitas laporan' : 'Click status cards or charts above to filter recent activity'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto flex-wrap">
                            {/* Compact Archive Indicator for Admin */}
                            {isAdmin && analyticsStats.archived > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowArchivedInTimeline(prev => !prev)}
                                    aria-pressed={showArchivedInTimeline}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 border cursor-pointer select-none shadow-sm ${
                                        showArchivedInTimeline
                                            ? 'bg-rose-500/25 text-rose-300 border-rose-500/60 ring-1 ring-rose-500/40 font-bold'
                                            : 'bg-[#2A281E] text-rose-300/80 hover:text-rose-200 border-[#3B3929] hover:bg-[#3B3929]'
                                    }`}
                                    title={lang === 'id' 
                                        ? (showArchivedInTimeline ? 'Sembunyikan isu diarsipkan dari aktivitas' : 'Klik untuk menambahkan isu diarsipkan ke aktivitas') 
                                        : (showArchivedInTimeline ? 'Hide archived issues from activity' : 'Click to add archived issues to activity')}
                                >
                                    <Archive className="w-3.5 h-3.5 text-rose-400" />
                                    <span>{lang === 'id' ? 'Arsip' : 'Archived'}</span>
                                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                                        showArchivedInTimeline ? 'bg-rose-500 text-white' : 'bg-rose-500/25 text-rose-200 border border-rose-500/30'
                                    }`}>
                                        {analyticsStats.archived}
                                    </span>
                                    {showArchivedInTimeline && (
                                        <span className="text-xs text-rose-300 font-bold">✓</span>
                                    )}
                                </button>
                            )}

                            {/* Toggle Detailed Filters Dropdown Button */}
                            <button
                                type="button"
                                onClick={() => setShowDetailedFilters(prev => !prev)}
                                aria-expanded={showDetailedFilters}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 border cursor-pointer select-none ${
                                    showDetailedFilters || activeDetailedFilterCount > 0
                                        ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] shadow-sm font-extrabold ring-1 ring-[#C9AA71]/40'
                                        : 'bg-[#2A281E] text-muted-foreground hover:text-foreground border-[#3B3929] hover:bg-[#3B3929]/70 hover:border-border'
                                }`}
                            >
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                                <span>{lang === 'id' ? 'Filter Departemen' : 'Department Filter'}</span>
                                {activeDetailedFilterCount > 0 && (
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black bg-[#1C1B0E] text-[#C9AA71]">
                                        {activeDetailedFilterCount}
                                    </span>
                                )}
                                {showDetailedFilters ? (
                                    <ChevronUp className="h-3.5 w-3.5" />
                                ) : (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                )}
                            </button>

                            {/* Show count selector */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground font-medium">{t('show')}:</span>
                                <select
                                    value={timelineLimit}
                                    onChange={(e) => setTimelineLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                    className="appearance-none px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#3B3929] bg-[#2A281E] text-[#FAFAFA] cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary h-8 min-w-[85px] text-center shadow-sm"
                                >
                                    <option value={10} className="bg-[#2A281E] text-[#FAFAFA]">10 {t('items')}</option>
                                    <option value={20} className="bg-[#2A281E] text-[#FAFAFA]">20 {t('items')}</option>
                                    <option value={50} className="bg-[#2A281E] text-[#FAFAFA]">50 {t('items')}</option>
                                    <option value="all" className="bg-[#2A281E] text-[#FAFAFA]">{t('all_items')}</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Mini 6-Card Status Filter Bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 w-full">
                        {analyticsCards.map(({ key, status, label, value, badge, Icon, accent, activeRing, activeAccent }) => {
                            const isActive = (status === 'all' && selectedStatusFilters.length === 0) || 
                                             (status !== 'all' && selectedStatusFilters.includes(status));
                            const isFiltered = selectedStatusFilters.length > 0;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => handleStatusCardClick(status)}
                                    aria-pressed={isActive}
                                    className={`group relative flex items-center justify-between gap-2.5 rounded-xl border p-3 text-left transition-all duration-200 shadow-sm select-none cursor-pointer ${
                                        isActive
                                            ? `bg-surface ring-2 scale-[1.01] ${activeRing}`
                                            : isFiltered
                                                ? 'border-border/60 bg-surface/60 opacity-60 hover:opacity-100 hover:border-border hover:bg-surface hover:scale-[1.01]'
                                                : 'border-border bg-surface hover:border-primary/40 hover:bg-surface/90 hover:scale-[1.01] active:scale-[0.99]'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span
                                            className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105 ${
                                                isActive ? activeAccent : accent
                                            }`}
                                        >
                                            <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" aria-hidden />
                                        </span>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <p className="text-lg sm:text-xl font-bold leading-none text-foreground">{value}</p>
                                                {badge && (
                                                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-600 text-white animate-pulse">
                                                        {badge}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1 text-[11px] font-medium text-muted-foreground truncate">{label}</p>
                                        </div>
                                    </div>

                                    {isActive && (
                                        <span className="hidden sm:inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-primary">
                                            ✓
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Active Filters Bar (Department / Status / Search / Archive) */}
                    {(selectedDepartmentFilters.length > 0 || selectedStatusFilters.length > 0 || showArchivedInTimeline || searchQuery.trim()) && (
                        <div className="flex items-center gap-2 flex-wrap bg-[#1E1D16] p-2.5 rounded-xl border border-[#3B3929]/70 text-xs">
                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                <Tag className="w-3.5 h-3.5 text-[#C9AA71]" />
                                {lang === 'id' ? 'Filter Aktif:' : 'Active Filters:'}
                            </span>

                            {selectedDepartmentFilters.map(dept => {
                                let modePrefix = lang === 'id' ? 'Ditugaskan' : 'Assigned';
                                let ModeIcon = Target;
                                if (deptFilterMode === 'origin') {
                                    modePrefix = lang === 'id' ? 'Asal' : 'Origin';
                                    ModeIcon = FileText;
                                } else if (deptFilterMode === 'tagged') {
                                    modePrefix = lang === 'id' ? 'Ditandai' : 'Tagged';
                                    ModeIcon = Megaphone;
                                } else if (deptFilterMode === 'all') {
                                    modePrefix = lang === 'id' ? 'Terkait' : 'Related';
                                    ModeIcon = Globe;
                                }
                                const theme = getDepartmentTheme(dept);

                                return (
                                    <span 
                                        key={dept} 
                                        style={{ 
                                            backgroundColor: theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.12)' : `${theme.bg}25`, 
                                            borderColor: theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.4)' : `${theme.bg}80`,
                                            color: theme.bg === '#212121' ? '#FFFFFF' : (theme.text === '#14130B' ? '#FBBF24' : theme.bg)
                                        }}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border"
                                    >
                                        <span 
                                            className="h-2 w-2 rounded-full shrink-0 border border-white/30" 
                                            style={{ backgroundColor: theme.bg }}
                                        />
                                        <ModeIcon className="w-3.5 h-3.5 shrink-0" />
                                        <span>{modePrefix}: {dept}</span>
                                        <button 
                                            type="button" 
                                            onClick={() => setSelectedDepartmentFilters(prev => prev.filter(d => d !== dept))}
                                            className="hover:text-white cursor-pointer ml-0.5"
                                        >
                                            ✕
                                        </button>
                                    </span>
                                );
                            })}

                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedDepartmentFilters([]);
                                    setSelectedStatusFilters([]);
                                    setShowArchivedInTimeline(false);
                                    setSearchQuery('');
                                }}
                                className="text-[11px] font-bold text-[#C9AA71] hover:underline ml-auto cursor-pointer"
                            >
                                ✕ {lang === 'id' ? 'Reset Semua Filter' : 'Reset All Filters'}
                            </button>
                        </div>
                    )}

                    {/* Collapsible Dropdown Drawer for Detailed Department Filters */}
                    {showDetailedFilters && (
                        <div className="flex flex-col gap-3 p-3.5 sm:p-4.5 rounded-2xl bg-[#14130B]/95 border border-[#3B3929] shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
                            {/* Drawer Header */}
                            <div className="flex items-center justify-between pb-2 border-b border-[#3B3929]/50 text-xs">
                                <span className="font-bold text-[#E3D1AA] flex items-center gap-2">
                                    <Filter className="w-3.5 h-3.5 text-[#C9AA71]" />
                                    {lang === 'id' ? 'Pilihan Filter Lanjutan (Departemen)' : 'Advanced Filters (Department)'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShowDetailedFilters(false)}
                                    className="text-muted-foreground hover:text-foreground text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                    <span>{lang === 'id' ? 'Tutup' : 'Close'}</span>
                                    <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Combinable Department Filter Pills for Timeline Activity */}
                            <div className="flex flex-col gap-2.5 bg-[#1E1D16] p-2.5 rounded-xl border border-[#3B3929]/80 shadow-inner">
                                <div className="flex items-center justify-between gap-2 flex-wrap pb-1 border-b border-[#3B3929]/40">
                                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1 flex items-center gap-1.5">
                                        <Building2 className="h-3.5 w-3.5 text-[#C9AA71]" />
                                        {t('department')}:
                                    </span>

                                    {/* Assigned / Origin / Tagged / All Mode Selector */}
                                    <div className="flex items-center rounded-lg bg-[#2A281E] p-0.5 border border-[#3B3929] text-xs">
                                        <button
                                            type="button"
                                            onClick={() => setDeptFilterMode('assigned')}
                                            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                deptFilterMode === 'assigned'
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-bold'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            <Target className="w-3.5 h-3.5 shrink-0" />
                                            <span>{isDeptUser ? t('dept_mode_incoming') : t('dept_mode_assigned')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDeptFilterMode('origin')}
                                            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                deptFilterMode === 'origin'
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-bold'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            <FileText className="w-3.5 h-3.5 shrink-0" />
                                            <span>{isDeptUser ? t('dept_mode_outgoing') : t('dept_mode_origin')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDeptFilterMode('tagged')}
                                            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                deptFilterMode === 'tagged'
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-bold'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            <Megaphone className="w-3.5 h-3.5 shrink-0" />
                                            <span>{t('dept_mode_tagged')}</span>
                                        </button>
                                        {!isDeptUser && (
                                            <button
                                                type="button"
                                                onClick={() => setDeptFilterMode('all')}
                                                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                    deptFilterMode === 'all'
                                                        ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-bold'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                <Globe className="w-3.5 h-3.5 shrink-0" />
                                                <span>{t('dept_mode_all')}</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Department Pills */}
                                <div className="flex items-center gap-1.5 text-xs flex-wrap pt-0.5">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedDepartmentFilters([])}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer border ${
                                            selectedDepartmentFilters.length === 0
                                                ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] font-extrabold shadow-sm'
                                                : 'bg-[#2A281E]/60 text-muted-foreground border-transparent hover:border-[#3B3929] hover:text-foreground opacity-70 hover:opacity-100'
                                        }`}
                                    >
                                        {t('all_departments')}
                                    </button>

                                    {ALL_DEPARTMENTS.map(dept => {
                                        const isSelected = selectedDepartmentFilters.includes(dept);
                                        const theme = getDepartmentTheme(dept);
                                        return (
                                            <button
                                                key={dept}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedDepartmentFilters(prev => 
                                                        prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
                                                    );
                                                }}
                                                style={isSelected ? {
                                                    backgroundColor: theme.bg,
                                                    color: theme.text,
                                                    borderColor: theme.bg,
                                                    boxShadow: `0 0 10px ${theme.bg}80`
                                                } : undefined}
                                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer border ${
                                                    isSelected
                                                        ? 'font-bold ring-1 ring-white/30'
                                                        : 'bg-[#2A281E]/60 text-muted-foreground border-transparent hover:border-[#3B3929] hover:text-foreground opacity-75 hover:opacity-100'
                                                }`}
                                            >
                                                <span 
                                                    className="h-2 w-2 rounded-full shrink-0 border border-white/20" 
                                                    style={{ backgroundColor: theme.bg }}
                                                />
                                                <span>{dept}</span>
                                            </button>
                                        );
                                    })}

                                    {selectedDepartmentFilters.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDepartmentFilters([])}
                                            className="text-[11px] font-semibold text-[#C9AA71] hover:text-[#FAFAFA] px-2 py-1 rounded hover:bg-[#2A281E] transition-colors ml-1 cursor-pointer"
                                        >
                                            ✕ {t('reset_dept')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="relative pl-4 border-l-2 border-border ml-2" ref={timelineRef}>
                        {activityLog.length > 0 ? (
                            <div className="flex flex-col gap-3">
                                {activityLog.map((ev, idx) => {
                                    const dateObj = new Date(ev.date);
                                    const locale = lang === 'id' ? 'id-ID' : 'en-US';
                                    let dateStr = t('date_na');
                                    let timeStr = '';
                                    if (!isNaN(dateObj.getTime())) {
                                        dateStr = dateObj.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
                                        timeStr = dateObj.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
                                    }
                                    
                                    const isEmergency = String(ev.issueId || '').toUpperCase().startsWith('SOS') || 
                                                        (ev.originalIssue?.category || '').toLowerCase() === 'emergency';
                                    const isArchived = ev.type === 'archive' || ev.originalIssue?.isArchived;

                                    let actionBadge = null;
                                    let dotColor = 'bg-blue-500';
                                    
                                    switch(ev.type) {
                                        case 'archive':
                                            dotColor = 'bg-rose-500';
                                            actionBadge = (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                                    📦 {lang === 'id' ? 'Diarsipkan' : 'Archived'}
                                                </span>
                                            );
                                            break;
                                        case 'create':
                                            dotColor = isEmergency ? 'bg-red-500' : 'bg-blue-500';
                                            actionBadge = (
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                                    isEmergency 
                                                        ? 'bg-red-500/15 text-red-400 border-red-500/30' 
                                                        : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                                }`}>
                                                    {lang === 'id' ? 'Laporan Dibuat' : 'Report Created'}
                                                </span>
                                            );
                                            break;
                                        case 'claim':
                                            dotColor = isEmergency ? 'bg-red-500' : 'bg-amber-500';
                                            actionBadge = (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                                    {lang === 'id' ? 'Diambil (Claim)' : 'Claimed'}
                                                </span>
                                            );
                                            break;
                                        case 'pending':
                                            dotColor = isEmergency ? 'bg-red-500' : isCritical ? 'bg-amber-500' : 'bg-orange-500';
                                            actionBadge = (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/30">
                                                    {lang === 'id' ? 'Ditunda (Pending)' : 'Pending'}
                                                </span>
                                            );
                                            break;
                                        case 'solve':
                                            dotColor = 'bg-green-500';
                                            actionBadge = (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/30">
                                                    {lang === 'id' ? 'Selesai (Solved)' : 'Solved'}
                                                </span>
                                            );
                                            break;
                                        case 'revert':
                                            dotColor = 'bg-amber-400';
                                            actionBadge = (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                                    ↩️ {lang === 'id' ? 'Mundur Progres' : 'Progress Rollback'}
                                                </span>
                                            );
                                            break;
                                        case 'edit':
                                            dotColor = 'bg-sky-400';
                                            actionBadge = (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                                    ✏️ {lang === 'id' ? 'Data Diedit' : 'Edited'}
                                                </span>
                                            );
                                            break;
                                    }

                                    return (
                                        <div key={ev.id} className="timeline-item relative">
                                            {isEmergency ? (
                                                <div className="absolute -left-[23px] top-3.5 flex items-center justify-center z-10">
                                                    <span className="absolute h-5 w-5 rounded-full bg-red-500/35 animate-ping pointer-events-none" />
                                                    <span className="h-4 w-4 rounded-full border-2 border-[#181711] bg-red-500 shadow-[0_0_12px_rgba(239,68,68,1)] ring-2 ring-red-500/30" />
                                                </div>
                                            ) : isCritical ? (
                                                <div className="absolute -left-[22px] top-3.5 flex items-center justify-center z-10">
                                                    <span className="h-4 w-4 rounded-full border-2 border-[#181711] bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.85)] ring-2 ring-amber-500/30" />
                                                </div>
                                            ) : isArchived ? (
                                                <div className="absolute -left-[21px] top-4 h-3.5 w-3.5 rounded-full border-2 border-surface shadow-sm z-10 bg-rose-500" />
                                            ) : (
                                                <div className={`absolute -left-[21px] top-4 h-3.5 w-3.5 rounded-full border-2 border-surface shadow-sm z-10 ${dotColor}`} />
                                            )}
                                            
                                            <div 
                                                onClick={() => setSelectedActivityIssue(ev.originalIssue)}
                                                className={`group flex flex-col gap-2 p-4 rounded-xl cursor-pointer transition-all duration-200 ${
                                                    isEmergency
                                                        ? 'border border-red-500/30 border-l-[4px] border-l-red-500 bg-gradient-to-r from-red-950/25 via-[#1E1D16] to-[#1E1D16] shadow-[0_0_18px_rgba(239,68,68,0.12)] hover:border-red-500/60 hover:shadow-[0_0_24px_rgba(239,68,68,0.22)] hover:bg-[#231E17]'
                                                        : isArchived
                                                            ? 'border border-rose-500/30 border-l-[4px] border-l-rose-500/80 bg-gradient-to-r from-rose-950/20 via-[#1E1D16] to-[#1E1D16] shadow-sm hover:border-rose-500/50 hover:bg-[#241E1C]'
                                                            : 'border border-border/80 bg-[#1E1D16] shadow-sm hover:border-primary/60 hover:bg-[#25241B]'
                                                }`}
                                            >
                                                {/* Header Row: Title + Department + ID + Click Indicator */}
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                                        <span className={`text-base font-bold transition-colors truncate max-w-md ${
                                                            isEmergency 
                                                                ? 'text-white group-hover:text-red-300' 
                                                                : isArchived
                                                                    ? 'text-white group-hover:text-rose-300'
                                                                    : 'text-foreground group-hover:text-primary'
                                                        }`}>
                                                            {ev.title}
                                                        </span>
                                                        {isEmergency && (
                                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.25)]">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
                                                                {lang === 'id' ? 'DARURAT (SOS)' : 'SOS EMERGENCY'}
                                                            </span>
                                                        )}
                                                        {isArchived && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                                                📦 {lang === 'id' ? 'DIARSIPKAN' : 'ARCHIVED'}
                                                            </span>
                                                        )}
                                                        {ev.originalIssue?.department && (
                                                            <span className="text-xs px-2 py-0.5 rounded bg-muted/40 text-muted-foreground border border-border/40 font-medium">
                                                                {ev.originalIssue.department}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md border shadow-inner ${
                                                            isEmergency
                                                                ? 'text-red-400 bg-red-950/50 border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.25)]'
                                                                : isArchived
                                                                    ? 'text-rose-400 bg-rose-950/40 border-rose-500/40'
                                                                    : 'text-[#C9AA71] bg-[#2A281E] border-[#3B3929]'
                                                        }`}>
                                                            {ev.issueId}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (isArchived) {
                                                                    setSelectedActivityIssue(ev.originalIssue);
                                                                } else {
                                                                    handleOpenIssueCard(ev.originalIssue);
                                                                }
                                                            }}
                                                            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all shadow-sm cursor-pointer z-10 ${
                                                                isEmergency
                                                                    ? 'bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-red-100 border border-red-700/50'
                                                                    : isArchived
                                                                        ? 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-100 border border-rose-700/50'
                                                                        : 'bg-[#2A281E] hover:bg-[#3B3929] text-[#C9AA71] hover:text-[#FAFAFA] border border-[#3B3929]'
                                                            }`}
                                                            title={isArchived ? (lang === 'id' ? 'Lihat Riwayat Isu' : 'View Issue History') : (lang === 'id' ? 'Buka Kartu Isu (Foto & Detail)' : 'Open Issue Card')}
                                                        >
                                                            <Eye className="w-3.5 h-3.5" />
                                                            <span>Detail</span>
                                                        </button>
                                                        <ChevronRight className={`w-4 h-4 transition-all ${
                                                            isEmergency
                                                                ? 'text-red-400/60 group-hover:text-red-400 group-hover:translate-x-0.5'
                                                                : isArchived
                                                                    ? 'text-rose-400/60 group-hover:text-rose-400 group-hover:translate-x-0.5'
                                                                    : 'text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5'
                                                        }`} />
                                                    </div>
                                                </div>

                                                {/* Detail Row: Action + Person + Date/Time */}
                                                <div className={`flex flex-wrap items-center justify-between gap-2 pt-1 border-t text-xs ${
                                                    isEmergency 
                                                        ? 'border-red-900/40 text-red-300/80' 
                                                        : isArchived
                                                            ? 'border-rose-900/30 text-rose-300/80'
                                                            : 'border-border/30 text-muted-foreground'
                                                }`}>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {actionBadge}
                                                        <span className={isEmergency ? 'text-red-300/70' : isArchived ? 'text-rose-300/70' : 'text-muted-foreground'}>
                                                            {isArchived ? (lang === 'id' ? 'Oleh:' : 'By:') : t('by_reporter')}
                                                        </span>
                                                        <span className={`font-bold px-2 py-0.5 rounded border ${
                                                            isEmergency
                                                                ? 'text-red-200 bg-red-950/40 border-red-800/40'
                                                                : isArchived
                                                                    ? 'text-rose-200 bg-rose-950/40 border-rose-800/40'
                                                                    : 'text-foreground bg-surface border-border/50'
                                                        }`}>
                                                            {ev.person}
                                                        </span>
                                                    </div>

                                                    <div className={`font-medium flex items-center gap-1.5 ml-auto ${
                                                        isEmergency ? 'text-red-300/75' : isArchived ? 'text-rose-300/75' : 'text-muted-foreground'
                                                    }`}>
                                                        <span>📅 {dateStr}</span>
                                                        <span>•</span>
                                                        <span>⏰ {timeStr}</span>
                                                    </div>
                                                </div>

                                                {/* Optional Reason / Details */}
                                                {ev.reason && (
                                                    <div className={`text-xs p-2.5 rounded-lg border italic ${
                                                        isCritical
                                                            ? 'text-red-200/90 bg-red-950/30 border-red-800/40'
                                                            : isArchived
                                                                ? 'text-rose-200/90 bg-rose-950/20 border-rose-800/30'
                                                                : 'text-muted-foreground bg-black/20 border-border/40'
                                                    }`}>
                                                        💬 <span className={`font-semibold ${isCritical ? 'text-red-300' : isArchived ? 'text-rose-300' : 'text-foreground/80'}`}>
                                                            {lang === 'id' ? 'Alasan/Catatan: ' : 'Reason/Notes: '}
                                                        </span>
                                                        "{ev.reason}"
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-muted-foreground italic">{t('no_recent_activity')}</div>
                        )}
                    </div>
                </div>
            </main>
            <ScrollToTop />
            {exportOpen && (
                <Suspense fallback={null}>
                    <ExportPdfModal open={exportOpen} onOpenChange={setExportOpen} />
                </Suspense>
            )}
            {scheduleModalOpen && (
                <MonthlyReportScheduleModal open={scheduleModalOpen} onOpenChange={setScheduleModalOpen} />
            )}
            <ActivityDetailModal 
                issue={selectedActivityIssue} 
                onClose={() => setSelectedActivityIssue(null)} 
                onOpenCardModal={selectedActivityIssue?._isPastContribution ? undefined : (issue) => setCardModalTarget(issue)}
                onEdit={isAdmin ? (issue) => setEditTarget(issue) : undefined}
            />

            {editTarget && (
                <EditDescriptionModal
                    issue={editTarget}
                    open={!!editTarget}
                    onOpenChange={(open) => {
                        if (!open) setEditTarget(null);
                    }}
                    onSuccess={(updatedIssue) => {
                        setSelectedActivityIssue(prev => {
                            if (prev && String(prev.id) === String(updatedIssue.id)) {
                                return { ...prev, ...updatedIssue };
                            }
                            return prev;
                        });
                        fetchIssues();
                    }}
                />
            )}

            {cardModalTarget?.status === 'open' && (
                <TakeJobModal 
                    issue={cardModalTarget} 
                    onClose={() => setCardModalTarget(null)} 
                />
            )}
            {cardModalTarget?.status === 'progress' && (
                <ResolveIssueSheet 
                    issue={cardModalTarget} 
                    onClose={() => setCardModalTarget(null)} 
                />
            )}
            {(cardModalTarget?.status === 'pending' || cardModalTarget?.status === 'solved') && (
                <SolvedDetailModal 
                    issue={cardModalTarget} 
                    onClose={() => setCardModalTarget(null)} 
                />
            )}
            <MobileBottomNav currentTab="analytics" />
            </div>
        </div>
    );
}
