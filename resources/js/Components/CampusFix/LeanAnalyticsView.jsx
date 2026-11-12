import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    ComposedChart,
    Line,
    ReferenceLine,
    LabelList,
    XAxis,
    YAxis,
    Tooltip as RechartsTooltip,
    Legend,
    PieChart,
    Pie,
    Cell,
    CartesianGrid,
} from 'recharts';
import {
    Sparkles,
    AlertTriangle,
    ShieldCheck,
    Wrench,
    CheckCircle2,
    RefreshCw,
    TrendingUp,
    MapPin,
    Package,
    Flame,
    Info,
    Layers,
    Search,
    Building2,
    Compass,
    Map,
    BarChart2,
    Users,
    User,
    Check,
    Briefcase,
    Calendar,
    Clock,
    Filter,
    FileSpreadsheet,
    ExternalLink,
    ZoomIn,
    ZoomOut,
    Eye,
    EyeOff,
    SlidersHorizontal,
    Table,
    LayoutGrid,
    RotateCcw,
    ChevronDown,
    Activity,
    CheckSquare,
    Square,
    FileText,
    Download,
    Ticket,
    X,
    Maximize2,
    ArrowUpRight,
    CalendarClock,
} from 'lucide-react';
import { getEtaBadgeInfo, formatEtaDisplayWib } from '@/Components/CampusFix/EtaPickerField';
import { TPI_MASTERPLAN_ZONES, TBR_MASTERPLAN_ZONES, resolveIssueResortAndZone } from '@/constants/locations';
import { useLanguage } from '@/context/LanguageContext';

const DEPARTMENT_COLORS = {
    'Engineer': '#38bdf8',          // Sky
    'Housekeeping': '#ec4899',      // Pink
    'Fasilitas': '#fbbf24',         // Amber
    'Kitchen': '#f97316',           // Orange
    'IT': '#818cf8',                // Indigo
    'Guest Relations': '#34d399',   // Emerald
    'HR': '#a78bfa',                // Purple
    'Procurement': '#14b8a6',       // Teal
    'Finance': '#06b6d4',           // Cyan
    'Reservasi': '#e879f9',         // Fuchsia
    'Operasional Eksekutif': '#f43f5e', // Rose
    'Umum': '#94a3b8',              // Slate
};

const CATEGORY_COLORS = DEPARTMENT_COLORS;

const PROGRESS_STATUS_COLORS = {
    open: '#f43f5e',         // Rose / Merah (Belum Dikerjakan)
    in_progress: '#0284c7',  // Sky / Biru (Sedang Dikerjakan)
    pending: '#f59e0b',      // Amber / Kuning (Tertunda / Butuh Sparepart)
    resolved: '#10b981',     // Emerald / Hijau (Semua Selesai)
    none: '#94a3b8',         // Slate / Abu-abu (Tidak Ada Laporan)
};

