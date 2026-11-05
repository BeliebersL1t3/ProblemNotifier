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
} from 'lucide-react';
import { TPI_MASTERPLAN_ZONES, TBR_MASTERPLAN_ZONES, resolveIssueResortAndZone } from '@/constants/locations';

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

const URGENCY_COLORS = {
    'Darurat': '#f43f5e',   // Rose
    'Tinggi': '#fb923c',    // Orange
    'Sedang': '#facc15',    // Yellow
    'Rendah': '#10b981',    // Emerald
};

// Custom Tooltip for Pareto: shows count, individual share, and cumulative share
const CustomParetoTooltip = ({ active, payload }) => {
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
                        Sekunder
                    </span>
                )}
            </p>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
                        Jumlah Kasus:
                    </span>
                    <span className="font-bold text-white text-sm">{data.count}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Porsi dari Total:</span>
                    <span className="font-semibold text-emerald-300">{data.percentage}%</span>
                </div>
                <div className="flex items-center justify-between text-slate-300 pt-1 border-t border-slate-800">
                    <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                        <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                        Akumulasi Kumulatif:
                    </span>
                    <span className="font-bold text-amber-300">{data.cumulativePercentage}%</span>
                </div>
            </div>
        </div>
    );
};

// Custom Tooltip for Hotspot: filters out urgency levels with 0 count
const CustomHotspotTooltip = ({ active, payload, label }) => {
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
                <p className="text-[11px] text-slate-400">Tidak ada insiden</p>
            )}
            <div className="pt-1.5 mt-1.5 border-t border-slate-800/80 text-[10px] text-sky-400 font-medium">
                💡 Klik balok untuk lihat detail tiket
            </div>
        </div>
    );
};

// Custom Tooltip for Department Workload
const CustomDeptTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const total = payload.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    return (
        <div className="bg-slate-900 border border-slate-700/80 rounded-lg p-2.5 shadow-xl text-xs min-w-[170px]">
            <p className="font-bold text-white mb-1.5 pb-1 border-b border-slate-800">{label || 'Departemen'}</p>
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
                <span>Total Beban:</span>
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
                    {data.speedStatus || 'Standar'}
                </span>
            </p>
            <div className="space-y-1.5 text-slate-300">
                <div className="flex items-center justify-between gap-4">
                    <span>Rata-rata Durasi Selesai:</span>
                    <span className="font-bold text-sky-300">{data.avgHours} Jam</span>
                </div>
                <div className="flex items-center justify-between gap-4 text-slate-400 text-[10px]">
                    <span>Tiket Diselesaikan:</span>
                    <span className="font-semibold text-white">{data.solvedCount}</span>
                </div>
                <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-800 text-[10px]">
                    <span className="text-amber-400">Kasus Pending / Sparepart:</span>
                    <span className="font-bold text-amber-300">{data.pendingCount || 0} Tiket</span>
                </div>
            </div>
        </div>
    );
};

