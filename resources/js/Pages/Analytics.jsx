import axios from 'axios';
import { Head } from '@inertiajs/react';
import { useMemo, useState, useEffect, useRef } from 'react';
import { 
    Loader2, Wrench, Sparkles, Laptop, Anchor, ShieldAlert, Utensils, Building, Hammer, Zap,
    Droplets, Building2, Bug, Tag, User, HelpCircle, Download, AlertTriangle, Layers, Database, Clock, CheckSquare, Check, Eye, ChevronRight
} from 'lucide-react';
import anime from 'animejs';
import {
    PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

import { IssuesProvider, useIssues, DEFAULT_CATEGORIES } from '@/context/IssuesContext';
import { useLanguage } from '@/context/LanguageContext';
import { CampusFixHeader } from '@/Components/CampusFix/CampusFixHeader';
import { ScrollToTop } from '@/Components/CampusFix/ScrollToTop';
import { ExportPdfModal } from '@/Components/CampusFix/ExportPdfModal';
import { ActivityDetailModal } from '@/Components/CampusFix/ActivityDetailModal';
import { TakeJobModal } from '@/Components/CampusFix/TakeJobModal';
import { ResolveIssueSheet } from '@/Components/CampusFix/ResolveIssueSheet';
import { SolvedDetailModal } from '@/Components/CampusFix/SolvedDetailModal';

export default function Analytics() {
    return (
        <IssuesProvider>
            <Head title="Analytics — Telunas Resort" />
            <AnalyticsInner />
        </IssuesProvider>
    );
}

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
    'finance': 'FIN'
};

const getDeptAbbreviation = (deptName) => {
    if (!deptName) return '';
    const key = deptName.toLowerCase().trim();
    if (DEPT_ABBREVIATIONS[key]) return DEPT_ABBREVIATIONS[key];
    if (deptName.length > 5) return deptName.slice(0, 4).toUpperCase();
    return deptName.toUpperCase();
};

const ALL_DEPARTMENTS = [
    'Engineer', 'Tekong', 'Pest Control', 'Security', 'Fasilitas', 
    'HK', 'F&B', 'Service', 'Bar', 'GR', 'Spa', 'TiRek', 'OE', 
    'IT', 'Procurement', 'Sales/Marketing', 'Reservasi', 'Finance'
];

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

const DEPARTMENT_COLORS = {
    'Engineering': '#EF4444',       // Coral Red
    'Maintenance': '#F97316',       // Vibrant Orange
    'Housekeeping': '#10B981',       // Emerald Green
    'IT': '#3B82F6',                // Electric Blue
    'IT & Technology': '#3B82F6',
    'Marine': '#06B6D4',            // Ocean Cyan
    'Marine & Outdoor': '#06B6D4',
    'Safety': '#8B5CF6',            // Purple
    'F&B': '#F59E0B',               // Amber Gold
    'Food & Beverage': '#F59E0B',
    'Front Desk': '#EC4899',        // Rose Pink
};

const getDepartmentColor = (deptName, index) => {
    if (DEPARTMENT_COLORS[deptName]) {
        return DEPARTMENT_COLORS[deptName];
    }
    const fallbacks = ['#14B8A6', '#F59E0B', '#6366F1', '#EC4899', '#84CC16', '#A855F7'];
    return fallbacks[index % fallbacks.length];
};

const DEPARTMENT_ICONS = {
    'Engineering': Hammer,
    'Maintenance': Wrench,
    'Housekeeping': Sparkles,
    'IT': Laptop,
    'IT & Technology': Laptop,
    'Marine': Anchor,
    'Marine & Outdoor': Anchor,
    'Safety': ShieldAlert,
    'F&B': Utensils,
    'Food & Beverage': Utensils,
    'Front Desk': Building,
};

const CustomDepartmentBar = (props) => {
    const { x, y, width, height, payload, index } = props;
    if (!width || !height || height <= 0) return null;

    const deptName = payload?.name || '';
    const IconComponent = DEPARTMENT_ICONS[deptName] || Wrench;
    const barColor = getDepartmentColor(deptName, index);

    const iconSize = Math.min(Math.max(width * 0.45, 16), 30);
    const centerX = x + width / 2;
    const centerY = height > iconSize + 8 ? y + Math.min(height / 2, 35) : y + height / 2;

    return (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                rx={6}
                ry={6}
                fill={barColor}
            />
            {height > 14 && (
                <g 
                    transform={`translate(${centerX}, ${centerY}) rotate(-30)`}
                    style={{ pointerEvents: 'none' }}
                >
                    <g transform={`translate(${-iconSize / 2}, ${-iconSize / 2})`}>
                        <IconComponent 
                            size={iconSize} 
                            color="#FFFFFF" 
                            opacity={0.35} 
                            strokeWidth={2.2} 
                        />
                    </g>
                </g>
            )}
        </g>
    );
};