// Custom Tooltip for Pareto: shows count, individual share, and cumulative share
const CustomParetoTooltip = ({ active, payload }) => {
    const { lang } = useLanguage();
    const isEn = lang === 'en';
    if (!active || !payload || !payload.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;

    return (
        <div className="bg-slate-900/95 border border-slate-700/80 rounded-lg p-3 shadow-xl text-xs backdrop-blur-sm min-w-[210px] z-50">
            <p className="font-bold text-white mb-2 pb-1.5 border-b border-slate-800 flex items-center justify-between">
                <span>{data.fullName || data.name}</span>
                {data.isVital ? (
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        Top 80%
                    </span>
                ) : (
                    <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                        {isEn ? 'Secondary' : 'Sekunder'}
                    </span>
                )}
            </p>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
                        {isEn ? 'Case Count:' : 'Jumlah Kasus:'}
                    </span>
                    <span className="font-bold text-white text-sm">{data.count}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">{isEn ? 'Share of Total:' : 'Porsi dari Total:'}</span>
                    <span className="font-semibold text-emerald-300">{data.percentage}%</span>
                </div>
                <div className="flex items-center justify-between text-slate-300 pt-1 border-t border-slate-800">
                    <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                        <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                        {isEn ? 'Cumulative Share:' : 'Akumulasi Kumulatif:'}
                    </span>
                    <span className="font-bold text-amber-300">{data.cumulativePercentage}%</span>
                </div>
            </div>
        </div>
    );
};

// Custom Tooltip for Hotspot: filters out urgency levels with 0 count
const CustomHotspotTooltip = ({ active, payload, label }) => {
    const { lang } = useLanguage();
    const isEn = lang === 'en';
    if (!active || !payload || !payload.length) return null;
    const activeItems = payload.filter((item) => Number(item.value) > 0);
    const total = payload[0]?.payload?.total || 0;

    return (
        <div className="bg-slate-900/95 border border-slate-700/80 rounded-lg p-2.5 shadow-xl text-xs min-w-[150px] backdrop-blur-sm">
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800">
                <span className="font-bold text-white">{label}</span>
                <span className="text-[10px] text-slate-400">Total: {total}</span>
            </div>
            {activeItems.length > 0 ? (
                <div className="space-y-1">
                    {activeItems.map((item) => (
                        <div key={item.dataKey} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-slate-300">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color || item.fill }} />
                                {item.name || item.dataKey}
                            </span>
                            <span className="font-bold text-white">{item.value}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-[11px] text-slate-400">{isEn ? 'No incidents' : 'Tidak ada insiden'}</p>
            )}
            <div className="pt-1.5 mt-1.5 border-t border-slate-800/80 text-[10px] text-sky-400 font-medium">
                {isEn ? '💡 Click bar to view ticket details' : '💡 Klik balok untuk lihat detail tiket'}
            </div>
        </div>
    );
};

// Custom Tooltip for Department Workload
const CustomDeptTooltip = ({ active, payload, label }) => {
    const { lang } = useLanguage();
    const isEn = lang === 'en';
    if (!active || !payload || !payload.length) return null;
    const total = payload.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    return (
        <div className="bg-slate-900 border border-slate-700/80 rounded-lg p-2.5 shadow-xl text-xs min-w-[170px]">
            <p className="font-bold text-white mb-1.5 pb-1 border-b border-slate-800">{label || (isEn ? 'Department' : 'Departemen')}</p>
            <div className="space-y-1">
                {payload.map((item) => (
                    <div key={item.dataKey} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-slate-300">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                            {item.name}
                        </span>
                        <span className="font-bold text-white">{item.value}</span>
                    </div>
                ))}
            </div>
            <div className="pt-1.5 mt-1.5 border-t border-slate-800 flex justify-between text-slate-400 font-semibold">
                <span>{isEn ? 'Total Workload:' : 'Total Beban:'}</span>
                <span className="text-white font-bold">{total}</span>
            </div>
        </div>
    );
};

// Custom Tooltip for Category Urgency Matrix
const CustomUrgencyTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const total = payload.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    return (
        <div className="bg-slate-900/95 border border-slate-700/80 rounded-lg p-2.5 shadow-xl text-xs min-w-[170px] backdrop-blur-sm z-50">
            <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-slate-800 font-bold text-white">
                <span>{label}</span>
                <span className="text-[10px] text-slate-400">Total: {total}</span>
            </div>
            <div className="space-y-1">
                {payload.map((item) => (
                    <div key={item.dataKey} className="flex items-center justify-between text-slate-300 gap-3">
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color || item.fill }} />
                            {item.name}:
                        </span>
                        <span className="font-bold text-white">{item.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Custom Tooltip for MTTR / Speed Analysis
const CustomMttrTooltip = ({ active, payload }) => {
    const { lang } = useLanguage();
    const isEn = lang === 'en';
    if (!active || !payload || !payload.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;
    return (
        <div className="bg-slate-900/95 border border-slate-700/80 rounded-lg p-2.5 shadow-xl text-xs backdrop-blur-sm z-50 min-w-[210px]">
            <p className="font-bold text-white mb-1 pb-1 border-b border-slate-800 flex items-center justify-between">
                <span>{data.department}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                    data.statusType === 'fast'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : data.statusType === 'pending_delay'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : data.statusType === 'normal'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}>
                    {data.speedStatus || (isEn ? 'Standard' : 'Standar')}
                </span>
            </p>
            <div className="space-y-1.5 text-slate-300">
                <div className="flex items-center justify-between gap-4">
                    <span>{isEn ? 'Avg. Resolution Time:' : 'Rata-rata Durasi Selesai:'}</span>
                    <span className="font-bold text-sky-300">
                        {data.avgHours} {isEn ? 'Hours' : 'Jam'}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-4 text-slate-400 text-[10px]">
                    <span>{isEn ? 'Tickets Resolved:' : 'Tiket Diselesaikan:'}</span>
                    <span className="font-semibold text-white">{data.solvedCount}</span>
                </div>
                <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-800 text-[10px]">
                    <span className="text-amber-400">{isEn ? 'Pending / Sparepart Cases:' : 'Kasus Pending / Sparepart:'}</span>
                    <span className="font-bold text-amber-300">
                        {data.pendingCount || 0} {isEn ? 'Tickets' : 'Tiket'}
                    </span>
                </div>
            </div>
        </div>
    );
};

// Reusable mouse drag-to-pan helper without blocking vertical page wheel scroll
function useDragToPan(containerRef, enabled = true) {
    const [isDragging, setIsDragging] = useState(false);
    const dragStateRef = useRef({
        active: false,
        startX: 0,
        startY: 0,
        scrollLeft: 0,
        scrollTop: 0,
        hasMoved: false,
    });
    const suppressClickRef = useRef(false);
    const suppressTimerRef = useRef(null);
    const cleanupListenersRef = useRef(null);

    const clearSuppressTimer = useCallback(() => {
        if (suppressTimerRef.current) {
            clearTimeout(suppressTimerRef.current);
            suppressTimerRef.current = null;
        }
    }, []);

    const stopDragging = useCallback(() => {
        if (cleanupListenersRef.current) {
            cleanupListenersRef.current();
            cleanupListenersRef.current = null;
        }
        if (dragStateRef.current.active) {
            if (dragStateRef.current.hasMoved) {
                suppressClickRef.current = true;
                clearSuppressTimer();
                suppressTimerRef.current = setTimeout(() => {
                    suppressClickRef.current = false;
                    suppressTimerRef.current = null;
                }, 50);
            }
            dragStateRef.current.active = false;
            dragStateRef.current.hasMoved = false;
            setIsDragging(false);
        }
    }, [clearSuppressTimer]);

    useEffect(() => {
        if (!enabled) {
            stopDragging();
        }
    }, [enabled, stopDragging]);

    useEffect(() => {
        return () => {
            clearSuppressTimer();
            if (cleanupListenersRef.current) {
                cleanupListenersRef.current();
                cleanupListenersRef.current = null;
            }
        };
    }, [clearSuppressTimer]);

    const handleMouseDown = useCallback((e) => {
        if (!enabled || e.button !== 0) return;
        const container = containerRef.current;
        if (!container) return;

        const canScrollX = container.scrollWidth > container.clientWidth + 1;
        const canScrollY = container.scrollHeight > container.clientHeight + 1;
        if (!canScrollX && !canScrollY) return;

        clearSuppressTimer();
        suppressClickRef.current = false;

        dragStateRef.current = {
            active: true,
            startX: e.clientX,
            startY: e.clientY,
            scrollLeft: container.scrollLeft,
            scrollTop: container.scrollTop,
            hasMoved: false,
        };

        const handleMouseMove = (moveEvent) => {
            const state = dragStateRef.current;
            if (!state.active || !containerRef.current) return;

            const dx = moveEvent.clientX - state.startX;
            const dy = moveEvent.clientY - state.startY;

            if (!state.hasMoved && Math.hypot(dx, dy) > 5) {
                state.hasMoved = true;
                setIsDragging(true);
            }

            if (state.hasMoved) {
                if (canScrollX) {
                    containerRef.current.scrollLeft = state.scrollLeft - dx;
                }
                if (canScrollY) {
                    containerRef.current.scrollTop = state.scrollTop - dy;
                }
            }
        };

        const handleMouseUp = () => {
            stopDragging();
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        cleanupListenersRef.current = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [containerRef, enabled, stopDragging, clearSuppressTimer]);

    const handleClickCapture = useCallback((e) => {
        if (suppressClickRef.current) {
            e.stopPropagation();
            e.preventDefault();
            suppressClickRef.current = false;
            clearSuppressTimer();
        }
    }, [clearSuppressTimer]);

    return {
        isDragging,
        dragHandlers: enabled
            ? {
                  onMouseDown: handleMouseDown,
                  onClickCapture: handleClickCapture,
              }
            : {},
    };
}

// Reusable adaptive pin marker for TPI & TBR masterplan maps:
// Compact on mobile (<640px) when unzoomed (<=1x inline) and full-size on zoom >1x, fullscreen, or desktop (>=640px).
function ResortZonePin({
    zone,
    isSelected,
    isHovered,
    isCompactMobile,
    isDark,
    selectedRingClass,
    fallbackLabel,
    onSelectZone,
    onHoverStart,
    onHoverEnd,
}) {
    const { lang } = useLanguage();
    const isEn = lang === 'en';
    const count = zone.count || 0;
    const status = zone.dominantStatus || 'none';
    const color = PROGRESS_STATUS_COLORS[status] || PROGRESS_STATUS_COLORS.none;

    // Clamping koordinat aman agar tidak terpotong separuh di tepi kanvas
    const safeX = Math.max(3.5, Math.min(96.5, zone.x));
    const safeY = Math.max(4.5, Math.min(95.5, zone.y));

    return (
        <div
            onClick={() => onSelectZone && onSelectZone(zone)}
            onMouseEnter={() => onHoverStart(zone.id)}
            onMouseLeave={onHoverEnd}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-150 ${
                isCompactMobile ? 'p-0.5 sm:p-0' : ''
            } ${
                isSelected ? 'z-40 scale-125' : isHovered ? 'z-30 scale-[1.15]' : count > 0 ? 'z-20' : 'z-10'
            }`}
            style={{ left: `${safeX}%`, top: `${safeY}%` }}
        >
            <div className="relative">
                {/* Micro ping ring for active issues (ringan dan tidak menutupi pulau) */}
                {count > 0 && !isSelected && (
                    <span
                        className={`absolute rounded-full animate-ping opacity-60 pointer-events-none ${
                            isCompactMobile ? '-inset-0.5 sm:-inset-1' : '-inset-1'
                        }`}
                        style={{ backgroundColor: color }}
                    />
                )}

                {/* Adaptive Pin Marker (~13px compact on mobile 1x Fit, 20px standard on zoom/fullscreen/desktop) */}
                <div
                    className={`relative flex items-center justify-center rounded-full transition-all select-none ${
                        isCompactMobile ? 'w-[13px] h-[13px] sm:w-5 sm:h-5' : 'w-5 h-5'
                    } ${
                        isSelected
                            ? `${selectedRingClass} bg-white text-slate-950 font-black shadow-lg`
                            : count > 0
                            ? 'text-white font-extrabold ring-1 ring-white/90 shadow-sm'
                            : zone.total > 0
                            ? isDark
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 shadow-sm hover:bg-emerald-900'
                                : 'bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-sm hover:bg-emerald-100'
                            : isDark
                            ? 'bg-slate-900/90 text-slate-200 border border-slate-700/80 hover:bg-slate-800 shadow-sm'
                            : 'bg-white/95 text-slate-800 border border-slate-300 shadow-sm hover:bg-slate-100'
                    }`}
                    style={{
                        backgroundColor: isSelected ? undefined : count > 0 ? color : undefined,
                    }}
                >
                    {/* Number */}
                    <span
                        className={`font-black leading-none ${
                            isCompactMobile
                                ? 'text-[7px] tracking-tighter sm:text-[10px] sm:tracking-normal'
                                : 'text-[9px] sm:text-[10px]'
                        }`}
                    >
                        {zone.num}
                    </span>

                    {/* Micro Notification Badge for issue count (Top-Right) */}
                    {count > 0 && (
                        <span
                            className={`absolute rounded-full bg-slate-950 text-white border border-white font-black leading-none flex items-center justify-center shadow-sm ${
                                isCompactMobile
                                    ? '-top-1 -right-1 min-w-[9px] h-[9px] px-[2px] text-[5.5px] sm:-top-1.5 sm:-right-1.5 sm:min-w-[13px] sm:h-[13px] sm:px-0.5 sm:text-[7.5px]'
                                    : '-top-1.5 -right-1.5 min-w-[13px] h-[13px] px-0.5 text-[7.5px]'
                            }`}
                        >
                            {count}
                        </span>
                    )}
                </div>
            </div>

            {/* Hover / Selected Tooltip Card */}
            {(isHovered || isSelected) && (
                <div className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-2.5 px-3 py-2 rounded-xl border text-[11px] whitespace-nowrap z-50 pointer-events-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 ${
                    isDark
                        ? 'bg-slate-900/95 border-slate-700 text-white shadow-2xl'
                        : 'bg-white/98 border-slate-200 text-slate-900 shadow-xl'
                }`}>
                    <div className="flex items-center gap-1.5 font-bold">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className={isDark ? 'text-white' : 'text-slate-900'}>
                            #{zone.num} {zone.name}
                        </span>
                    </div>
                    <div className="text-[10px] flex items-center justify-between gap-3 pt-1">
                        <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                            {zone.enName || fallbackLabel}
                        </span>
                        <span className="font-semibold" style={{ color }}>
                            {count > 0 ? (
                                `${count} ${isEn ? 'Active Issues' : 'Isu Aktif'} (${[
                                    zone.openCount > 0 ? `${zone.openCount} Open` : null,
                                    zone.progressCount > 0 ? `${zone.progressCount} ${isEn ? 'In Progress' : 'Progress'}` : null,
                                    zone.pendingCount > 0 ? `${zone.pendingCount} Pending` : null,
                                ].filter(Boolean).join(', ')})`
                            ) : zone.total > 0 ? (
                                isEn ? `All Resolved (${zone.total} Tickets)` : `Semua Selesai (${zone.total} Tiket)`
                            ) : (
                                isEn ? 'No Reports' : 'Tidak Ada Laporan'
                            )}
                        </span>
                    </div>
                    <div className={`absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 ${
                        isDark ? 'border-t-slate-900' : 'border-t-white'
                    }`} />
                </div>
            )}
        </div>
    );
}

// --- Denah Arsitektural Masterplan TPI (Telunas Private Island) ---
function TpiResortMap({ zones = [], onSelectZone, selectedZoneId, theme = 'dark', spotlightTarget = null }) {
    const { lang } = useLanguage();
    const isEn = lang === 'en';
    const isDark = theme === 'dark';
    const [zoom, setZoom] = useState(1);
    const [filterMode, setFilterMode] = useState('all'); // 'all' (22 markers) | 'active' (issues only)
    const [hoveredZone, setHoveredZone] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [activeSpotlight, setActiveSpotlight] = useState(null);
    const [isSpotlightFading, setIsSpotlightFading] = useState(false);
    const scrollContainerRef = useRef(null);
    const modalScrollRef = useRef(null);
    const inlineDrag = useDragToPan(scrollContainerRef, zoom > 1);
    const modalDrag = useDragToPan(modalScrollRef, isFullscreen);

    // Auto-centering and cinematic spotlight effect when a location is triggered from issue modal
    useEffect(() => {
        if (!spotlightTarget?.zoneId) return;
        const target = zones.find(z => z.id === spotlightTarget.zoneId);
        if (!target) return;

        setActiveSpotlight(target);
        setIsSpotlightFading(false);

        // Auto-scroll the map container to center the target zone smoothly
        const scrollTimer = setTimeout(() => {
            if (scrollContainerRef.current) {
                const container = scrollContainerRef.current;
                const targetX = (target.x / 100) * container.scrollWidth - container.clientWidth / 2;
                const targetY = (target.y / 100) * container.scrollHeight - container.clientHeight / 2;
                container.scrollTo({
                    left: Math.max(0, targetX),
                    top: Math.max(0, targetY),
                    behavior: 'smooth',
                });
                container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 120);

        // Initiate smooth fade-out at 2.5s
        const fadeTimer = setTimeout(() => {
            setIsSpotlightFading(true);
        }, 2500);

        // Clear spotlight state at 3.5s
        const clearTimer = setTimeout(() => {
            setActiveSpotlight(null);
            setIsSpotlightFading(false);
        }, 3500);

        return () => {
            clearTimeout(scrollTimer);
            clearTimeout(fadeTimer);
            clearTimeout(clearTimer);
        };
    }, [spotlightTarget?.timestamp, spotlightTarget?.zoneId, zones]);

    const handleZoomIn = () => setZoom((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 3));
    const handleZoomOut = () => setZoom((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 0.75));
    const handleSetZoomPreset = (val) => {
        setZoom(val);
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = 0;
            scrollContainerRef.current.scrollTop = 0;
        }
    };

    const displayedZones = filterMode === 'active' ? zones.filter(z => (z.count || 0) > 0) : zones;

    const renderMapCanvas = (isModal = false) => {
        const effectiveZoom = isModal ? Math.max(1.25, zoom) : zoom;
        const isFit = !isModal && effectiveZoom <= 1;
        const isCompactMobile = !isModal && effectiveZoom <= 1;

        return (
            <div
                className="relative select-none transition-all duration-150 p-1 sm:p-2.5"
                style={{
                    width: isFit ? '100%' : `${Math.round(effectiveZoom * 100)}%`,
                    minWidth: isModal ? '950px' : isFit ? '100%' : `${Math.round(effectiveZoom * 100)}%`,
                    maxWidth: isFit ? '100%' : undefined,
                }}
            >
                {/* High-Resolution Masterplan Drawing Frame with High-Contrast Filter */}
                <div className="relative rounded-xl overflow-hidden border border-slate-300/80 shadow-md bg-white w-full">
                    <img
                        src="/images/maps/tpi_masterplan_v3.png?v=1"
                        alt={isEn ? 'Telunas Private Island (TPI) Masterplan' : 'Denah Masterplan Telunas Private Island (TPI)'}
                        draggable={false}
                        className="w-full h-auto block select-none pointer-events-none filter contrast-[1.08] brightness-[0.98]"
                        style={{ imageRendering: '-webkit-optimize-contrast' }}
                        loading="eager"
                    />

                    {/* Cinematic Spotlight Overlay with Radial Cutout & Beacon Waves */}
                    {activeSpotlight && (
                        <div
                            className={`absolute inset-0 pointer-events-none z-30 transition-opacity duration-1000 ${
                                isSpotlightFading ? 'opacity-0' : 'opacity-100'
                            }`}
                            style={{
                                background: `radial-gradient(circle 85px at ${activeSpotlight.x}% ${activeSpotlight.y}%, transparent 0%, rgba(15, 23, 42, 0.45) 45%, rgba(15, 23, 42, 0.88) 100%)`,
                            }}
                        >
                            {/* Animated Beacon Wave and Glow at Target Coordinates */}
                            <div
                                className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                                style={{ left: `${activeSpotlight.x}%`, top: `${activeSpotlight.y}%` }}
                            >
                                {/* Outer expanding radar ring 1 */}
                                <div className="absolute -inset-10 rounded-full border-2 border-amber-400/80 animate-ping" />
                                {/* Outer expanding radar ring 2 */}
                                <div className="absolute -inset-16 rounded-full border border-sky-400/60 animate-ping" style={{ animationDelay: '250ms' }} />
                                {/* Glowing spotlight flare core */}
                                <div className="absolute -inset-12 rounded-full bg-gradient-to-r from-amber-400/35 via-yellow-300/25 to-sky-400/35 blur-xl animate-pulse" />

                                {/* Floating Spotlight Beacon Tag */}
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-8 z-50 flex flex-col items-center animate-bounce pointer-events-none">
                                    <div className="px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-xs shadow-2xl border-2 border-white flex items-center gap-1.5 whitespace-nowrap">
                                        <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                                        <span>📍 #{activeSpotlight.num} {activeSpotlight.name}</span>
                                    </div>
                                    <div className="w-2 h-2 rotate-45 bg-amber-600 -mt-1 shadow-md" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Interactive Compact Location Pins */}
                    {displayedZones.map((zone) => (
                        <ResortZonePin
                            key={zone.id}
                            zone={zone}
                            isSelected={selectedZoneId === zone.id}
                            isHovered={hoveredZone === zone.id}
                            isCompactMobile={isCompactMobile}
                            isDark={isDark}
                            selectedRingClass="ring-2 ring-sky-400"
                            fallbackLabel={isEn ? 'TPI Facility' : 'Fasilitas TPI'}
                            onSelectZone={onSelectZone}
                            onHoverStart={setHoveredZone}
                            onHoverEnd={() => setHoveredZone(null)}
                        />
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-3">
            {/* Map Canvas with Controls HUD */}
            <div className={`relative w-full rounded-2xl overflow-hidden border shadow-xl select-none group ${
                isDark ? 'bg-slate-950 border-slate-700/80' : 'bg-slate-100 border-slate-300 shadow-md'
            }`}>
                {/* HUD Toolbar */}
                <div className={`flex flex-wrap items-center justify-between gap-2 p-2 border-b text-xs backdrop-blur-md ${
                    isDark ? 'bg-slate-900/90 border-slate-800 text-slate-300' : 'bg-slate-100/90 border-slate-200 text-slate-800'
                }`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setFilterMode(prev => prev === 'all' ? 'active' : 'all')}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                                filterMode === 'active'
                                    ? isDark ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : isDark ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-700 hover:text-slate-900 hover:bg-white'
                            }`}
                            title={isEn ? 'Filter only locations with active issues' : 'Filter hanya lokasi dengan isu aktif'}
                        >
                            {filterMode === 'active' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            <span>{filterMode === 'active' ? (isEn ? 'Active Issues Only' : 'Hanya Isu Aktif') : (isEn ? 'All 22 Points' : 'Semua 22 Titik')}</span>
                        </button>

                        {/* Quick HD Zoom Chips */}
                        <div className={`flex items-center rounded-lg border p-0.5 text-[10px] font-bold ${
                            isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
                        }`}>
                            <button
                                type="button"
                                onClick={() => handleSetZoomPreset(1)}
                                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                    zoom === 1
                                        ? 'bg-sky-500 text-slate-950 shadow-2xs font-extrabold'
                                        : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                                }`}
                                title={isEn ? 'Fit 100% Screen Width' : 'Paskan 100% Lebar Layar'}
                            >
                                1x Fit
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetZoomPreset(1.5)}
                                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-0.5 ${
                                    zoom === 1.5
                                        ? 'bg-emerald-500 text-slate-950 shadow-2xs font-extrabold'
                                        : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                                }`}
                                title={isEn ? 'Zoom 1.5x HD (Crisp readable text)' : 'Zoom 1.5x HD (Teks tajam terbaca)'}
                            >
                                <Sparkles className="w-2.5 h-2.5" />
                                <span>1.5x HD</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetZoomPreset(2)}
                                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                    zoom === 2
                                        ? 'bg-purple-500 text-white shadow-2xs font-extrabold'
                                        : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                                }`}
                                title={isEn ? 'Zoom 2x Ultra Detail' : 'Zoom 2x Ultra Detail'}
                            >
                                2x Ultra
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={handleZoomIn}
                            disabled={zoom >= 3}
                            className={`p-1.5 rounded-lg disabled:opacity-40 transition-colors cursor-pointer ${
                                isDark ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-700 hover:text-slate-900 hover:bg-white'
                            }`}
                            title={isEn ? 'Zoom In' : 'Perbesar Denah'}
                        >
                            <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={handleZoomOut}
                            disabled={zoom <= 0.75}
                            className={`p-1.5 rounded-lg disabled:opacity-40 transition-colors cursor-pointer ${
                                isDark ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-700 hover:text-slate-900 hover:bg-white'
                            }`}
                            title={isEn ? 'Zoom Out' : 'Perkecil Denah'}
                        >
                            <ZoomOut className="w-3.5 h-3.5" />
                        </button>

                        <div className={`h-4 w-px mx-0.5 ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />

                        {/* Fullscreen Trigger */}
                        <button
                            type="button"
                            onClick={() => setIsFullscreen(true)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700'
                                    : 'bg-white hover:bg-slate-50 text-sky-700 border border-slate-300 shadow-2xs'
                            }`}
                            title={isEn ? 'Open Map in Fullscreen' : 'Buka Denah di Layar Penuh'}
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{isEn ? 'Fullscreen' : 'Layar Penuh'}</span>
                        </button>
                    </div>
                </div>

                {/* Blueprint Map Container - Free Page Scroll & Horizontal Drag-to-Pan on Zoom */}
                <div
                    ref={scrollContainerRef}
                    {...inlineDrag.dragHandlers}
                    title={zoom > 1 ? (isEn ? 'Click & drag to pan map • Mouse wheel still scrolls page' : 'Tahan klik & geser mouse untuk menggeser denah • Scroll mouse tetap menggerakkan halaman') : undefined}
                    className={`relative w-full bg-[#fbf9f4] transition-all max-h-none ${
                        zoom > 1
                            ? `overflow-x-auto overflow-y-hidden touch-pan-x touch-pan-y ${inlineDrag.isDragging ? 'cursor-grabbing' : 'cursor-grab'}`
                            : 'overflow-visible'
                    }`}
                >
                    {renderMapCanvas(false)}
                </div>

                {/* Bottom Bar Info Legend */}
                <div className={`px-4 py-2.5 border-t flex flex-wrap items-center justify-between text-xs gap-2 ${
                    isDark ? 'bg-slate-900/95 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-700'
                }`}>
                    <div className="flex items-center gap-2">
                        <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                            {isEn ? 'Official Telunas Private Island Map' : 'Denah Spasial Resmi Pulau Telunas'}
                        </span>
                        <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            {isEn ? '• 22 Mapped Facility Points' : '• 22 Titik Fasilitas Terpetakan'}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] flex-wrap font-medium">
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> {isEn ? 'Open (Not Started)' : 'Open (Belum Dikerjakan)'}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-sky-600" /> {isEn ? 'In Progress' : 'Sedang Dikerjakan'}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500" /> {isEn ? 'Pending' : 'Tertunda (Pending)'}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" /> {isEn ? 'All Resolved' : 'Semua Selesai'}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-slate-600' : 'bg-slate-400'}`} /> {isEn ? 'No Reports' : 'Tidak Ada Laporan'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Fullscreen HD Modal */}
            {isFullscreen && (
                <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col p-2 sm:p-4 animate-in fade-in duration-200">
                    {/* Modal Header */}
                    <div className="flex items-center justify-between pb-2 px-2 border-b border-slate-800 text-white shrink-0">
                        <div className="flex items-center gap-2">
                            <Map className="w-5 h-5 text-emerald-400 shrink-0" />
                            <div>
                                <h3 className="font-bold text-xs sm:text-sm text-white">
                                    {isEn ? 'Telunas Private Island (TPI) Official Map — HD Fullscreen' : 'Denah Resmi Pulau Telunas (TPI) - Mode Layar Penuh HD'}
                                </h3>
                                <p className="text-[10px] text-slate-400">
                                    {isEn ? 'Drag / pan map to inspect facilities • Click pin to filter issues' : 'Geser / pan denah untuk melihat fasilitas • Klik pin untuk filter isu'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2">
                            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-0.5 text-xs">
                                <button
                                    type="button"
                                    onClick={() => handleSetZoomPreset(1)}
                                    className={`px-2 py-0.5 rounded cursor-pointer ${zoom === 1 ? 'bg-sky-500 text-black font-bold' : 'text-slate-400'}`}
                                >
                                    1x
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSetZoomPreset(1.5)}
                                    className={`px-2 py-0.5 rounded cursor-pointer ${zoom === 1.5 ? 'bg-emerald-500 text-black font-bold' : 'text-slate-400'}`}
                                >
                                    1.5x HD
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSetZoomPreset(2)}
                                    className={`px-2 py-0.5 rounded cursor-pointer ${zoom === 2 ? 'bg-purple-500 text-white font-bold' : 'text-slate-400'}`}
                                >
                                    2x Ultra
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={handleZoomIn}
                                disabled={zoom >= 3}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                                title={isEn ? 'Zoom In' : 'Perbesar'}
                            >
                                <ZoomIn className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={handleZoomOut}
                                disabled={zoom <= 1}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                                title={isEn ? 'Zoom Out' : 'Perkecil'}
                            >
                                <ZoomOut className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsFullscreen(false)}
                                className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 cursor-pointer ml-1"
                                title={isEn ? 'Close Fullscreen' : 'Tutup Layar Penuh'}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Modal Scrollable Body - Anti Left Clipping & Mouse Drag-to-Pan */}
                    <div
                        ref={modalScrollRef}
                        {...modalDrag.dragHandlers}
                        title={isEn ? 'Click & drag mouse to pan the map' : 'Tahan klik & geser mouse untuk menggeser denah'}
                        className={`flex-1 overflow-auto touch-pan-x touch-pan-y relative mt-2 rounded-xl bg-[#fbf9f4] border border-slate-800 ${
                            modalDrag.isDragging ? 'cursor-grabbing' : 'cursor-grab'
                        }`}
                    >
                        {renderMapCanvas(true)}
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Denah Arsitektural Masterplan TBR (Telunas Beach Resort) ---
function TbrResortMap({ zones = [], onSelectZone, selectedZoneId, theme = 'dark', spotlightTarget = null }) {
    const { lang } = useLanguage();
    const isEn = lang === 'en';
    const isDark = theme === 'dark';
    const [zoom, setZoom] = useState(0.65); // Default 0.65x compact for square TBR layout
    const [filterMode, setFilterMode] = useState('all'); // 'all' (all facilities) | 'active' (issues only)
    const [hoveredZone, setHoveredZone] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [activeSpotlight, setActiveSpotlight] = useState(null);
    const [isSpotlightFading, setIsSpotlightFading] = useState(false);
    const scrollContainerRef = useRef(null);
    const modalScrollRef = useRef(null);
    const inlineDrag = useDragToPan(scrollContainerRef, zoom > 1);
    const modalDrag = useDragToPan(modalScrollRef, isFullscreen);

    // Auto-centering and cinematic spotlight effect when a location is triggered from issue modal
    useEffect(() => {
        if (!spotlightTarget?.zoneId) return;
        const target = zones.find(z => z.id === spotlightTarget.zoneId);
        if (!target) return;

        setActiveSpotlight(target);
        setIsSpotlightFading(false);

        // Auto-scroll the map container to center the target zone smoothly
        const scrollTimer = setTimeout(() => {
            if (scrollContainerRef.current) {
                const container = scrollContainerRef.current;
                const targetX = (target.x / 100) * container.scrollWidth - container.clientWidth / 2;
                const targetY = (target.y / 100) * container.scrollHeight - container.clientHeight / 2;
                container.scrollTo({
                    left: Math.max(0, targetX),
                    top: Math.max(0, targetY),
                    behavior: 'smooth',
                });
                container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 120);

        // Initiate smooth fade-out at 2.5s
        const fadeTimer = setTimeout(() => {
            setIsSpotlightFading(true);
        }, 2500);

        // Clear spotlight state at 3.5s
        const clearTimer = setTimeout(() => {
            setActiveSpotlight(null);
            setIsSpotlightFading(false);
        }, 3500);

        return () => {
            clearTimeout(scrollTimer);
            clearTimeout(fadeTimer);
            clearTimeout(clearTimer);
        };
    }, [spotlightTarget?.timestamp, spotlightTarget?.zoneId, zones]);

    const handleZoomIn = () => setZoom((prev) => Math.min(Number((prev + 0.15).toFixed(2)), 2.5));
    const handleZoomOut = () => setZoom((prev) => Math.max(Number((prev - 0.15).toFixed(2)), 0.45));
    const handleSetZoomPreset = (val) => {
        setZoom(val);
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = 0;
            scrollContainerRef.current.scrollTop = 0;
        }
    };

    const displayedZones = filterMode === 'active' ? zones.filter(z => (z.count || 0) > 0) : zones;

    const renderMapCanvas = (isModal = false) => {
        const effectiveZoom = isModal ? Math.max(1, zoom) : zoom;
        const isCompactMobile = !isModal && effectiveZoom <= 1;

        return (
            <div
                className="relative select-none transition-all duration-150 p-1 sm:p-2.5 mx-auto"
                style={{
                    width: isModal ? `${Math.round(effectiveZoom * 100)}%` : `${Math.round(effectiveZoom * 100)}%`,
                    minWidth: isModal ? '850px' : undefined,
                    maxWidth: isModal ? undefined : `${Math.round(effectiveZoom * 100)}%`,
                }}
            >
                {/* High-Contrast Architectural Site Plan Drawing Frame */}
                <div className="relative rounded-xl overflow-hidden border border-slate-300/80 shadow-md bg-white w-full">
                    <img
                        src="/images/maps/tbr_masterplan.png"
                        alt={isEn ? 'Telunas Beach Resort (TBR) Architectural Plan' : 'Denah Arsitektural Telunas Beach Resort (TBR)'}
                        draggable={false}
                        className="w-full h-auto block select-none pointer-events-none filter contrast-[1.10] brightness-[0.98]"
                        style={{ imageRendering: '-webkit-optimize-contrast' }}
                        loading="eager"
                    />

                    {/* Cinematic Spotlight Overlay with Radial Cutout & Beacon Waves */}
                    {activeSpotlight && (
                        <div
                            className={`absolute inset-0 pointer-events-none z-30 transition-opacity duration-1000 ${
                                isSpotlightFading ? 'opacity-0' : 'opacity-100'
                            }`}
                            style={{
                                background: `radial-gradient(circle 85px at ${activeSpotlight.x}% ${activeSpotlight.y}%, transparent 0%, rgba(15, 23, 42, 0.45) 45%, rgba(15, 23, 42, 0.88) 100%)`,
                            }}
                        >
                            {/* Animated Beacon Wave and Glow at Target Coordinates */}
                            <div
                                className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                                style={{ left: `${activeSpotlight.x}%`, top: `${activeSpotlight.y}%` }}
                            >
                                {/* Outer expanding radar ring 1 */}
                                <div className="absolute -inset-10 rounded-full border-2 border-amber-400/80 animate-ping" />
                                {/* Outer expanding radar ring 2 */}
                                <div className="absolute -inset-16 rounded-full border border-sky-400/60 animate-ping" style={{ animationDelay: '250ms' }} />
                                {/* Glowing spotlight flare core */}
                                <div className="absolute -inset-12 rounded-full bg-gradient-to-r from-amber-400/35 via-yellow-300/25 to-sky-400/35 blur-xl animate-pulse" />

                                {/* Floating Spotlight Beacon Tag */}
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-8 z-50 flex flex-col items-center animate-bounce pointer-events-none">
                                    <div className="px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-xs shadow-2xl border-2 border-white flex items-center gap-1.5 whitespace-nowrap">
                                        <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                                        <span>📍 #{activeSpotlight.num} {activeSpotlight.name}</span>
                                    </div>
                                    <div className="w-2 h-2 rotate-45 bg-amber-600 -mt-1 shadow-md" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Interactive Compact Location Pins */}
                    {displayedZones.map((zone) => (
                        <ResortZonePin
                            key={zone.id}
                            zone={zone}
                            isSelected={selectedZoneId === zone.id}
                            isHovered={hoveredZone === zone.id}
                            isCompactMobile={isCompactMobile}
                            isDark={isDark}
                            selectedRingClass="ring-2 ring-amber-400"
                            fallbackLabel={isEn ? 'TBR Facility' : 'Fasilitas TBR'}
                            onSelectZone={onSelectZone}
                            onHoverStart={setHoveredZone}
                            onHoverEnd={() => setHoveredZone(null)}
                        />
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-3">
            {/* Map Canvas with Controls HUD */}
            <div className={`relative w-full rounded-2xl overflow-hidden border shadow-xl select-none group ${
                isDark ? 'bg-slate-950 border-slate-700/80' : 'bg-slate-200/60 border-slate-300 shadow-md'
            }`}>
                {/* HUD Toolbar */}
                <div className={`flex flex-wrap items-center justify-between gap-2 p-2 border-b text-xs backdrop-blur-md ${
                    isDark ? 'bg-slate-900/90 border-slate-800 text-slate-300' : 'bg-white/95 border-slate-300 text-slate-800 shadow-xs'
                }`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setFilterMode(prev => prev === 'all' ? 'active' : 'all')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                                filterMode === 'active'
                                    ? isDark ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : isDark ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                            title={isEn ? 'Filter only locations with active issues' : 'Filter hanya lokasi dengan isu aktif'}
                        >
                            {filterMode === 'active' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            <span>{filterMode === 'active' ? (isEn ? 'Active Issues Only' : 'Hanya Isu Aktif') : (isEn ? 'All Facilities' : 'Semua Fasilitas')}</span>
                        </button>

                        {/* Quick HD Zoom Chips */}
                        <div className={`flex items-center rounded-lg border p-0.5 text-[10px] font-bold ${
                            isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
                        }`}>
                            <button
                                type="button"
                                onClick={() => handleSetZoomPreset(0.65)}
                                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                    zoom === 0.65
                                        ? 'bg-amber-500 text-slate-950 shadow-2xs font-extrabold'
                                        : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                                }`}
                                title={isEn ? 'Compact Fit View' : 'Tampilan Kompak Pas Layar'}
                            >
                                {isEn ? '0.6x Compact' : '0.6x Kompak'}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetZoomPreset(1)}
                                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                    zoom === 1
                                        ? 'bg-amber-500 text-slate-950 shadow-2xs font-extrabold'
                                        : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                                }`}
                                title={isEn ? 'Standard 1x Size' : 'Ukuran 1x Standar'}
                            >
                                {isEn ? '1x Standard' : '1x Standar'}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetZoomPreset(1.5)}
                                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-0.5 ${
                                    zoom === 1.5
                                        ? 'bg-amber-500 text-slate-950 shadow-2xs font-extrabold'
                                        : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                                }`}
                                title={isEn ? 'Zoom 1.5x HD (Crisp readable text)' : 'Zoom 1.5x HD (Teks tajam terbaca)'}
                            >
                                <Sparkles className="w-2.5 h-2.5" />
                                <span>1.5x HD</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={handleZoomIn}
                            disabled={zoom >= 2.5}
                            className={`p-1.5 rounded-lg disabled:opacity-40 transition-colors cursor-pointer ${
                                isDark ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                            title={isEn ? 'Zoom In' : 'Perbesar Denah'}
                        >
                            <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={handleZoomOut}
                            disabled={zoom <= 0.45}
                            className={`p-1.5 rounded-lg disabled:opacity-40 transition-colors cursor-pointer ${
                                isDark ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                            title={isEn ? 'Zoom Out' : 'Perkecil Denah'}
                        >
                            <ZoomOut className="w-3.5 h-3.5" />
                        </button>

                        <div className={`h-4 w-px mx-0.5 ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />

                        {/* Fullscreen Trigger */}
                        <button
                            type="button"
                            onClick={() => setIsFullscreen(true)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
                                    : 'bg-white hover:bg-slate-50 text-amber-800 border border-slate-300 shadow-2xs'
                            }`}
                            title={isEn ? 'Open Map in Fullscreen' : 'Buka Denah di Layar Penuh'}
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{isEn ? 'Fullscreen' : 'Layar Penuh'}</span>
                        </button>
                    </div>
                </div>

                {/* Clean CAD Architectural Blueprint Container - Free Page Scroll & Horizontal Drag-to-Pan on Zoom */}
                <div
                    ref={scrollContainerRef}
                    {...inlineDrag.dragHandlers}
                    title={zoom > 1 ? (isEn ? 'Click & drag to pan map • Mouse wheel still scrolls page' : 'Tahan klik & geser mouse untuk menggeser denah • Scroll mouse tetap menggerakkan halaman') : undefined}
                    className={`relative w-full bg-slate-100 transition-all max-h-none ${
                        zoom > 1
                            ? `overflow-x-auto overflow-y-hidden touch-pan-x touch-pan-y ${inlineDrag.isDragging ? 'cursor-grabbing' : 'cursor-grab'}`
                            : 'overflow-visible'
                    }`}
                >
                    {renderMapCanvas(false)}
                </div>

                {/* Bottom Bar Info Legend */}
                <div className={`px-4 py-2.5 border-t flex flex-wrap items-center justify-between text-xs gap-2 ${
                    isDark ? 'bg-slate-900/95 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-700'
                }`}>
                    <div className="flex items-center gap-2">
                        <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                            {isEn ? 'Telunas Beach Resort (TBR) Architectural Plan' : 'Denah Arsitektural Telunas Beach Resort (TBR)'}
                        </span>
                        <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            {isEn ? '• Overwater Villas & Boardwalk Facilities' : '• Fasilitas Vila Terapung & Titian'}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] flex-wrap font-medium">
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> {isEn ? 'Open (Not Started)' : 'Open (Belum Dikerjakan)'}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-sky-600" /> {isEn ? 'In Progress' : 'Sedang Dikerjakan'}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500" /> {isEn ? 'Pending' : 'Tertunda (Pending)'}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" /> {isEn ? 'All Resolved' : 'Semua Selesai'}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-slate-600' : 'bg-slate-400'}`} /> {isEn ? 'No Reports' : 'Tidak Ada Laporan'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Fullscreen HD Modal */}
            {isFullscreen && (
                <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col p-2 sm:p-4 animate-in fade-in duration-200">
                    {/* Modal Header */}
                    <div className="flex items-center justify-between pb-2 px-2 border-b border-slate-800 text-white shrink-0">
                        <div className="flex items-center gap-2">
                            <Map className="w-5 h-5 text-amber-400 shrink-0" />
                            <div>
                                <h3 className="font-bold text-xs sm:text-sm text-white">
                                    {isEn ? 'Telunas Beach Resort (TBR) Official Map — HD Fullscreen' : 'Denah Resmi Telunas Beach Resort (TBR) - Mode Layar Penuh HD'}
                                </h3>
                                <p className="text-[10px] text-slate-400">
                                    {isEn ? 'Drag / pan map to inspect facilities • Click pin to filter issues' : 'Geser / pan denah untuk melihat fasilitas • Klik pin untuk filter isu'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2">
                            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-0.5 text-xs">
                                <button
                                    type="button"
                                    onClick={() => handleSetZoomPreset(1)}
                                    className={`px-2 py-0.5 rounded cursor-pointer ${zoom === 1 ? 'bg-amber-500 text-black font-bold' : 'text-slate-400'}`}
                                >
                                    1x
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSetZoomPreset(1.5)}
                                    className={`px-2 py-0.5 rounded cursor-pointer ${zoom === 1.5 ? 'bg-amber-500 text-black font-bold' : 'text-slate-400'}`}
                                >
                                    1.5x HD
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSetZoomPreset(2)}
                                    className={`px-2 py-0.5 rounded cursor-pointer ${zoom === 2 ? 'bg-purple-500 text-white font-bold' : 'text-slate-400'}`}
                                >
                                    2x Ultra
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={handleZoomIn}
                                disabled={zoom >= 3}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                                title={isEn ? 'Zoom In' : 'Perbesar'}
                            >
                                <ZoomIn className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={handleZoomOut}
                                disabled={zoom <= 1}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                                title={isEn ? 'Zoom Out' : 'Perkecil'}
                            >
                                <ZoomOut className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsFullscreen(false)}
                                className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 cursor-pointer ml-1"
                                title={isEn ? 'Close Fullscreen' : 'Tutup Layar Penuh'}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Modal Scrollable Body - Anti Left Clipping & Mouse Drag-to-Pan */}
                    <div
                        ref={modalScrollRef}
                        {...modalDrag.dragHandlers}
                        title={isEn ? 'Click & drag mouse to pan the map' : 'Tahan klik & geser mouse untuk menggeser denah'}
                        className={`flex-1 overflow-auto touch-pan-x touch-pan-y relative mt-2 rounded-xl bg-slate-100 border border-slate-800 ${
                            modalDrag.isDragging ? 'cursor-grabbing' : 'cursor-grab'
                        }`}
                    >
                        {renderMapCanvas(true)}
                    </div>
                </div>
            )}
        </div>
    );
}

// =========================================================================
// EXPORT PDF REKAP OPERASIONAL TELUNAS (100% Client-side via jsPDF & AutoTable)
// =========================================================================
export function exportTelunasPdfReport({
    filteredIssues = [],
    stats = {},
    timeLabel,
    deptTargetData = [],
    hotspotList = [],
    lang = 'id',
}) {
    const isEn = lang === 'en';
    const resolvedTimeLabel = timeLabel || (isEn ? 'All Months' : 'Semua Bulan');
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Header Band Telunas
    doc.setFillColor(15, 23, 42); // Slate-900
    doc.rect(0, 0, pageWidth, 28, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(
        isEn ? 'TELUNAS RESORTS - OPERATIONAL ISSUE REPORT' : 'TELUNAS RESORTS - LAPORAN OPERASIONAL ISU',
        14,
        12
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(203, 213, 225); // Slate-300
    doc.text(
        isEn
            ? 'Ticket Summary & Field Analytics (WhatsApp Bot & Field Tracker)'
            : 'Rekapitulasi Tiket & Analisis Lapangan (Pure WhatsApp Bot Input)',
        14,
        18
    );

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // Slate-400
    const nowStr = new Date().toLocaleString(isEn ? 'en-US' : 'id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    doc.text(
        isEn
            ? `Printed: ${nowStr} WIB | Period Filter: ${resolvedTimeLabel}`
            : `Waktu Cetak: ${nowStr} WIB | Filter Periode: ${resolvedTimeLabel}`,
        14,
        24
    );

    // 2. Summary KPI Cards (3 boxes)
    const boxY = 32;
    const boxWidth = (pageWidth - 28 - 8) / 3;
    const boxHeight = 18;

    // Total Tiket Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, boxY, boxWidth, boxHeight, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(isEn ? 'TOTAL TICKETS' : 'TOTAL TIKET', 18, boxY + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(String(stats.total || 0), 18, boxY + 14);

    // Selesai Box
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(187, 247, 208);
    doc.roundedRect(14 + boxWidth + 4, boxY, boxWidth, boxHeight, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(22, 101, 52);
    doc.text(isEn ? 'RESOLVED TICKETS' : 'TIKET SELESAI', 18 + boxWidth + 4, boxY + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(21, 128, 61);
    doc.text(`${stats.resolved || 0} (${stats.resolutionRate || 0}%)`, 18 + boxWidth + 4, boxY + 14);

    // Belum Selesai (Backlog) Box
    doc.setFillColor(255, 241, 242);
    doc.setDrawColor(254, 205, 211);
    doc.roundedRect(14 + (boxWidth + 4) * 2, boxY, boxWidth, boxHeight, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(159, 18, 57);
    doc.text(isEn ? 'UNRESOLVED (BACKLOG)' : 'BELUM SELESAI (BACKLOG)', 18 + (boxWidth + 4) * 2, boxY + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(225, 29, 72);
    doc.text(`${stats.activeCount || 0} (${stats.activeRatio || 0}%)`, 18 + (boxWidth + 4) * 2, boxY + 14);

    let startY = 55;
    if ((stats.withEtaCount || 0) > 0) {
        const slaText = (stats.evaluatedSlaCount || 0) > 0
            ? (isEn
                ? `ETA SLA Punctuality: ${stats.onTimeResolvedCount || 0}/${stats.evaluatedSlaCount} On Time (${stats.onTimeRate}%)`
                : `Ketepatan ETA (SLA): ${stats.onTimeResolvedCount || 0}/${stats.evaluatedSlaCount} Tepat Waktu (${stats.onTimeRate}%)`)
            : (isEn ? 'ETA SLA Punctuality: No resolved ETA tickets yet' : 'Ketepatan ETA (SLA): Belum ada tiket selesai ber-ETA');
        const overdueText = isEn
            ? `Active Overdue ETA: ${stats.overdueActiveCount || 0} ticket(s) | Tickets with ETA: ${stats.withEtaCount}`
            : `Aktif Melewati ETA: ${stats.overdueActiveCount || 0} tiket | Tiket Memiliki Target ETA: ${stats.withEtaCount}`;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(`${slaText}   |   ${overdueText}`, 14, 54.5);
        startY = 59;
    }

    // 3. Table: Sebaran Beban per Departemen
    const deptRows = deptTargetData.map((d, idx) => [
        idx + 1,
        d.name === 'Umum' && isEn ? 'General' : d.name,
        d.total,
        d.resolved,
        d.active,
        `${d.backlogRate}%`,
    ]);

    autoTable(doc, {
        startY: startY,
        head: [
            isEn
                ? ['#', 'Target Department', 'Total Issues', 'Resolved', 'Unresolved', 'Backlog Ratio']
                : ['#', 'Departemen Dituju', 'Total Isu', 'Selesai', 'Belum Selesai', 'Rasio Backlog'],
        ],
        body: deptRows,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 50 },
            2: { halign: 'center' },
            3: { halign: 'center', textColor: [21, 128, 61] },
            4: { halign: 'center', textColor: [225, 29, 72] },
            5: { halign: 'center', fontStyle: 'bold' },
        },
        margin: { left: 14, right: 14 },
    });

    startY = doc.lastAutoTable.finalY + 8;

    // 4. Table: Hotspot Lokasi Terbanyak
    const hotspotRows = hotspotList.slice(0, 8).map((h, idx) => [
        idx + 1,
        h.location === 'Lainnya' && isEn ? 'Other' : h.location,
        h.resort || '-',
        h.total,
        h.openCount,
        h.openCount > 0 ? (isEn ? 'Needs Work' : 'Perlu Pengerjaan') : (isEn ? 'Clear' : 'Tuntas'),
    ]);

    autoTable(doc, {
        startY: startY,
        head: [
            isEn
                ? ['#', 'Location / Unit', 'Resort', 'Total Incidents', 'Unresolved', 'Area Status']
                : ['#', 'Lokasi / Unit', 'Resort', 'Total Insiden', 'Isu Belum Selesai', 'Status Area'],
        ],
        body: hotspotRows,
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85], fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 60 },
            2: { cellWidth: 25, halign: 'center' },
            3: { halign: 'center' },
            4: { halign: 'center', textColor: [225, 29, 72], fontStyle: 'bold' },
            5: { halign: 'center' },
        },
        margin: { left: 14, right: 14 },
    });

    startY = doc.lastAutoTable.finalY + 8;

    // 5. Table: Daftar Isu Aktif Belum Selesai
    const activeIssues = filteredIssues.filter(i => i.status !== 'resolved').slice(0, 15);
    if (activeIssues.length > 0) {
        if (startY > 220) {
            doc.addPage();
            startY = 18;
        }

        const activeRows = activeIssues.map(i => [
            i.issue_code || ('#' + i.id),
            i.location || '-',
            (i.target_departments || []).map((d) => (d === 'Umum' && isEn ? 'General' : d)).join(', ') || (isEn ? 'General' : 'Umum'),
            i.title || '-',
            i.reporter_name || '-',
            i.status === 'open'
                ? 'Open'
                : i.status === 'pending'
                ? (isEn ? 'Pending' : 'Tertunda')
                : (isEn ? 'In Progress' : 'Progress'),
            i.estimated_completion_at ? formatEtaDisplayWib(i.estimated_completion_at, isEn, true) : '-',
            i.pending_reason || '-',
        ]);

        autoTable(doc, {
            startY: startY,
            head: [
                isEn
                    ? ['Code', 'Location', 'Target Dept', 'Issue Title', 'Reporter', 'Status', 'Target ETA', 'Pending Notes']
                    : ['Kode', 'Lokasi', 'Dept Dituju', 'Judul Masalah', 'Pelapor', 'Status', 'Target ETA', 'Catatan Pending'],
            ],
            body: activeRows,
            theme: 'grid',
            headStyles: { fillColor: [190, 18, 60], fontSize: 7.5, fontStyle: 'bold' },
            bodyStyles: { fontSize: 7 },
            columnStyles: {
                0: { cellWidth: 22, fontStyle: 'bold' },
                1: { cellWidth: 23 },
                2: { cellWidth: 22 },
                3: { cellWidth: 36 },
                4: { cellWidth: 18 },
                5: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
                6: { cellWidth: 25 },
                7: { cellWidth: 'auto' },
            },
            margin: { left: 14, right: 14 },
        });
    }

    doc.save(`${isEn ? 'Telunas_Analytics_Report' : 'Laporan_Analisis_Telunas'}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// =========================================================================
// MAIN COMPONENT: LEAN ANALYTICS VIEW
// =========================================================================
export function LeanAnalyticsView({
    issues = [],
    departments = [],
    theme = 'dark',
    onSelectIssue,
    focusMapRequest = null,
    spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/1hF2X6DrcWvOv4h77T_B4pmcNklO2-Zq2CzAiAR-UYIg/edit?usp=sharing',
    monthGids = {},
}) {
    const { lang } = useLanguage();
    const isEn = lang === 'en';
    const isDark = theme === 'dark';

    const getStatusLabel = (status) => {
        if (status === 'open') return 'Open';
        if (status === 'in_progress') return isEn ? 'In Progress' : 'Progress';
        if (status === 'pending') return isEn ? 'Pending' : 'Tertunda';
        if (status === 'resolved') return isEn ? 'Resolved' : 'Selesai';
        return status;
    };

    const formatDeptDisplay = (name) => (name === 'Umum' && isEn ? 'General' : name);

    // 1. Time / Month Filter
    const [timeRange, setTimeRange] = useState('all');

    // Map timeRange selection to canonical Indonesian Google Sheets tab name (for monthGids lookup)
    const activeMonthName = useMemo(() => {
        const monthMap = {
            month_1: 'Januari',
            month_2: 'Februari',
            month_3: 'Maret',
            month_4: 'April',
            month_5: 'Mei',
            month_6: 'Juni',
            month_7: 'Juli',
            month_8: 'Agustus',
            month_9: 'September',
            month_10: 'Oktober',
            month_11: 'November',
            month_12: 'Desember',
        };
        if (monthMap[timeRange]) {
            return monthMap[timeRange];
        }
        const currentM = new Date().getMonth() + 1;
        return monthMap[`month_${currentM}`] || 'November';
    }, [timeRange]);

    const activeMonthDisplayName = useMemo(() => {
        if (!isEn) return activeMonthName;
        const enMap = {
            Januari: 'January',
            Februari: 'February',
            Maret: 'March',
            April: 'April',
            Mei: 'May',
            Juni: 'June',
            Juli: 'July',
            Agustus: 'August',
            September: 'September',
            Oktober: 'October',
            November: 'November',
            Desember: 'December',
        };
        return enMap[activeMonthName] || activeMonthName;
    }, [activeMonthName, isEn]);

    // Dynamic Google Sheet URL with #gid anchor to open the exact month tab
    const dynamicSheetUrl = useMemo(() => {
        const gid = monthGids?.[activeMonthName];
        const baseUrl = (spreadsheetUrl || '').split('#')[0];
        if (gid !== undefined && gid !== null && gid !== '') {
            return `${baseUrl}#gid=${gid}`;
        }
        return spreadsheetUrl;
    }, [activeMonthName, monthGids, spreadsheetUrl]);
    // 2. Customizable Department Mode: 'target_issues' | 'reporters' | 'backlog_ratio'
    const [deptMode, setDeptMode] = useState('target_issues');
    // 3. Spatial Map Tab: 'tpi' | 'tbr'
    const [activeMapTab, setActiveMapTab] = useState('tpi');
    // 4. Interactive Zone Selection
    const [selectedTpiZone, setSelectedTpiZone] = useState(null);
    const [selectedTbrZone, setSelectedTbrZone] = useState(null);
    // 5. Hotspot Location Modal
    const [selectedLocationForModal, setSelectedLocationForModal] = useState(null);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNowMs(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    // Preload resort maps
    useEffect(() => {
        ['/images/maps/tpi_masterplan_v3.png?v=1', '/images/maps/tbr_masterplan.png'].forEach((src) => {
            const img = new Image();
            img.src = src;
        });
    }, []);

    // Respond to focusMapRequest from outside
    useEffect(() => {
        if (!focusMapRequest?.resort) return;
        if (focusMapRequest.resort === 'TBR') setActiveMapTab('tbr');
        else if (focusMapRequest.resort === 'TPI') setActiveMapTab('tpi');
    }, [focusMapRequest]);

    // Filter issues by time
    const filteredIssues = useMemo(() => {
        if (timeRange === 'all') return issues;

        const now = new Date();
        return issues.filter((i) => {
            if (!i.created_at) return true;
            const issueDate = new Date(i.created_at);
            if (isNaN(issueDate.getTime())) return true;

            if (timeRange === 'today') {
                return issueDate.toDateString() === now.toDateString();
            } else if (timeRange === '7d') {
                const diffMs = now.getTime() - issueDate.getTime();
                return diffMs <= 7 * 24 * 60 * 60 * 1000;
            } else if (timeRange === '30d') {
                const diffMs = now.getTime() - issueDate.getTime();
                return diffMs <= 30 * 24 * 60 * 60 * 1000;
            } else if (timeRange.startsWith('month_')) {
                const mNum = parseInt(timeRange.replace('month_', ''), 10);
                return issueDate.getMonth() + 1 === mNum;
            }
            return true;
        });
    }, [issues, timeRange]);

    // KPI Metrics calculation
    const stats = useMemo(() => {
        const total = filteredIssues.length;
        const resolved = filteredIssues.filter((i) => i.status === 'resolved').length;
        const openCount = filteredIssues.filter((i) => i.status === 'open').length;
        const inProgressCount = filteredIssues.filter((i) => i.status === 'in_progress').length;
        const pendingCount = filteredIssues.filter((i) => i.status === 'pending').length;
        const activeCount = total - resolved;
        const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
        const activeRatio = total > 0 ? Math.round((activeCount / total) * 100) : 0;

        let withEtaCount = 0;
        let overdueActiveCount = 0;
        let evaluatedSlaCount = 0;
        let onTimeResolvedCount = 0;
        let lateResolvedCount = 0;

        filteredIssues.forEach((issue) => {
            if (!issue?.estimated_completion_at) return;
            const etaBadge = getEtaBadgeInfo(issue, nowMs, isEn);
            if (!etaBadge) return;
            withEtaCount += 1;

            if (issue.status === 'resolved') {
                if (etaBadge.state === 'on_time') {
                    evaluatedSlaCount += 1;
                    onTimeResolvedCount += 1;
                } else if (etaBadge.state === 'late_resolved') {
                    evaluatedSlaCount += 1;
                    lateResolvedCount += 1;
                }
            } else if (etaBadge.state === 'overdue') {
                overdueActiveCount += 1;
            }
        });

        const onTimeRate = evaluatedSlaCount > 0
            ? Math.round((onTimeResolvedCount / evaluatedSlaCount) * 100)
            : null;

        return {
            total,
            resolved,
            openCount,
            inProgressCount,
            pendingCount,
            activeCount,
            resolutionRate,
            activeRatio,
            withEtaCount,
            overdueActiveCount,
            evaluatedSlaCount,
            onTimeResolvedCount,
            lateResolvedCount,
            onTimeRate,
        };
    }, [filteredIssues, nowMs, isEn]);

    // Departemen Terbanyak Data (3 Modes)
    const deptMetrics = useMemo(() => {
        const targetMap = {};
        const reporterMap = {};

        // Initialize with known master departments
        (departments || []).forEach((d) => {
            const name = (d || '').trim();
            if (name) {
                targetMap[name] = { name, total: 0, resolved: 0, active: 0 };
                reporterMap[name] = { name, total: 0 };
            }
        });

        filteredIssues.forEach((issue) => {
            // Target departments
            const depts = Array.isArray(issue.target_departments)
                ? issue.target_departments
                : [issue.target_departments || 'Umum'];

            depts.forEach((d) => {
                const name = (d || 'Umum').trim() || 'Umum';
                if (!targetMap[name]) {
                    targetMap[name] = { name, total: 0, resolved: 0, active: 0 };
                }
                targetMap[name].total += 1;
                if (issue.status === 'resolved') {
                    targetMap[name].resolved += 1;
                } else {
                    targetMap[name].active += 1;
                }
            });

            // Reporter department
            const repDept = (issue.reporter_dept || 'Umum').trim() || 'Umum';
            if (!reporterMap[repDept]) {
                reporterMap[repDept] = { name: repDept, total: 0 };
            }
            reporterMap[repDept].total += 1;
        });

        // Mode 1: Isu Terbanyak (Beban Ditugaskan)
        const targetList = Object.values(targetMap)
            .filter((d) => d.total > 0)
            .map((d) => ({
                ...d,
                pct: stats.total > 0 ? Math.round((d.total / stats.total) * 100) : 0,
                backlogRate: d.total > 0 ? Math.round((d.active / d.total) * 100) : 0,
            }))
            .sort((a, b) => b.total - a.total);

        // Mode 2: Pelapor Terbanyak (Dept Asal Pelapor)
        const reporterList = Object.values(reporterMap)
            .filter((d) => d.total > 0)
            .map((d) => ({
                ...d,
                pct: stats.total > 0 ? Math.round((d.total / stats.total) * 100) : 0,
            }))
            .sort((a, b) => b.total - a.total);

        // Mode 3: Isu Belum Selesai / Total (Rasio Backlog)
        const backlogList = [...targetList].sort((a, b) => {
            if (b.active !== a.active) return b.active - a.active;
            return b.backlogRate - a.backlogRate;
        });

        return {
            targetList,
            reporterList,
            backlogList,
        };
    }, [filteredIssues, departments, stats.total]);

    // Hotspot Lokasi Terbanyak
    const hotspotList = useMemo(() => {
        const locMap = {};

        filteredIssues.forEach((issue) => {
            const loc = (issue.location || 'Lainnya').trim() || 'Lainnya';
            if (!locMap[loc]) {
                const locInfo = resolveIssueResortAndZone(issue);
                locMap[loc] = {
                    location: loc,
                    resort: locInfo.resort || (loc.toLowerCase().includes('tbr') ? 'TBR' : 'TPI'),
                    total: 0,
                    openCount: 0,
                    resolvedCount: 0,
                    issues: [],
                };
            }
            locMap[loc].total += 1;
            if (issue.status === 'resolved') {
                locMap[loc].resolvedCount += 1;
            } else {
                locMap[loc].openCount += 1;
            }
            locMap[loc].issues.push(issue);
        });

        return Object.values(locMap).sort((a, b) => {
            if (b.total !== a.total) return b.total - a.total;
            return b.openCount - a.openCount;
        });
    }, [filteredIssues]);

    const topHotspot = hotspotList[0] || null;

    // Spatial Map Data for TPI & TBR
    const spatialHotspots = useMemo(() => {
        const tpiZones = {};
        const tbrZones = {};

        TPI_MASTERPLAN_ZONES.forEach((z) => {
            tpiZones[z.id] = { ...z, count: 0, total: 0, issues: [], openCount: 0, progressCount: 0, pendingCount: 0, resolvedCount: 0, dominantStatus: 'none' };
        });

        TBR_MASTERPLAN_ZONES.forEach((z) => {
            tbrZones[z.id] = { ...z, count: 0, total: 0, issues: [], openCount: 0, progressCount: 0, pendingCount: 0, resolvedCount: 0, dominantStatus: 'none' };
        });

        filteredIssues.forEach((issue) => {
            const { resort, zoneId } = resolveIssueResortAndZone(issue);
            if (!resort || resort === 'OFFICE' || !zoneId) return;

            const targetMap = resort === 'TBR' ? tbrZones : tpiZones;
            if (targetMap[zoneId]) {
                const zone = targetMap[zoneId];
                zone.total += 1;
                zone.issues.push(issue);
                const s = issue.status || 'open';
                if (s === 'open') {
                    zone.count += 1;
                    zone.openCount += 1;
                } else if (s === 'in_progress') {
                    zone.count += 1;
                    zone.progressCount += 1;
                } else if (s === 'pending') {
                    zone.count += 1;
                    zone.pendingCount += 1;
                } else if (s === 'resolved' || s === 'closed') {
                    zone.resolvedCount += 1;
                }
            }
        });

        const finalizeZones = (map) => {
            return Object.values(map).map((zone) => {
                let dominantStatus = 'none';
                if (zone.openCount > 0) {
                    dominantStatus = 'open';
                } else if (zone.progressCount > 0) {
                    dominantStatus = 'in_progress';
                } else if (zone.pendingCount > 0) {
                    dominantStatus = 'pending';
                } else if (zone.resolvedCount > 0) {
                    dominantStatus = 'resolved';
                }
                return { ...zone, dominantStatus };
            });
        };

        return {
            tpiZones: finalizeZones(tpiZones),
            tbrZones: finalizeZones(tbrZones),
        };
    }, [filteredIssues]);

    // Handle Download PDF
    const handleDownloadPdf = () => {
        setIsDownloadingPdf(true);
        try {
            const timeLabels = isEn
                ? {
                      all: 'All Months (All Tabs)',
                      today: 'Today',
                      '7d': 'Last 7 Days',
                      '30d': 'Last 30 Days',
                      month_1: 'January',
                      month_2: 'February',
                      month_3: 'March',
                      month_4: 'April',
                      month_5: 'May',
                      month_6: 'June',
                      month_7: 'July',
                      month_8: 'August',
                      month_9: 'September',
                      month_10: 'October',
                      month_11: 'November',
                      month_12: 'December',
                  }
                : {
                      all: 'Semua Bulan (Semua Tab)',
                      today: 'Hari Ini',
                      '7d': '7 Hari Terakhir',
                      '30d': '30 Hari Terakhir',
                      month_1: 'Bulan Januari',
                      month_2: 'Bulan Februari',
                      month_3: 'Bulan Maret',
                      month_4: 'Bulan April',
                      month_5: 'Bulan Mei',
                      month_6: 'Bulan Juni',
                      month_7: 'Bulan Juli',
                      month_8: 'Bulan Agustus',
                      month_9: 'Bulan September',
                      month_10: 'Bulan Oktober',
                      month_11: 'Bulan November',
                      month_12: 'Bulan Desember',
                  };
            exportTelunasPdfReport({
                filteredIssues,
                stats,
                timeLabel: timeLabels[timeRange] || timeRange,
                deptTargetData: deptMetrics.targetList,
                hotspotList,
                lang,
            });
        } catch (err) {
            console.error('Error generating PDF:', err);
            alert((isEn ? 'Failed to generate PDF: ' : 'Gagal membuat PDF: ') + err.message);
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in pb-16">
            {/* ========================================================= */}
            {/* 1. TOP CONTROL BAR (TIME FILTER + QUICK ACTIONS)           */}
            {/* ========================================================= */}
            <div className={`border rounded-2xl p-3.5 sm:p-4 backdrop-blur transition-all ${
                isDark ? 'bg-slate-900/95 border-slate-700/80 shadow-xl' : 'bg-white/95 border-slate-200 shadow-sm'
            }`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {/* Time Filter Dropdown */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            <Clock className="w-3.5 h-3.5 text-emerald-500" />
                            {isEn ? 'Report Period:' : 'Periode Laporan:'}
                        </span>
                        <select
                            value={timeRange}
                            onChange={(e) => setTimeRange(e.target.value)}
                            className={`text-xs font-semibold rounded-xl px-3 py-2 border shadow-sm cursor-pointer transition-all focus:ring-1 focus:ring-emerald-500 ${
                                isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                            }`}
                        >
                            <option value="all">{isEn ? '📅 All Months (All Tabs)' : '📅 Semua Bulan (Semua Tab)'}</option>
                            <option value="today">{isEn ? '⚡ Today' : '⚡ Hari Ini'}</option>
                            <option value="7d">{isEn ? '🕒 Last 7 Days' : '🕒 7 Hari Terakhir'}</option>
                            <option value="30d">{isEn ? '🗓️ Last 30 Days' : '🗓️ 30 Hari Terakhir'}</option>
                            <optgroup label={isEn ? 'Monthly Spreadsheet Tabs' : 'Tab Bulanan Spreadsheet'}>
                                <option value="month_1">{isEn ? 'Month 01 - January' : 'Bulan 01 - Januari'}</option>
                                <option value="month_2">{isEn ? 'Month 02 - February' : 'Bulan 02 - Februari'}</option>
                                <option value="month_3">{isEn ? 'Month 03 - March' : 'Bulan 03 - Maret'}</option>
                                <option value="month_4">{isEn ? 'Month 04 - April' : 'Bulan 04 - April'}</option>
                                <option value="month_5">{isEn ? 'Month 05 - May' : 'Bulan 05 - Mei'}</option>
                                <option value="month_6">{isEn ? 'Month 06 - June' : 'Bulan 06 - Juni'}</option>
                                <option value="month_7">{isEn ? 'Month 07 - July' : 'Bulan 07 - Juli'}</option>
                                <option value="month_8">{isEn ? 'Month 08 - August' : 'Bulan 08 - Agustus'}</option>
                                <option value="month_9">{isEn ? 'Month 09 - September' : 'Bulan 09 - September'}</option>
                                <option value="month_10">{isEn ? 'Month 10 - October' : 'Bulan 10 - Oktober'}</option>
                                <option value="month_11">{isEn ? 'Month 11 - November' : 'Bulan 11 - November'}</option>
                                <option value="month_12">{isEn ? 'Month 12 - December' : 'Bulan 12 - Desember'}</option>
                            </optgroup>
                        </select>
                    </div>

                    {/* Quick Actions Bar: Ke Sheet Utama & Download PDF */}
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        {/* Tombol Ke Sheet Utama (Dinamis per Tab Bulan) */}
                        <a
                            href={dynamicSheetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white shadow-sm transition-all cursor-pointer group"
                            title={isEn ? `Open Google Sheet: ${activeMonthDisplayName} Tab` : `Buka Google Sheet: Tab ${activeMonthName}`}
                        >
                            <FileSpreadsheet className="w-4 h-4 shrink-0 text-white" />
                            <span className="text-white">{isEn ? `Open Sheet (${activeMonthDisplayName})` : `Ke Sheet (${activeMonthName})`}</span>
                            <ExternalLink className="w-3.5 h-3.5 opacity-90 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-white" />
                        </a>

                        {/* Tombol Download PDF */}
                        <button
                            type="button"
                            onClick={handleDownloadPdf}
                            disabled={isDownloadingPdf}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white keep-white shadow-sm transition-all cursor-pointer disabled:opacity-50"
                            title={isEn ? 'Download Official Telunas Summary Report (Print-ready PDF)' : 'Download Laporan Rekapitulasi Resmi Telunas (PDF Siap Cetak)'}
                        >
                            <Download className="w-4 h-4 shrink-0 text-white" />
                            <span className="text-white">{isDownloadingPdf ? (isEn ? 'Generating PDF...' : 'Menyiapkan PDF...') : 'Download PDF'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ========================================================= */}
            {/* 2. CORE KPI METRICS 4-GRID BAR                            */}
            {/* ========================================================= */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* KPI 1: Total Tiket */}
                <div className={`p-4 rounded-2xl border shadow-sm relative overflow-hidden backdrop-blur-md transition-all flex flex-col justify-between ${
                    isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
                }`}>
                    <div>
                        <div className="flex items-center justify-between">
                            <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {isEn ? 'Total Incoming Tickets' : 'Total Tiket Masuk'}
                            </span>
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                                <Layers className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                            <span className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {stats.total}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                isDark ? 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                            }`}>
                                {stats.resolutionRate}% {isEn ? 'Resolved' : 'Selesai'}
                            </span>
                            {stats.evaluatedSlaCount > 0 && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                    stats.onTimeRate >= 80
                                        ? (isDark ? 'bg-sky-950/80 border-sky-800/60 text-sky-300' : 'bg-sky-100 border-sky-300 text-sky-800')
                                        : (isDark ? 'bg-amber-950/80 border-amber-800/60 text-amber-300' : 'bg-amber-100 border-amber-300 text-amber-800')
                                }`}>
                                    {stats.onTimeRate}% {isEn ? 'On-Time SLA' : 'Tepat ETA'}
                                </span>
                            )}
                        </div>
                    </div>
                    <p className={`text-[11px] mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {isEn
                            ? `${stats.resolved} of ${stats.total} tickets resolved by the field team`
                            : `${stats.resolved} dari ${stats.total} tiket telah dituntaskan tim lapangan`}
                    </p>
                </div>

                {/* KPI 2: Tiket Belum Selesai (Backlog) */}
                <div className={`p-4 rounded-2xl border shadow-sm relative overflow-hidden backdrop-blur-md transition-all flex flex-col justify-between ${
                    isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
                }`}>
                    <div>
                        <div className="flex items-center justify-between">
                            <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {isEn ? 'Unresolved Tickets (Backlog)' : 'Tiket Belum Selesai (Backlog)'}
                            </span>
                            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                                <Clock className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                            <span className={`text-2xl font-black ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>
                                {stats.activeCount}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                isDark ? 'bg-rose-950/80 border-rose-800/60 text-rose-300' : 'bg-rose-100 border-rose-300 text-rose-800'
                            }`}>
                                {stats.activeRatio}% Backlog
                            </span>
                            {stats.overdueActiveCount > 0 && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                    isDark ? 'bg-rose-950/90 border-rose-600/60 text-rose-300' : 'bg-rose-50 border-rose-400 text-rose-700'
                                }`}>
                                    {stats.overdueActiveCount} {isEn ? 'Overdue ETA' : 'Lewat ETA'}
                                </span>
                            )}
                        </div>
                    </div>
                    <p className={`text-[11px] mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Open: <strong className={isDark ? 'text-rose-400' : 'text-rose-600'}>{stats.openCount}</strong> • Progress: <strong className={isDark ? 'text-sky-400' : 'text-sky-600'}>{stats.inProgressCount}</strong> • {isEn ? 'Pending' : 'Tertunda'}: <strong className={isDark ? 'text-amber-400' : 'text-amber-600'}>{stats.pendingCount}</strong>
                    </p>
                </div>

                {/* KPI 3: Departemen Terbanyak (Customizable 3 Modes Inside Card) */}
                {(() => {
                    let topDept = null;
                    let rank2 = null;
                    let rank3 = null;
                    let badgeText = '';
                    let badgeStyle = '';
                    let bigValue = '';
                    let subInfo = '';

                    if (deptMode === 'target_issues') {
                        topDept = deptMetrics.targetList[0];
                        rank2 = deptMetrics.targetList[1];
                        rank3 = deptMetrics.targetList[2];
                        bigValue = topDept ? `${topDept.total} ${isEn ? 'Issues' : 'Isu'}` : (isEn ? '0 Issues' : '0 Isu');
                        badgeText = topDept ? `${topDept.pct}% ${isEn ? 'of total' : 'dari total'}` : '0%';
                        badgeStyle = isDark ? 'bg-sky-950/80 border-sky-800/60 text-sky-300' : 'bg-sky-100 border-sky-300 text-sky-800';
                        subInfo = (rank2 || rank3)
                            ? `#2 ${rank2?.name ? formatDeptDisplay(rank2.name) : '-'}: ${rank2?.total || 0} • #3 ${rank3?.name ? formatDeptDisplay(rank3.name) : '-'}: ${rank3?.total || 0}`
                            : (isEn ? 'Highest issue workload' : 'Beban tugas laporan tertinggi');
                    } else if (deptMode === 'reporters') {
                        topDept = deptMetrics.reporterList[0];
                        rank2 = deptMetrics.reporterList[1];
                        rank3 = deptMetrics.reporterList[2];
                        bigValue = topDept ? `${topDept.total} ${isEn ? 'Reports' : 'Laporan'}` : (isEn ? '0 Reports' : '0 Laporan');
                        badgeText = topDept ? `${topDept.pct}% ${isEn ? 'share' : 'kontribusi'}` : '0%';
                        badgeStyle = isDark ? 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-800';
                        subInfo = (rank2 || rank3)
                            ? `#2 ${rank2?.name ? formatDeptDisplay(rank2.name) : '-'}: ${rank2?.total || 0} • #3 ${rank3?.name ? formatDeptDisplay(rank3.name) : '-'}: ${rank3?.total || 0}`
                            : (isEn ? 'Most active reporting staff' : 'Staf paling aktif melapor');
                    } else { // backlog_ratio
                        topDept = deptMetrics.backlogList[0];
                        rank2 = deptMetrics.backlogList[1];
                        rank3 = deptMetrics.backlogList[2];
                        bigValue = topDept ? `${topDept.active} ${isEn ? 'Unresolved' : 'Belum Selesai'}` : (isEn ? '0 Unresolved' : '0 Belum Selesai');
                        badgeText = topDept ? `${topDept.backlogRate}% Backlog` : '0%';
                        badgeStyle = (topDept && topDept.active > 0)
                            ? (isDark ? 'bg-rose-950/80 border-rose-800/60 text-rose-300' : 'bg-rose-100 border-rose-300 text-rose-800')
                            : (isDark ? 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-800');
                        subInfo = topDept
                            ? `${topDept.resolved} ${isEn ? 'resolved of' : 'selesai dari'} ${topDept.total} ${isEn ? 'issues' : 'isu'} • #2 ${rank2?.name ? formatDeptDisplay(rank2.name) : '-'}: ${rank2?.active || 0}`
                            : (isEn ? 'No backlog data yet' : 'Belum ada data backlog');
                    }

                    return (
                        <div className={`p-4 rounded-2xl border shadow-sm relative overflow-hidden backdrop-blur-md transition-all flex flex-col justify-between ${
                            isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
                        }`}>
                            <div>
                                <div className="flex items-center justify-between gap-1.5">
                                    <span className={`text-xs font-semibold shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {isEn ? 'Top Department' : 'Departemen Terbanyak'}
                                    </span>
                                    {/* Mini Switcher Selector */}
                                    <select
                                        value={deptMode}
                                        onChange={(e) => setDeptMode(e.target.value)}
                                        className={`text-[10px] font-bold rounded-lg px-2 py-0.5 border cursor-pointer transition-colors focus:ring-1 focus:ring-sky-500 max-w-[130px] truncate ${
                                            isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-800'
                                        }`}
                                        title={isEn ? 'Choose department metric: Most Issues, Top Reporters, or Unresolved / Total' : 'Pilih metrik departemen: Isu Terbanyak, Pelapor Terbanyak, atau Belum Selesai / Total'}
                                    >
                                        <option value="target_issues">{isEn ? '📋 Most Issues' : '📋 Isu Terbanyak'}</option>
                                        <option value="reporters">{isEn ? '🙋‍♂️ Top Reporters' : '🙋‍♂️ Pelapor Terbanyak'}</option>
                                        <option value="backlog_ratio">{isEn ? '⏳ Unresolved / Total' : '⏳ Belum Selesai / Total'}</option>
                                    </select>
                                </div>
                                <div className="mt-2">
                                    <span className={`text-base font-bold truncate block ${isDark ? 'text-sky-300' : 'text-sky-700'}`}>
                                        {topDept ? `#1 ${formatDeptDisplay(topDept.name)}` : '-'}
                                    </span>
                                    <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                                        <span className={`text-xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {bigValue}
                                        </span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeStyle}`}>
                                            {badgeText}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <p className={`text-[11px] mt-2 truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`} title={subInfo}>
                                {subInfo}
                            </p>
                        </div>
                    );
                })()}

                {/* KPI 4: Lokasi Terbanyak yang Memiliki Laporan */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => topHotspot && setSelectedLocationForModal(topHotspot)}
                    className={`p-4 rounded-2xl border shadow-sm relative overflow-hidden backdrop-blur-md transition-all cursor-pointer group flex flex-col justify-between ${
                        isDark ? 'bg-slate-800/90 border-slate-700/80 hover:border-amber-500/50' : 'bg-white border-slate-200 hover:border-amber-400'
                    }`}
                    title={topHotspot ? (isEn ? `Click for ticket details at ${topHotspot.location}` : `Klik untuk rincian tiket di ${topHotspot.location}`) : undefined}
                >
                    <div>
                        <div className="flex items-center justify-between">
                            <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {isEn ? 'Top Location' : 'Lokasi Terbanyak'}
                            </span>
                            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <MapPin className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-2">
                            <span 
                                title={topHotspot ? topHotspot.location : undefined}
                                className={`text-sm sm:text-base font-bold line-clamp-2 leading-snug block group-hover:underline ${isDark ? 'text-amber-300' : 'text-amber-700'}`}
                            >
                                {topHotspot ? `#1 ${topHotspot.location.replace(/\s*\(GPS:.*$/i, '')}` : '-'}
                            </span>
                            <div className="mt-1 flex items-baseline gap-2">
                                <span className={`text-xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {topHotspot ? `${topHotspot.total} ${isEn ? 'Incidents' : 'Insiden'}` : (isEn ? '0 Incidents' : '0 Insiden')}
                                </span>
                                {topHotspot && (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                        topHotspot.resort === 'TBR'
                                            ? isDark
                                                ? 'bg-amber-950/70 border-amber-800/60 text-amber-300'
                                                : 'bg-amber-100 border-amber-300 text-amber-800'
                                            : isDark
                                            ? 'bg-emerald-950/70 border-emerald-800/60 text-emerald-300'
                                            : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                    }`}>
                                        {topHotspot.resort || 'Resort'}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <p className={`text-[11px] mt-2 truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {topHotspot
                            ? (isEn
                                ? `${topHotspot.openCount} unresolved • ${topHotspot.total - topHotspot.openCount} resolved (Click details)`
                                : `${topHotspot.openCount} belum selesai • ${topHotspot.total - topHotspot.openCount} selesai (Klik rincian)`)
                            : (isEn ? 'No incident data recorded' : 'Belum ada data insiden tercatat')}
                    </p>
                </div>
            </div>

            {stats.withEtaCount > 0 && (
                <div className={`px-4 py-3 rounded-2xl border backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs ${
                    isDark ? 'bg-slate-800/80 border-slate-700/80' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                    <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isDark ? 'bg-sky-500/20 text-sky-400' : 'bg-sky-100 text-sky-700'
                        }`}>
                            <CalendarClock className="w-4 h-4" />
                        </div>
                        <div>
                            <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {isEn ? 'ETA & SLA Punctuality Overview' : 'Ringkasan Target Waktu Selesai (ETA) & SLA'}
                            </span>
                            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {isEn
                                    ? `${stats.withEtaCount} ticket(s) have a target completion time in this period`
                                    : `${stats.withEtaCount} tiket memiliki target waktu selesai pada periode ini`}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {stats.evaluatedSlaCount > 0 && (
                            <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
                                stats.onTimeRate >= 80
                                    ? (isDark ? 'bg-emerald-950/75 border-emerald-700/60 text-emerald-300' : 'bg-emerald-50 border-emerald-300 text-emerald-800')
                                    : (isDark ? 'bg-amber-950/75 border-amber-700/60 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-800')
                            }`}>
                                {isEn
                                    ? `On Time: ${stats.onTimeResolvedCount}/${stats.evaluatedSlaCount} (${stats.onTimeRate}%)`
                                    : `Tepat Waktu: ${stats.onTimeResolvedCount}/${stats.evaluatedSlaCount} (${stats.onTimeRate}%)`}
                            </span>
                        )}
                        <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
                            stats.overdueActiveCount > 0
                                ? (isDark ? 'bg-rose-950/75 border-rose-700/60 text-rose-300' : 'bg-rose-50 border-rose-300 text-rose-700')
                                : (isDark ? 'bg-emerald-950/60 border-emerald-800/50 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700')
                        }`}>
                            {stats.overdueActiveCount > 0
                                ? (isEn ? `Active Overdue: ${stats.overdueActiveCount}` : `Aktif Lewat ETA: ${stats.overdueActiveCount}`)
                                : (isEn ? 'All Active Tickets On Schedule' : 'Semua Tiket Aktif Sesuai ETA')}
                        </span>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* 5. WIDGET MATRIKS DENAH LOKASI TBR DAN TPI                */}
            {/* ========================================================= */}
            <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm space-y-4 backdrop-blur-md transition-all ${
                isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
            }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-700/50">
                    <div>
                        <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            <Compass className="w-4 h-4 text-emerald-400" />
                            {isEn ? 'Telunas Resort Spatial Map Matrix' : 'Matriks Lokasi Denah Resort Telunas'}
                        </h3>
                        <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {isEn
                                ? 'Interactive architectural spatial map for Telunas Private Island (TPI) and Telunas Beach Resort (TBR)'
                                : 'Peta spasial interaktif denah arsitektur Telunas Private Island (TPI) dan Telunas Beach Resort (TBR)'}
                        </p>
                    </div>

                    {/* Resort Map Tab Switcher */}
                    <div className={`flex items-center p-1 rounded-xl border shrink-0 ${
                        isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
                    }`}>
                        <button
                            type="button"
                            onClick={() => setActiveMapTab('tpi')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                activeMapTab === 'tpi'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <span>{isEn ? '🌴 TPI Map (Private Island)' : '🌴 Denah TPI (Private Island)'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveMapTab('tbr')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                activeMapTab === 'tbr'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <span>{isEn ? '🏖️ TBR Map (Beach Resort)' : '🏖️ Denah TBR (Beach Resort)'}</span>
                        </button>
                    </div>
                </div>

                {/* Map Display: TPI */}
                {activeMapTab === 'tpi' && (
                    <div className="space-y-3">
                        <TpiResortMap
                            zones={spatialHotspots.tpiZones}
                            onSelectZone={(zone) => setSelectedTpiZone(prev => prev?.id === zone.id ? null : zone)}
                            selectedZoneId={selectedTpiZone?.id}
                            theme={theme}
                            spotlightTarget={focusMapRequest?.resort === 'TPI' ? focusMapRequest : null}
                        />

                        {/* Zone Inspector TPI */}
                        {selectedTpiZone && (
                            <div className={`p-3.5 rounded-xl border shadow-lg animate-in fade-in duration-200 space-y-2 ${
                                isDark ? 'bg-slate-900 border-emerald-500/40 text-white' : 'bg-emerald-50/70 border-emerald-300 text-slate-900'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-6 h-6 rounded-full font-bold text-xs flex items-center justify-center border ${
                                            isDark
                                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                                : 'bg-emerald-200/60 text-emerald-800 border-emerald-300'
                                        }`}>
                                            #{selectedTpiZone.num}
                                        </span>
                                        <div>
                                            <h4 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                {selectedTpiZone.name}
                                            </h4>
                                            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                                {selectedTpiZone.enName} • Telunas Private Island
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                        (selectedTpiZone.count || 0) > 0
                                            ? isDark
                                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                                : 'bg-rose-100 text-rose-800 border border-rose-300'
                                            : isDark
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    }`}>
                                        {selectedTpiZone.count || 0} {isEn ? 'Active Issues' : 'Isu Aktif'}
                                    </span>
                                </div>

                                {selectedTpiZone.issues?.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                        {selectedTpiZone.issues.map(iss => (
                                            <div
                                                key={iss.id}
                                                onClick={() => onSelectIssue && onSelectIssue(iss)}
                                                className={`p-2 rounded-lg border text-xs space-y-1 cursor-pointer transition-colors ${
                                                    isDark
                                                        ? 'bg-slate-950/70 border-slate-800 hover:border-emerald-500/50'
                                                        : 'bg-white border-emerald-200 shadow-2xs hover:border-emerald-400'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between text-[10px]">
                                                    <span className={`font-mono font-bold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                                                        #{iss.issue_code || iss.id}
                                                    </span>
                                                    <span className={
                                                        iss.status === 'resolved'
                                                            ? isDark ? 'text-emerald-400' : 'text-emerald-700'
                                                            : isDark ? 'text-rose-400' : 'text-rose-600'
                                                    }>
                                                        {getStatusLabel(iss.status)}
                                                    </span>
                                                </div>
                                                <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{iss.title}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className={`text-[11px] italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {isEn ? 'No incidents recorded at this unit.' : 'Tidak ada insiden tercatat pada unit ini.'}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Map Display: TBR */}
                {activeMapTab === 'tbr' && (
                    <div className="space-y-3">
                        <TbrResortMap
                            zones={spatialHotspots.tbrZones}
                            onSelectZone={(zone) => setSelectedTbrZone(prev => prev?.id === zone.id ? null : zone)}
                            selectedZoneId={selectedTbrZone?.id}
                            theme={theme}
                            spotlightTarget={focusMapRequest?.resort === 'TBR' ? focusMapRequest : null}
                        />

                        {/* Zone Inspector TBR */}
                        {selectedTbrZone && (
                            <div className={`p-3.5 rounded-xl border shadow-lg animate-in fade-in duration-200 space-y-2 ${
                                isDark ? 'bg-slate-900 border-amber-500/40 text-white' : 'bg-amber-50/70 border-amber-300 text-slate-900'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-6 h-6 rounded-full font-bold text-xs flex items-center justify-center border ${
                                            isDark
                                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                                                : 'bg-amber-200/60 text-amber-800 border-amber-300'
                                        }`}>
                                            #{selectedTbrZone.num}
                                        </span>
                                        <div>
                                            <h4 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                {selectedTbrZone.name}
                                            </h4>
                                            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                                {selectedTbrZone.enName} • Telunas Beach Resort
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                        (selectedTbrZone.count || 0) > 0
                                            ? isDark
                                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                                : 'bg-rose-100 text-rose-800 border border-rose-300'
                                            : isDark
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    }`}>
                                        {selectedTbrZone.count || 0} {isEn ? 'Active Issues' : 'Isu Aktif'}
                                    </span>
                                </div>

                                {selectedTbrZone.issues?.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                        {selectedTbrZone.issues.map(iss => (
                                            <div
                                                key={iss.id}
                                                onClick={() => onSelectIssue && onSelectIssue(iss)}
                                                className={`p-2 rounded-lg border text-xs space-y-1 cursor-pointer transition-colors ${
                                                    isDark
                                                        ? 'bg-slate-950/70 border-slate-800 hover:border-amber-500/50'
                                                        : 'bg-white border-amber-200 shadow-2xs hover:border-amber-400'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between text-[10px]">
                                                    <span className={`font-mono font-bold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                                                        #{iss.issue_code || iss.id}
                                                    </span>
                                                    <span className={
                                                        iss.status === 'resolved'
                                                            ? isDark ? 'text-emerald-400' : 'text-emerald-700'
                                                            : isDark ? 'text-rose-400' : 'text-rose-600'
                                                    }>
                                                        {getStatusLabel(iss.status)}
                                                    </span>
                                                </div>
                                                <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{iss.title}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className={`text-[11px] italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {isEn ? 'No incidents recorded at this facility.' : 'Tidak ada insiden tercatat pada fasilitas ini.'}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ========================================================= */}
            {/* 6. MODAL DETAIL POPUP KETIKA LOKASI DI-KLIK               */}
            {/* ========================================================= */}
            {selectedLocationForModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className={`w-full max-w-2xl max-h-[85vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}>
                        {/* Modal Header */}
                        <div className={`p-4 border-b flex items-center justify-between gap-3 ${
                            isDark ? 'bg-slate-950/50 border-slate-700/60' : 'bg-slate-50 border-slate-200'
                        }`}>
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                                    <MapPin className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {isEn ? 'Issue List:' : 'Daftar Isu:'} {selectedLocationForModal.location}
                                    </h3>
                                    <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {isEn
                                            ? `Total ${selectedLocationForModal.total} incidents (${selectedLocationForModal.openCount} unresolved)`
                                            : `Total ${selectedLocationForModal.total} insiden (${selectedLocationForModal.openCount} belum selesai)`}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedLocationForModal(null)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                    isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                                }`}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-4 overflow-y-auto space-y-3 flex-1">
                            {selectedLocationForModal.issues.map((iss) => (
                                <div
                                    key={iss.id}
                                    className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                                        isDark ? 'bg-slate-800/80 border-slate-700/80' : 'bg-slate-50 border-slate-200 shadow-2xs'
                                    }`}
                                >
                                    <div className="space-y-1 min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border ${
                                                isDark ? 'text-amber-300 bg-slate-900 border-slate-700' : 'text-amber-800 bg-amber-50 border-amber-300'
                                            }`}>
                                                #{iss.issue_code || iss.id}
                                            </span>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                                iss.status === 'open'
                                                    ? isDark ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' : 'bg-rose-100 border-rose-300 text-rose-800'
                                                    : iss.status === 'in_progress'
                                                    ? isDark ? 'bg-orange-500/20 border-orange-500/40 text-orange-300' : 'bg-amber-100 border-amber-300 text-amber-800'
                                                    : iss.status === 'pending'
                                                    ? isDark ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-orange-100 border-orange-300 text-orange-800'
                                                    : isDark ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                            }`}>
                                                {getStatusLabel(iss.status)}
                                            </span>
                                            <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                Dept: {(iss.target_departments || []).map(formatDeptDisplay).join(', ') || (isEn ? 'General' : 'Umum')}
                                            </span>
                                            {iss.estimated_completion_at && (() => {
                                                const etaBadge = getEtaBadgeInfo(iss, nowMs, isEn);
                                                if (!etaBadge) return null;
                                                return (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                                                        etaBadge.isOverdue
                                                            ? (isDark ? 'bg-rose-950/75 border-rose-600/50 text-rose-300' : 'bg-rose-50 border-rose-300 text-rose-700')
                                                            : etaBadge.isOnTime
                                                            ? (isDark ? 'bg-emerald-950/75 border-emerald-600/50 text-emerald-300' : 'bg-emerald-50 border-emerald-300 text-emerald-700')
                                                            : (isDark ? 'bg-sky-950/75 border-sky-600/50 text-sky-300' : 'bg-sky-50 border-sky-200 text-sky-700')
                                                    }`}>
                                                        <CalendarClock className="w-2.5 h-2.5 shrink-0" />
                                                        <span>{etaBadge.formattedTarget}</span>
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                        <h4 className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {iss.title}
                                        </h4>
                                        {iss.description && (
                                            <p className={`text-[11px] line-clamp-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                                {iss.description}
                                            </p>
                                        )}
                                        {iss.pending_reason && (
                                            <p className={`text-[10px] p-1.5 rounded border ${
                                                isDark ? 'text-amber-300 bg-amber-950/40 border-amber-800/50' : 'text-amber-900 bg-amber-50 border-amber-300'
                                            }`}>
                                                {isEn ? 'Pending Reason:' : 'Alasan Pending:'} {iss.pending_reason}
                                            </p>
                                        )}
                                    </div>

                                    {onSelectIssue && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedLocationForModal(null);
                                                onSelectIssue(iss);
                                            }}
                                            className="shrink-0 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition-all flex items-center gap-1 self-end sm:self-center"
                                        >
                                            <span>{isEn ? 'Details' : 'Rincian'}</span>
                                            <ArrowUpRight className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