// --- Denah Arsitektural Masterplan TPI (Telunas Private Island) ---
function TpiResortMap({ zones = [], onSelectZone, selectedZoneId, theme = 'dark', spotlightTarget = null }) {
    const isDark = theme === 'dark';
    const [zoom, setZoom] = useState(1);
    const [filterMode, setFilterMode] = useState('all'); // 'all' (22 markers) | 'active' (issues only)
    const [hoveredZone, setHoveredZone] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [activeSpotlight, setActiveSpotlight] = useState(null);
    const [isSpotlightFading, setIsSpotlightFading] = useState(false);
    const scrollContainerRef = useRef(null);
    const modalScrollRef = useRef(null);

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
                        src="/images/maps/tpi_masterplan_v2.png?v=3"
                        alt="Denah Masterplan Telunas Private Island (TPI)"
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
                    {displayedZones.map((zone) => {
                        const count = zone.count || 0;
                        const urgency = zone.highestUrgency;
                        const color = urgency ? (URGENCY_COLORS[urgency] || '#facc15') : '#10b981';
                        const isSelected = selectedZoneId === zone.id;
                        const isHovered = hoveredZone === zone.id;

                        // Clamping koordinat aman agar tidak terpotong separuh di tepi kanvas
                        const safeX = Math.max(3.5, Math.min(96.5, zone.x));
                        const safeY = Math.max(4.5, Math.min(95.5, zone.y));

                        return (
                            <div
                                key={zone.id}
                                onClick={() => onSelectZone && onSelectZone(zone)}
                                onMouseEnter={() => setHoveredZone(zone.id)}
                                onMouseLeave={() => setHoveredZone(null)}
                                className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-150 ${
                                    isSelected ? 'z-40 scale-125' : isHovered ? 'z-30 scale-115' : count > 0 ? 'z-20' : 'z-10'
                                }`}
                                style={{ left: `${safeX}%`, top: `${safeY}%` }}
                            >
                                {/* Micro ping ring for active issues (ringan dan tidak menutupi pulau) */}
                                {count > 0 && !isSelected && (
                                    <span
                                        className="absolute -inset-1 rounded-full animate-ping opacity-60 pointer-events-none"
                                        style={{ backgroundColor: color }}
                                    />
                                )}

                                {/* Compact Pin Marker (~20px Circle) */}
                                <div
                                    className={`relative flex items-center justify-center w-5 h-5 sm:w-5.5 sm:h-5.5 rounded-full transition-all select-none ${
                                        isSelected
                                            ? 'ring-3 ring-sky-400 bg-white text-slate-950 font-black shadow-lg'
                                            : count > 0
                                            ? 'text-white font-extrabold ring-1 ring-white/90 shadow-sm'
                                            : isDark
                                            ? 'bg-slate-900/90 text-slate-200 border border-slate-700/80 hover:bg-slate-800 shadow-2xs'
                                            : 'bg-white/95 text-slate-800 border border-slate-300 shadow-2xs hover:bg-slate-100'
                                    }`}
                                    style={{
                                        backgroundColor: isSelected ? undefined : count > 0 ? color : undefined,
                                    }}
                                >
                                    {/* Number */}
                                    <span className="text-[9px] sm:text-[10px] font-black leading-none">
                                        {zone.num}
                                    </span>

                                    {/* Micro Notification Badge for issue count (Top-Right) */}
                                    {count > 0 && (
                                        <span className="absolute -top-1.5 -right-1.5 min-w-[13px] h-[13px] px-0.5 rounded-full bg-slate-950 text-white border border-white text-[7.5px] font-black flex items-center justify-center shadow-xs">
                                            {count}
                                        </span>
                                    )}
                                </div>

                                {/* Hover / Selected Tooltip Card */}
                                {(isHovered || isSelected) && (
                                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2.5 px-3 py-1.5 rounded-xl bg-slate-950/95 border border-slate-700 shadow-2xl text-[11px] whitespace-nowrap z-50 pointer-events-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                                        <div className="flex items-center gap-1.5 font-bold text-white">
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                            <span>#{zone.num} {zone.name}</span>
                                        </div>
                                        <div className="text-[10px] text-slate-400 flex items-center justify-between gap-3 pt-0.5">
                                            <span>{zone.enName || 'Fasilitas TPI'}</span>
                                            <span className="font-semibold" style={{ color }}>
                                                {count > 0 ? `${count} Isu Aktif (${urgency || 'Sedang'})` : 'Tidak Ada Isu'}
                                            </span>
                                        </div>
                                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-950" />
                                    </div>
                                )}
                            </div>
                        );
                    })}
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
                            title="Filter hanya lokasi dengan isu aktif"
                        >
                            {filterMode === 'active' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            <span>{filterMode === 'active' ? 'Hanya Isu Aktif' : 'Semua 22 Titik'}</span>
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
                                title="Paskan 100% Lebar Layar"
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
                                title="Zoom 1.5x HD (Teks tajam terbaca)"
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
                                title="Zoom 2x Ultra Detail"
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
                            title="Perbesar Denah"
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
                            title="Perkecil Denah"
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
                            title="Buka Denah di Layar Penuh"
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Layar Penuh</span>
                        </button>
                    </div>
                </div>

                {/* Blueprint Map Container - Smooth Touch Scroll & Pan */}
                <div
                    ref={scrollContainerRef}
                    className={`relative w-full bg-[#fbf9f4] overscroll-contain transition-all ${
                        zoom > 1
                            ? 'overflow-auto touch-pan-x touch-pan-y max-h-[550px] sm:max-h-[650px]'
                            : 'overflow-hidden max-h-none'
                    }`}
                >
                    {renderMapCanvas(false)}
                </div>

                {/* Bottom Bar Info Legend */}
                <div className={`px-4 py-2.5 border-t flex flex-wrap items-center justify-between text-xs gap-2 ${
                    isDark ? 'bg-slate-900/95 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
                }`}>
                    <div className="flex items-center gap-2">
                        <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Denah Spasial Resmi Pulau Telunas</span>
                        <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>• 22 Titik Fasilitas Terpetakan</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Kritis (Darurat / Tinggi)
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-400" /> Sedang
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Normal / Rendah
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-slate-600' : 'bg-slate-400'}`} /> Tidak Ada Isu
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
                                    Denah Resmi Pulau Telunas (TPI) - Mode Layar Penuh HD
                                </h3>
                                <p className="text-[10px] text-slate-400">
                                    Geser / pan denah untuk melihat fasilitas • Klik pin untuk filter isu
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
                                title="Perbesar"
                            >
                                <ZoomIn className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={handleZoomOut}
                                disabled={zoom <= 1}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                                title="Perkecil"
                            >
                                <ZoomOut className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsFullscreen(false)}
                                className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 cursor-pointer ml-1"
                                title="Tutup Layar Penuh"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Modal Scrollable Body - Anti Left Clipping */}
                    <div
                        ref={modalScrollRef}
                        className="flex-1 overflow-auto touch-pan-x touch-pan-y relative mt-2 rounded-xl bg-[#fbf9f4] border border-slate-800"
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
    const isDark = theme === 'dark';
    const [zoom, setZoom] = useState(0.65); // Default 0.65x compact for square TBR layout
    const [filterMode, setFilterMode] = useState('all'); // 'all' (all facilities) | 'active' (issues only)
    const [hoveredZone, setHoveredZone] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [activeSpotlight, setActiveSpotlight] = useState(null);
    const [isSpotlightFading, setIsSpotlightFading] = useState(false);
    const scrollContainerRef = useRef(null);
    const modalScrollRef = useRef(null);

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
                        alt="Denah Arsitektural Telunas Beach Resort (TBR)"
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
                    {displayedZones.map((zone) => {
                        const count = zone.count || 0;
                        const urgency = zone.highestUrgency;
                        const color = urgency ? (URGENCY_COLORS[urgency] || '#facc15') : '#10b981';
                        const isSelected = selectedZoneId === zone.id;
                        const isHovered = hoveredZone === zone.id;

                        // Clamping koordinat aman agar tidak terpotong separuh di tepi kanvas
                        const safeX = Math.max(3.5, Math.min(96.5, zone.x));
                        const safeY = Math.max(4.5, Math.min(95.5, zone.y));

                        return (
                            <div
                                key={zone.id}
                                onClick={() => onSelectZone && onSelectZone(zone)}
                                onMouseEnter={() => setHoveredZone(zone.id)}
                                onMouseLeave={() => setHoveredZone(null)}
                                className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-150 ${
                                    isSelected ? 'z-40 scale-125' : isHovered ? 'z-30 scale-115' : count > 0 ? 'z-20' : 'z-10'
                                }`}
                                style={{ left: `${safeX}%`, top: `${safeY}%` }}
                            >
                                {/* Micro ping ring for active issues (ringan dan tidak menutupi pulau) */}
                                {count > 0 && !isSelected && (
                                    <span
                                        className="absolute -inset-1 rounded-full animate-ping opacity-60 pointer-events-none"
                                        style={{ backgroundColor: color }}
                                    />
                                )}

                                {/* Compact Pin Marker (~20px Circle) */}
                                <div
                                    className={`relative flex items-center justify-center w-5 h-5 sm:w-5.5 sm:h-5.5 rounded-full transition-all select-none ${
                                        isSelected
                                            ? 'ring-3 ring-amber-400 bg-white text-slate-950 font-black shadow-lg'
                                            : count > 0
                                            ? 'text-white font-extrabold ring-1 ring-white/90 shadow-sm'
                                            : isDark
                                            ? 'bg-slate-900/90 text-slate-200 border border-slate-700/80 hover:bg-slate-800 shadow-2xs'
                                            : 'bg-white/95 text-slate-800 border border-slate-300 shadow-2xs hover:bg-slate-100'
                                    }`}
                                    style={{
                                        backgroundColor: isSelected ? undefined : count > 0 ? color : undefined,
                                    }}
                                >
                                    {/* Number */}
                                    <span className="text-[9px] sm:text-[10px] font-black leading-none">
                                        {zone.num}
                                    </span>

                                    {/* Micro Notification Badge for issue count (Top-Right) */}
                                    {count > 0 && (
                                        <span className="absolute -top-1.5 -right-1.5 min-w-[13px] h-[13px] px-0.5 rounded-full bg-slate-950 text-white border border-white text-[7.5px] font-black flex items-center justify-center shadow-xs">
                                            {count}
                                        </span>
                                    )}
                                </div>

                                {/* Tooltip Card on Hover / Select */}
                                {(isHovered || isSelected) && (
                                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2.5 px-3 py-1.5 rounded-xl bg-slate-950/95 border border-slate-700 shadow-2xl text-[11px] whitespace-nowrap z-50 pointer-events-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                                        <div className="flex items-center gap-1.5 font-bold text-white">
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                            <span>#{zone.num} {zone.name}</span>
                                        </div>
                                        <div className="text-[10px] text-slate-400 flex items-center justify-between gap-3 pt-0.5">
                                            <span>{zone.enName || 'Fasilitas TBR'}</span>
                                            <span className="font-semibold" style={{ color }}>
                                                {count > 0 ? `${count} Isu Aktif (${urgency || 'Sedang'})` : 'Tidak Ada Isu'}
                                            </span>
                                        </div>
                                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-950" />
                                    </div>
                                )}
                            </div>
                        );
                    })}
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
                            title="Filter hanya lokasi dengan isu aktif"
                        >
                            {filterMode === 'active' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            <span>{filterMode === 'active' ? 'Hanya Isu Aktif' : 'Semua Fasilitas'}</span>
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
                                title="Tampilan Kompak Pas Layar"
                            >
                                0.6x Kompak
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetZoomPreset(1)}
                                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                    zoom === 1
                                        ? 'bg-amber-500 text-slate-950 shadow-2xs font-extrabold'
                                        : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                                }`}
                                title="Ukuran 1x Standar"
                            >
                                1x Standar
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetZoomPreset(1.5)}
                                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-0.5 ${
                                    zoom === 1.5
                                        ? 'bg-amber-500 text-slate-950 shadow-2xs font-extrabold'
                                        : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                                }`}
                                title="Zoom 1.5x HD (Teks tajam terbaca)"
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
                            title="Perbesar Denah"
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
                            title="Perkecil Denah"
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
                            title="Buka Denah di Layar Penuh"
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Layar Penuh</span>
                        </button>
                    </div>
                </div>

                {/* Clean CAD Architectural Blueprint Container - Smooth Touch Scroll & Pan */}
                <div
                    ref={scrollContainerRef}
                    className="relative w-full bg-slate-100 overscroll-contain transition-all overflow-auto touch-pan-x touch-pan-y max-h-[500px] sm:max-h-[560px] flex justify-center"
                >
                    {renderMapCanvas(false)}
                </div>

                {/* Bottom Bar Info Legend */}
                <div className={`px-4 py-2.5 border-t flex flex-wrap items-center justify-between text-xs gap-2 ${
                    isDark ? 'bg-slate-900/95 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
                }`}>
                    <div className="flex items-center gap-2">
                        <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Denah Arsitektural Telunas Beach Resort (TBR)</span>
                        <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>• Fasilitas Vila Terapung & Titian</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Kritis (Darurat / Tinggi)
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-400" /> Sedang
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Normal / Rendah
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-slate-600' : 'bg-slate-400'}`} /> Tidak Ada Isu
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
                                    Denah Resmi Telunas Beach Resort (TBR) - Mode Layar Penuh HD
                                </h3>
                                <p className="text-[10px] text-slate-400">
                                    Geser / pan denah untuk melihat fasilitas • Klik pin untuk filter isu
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
                                title="Perbesar"
                            >
                                <ZoomIn className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={handleZoomOut}
                                disabled={zoom <= 1}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                                title="Perkecil"
                            >
                                <ZoomOut className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsFullscreen(false)}
                                className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 cursor-pointer ml-1"
                                title="Tutup Layar Penuh"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Modal Scrollable Body - Anti Left Clipping */}
                    <div
                        ref={modalScrollRef}
                        className="flex-1 overflow-auto touch-pan-x touch-pan-y relative mt-2 rounded-xl bg-slate-100 border border-slate-800"
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
    timeLabel = 'Semua Bulan',
    deptTargetData = [],
    hotspotList = [],
}) {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Header Band Telunas
    doc.setFillColor(15, 23, 42); // Slate-900
    doc.rect(0, 0, pageWidth, 28, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('TELUNAS RESORTS - LAPORAN OPERASIONAL ISU', 14, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(203, 213, 225); // Slate-300
    doc.text('Rekapitulasi Tiket & Analisis Lapangan (Pure WhatsApp Bot Input)', 14, 18);

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // Slate-400
    const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    doc.text(`Waktu Cetak: ${nowStr} WIB | Filter Periode: ${timeLabel}`, 14, 24);

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
    doc.text('TOTAL TIKET', 18, boxY + 6);
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
    doc.text('TIKET SELESAI', 18 + boxWidth + 4, boxY + 6);
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
    doc.text('BELUM SELESAI (BACKLOG)', 18 + (boxWidth + 4) * 2, boxY + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(225, 29, 72);
    doc.text(`${stats.activeCount || 0} (${stats.activeRatio || 0}%)`, 18 + (boxWidth + 4) * 2, boxY + 14);

    let startY = 55;

    // 3. Table: Sebaran Beban per Departemen
    const deptRows = deptTargetData.map((d, idx) => [
        idx + 1,
        d.name,
        d.total,
        d.resolved,
        d.active,
        `${d.backlogRate}%`,
    ]);

    autoTable(doc, {
        startY: startY,
        head: [['#', 'Departemen Dituju', 'Total Isu', 'Selesai', 'Belum Selesai', 'Rasio Backlog']],
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
        h.location,
        h.resort || '-',
        h.total,
        h.openCount,
        h.openCount > 0 ? 'Perlu Pengerjaan' : 'Tuntas',
    ]);

    autoTable(doc, {
        startY: startY,
        head: [['#', 'Lokasi / Unit', 'Resort', 'Total Insiden', 'Isu Belum Selesai', 'Status Area']],
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
            (i.target_departments || []).join(', ') || 'Umum',
            i.title || '-',
            i.reporter_name || '-',
            i.status === 'open' ? 'Open' : (i.status === 'pending' ? 'Tertunda' : 'Progress'),
            i.pending_reason || '-',
        ]);

        autoTable(doc, {
            startY: startY,
            head: [['Kode', 'Lokasi', 'Dept Dituju', 'Judul Masalah', 'Pelapor', 'Status', 'Catatan Pending']],
            body: activeRows,
            theme: 'grid',
            headStyles: { fillColor: [190, 18, 60], fontSize: 8, fontStyle: 'bold' },
            bodyStyles: { fontSize: 7.5 },
            columnStyles: {
                0: { cellWidth: 24, fontStyle: 'bold' },
                1: { cellWidth: 25 },
                2: { cellWidth: 25 },
                3: { cellWidth: 45 },
                4: { cellWidth: 20 },
                5: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
                6: { cellWidth: 'auto' },
            },
            margin: { left: 14, right: 14 },
        });
    }

    doc.save(`Laporan_Analisis_Telunas_${new Date().toISOString().slice(0, 10)}.pdf`);
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
    spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/1O-jrcWtVAr3IObd8D2Bo6ygg4ppCghbo_6vQCjD2DUA/edit',
}) {
    const isDark = theme === 'dark';

    // 1. Time / Month Filter
    const [timeRange, setTimeRange] = useState('all');
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

    // Preload resort maps
    useEffect(() => {
        ['/images/maps/tpi_masterplan_v2.png?v=3', '/images/maps/tbr_masterplan.png'].forEach((src) => {
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

        return {
            total,
            resolved,
            openCount,
            inProgressCount,
            pendingCount,
            activeCount,
            resolutionRate,
            activeRatio,
        };
    }, [filteredIssues]);

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
            tpiZones[z.id] = { ...z, count: 0, total: 0, issues: [], highestUrgency: null };
        });

        TBR_MASTERPLAN_ZONES.forEach((z) => {
            tbrZones[z.id] = { ...z, count: 0, total: 0, issues: [], highestUrgency: null };
        });

        filteredIssues.forEach((issue) => {
            const { resort, zoneId } = resolveIssueResortAndZone(issue);
            if (!resort || resort === 'OFFICE' || !zoneId) return;

            const targetMap = resort === 'TBR' ? tbrZones : tpiZones;
            if (targetMap[zoneId]) {
                const zone = targetMap[zoneId];
                zone.total += 1;
                zone.issues.push(issue);
                if (issue.status !== 'resolved') {
                    zone.count += 1;
                }
                // Urgency / status color
                if (zone.issues.some((i) => i.status === 'open')) {
                    zone.highestUrgency = 'Darurat';
                } else if (zone.issues.some((i) => i.status === 'pending')) {
                    zone.highestUrgency = 'Sedang';
                }
            }
        });

        return {
            tpiZones: Object.values(tpiZones),
            tbrZones: Object.values(tbrZones),
        };
    }, [filteredIssues]);

    // Handle Download PDF
    const handleDownloadPdf = () => {
        setIsDownloadingPdf(true);
        try {
            const timeLabels = {
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
            });
        } catch (err) {
            console.error('Error generating PDF:', err);
            alert('Gagal membuat PDF: ' + err.message);
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
                            Periode Laporan:
                        </span>
                        <select
                            value={timeRange}
                            onChange={(e) => setTimeRange(e.target.value)}
                            className={`text-xs font-semibold rounded-xl px-3 py-2 border shadow-sm cursor-pointer transition-all focus:ring-1 focus:ring-emerald-500 ${
                                isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                            }`}
                        >
                            <option value="all">📅 Semua Bulan (Semua Tab)</option>
                            <option value="today">⚡ Hari Ini</option>
                            <option value="7d">🕒 7 Hari Terakhir</option>
                            <option value="30d">🗓️ 30 Hari Terakhir</option>
                            <optgroup label="Tab Bulanan Spreadsheet">
                                <option value="month_1">Bulan 01 - Januari</option>
                                <option value="month_2">Bulan 02 - Februari</option>
                                <option value="month_3">Bulan 03 - Maret</option>
                                <option value="month_4">Bulan 04 - April</option>
                                <option value="month_5">Bulan 05 - Mei</option>
                                <option value="month_6">Bulan 06 - Juni</option>
                                <option value="month_7">Bulan 07 - Juli</option>
                                <option value="month_8">Bulan 08 - Agustus</option>
                                <option value="month_9">Bulan 09 - September</option>
                                <option value="month_10">Bulan 10 - Oktober</option>
                                <option value="month_11">Bulan 11 - November</option>
                                <option value="month_12">Bulan 12 - Desember</option>
                            </optgroup>
                        </select>
                    </div>

                    {/* Quick Actions Bar: Ke Sheet Utama & Download PDF */}
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        {/* Tombol Ke Sheet Utama */}
                        <a
                            href={spreadsheetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer group"
                            title="Buka Google Spreadsheet Sheet Utama Telunas di tab baru"
                        >
                            <FileSpreadsheet className="w-4 h-4 shrink-0" />
                            <span>Ke Sheet Utama</span>
                            <ExternalLink className="w-3.5 h-3.5 opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </a>

                        {/* Tombol Download PDF */}
                        <button
                            type="button"
                            onClick={handleDownloadPdf}
                            disabled={isDownloadingPdf}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition-all cursor-pointer disabled:opacity-50"
                            title="Download Laporan Rekapitulasi Resmi Telunas (PDF Siap Cetak)"
                        >
                            <Download className="w-4 h-4 shrink-0" />
                            <span>{isDownloadingPdf ? 'Menyiapkan PDF...' : 'Download PDF'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ========================================================= */}
            {/* 2. CORE KPI METRICS (TOTAL TIKET & BELUM SELESAI / BACKLOG)*/}
            {/* ========================================================= */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {/* KPI 1: Total Tiket */}
                <div className={`p-4 rounded-2xl border shadow-sm relative overflow-hidden backdrop-blur-md transition-all ${
                    isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
                }`}>
                    <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Total Tiket Masuk
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <Layers className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {stats.total}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            isDark ? 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                        }`}>
                            {stats.resolutionRate}% Selesai
                        </span>
                    </div>
                    <p className={`text-[11px] mt-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {stats.resolved} dari {stats.total} tiket telah dituntaskan oleh tim lapangan
                    </p>
                </div>

                {/* KPI 2: Tiket Belum Selesai (Backlog) */}
                <div className={`p-4 rounded-2xl border shadow-sm relative overflow-hidden backdrop-blur-md transition-all ${
                    isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
                }`}>
                    <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Tiket Belum Selesai (Backlog)
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                            <Clock className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className={`text-2xl font-black ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>
                            {stats.activeCount}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            isDark ? 'bg-rose-950/80 border-rose-800/60 text-rose-300' : 'bg-rose-100 border-rose-300 text-rose-800'
                        }`}>
                            {stats.activeRatio}% Backlog
                        </span>
                    </div>
                    <p className={`text-[11px] mt-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Open: <strong className="text-rose-400">{stats.openCount}</strong> • Progress: <strong className="text-sky-400">{stats.inProgressCount}</strong> • Tertunda: <strong className="text-amber-400">{stats.pendingCount}</strong>
                    </p>
                </div>

                {/* KPI 3: Hotspot Utama #1 */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => topHotspot && setSelectedLocationForModal(topHotspot)}
                    className={`p-4 rounded-2xl border shadow-sm relative overflow-hidden backdrop-blur-md transition-all cursor-pointer group ${
                        isDark ? 'bg-slate-800/90 border-slate-700/80 hover:border-amber-500/50' : 'bg-white border-slate-200 hover:border-amber-400'
                    }`}
                    title={topHotspot ? `Klik untuk rincian tiket di ${topHotspot.location}` : undefined}
                >
                    <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Titik Hotspot Utama (#1)
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Flame className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-2">
                        <span className={`text-base font-bold truncate block group-hover:underline ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                            {topHotspot ? topHotspot.location : '-'}
                        </span>
                    </div>
                    <p className={`text-[11px] mt-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {topHotspot
                            ? `${topHotspot.total} insiden (${topHotspot.openCount} belum selesai)`
                            : 'Belum ada data insiden tercatat'}
                    </p>
                </div>
            </div>

            {/* ========================================================= */}
            {/* 3. WIDGET DEPARTEMEN TERBANYAK (CUSTOMIZABLE 3 MODES)      */}
            {/* ========================================================= */}
            <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm space-y-4 backdrop-blur-md transition-all ${
                isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
            }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-700/50">
                    <div>
                        <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            <Building2 className="w-4 h-4 text-sky-400" />
                            Analisis Departemen Terbanyak
                        </h3>
                        <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Kustomisasi tampilan metrik departemen: beban tugas masuk, aktivitas pelapor, atau rasio backlog
                        </p>
                    </div>

                    {/* 3-Mode Customizable Pills */}
                    <div className={`flex items-center p-1 rounded-xl border shrink-0 overflow-x-auto ${
                        isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
                    }`}>
                        <button
                            type="button"
                            onClick={() => setDeptMode('target_issues')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                deptMode === 'target_issues'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                            }`}
                            title="Departemen yang menerima tugas laporan terbanyak"
                        >
                            <span>📋 Isu Terbanyak</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setDeptMode('reporters')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                deptMode === 'reporters'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                            }`}
                            title="Departemen asal pelapor yang paling aktif melapor"
                        >
                            <span>🙋‍♂️ Pelapor Terbanyak</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setDeptMode('backlog_ratio')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                deptMode === 'backlog_ratio'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                            }`}
                            title="Rasio perbandingan tiket belum selesai terhadap total tiket per departemen"
                        >
                            <span>⏳ Belum Selesai / Total</span>
                        </button>
                    </div>
                </div>

                {/* Display Content Based on Selected Dept Mode */}
                {deptMode === 'target_issues' && (
                    <div className="space-y-2.5">
                        <div className="text-xs text-slate-400 mb-2 font-medium">
                            Menampilkan departemen dengan beban penugasan terbanyak dari laporan WhatsApp:
                        </div>
                        {deptMetrics.targetList.length === 0 ? (
                            <p className="text-xs text-slate-500 py-6 text-center">Belum ada data laporan pada periode ini.</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                {deptMetrics.targetList.map((d, idx) => (
                                    <div
                                        key={d.name}
                                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                                            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                                                isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-700'
                                            }`}>
                                                #{idx + 1}
                                            </span>
                                            <div className="min-w-0">
                                                <h4 className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                    {d.name}
                                                </h4>
                                                <div className={`w-24 sm:w-36 h-1.5 rounded-full overflow-hidden mt-1.5 ${
                                                    isDark ? 'bg-slate-800' : 'bg-slate-200'
                                                }`}>
                                                    <div
                                                        className="h-full bg-sky-500 rounded-full"
                                                        style={{ width: `${d.pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className={`text-xs font-black ${isDark ? 'text-sky-300' : 'text-sky-700'}`}>
                                                {d.total} Isu
                                            </span>
                                            <span className="text-[10px] text-slate-400 block">
                                                {d.pct}% dari total
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {deptMode === 'reporters' && (
                    <div className="space-y-2.5">
                        <div className="text-xs text-slate-400 mb-2 font-medium">
                            Menampilkan departemen asal staf yang paling sering dan proaktif mengirim laporan:
                        </div>
                        {deptMetrics.reporterList.length === 0 ? (
                            <p className="text-xs text-slate-500 py-6 text-center">Belum ada data pelapor pada periode ini.</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                {deptMetrics.reporterList.map((d, idx) => (
                                    <div
                                        key={d.name}
                                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                                            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                                                isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-700'
                                            }`}>
                                                #{idx + 1}
                                            </span>
                                            <div className="min-w-0">
                                                <h4 className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                    {d.name}
                                                </h4>
                                                <div className={`w-24 sm:w-36 h-1.5 rounded-full overflow-hidden mt-1.5 ${
                                                    isDark ? 'bg-slate-800' : 'bg-slate-200'
                                                }`}>
                                                    <div
                                                        className="h-full bg-emerald-500 rounded-full"
                                                        style={{ width: `${d.pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className={`text-xs font-black ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                                {d.total} Laporan
                                            </span>
                                            <span className="text-[10px] text-slate-400 block">
                                                {d.pct}% kontribusi
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {deptMode === 'backlog_ratio' && (
                    <div className="space-y-2.5">
                        <div className="text-xs text-slate-400 mb-2 font-medium">
                            Menampilkan rasio tiket belum selesai terhadap total tiket per departemen:
                        </div>
                        {deptMetrics.backlogList.length === 0 ? (
                            <p className="text-xs text-slate-500 py-6 text-center">Belum ada data backlog pada periode ini.</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                {deptMetrics.backlogList.map((d, idx) => (
                                    <div
                                        key={d.name}
                                        className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                                            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                                                    isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-700'
                                                }`}>
                                                    #{idx + 1}
                                                </span>
                                                <h4 className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                    {d.name}
                                                </h4>
                                            </div>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                                d.active > 0
                                                    ? isDark
                                                        ? 'bg-rose-950/80 border-rose-800/60 text-rose-300'
                                                        : 'bg-rose-100 border-rose-300 text-rose-800'
                                                    : isDark
                                                    ? 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300'
                                                    : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                            }`}>
                                                {d.backlogRate}% Backlog
                                            </span>
                                        </div>

                                        {/* Dual Progress Bar: Green (Resolved) vs Red (Active) */}
                                        <div className={`w-full h-2 rounded-full overflow-hidden flex ${
                                            isDark ? 'bg-slate-800' : 'bg-slate-200'
                                        }`}>
                                            <div
                                                className="h-full bg-emerald-500"
                                                style={{ width: `${100 - d.backlogRate}%` }}
                                                title={`${d.resolved} Selesai`}
                                            />
                                            <div
                                                className="h-full bg-rose-500"
                                                style={{ width: `${d.backlogRate}%` }}
                                                title={`${d.active} Belum Selesai`}
                                            />
                                        </div>

                                        <div className={`flex items-center justify-between text-[11px] ${
                                            isDark ? 'text-slate-400' : 'text-slate-600'
                                        }`}>
                                            <span>
                                                Belum Selesai: <strong className={isDark ? 'text-rose-400' : 'text-rose-600'}>{d.active}</strong>
                                            </span>
                                            <span>
                                                Selesai: <strong className={isDark ? 'text-emerald-400' : 'text-emerald-700'}>{d.resolved}</strong> / {d.total} Isu
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ========================================================= */}
            {/* 4. WIDGET LOKASI TERBANYAK YANG MEMILIKI LAPORAN          */}
            {/* ========================================================= */}
            <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm space-y-4 backdrop-blur-md transition-all ${
                isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
            }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-700/50">
                    <div>
                        <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            <MapPin className="w-4 h-4 text-rose-400" />
                            Lokasi Terbanyak yang Memiliki Laporan
                        </h3>
                        <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Leaderboard area / villa Telunas dengan insiden tertinggi (Klik lokasi untuk melihat daftar isu)
                        </p>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400 self-start sm:self-auto">
                        Top {Math.min(hotspotList.length, 10)} Area
                    </span>
                </div>

                {hotspotList.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">Belum ada data insiden pada lokasi mana pun.</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {hotspotList.slice(0, 9).map((item, idx) => (
                            <div
                                key={item.location}
                                onClick={() => setSelectedLocationForModal(item)}
                                className={`p-3.5 rounded-xl border transition-all cursor-pointer group flex flex-col justify-between ${
                                    isDark
                                        ? 'bg-slate-900/80 border-slate-800 hover:border-sky-500/60 hover:bg-slate-900'
                                        : 'bg-slate-50 border-slate-200 hover:border-sky-400 hover:bg-white shadow-xs'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                                            isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-700'
                                        }`}>
                                            #{idx + 1}
                                        </span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                            item.resort === 'TBR'
                                                ? isDark
                                                    ? 'bg-amber-950/70 border-amber-800/60 text-amber-300'
                                                    : 'bg-amber-100 border-amber-300 text-amber-800'
                                                : isDark
                                                ? 'bg-emerald-950/70 border-emerald-800/60 text-emerald-300'
                                                : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                        }`}>
                                            {item.resort || 'Resort'}
                                        </span>
                                    </div>
                                    <h4 className={`text-xs font-bold group-hover:text-sky-400 transition-colors truncate ${
                                        isDark ? 'text-white' : 'text-slate-900'
                                    }`}>
                                        {item.location}
                                    </h4>
                                </div>

                                <div className={`mt-3 pt-2.5 border-t flex items-center justify-between text-[11px] ${
                                    isDark ? 'border-slate-800/70' : 'border-slate-200'
                                }`}>
                                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                                        Total: <strong className={isDark ? 'text-white' : 'text-slate-900'}>{item.total}</strong>
                                    </span>
                                    <span className={`font-bold ${
                                        item.openCount > 0
                                            ? isDark ? 'text-rose-400' : 'text-rose-600'
                                            : isDark ? 'text-emerald-400' : 'text-emerald-700'
                                    }`}>
                                        {item.openCount > 0 ? `${item.openCount} Belum Selesai` : 'Semua Selesai'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

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
                            Matriks Lokasi Denah Resort Telunas
                        </h3>
                        <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Peta spasial interaktif denah arsitektur Telunas Private Island (TPI) dan Telunas Beach Resort (TBR)
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
                            <span>🌴 Denah TPI (Private Island)</span>
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
                            <span>🏖️ Denah TBR (Beach Resort)</span>
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
                                        {selectedTpiZone.count || 0} Isu Aktif
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
                                                        {iss.status}
                                                    </span>
                                                </div>
                                                <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{iss.title}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className={`text-[11px] italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Tidak ada insiden tercatat pada unit ini.</p>
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
                                        {selectedTbrZone.count || 0} Isu Aktif
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
                                                        {iss.status}
                                                    </span>
                                                </div>
                                                <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{iss.title}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className={`text-[11px] italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Tidak ada insiden tercatat pada fasilitas ini.</p>
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
                                        Daftar Isu: {selectedLocationForModal.location}
                                    </h3>
                                    <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        Total {selectedLocationForModal.total} insiden ({selectedLocationForModal.openCount} belum selesai)
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
                                                {iss.status}
                                            </span>
                                            <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                Dept: {(iss.target_departments || []).join(', ') || 'Umum'}
                                            </span>
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
                                                Alasan Pending: {iss.pending_reason}
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
                                            <span>Rincian</span>
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
