import axios from 'axios';
import { Head } from '@inertiajs/react';
import { useMemo, useState, useEffect, useRef } from 'react';
import { 
    Loader2, Wrench, Sparkles, Laptop, Anchor, ShieldAlert, Utensils, Building, Hammer, Zap,
    Droplets, Building2, Bug, Tag, User, HelpCircle, Download, AlertTriangle, Layers, Database, Clock, CheckSquare, Check, Eye, ChevronRight,
    ClipboardList, PauseCircle, CheckCircle2, Filter, SlidersHorizontal, ChevronDown, ChevronUp
} from 'lucide-react';
import anime from 'animejs';
import {
    PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

import { IssuesProvider, useIssues, DEFAULT_CATEGORIES } from '@/context/IssuesContext';
import { useLanguage } from '@/context/LanguageContext';
import { ALL_DEPARTMENTS, normalizeDepartment } from '@/constants/staff';
import { getDepartmentColor, getDepartmentTheme, getDepartmentTextColor, getDepartmentLightColor, getDepartmentDarkColor } from '@/constants/departments';
import { CampusFixHeader } from '@/Components/CampusFix/CampusFixHeader';
import { ScrollToTop } from '@/Components/CampusFix/ScrollToTop';
import { ExportPdfModal } from '@/Components/CampusFix/ExportPdfModal';
import { ActivityDetailModal } from '@/Components/CampusFix/ActivityDetailModal';
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

const CATEGORY_COLORS = {
    'emergency': '#EF4444',      // Vivid Crimson Red — Emergency
    'broken': '#F97316',         // Warm Orange — Broken Equipment
    'plumbing': '#3B82F6',       // Blue — Plumbing
    'electrical': '#F59E0B',     // Amber/Gold — Electrical
    'structural': '#D97706',     // Warm Bronze/Orange — Structural / Building
    'pest-hygiene': '#10B981',   // Emerald Green — Pest & Hygiene
    'it-technology': '#8B5CF6',  // Violet — IT & Technology
    'marine-outdoor': '#06B6D4', // Ocean Cyan — Marine & Outdoor
    'safety-hazard': '#DC2626',  // Deep Crimson — Safety Hazard
    'guest-issues': '#EC4899',   // Rose Pink — Guest Issues
    'other': '#6B7280',          // Slate Gray — Other
};

const CATEGORY_ICONS = {
    'emergency': AlertTriangle,
    'broken': Wrench,
    'plumbing': Droplets,
    'electrical': Zap,
    'structural': Building2,
    'pest-hygiene': Bug,
    'it-technology': Laptop,
    'marine-outdoor': Anchor,
    'safety-hazard': ShieldAlert,
    'guest-issues': User,
    'other': HelpCircle,
};

const getCategoryColor = (catId, index) => {
    const key = (catId || '').toLowerCase().trim();
    if (key === 'emergency' || key.includes('emergency')) {
        return '#EF4444'; // Red for Emergency
    }
    if (CATEGORY_COLORS[key]) {
        return CATEGORY_COLORS[key];
    }
    if (CATEGORY_COLORS[catId]) {
        return CATEGORY_COLORS[catId];
    }
    return COLORS[index % COLORS.length];
};

const CustomCategoryPieLabel = (props) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent, payload } = props;
    if (!percent || percent < 0.03) return null;

    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    const catId = (payload?.id || 'other').toLowerCase().trim();
    const IconComponent = CATEGORY_ICONS[catId] || HelpCircle;
    const iconSize = Math.min(Math.max((outerRadius - innerRadius) * 0.55, 14), 22);

    return (
        <g 
            transform={`translate(${x}, ${y}) rotate(-30)`}
            style={{ pointerEvents: 'none' }}
        >
            <g transform={`translate(${-iconSize / 2}, ${-iconSize / 2})`}>
                <IconComponent 
                    size={iconSize} 
                    color="#FFFFFF" 
                    opacity={0.45} 
                    strokeWidth={2.2} 
                />
            </g>
        </g>
    );
};

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
    const { isAdmin, isDeptUser, department } = useAuth();
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

    // Combined issues from all selected sheets (strictly scoped to department for dept users)
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
                    all.push({ ...item, _sheet: sheetName });
                }
            });
        });
        if (isDeptUser && department) {
            const userDeptNorm = normalizeDepartment(department).toLowerCase();
            return all.filter(issue => {
                const assigned = safeArray(issue.assignedDepartments).map(d => normalizeDepartment(d).toLowerCase());
                const tagged = safeArray(issue.taggedDepartments).map(d => normalizeDepartment(d).toLowerCase());
                const originDept = normalizeDepartment(issue.department || '').toLowerCase();

                return assigned.includes(userDeptNorm) || tagged.includes(userDeptNorm) || originDept === userDeptNorm;
            });
        }
        return all;
    }, [selectedSheets, sheetDataMap, currentSheet, issues, isDeptUser, department]);

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
            const rawTime = issue.reportedAt || (issue.reportedAtIso ? new Date(issue.reportedAtIso).getTime() : 0);
            if (!rawTime) return true; // Keep if date is unspecified
            return rawTime >= cutoff;
        });
    }, [combinedIssues, timeRange]);
    const { t, lang } = useLanguage();
    const [timelineLimit, setTimelineLimit] = useState(20);
    const [searchQuery, setSearchQuery] = useState('');
    const [exportOpen, setExportOpen] = useState(false);
    const [selectedActivityIssue, setSelectedActivityIssue] = useState(null);
    const [cardModalTarget, setCardModalTarget] = useState(null);

    const handleOpenIssueCard = (issue) => {
        setCardModalTarget(issue);
    };
    const [selectedStatusFilters, setSelectedStatusFilters] = useState([]);
    // Department filter: empty by default so it shows all issues within the user's scope
    const [selectedDepartmentFilters, setSelectedDepartmentFilters] = useState([]);
    const [deptFilterMode, setDeptFilterMode] = useState('assigned');
    const [selectedCategoryFilters, setSelectedCategoryFilters] = useState([]);
    const [showDetailedFilters, setShowDetailedFilters] = useState(false);
    const timelineRef = useRef(null);
    const chartsContainerRef = useRef(null);
    const recentActivityRef = useRef(null);
    const [chartsVisible, setChartsVisible] = useState(true);
    const prevTimelineHash = useRef('');

    const activeDetailedFilterCount = selectedDepartmentFilters.length + selectedCategoryFilters.length;

    // Interactive Chart Click Handlers
    const handleCategoryPieClick = (entry) => {
        const catId = entry?.id || entry?.payload?.id;
        if (!catId) return;
        setSelectedCategoryFilters(prev => {
            const lower = catId.toLowerCase();
            const exists = prev.some(c => c.toLowerCase() === lower);
            return exists ? prev.filter(c => c.toLowerCase() !== lower) : [...prev, catId];
        });
        recentActivityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

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
        return {
            total: list.length,
            open: list.filter(i => i.status === 'open').length,
            progress: list.filter(i => i.status === 'progress').length,
            pending: list.filter(i => i.status === 'pending').length,
            solved: list.filter(i => i.status === 'solved').length,
            critical: list.filter(i => i.priority === 'critical' && i.status !== 'solved').length,
        };
    }, [timeFilteredIssues]);

    // Perspective Breakdown Counts (Admin Macro vs Department Relational)
    const perspectiveStats = useMemo(() => {
        if (!timeFilteredIssues) {
            return null;
        }

        if (isDeptUser && department) {
            const userDeptNorm = normalizeDepartment(department).toLowerCase();
            let incoming = 0;
            let outgoing = 0;
            let tagged = 0;

            timeFilteredIssues.forEach(issue => {
                const assigned = safeArray(issue.assignedDepartments).map(d => normalizeDepartment(d).toLowerCase());
                const tags = safeArray(issue.taggedDepartments).map(d => normalizeDepartment(d).toLowerCase());
                const originDept = normalizeDepartment(issue.department || '').toLowerCase();

                const isAssigned = assigned.includes(userDeptNorm) || (assigned.length === 0 && originDept === userDeptNorm);
                const isOrigin = originDept === userDeptNorm;
                const isTagged = tags.includes(userDeptNorm);

                if (isAssigned) incoming++;
                if (isOrigin) outgoing++;
                if (isTagged) tagged++;
            });

            return {
                isDept: true,
                badgeIcon: '👤',
                title: `${t('dept_perspective_title') || (lang === 'id' ? 'Perspektif Departemen' : 'Department Perspective')}: ${department}`,
                desc: t('dept_perspective_desc') || (lang === 'id' ? 'Menampilkan hubungan kerja departemen Anda dengan tim lain.' : 'Showing your department’s interactions with other teams.'),
                stat1: { count: incoming, label: lang === 'id' ? 'Tugas Masuk' : 'Incoming', icon: '📥', mode: 'assigned', title: t('tooltip_incoming_dept') },
                stat2: { count: outgoing, label: lang === 'id' ? 'Permintaan Keluar' : 'Outgoing', icon: '📤', mode: 'origin', title: t('tooltip_outgoing_dept') },
                stat3: { count: tagged, label: lang === 'id' ? 'Di-tag / CC' : 'Tagged', icon: '📢', mode: 'tagged', title: t('tooltip_tagged_dept') },
                total: timeFilteredIssues.length
            };
        } else {
            // Admin Resort-wide Perspective
            let assigned = 0;
            let origin = 0;
            let tagged = 0;

            timeFilteredIssues.forEach(issue => {
                const assigns = safeArray(issue.assignedDepartments);
                const tags = safeArray(issue.taggedDepartments);
                const originDept = (issue.department || '').trim();

                if (assigns.length > 0) assigned++;
                if (originDept && !['emergency', 'undefined', 'unknown'].includes(originDept.toLowerCase())) origin++;
                if (tags.length > 0 && !tags.includes('None')) tagged++;
            });

            return {
                isDept: false,
                badgeIcon: '👑',
                title: lang === 'id' ? 'Perspektif Admin (Seluruh Resort)' : 'Admin Perspective (Resort-wide Overview)',
                desc: lang === 'id' ? 'Menampilkan beban kerja perbaikan dan aktivitas pelaporan di seluruh departemen resort.' : 'Showing repair workload and reporting activity across all resort departments.',
                stat1: { count: assigned, label: lang === 'id' ? 'Beban Tugas' : 'Assigned Work', icon: '🎯', mode: 'assigned', title: t('tooltip_assigned_dept') },
                stat2: { count: origin, label: lang === 'id' ? 'Laporan Dibuat' : 'Origin Reports', icon: '🏠', mode: 'origin', title: t('tooltip_origin_dept') },
                stat3: { count: tagged, label: lang === 'id' ? 'Tiket Di-tag' : 'Tagged Tickets', icon: '📢', mode: 'tagged', title: t('tooltip_tagged_dept') },
                total: timeFilteredIssues.length
            };
        }
    }, [isDeptUser, department, timeFilteredIssues, t, lang]);

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

    // Chart Data Precomputation
    const categoryData = useMemo(() => {
        if (!timeFilteredIssues || timeFilteredIssues.length === 0) return [];
        const counts = {};
        timeFilteredIssues.forEach(issue => {
            const cat = (issue.category || 'other').toLowerCase().trim();
            counts[cat] = (counts[cat] || 0) + 1;
        });

        return Object.keys(counts)
            .map(catKey => {
                const def = DEFAULT_CATEGORIES.find(c => c.id.toLowerCase() === catKey);
                let name = def ? def.label : (catKey.charAt(0).toUpperCase() + catKey.slice(1));
                if (catKey === 'emergency') {
                    name = 'Emergency';
                }
                return { id: catKey, name, value: counts[catKey] };
            })
            .sort((a, b) => b.value - a.value);
    }, [timeFilteredIssues]);

    const departmentData = useMemo(() => {
        if (!timeFilteredIssues || timeFilteredIssues.length === 0) return [];
        const counts = {};
        const userDeptNorm = isDeptUser && department ? normalizeDepartment(department).toLowerCase() : null;

        const addDeptCount = (deptName, isSolved) => {
            if (!deptName) return;
            const trimmed = deptName.trim();
            const lower = trimmed.toLowerCase();
            if (!trimmed || lower === 'emergency' || lower === 'undefined' || lower === 'unknown' || lower === 'all' || lower === 'none') return;
            if (!counts[trimmed]) {
                counts[trimmed] = { total: 0, solved: 0, active: 0 };
            }
            counts[trimmed].total += 1;
            if (isSolved) {
                counts[trimmed].solved += 1;
            } else {
                counts[trimmed].active += 1;
            }
        };

        timeFilteredIssues.forEach(issue => {
            const isSolved = issue.status === 'solved';

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
                        addDeptCount(rawOrigin || 'Unknown', isSolved);
                    }
                } else if (deptFilterMode === 'origin') {
                    // OUTGOING (Permintaan Keluar dari kita): Tiket yang dilaporkan oleh kita ditugaskan ke departemen mana?
                    if (originNorm === userDeptNorm) {
                        if (assigns.length > 0) {
                            assigns.forEach(d => addDeptCount(d, isSolved));
                        } else {
                            addDeptCount(rawOrigin || department, isSolved);
                        }
                    }
                } else if (deptFilterMode === 'tagged') {
                    // TAGGED (Di-tag / CC): Siapa pelapor tiket di mana kita di-tag?
                    const isTaggedMe = tags.some(d => normalizeDepartment(d).toLowerCase() === userDeptNorm);
                    if (isTaggedMe) {
                        addDeptCount(rawOrigin, isSolved);
                    }
                } else {
                    // ALL SCOPE: Seluruh departemen yang berinteraksi dengan kita
                    const partnerDepts = new Set();
                    if (rawOrigin && !['emergency', 'undefined', 'unknown'].includes(originNorm)) {
                        partnerDepts.add(rawOrigin);
                    }
                    assigns.forEach(d => { if (d && d !== 'ALL') partnerDepts.add(d); });
                    tags.forEach(d => { if (d && d !== 'ALL' && d !== 'None') partnerDepts.add(d); });
                    partnerDepts.forEach(d => addDeptCount(d, isSolved));
                }
            } else {
                // =========================================================================
                // ADMIN MACRO PERSPECTIVE (Resort-wide Workload & Reporting)
                // =========================================================================
                if (deptFilterMode === 'origin') {
                    addDeptCount(issue.department, isSolved);
                } else if (deptFilterMode === 'tagged') {
                    safeArray(issue.taggedDepartments).forEach(d => addDeptCount(d, isSolved));
                } else if (deptFilterMode === 'all') {
                    const depts = new Set();
                    const rawOrigin = (issue.department || '').trim();
                    if (rawOrigin && !['emergency', 'undefined', 'unknown'].includes(rawOrigin.toLowerCase())) {
                        depts.add(rawOrigin);
                    }
                    safeArray(issue.assignedDepartments).forEach(d => { if (d && d !== 'ALL') depts.add(d); });
                    safeArray(issue.taggedDepartments).forEach(d => { if (d && d !== 'ALL' && d !== 'None') depts.add(d); });
                    depts.forEach(dept => addDeptCount(dept, isSolved));
                } else {
                    // Default: 'assigned'
                    const assigns = safeArray(issue.assignedDepartments);
                    if (assigns.length > 0) {
                        assigns.forEach(d => addDeptCount(d, isSolved));
                    } else {
                        addDeptCount(issue.department, isSolved);
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
                const solved = stat.solved || 0;
                const active = stat.active || 0;
                const solvedPct = total > 0 ? Math.round((solved / total) * 100) : 0;
                return { 
                    name: dept, 
                    shortName: shortName,
                    displayName: totalDepts > 6 ? shortName : dept,
                    Issues: total,
                    total: total,
                    solved: solved,
                    active: active,
                    solvedPct: solvedPct,
                };
            })
            .sort((a, b) => b.Issues - a.Issues);

        if (deptLimit === 'all') return sorted;
        return sorted.slice(0, Number(deptLimit));
    }, [timeFilteredIssues, deptLimit, deptFilterMode, isDeptUser, department]);

    const deptSummaryStats = useMemo(() => {
        let solved = 0;
        let active = 0;
        departmentData.forEach(d => {
            solved += (d.solved || 0);
            active += (d.active || 0);
        });
        return { solved, active, total: solved + active };
    }, [departmentData]);

    // Timeline Data -> Activity Log
    const activityLog = useMemo(() => {
        if (!timeFilteredIssues || timeFilteredIssues.length === 0) return [];
        
        let events = [];
        
        timeFilteredIssues.forEach(issue => {
            const rawTime = issue.reportedAt || (issue.reportedAtIso ? new Date(issue.reportedAtIso).getTime() : 0);
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
            } else if (issue.status === 'pending' && issue.pendingBy) {
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

            // 4. Fallback Active Claim (if current taker is not yet represented and not closed)
            if (issue.taker && !['solved', 'open'].includes(issue.status) && !recordedClaimPersons.has(issue.taker)) {
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
            if (issue.status === 'solved' && (issue.solvedAt || issue.solver)) {
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
        const typePriority = { create: 6, claim: 5, pending: 4, edit: 3, revert: 2, solve: 1 };
        events.sort((a, b) => {
            if (b.date !== a.date) return b.date - a.date;
            return (typePriority[a.type] || 9) - (typePriority[b.type] || 9);
        });

        const typeMap = {
            'create': 'open',
            'claim': 'progress',
            'pending': 'pending',
            'solve': 'solved',
            'revert': 'revert',
            'edit': 'edit'
        };
        
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

            // 1. Combinable Status & Priority Filters (matches current status of the issue)
            if (selectedStatusFilters.length > 0) {
                const isCriticalSelected = selectedStatusFilters.includes('critical');
                const selectedStatuses = selectedStatusFilters.filter(f => f !== 'critical');
                const currentStatus = ev.originalIssue?.status;
                const isCriticalIssue = ev.originalIssue?.priority === 'critical';

                let matchesStatus = true;
                if (selectedStatuses.length > 0 && isCriticalSelected) {
                    matchesStatus = selectedStatuses.includes(currentStatus) || isCriticalIssue;
                } else if (selectedStatuses.length > 0) {
                    matchesStatus = selectedStatuses.includes(currentStatus);
                } else if (isCriticalSelected) {
                    matchesStatus = isCriticalIssue;
                }

                if (!matchesStatus) return false;
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

            // 3. Combinable Category Filters
            if (selectedCategoryFilters.length > 0) {
                const issueCat = (ev.originalIssue?.category || 'other').toLowerCase().trim();
                const matchesCat = selectedCategoryFilters.some(selCat => {
                    return issueCat === selCat.toLowerCase().trim();
                });

                if (!matchesCat) return false;
            }

            return true;
        });

        return timelineLimit === 'all' ? filtered : filtered.slice(0, timelineLimit);
    }, [timeFilteredIssues, timelineLimit, searchQuery, selectedStatusFilters, selectedDepartmentFilters, deptFilterMode, selectedCategoryFilters]);

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

    return (
        <div className="min-h-screen bg-transparent font-sans text-foreground selection:bg-primary/20">
            <CampusFixHeader 
                mode="analytics" 
                query={searchQuery} 
                onQueryChange={setSearchQuery} 
            />

            <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 flex flex-col gap-8">
                
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

                        <Tooltip content={t('tooltip_export_pdf')} position="top">
                            <button
                                type="button"
                                onClick={() => setExportOpen(true)}
                                className="px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 bg-[#C9AA71] text-[#1C1B0E] hover:bg-[#D4B883] border border-[#C9AA71] shadow-sm hover:shadow-md active:scale-95 cursor-pointer font-extrabold"
                                title={t('export_pdf')}
                            >
                                <Download className="h-4 w-4" />
                                <span>{t('export_pdf')}</span>
                            </button>
                        </Tooltip>
                    </div>
                </div>

                {/* Charts Section */}
                <div ref={chartsContainerRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Category Chart */}
                    <div className="chart-card bg-surface p-6 rounded-2xl shadow-sm border border-border/50 flex flex-col items-center">
                        <div className="flex items-center justify-between w-full mb-2 flex-wrap gap-2">
                            <h2 className="text-lg font-bold text-foreground">{t('issues_by_category')}</h2>
                            {selectedCategoryFilters.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedCategoryFilters([])}
                                    className="text-xs font-semibold text-[#C9AA71] hover:underline cursor-pointer"
                                >
                                    ✕ {lang === 'id' ? 'Reset Kategori' : 'Reset Category'}
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground w-full mb-3">
                            {lang === 'id' ? 'Klik bagian lingkaran untuk memfilter aktivitas laporan menurut kategori' : 'Click pie slice to filter activity log by category'}
                        </p>
                        <div className="relative w-full h-[300px] flex items-center justify-center">
                            {categoryData.length > 0 ? (
                                chartsVisible && (
                                    <>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={categoryData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={65}
                                                    outerRadius={112}
                                                    paddingAngle={3}
                                                    dataKey="value"
                                                    labelLine={false}
                                                    label={<CustomCategoryPieLabel />}
                                                    isAnimationActive={true}
                                                    onClick={(entry) => handleCategoryPieClick(entry)}
                                                    cursor="pointer"
                                                >
                                                    {categoryData.map((entry, index) => {
                                                        const isSelected = selectedCategoryFilters.some(c => c.toLowerCase() === entry.id.toLowerCase());
                                                        return (
                                                            <Cell 
                                                                key={`cell-${index}`} 
                                                                fill={getCategoryColor(entry.id, index)}
                                                                stroke={isSelected ? '#F59E0B' : '#1C1B0E'}
                                                                strokeWidth={isSelected ? 3.5 : 1}
                                                                opacity={selectedCategoryFilters.length > 0 ? (isSelected ? 1 : 0.35) : 1}
                                                                style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                                                            />
                                                        );
                                                    })}
                                                </Pie>
                                                <RechartsTooltip 
                                                    contentStyle={{ 
                                                        backgroundColor: '#2A281E', 
                                                        borderColor: '#3B3929', 
                                                        borderRadius: '10px', 
                                                        color: '#FAFAFA',
                                                        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
                                                        padding: '8px 12px' 
                                                    }}
                                                    itemStyle={{ color: '#FAFAFA', fontWeight: 'bold' }}
                                                    labelStyle={{ color: '#C9AA71', fontWeight: 'bold' }}
                                                    formatter={(value, name) => [`${value} issue${value !== 1 ? 's' : ''}`, name]}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>

                                        {/* Center Hole Summary */}
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-3xl font-black text-foreground tracking-tight">
                                                {categoryData.reduce((acc, curr) => acc + curr.value, 0)}
                                            </span>
                                            <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mt-0.5">
                                                {t('total_issues')}
                                            </span>
                                        </div>
                                    </>
                                )
                            ) : (
                                <div className="flex h-full items-center justify-center text-muted-foreground">{t('no_data')}</div>
                            )}
                        </div>

                        {/* Category Filter Chips / Legend */}
                        {categoryData.length > 0 && (
                            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3 pt-3 border-t border-border/40 w-full text-xs">
                                {categoryData.map((cat, idx) => {
                                    const isSelected = selectedCategoryFilters.some(c => c.toLowerCase() === cat.id.toLowerCase());
                                    return (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => handleCategoryPieClick(cat)}
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                                                isSelected
                                                    ? 'bg-amber-500/25 text-amber-300 border-amber-400 shadow-sm ring-1 ring-amber-400/50'
                                                    : 'bg-[#2A281E]/60 text-muted-foreground border-transparent hover:border-[#3B3929] hover:text-foreground'
                                            }`}
                                        >
                                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getCategoryColor(cat.id, idx) }} />
                                            <span>{cat.name}</span>
                                            <span className="opacity-70 font-mono text-[10px]">({cat.value})</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Department Chart */}
                    <div className="chart-card bg-surface p-6 rounded-2xl shadow-sm border border-border/50 flex flex-col items-center">
                        {/* Context Summary Banner for Both Admin and Department Users */}
                        {perspectiveStats && (
                            <div className="w-full bg-[#1C1B0E]/90 border border-[#3B3929] rounded-xl p-3.5 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-sm">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-[#C9AA71]/15 text-[#C9AA71] border border-[#C9AA71]/30 font-bold shrink-0">
                                        {perspectiveStats.badgeIcon}
                                    </div>
                                    <div>
                                        <p className="font-bold text-foreground">
                                            {perspectiveStats.title}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {perspectiveStats.desc}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 font-mono text-[11px] flex-wrap self-stretch sm:self-auto justify-start sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setDeptFilterMode(perspectiveStats.stat1.mode)}
                                        className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                                            deptFilterMode === perspectiveStats.stat1.mode
                                                ? 'bg-blue-500/25 text-blue-300 border-blue-400 font-bold shadow-xs'
                                                : 'bg-blue-500/10 text-blue-300/80 border-blue-500/20 hover:bg-blue-500/20 hover:text-blue-200'
                                        }`}
                                        title={perspectiveStats.stat1.title}
                                    >
                                        <span>{perspectiveStats.stat1.icon}</span>
                                        <strong>{perspectiveStats.stat1.count}</strong>
                                        <span className="text-[10px] opacity-90">{perspectiveStats.stat1.label}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDeptFilterMode(perspectiveStats.stat2.mode)}
                                        className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                                            deptFilterMode === perspectiveStats.stat2.mode
                                                ? 'bg-amber-500/25 text-amber-300 border-amber-400 font-bold shadow-xs'
                                                : 'bg-amber-500/10 text-amber-300/80 border-amber-500/20 hover:bg-amber-500/20 hover:text-amber-200'
                                        }`}
                                        title={perspectiveStats.stat2.title}
                                    >
                                        <span>{perspectiveStats.stat2.icon}</span>
                                        <strong>{perspectiveStats.stat2.count}</strong>
                                        <span className="text-[10px] opacity-90">{perspectiveStats.stat2.label}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDeptFilterMode(perspectiveStats.stat3.mode)}
                                        className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                                            deptFilterMode === perspectiveStats.stat3.mode
                                                ? 'bg-pink-500/25 text-pink-300 border-pink-400 font-bold shadow-xs'
                                                : 'bg-pink-500/10 text-pink-300/80 border-pink-500/20 hover:bg-pink-500/20 hover:text-pink-200'
                                        }`}
                                        title={perspectiveStats.stat3.title}
                                    >
                                        <span>{perspectiveStats.stat3.icon}</span>
                                        <strong>{perspectiveStats.stat3.count}</strong>
                                        <span className="text-[10px] opacity-90">{perspectiveStats.stat3.label}</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between w-full mb-4 gap-2 flex-wrap">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-bold text-foreground">{t('issues_by_department')}</h2>
                                    {selectedDepartmentFilters.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDepartmentFilters([])}
                                            className="text-xs font-semibold text-[#C9AA71] hover:underline cursor-pointer"
                                        >
                                            ✕ {lang === 'id' ? 'Reset Dept' : 'Reset Dept'}
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {isDeptUser ? (
                                        <>
                                            {deptFilterMode === 'assigned' && (lang === 'id' ? `📥 Departemen asal yang meminta bantuan / menugaskan tiket kepada ${department}` : `📥 Origin departments requesting help from / assigned to ${department}`)}
                                            {deptFilterMode === 'origin' && (lang === 'id' ? `📤 Departemen tujuan yang ditugaskan untuk memperbaiki tiket dari ${department}` : `📤 Target departments assigned to fix issues reported by ${department}`)}
                                            {deptFilterMode === 'tagged' && (lang === 'id' ? `📢 Departemen terkait pada tiket di mana ${department} ditandai (CC)` : `📢 Partner departments on tickets where ${department} is tagged (CC)`)}
                                            {deptFilterMode === 'all' && (lang === 'id' ? `🌐 Seluruh departemen yang berinteraksi dengan ${department} (tugas masuk, keluar, dan tag)` : `🌐 All departments interacting with ${department} (incoming, outgoing, and tagged)`)}
                                        </>
                                    ) : (
                                        <>
                                            {deptFilterMode === 'assigned' && (lang === 'id' ? '🎯 Beban perbaikan: Jumlah tiket yang ditugaskan ke tiap departemen di resort' : '🎯 Repair workload: Total issues assigned to each department in the resort')}
                                            {deptFilterMode === 'origin' && (lang === 'id' ? '🏠 Volume pelaporan: Jumlah tiket yang dilaporkan oleh tiap departemen' : '🏠 Reporting volume: Total issues discovered and reported by each department')}
                                            {deptFilterMode === 'tagged' && (lang === 'id' ? '📢 Koordinasi: Departemen yang paling sering ditandai (CC)' : '📢 Coordination: Departments most frequently tagged (CC)')}
                                            {deptFilterMode === 'all' && (lang === 'id' ? '🌐 Total keterlibatan: Gabungan seluruh peran departemen di resort' : '🌐 Total involvement: Combined department activity across the resort')}
                                        </>
                                    )}
                                </p>
                            </div>
                            
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Mode Selector with Role-Adaptive Buttons */}
                                <div className="flex items-center rounded-lg bg-[#2A281E] p-0.5 border border-[#3B3929] text-xs">
                                    <Tooltip content={isDeptUser ? t('tooltip_incoming_dept') : t('tooltip_assigned_dept')} position="top">
                                        <button
                                            type="button"
                                            onClick={() => setDeptFilterMode('assigned')}
                                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                                                deptFilterMode === 'assigned'
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] font-bold shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            {isDeptUser ? `📥 ${t('dept_mode_incoming')}` : `🎯 ${t('dept_mode_assigned')}`}
                                        </button>
                                    </Tooltip>
                                    <Tooltip content={isDeptUser ? t('tooltip_outgoing_dept') : t('tooltip_origin_dept')} position="top">
                                        <button
                                            type="button"
                                            onClick={() => setDeptFilterMode('origin')}
                                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                                                deptFilterMode === 'origin'
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] font-bold shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            {isDeptUser ? `📤 ${t('dept_mode_outgoing')}` : `🏠 ${t('dept_mode_origin')}`}
                                        </button>
                                    </Tooltip>
                                    <Tooltip content={t('tooltip_tagged_dept')} position="top">
                                        <button
                                            type="button"
                                            onClick={() => setDeptFilterMode('tagged')}
                                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                                                deptFilterMode === 'tagged'
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] font-bold shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            📢 {t('dept_mode_tagged')}
                                        </button>
                                    </Tooltip>
                                    {!isDeptUser && (
                                        <Tooltip content={t('tooltip_all_related_dept')} position="top">
                                            <button
                                                type="button"
                                                onClick={() => setDeptFilterMode('all')}
                                                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                                                    deptFilterMode === 'all'
                                                        ? 'bg-[#C9AA71] text-[#1C1B0E] font-bold shadow-sm'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                🌐 {t('dept_mode_all')}
                                            </button>
                                        </Tooltip>
                                    )}
                                </div>

                                {/* Dual-Tone Status Legend */}
                                <div className="flex items-center gap-3 bg-[#2A281E] px-3 py-1 rounded-lg border border-[#3B3929] text-[11px]">
                                    <div className="flex items-center gap-1.5 font-semibold text-[#FAFAFA]" title={lang === 'id' ? 'Warna terang menunjukkan tiket yang sudah selesai' : 'Light tone indicates finished issues'}>
                                        <span className="w-3.5 h-2.5 rounded-[3px] bg-[#B0BEC5] border border-white/20 inline-block shadow-xs"></span>
                                        <span className="text-muted-foreground">{t('finished_status') || 'Finished'}:</span>
                                        <span className="font-bold text-emerald-400 font-mono">{deptSummaryStats.solved}</span>
                                    </div>
                                    <div className="h-3 w-px bg-[#3B3929]"></div>
                                    <div className="flex items-center gap-1.5 font-semibold text-[#FAFAFA]" title={lang === 'id' ? 'Warna gelap menunjukkan tiket yang belum selesai / aktif' : 'Dark tone indicates unresolved / active issues'}>
                                        <span className="w-3.5 h-2.5 rounded-[3px] bg-[#37474F] border border-black/40 inline-block shadow-xs"></span>
                                        <span className="text-muted-foreground">{t('still_being_done') || 'Still Being Done'}:</span>
                                        <span className="font-bold text-amber-400 font-mono">{deptSummaryStats.active}</span>
                                    </div>
                                </div>

                                {/* Department Amount Selector (5, 10, 15, 20, All) */}
                                <Tooltip content={t('tooltip_dept_limit')} position="top">
                                    <div className="flex items-center gap-1.5 text-xs">
                                        <select
                                            value={deptLimit}
                                            onChange={(e) => setDeptLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                            className="appearance-none px-2.5 py-1 text-xs font-bold rounded-lg border border-[#3B3929] bg-[#2A281E] text-[#C9AA71] cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
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

                        <div className="w-full h-[300px]">
                            {departmentData.length > 0 ? (
                                chartsVisible && (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart 
                                            data={departmentData} 
                                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                            barCategoryGap="22%"
                                            barGap={3}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3B3929" />
                                            <XAxis 
                                                dataKey="displayName" 
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{ fontSize: 11, fill: '#A19F8D', fontWeight: 600, cursor: 'pointer' }} 
                                                onClick={(e) => handleDepartmentBarClick({ name: e?.value })}
                                            />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A19F8D' }} />
                                            <RechartsTooltip 
                                                cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                                                wrapperStyle={{ pointerEvents: 'auto' }}
                                                content={({ active, payload }) => {
                                                    if (!active || !payload || !payload.length) return null;
                                                    const item = payload[0]?.payload;
                                                    if (!item) return null;
                                                    const lightColor = getDepartmentLightColor(item.name);
                                                    const darkColor = getDepartmentDarkColor(item.name);
                                                    const isSelected = selectedDepartmentFilters.some(d => d.toLowerCase() === item.name.toLowerCase());
                                                    return (
                                                        <div 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDepartmentBarClick({ name: item.name });
                                                            }}
                                                            className={`bg-[#2A281E] border ${isSelected ? 'border-[#C9AA71] ring-2 ring-[#C9AA71]/40' : 'border-[#3B3929]'} rounded-xl p-3.5 shadow-2xl text-xs space-y-2.5 min-w-[230px] cursor-pointer hover:border-[#C9AA71] transition-all select-none`}
                                                        >
                                                            <div className="flex items-center justify-between gap-2 border-b border-[#3B3929] pb-2">
                                                                <span className="font-bold text-[#C9AA71] text-sm">{item.name}</span>
                                                                <span className="text-[10px] text-muted-foreground font-mono bg-[#1C1B0E] px-1.5 py-0.5 rounded border border-[#3B3929]">
                                                                    #{item.shortName}
                                                                </span>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between text-foreground">
                                                                    <span className="text-muted-foreground">{lang === 'id' ? 'Total Masalah' : 'Total Issues'}:</span>
                                                                    <span className="font-bold font-mono text-sm">{item.total}</span>
                                                                </div>
                                                                <div 
                                                                    className="flex items-center justify-between font-semibold px-2 py-1 rounded-md border" 
                                                                    style={{ backgroundColor: `${lightColor}18`, borderColor: `${lightColor}45`, color: '#FAFAFA' }}
                                                                >
                                                                    <span className="flex items-center gap-1.5">
                                                                        <span className="w-2.5 h-2.5 rounded-xs inline-block shadow-sm" style={{ backgroundColor: lightColor }}></span>
                                                                        <span>{lang === 'id' ? 'Selesai (Finished)' : 'Finished / Solved'}:</span>
                                                                    </span>
                                                                    <span className="font-mono">{item.solved} <span className="text-[10px] opacity-75">({item.solvedPct}%)</span></span>
                                                                </div>
                                                                <div 
                                                                    className="flex items-center justify-between font-semibold px-2 py-1 rounded-md border" 
                                                                    style={{ backgroundColor: `${darkColor}25`, borderColor: `${darkColor}65`, color: '#FAFAFA' }}
                                                                >
                                                                    <span className="flex items-center gap-1.5">
                                                                        <span className="w-2.5 h-2.5 rounded-xs inline-block shadow-sm" style={{ backgroundColor: darkColor }}></span>
                                                                        <span>{lang === 'id' ? 'Sedang Dikerjakan' : 'Still Being Done'}:</span>
                                                                    </span>
                                                                    <span className="font-mono">{item.active} <span className="text-[10px] opacity-75">({item.total > 0 ? 100 - item.solvedPct : 0}%)</span></span>
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
                                            {/* Sub-bar 1: Finished / Solved (Light Tone) */}
                                            <Bar 
                                                dataKey="solved" 
                                                name={t('finished_status') || 'Finished'} 
                                                radius={[4, 4, 0, 0]}
                                                onClick={(data) => handleDepartmentBarClick(data)}
                                                cursor="pointer"
                                            >
                                                {departmentData.map((entry, index) => {
                                                    const isSelected = selectedDepartmentFilters.some(d => d.toLowerCase() === entry.name.toLowerCase());
                                                    const lightColor = getDepartmentLightColor(entry.name);
                                                    return (
                                                        <Cell 
                                                            key={`cell-solved-${index}`} 
                                                            fill={lightColor}
                                                            stroke={isSelected ? '#F59E0B' : 'transparent'}
                                                            strokeWidth={isSelected ? 1.5 : 0}
                                                            opacity={selectedDepartmentFilters.length > 0 ? (isSelected ? 1 : 0.35) : 1}
                                                        />
                                                    );
                                                })}
                                            </Bar>
                                            {/* Sub-bar 2: Still Being Done / Active (Dark Tone) */}
                                            <Bar 
                                                dataKey="active" 
                                                name={t('still_being_done') || 'Still Being Done'} 
                                                radius={[4, 4, 0, 0]}
                                                onClick={(data) => handleDepartmentBarClick(data)}
                                                cursor="pointer"
                                            >
                                                {departmentData.map((entry, index) => {
                                                    const isSelected = selectedDepartmentFilters.some(d => d.toLowerCase() === entry.name.toLowerCase());
                                                    const darkColor = getDepartmentDarkColor(entry.name);
                                                    return (
                                                        <Cell 
                                                            key={`cell-active-${index}`} 
                                                            fill={darkColor}
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
                                <span>{lang === 'id' ? 'Filter Dept & Kategori' : 'Dept & Category Filters'}</span>
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

                    {/* Mini 5-Card Status Filter Bar (Replacing old pill strip) */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 w-full">
                        {analyticsCards.map(({ key, status, label, value, Icon, accent, activeRing, activeAccent }, idx) => {
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
                                        idx === 0 ? 'col-span-2 sm:col-span-1' : ''
                                    } ${
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
                                            <p className="text-lg sm:text-xl font-bold leading-none text-foreground">{value}</p>
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

                    {/* Active Filters Bar (Category / Department / Search) */}
                    {(selectedCategoryFilters.length > 0 || selectedDepartmentFilters.length > 0 || selectedStatusFilters.length > 0 || searchQuery.trim()) && (
                        <div className="flex items-center gap-2 flex-wrap bg-[#1E1D16] p-2.5 rounded-xl border border-[#3B3929]/70 text-xs">
                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                <Tag className="w-3.5 h-3.5 text-[#C9AA71]" />
                                {lang === 'id' ? 'Filter Aktif:' : 'Active Filters:'}
                            </span>

                            {selectedCategoryFilters.map(cat => {
                                const catDef = DEFAULT_CATEGORIES.find(c => c.id.toLowerCase() === cat.toLowerCase());
                                const catLabel = catDef ? (t(catDef.id) || catDef.label) : (cat.toLowerCase() === 'emergency' ? (lang === 'id' ? 'DARURAT' : 'EMERGENCY') : cat);
                                return (
                                    <span key={cat} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                        <span>🏷️ {catLabel}</span>
                                        <button 
                                            type="button" 
                                            onClick={() => setSelectedCategoryFilters(prev => prev.filter(c => c !== cat))}
                                            className="hover:text-white cursor-pointer ml-0.5"
                                        >
                                            ✕
                                        </button>
                                    </span>
                                );
                            })}

                            {selectedDepartmentFilters.map(dept => {
                                let modePrefix = lang === 'id' ? '🎯 Ditugaskan' : '🎯 Assigned';
                                if (deptFilterMode === 'origin') {
                                    modePrefix = lang === 'id' ? '🏠 Asal' : '🏠 Origin';
                                } else if (deptFilterMode === 'tagged') {
                                    modePrefix = lang === 'id' ? '📢 Ditandai' : '📢 Tagged';
                                } else if (deptFilterMode === 'all') {
                                    modePrefix = lang === 'id' ? '🌐 Terkait' : '🌐 Related';
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

                            {selectedStatusFilters.map(st => {
                                const statusLabels = {
                                    open: t('needs_fixing') || (lang === 'id' ? 'Perlu Perbaikan' : 'Needs Fixing'),
                                    progress: t('in_progress') || (lang === 'id' ? 'Dalam Proses' : 'In Progress'),
                                    pending: t('pending') || (lang === 'id' ? 'Tertunda' : 'Pending'),
                                    solved: t('resolved') || (lang === 'id' ? 'Terselesaikan' : 'Resolved'),
                                    critical: t('critical') || (lang === 'id' ? 'Kritis' : 'Critical'),
                                };
                                const stLabel = statusLabels[st] || st;

                                return (
                                    <span key={st} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-green-500/20 text-green-300 border border-green-500/30">
                                        <span>✓ {stLabel}</span>
                                        <button 
                                            type="button" 
                                            onClick={() => setSelectedStatusFilters(prev => prev.filter(s => s !== st))}
                                            className="hover:text-white cursor-pointer ml-0.5"
                                        >
                                            ✕
                                        </button>
                                    </span>
                                );
                            })}

                            {searchQuery.trim() && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                    <span>🔍 "{searchQuery}"</span>
                                    <button 
                                        type="button" 
                                        onClick={() => setSearchQuery('')}
                                        className="hover:text-white cursor-pointer"
                                    >
                                        ✕
                                    </button>
                                </span>
                            )}

                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedCategoryFilters([]);
                                    setSelectedDepartmentFilters([]);
                                    setSelectedStatusFilters([]);
                                    setSearchQuery('');
                                }}
                                className="text-[11px] font-bold text-[#C9AA71] hover:underline ml-auto cursor-pointer"
                            >
                                ✕ {lang === 'id' ? 'Reset Semua Filter' : 'Reset All Filters'}
                            </button>
                        </div>
                    )}

                    {/* Collapsible Dropdown Drawer for Detailed Department & Category Filters */}
                    {showDetailedFilters && (
                        <div className="flex flex-col gap-3 p-3.5 sm:p-4.5 rounded-2xl bg-[#14130B]/95 border border-[#3B3929] shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
                            {/* Drawer Header */}
                            <div className="flex items-center justify-between pb-2 border-b border-[#3B3929]/50 text-xs">
                                <span className="font-bold text-[#E3D1AA] flex items-center gap-2">
                                    <Filter className="w-3.5 h-3.5 text-[#C9AA71]" />
                                    {lang === 'id' ? 'Pilihan Filter Lanjutan (Departemen & Kategori)' : 'Advanced Filters (Department & Category)'}
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
                                            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                                                deptFilterMode === 'assigned'
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-bold'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            {isDeptUser ? `📥 ${t('dept_mode_incoming')}` : `🎯 ${t('dept_mode_assigned')}`}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDeptFilterMode('origin')}
                                            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                                                deptFilterMode === 'origin'
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-bold'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            {isDeptUser ? `📤 ${t('dept_mode_outgoing')}` : `🏠 ${t('dept_mode_origin')}`}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDeptFilterMode('tagged')}
                                            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                                                deptFilterMode === 'tagged'
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-bold'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            📢 {t('dept_mode_tagged')}
                                        </button>
                                        {!isDeptUser && (
                                            <button
                                                type="button"
                                                onClick={() => setDeptFilterMode('all')}
                                                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                                                    deptFilterMode === 'all'
                                                        ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-bold'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                🌐 {t('dept_mode_all')}
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

                            {/* Combinable Category Filter Pills for Timeline Activity */}
                            <div className="flex items-center gap-1.5 text-xs flex-wrap bg-[#1E1D16] p-2 rounded-xl border border-[#3B3929]/80 shadow-inner">
                                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-2 shrink-0 flex items-center gap-1.5">
                                    <Tag className="h-3.5 w-3.5 text-[#C9AA71]" />
                                    {t('category')}:
                                </span>

                                <button
                                    type="button"
                                    onClick={() => setSelectedCategoryFilters([])}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer border ${
                                        selectedCategoryFilters.length === 0
                                            ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] font-extrabold shadow-sm'
                                            : 'bg-[#2A281E]/60 text-muted-foreground border-transparent hover:border-[#3B3929] hover:text-foreground opacity-70 hover:opacity-100'
                                    }`}
                                >
                                    {t('all_categories')}
                                </button>

                                {DEFAULT_CATEGORIES.map(cat => {
                                    const isSelected = selectedCategoryFilters.includes(cat.id);
                                    const catColor = CATEGORY_COLORS[cat.id] || '#6B7280';
                                    return (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedCategoryFilters(prev => 
                                                    prev.includes(cat.id) ? prev.filter(c => c !== cat.id) : [...prev, cat.id]
                                                );
                                            }}
                                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer border ${
                                                isSelected
                                                    ? 'bg-primary/25 text-[#C9AA71] border-[#C9AA71]/80 shadow-sm font-bold ring-1 ring-[#C9AA71]/40'
                                                    : 'bg-[#2A281E]/60 text-muted-foreground border-transparent hover:border-[#3B3929] hover:text-foreground opacity-60 hover:opacity-100'
                                            }`}
                                        >
                                            <span 
                                                className="h-2 w-2 rounded-full shrink-0" 
                                                style={{ backgroundColor: catColor }}
                                            />
                                            <span>{t(cat.id) || cat.label}</span>
                                        </button>
                                    );
                                })}

                                {selectedCategoryFilters.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedCategoryFilters([])}
                                        className="text-[11px] font-semibold text-[#C9AA71] hover:text-[#FAFAFA] px-2 py-1 rounded hover:bg-[#2A281E] transition-colors ml-1 cursor-pointer"
                                    >
                                        ✕ {t('reset_category')}
                                    </button>
                                )}
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
                                    
                                    let actionBadge = null;
                                    let dotColor = 'bg-blue-500';
                                    
                                    switch(ev.type) {
                                        case 'create':
                                            dotColor = 'bg-blue-500';
                                            actionBadge = (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                                                    {lang === 'id' ? 'Laporan Dibuat' : 'Report Created'}
                                                </span>
                                            );
                                            break;
                                        case 'claim':
                                            dotColor = 'bg-amber-500';
                                            actionBadge = (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                                    {lang === 'id' ? 'Diambil (Claim)' : 'Claimed'}
                                                </span>
                                            );
                                            break;
                                        case 'pending':
                                            dotColor = 'bg-orange-500';
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
                                            <div className={`absolute -left-[21px] top-4 h-3.5 w-3.5 rounded-full border-2 border-surface shadow-sm z-10 ${dotColor}`} />
                                            
                                            <div 
                                                onClick={() => setSelectedActivityIssue(ev.originalIssue)}
                                                className="group flex flex-col gap-2 p-4 rounded-xl border border-border/80 bg-[#1E1D16] shadow-sm hover:border-primary/60 hover:bg-[#25241B] cursor-pointer transition-all duration-200"
                                            >
                                                {/* Header Row: Title + Department + ID + Click Indicator */}
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                                        <span className="text-base font-bold text-foreground group-hover:text-primary transition-colors truncate max-w-md">
                                                            {ev.title}
                                                        </span>
                                                        {ev.originalIssue?.department && (
                                                            <span className="text-xs px-2 py-0.5 rounded bg-muted/40 text-muted-foreground border border-border/40 font-medium">
                                                                {ev.originalIssue.department}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-mono font-bold text-[#C9AA71] bg-[#2A281E] px-2.5 py-1 rounded-md border border-[#3B3929] shadow-inner">
                                                            {ev.issueId}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleOpenIssueCard(ev.originalIssue);
                                                            }}
                                                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#2A281E] hover:bg-[#3B3929] text-[#C9AA71] hover:text-[#FAFAFA] border border-[#3B3929] text-xs font-semibold transition-all shadow-sm cursor-pointer z-10"
                                                            title={lang === 'id' ? 'Buka Kartu Isu (Foto & Detail)' : 'Open Issue Card'}
                                                        >
                                                            <Eye className="w-3.5 h-3.5" />
                                                            <span>Detail</span>
                                                        </button>
                                                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                                                    </div>
                                                </div>

                                                {/* Detail Row: Action + Person + Date/Time */}
                                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/30 text-xs text-muted-foreground">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {actionBadge}
                                                        <span className="text-muted-foreground">{t('by_reporter')}</span>
                                                        <span className="font-bold text-foreground bg-surface px-2 py-0.5 rounded border border-border/50">
                                                            {ev.person}
                                                        </span>
                                                    </div>

                                                    <div className="font-medium text-muted-foreground flex items-center gap-1.5 ml-auto">
                                                        <span>📅 {dateStr}</span>
                                                        <span>•</span>
                                                        <span>⏰ {timeStr}</span>
                                                    </div>
                                                </div>

                                                {/* Optional Reason / Details */}
                                                {ev.reason && (
                                                    <div className="text-xs text-muted-foreground bg-black/20 p-2.5 rounded-lg border border-border/40 italic">
                                                        💬 <span className="font-semibold text-foreground/80">{lang === 'id' ? 'Alasan/Catatan: ' : 'Reason/Notes: '}</span>
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
            <ExportPdfModal open={exportOpen} onOpenChange={setExportOpen} />
            <ActivityDetailModal 
                issue={selectedActivityIssue} 
                onClose={() => setSelectedActivityIssue(null)} 
                onOpenCardModal={(issue) => setCardModalTarget(issue)}
            />

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
        </div>
    );
}