function AnalyticsInner() {
    const { issues, loading: contextLoading, availableSheets, currentSheet } = useIssues();
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

    // Combined issues from all selected sheets (with deduplication)
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
        return all;
    }, [selectedSheets, sheetDataMap, currentSheet, issues]);

    const isFetchingAnySheet = Object.values(fetchingSheets).some(Boolean);
    const loading = contextLoading && combinedIssues.length === 0;

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
    const [selectedDepartmentFilters, setSelectedDepartmentFilters] = useState([]);
    const [deptFilterMode, setDeptFilterMode] = useState('both'); // 'both' | 'origin' | 'tagged'
    const [selectedCategoryFilters, setSelectedCategoryFilters] = useState([]);
    const timelineRef = useRef(null);
    const chartsContainerRef = useRef(null);
    const recentActivityRef = useRef(null);
    const [chartsVisible, setChartsVisible] = useState(true);
    const prevTimelineHash = useRef('');

    const handleSearchChange = (newQuery) => {
        setSearchQuery(newQuery);
        if (newQuery.trim() !== '') {
            recentActivityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        timeFilteredIssues.forEach(issue => {
            const rawDept = (issue.department || '').trim();
            const lowerDept = rawDept.toLowerCase();
            // Exclude Emergency, undefined, unknown, and empty from department breakdown
            if (!rawDept || lowerDept === 'emergency' || lowerDept === 'undefined' || lowerDept === 'unknown') {
                return;
            }
            counts[rawDept] = (counts[rawDept] || 0) + 1;
        });

        const totalDepts = Object.keys(counts).length;
        const sorted = Object.keys(counts)
            .map(dept => {
                const shortName = getDeptAbbreviation(dept);
                return { 
                    name: dept, 
                    shortName: shortName,
                    // If more than 6 departments are displayed, use abbreviation on XAxis
                    displayName: totalDepts > 6 ? shortName : dept,
                    Issues: counts[dept] 
                };
            })
            .sort((a, b) => b.Issues - a.Issues);

        if (deptLimit === 'all') return sorted;
        return sorted.slice(0, Number(deptLimit));
    }, [timeFilteredIssues, deptLimit]);

    // Timeline Data
        // Timeline Data -> Activity Log
    const activityLog = useMemo(() => {
        if (!timeFilteredIssues || timeFilteredIssues.length === 0) return [];
        
        let events = [];
        
        timeFilteredIssues.forEach(issue => {
            const rawTime = issue.reportedAt || (issue.reportedAtIso ? new Date(issue.reportedAtIso).getTime() : 0);
            
            // 1. Created
            if (rawTime) {
                events.push({
                    id: `${issue.id}-created`,
                    issueId: issue.id,
                    title: issue.title,
                    type: 'create',
                    date: rawTime,
                    person: issue.reporter || 'Anonymous',
                    originalIssue: issue
                });
            }
            
            // 2. Claimed (progress)
            if (issue.taker && issue.takenAt) {
                events.push({
                    id: `${issue.id}-claimed`,
                    issueId: issue.id,
                    title: issue.title,
                    type: 'claim',
                    date: issue.takenAt,
                    person: issue.taker,
                    originalIssue: issue
                });
            }
            
            // 3. Pending Timeline
            if (issue.pendingTimeline && issue.pendingTimeline.length > 0) {
                issue.pendingTimeline.forEach((pt, idx) => {
                    let pd = Date.parse(`${new Date().getFullYear()} ${pt.date}`);
                    if (isNaN(pd)) pd = rawTime + idx * 1000;

                    events.push({
                        id: `${issue.id}-pending-${idx}`,
                        issueId: issue.id,
                        title: issue.title,
                        type: 'pending',
                        date: pd,
                        person: pt.by || issue.pendingBy || 'Unknown',
                        reason: pt.reason,
                        originalIssue: issue
                    });
                });
            } else if (issue.status === 'pending' && issue.pendingBy) {
                 events.push({
                    id: `${issue.id}-pending-fb`,
                    issueId: issue.id,
                    title: issue.title,
                    type: 'pending',
                    date: rawTime + 1000, 
                    person: issue.pendingBy || 'Unknown',
                    reason: issue.pendingReason,
                    originalIssue: issue
                 });
            }
            
            // 4. Solved
            if (issue.status === 'solved' && issue.solvedAt) {
                const sDate = new Date(issue.solvedAt).getTime();
                events.push({
                    id: `${issue.id}-solved`,
                    issueId: issue.id,
                    title: issue.title,
                    type: 'solve',
                    date: isNaN(sDate) ? rawTime + 2000 : sDate,
                    person: issue.solver || 'Unknown',
                    originalIssue: issue
                });
            }
        });
        
        events.sort((a, b) => b.date - a.date);

        const typeMap = {
            'create': 'open',
            'claim': 'progress',
            'pending': 'pending',
            'solve': 'solved'
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

            // 1. Combinable Status & Priority Filters
            if (selectedStatusFilters.length > 0) {
                const isCriticalSelected = selectedStatusFilters.includes('critical');
                const selectedTypes = selectedStatusFilters.filter(f => f !== 'critical');
                const evType = typeMap[ev.type];
                const isCriticalIssue = ev.originalIssue?.priority === 'critical';

                let matchesStatus = true;
                if (selectedTypes.length > 0 && isCriticalSelected) {
                    matchesStatus = selectedTypes.includes(evType) || isCriticalIssue;
                } else if (selectedTypes.length > 0) {
                    matchesStatus = selectedTypes.includes(evType);
                } else if (isCriticalSelected) {
                    matchesStatus = isCriticalIssue;
                }

                if (!matchesStatus) return false;
            }

            // 2. Combinable Department Filters with Mode (both | origin | tagged)
            if (selectedDepartmentFilters.length > 0) {
                const issueDept = (ev.originalIssue?.department || '').toLowerCase().trim();
                let tagged = [];
                if (Array.isArray(ev.originalIssue?.taggedDepartments)) {
                    tagged = ev.originalIssue.taggedDepartments.map(d => String(d).toLowerCase().trim());
                } else if (typeof ev.originalIssue?.taggedDepartments === 'string') {
                    tagged = ev.originalIssue.taggedDepartments.toLowerCase().split(',').map(s => s.trim());
                }

                const matchesDept = selectedDepartmentFilters.some(selDept => {
                    const s = selDept.toLowerCase().trim();
                    const isOrigin = (issueDept === s);
                    const isTagged = tagged.includes(s);

                    if (deptFilterMode === 'origin') {
                        return isOrigin;
                    } else if (deptFilterMode === 'tagged') {
                        return isTagged;
                    } else {
                        // 'both'
                        return isOrigin || isTagged;
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
                onQueryChange={handleSearchChange} 
            />

            <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 flex flex-col gap-8">
                
                {/* Multi-Sheet Selection Bar for Consolidated Analytics */}
                <div className="bg-surface/90 backdrop-blur-md p-5 rounded-2xl shadow-sm border border-border/60 flex flex-col gap-4.5 transition-all">
                    {/* Row 1: Sheet Selection & Export Action */}
                    <div className="flex flex-col gap-3 pb-3.5 border-b border-border/40">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
                                    <Layers className="h-5 w-5 text-[#C9AA71]" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                                        {t('select_sheets')}
                                        {isFetchingAnySheet && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        {t('combine_sheets_desc')}
                                    </p>
                                </div>
                            </div>

                            {/* Right Actions: Summary Pill Badge + In-Page Export PDF Button */}
                            <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto flex-wrap">
                                <div className="flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-full bg-[#1C1B0E]/60 border border-[#3B3929] text-[#C9AA71]">
                                    <Database className="h-3.5 w-3.5" />
                                    <span>
                                        {selectedSheets.length === (availableSheets?.length || 1)
                                            ? `${t('all_sheets')} (${timeFilteredIssues.length} / ${combinedIssues.length} ${t('total_issues')})`
                                            : `${selectedSheets.length} ${t('sheets_label')} (${timeFilteredIssues.length} / ${combinedIssues.length} ${t('total_issues')})`
                                        }
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setExportOpen(true)}
                                    className="px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 bg-[#1C1B0E] text-[#E3D1AA] border border-[#3B3929] hover:bg-[#2A281E] hover:border-[#C9AA71]/40 shadow-sm hover:shadow-md active:scale-95 cursor-pointer"
                                    title={t('export_pdf')}
                                >
                                    <Download className="h-4 w-4 text-[#C9AA71]" />
                                    <span>{t('export_pdf')}</span>
                                </button>
                            </div>
                        </div>

                        {/* Sheet Pills / Checkboxes */}
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            {availableSheets && availableSheets.length > 1 && (
                                <button
                                    type="button"
                                    onClick={toggleAllSheets}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 border ${
                                        selectedSheets.length === availableSheets.length
                                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                            : 'bg-surface hover:bg-muted text-muted-foreground border-border/80'
                                    }`}
                                >
                                    <CheckSquare className="h-3.5 w-3.5" />
                                    {t('all_sheets')}
                                </button>
                            )}

                            {(availableSheets && availableSheets.length > 0 ? availableSheets : [currentSheet || '2026']).map(sheetName => {
                                const isSelected = selectedSheets.includes(sheetName);
                                const count = sheetDataMap[sheetName]?.length;
                                const isFetching = fetchingSheets[sheetName];

                                return (
                                    <button
                                        key={sheetName}
                                        type="button"
                                        onClick={() => toggleSheet(sheetName)}
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 border ${
                                            isSelected
                                                ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] shadow-md font-extrabold ring-1 ring-[#C9AA71]/40'
                                                : 'bg-surface hover:bg-muted text-muted-foreground border-border/80 hover:text-foreground'
                                        }`}
                                    >
                                        <span className="flex items-center gap-1.5">
                                            {isSelected ? <Check className="h-3.5 w-3.5" /> : <div className="h-3.5 w-3.5 rounded-sm border border-muted-foreground/40" />}
                                            {sheetName}
                                        </span>
                                        {isFetching ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : count !== undefined ? (
                                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                                                isSelected ? 'bg-[#1C1B0E]/20 text-[#1C1B0E]' : 'bg-muted text-muted-foreground'
                                            }`}>
                                                {count}
                                            </span>
                                        ) : null}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Row 2: Time Range Filter (Days, 1, 2, 3, 4 Weeks, Months, Year) */}
                    <div className="flex flex-col gap-2.5">
                        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                            <Clock className="h-4 w-4 text-[#C9AA71]" />
                            <span>{t('time_range')}</span>
                            {timeRange !== 'all' && (
                                <span className="text-[11px] font-normal text-muted-foreground">
                                    • {t('showing_filtered_range')}: <strong className="text-[#C9AA71]">{t(TIME_RANGES.find(r => r.id === timeRange)?.labelKey) || timeRange}</strong> ({timeFilteredIssues.length} {t('items')})
                                </span>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            {TIME_RANGES.map(range => {
                                const isActive = timeRange === range.id;
                                return (
                                    <button
                                        key={range.id}
                                        type="button"
                                        onClick={() => setTimeRange(range.id)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 border cursor-pointer ${
                                            isActive
                                                ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] font-extrabold shadow-sm ring-1 ring-[#C9AA71]/40'
                                                : 'bg-surface/80 hover:bg-muted text-muted-foreground border-border/60 hover:text-foreground'
                                        }`}
                                    >
                                        {t(range.labelKey) || range.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Charts Section */}
                <div ref={chartsContainerRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Category Chart */}
                    <div className="chart-card bg-surface p-6 rounded-2xl shadow-sm border border-border/50 flex flex-col items-center">
                        <h2 className="text-lg font-bold mb-4 w-full text-left text-foreground">{t('issues_by_category')}</h2>
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
                                                >
                                                    {categoryData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={getCategoryColor(entry.id, index)} />
                                                    ))}
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
                    </div>

                    {/* Department Chart */}
                    <div className="chart-card bg-surface p-6 rounded-2xl shadow-sm border border-border/50 flex flex-col items-center">
                        <div className="flex items-center justify-between w-full mb-4 gap-2 flex-wrap">
                            <h2 className="text-lg font-bold text-foreground">{t('issues_by_department')}</h2>
                            
                            {/* Department Amount Selector (5, 10, 15, 20, All) */}
                            <div className="flex items-center gap-1.5 text-xs">
                                <span className="text-muted-foreground font-medium">{t('show')}:</span>
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
                        </div>

                        <div className="w-full h-[300px]">
                            {departmentData.length > 0 ? (
                                chartsVisible && (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={departmentData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3B3929" />
                                            <XAxis 
                                                dataKey="displayName" 
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{ fontSize: 11, fill: '#A19F8D', fontWeight: 600 }} 
                                            />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A19F8D' }} />
                                            <RechartsTooltip 
                                                cursor={false}
                                                contentStyle={{ 
                                                    backgroundColor: '#2A281E', 
                                                    borderColor: '#3B3929', 
                                                    borderRadius: '8px', 
                                                    color: '#FAFAFA',
                                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)' 
                                                }}
                                                itemStyle={{ color: '#FAFAFA' }}
                                                labelStyle={{ color: '#C9AA71', fontWeight: 'bold' }}
                                                labelFormatter={(label, payload) => payload?.[0]?.payload?.name || label}
                                                formatter={(value, name, item) => [`${value} issue${value !== 1 ? 's' : ''}`, item?.payload?.name || name]}
                                            />
                                            <Bar 
                                                dataKey="Issues" 
                                                shape={<CustomDepartmentBar />} 
                                                isAnimationActive={true} 
                                            />
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
                <div ref={recentActivityRef} className="bg-surface p-6 rounded-2xl shadow-sm border border-border/50">
                    <div className="flex flex-col gap-4 mb-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                            <h2 className="text-lg font-bold text-foreground">{t('recent_activity')}</h2>
                            
                            {/* Interactive Combinable Status Filters */}
                            <div className="flex items-center gap-1.5 text-xs flex-wrap bg-[#1E1D16] p-1.5 rounded-xl border border-[#3B3929]/80 shadow-inner">
                                {/* Open Filter */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedStatusFilters(prev => 
                                            prev.includes('open') ? prev.filter(k => k !== 'open') : [...prev, 'open']
                                        );
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 cursor-pointer border ${
                                        selectedStatusFilters.includes('open')
                                            ? 'bg-blue-500/25 text-blue-300 border-blue-400/90 shadow-[0_0_12px_rgba(59,130,246,0.45)]'
                                            : 'bg-[#2A281E]/60 text-muted-foreground border-transparent hover:border-[#3B3929] hover:text-foreground opacity-60 hover:opacity-100'
                                    }`}
                                >
                                    <span className={`h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0 transition-transform ${selectedStatusFilters.includes('open') ? 'scale-125 shadow-[0_0_8px_rgba(59,130,246,1)]' : ''}`} />
                                    <span>{t('open')}</span>
                                </button>

                                {/* In Progress Filter */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedStatusFilters(prev => 
                                            prev.includes('progress') ? prev.filter(k => k !== 'progress') : [...prev, 'progress']
                                        );
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 cursor-pointer border ${
                                        selectedStatusFilters.includes('progress')
                                            ? 'bg-amber-500/25 text-amber-300 border-amber-400/90 shadow-[0_0_12px_rgba(245,158,11,0.45)]'
                                            : 'bg-[#2A281E]/60 text-muted-foreground border-transparent hover:border-[#3B3929] hover:text-foreground opacity-60 hover:opacity-100'
                                    }`}
                                >
                                    <span className={`h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0 transition-transform ${selectedStatusFilters.includes('progress') ? 'scale-125 shadow-[0_0_8px_rgba(245,158,11,1)]' : ''}`} />
                                    <span>{t('in_progress')}</span>
                                </button>

                                {/* Pending Filter */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedStatusFilters(prev => 
                                            prev.includes('pending') ? prev.filter(k => k !== 'pending') : [...prev, 'pending']
                                        );
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 cursor-pointer border ${
                                        selectedStatusFilters.includes('pending')
                                            ? 'bg-orange-500/25 text-orange-300 border-orange-400/90 shadow-[0_0_12px_rgba(249,115,22,0.45)]'
                                            : 'bg-[#2A281E]/60 text-muted-foreground border-transparent hover:border-[#3B3929] hover:text-foreground opacity-60 hover:opacity-100'
                                    }`}
                                >
                                    <span className={`h-2.5 w-2.5 rounded-full bg-orange-500 shrink-0 transition-transform ${selectedStatusFilters.includes('pending') ? 'scale-125 shadow-[0_0_8px_rgba(249,115,22,1)]' : ''}`} />
                                    <span>{t('pending')}</span>
                                </button>

                                {/* Solved Filter */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedStatusFilters(prev => 
                                            prev.includes('solved') ? prev.filter(k => k !== 'solved') : [...prev, 'solved']
                                        );
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 cursor-pointer border ${
                                        selectedStatusFilters.includes('solved')
                                            ? 'bg-green-500/25 text-green-300 border-green-400/90 shadow-[0_0_12px_rgba(34,197,94,0.45)]'
                                            : 'bg-[#2A281E]/60 text-muted-foreground border-transparent hover:border-[#3B3929] hover:text-foreground opacity-60 hover:opacity-100'
                                    }`}
                                >
                                    <span className={`h-2.5 w-2.5 rounded-full bg-green-500 shrink-0 transition-transform ${selectedStatusFilters.includes('solved') ? 'scale-125 shadow-[0_0_8px_rgba(34,197,94,1)]' : ''}`} />
                                    <span>{t('solved')}</span>
                                </button>

                                {/* Critical Filter */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedStatusFilters(prev => 
                                            prev.includes('critical') ? prev.filter(k => k !== 'critical') : [...prev, 'critical']
                                        );
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 cursor-pointer border ${
                                        selectedStatusFilters.includes('critical')
                                            ? 'bg-red-500/25 text-red-300 border-red-400/90 shadow-[0_0_14px_rgba(239,68,68,0.6)] animate-pulse'
                                            : 'bg-[#2A281E]/60 text-muted-foreground border-transparent hover:border-[#3B3929] hover:text-foreground opacity-60 hover:opacity-100'
                                    }`}
                                >
                                    <span className={`h-2.5 w-2.5 rounded-full bg-red-500 shrink-0 ${selectedStatusFilters.includes('critical') ? 'scale-125 shadow-[0_0_8px_rgba(239,68,68,1)]' : ''}`} />
                                    <span>{t('critical')}</span>
                                </button>

                                {/* Clear Filter Button if active */}
                                {selectedStatusFilters.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedStatusFilters([])}
                                        className="text-[11px] font-semibold text-[#C9AA71] hover:text-[#FAFAFA] px-2 py-1 rounded hover:bg-[#2A281E] transition-colors ml-1 cursor-pointer"
                                    >
                                        ✕ {lang === 'id' ? 'Reset' : 'Clear'}
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm text-muted-foreground font-medium">{t('show')}:</span>
                            <select
                                value={timelineLimit}
                                onChange={(e) => setTimelineLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                className="appearance-none px-3 py-1.5 text-sm font-semibold rounded-md border border-[#3B3929] bg-[#2A281E] text-[#FAFAFA] cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary h-9 min-w-[90px] text-center shadow-sm"
                            >
                                <option value={10} className="bg-[#2A281E] text-[#FAFAFA]">10 {t('items')}</option>
                                <option value={20} className="bg-[#2A281E] text-[#FAFAFA]">20 {t('items')}</option>
                                <option value={50} className="bg-[#2A281E] text-[#FAFAFA]">50 {t('items')}</option>
                                <option value="all" className="bg-[#2A281E] text-[#FAFAFA]">{t('all_items')}</option>
                            </select>
                        </div>
                    </div>

                    {/* Combinable Department Filter Pills for Timeline Activity */}
                    <div className="flex flex-col gap-2.5 bg-[#1E1D16] p-2.5 rounded-xl border border-[#3B3929]/80 shadow-inner">
                        <div className="flex items-center justify-between gap-2 flex-wrap pb-1 border-b border-[#3B3929]/40">
                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1 flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5 text-[#C9AA71]" />
                                {t('department')}:
                            </span>

                            {/* Origin / Tagged / Both Mode Selector */}
                            <div className="flex items-center rounded-lg bg-[#2A281E] p-0.5 border border-[#3B3929] text-xs">
                                <button
                                    type="button"
                                    onClick={() => setDeptFilterMode('both')}
                                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                                        deptFilterMode === 'both'
                                            ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-bold'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {t('dept_mode_both')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeptFilterMode('origin')}
                                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                                        deptFilterMode === 'origin'
                                            ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-bold'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {t('dept_mode_origin')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeptFilterMode('tagged')}
                                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                                        deptFilterMode === 'tagged'
                                            ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-bold'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {t('dept_mode_tagged')}
                                </button>
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
                                return (
                                    <button
                                        key={dept}
                                        type="button"
                                        onClick={() => {
                                            setSelectedDepartmentFilters(prev => 
                                                prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
                                            );
                                        }}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer border ${
                                            isSelected
                                                ? 'bg-primary/25 text-[#C9AA71] border-[#C9AA71]/80 shadow-sm font-bold ring-1 ring-[#C9AA71]/40'
                                                : 'bg-[#2A281E]/60 text-muted-foreground border-transparent hover:border-[#3B3929] hover:text-foreground opacity-60 hover:opacity-100'
                                        }`}
                                    >
                                        {dept}
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
