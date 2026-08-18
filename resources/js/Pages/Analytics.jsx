import { Head } from '@inertiajs/react';
import { useMemo, useState, useEffect, useRef } from 'react';
import { 
    Loader2, Wrench, Sparkles, Laptop, Anchor, ShieldAlert, Utensils, Building, Hammer, Zap,
    Droplets, Building2, Bug, User, HelpCircle, Download
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

export default function Analytics() {
    return (
        <IssuesProvider>
            <Head title="Analytics — Telunas Resort" />
            <AnalyticsInner />
        </IssuesProvider>
    );
}

const COLORS = [
    '#f59e0b', '#3b82f6', '#eab308', '#57534e', '#15803d', 
    '#7c3aed', '#0891b2', '#dc2626', '#db2777', '#94a3b8'
];

const CATEGORY_COLORS = {
    'broken': '#EF4444',         // Red — Broken Equipment
    'plumbing': '#3B82F6',       // Blue — Plumbing
    'electrical': '#F59E0B',     // Amber/Gold — Electrical
    'structural': '#D97706',     // Warm Bronze/Orange — Structural / Building
    'pest-hygiene': '#10B981',   // Emerald Green — Pest & Hygiene
    'it-technology': '#8B5CF6',  // Violet — IT & Technology
    'marine-outdoor': '#06B6D4', // Ocean Cyan — Marine & Outdoor
    'safety-hazard': '#DC2626',  // Deep Red — Safety Hazard
    'guest-issues': '#EC4899',   // Rose Pink — Guest Issues
    'other': '#6B7280',          // Slate Gray — Other
};

const CATEGORY_ICONS = {
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

    const catId = payload?.id || 'other';
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
    const { issues, loading } = useIssues();
    const { t } = useLanguage();
    const [timelineLimit, setTimelineLimit] = useState(20);
    const [searchQuery, setSearchQuery] = useState('');
    const [exportOpen, setExportOpen] = useState(false);
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
        if (!issues || issues.length === 0) return [];
        const counts = {};
        issues.forEach(issue => {
            const cat = issue.category || 'other';
            counts[cat] = (counts[cat] || 0) + 1;
        });

        return Object.keys(counts)
            .map(catKey => {
                const def = DEFAULT_CATEGORIES.find(c => c.id === catKey);
                return { id: catKey, name: def ? def.label : catKey, value: counts[catKey] };
            })
            .sort((a, b) => b.value - a.value);
    }, [issues]);

    const departmentData = useMemo(() => {
        if (!issues || issues.length === 0) return [];
        const counts = {};
        issues.forEach(issue => {
            const dept = issue.department || 'Unknown';
            counts[dept] = (counts[dept] || 0) + 1;
        });

        return Object.keys(counts)
            .map(dept => ({ name: dept, Issues: counts[dept] }))
            .sort((a, b) => b.Issues - a.Issues);
    }, [issues]);

    // Timeline Data
    const timelineData = useMemo(() => {
        if (!issues || issues.length === 0) return [];
        
        // Sort by most recent first
        const sorted = [...issues].sort((a, b) => {
            const aDate = a.reportedAt || (a.reportedAtIso ? new Date(a.reportedAtIso).getTime() : 0);
            const bDate = b.reportedAt || (b.reportedAtIso ? new Date(b.reportedAtIso).getTime() : 0);
            return bDate - aDate;
        });

        const filtered = sorted.filter(issue => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (
                (issue.title && issue.title.toLowerCase().includes(q)) ||
                (issue.description && issue.description.toLowerCase().includes(q)) ||
                (issue.location && issue.location.toLowerCase().includes(q)) ||
                (issue.reporter && issue.reporter.toLowerCase().includes(q)) ||
                (issue.department && issue.department.toLowerCase().includes(q)) ||
                (issue.category && issue.category.toLowerCase().includes(q)) ||
                (issue.status && issue.status.toLowerCase().includes(q)) ||
                (issue.priority && issue.priority.toLowerCase().includes(q))
            );
        });

        return timelineLimit === 'all' ? filtered : filtered.slice(0, timelineLimit);
    }, [issues, timelineLimit, searchQuery]);

    // Scroll-Linked Animation for Timeline Items
    useEffect(() => {
        if (loading || timelineData.length === 0) return;

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
    }, [timelineData.length, loading]);

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
                onExport={() => setExportOpen(true)}
            />

            <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 flex flex-col gap-8">
                
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
                        <h2 className="text-lg font-bold mb-4 w-full text-left text-foreground">{t('issues_by_department')}</h2>
                        <div className="w-full h-[300px]">
                            {departmentData.length > 0 ? (
                                chartsVisible && (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={departmentData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3B3929" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A19F8D' }} />
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
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-8">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                            <h2 className="text-lg font-bold text-foreground">{t('recent_activity')}</h2>
                            
                            {/* Color Legend */}
                            <div className="flex items-center gap-3 text-xs flex-wrap bg-muted/20 px-3 py-1.5 rounded-lg border border-border/40">
                                <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" /> {t('open')}
                                </span>
                                <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" /> {t('in_progress')}
                                </span>
                                <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                                    <span className="h-2.5 w-2.5 rounded-full bg-orange-500 shrink-0" /> {t('pending')}
                                </span>
                                <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                                    <span className="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" /> {t('solved')}
                                </span>
                                <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                                    <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shrink-0" /> {t('critical')}
                                </span>
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

                    <div className="relative pl-4 border-l-2 border-border ml-2" ref={timelineRef}>
                        {timelineData.length > 0 ? (
                            timelineData.map((issue, idx) => {
                                const rawTime = issue.reportedAt || issue.reportedAtIso;
                                let dateFormatted = t('date_na');
                                if (rawTime) {
                                    const dateObj = new Date(rawTime);
                                    if (!isNaN(dateObj.getTime())) {
                                        const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                                        dateFormatted = `${dateStr} at ${timeStr}`;
                                    } else if (issue.reportedAtIso) {
                                        dateFormatted = issue.reportedAtIso;
                                    }
                                }

                                // Assign color based on status
                                let dotColor = 'bg-blue-500';
                                if (issue.status === 'solved') dotColor = 'bg-green-500';
                                if (issue.status === 'progress') dotColor = 'bg-amber-500';
                                if (issue.status === 'pending') dotColor = 'bg-orange-500';
                                if (issue.priority === 'critical' && issue.status !== 'solved') dotColor = 'bg-red-500 animate-pulse';

                                // Determine background image:
                                // - If pending, use the newest pending image
                                // - Otherwise use the original report image
                                let bgImage = null;
                                if (issue.status === 'pending' && issue.pendingTimeline?.length > 0) {
                                    const lastPending = issue.pendingTimeline[issue.pendingTimeline.length - 1];
                                    bgImage = lastPending?.image || issue.pendingImageUrl || issue.imageUrl;
                                } else if (issue.status === 'solved' && issue.proofImageUrl) {
                                    bgImage = issue.proofImageUrl;
                                } else {
                                    bgImage = issue.imageUrl || '/barrier-placeholder.svg';
                                }

                                const hasImage = !!bgImage;

                                return (
                                    <div key={issue.id || idx} className="timeline-item mb-4 relative">
                                        <div className={`absolute -left-[21px] top-3 h-3.5 w-3.5 rounded-full border-2 border-surface shadow-sm z-10 ${dotColor}`} />
                                        
                                        {/* Card with optional image background */}
                                        <div
                                            className="relative rounded-xl overflow-hidden border border-border/60 min-h-[90px]"
                                            style={{
                                                backgroundImage: `url('${bgImage}')`,
                                                backgroundSize: 'cover',
                                                backgroundPosition: 'center',
                                            }}
                                        >
                                            {/* Vignette overlay */}
                                            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/65 to-black/40" />

                                            {/* Content */}
                                            <div className="relative z-10 p-4 min-w-0 w-full">
                                                <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 mb-2 min-w-0">
                                                    <h3 className="font-bold text-base leading-tight text-white drop-shadow-sm break-words min-w-0">
                                                        {issue.title}
                                                    </h3>
                                                    <span className="text-xs font-medium text-white/70 whitespace-nowrap">
                                                        {dateFormatted}
                                                    </span>
                                                </div>

                                                {issue.description && (
                                                    <p className="text-xs text-white/75 mb-2 line-clamp-2 leading-relaxed break-words min-w-0">
                                                        {issue.description}
                                                    </p>
                                                )}

                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/15 border border-white/20 text-white backdrop-blur-sm">
                                                        {issue.department || 'No Dept'}
                                                    </span>
                                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border backdrop-blur-sm ${
                                                        issue.status === 'solved'   ? 'bg-green-500/30 border-green-400/40 text-green-200' :
                                                        issue.status === 'progress' ? 'bg-amber-500/30 border-amber-400/40 text-amber-200' :
                                                        issue.status === 'pending'  ? 'bg-orange-500/30 border-orange-400/40 text-orange-200' :
                                                        'bg-blue-500/30 border-blue-400/40 text-blue-200'
                                                    }`}>
                                                        {issue.status === 'progress' ? t('in_progress') : issue.status === 'solved' ? t('solved') : issue.status === 'pending' ? t('pending') : t('open')}
                                                    </span>
                                                    {issue.reporter && (
                                                        <span className="text-xs text-white/60">
                                                            {t('by_reporter')} {issue.reporter}
                                                        </span>
                                                    )}
                                                    {hasImage && (
                                                        <span className="text-xs text-white/50 italic ml-auto">
                                                            {issue.status === 'pending' ? t('photo_pending') : t('photo_report')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-muted-foreground italic">{t('no_recent_activity')}</div>
                        )}
                    </div>
                </div>
            </main>
            <ScrollToTop />
            <ExportPdfModal open={exportOpen} onOpenChange={setExportOpen} />
        </div>
    );
}
