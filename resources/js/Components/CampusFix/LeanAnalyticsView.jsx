import React, { useMemo, useState, useEffect, useCallback } from 'react';
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
    Ticket,
} from 'lucide-react';
import { TPI_MASTERPLAN_ZONES, TBR_MASTERPLAN_ZONES } from '@/constants/locations';

const CATEGORY_COLORS = {
    'HVAC & Pendingin': '#38bdf8', // Sky
    'Kelistrikan': '#fbbf24',      // Amber
    'Plumbing & Air': '#34d399',     // Emerald
    'Struktur & Bangunan': '#f97316',// Orange
    'Jaringan & IT': '#818cf8',      // Indigo
    'Housekeeping & Linen': '#ec4899',// Pink
    'Fasilitas Umum': '#a78bfa',    // Purple
    'Lain-lain': '#94a3b8',         // Slate
};

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
function TpiResortMap({ zones = [], onSelectZone, selectedZoneId, theme = 'dark' }) {
    const isDark = theme === 'dark';
    const [zoom, setZoom] = useState(1);
    const [filterMode, setFilterMode] = useState('all'); // 'all' (22 markers) | 'active' (issues only)
    const [hoveredZone, setHoveredZone] = useState(null);

    const handleZoomIn = () => setZoom((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 2.5));
    const handleZoomOut = () => setZoom((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 1));
    const handleResetZoom = () => setZoom(1);

    const displayedZones = filterMode === 'active' ? zones.filter(z => (z.count || 0) > 0) : zones;

    return (
        <div className="space-y-3">
            {/* Map Canvas with Controls HUD */}
            <div className={`relative w-full rounded-2xl overflow-hidden border shadow-xl select-none group ${
                isDark ? 'bg-slate-950 border-slate-700/80' : 'bg-slate-100 border-slate-300 shadow-md'
            }`}>
                {/* HUD Toolbar */}
                <div className={`absolute top-3 right-3 z-30 flex items-center gap-1.5 p-1.5 rounded-xl border backdrop-blur-md shadow-lg ${
                    isDark ? 'bg-slate-900/90 border-slate-700/80 text-slate-300' : 'bg-white/95 border-slate-300 text-slate-800 shadow-sm'
                }`}>
                    <button
                        type="button"
                        onClick={() => setFilterMode(prev => prev === 'all' ? 'active' : 'all')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                            filterMode === 'active'
                                ? isDark ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-amber-100 text-amber-800 border border-amber-300'
                                : isDark ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                        title="Filter hanya lokasi dengan isu aktif"
                    >
                        {filterMode === 'active' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        <span>{filterMode === 'active' ? 'Hanya Isu Aktif' : 'Semua 22 Titik'}</span>
                    </button>
                    <div className={`h-4 w-px mx-0.5 ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
                    <button
                        type="button"
                        onClick={handleZoomIn}
                        disabled={zoom >= 2.5}
                        className={`p-1.5 rounded-lg disabled:opacity-40 transition-colors ${
                            isDark ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                        title="Perbesar Denah"
                    >
                        <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={handleZoomOut}
                        disabled={zoom <= 1}
                        className={`p-1.5 rounded-lg disabled:opacity-40 transition-colors ${
                            isDark ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                        title="Perkecil Denah"
                    >
                        <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    {zoom > 1 && (
                        <button
                            type="button"
                            onClick={handleResetZoom}
                            className="px-2 py-1 rounded-lg text-[10px] font-semibold text-sky-400 hover:bg-sky-500/10 transition-colors"
                            title="Reset Zoom ke 100%"
                        >
                            Reset ({Math.round(zoom * 100)}%)
                        </button>
                    )}
                </div>

                {/* Blueprint Map Container - Fixed & Immobile on Page Scroll */}
                <div className={`relative w-full bg-[#fbf9f4] transition-all ${
                    zoom > 1 ? 'overflow-auto max-h-[700px] overscroll-contain' : 'overflow-hidden'
                }`}>
                    <div
                        className="relative w-full origin-top-left transition-transform duration-200"
                        style={{
                            transform: `scale(${zoom})`,
                            width: zoom > 1 ? `${zoom * 100}%` : '100%',
                        }}
                    >
                        {/* High-Resolution Masterplan Drawing */}
                        <img
                            src="/images/maps/tpi_masterplan_v2.png"
                            alt="Denah Masterplan Telunas Private Island (TPI)"
                            className="w-full h-auto block select-none pointer-events-none"
                            loading="eager"
                        />

                        {/* Interactive Specific Location Pins */}
                        {displayedZones.map((zone) => {
                            const count = zone.count || 0;
                            const urgency = zone.highestUrgency;
                            const color = urgency ? (URGENCY_COLORS[urgency] || '#facc15') : '#10b981';
                            const isSelected = selectedZoneId === zone.id;
                            const isHovered = hoveredZone === zone.id;

                            return (
                                <div
                                    key={zone.id}
                                    onClick={() => onSelectZone && onSelectZone(zone)}
                                    onMouseEnter={() => setHoveredZone(zone.id)}
                                    onMouseLeave={() => setHoveredZone(null)}
                                    className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-200 z-10 ${
                                        isSelected ? 'z-30 scale-125' : isHovered ? 'z-20 scale-115' : ''
                                    }`}
                                    style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
                                >
                                    {/* Urgency Pulse Ring if issues exist */}
                                    {count > 0 && (
                                        <span
                                            className="absolute -inset-2 rounded-full animate-ping opacity-75 pointer-events-none"
                                            style={{ backgroundColor: color }}
                                        />
                                    )}

                                    {/* Pin Badge Marker */}
                                    <div
                                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full shadow-xl border text-[10px] font-bold backdrop-blur-md transition-all ${
                                            count > 0
                                                ? 'bg-slate-950/95 text-white ring-2'
                                                : 'bg-slate-900/85 text-slate-200 hover:bg-slate-900 hover:text-white'
                                        } ${
                                            isSelected
                                                ? 'ring-4 ring-sky-400 border-white shadow-sky-500/50'
                                                : count > 0
                                                ? 'border-transparent'
                                                : 'border-slate-600/70'
                                        }`}
                                        style={{
                                            boxShadow: count > 0 ? `0 0 14px ${color}90` : undefined,
                                            ringColor: count > 0 ? color : undefined,
                                        }}
                                    >
                                        <span
                                            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-black ${
                                                count > 0 ? 'text-black' : 'text-white bg-slate-700'
                                            }`}
                                            style={{ backgroundColor: count > 0 ? color : undefined }}
                                        >
                                            {zone.num}
                                        </span>
                                        {count > 0 && (
                                            <span className="text-[10px] font-black text-white pl-0.5 pr-1">
                                                {count}
                                            </span>
                                        )}
                                    </div>

                                    {/* Hover / Selected Tooltip Card */}
                                    {(isHovered || isSelected) && (
                                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2.5 px-3 py-1.5 rounded-xl bg-slate-950/95 border border-slate-700 shadow-2xl text-[11px] whitespace-nowrap z-40 pointer-events-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
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
        </div>
    );
}

// --- Denah Arsitektural Masterplan TBR (Telunas Beach Resort) ---
function TbrResortMap({ zones = [], onSelectZone, selectedZoneId, theme = 'dark' }) {
    const isDark = theme === 'dark';
    const [zoom, setZoom] = useState(1);
    const [filterMode, setFilterMode] = useState('all'); // 'all' (all facilities) | 'active' (issues only)
    const [hoveredZone, setHoveredZone] = useState(null);

    const handleZoomIn = () => setZoom((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 2.5));
    const handleZoomOut = () => setZoom((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 1));
    const handleResetZoom = () => setZoom(1);

    const displayedZones = filterMode === 'active' ? zones.filter(z => (z.count || 0) > 0) : zones;

    return (
        <div className="space-y-3">
            {/* Map Canvas with Controls HUD */}
            <div className={`relative w-full rounded-2xl overflow-hidden border shadow-xl select-none group ${
                isDark ? 'bg-slate-950 border-slate-700/80' : 'bg-slate-200/60 border-slate-300 shadow-md'
            }`}>
                {/* HUD Toolbar */}
                <div className={`absolute top-3 right-3 z-30 flex items-center gap-1.5 p-1.5 rounded-xl border backdrop-blur-md shadow-lg ${
                    isDark ? 'bg-slate-900/90 border-slate-700/80 text-slate-300' : 'bg-white/95 border-slate-300 text-slate-800 shadow-sm'
                }`}>
                    <button
                        type="button"
                        onClick={() => setFilterMode(prev => prev === 'all' ? 'active' : 'all')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                            filterMode === 'active'
                                ? isDark ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-amber-100 text-amber-800 border border-amber-300'
                                : isDark ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                        title="Filter hanya lokasi dengan isu aktif"
                    >
                        {filterMode === 'active' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        <span>{filterMode === 'active' ? 'Hanya Isu Aktif' : 'Semua Fasilitas'}</span>
                    </button>
                    <div className={`h-4 w-px mx-0.5 ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
                    <button
                        type="button"
                        onClick={handleZoomIn}
                        disabled={zoom >= 2.5}
                        className={`p-1.5 rounded-lg disabled:opacity-40 transition-colors ${
                            isDark ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                        title="Perbesar Denah"
                    >
                        <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={handleZoomOut}
                        disabled={zoom <= 1}
                        className={`p-1.5 rounded-lg disabled:opacity-40 transition-colors ${
                            isDark ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                        title="Perkecil Denah"
                    >
                        <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    {zoom > 1 && (
                        <button
                            type="button"
                            onClick={handleResetZoom}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                                isDark ? 'text-amber-400 hover:bg-amber-500/10' : 'text-amber-700 hover:bg-amber-100'
                            }`}
                            title="Reset Zoom ke 100% (Fit)"
                        >
                            Paskan ({Math.round(zoom * 100)}%)
                        </button>
                    )}
                </div>

                {/* Clean CAD Architectural Blueprint Container - Proportional Fit to Viewport */}
                <div className={`relative w-full overflow-auto h-[600px] sm:h-[700px] flex items-center justify-center p-3 sm:p-6 transition-colors ${
                    isDark ? 'bg-slate-950' : 'bg-slate-200/50'
                }`}>
                    <div
                        className="relative transition-transform duration-200 shadow-xl rounded-2xl overflow-visible bg-white shrink-0 border border-slate-300/80"
                        style={{
                            transform: `scale(${zoom})`,
                            transformOrigin: zoom > 1 ? 'top left' : 'center center',
                        }}
                    >
                        {/* High-Contrast Architectural Site Plan Drawing */}
                        <img
                            src="/images/maps/tbr_masterplan.png"
                            alt="Denah Arsitektural Telunas Beach Resort (TBR)"
                            className="h-[540px] sm:h-[640px] w-auto max-w-none block select-none pointer-events-none rounded-2xl"
                            loading="eager"
                        />

                        {/* Interactive Pins & Hotspots */}
                        {displayedZones.map((zone) => {
                            const count = zone.count || 0;
                            const urgency = zone.highestUrgency;
                            const color = urgency ? (URGENCY_COLORS[urgency] || '#facc15') : '#10b981';
                            const isSelected = selectedZoneId === zone.id;
                            const isHovered = hoveredZone === zone.id;

                            return (
                                <div
                                    key={zone.id}
                                    onClick={() => onSelectZone && onSelectZone(zone)}
                                    onMouseEnter={() => setHoveredZone(zone.id)}
                                    onMouseLeave={() => setHoveredZone(null)}
                                    className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-200 z-10 ${
                                        isSelected ? 'z-30 scale-125' : isHovered ? 'z-20 scale-115' : ''
                                    }`}
                                    style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
                                >
                                    {/* Urgency Pulse Ring if count > 0 */}
                                    {count > 0 && (
                                        <span
                                            className="absolute -inset-2 rounded-full animate-ping opacity-75 pointer-events-none"
                                            style={{ backgroundColor: color }}
                                        />
                                    )}

                                    {/* Clean Minimal Architectural Pin Badge */}
                                    <div
                                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full shadow-lg border text-[10px] font-bold backdrop-blur-md transition-all ${
                                            count > 0
                                                ? 'bg-slate-950/95 text-white ring-2'
                                                : 'bg-slate-900/90 text-slate-100 hover:bg-black'
                                        } ${
                                            isSelected
                                                ? 'ring-4 ring-amber-400 border-white shadow-amber-500/50'
                                                : count > 0
                                                ? 'border-transparent'
                                                : 'border-slate-700/80'
                                        }`}
                                        style={{
                                            boxShadow: count > 0 ? `0 0 14px ${color}90` : undefined,
                                            ringColor: count > 0 ? color : undefined,
                                        }}
                                    >
                                        <span
                                            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-black ${
                                                count > 0 ? 'text-black' : 'text-white bg-slate-700'
                                            }`}
                                            style={{ backgroundColor: count > 0 ? color : undefined }}
                                        >
                                            {zone.num}
                                        </span>
                                        {count > 0 && (
                                            <span className="text-[10px] font-black text-white pl-0.5 pr-1">
                                                {count}
                                            </span>
                                        )}
                                    </div>

                                    {/* Tooltip Card on Hover / Select */}
                                    {(isHovered || isSelected) && (
                                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2.5 px-3 py-1.5 rounded-xl bg-slate-950/95 border border-slate-700 shadow-2xl text-[11px] whitespace-nowrap z-40 pointer-events-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
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
        </div>
    );
}

export function LeanAnalyticsView({
    issues = [],
    departments = [],
    aiPendingCount = 0,
    onRetryAi,
    isRetrying = false,
    theme = 'dark',
    activeTab: propActiveTab,
    onTabChange,
    onSelectIssue,
}) {
    const isDark = theme === 'dark';
    const [expandedLocation, setExpandedLocation] = useState(null);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchFilter, setSearchFilter] = useState('');
    const [hotspotTab, setHotspotTab] = useState('leaderboard'); // 'leaderboard' (default) | 'tpi' | 'tbr' | 'chart'
    const [selectedTpiZone, setSelectedTpiZone] = useState(null);
    const [selectedTbrZone, setSelectedTbrZone] = useState(null);
    const [expandedDescriptions, setExpandedDescriptions] = useState({});
    const [showAllMasterDepts, setShowAllMasterDepts] = useState(false);
    
    // Time Range Filter states
    const [timeRange, setTimeRange] = useState('all'); // 'all' | 'today' | '7d' | '30d' | '6m' | '1y' | 'custom'
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    
    // --- 3-Tab ERP State & Widget Customization ---
    const [internalActiveTab, setInternalActiveTab] = useState(() => {
        try {
            return localStorage.getItem('lean_erp_analytics_tab') || 'executive';
        } catch {
            return 'executive';
        }
    });
    const activeTab = propActiveTab !== undefined ? propActiveTab : internalActiveTab;
    const setActiveTab = (tab) => {
        if (onTabChange) onTabChange(tab);
        setInternalActiveTab(tab);
        try {
            localStorage.setItem('lean_erp_analytics_tab', tab);
        } catch {}
    };

    const [widgetVisibility, setWidgetVisibility] = useState(() => {
        const defaultVisibility = {
            // Tab 1: Executive & Spasial
            kpi_cards: true,
            hotspot_matrix: true,
            // Tab 2: Maintenance
            pareto_chart: true,
            category_donut: true,
            urgency_matrix: true,
            mitigation_feed: true,
            // Tab 3: SLA & Operations
            sla_kpi: true,
            mttr_analytics: true,
            dept_workload: true,
        };
        try {
            const saved = localStorage.getItem('lean_erp_analytics_widgets');
            if (saved) return { ...defaultVisibility, ...JSON.parse(saved) };
        } catch {}
        return defaultVisibility;
    });

    const [widgetViewModes, setWidgetViewModes] = useState(() => {
        const defaultModes = {
            pareto_chart: 'chart', // 'chart' | 'table'
            category_donut: 'chart',
            urgency_matrix: 'chart',
            mttr_analytics: 'chart',
            dept_workload: 'chart',
        };
        try {
            const saved = localStorage.getItem('lean_erp_analytics_viewmodes');
            if (saved) return { ...defaultModes, ...JSON.parse(saved) };
        } catch {}
        return defaultModes;
    });

    const [showWidgetModal, setShowWidgetModal] = useState(false);

    // Persist activeTab to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('lean_erp_analytics_tab', activeTab);
        } catch {}
    }, [activeTab]);

    // Persist widgetVisibility to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('lean_erp_analytics_widgets', JSON.stringify(widgetVisibility));
        } catch {}
    }, [widgetVisibility]);

    // Persist widgetViewModes to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('lean_erp_analytics_viewmodes', JSON.stringify(widgetViewModes));
        } catch {}
    }, [widgetViewModes]);

    const toggleWidgetVisibility = (widgetKey) => {
        setWidgetVisibility((prev) => ({
            ...prev,
            [widgetKey]: !prev[widgetKey],
        }));
    };

    const toggleViewMode = (widgetKey) => {
        setWidgetViewModes((prev) => ({
            ...prev,
            [widgetKey]: prev[widgetKey] === 'table' ? 'chart' : 'table',
        }));
    };

    const resetWidgetSettings = () => {
        const resetVisibility = {
            kpi_cards: true,
            hotspot_matrix: true,
            pareto_chart: true,
            category_donut: true,
            urgency_matrix: true,
            mitigation_feed: true,
            sla_kpi: true,
            mttr_analytics: true,
            dept_workload: true,
        };
        const resetModes = {
            pareto_chart: 'chart',
            category_donut: 'chart',
            urgency_matrix: 'chart',
            mttr_analytics: 'chart',
            dept_workload: 'chart',
        };
        setWidgetVisibility(resetVisibility);
        setWidgetViewModes(resetModes);
        try {
            localStorage.setItem('lean_erp_analytics_widgets', JSON.stringify(resetVisibility));
            localStorage.setItem('lean_erp_analytics_viewmodes', JSON.stringify(resetModes));
        } catch {}
    };

    // Filter issues reactively by selected time range
    const filteredIssues = useMemo(() => {
        if (timeRange === 'all') return issues;

        let minDate = null;
        let maxDate = new Date();
        maxDate.setHours(23, 59, 59, 999);

        if (timeRange === 'hari_ini' || timeRange === 'today') {
            minDate = new Date();
            minDate.setHours(0, 0, 0, 0);
        } else if (timeRange === '7_hari' || timeRange === '7d') {
            minDate = new Date();
            minDate.setDate(minDate.getDate() - 7);
            minDate.setHours(0, 0, 0, 0);
        } else if (timeRange === '30_hari' || timeRange === '30d') {
            minDate = new Date();
            minDate.setDate(minDate.getDate() - 30);
            minDate.setHours(0, 0, 0, 0);
        } else if (timeRange === '6_bulan' || timeRange === '6m') {
            minDate = new Date();
            minDate.setMonth(minDate.getMonth() - 6);
            minDate.setHours(0, 0, 0, 0);
        } else if (timeRange === '1_tahun' || timeRange === '1y') {
            minDate = new Date();
            minDate.setFullYear(minDate.getFullYear() - 1);
            minDate.setHours(0, 0, 0, 0);
        } else if (timeRange === 'custom') {
            if (startDate) {
                minDate = new Date(startDate.includes('T') ? startDate : `${startDate}T00:00:00`);
            }
            if (endDate) {
                maxDate = new Date(endDate.includes('T') ? endDate : `${endDate}T23:59:59.999`);
            }
        }

        return issues.filter((i) => {
            if (!i.created_at) return true;
            const issueDate = new Date(i.created_at);
            if (isNaN(issueDate.getTime())) return true;
            if (minDate && issueDate < minDate) return false;
            if (maxDate && issueDate > maxDate) return false;
            return true;
        });
    }, [issues, timeRange, startDate, endDate]);

    // Google Sheets Auto-Sync & Manual Trigger
    const [lastSyncedTime, setLastSyncedTime] = useState(null);
    const [isSyncingSheets, setIsSyncingSheets] = useState(false);
    const [syncFeedback, setSyncFeedback] = useState(null);

    const triggerAutoSync = useCallback(async (isSilent = true) => {
        if (isSyncingSheets) return;
        setIsSyncingSheets(true);
        if (!isSilent) setSyncFeedback(null);
        try {
            const res = await fetch('/lapangan/sync-sheets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                    'Accept': 'application/json',
                },
            });
            const data = await res.json();
            setLastSyncedTime(new Date());
            if (!isSilent) {
                setSyncFeedback({
                    type: data.success ? 'success' : 'error',
                    message: data.message || (data.success ? 'Sinkronisasi berhasil!' : 'Sinkronisasi gagal.'),
                });
            }
        } catch (err) {
            if (!isSilent) {
                setSyncFeedback({
                    type: 'error',
                    message: 'Gagal menghubungi server untuk sinkronisasi Google Sheets.',
                });
            }
        } finally {
            setIsSyncingSheets(false);
            if (!isSilent) setTimeout(() => setSyncFeedback(null), 6000);
        }
    }, [isSyncingSheets]);

    // Automatically sync on initial load and every 3 minutes (180,000 ms)
    useEffect(() => {
        triggerAutoSync(true);
        const interval = setInterval(() => {
            triggerAutoSync(true);
        }, 180000);
        return () => clearInterval(interval);
    }, []);

    const handleSyncSheets = () => triggerAutoSync(false);

    // --- 1. Key Performance & Audit Metric Cards ---
    const stats = useMemo(() => {
        const total = filteredIssues.length;
        const analyzed = filteredIssues.filter((i) => i.ai_status === 'completed').length;
        const resolved = filteredIssues.filter((i) => i.status === 'resolved').length;
        const needParts = filteredIssues.filter((i) => i.ai_analysis?.perlu_sparepart).length;
        const sparepartRatio = total > 0 ? Math.round((needParts / total) * 100) : 0;

        // Top category
        const catCounts = {};
        filteredIssues.forEach((i) => {
            const cat = i.ai_category || 'Lain-lain';
            catCounts[cat] = (catCounts[cat] || 0) + 1;
        });
        let topCat = '-';
        let topCatCount = 0;
        Object.entries(catCounts).forEach(([cat, count]) => {
            if (count > topCatCount) {
                topCatCount = count;
                topCat = cat;
            }
        });

        // Top hotspot location
        const locCounts = {};
        filteredIssues.forEach((i) => {
            const loc = i.location || 'Resort';
            locCounts[loc] = (locCounts[loc] || 0) + 1;
        });
        let topLoc = '-';
        let topLocCount = 0;
        Object.entries(locCounts).forEach(([loc, count]) => {
            if (count > topLocCount) {
                topLocCount = count;
                topLoc = loc;
            }
        });

        return {
            total,
            analyzed,
            resolved,
            sparepartRatio,
            topCat,
            topCatCount,
            topLoc,
            topLocCount,
        };
    }, [filteredIssues]);

    // --- 2. Pareto Chart Data (Top 7 Sub-Categories with 80/20 Cumulative Calculation) ---
    const { paretoData, paretoSummary } = useMemo(() => {
        const counts = {};
        let totalCount = 0;

        filteredIssues.forEach((i) => {
            const sub = i.ai_sub_category || i.title || 'Lain-lain';
            counts[sub] = (counts[sub] || 0) + 1;
            totalCount += 1;
        });

        if (totalCount === 0) {
            return { paretoData: [], paretoSummary: null };
        }

        const sorted = Object.entries(counts)
            .map(([name, count]) => ({
                name,
                fullName: name,
                count,
            }))
            .sort((a, b) => b.count - a.count);

        let runningCumulative = 0;
        let vitalCount = 0;

        const dataWithCumulative = sorted.slice(0, 7).map((item) => {
            const prevCumulative = runningCumulative;
            runningCumulative += item.count;
            const percentage = Math.round((item.count / totalCount) * 100);
            const cumulativePercentage = Math.min(100, Math.round((runningCumulative / totalCount) * 100));
            // Belongs to the vital 80% contributors if prior cumulative was under 80%
            const isVital = (prevCumulative / totalCount) < 0.8;
            if (isVital) vitalCount++;

            return {
                ...item,
                percentage,
                cumulativePercentage,
                isVital,
            };
        });

        const vitalTopPercentage = dataWithCumulative.length > 0
            ? dataWithCumulative[Math.min(vitalCount - 1, dataWithCumulative.length - 1)]?.cumulativePercentage || 0
            : 0;

        return {
            paretoData: dataWithCumulative,
            paretoSummary: {
                vitalCount,
                vitalTopPercentage,
                totalCount,
            },
        };
    }, [filteredIssues]);

    // --- 3. Category Distribution (Donut Chart) ---
    const categoryData = useMemo(() => {
        const counts = {};
        filteredIssues.forEach((i) => {
            const cat = i.ai_category || 'Lain-lain';
            counts[cat] = (counts[cat] || 0) + 1;
        });

        return Object.entries(counts).map(([name, value]) => ({
            name,
            value,
            color: CATEGORY_COLORS[name] || '#94a3b8',
        }));
    }, [filteredIssues]);

    // --- 4. Hotspot Location Risk Leaderboard & Breakdown ---
    const { hotspotLeaderboardData, hotspotData } = useMemo(() => {
        const locMap = {};
        const urgencyWeight = { 'Darurat': 1000, 'Tinggi': 100, 'Sedang': 10, 'Rendah': 1 };

        filteredIssues.forEach((i) => {
            const loc = (i.location || 'Lainnya').trim() || 'Lainnya';
            if (!locMap[loc]) {
                locMap[loc] = {
                    location: loc,
                    Darurat: 0,
                    Tinggi: 0,
                    Sedang: 0,
                    Rendah: 0,
                    total: 0,
                    openCount: 0,
                    resolvedCount: 0,
                    highestUrgency: 'Rendah',
                    latestIssueTitle: i.title || '',
                    latestIssueCode: i.issue_code || '',
                    departments: new Set(),
                    issues: [],
                };
            }
            const urg = i.ai_urgency || 'Sedang';
            if (locMap[loc][urg] !== undefined) {
                locMap[loc][urg] += 1;
            } else {
                locMap[loc]['Sedang'] += 1;
            }
            locMap[loc].total += 1;

            if (i.status === 'resolved') {
                locMap[loc].resolvedCount += 1;
            } else {
                locMap[loc].openCount += 1;
            }

            if ((urgencyWeight[urg] || 0) > (urgencyWeight[locMap[loc].highestUrgency] || 0)) {
                locMap[loc].highestUrgency = urg;
            }

            if (Array.isArray(i.target_departments)) {
                i.target_departments.forEach((d) => d && locMap[loc].departments.add(d));
            }

            locMap[loc].issues.push(i);
        });

        // Sorted by Severity Weighted Score for Leaderboard
        const leaderboard = Object.values(locMap)
            .map((item) => {
                const score =
                    item.Darurat * 1000 +
                    item.Tinggi * 100 +
                    item.Sedang * 10 +
                    item.Rendah * 1 +
                    item.openCount * 5;

                // Sort issues within location: urgency priority -> open before resolved -> newest
                const sortedIssues = [...item.issues].sort((a, b) => {
                    const weightA = urgencyWeight[a.ai_urgency] || 0;
                    const weightB = urgencyWeight[b.ai_urgency] || 0;
                    if (weightB !== weightA) return weightB - weightA;
                    if (a.status !== b.status) {
                        if (a.status === 'resolved') return 1;
                        if (b.status === 'resolved') return -1;
                    }
                    return (b.id || 0) - (a.id || 0);
                });

                return {
                    ...item,
                    departments: Array.from(item.departments),
                    issues: sortedIssues,
                    score,
                };
            })
            .sort((a, b) => b.score - a.score || b.total - a.total);

        const chartData = Object.values(locMap)
            .sort((a, b) => b.total - a.total)
            .slice(0, 6);

        return { hotspotLeaderboardData: leaderboard, hotspotData: chartData };
    }, [filteredIssues]);

    // --- 5. Department Workload Breakdown (Laporan per Departemen) ---
    const departmentData = useMemo(() => {
        const deptMap = {};

        // If showAllMasterDepts is active, initialize all master resort departments with 0 counts
        if (showAllMasterDepts && Array.isArray(departments)) {
            departments.forEach((rawDept) => {
                const dept = (rawDept || '').trim();
                if (dept && !deptMap[dept]) {
                    deptMap[dept] = {
                        department: dept,
                        name: dept,
                        open: 0,
                        in_progress: 0,
                        resolved: 0,
                        total: 0,
                    };
                }
            });
        }

        filteredIssues.forEach((i) => {
            let depts = i.target_departments;
            if (typeof depts === 'string') {
                try {
                    depts = JSON.parse(depts);
                } catch {
                    depts = [depts];
                }
            }
            if (!Array.isArray(depts) || depts.length === 0) {
                depts = ['Umum'];
            }

            const status = i.status || 'open';
            const statusKey = status === 'resolved' ? 'resolved' : (status === 'in_progress' ? 'in_progress' : 'open');

            depts.forEach((rawDept) => {
                const dept = (rawDept || 'Umum').trim() || 'Umum';
                if (!deptMap[dept]) {
                    deptMap[dept] = {
                        department: dept,
                        name: dept,
                        open: 0,
                        in_progress: 0,
                        resolved: 0,
                        total: 0,
                    };
                }
                deptMap[dept][statusKey] += 1;
                deptMap[dept].total += 1;
            });
        });

        return Object.values(deptMap).sort((a, b) => b.total - a.total);
    }, [filteredIssues, showAllMasterDepts, departments]);

    const deptSummary = useMemo(() => {
        let open = 0;
        let in_progress = 0;
        let resolved = 0;
        departmentData.forEach((d) => {
            open += d.open;
            in_progress += d.in_progress;
            resolved += d.resolved;
        });
        return { open, in_progress, resolved };
    }, [departmentData]);

    // --- 6. Spatial Hotspot Mapping for TPI & TBR ---
    const spatialHotspots = useMemo(() => {
        // Initialize TPI zones from official 22 masterplan locations
        const tpiZones = {};
        TPI_MASTERPLAN_ZONES.forEach(z => {
            tpiZones[z.id] = {
                ...z,
                resort: 'TPI',
                count: 0,
                highestUrgency: null,
                issues: [],
            };
        });

        // Initialize TBR zones from official masterplan overwater locations
        const tbrZones = {};
        TBR_MASTERPLAN_ZONES.forEach(z => {
            tbrZones[z.id] = {
                ...z,
                resort: 'TBR',
                count: 0,
                highestUrgency: null,
                issues: [],
            };
        });

        const urgencyWeight = { 'Darurat': 4, 'Tinggi': 3, 'Sedang': 2, 'Rendah': 1 };

        filteredIssues.forEach((issue) => {
            const loc = (issue.location || '').toLowerCase();
            const title = (issue.title || '').toLowerCase();
            const desc = (issue.description || '').toLowerCase();
            const fullText = `${loc} ${title} ${desc}`;
            const aiResort = issue.ai_analysis?.resort;
            const aiZone = issue.ai_analysis?.zona_spasial;

            const isTbr = aiResort === 'TBR' || loc.includes('tbr') || loc.includes('beach resort');
            const targetMap = isTbr ? tbrZones : tpiZones;

            let matchedKey = null;
            if (isTbr) {
                if (loc.includes('3 bedroom') || loc.includes('3-bedroom') || loc.includes('3 br') || fullText.includes('loft') || fullText.includes('3 bedroom')) {
                    matchedKey = 'tbr_bungalow_3br';
                } else if (loc.includes('balcony') || loc.includes('balkon') || fullText.includes('bungalow with balcony') || loc.includes('chalet timur')) {
                    matchedKey = 'tbr_bungalow_balcony';
                } else if (loc.includes('new dining') || loc.includes('dining baru') || loc.includes('restoran baru')) {
                    matchedKey = 'tbr_new_dining';
                } else if (loc.includes('dining') || loc.includes('restoran') || loc.includes('lodge') || aiZone === 'Dining Room') {
                    matchedKey = 'tbr_dining';
                } else if (loc.includes('lounge') || loc.includes('deck')) {
                    matchedKey = 'tbr_lounge';
                } else if (loc.includes('meeting') || loc.includes('rapat') || loc.includes('serbaguna')) {
                    matchedKey = 'tbr_meeting';
                } else if (loc.includes('dorm') || loc.includes('asrama')) {
                    matchedKey = 'tbr_dorm';
                } else if (loc.includes('swimming') || loc.includes('renang') || loc.includes('laut') || loc.includes('lagoon')) {
                    matchedKey = 'tbr_swimming';
                } else if (loc.includes('chalet') || loc.includes('kamar') || loc.includes('room') || aiZone === 'Vila Terapung') {
                    if (loc.includes('tengah') || loc.includes('inner')) {
                        matchedKey = 'tbr_bungalow_inner';
                    } else {
                        matchedKey = 'tbr_rooms';
                    }
                } else {
                    for (const zone of TBR_MASTERPLAN_ZONES) {
                        const hasKeyword = zone.keywords.some(kw => fullText.includes(kw));
                        if (hasKeyword) {
                            matchedKey = zone.id;
                            break;
                        }
                    }
                    if (!matchedKey) {
                        matchedKey = 'tbr_beach_front';
                    }
                }
            } else {
                // TPI matching against 22 official masterplan facilities
                // 1. Check Hillside / Ridge Villas first
                if (loc.includes('bukit') || fullText.includes('vila bukit') || fullText.includes('villa bukit') || fullText.includes('ridge')) {
                    matchedKey = 'villas_ridge';
                }
                // 2. Check Overwater Villas 1-15
                else if (loc.includes('villa') || loc.includes('kamar') || loc.includes('overwater') || aiZone === 'Vila Terapung') {
                    matchedKey = 'villas_overwater';
                }
                // 3. Match against the 20 other specific facilities by registered keywords
                else {
                    for (const zone of TPI_MASTERPLAN_ZONES) {
                        if (zone.id === 'villas_overwater' || zone.id === 'villas_ridge') continue;
                        const hasKeyword = zone.keywords.some(kw => fullText.includes(kw));
                        if (hasKeyword) {
                            matchedKey = zone.id;
                            break;
                        }
                    }
                    // 4. AI zone fallbacks if keywords not directly found in text
                    if (!matchedKey && aiZone) {
                        if (aiZone.includes('Jetty') || aiZone.includes('Dermaga')) matchedKey = 'jetty_arrival';
                        else if (aiZone.includes('Dining') || aiZone.includes('Restoran')) matchedKey = 'restaurant_office';
                        else if (aiZone.includes('Clubhouse') || aiZone.includes('Lobby')) matchedKey = 'restaurant_office';
                        else if (aiZone.includes('Spa')) matchedKey = 'spa';
                        else if (aiZone.includes('Genset') || aiZone.includes('Utilitas')) matchedKey = 'genset_warehouse';
                        else if (aiZone.includes('Mes') || aiZone.includes('Staf')) matchedKey = 'asrama_staff';
                    }
                    // 5. Default fallback to Restaurant & Main Office
                    if (!matchedKey) {
                        matchedKey = 'restaurant_office';
                    }
                }
            }

            if (matchedKey && targetMap[matchedKey]) {
                const zone = targetMap[matchedKey];
                zone.count += 1;
                zone.issues.push(issue);
                const urg = issue.ai_urgency || 'Sedang';
                if (!zone.highestUrgency || (urgencyWeight[urg] || 0) > (urgencyWeight[zone.highestUrgency] || 0)) {
                    zone.highestUrgency = urg;
                }
            }
        });

        return { tpiZones: Object.values(tpiZones), tbrZones: Object.values(tbrZones) };
    }, [filteredIssues]);

    // --- 7. Actionable Mitigation Feed (Audit Recommendations) ---
    const mitigationFeed = useMemo(() => {
        const q = searchFilter.trim().toLowerCase();

        return filteredIssues
            .filter((i) => {
                if (selectedCategory !== 'all') {
                    if ((i.ai_category || '').toLowerCase() !== selectedCategory.toLowerCase()) {
                        return false;
                    }
                }
                if (q) {
                    const title = (i.title || '').toLowerCase();
                    const loc = (i.location || '').toLowerCase();
                    const rootCause = (i.ai_analysis?.dugaan_akar_masalah || '').toLowerCase();
                    const mitigation = (i.ai_analysis?.tindakan_mitigasi_pencegahan || '').toLowerCase();
                    if (!title.includes(q) && !loc.includes(q) && !rootCause.includes(q) && !mitigation.includes(q)) {
                        return false;
                    }
                }
                return true;
            })
            .slice(0, 15);
    }, [filteredIssues, selectedCategory, searchFilter]);

    // --- 8. MTTR & Response Time Analytics (Lifecycle & SLA) ---
    const mttrData = useMemo(() => {
        let totalTurnaroundHours = 0;
        let resolvedWithTimeCount = 0;
        let totalResponseHours = 0;
        let claimedCount = 0;

        let slaUnder2h = 0;
        let slaUnder24h = 0;
        let slaOver24h = 0;

        const deptTimeMap = {};

        // If showAllMasterDepts is active, initialize all master departments
        if (showAllMasterDepts && Array.isArray(departments)) {
            departments.forEach((rawDept) => {
                const dName = (rawDept || '').trim();
                if (dName && !deptTimeMap[dName]) {
                    deptTimeMap[dName] = {
                        department: dName,
                        totalHours: 0,
                        solvedCount: 0,
                        pendingCount: 0,
                        totalCount: 0,
                    };
                }
            });
        }

        // First pass: register all departments appearing in filteredIssues (even if not yet resolved)
        filteredIssues.forEach((issue) => {
            let depts = issue.target_departments;
            if (typeof depts === 'string') {
                try { depts = JSON.parse(depts); } catch { depts = [depts]; }
            }
            if (!Array.isArray(depts) || depts.length === 0) depts = ['Umum'];

            const hasPendingDelay = issue.status === 'pending' || 
                Boolean(issue.pendingReason) || 
                Boolean(issue.pending_reason) || 
                Boolean(issue.ai_analysis?.perlu_sparepart);

            depts.forEach((d) => {
                const deptName = (d || 'Umum').trim() || 'Umum';
                if (!deptTimeMap[deptName]) {
                    deptTimeMap[deptName] = { 
                        department: deptName, 
                        totalHours: 0, 
                        solvedCount: 0,
                        pendingCount: 0,
                        totalCount: 0,
                    };
                }
                deptTimeMap[deptName].totalCount++;
                if (hasPendingDelay) {
                    deptTimeMap[deptName].pendingCount++;
                }
            });

            // Calculate lifecycle turnaround and response times
            const created = issue.created_at ? new Date(issue.created_at).getTime() : null;
            const claimed = issue.claimed_at ? new Date(issue.claimed_at).getTime() : null;
            const resolved = issue.resolved_at ? new Date(issue.resolved_at).getTime() : null;

            if (created && claimed && claimed >= created) {
                const resHours = (claimed - created) / (1000 * 60 * 60);
                totalResponseHours += resHours;
                claimedCount++;
            }

            if (created && resolved && resolved >= created) {
                const turnHours = (resolved - created) / (1000 * 60 * 60);
                totalTurnaroundHours += turnHours;
                resolvedWithTimeCount++;

                if (turnHours <= 2) slaUnder2h++;
                else if (turnHours <= 24) slaUnder24h++;
                else slaOver24h++;

                depts.forEach((d) => {
                    const deptName = (d || 'Umum').trim() || 'Umum';
                    if (deptTimeMap[deptName]) {
                        deptTimeMap[deptName].totalHours += turnHours;
                        deptTimeMap[deptName].solvedCount++;
                    }
                });
            }
        });

        const avgTurnaroundHours = resolvedWithTimeCount > 0 
            ? parseFloat((totalTurnaroundHours / resolvedWithTimeCount).toFixed(1)) 
            : 0;

        const avgResponseHours = claimedCount > 0 
            ? parseFloat((totalResponseHours / claimedCount).toFixed(1)) 
            : 0;

        const deptMttrList = Object.values(deptTimeMap)
            .map((d) => {
                if (d.solvedCount === 0) {
                    return {
                        department: d.department,
                        avgHours: null,
                        solvedCount: 0,
                        pendingCount: d.pendingCount,
                        speedStatus: d.totalCount > 0 ? 'Sedang Berjalan' : 'Belum Ada Isu',
                        statusType: d.totalCount > 0 ? 'in_progress_only' : 'no_issues',
                    };
                }

                const avgHours = parseFloat((d.totalHours / d.solvedCount).toFixed(1));
                let speedStatus = 'Standar';
                let statusType = 'normal'; // 'fast' | 'normal' | 'pending_delay' | 'needs_eval'

                if (avgHours <= 6) {
                    speedStatus = 'Sangat Cepat';
                    statusType = 'fast';
                } else if (avgHours <= 24) {
                    speedStatus = 'Standar';
                    statusType = 'normal';
                } else {
                    if (d.pendingCount > 0) {
                        speedStatus = 'Tertunda Pending / Sparepart';
                        statusType = 'pending_delay';
                    } else {
                        speedStatus = 'Perlu Evaluasi';
                        statusType = 'needs_eval';
                    }
                }

                return {
                    department: d.department,
                    avgHours,
                    solvedCount: d.solvedCount,
                    pendingCount: d.pendingCount,
                    speedStatus,
                    statusType,
                };
            })
            .sort((a, b) => {
                if (a.avgHours !== null && b.avgHours !== null) {
                    return a.avgHours - b.avgHours;
                }
                if (a.avgHours !== null) return -1;
                if (b.avgHours !== null) return 1;
                return (b.solvedCount || 0) - (a.solvedCount || 0);
            });

        const slaRate24h = resolvedWithTimeCount > 0
            ? Math.round(((slaUnder2h + slaUnder24h) / resolvedWithTimeCount) * 100)
            : 0;

        return {
            avgTurnaroundHours,
            avgResponseHours,
            resolvedWithTimeCount,
            claimedCount,
            slaUnder2h,
            slaUnder24h,
            slaOver24h,
            slaRate24h,
            deptMttrList,
        };
    }, [filteredIssues, showAllMasterDepts, departments]);

    // --- 9. Category Urgency Matrix ---
    const urgencyMatrixData = useMemo(() => {
        const catMap = {};
        filteredIssues.forEach((i) => {
            const cat = i.ai_category || 'Lain-lain';
            if (!catMap[cat]) {
                catMap[cat] = {
                    category: cat,
                    Darurat: 0,
                    Tinggi: 0,
                    Sedang: 0,
                    Rendah: 0,
                    total: 0,
                };
            }
            const urg = i.ai_urgency || 'Sedang';
            if (catMap[cat][urg] !== undefined) {
                catMap[cat][urg]++;
            } else {
                catMap[cat]['Sedang']++;
            }
            catMap[cat].total++;
        });

        return Object.values(catMap).sort((a, b) => b.total - a.total);
    }, [filteredIssues]);

    return (
        <div className="space-y-6 animate-in fade-in pb-12">
            {/* FAILSAFE BANNER (When offline queue has pending issues) */}
            {aiPendingCount > 0 && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/80 via-amber-900/40 to-slate-900 border border-amber-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="text-xs font-bold text-amber-300">
                                Mode Failsafe: {aiPendingCount} Tiket Menunggu Analisis AI
                            </h4>
                            <p className="text-[11px] text-amber-200/80 mt-0.5">
                                Tiket tetap tersimpan aman di database lokal. Klik tombol di kanan saat koneksi internet aktif untuk memproses antrean.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onRetryAi}
                        disabled={isRetrying}
                        className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                        <span>{isRetrying ? 'Memproses Antrean...' : 'Sinkronkan Sekarang'}</span>
                    </button>
                </div>
            )}

            {/* FILTER & GOOGLE SHEETS CONTROL BAR */}
            <div className={`border rounded-2xl p-4 backdrop-blur space-y-3.5 transition-all ${
                isDark ? 'bg-slate-900/95 border-slate-700/80 shadow-xl' : 'bg-white/95 border-slate-200/90 shadow-sm'
            }`}>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    {/* Time Range Filter: Dropdown */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs font-semibold flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            <Clock className="w-3.5 h-3.5 text-teal-500" />
                            Periode:
                        </span>
                        <div className="relative">
                            <select
                                value={timeRange}
                                onChange={(e) => setTimeRange(e.target.value)}
                                className={`appearance-none px-3 py-1.5 pr-8 rounded-xl text-xs font-bold border transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500 shadow-sm ${
                                    isDark
                                        ? 'bg-slate-800 border-slate-700 text-white'
                                        : 'bg-white border-slate-300 text-slate-800 shadow-xs'
                                }`}
                            >
                                <option value="hari_ini">Hari Ini</option>
                                <option value="7_hari">7 Hari Terakhir</option>
                                <option value="30_hari">30 Hari Terakhir</option>
                                <option value="6_bulan">6 Bulan Terakhir</option>
                                <option value="1_tahun">1 Tahun Terakhir</option>
                                <option value="all">Semua Waktu</option>
                                <option value="custom">Kustom Tanggal</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>

                        {timeRange === 'custom' && (
                            <div className="flex flex-wrap items-center gap-1.5 ml-2">
                                <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Dari:</span>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className={`border rounded px-2 py-1 text-xs focus:outline-none focus:border-teal-500 ${
                                        isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800 shadow-xs'
                                    }`}
                                />
                                <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Sampai:</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className={`border rounded px-2 py-1 text-xs focus:outline-none focus:border-teal-500 ${
                                        isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800 shadow-xs'
                                    }`}
                                />
                            </div>
                        )}
                    </div>

                    {/* Google Sheets Actions & Widget Controls */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Auto-Sync Google Sheets Indicator / Trigger */}
                        <button
                            type="button"
                            onClick={() => triggerAutoSync(false)}
                            disabled={isSyncingSheets}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition shadow-sm cursor-pointer ${
                                isDark
                                    ? 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-500/40 text-emerald-300'
                                    : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800 shadow-xs'
                            }`}
                            title={`Google Sheets otomatis tersinkron tiap 3 menit.${lastSyncedTime ? ' Terakhir: ' + lastSyncedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} (Klik untuk sinkronkan manual sekarang)`}
                        >
                            <span className="relative flex h-2 w-2">
                                {isSyncingSheets ? (
                                    <span className="animate-spin h-2 w-2 rounded-full border border-emerald-400 border-t-transparent" />
                                ) : (
                                    <>
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                    </>
                                )}
                            </span>
                            <FileSpreadsheet className={`w-3.5 h-3.5 text-emerald-500 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                            <span>{isSyncingSheets ? 'Menyinkronkan...' : 'Auto-Sync Aktif'}</span>
                        </button>

                        {/* Sheet Tiket Button with Ticket Logo */}
                        <a
                            href="https://docs.google.com/spreadsheets/d/1o8SPuryJf__V1DJp6bm1MTRj60pkIsSX1GYr4-iJvhI/edit?usp=sharing"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition shadow-sm ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white border-amber-500/30'
                                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                            }`}
                            title="Buka Spreadsheet Log Tiket Masalah di Google Sheets"
                        >
                            <Ticket className="w-3.5 h-3.5 text-amber-400" />
                            <span>Sheet Tiket</span>
                            <ExternalLink className="w-3 h-3 opacity-60 ml-0.5" />
                        </a>

                        {/* Sheet Lokasi Button with MapPin Logo */}
                        <a
                            href="https://docs.google.com/spreadsheets/d/1-LiBd1vd8_YA4aTJsf0EiynuayX1_TE800Ylkr4BX5I/edit?usp=sharing"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition shadow-sm ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-white border-emerald-500/30'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300 shadow-xs'
                            }`}
                            title="Buka Spreadsheet Master Lokasi Hotspot di Google Sheets"
                        >
                            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Sheet Lokasi</span>
                            <ExternalLink className="w-3 h-3 opacity-60 ml-0.5" />
                        </a>

                        {/* ERP Widget Customization Controls */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowWidgetModal(!showWidgetModal)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition shadow-sm cursor-pointer ${
                                    isDark
                                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                                        : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-300 shadow-xs'
                                }`}
                            >
                                <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400" />
                                <span>Atur Tampilan Widget</span>
                                <ChevronDown className={`w-3 h-3 transition-transform ${showWidgetModal ? 'rotate-180' : ''}`} />
                            </button>

                            {showWidgetModal && (
                                <div className="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl z-50 text-xs backdrop-blur-md">
                                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                                        <span className="font-bold text-white flex items-center gap-1.5">
                                            <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400" />
                                            Kustomisasi Widget
                                        </span>
                                        <button
                                            type="button"
                                            onClick={resetWidgetSettings}
                                            className="text-[10px] text-teal-400 hover:underline flex items-center gap-1"
                                        >
                                            <RotateCcw className="w-3 h-3" />
                                            Reset
                                        </button>
                                    </div>

                                    <p className="text-[10px] text-slate-400 mb-2">
                                        Atur visibilitas widget untuk tab aktif ({activeTab}):
                                    </p>

                                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                                        {activeTab === 'executive' && (
                                            <>
                                                <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/80 cursor-pointer">
                                                    <span className="text-slate-200">Kartu KPI Ringkasan</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={widgetVisibility.kpi_cards !== false}
                                                        onChange={() => toggleWidgetVisibility('kpi_cards')}
                                                        className="rounded bg-slate-800 border-slate-700 text-teal-500 focus:ring-0"
                                                    />
                                                </label>
                                                <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/80 cursor-pointer">
                                                    <span className="text-slate-200">Matriks Hotspot & Denah</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={widgetVisibility.hotspot_matrix !== false}
                                                        onChange={() => toggleWidgetVisibility('hotspot_matrix')}
                                                        className="rounded bg-slate-800 border-slate-700 text-teal-500 focus:ring-0"
                                                    />
                                                </label>
                                            </>
                                        )}

                                        {activeTab === 'maintenance' && (
                                            <>
                                                <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/80 cursor-pointer">
                                                    <span className="text-slate-200">Diagram Pareto (80/20)</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={widgetVisibility.pareto_chart !== false}
                                                        onChange={() => toggleWidgetVisibility('pareto_chart')}
                                                        className="rounded bg-slate-800 border-slate-700 text-teal-500 focus:ring-0"
                                                    />
                                                </label>
                                                <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/80 cursor-pointer">
                                                    <span className="text-slate-200">Distribusi Kategori Fasilitas</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={widgetVisibility.category_donut !== false}
                                                        onChange={() => toggleWidgetVisibility('category_donut')}
                                                        className="rounded bg-slate-800 border-slate-700 text-teal-500 focus:ring-0"
                                                    />
                                                </label>
                                                <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/80 cursor-pointer">
                                                    <span className="text-slate-200">Matriks Urgensi per Kategori</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={widgetVisibility.urgency_matrix !== false}
                                                        onChange={() => toggleWidgetVisibility('urgency_matrix')}
                                                        className="rounded bg-slate-800 border-slate-700 text-teal-500 focus:ring-0"
                                                    />
                                                </label>
                                                <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/80 cursor-pointer">
                                                    <span className="text-slate-200">Feed Mitigasi AI</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={widgetVisibility.mitigation_feed !== false}
                                                        onChange={() => toggleWidgetVisibility('mitigation_feed')}
                                                        className="rounded bg-slate-800 border-slate-700 text-teal-500 focus:ring-0"
                                                    />
                                                </label>
                                            </>
                                        )}

                                        {activeTab === 'sla_performance' && (
                                            <>
                                                <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/80 cursor-pointer">
                                                    <span className="text-slate-200">Metrik Kecepatan & SLA</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={widgetVisibility.sla_kpi !== false}
                                                        onChange={() => toggleWidgetVisibility('sla_kpi')}
                                                        className="rounded bg-slate-800 border-slate-700 text-teal-500 focus:ring-0"
                                                    />
                                                </label>
                                                <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/80 cursor-pointer">
                                                    <span className="text-slate-200">Kecepatan MTTR per Dept</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={widgetVisibility.mttr_analytics !== false}
                                                        onChange={() => toggleWidgetVisibility('mttr_analytics')}
                                                        className="rounded bg-slate-800 border-slate-700 text-teal-500 focus:ring-0"
                                                    />
                                                </label>
                                                <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/80 cursor-pointer">
                                                    <span className="text-slate-200">Laporan Beban per Dept</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={widgetVisibility.dept_workload !== false}
                                                        onChange={() => toggleWidgetVisibility('dept_workload')}
                                                        className="rounded bg-slate-800 border-slate-700 text-teal-500 focus:ring-0"
                                                    />
                                                </label>
                                            </>
                                        )}
                                    </div>

                                    <div className="pt-2 mt-2 border-t border-slate-800 text-[10px] text-slate-500 text-center">
                                        Preferensi tersimpan di browser
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Info row */}
                <div className={`pt-2 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                    isDark ? 'border-slate-800/80 text-slate-400' : 'border-slate-200 text-slate-600'
                }`}>
                    <div className={`flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <Calendar className={`w-3.5 h-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                        <span>Menampilkan <strong>{filteredIssues.length}</strong> dari <strong>{issues.length}</strong> total tiket</span>
                    </div>

                    {syncFeedback && (
                        <div
                            className={`px-3 py-1 rounded-md text-xs font-medium ${
                                syncFeedback.type === 'success'
                                    ? isDark ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60' : 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                                    : isDark ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60' : 'bg-rose-50 text-rose-800 border border-rose-300'
                            }`}
                        >
                            {syncFeedback.message}
                        </div>
                    )}
                </div>
            </div>

            {/* ========================================================= */}
            {/* TAB 1: RINGKASAN EKSEKUTIF & SPASIAL                      */}
            {/* ========================================================= */}
            {activeTab === 'executive' && (
                <div className="space-y-6">
                    {/* TOP KPI CARDS */}
                    {widgetVisibility.kpi_cards !== false && (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {/* Total & AI Coverage */}
                            <div className={`p-4 rounded-xl border shadow-sm relative overflow-hidden group backdrop-blur-md transition-all ${
                                isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white/95 border-slate-200/90 shadow-xs'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total Tiket Terekam</span>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => toggleWidgetVisibility('kpi_cards')}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-500 hover:text-rose-400"
                                            title="Sembunyikan Kartu KPI"
                                        >
                                            <EyeOff className="w-3 h-3" />
                                        </button>
                                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                                            <Layers className="w-4 h-4" />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-2 flex items-baseline gap-2">
                                    <span className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{stats.total}</span>
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                        isDark
                                            ? 'text-emerald-400 bg-emerald-950/80 border-emerald-800/50'
                                            : 'text-emerald-800 bg-emerald-100 border-emerald-300'
                                    }`}>
                                        {stats.analyzed} Dianalisis AI
                                    </span>
                                </div>
                                <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                    {stats.resolved} tiket telah diselesaikan tim
                                </p>
                            </div>

                            {/* Top Category */}
                            <div className={`p-4 rounded-xl border shadow-sm relative overflow-hidden backdrop-blur-md transition-all ${
                                isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white/95 border-slate-200/90 shadow-xs'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Kategori Dominan</span>
                                    <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-500 flex items-center justify-center">
                                        <Sparkles className="w-4 h-4" />
                                    </div>
                                </div>
                                <div className="mt-2">
                                    <span className={`text-base font-bold truncate block ${isDark ? 'text-sky-300' : 'text-sky-700'}`}>
                                        {stats.topCat}
                                    </span>
                                </div>
                                <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Menyumbang {stats.topCatCount} laporan ({stats.total > 0 ? Math.round((stats.topCatCount / stats.total) * 100) : 0}%)
                                </p>
                            </div>

                            {/* Hotspot Location */}
                            <div className={`p-4 rounded-xl border shadow-sm relative overflow-hidden backdrop-blur-md transition-all ${
                                isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white/95 border-slate-200/90 shadow-xs'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Titik Hotspot Masalah</span>
                                    <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-500 flex items-center justify-center">
                                        <Flame className="w-4 h-4" />
                                    </div>
                                </div>
                                <div className="mt-2">
                                    <span className={`text-base font-bold truncate block ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>
                                        {stats.topLoc}
                                    </span>
                                </div>
                                <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {stats.topLocCount} insiden tercatat di lokasi ini
                                </p>
                            </div>

                            {/* Sparepart Dependency */}
                            <div className={`p-4 rounded-xl border shadow-sm relative overflow-hidden backdrop-blur-md transition-all ${
                                isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white/95 border-slate-200/90 shadow-xs'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Ketergantungan Suku Cadang</span>
                                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center">
                                        <Package className="w-4 h-4" />
                                    </div>
                                </div>
                                <div className="mt-2 flex items-baseline gap-1.5">
                                    <span className={`text-2xl font-black ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{stats.sparepartRatio}%</span>
                                    <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>kasus butuh part</span>
                                </div>
                                <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                    Audit kesiapan stok logistik pulau
                                </p>
                            </div>
                        </div>
                    )}

                    {/* CHARTS ROW 3: HOTSPOT LOKASI & DENAH RESORT (TABBED) */}
                    {widgetVisibility.hotspot_matrix !== false && (
                        <div className={`p-4 rounded-xl border shadow-sm space-y-4 backdrop-blur-md transition-all ${
                            isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white/95 border-slate-200/90 shadow-xs'
                        }`}>
                            <div className={`flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b ${
                                isDark ? 'border-slate-700/60' : 'border-slate-200'
                            }`}>
                                <div>
                                    <h3 className={`text-xs font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        <MapPin className="w-4 h-4 text-rose-500" />
                                        Matriks Hotspot Lokasi & Peta Denah Resort
                                    </h3>
                                    <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        Visualisasi sebaran masalah pada unit/villa Telunas (Grafik analitik & denah spasial TPI/TBR)
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
                                    {/* View Switcher Tabs (Default: Leaderboard Peringkat Risiko) */}
                                    <div className={`flex items-center gap-1 p-1 rounded-lg border ${
                                        isDark ? 'bg-slate-900/90 border-slate-700' : 'bg-slate-100 border-slate-300 shadow-xs'
                                    }`}>
                                        <button
                                            type="button"
                                            onClick={() => setHotspotTab('leaderboard')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                                hotspotTab === 'leaderboard'
                                                    ? 'bg-rose-500 text-white shadow-sm'
                                                    : isDark
                                                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                                            }`}
                                        >
                                            <Flame className="w-3.5 h-3.5" />
                                            <span>Peringkat Risiko</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setHotspotTab('tpi')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                                hotspotTab === 'tpi'
                                                    ? 'bg-emerald-600 text-white shadow-sm'
                                                    : isDark
                                                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                                            }`}
                                        >
                                            <Compass className="w-3.5 h-3.5" />
                                            <span>Denah TPI (Island)</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setHotspotTab('tbr')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                                hotspotTab === 'tbr'
                                                    ? 'bg-amber-600 text-white shadow-sm'
                                                    : isDark
                                                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                                            }`}
                                        >
                                            <Map className="w-3.5 h-3.5" />
                                            <span>Denah TBR (Beach)</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setHotspotTab('chart')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                                hotspotTab === 'chart'
                                                    ? isDark ? 'bg-slate-700 text-white shadow-sm' : 'bg-slate-900 text-white shadow-sm'
                                                    : isDark
                                                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                                            }`}
                                        >
                                            <BarChart2 className="w-3.5 h-3.5" />
                                            <span>Grafik Balok</span>
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => toggleWidgetVisibility('hotspot_matrix')}
                                        className={`p-1.5 rounded-lg transition-colors ${
                                            isDark ? 'text-slate-400 hover:text-rose-400 hover:bg-slate-700/50' : 'text-slate-500 hover:text-rose-600 hover:bg-slate-100'
                                        }`}
                                        title="Sembunyikan Matriks Hotspot"
                                    >
                                        <EyeOff className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                {/* TAB 1: PERINGKAT RISIKO LOKASI (LEADERBOARD - DEFAULT) */}
                {hotspotTab === 'leaderboard' && (
                    <div className="space-y-3">
                        {/* Summary Bar */}
                        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg text-xs border ${
                            isDark ? 'bg-slate-900/60 border-slate-700/60 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700 shadow-xs'
                        }`}>
                            <span className="flex items-center gap-1.5">
                                <Flame className="w-4 h-4 text-rose-500 shrink-0" />
                                Lokasi diurutkan berdasarkan <strong>Tingkat Keparahan Kritis</strong> (Darurat & Tinggi otomatis di posisi teratas)
                            </span>
                            <div className="flex items-center gap-2.5 flex-wrap text-[10px]">
                                <span className={`flex items-center gap-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    <span className="w-2 h-2 rounded bg-rose-500" /> Darurat
                                </span>
                                <span className={`flex items-center gap-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    <span className="w-2 h-2 rounded bg-orange-400" /> Tinggi
                                </span>
                                <span className={`flex items-center gap-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    <span className="w-2 h-2 rounded bg-yellow-400" /> Sedang
                                </span>
                                <span className={`flex items-center gap-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    <span className="w-2 h-2 rounded bg-emerald-500" /> Rendah
                                </span>
                            </div>
                        </div>

                        {hotspotLeaderboardData.length === 0 ? (
                            <div className="py-12 text-center text-xs text-slate-500">
                                Belum ada data lokasi untuk dianalisa.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {hotspotLeaderboardData.map((item, idx) => {
                                    const isRank1 = idx === 0;
                                    const isRank2 = idx === 1;
                                    const isRank3 = idx === 2;
                                    const isExpanded = expandedLocation === item.location;

                                    const urgencyBadge = {
                                        Darurat: {
                                            bg: isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/50' : 'bg-rose-100 text-rose-800 border-rose-300 font-semibold',
                                            dot: 'bg-rose-500',
                                        },
                                        Tinggi: {
                                            bg: isDark ? 'bg-orange-500/20 text-orange-300 border-orange-500/50' : 'bg-orange-100 text-orange-800 border-orange-300 font-semibold',
                                            dot: 'bg-orange-500',
                                        },
                                        Sedang: {
                                            bg: isDark ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' : 'bg-yellow-100 text-yellow-800 border-yellow-300 font-semibold',
                                            dot: 'bg-yellow-500',
                                        },
                                        Rendah: {
                                            bg: isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold',
                                            dot: 'bg-emerald-500',
                                        },
                                    }[item.highestUrgency] || {
                                        bg: isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-100 text-slate-700 border-slate-300 font-medium',
                                        dot: 'bg-slate-400',
                                    };

                                    return (
                                        <div
                                            key={item.location}
                                            className={`rounded-xl border transition-all overflow-hidden ${
                                                item.highestUrgency === 'Darurat'
                                                    ? isDark
                                                        ? 'bg-rose-950/25 border-rose-500/40 hover:border-rose-500/70 shadow-sm'
                                                        : 'bg-rose-50/90 border-rose-300 hover:border-rose-400 shadow-xs'
                                                    : isDark
                                                    ? 'bg-slate-900/60 border-slate-700/70 hover:border-slate-600'
                                                    : 'bg-white/95 border-slate-200 hover:border-slate-300 shadow-xs'
                                            } ${isExpanded ? (isDark ? 'ring-1 ring-sky-500/50 border-sky-500/50' : 'ring-1 ring-sky-400 border-sky-400') : ''}`}
                                        >
                                            {/* Summary Clickable Bar */}
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setExpandedLocation((prev) => (prev === item.location ? null : item.location))}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        setExpandedLocation((prev) => (prev === item.location ? null : item.location));
                                                    }
                                                }}
                                                className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none transition-colors hover:bg-slate-500/5"
                                            >
                                                {/* Left: Rank & Location */}
                                                <div className="flex items-start gap-3 min-w-[240px]">
                                                    <div
                                                        className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-black text-xs border ${
                                                            isRank1
                                                                ? 'bg-gradient-to-br from-amber-400 to-rose-500 text-slate-950 border-amber-300 shadow-sm'
                                                                : isRank2
                                                                ? isDark
                                                                    ? 'bg-slate-700 text-slate-100 border-slate-500'
                                                                    : 'bg-slate-200 text-slate-800 border-slate-300'
                                                                : isRank3
                                                                ? isDark
                                                                    ? 'bg-orange-950/60 text-orange-200 border-orange-700/60'
                                                                    : 'bg-orange-100 text-orange-800 border-orange-300'
                                                                : isDark
                                                                ? 'bg-slate-800 text-slate-400 border-slate-700'
                                                                : 'bg-slate-100 text-slate-700 border-slate-300 font-bold'
                                                        }`}
                                                    >
                                                        #{idx + 1}
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h4 className={`text-sm font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                                <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                                                {item.location}
                                                            </h4>
                                                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${urgencyBadge.bg}`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${urgencyBadge.dot}`} />
                                                                Urgensi: {item.highestUrgency}
                                                            </span>
                                                            {item.departments && item.departments.length > 0 && (
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                                                                    isDark
                                                                        ? 'text-slate-400 bg-slate-800 border-slate-700'
                                                                        : 'text-slate-700 bg-slate-100 border-slate-300'
                                                                }`}>
                                                                    {item.departments.join(', ')}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {item.latestIssueTitle && (
                                                            <p className={`text-xs line-clamp-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                Laporan terbaru: <span className={`font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>"{item.latestIssueTitle}"</span>
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Middle / Right: Breakdown Bar & Stats + Accordion Arrow */}
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-4 md:gap-6 self-stretch md:self-auto justify-between md:justify-end">
                                                    {/* Visual Urgency Proportion Mini Bar */}
                                                    <div className="min-w-[140px] max-w-[200px] flex-1">
                                                        <div className={`flex justify-between text-[10px] mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                            <span>Distribusi Kasus</span>
                                                            <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.total} Total</span>
                                                        </div>
                                                        <div className={`w-full h-2 rounded-full overflow-hidden flex ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                                                            {item.Darurat > 0 && (
                                                                <div
                                                                    style={{ width: `${(item.Darurat / item.total) * 100}%` }}
                                                                    className="bg-rose-500 h-full"
                                                                    title={`Darurat: ${item.Darurat}`}
                                                                />
                                                            )}
                                                            {item.Tinggi > 0 && (
                                                                <div
                                                                    style={{ width: `${(item.Tinggi / item.total) * 100}%` }}
                                                                    className="bg-orange-400 h-full"
                                                                    title={`Tinggi: ${item.Tinggi}`}
                                                                />
                                                            )}
                                                            {item.Sedang > 0 && (
                                                                <div
                                                                    style={{ width: `${(item.Sedang / item.total) * 100}%` }}
                                                                    className="bg-yellow-400 h-full"
                                                                    title={`Sedang: ${item.Sedang}`}
                                                                />
                                                            )}
                                                            {item.Rendah > 0 && (
                                                                <div
                                                                    style={{ width: `${(item.Rendah / item.total) * 100}%` }}
                                                                    className="bg-emerald-500 h-full"
                                                                    title={`Rendah: ${item.Rendah}`}
                                                                />
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Active vs Resolved Counters */}
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <div className={`px-2.5 py-1 rounded-lg border text-center min-w-[50px] ${
                                                            isDark ? 'bg-slate-800 border-slate-700/80' : 'bg-white border-slate-200 shadow-xs'
                                                        }`}>
                                                            <div className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Aktif</div>
                                                            <div className={`text-xs font-black ${item.openCount > 0 ? (isDark ? 'text-rose-400' : 'text-rose-600') : (isDark ? 'text-slate-400' : 'text-slate-400')}`}>
                                                                {item.openCount}
                                                            </div>
                                                        </div>
                                                        <div className={`px-2.5 py-1 rounded-lg border text-center min-w-[50px] ${
                                                            isDark ? 'bg-slate-800 border-slate-700/80' : 'bg-white border-slate-200 shadow-xs'
                                                        }`}>
                                                            <div className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Selesai</div>
                                                            <div className={`text-xs font-black ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>{item.resolvedCount}</div>
                                                        </div>

                                                        {/* Expand Chevron */}
                                                        <div className={`p-1.5 rounded-lg border transition-all ${
                                                            isExpanded
                                                                ? (isDark ? 'bg-sky-500/20 text-sky-300 border-sky-500/50' : 'bg-sky-100 text-sky-700 border-sky-300')
                                                                : (isDark ? 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200' : 'bg-slate-100 text-slate-600 border-slate-300 hover:text-slate-900')
                                                        }`} title={isExpanded ? 'Tutup daftar isu' : 'Klik untuk melihat isu di lokasi ini'}>
                                                            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Expandable Accordion Drawer: Daftar Isu di Lokasi */}
                                            {isExpanded && (
                                                <div className={`border-t px-4 py-3.5 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150 ${
                                                    isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50/90 border-slate-200/90'
                                                }`}>
                                                    {/* Header Accordion */}
                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                        <div className="flex items-center gap-2">
                                                            <Ticket className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                                            <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                                Daftar Masalah di {item.location}
                                                            </span>
                                                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                                                                isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-slate-700 border-slate-300 shadow-2xs'
                                                            }`}>
                                                                {item.issues?.length || 0} Tiket
                                                            </span>
                                                        </div>
                                                        <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                            Klik tiket untuk membuka detail lengkap
                                                        </span>
                                                    </div>

                                                    {/* List of Issues */}
                                                    <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                                                        {(!item.issues || item.issues.length === 0) ? (
                                                            <div className="py-4 text-center text-xs text-slate-500 italic">
                                                                Tidak ada catatan isu untuk lokasi ini.
                                                            </div>
                                                        ) : (
                                                            item.issues.map((iss) => {
                                                                const urgStyle = {
                                                                    Darurat: isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-rose-100 text-rose-800 border-rose-300',
                                                                    Tinggi: isDark ? 'bg-orange-500/20 text-orange-300 border-orange-500/40' : 'bg-orange-100 text-orange-800 border-orange-300',
                                                                    Sedang: isDark ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' : 'bg-yellow-100 text-yellow-800 border-yellow-300',
                                                                    Rendah: isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-emerald-100 text-emerald-800 border-emerald-300',
                                                                }[iss.ai_urgency || 'Sedang'] || (isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-300');

                                                                const isResolved = iss.status === 'resolved';

                                                                return (
                                                                    <div
                                                                        key={iss.id || iss.issue_code}
                                                                        onClick={() => onSelectIssue && onSelectIssue(iss)}
                                                                        className={`p-2.5 rounded-lg border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer group ${
                                                                            isDark
                                                                                ? 'bg-slate-900/90 border-slate-800 hover:border-sky-500/60 hover:bg-slate-800/80'
                                                                                : 'bg-white border-slate-200 hover:border-sky-400 hover:bg-sky-50/40 shadow-2xs'
                                                                        }`}
                                                                    >
                                                                        <div className="space-y-1 min-w-0 flex-1">
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <span className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border ${
                                                                                    isDark ? 'bg-slate-800 text-amber-300 border-slate-700' : 'bg-slate-100 text-slate-800 border-slate-300'
                                                                                }`}>
                                                                                    #{iss.issue_code || ('LEAN-' + iss.id)}
                                                                                </span>

                                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${urgStyle}`}>
                                                                                    {iss.ai_urgency || 'Sedang'}
                                                                                </span>

                                                                                {/* Status badge */}
                                                                                {isResolved ? (
                                                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                                                                        <CheckCircle2 className="w-2.5 h-2.5" /> Selesai
                                                                                    </span>
                                                                                ) : iss.status === 'in_progress' ? (
                                                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                                                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Progress
                                                                                    </span>
                                                                                ) : iss.status === 'pending' ? (
                                                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/30 flex items-center gap-1">
                                                                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400" /> Tertunda
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                                                                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Open
                                                                                    </span>
                                                                                )}

                                                                                {iss.created_at_human && (
                                                                                    <span className={`text-[10px] flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                                        <Clock className="w-2.5 h-2.5" /> {iss.created_at_human}
                                                                                    </span>
                                                                                )}
                                                                            </div>

                                                                            <h5 className={`text-xs font-bold leading-tight group-hover:text-sky-400 transition-colors ${
                                                                                isDark ? 'text-slate-200' : 'text-slate-800'
                                                                            }`}>
                                                                                {iss.title}
                                                                            </h5>

                                                                            <div className={`flex items-center gap-3 text-[10px] flex-wrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                                {iss.reporter_name && (
                                                                                    <span className="flex items-center gap-1">
                                                                                        <User className="w-3 h-3 text-emerald-400" />
                                                                                        Pelapor: <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{iss.reporter_name}</strong>
                                                                                    </span>
                                                                                )}
                                                                                {iss.target_departments && iss.target_departments.length > 0 && (
                                                                                    <span>
                                                                                        Dept: <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{iss.target_departments.join(', ')}</strong>
                                                                                    </span>
                                                                                )}
                                                                                {iss.claimed_by_name && (
                                                                                    <span className="text-amber-400 font-medium">
                                                                                        Dikerjakan: {iss.claimed_by_name}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (onSelectIssue) onSelectIssue(iss);
                                                                                }}
                                                                                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border flex items-center gap-1 transition-all ${
                                                                                    isDark
                                                                                        ? 'bg-slate-800 hover:bg-sky-600 hover:text-white text-slate-300 border-slate-700 hover:border-sky-500'
                                                                                        : 'bg-white hover:bg-sky-600 hover:text-white text-slate-700 border-slate-300 hover:border-sky-500 shadow-2xs'
                                                                                }`}
                                                                            >
                                                                                <Eye className="w-3 h-3" />
                                                                                <span>Detail</span>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 4: GRAFIK BALOK (OPTIONAL ALTERNATIVE) */}
                {hotspotTab === 'chart' && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-end gap-2 flex-wrap text-[10px]">
                            <span className="flex items-center gap-1 text-slate-300">
                                <span className="w-2 h-2 rounded bg-rose-500" /> Darurat
                            </span>
                            <span className="flex items-center gap-1 text-slate-300">
                                <span className="w-2 h-2 rounded bg-orange-400" /> Tinggi
                            </span>
                            <span className="flex items-center gap-1 text-slate-300">
                                <span className="w-2 h-2 rounded bg-yellow-400" /> Sedang
                            </span>
                            <span className="flex items-center gap-1 text-slate-300">
                                <span className="w-2 h-2 rounded bg-emerald-500" /> Rendah
                            </span>
                        </div>

                        {hotspotData.length === 0 ? (
                            <div className="py-12 text-center text-xs text-slate-500">
                                Belum ada data lokasi untuk dianalisa.
                            </div>
                        ) : (
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={hotspotData} maxBarSize={48} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                        <XAxis dataKey="location" stroke="#94a3b8" fontSize={11} />
                                        <YAxis
                                            stroke="#94a3b8"
                                            fontSize={10}
                                            allowDecimals={false}
                                            domain={[0, (dataMax) => Math.max(1, dataMax)]}
                                        />
                                        <RechartsTooltip
                                            cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                                            content={<CustomHotspotTooltip />}
                                        />
                                        <Bar dataKey="Darurat" stackId="a" fill="#f43f5e" />
                                        <Bar dataKey="Tinggi" stackId="a" fill="#fb923c" />
                                        <Bar dataKey="Sedang" stackId="a" fill="#facc15" />
                                        <Bar dataKey="Rendah" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 2: DENAH TPI (SPATIAL OVERVIEW) */}
                {hotspotTab === 'tpi' && (
                    <div className="space-y-3">
                        <div className={`flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1 p-2.5 rounded-lg border ${
                            isDark
                                ? 'bg-slate-900/60 border-slate-700/60 text-slate-400'
                                : 'bg-emerald-50/90 border-emerald-300/80 text-emerald-900 shadow-xs'
                        }`}>
                            <span className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}>
                                <Info className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                                Peta Spasial Telunas Private Island (TPI)
                            </span>
                            <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-emerald-800/80'}`}>
                                Lokasi dipetakan secara otomatis oleh AI berdasarkan isi laporan unit
                            </span>
                        </div>
                        <TpiResortMap
                            zones={spatialHotspots.tpiZones}
                            onSelectZone={(zone) => setSelectedTpiZone(prev => prev?.id === zone.id ? null : zone)}
                            selectedZoneId={selectedTpiZone?.id}
                            theme={theme}
                        />

                        {/* Zone Detail Inspector if clicked */}
                        {selectedTpiZone && (
                            <div className="p-3.5 rounded-xl bg-slate-900 border border-sky-500/40 shadow-lg animate-in fade-in duration-200 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 font-bold text-xs flex items-center justify-center border border-sky-500/40">
                                            #{selectedTpiZone.num}
                                        </span>
                                        <div>
                                            <h4 className="font-bold text-sm text-white">{selectedTpiZone.name}</h4>
                                            <p className="text-[11px] text-slate-400">{selectedTpiZone.enName} • Telunas Private Island</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                            (selectedTpiZone.count || 0) > 0
                                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                        }`}>
                                            {selectedTpiZone.count || 0} Isu Aktif
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedTpiZone(null)}
                                            className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800"
                                        >
                                            Tutup
                                        </button>
                                    </div>
                                </div>

                                {selectedTpiZone.issues?.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                        {selectedTpiZone.issues.map(iss => (
                                            <div key={iss.id} className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 text-xs space-y-1">
                                                <div className="flex items-center justify-between gap-1">
                                                    <span className="font-mono text-sky-400 font-semibold">#{iss.id}</span>
                                                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                                                        iss.urgency === 'Darurat' ? 'bg-rose-500/20 text-rose-300' :
                                                        iss.urgency === 'Tinggi' ? 'bg-orange-500/20 text-orange-300' :
                                                        'bg-slate-700 text-slate-300'
                                                    }`}>
                                                        {iss.urgency || 'Sedang'}
                                                    </span>
                                                </div>
                                                <p className="font-medium text-slate-200 line-clamp-1">{iss.title}</p>
                                                <div className="text-[10px] text-slate-400 flex items-center justify-between">
                                                    <span>📍 {iss.location || '-'}</span>
                                                    <span>{iss.reported_at || iss.created_at?.slice(0, 10) || ''}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-emerald-400/90 italic pt-1">
                                        ✓ Tidak ada laporan masalah aktif di fasilitas ini. Semua sistem berjalan normal.
                                    </p>
                                )}
                            </div>
                        )}

                        {/* 22 Masterplan Facilities Quick Directory Grid */}
                        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-300">Daftar 22 Fasilitas Resmi TPI</span>
                                <span className="text-[11px] text-slate-500">Klik nama fasilitas untuk menyorot titik pada denah</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 pt-1">
                                {spatialHotspots.tpiZones.map(zone => {
                                    const count = zone.count || 0;
                                    const isSelected = selectedTpiZone?.id === zone.id;
                                    return (
                                        <button
                                            key={zone.id}
                                            type="button"
                                            onClick={() => setSelectedTpiZone(prev => prev?.id === zone.id ? null : zone)}
                                            className={`flex items-center justify-between p-1.5 px-2 rounded-lg text-left text-[11px] transition-all border ${
                                                isSelected
                                                    ? 'bg-sky-500/20 text-sky-200 border-sky-500/50 shadow-sm'
                                                    : count > 0
                                                    ? 'bg-rose-500/10 text-rose-200 border-rose-500/30 hover:bg-rose-500/20'
                                                    : 'bg-slate-950/40 text-slate-400 border-slate-800/80 hover:bg-slate-800 hover:text-slate-200'
                                            }`}
                                        >
                                            <span className="truncate pr-1">
                                                <span className="font-mono text-slate-500 text-[10px] mr-1">#{zone.num}</span>
                                                {zone.name}
                                            </span>
                                            {count > 0 && (
                                                <span className="px-1.5 py-0.2 rounded font-bold text-[9px] bg-rose-500 text-white shrink-0">
                                                    {count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 3: DENAH TBR (SPATIAL OVERVIEW) */}
                {hotspotTab === 'tbr' && (
                    <div className="space-y-3">
                        <div className={`flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1 p-2.5 rounded-lg border ${
                            isDark
                                ? 'bg-slate-900/60 border-slate-700/60 text-slate-400'
                                : 'bg-amber-50/90 border-amber-300/80 text-amber-900 shadow-xs'
                        }`}>
                            <span className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                                <Info className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                                Peta Spasial Telunas Beach Resort (TBR)
                            </span>
                            <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-amber-800/80'}`}>
                                Lokasi dipetakan secara otomatis oleh AI berdasarkan isi laporan fasilitas
                            </span>
                        </div>
                        <TbrResortMap
                            zones={spatialHotspots.tbrZones}
                            onSelectZone={(zone) => setSelectedTbrZone(prev => prev?.id === zone.id ? null : zone)}
                            selectedZoneId={selectedTbrZone?.id}
                            theme={theme}
                        />

                        {/* Zone Detail Inspector if clicked */}
                        {selectedTbrZone && (
                            <div className="p-3.5 rounded-xl bg-slate-900 border border-amber-500/40 shadow-lg animate-in fade-in duration-200 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center border border-amber-500/40">
                                            #{selectedTbrZone.num}
                                        </span>
                                        <div>
                                            <h4 className="font-bold text-sm text-white">{selectedTbrZone.name}</h4>
                                            <p className="text-[11px] text-slate-400">{selectedTbrZone.enName} • Telunas Beach Resort</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                            (selectedTbrZone.count || 0) > 0
                                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                        }`}>
                                            {selectedTbrZone.count || 0} Isu Aktif
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedTbrZone(null)}
                                            className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800"
                                        >
                                            Tutup
                                        </button>
                                    </div>
                                </div>

                                {selectedTbrZone.issues?.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                        {selectedTbrZone.issues.map(iss => (
                                            <div key={iss.id} className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 text-xs space-y-1">
                                                <div className="flex items-center justify-between gap-1">
                                                    <span className="font-mono text-amber-400 font-semibold">#{iss.id}</span>
                                                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                                                        iss.urgency === 'Darurat' ? 'bg-rose-500/20 text-rose-300' :
                                                        iss.urgency === 'Tinggi' ? 'bg-orange-500/20 text-orange-300' :
                                                        'bg-slate-700 text-slate-300'
                                                    }`}>
                                                        {iss.urgency || 'Sedang'}
                                                    </span>
                                                </div>
                                                <p className="font-medium text-slate-200 line-clamp-1">{iss.title}</p>
                                                <div className="text-[10px] text-slate-400 flex items-center justify-between">
                                                    <span>📍 {iss.location || '-'}</span>
                                                    <span>{iss.reported_at || iss.created_at?.slice(0, 10) || ''}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-emerald-400/90 italic pt-1">
                                        ✓ Tidak ada laporan masalah aktif di fasilitas ini. Semua sistem berjalan normal.
                                    </p>
                                )}
                            </div>
                        )}

                        {/* TBR Overwater Facilities Quick Directory Grid */}
                        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-300">Daftar Fasilitas Area Vila Terapung TBR</span>
                                <span className="text-[11px] text-slate-500">Klik nama fasilitas untuk menyorot titik pada denah</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 pt-1">
                                {spatialHotspots.tbrZones.map(zone => {
                                    const count = zone.count || 0;
                                    const isSelected = selectedTbrZone?.id === zone.id;
                                    return (
                                        <button
                                            key={zone.id}
                                            type="button"
                                            onClick={() => setSelectedTbrZone(prev => prev?.id === zone.id ? null : zone)}
                                            className={`flex items-center justify-between p-1.5 px-2 rounded-lg text-left text-[11px] transition-all border ${
                                                isSelected
                                                    ? 'bg-amber-500/20 text-amber-200 border-amber-500/50 shadow-sm'
                                                    : count > 0
                                                    ? 'bg-rose-500/10 text-rose-200 border-rose-500/30 hover:bg-rose-500/20'
                                                    : 'bg-slate-950/40 text-slate-400 border-slate-800/80 hover:bg-slate-800 hover:text-slate-200'
                                            }`}
                                        >
                                            <span className="truncate pr-1">
                                                <span className="font-mono text-slate-500 text-[10px] mr-1">#{zone.num}</span>
                                                {zone.name}
                                            </span>
                                            {count > 0 && (
                                                <span className="px-1.5 py-0.2 rounded font-bold text-[9px] bg-rose-500 text-white shrink-0">
                                                    {count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================= */}
            {/* TAB 2: AKAR MASALAH & ANALISA PARETO (MAINTENANCE)        */}
            {/* ========================================================= */}
            {activeTab === 'maintenance' && (
                <div className="space-y-6">
                    {/* CHARTS ROW 1: PARETO (TOP SUB-CATEGORIES) & CATEGORY DONUT */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* 1. PARETO DUAL-AXIS COMPOSED CHART */}
                        {widgetVisibility.pareto_chart !== false && (
                            <div className={`${widgetVisibility.category_donut === false ? 'lg:col-span-3' : 'lg:col-span-2'} p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm flex flex-col justify-between`}>
                                <div>
                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                        <div>
                                            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                                Analisa Pareto: Top Masalah Berulang (80/20 Rule)
                                            </h3>
                                            <p className="text-[11px] text-slate-400 mt-0.5">
                                                Identifikasi 20% akar masalah yang menyumbang 80% insiden resort
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {paretoSummary && paretoSummary.vitalCount > 0 && (
                                                <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-medium text-emerald-300 flex items-center gap-1.5 shadow-sm">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                                                    <span>
                                                        Top <strong>{paretoSummary.vitalCount}</strong> masalah menyumbang{' '}
                                                        <strong className="text-emerald-200">{paretoSummary.vitalTopPercentage}%</strong> komplain
                                                    </span>
                                                </div>
                                            )}

                                            {/* Toggle View Mode & Hide */}
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleViewMode('pareto_chart')}
                                                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-[11px] text-slate-300 hover:text-white transition-colors"
                                                    title={widgetViewModes.pareto_chart === 'table' ? 'Tampilkan Mode Grafik' : 'Tampilkan Mode ERP Tabel'}
                                                >
                                                    {widgetViewModes.pareto_chart === 'table' ? (
                                                        <>
                                                            <LayoutGrid className="w-3.5 h-3.5 text-teal-400" />
                                                            <span className="hidden sm:inline">Grafik</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Table className="w-3.5 h-3.5 text-amber-400" />
                                                            <span className="hidden sm:inline">Tabel ERP</span>
                                                        </>
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleWidgetVisibility('pareto_chart')}
                                                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-700/50 transition-colors"
                                                    title="Sembunyikan Diagram Pareto"
                                                >
                                                    <EyeOff className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {widgetViewModes.pareto_chart !== 'table' && (
                                        /* Visual Legend Bar */
                                        <div className="flex flex-wrap items-center gap-3 sm:gap-4 px-1 py-1 mb-2 text-[10px] text-slate-400 border-y border-slate-750/50">
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
                                                <span className="text-slate-200 font-medium">Vital Few (Prioritas 80%)</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-sm bg-slate-500 shrink-0" />
                                                <span>Masalah Sekunder (&gt;80%)</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-3.5 h-0.5 bg-amber-400 shrink-0 inline-block" />
                                                <span className="text-amber-400 font-medium">Garis Akumulasi (%)</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 ml-auto">
                                                <span className="w-3.5 h-0.5 border-b border-rose-500 border-dashed shrink-0 inline-block" />
                                                <span className="text-rose-400 font-medium">Batas 80% Target</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {paretoData.length === 0 ? (
                                    <div className="py-16 text-center text-xs text-slate-500">
                                        Belum ada data sub-kategori untuk ditampilkan.
                                    </div>
                                ) : widgetViewModes.pareto_chart === 'table' ? (
                                    <div className="overflow-x-auto mt-2">
                                        <table className="w-full text-left text-xs text-slate-300">
                                            <thead className="bg-slate-900/80 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-700">
                                                <tr>
                                                    <th className="py-2.5 px-3">#</th>
                                                    <th className="py-2.5 px-3">Sub-Kategori Masalah</th>
                                                    <th className="py-2.5 px-3 text-right">Kasus</th>
                                                    <th className="py-2.5 px-3 text-right">Porsi</th>
                                                    <th className="py-2.5 px-3 text-right">Akumulasi</th>
                                                    <th className="py-2.5 px-3 text-center">Klasifikasi</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800">
                                                {paretoData.map((item, idx) => (
                                                    <tr key={item.name} className="hover:bg-slate-750/40">
                                                        <td className="py-2 px-3 font-mono text-slate-500">{idx + 1}</td>
                                                        <td className="py-2 px-3 font-medium text-white">{item.name}</td>
                                                        <td className="py-2 px-3 text-right font-bold text-slate-100">{item.count}</td>
                                                        <td className="py-2 px-3 text-right text-emerald-400 font-semibold">{item.percentage}%</td>
                                                        <td className="py-2 px-3 text-right text-amber-400 font-bold">{item.cumulativePercentage}%</td>
                                                        <td className="py-2 px-3 text-center">
                                                            {item.isVital ? (
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                                                    Vital Few (80%)
                                                                </span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                                                                    Sekunder
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="h-72 w-full mt-1">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart
                                                data={paretoData}
                                                margin={{ top: 15, right: 25, left: -10, bottom: 40 }}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e2e8f0"} vertical={false} />
                                                <XAxis
                                                    dataKey="name"
                                                    stroke={isDark ? "#cbd5e1" : "#475569"}
                                                    fontSize={10}
                                                    interval={0}
                                                    angle={-22}
                                                    textAnchor="end"
                                                    height={45}
                                                    tickFormatter={(val) => (val && val.length > 15 ? val.substring(0, 14) + '…' : val)}
                                                />
                                                <YAxis
                                                    yAxisId="left"
                                                    type="number"
                                                    stroke={isDark ? "#94a3b8" : "#64748b"}
                                                    fontSize={10}
                                                    allowDecimals={false}
                                                    domain={[0, (dataMax) => Math.max(2, Math.ceil(dataMax * 1.25))]}
                                                />
                                                <YAxis
                                                    yAxisId="right"
                                                    orientation="right"
                                                    type="number"
                                                    stroke="#f59e0b"
                                                    fontSize={10}
                                                    domain={[0, 100]}
                                                    unit="%"
                                                    tickFormatter={(val) => `${val}%`}
                                                />
                                                <RechartsTooltip
                                                    cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)' }}
                                                    content={<CustomParetoTooltip />}
                                                />
                                                <ReferenceLine
                                                    yAxisId="right"
                                                    y={80}
                                                    stroke="#f43f5e"
                                                    strokeDasharray="4 4"
                                                    strokeWidth={1.5}
                                                />
                                                <Bar
                                                    yAxisId="left"
                                                    dataKey="count"
                                                    name="Jumlah Kasus"
                                                    radius={[4, 4, 0, 0]}
                                                >
                                                    {paretoData.map((entry, index) => (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={entry.isVital ? '#10b981' : '#64748b'}
                                                        />
                                                    ))}
                                                    <LabelList
                                                        dataKey="count"
                                                        position="top"
                                                        fill={isDark ? "#ffffff" : "#0f172a"}
                                                        fontSize={10}
                                                        fontWeight={700}
                                                        offset={5}
                                                    />
                                                </Bar>
                                                <Line
                                                    yAxisId="right"
                                                    type="monotone"
                                                    dataKey="cumulativePercentage"
                                                    name="Akumulasi %"
                                                    stroke="#f59e0b"
                                                    strokeWidth={2.5}
                                                    dot={{ r: 4, fill: '#f59e0b', stroke: '#0f172a', strokeWidth: 1.5 }}
                                                    activeDot={{ r: 6, fill: '#fbbf24' }}
                                                />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 2. CATEGORY DISTRIBUTION (DONUT / TABLE) */}
                        {widgetVisibility.category_donut !== false && (
                            <div className={`${widgetVisibility.pareto_chart === false ? 'lg:col-span-3' : 'lg:col-span-1'} p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm flex flex-col justify-between`}>
                                <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
                                    <div>
                                        <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                                            <Sparkles className="w-4 h-4 text-sky-400" />
                                            Distribusi Kategori Fasilitas
                                        </h3>
                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                            Proporsi beban pemeliharaan resort
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => toggleViewMode('category_donut')}
                                            className="p-1.5 text-slate-400 hover:text-white rounded bg-slate-900 border border-slate-700"
                                            title={widgetViewModes.category_donut === 'table' ? 'Tampilkan Mode Grafik' : 'Tampilkan Mode ERP Tabel'}
                                        >
                                            {widgetViewModes.category_donut === 'table' ? (
                                                <LayoutGrid className="w-3.5 h-3.5 text-teal-400" />
                                            ) : (
                                                <Table className="w-3.5 h-3.5 text-amber-400" />
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => toggleWidgetVisibility('category_donut')}
                                            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-700/50 transition-colors"
                                            title="Sembunyikan Distribusi Kategori"
                                        >
                                            <EyeOff className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {categoryData.length === 0 ? (
                                    <div className="py-16 text-center text-xs text-slate-500">
                                        Belum ada data kategori untuk ditampilkan.
                                    </div>
                                ) : widgetViewModes.category_donut === 'table' ? (
                                    <div className="overflow-x-auto mt-2">
                                        <table className="w-full text-left text-xs text-slate-300">
                                            <thead className="bg-slate-900/80 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-700">
                                                <tr>
                                                    <th className="py-2.5 px-3">Kategori</th>
                                                    <th className="py-2.5 px-3 text-right">Kasus</th>
                                                    <th className="py-2.5 px-3 text-right">Porsi</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800">
                                                {categoryData.map((item) => (
                                                    <tr key={item.name} className="hover:bg-slate-750/40">
                                                        <td className="py-2 px-3 flex items-center gap-1.5 font-medium text-white">
                                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                                            {item.name}
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-bold text-slate-100">{item.value}</td>
                                                        <td className="py-2 px-3 text-right text-sky-400 font-semibold">
                                                            {stats.total > 0 ? Math.round((item.value / stats.total) * 100) : 0}%
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="h-64 w-full mt-2">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={categoryData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={48}
                                                    outerRadius={75}
                                                    paddingAngle={3}
                                                    dataKey="value"
                                                >
                                                    {categoryData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip
                                                    contentStyle={{
                                                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                                                        borderColor: isDark ? '#334155' : '#e2e8f0',
                                                        color: isDark ? '#f8fafc' : '#0f172a',
                                                        borderRadius: '8px',
                                                        fontSize: '11px',
                                                        boxShadow: isDark ? '0 10px 15px -3px rgba(0, 0, 0, 0.5)' : '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                                    }}
                                                />
                                                <Legend
                                                    layout="horizontal"
                                                    verticalAlign="bottom"
                                                    align="center"
                                                    wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* CHARTS ROW 2: CATEGORY URGENCY MATRIX */}
                    {widgetVisibility.urgency_matrix !== false && (
                        <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-700/60">
                                <div>
                                    <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                                        <Activity className="w-4 h-4 text-amber-400" />
                                        Matriks Urgensi per Kategori Fasilitas
                                    </h3>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                        Tingkat keparahan (Darurat / Tinggi / Sedang / Rendah) pada tiap kelompok fasilitas resort
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => toggleViewMode('urgency_matrix')}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-[11px] text-slate-300 hover:text-white transition-colors"
                                    >
                                        {widgetViewModes.urgency_matrix === 'table' ? (
                                            <>
                                                <LayoutGrid className="w-3.5 h-3.5 text-teal-400" />
                                                <span>Mode Grafik</span>
                                            </>
                                        ) : (
                                            <>
                                                <Table className="w-3.5 h-3.5 text-amber-400" />
                                                <span>Mode ERP Tabel</span>
                                            </>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => toggleWidgetVisibility('urgency_matrix')}
                                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-700/50 transition-colors"
                                        title="Sembunyikan Matriks Urgensi"
                                    >
                                        <EyeOff className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {urgencyMatrixData.length === 0 ? (
                                <div className="py-12 text-center text-xs text-slate-500">
                                    Tidak ada data urgensi kategori pada periode ini.
                                </div>
                            ) : widgetViewModes.urgency_matrix === 'table' ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs text-slate-300">
                                        <thead className="bg-slate-900/80 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-700">
                                            <tr>
                                                <th className="py-2.5 px-3">Kategori</th>
                                                <th className="py-2.5 px-3 text-center text-rose-400 font-bold">Darurat</th>
                                                <th className="py-2.5 px-3 text-center text-orange-400 font-bold">Tinggi</th>
                                                <th className="py-2.5 px-3 text-center text-yellow-400 font-bold">Sedang</th>
                                                <th className="py-2.5 px-3 text-center text-emerald-400 font-bold">Rendah</th>
                                                <th className="py-2.5 px-3 text-right">Total Insiden</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {urgencyMatrixData.map((item) => (
                                                <tr key={item.category} className="hover:bg-slate-750/40">
                                                    <td className="py-2.5 px-3 font-semibold text-white">{item.category}</td>
                                                    <td className="py-2.5 px-3 text-center font-bold text-rose-400">{item.Darurat}</td>
                                                    <td className="py-2.5 px-3 text-center font-bold text-orange-400">{item.Tinggi}</td>
                                                    <td className="py-2.5 px-3 text-center font-bold text-yellow-400">{item.Sedang}</td>
                                                    <td className="py-2.5 px-3 text-center font-bold text-emerald-400">{item.Rendah}</td>
                                                    <td className="py-2.5 px-3 text-right font-bold text-slate-100">{item.total}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="h-72 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={urgencyMatrixData}
                                            margin={{ top: 10, right: 20, left: -10, bottom: 25 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e2e8f0"} vertical={false} />
                                            <XAxis
                                                dataKey="category"
                                                stroke={isDark ? "#cbd5e1" : "#475569"}
                                                fontSize={10}
                                                interval={0}
                                                angle={-15}
                                                textAnchor="end"
                                                height={40}
                                            />
                                            <YAxis stroke={isDark ? "#94a3b8" : "#64748b"} fontSize={10} allowDecimals={false} />
                                            <RechartsTooltip content={<CustomUrgencyTooltip />} cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)' }} />
                                            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                                            <Bar dataKey="Darurat" name="Darurat" stackId="a" fill="#f43f5e" />
                                            <Bar dataKey="Tinggi" name="Tinggi" stackId="a" fill="#fb923c" />
                                            <Bar dataKey="Sedang" name="Sedang" stackId="a" fill="#facc15" />
                                            <Bar dataKey="Rendah" name="Rendah" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    )}

                    {/* CHARTS ROW 3: ACTIONABLE AUDIT & MITIGATION FEED */}
                    {widgetVisibility.mitigation_feed !== false && (
                        <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-700/80">
                                <div>
                                    <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                                        Feed Audit Akar Masalah & Rekomendasi Mitigasi Pencegahan
                                    </h3>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                        Rekomendasi teknis yang dihasilkan AI untuk supervisor agar masalah tidak terulang kembali
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    {/* Search Filter */}
                                    <div className="relative min-w-[180px]">
                                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                        <input
                                            type="text"
                                            value={searchFilter}
                                            onChange={(e) => setSearchFilter(e.target.value)}
                                            placeholder="Cari mitigasi / lokasi..."
                                            className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>

                                    {/* Category Dropdown */}
                                    <select
                                        value={selectedCategory}
                                        onChange={(e) => setSelectedCategory(e.target.value)}
                                        className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                                    >
                                        <option value="all">Semua Kategori</option>
                                        {Object.keys(CATEGORY_COLORS).map((cat) => (
                                            <option key={cat} value={cat}>
                                                {cat}
                                            </option>
                                        ))}
                                    </select>

                                    <button
                                        type="button"
                                        onClick={() => toggleWidgetVisibility('mitigation_feed')}
                                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-700/50 transition-colors"
                                        title="Sembunyikan Feed Mitigasi"
                                    >
                                        <EyeOff className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                {/* Audit Cards Grid */}
                {mitigationFeed.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500">
                        Tidak ada catatan audit yang cocok dengan filter.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {mitigationFeed.map((issue) => {
                            const ai = issue.ai_analysis || {};
                            const urgency = issue.ai_urgency || 'Sedang';
                            const urgencyColor = URGENCY_COLORS[urgency] || '#facc15';

                            return (
                                <div
                                    key={issue.id}
                                    className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-700/80 hover:border-slate-600 transition-all flex flex-col justify-between space-y-3"
                                >
                                    <div>
                                        {/* Card Header: Location, Code, Urgency Badge */}
                                        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-mono text-[11px] font-bold text-amber-300 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                                                    #{issue.issue_code || ('LEAN-' + issue.id)}
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 bg-emerald-950/70 border border-emerald-800/60 px-2 py-0.5 rounded">
                                                    <MapPin className="w-3 h-3 text-emerald-400" />
                                                    {issue.location}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                                {issue.ai_is_minimal && (
                                                    <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                                                        Laporan Minim
                                                    </span>
                                                )}
                                                <span
                                                    className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                                                    style={{
                                                        backgroundColor: `${urgencyColor}20`,
                                                        borderColor: `${urgencyColor}50`,
                                                        color: urgencyColor,
                                                    }}
                                                >
                                                    ● {urgency}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Issue Title */}
                                        <h4 className="text-xs font-bold text-white mb-2">
                                            {issue.title}
                                        </h4>

                                        {/* Laporan Lapangan Awal (Perbandingan dengan Analisis AI) */}
                                        <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/90 mb-2">
                                            <div className="flex items-center justify-between gap-1 mb-1">
                                                <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                                                    <FileText className="w-3 h-3 text-sky-400" />
                                                    Deskripsi Laporan Awal (Staf / User):
                                                </span>
                                                {issue.reporter_name && (
                                                    <span className="text-[10px] text-slate-400 truncate max-w-[140px]">
                                                        Pelapor: {issue.reporter_name}
                                                    </span>
                                                )}
                                            </div>
                                            {issue.description ? (
                                                <>
                                                    <p className={`text-[11px] text-slate-300 leading-relaxed whitespace-pre-line ${!expandedDescriptions[issue.id] ? 'line-clamp-3' : ''}`}>
                                                        {issue.description}
                                                    </p>
                                                    {issue.description.length > 130 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedDescriptions(prev => ({ ...prev, [issue.id]: !prev[issue.id] }))}
                                                            className="mt-1 text-[10px] font-semibold text-sky-400 hover:text-sky-300 transition-colors inline-block"
                                                        >
                                                            {expandedDescriptions[issue.id] ? 'Tampilkan Lebih Sedikit' : 'Lihat Selengkapnya...'}
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-[11px] text-slate-500 italic">
                                                    (Hanya judul singkat, tidak ada rincian deskripsi tambahan dari pelapor)
                                                </p>
                                            )}
                                        </div>

                                        {/* AI Root Cause */}
                                        {ai.dugaan_akar_masalah && (
                                            <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 mb-2">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                                                    🔍 Dugaan Akar Masalah (RCA):
                                                </span>
                                                <p className="text-[11px] text-slate-300 leading-relaxed">
                                                    {ai.dugaan_akar_masalah}
                                                </p>
                                            </div>
                                        )}

                                        {/* AI Mitigation Recommendation */}
                                        {ai.tindakan_mitigasi_pencegahan && (
                                            <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/50">
                                                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-0.5">
                                                    🛡️ Saran Tindakan Mitigasi Audit:
                                                </span>
                                                <p className="text-[11px] text-emerald-200/90 leading-relaxed">
                                                    {ai.tindakan_mitigasi_pencegahan}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Footer Info: Category & Sparepart Badge */}
                                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                                        <span>
                                            Kategori: <strong className="text-slate-300">{issue.ai_category || 'Lain-lain'}</strong>
                                            {issue.ai_sub_category && ` (${issue.ai_sub_category})`}
                                        </span>
                                        <span>
                                            {ai.perlu_sparepart ? (
                                                <span className="text-amber-400 font-semibold bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/50">
                                                    Perlu Sparepart
                                                </span>
                                            ) : (
                                                <span className="text-slate-500">
                                                    Tanpa Sparepart
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        )}
    </div>
)}

            {/* ========================================================= */}
            {/* TAB 3: KINERJA OPERASIONAL & SLA (OPERATIONS)             */}
            {/* ========================================================= */}
            {activeTab === 'sla_performance' && (
                <div className="space-y-6">
                    {/* ROW 1: SLA & MTTR KPI METRICS */}
                    {widgetVisibility.sla_kpi !== false && (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {/* 1. MTTR Avg Hours */}
                            <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm relative overflow-hidden group">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-400">Rata-rata Resolusi (MTTR)</span>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => toggleWidgetVisibility('sla_kpi')}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-500 hover:text-rose-400"
                                            title="Sembunyikan Kartu SLA"
                                        >
                                            <EyeOff className="w-3 h-3" />
                                        </button>
                                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                                            <Clock className="w-4 h-4" />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-2 flex items-baseline gap-1.5">
                                    <span className="text-2xl font-black text-emerald-300">{mttrData.avgTurnaroundHours}</span>
                                    <span className="text-xs text-slate-400">Jam</span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1">
                                    {mttrData.resolvedWithTimeCount} tiket terselesaikan tercatat
                                </p>
                            </div>

                            {/* 2. First Response Speed */}
                            <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm relative overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-400">Respon Pertama (Awal)</span>
                                    <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
                                        <Activity className="w-4 h-4" />
                                    </div>
                                </div>
                                <div className="mt-2 flex items-baseline gap-1.5">
                                    <span className="text-2xl font-black text-sky-300">{mttrData.avgResponseHours}</span>
                                    <span className="text-xs text-slate-400">Jam</span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1">
                                    Kecepatan tiket mulai diproses staf
                                </p>
                            </div>

                            {/* 3. SLA Under 24h Rate */}
                            <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm relative overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-400">Kepatuhan SLA (&lt; 24 Jam)</span>
                                    <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center">
                                        <ShieldCheck className="w-4 h-4" />
                                    </div>
                                </div>
                                <div className="mt-2 flex items-baseline gap-1.5">
                                    <span className="text-2xl font-black text-teal-300">{mttrData.slaRate24h}%</span>
                                    <span className="text-xs text-slate-400">tuntas cepat</span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1">
                                    {mttrData.slaUnder2h + mttrData.slaUnder24h} tiket tuntas tanpa tertunda
                                </p>
                            </div>

                            {/* 4. Complex / Delayed > 24h */}
                            <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm relative overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-400">Isu Tertunda (&gt; 24 Jam)</span>
                                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                                        <AlertTriangle className="w-4 h-4" />
                                    </div>
                                </div>
                                <div className="mt-2 flex items-baseline gap-1.5">
                                    <span className="text-2xl font-black text-amber-300">{mttrData.slaOver24h}</span>
                                    <span className="text-xs text-slate-400">kasus kompleks</span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1">
                                    Membutuhkan sparepart / logistik pulau
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ROW 2: MTTR PER DEPARTMENT & DEPARTMENT WORKLOAD */}
                    <div className="space-y-3">
                        {/* Scope Toolbar Filter for All Master Departments vs Active Departments */}
                        <div className="flex items-center justify-between flex-wrap gap-2 px-1">
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    Cakupan Departemen:
                                </span>
                                <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {showAllMasterDepts 
                                        ? `Menampilkan seluruh ${departments.length || 11} divisi resmi resort`
                                        : `Menampilkan ${departmentData.length} divisi yang memiliki aktivitas tiket`}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAllMasterDepts(prev => !prev)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                                    showAllMasterDepts
                                        ? isDark 
                                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-sm'
                                            : 'bg-sky-100 text-sky-800 border-sky-300 shadow-sm'
                                        : isDark
                                            ? 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white'
                                            : 'bg-white text-slate-600 border-slate-300 hover:text-slate-900 shadow-sm'
                                }`}
                                title={showAllMasterDepts ? 'Klik untuk hanya melihat divisi dengan isu aktif' : 'Klik untuk melihat seluruh divisi resort'}
                            >
                                <Users className="w-3.5 h-3.5" />
                                <span>{showAllMasterDepts ? 'Filter: Hanya Divisi Berisu' : 'Tampilkan Seluruh Divisi Resort'}</span>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* MTTR SPEED PER DEPT */}
                            {widgetVisibility.mttr_analytics !== false && (
                                <div className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between ${
                                    isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
                                }`}>
                                    <div className={`flex items-center justify-between pb-2 border-b ${
                                        isDark ? 'border-slate-700/60' : 'border-slate-200'
                                    }`}>
                                        <div>
                                            <h3 className={`text-xs font-bold flex items-center gap-1.5 ${
                                                isDark ? 'text-white' : 'text-slate-900'
                                            }`}>
                                                <Clock className="w-4 h-4 text-sky-400" />
                                                Kecepatan MTTR per Departemen
                                            </h3>
                                            <p className={`text-[11px] mt-0.5 ${
                                                isDark ? 'text-slate-400' : 'text-slate-500'
                                            }`}>
                                                Rata-rata waktu penyelesaian tiket (jam) tiap divisi
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => toggleViewMode('mttr_analytics')}
                                                className={`flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] transition-colors ${
                                                    isDark 
                                                        ? 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white' 
                                                        : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900'
                                                }`}
                                                title={widgetViewModes.mttr_analytics === 'table' ? 'Tampilkan Mode Grafik' : 'Tampilkan Mode ERP Tabel'}
                                            >
                                                {widgetViewModes.mttr_analytics === 'table' ? (
                                                    <>
                                                        <LayoutGrid className="w-3.5 h-3.5 text-teal-400" />
                                                        <span className="hidden sm:inline">Grafik</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Table className="w-3.5 h-3.5 text-amber-400" />
                                                        <span className="hidden sm:inline">Tabel ERP</span>
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleWidgetVisibility('mttr_analytics')}
                                                className={`p-1.5 rounded-lg transition-colors ${
                                                    isDark ? 'text-slate-400 hover:text-rose-400 hover:bg-slate-700/50' : 'text-slate-500 hover:text-rose-600 hover:bg-slate-100'
                                                }`}
                                                title="Sembunyikan Analisa MTTR"
                                            >
                                                <EyeOff className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {mttrData.deptMttrList.length === 0 ? (
                                        <div className="py-16 text-center text-xs text-slate-500">
                                            Belum ada data departemen pada periode ini.
                                        </div>
                                    ) : widgetViewModes.mttr_analytics === 'table' ? (
                                        <div className="overflow-x-auto mt-2">
                                            <table className="w-full text-left text-xs">
                                                <thead className={`text-[11px] uppercase tracking-wider border-b ${
                                                    isDark ? 'bg-slate-900/80 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                                                }`}>
                                                    <tr>
                                                        <th className="py-2.5 px-3">Departemen</th>
                                                        <th className="py-2.5 px-3 text-right">Tiket Selesai</th>
                                                        <th className="py-2.5 px-3 text-center">Pending / Sparepart</th>
                                                        <th className="py-2.5 px-3 text-right">Rata-rata MTTR</th>
                                                        <th className="py-2.5 px-3 text-center">Status Kecepatan</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={`divide-y ${isDark ? 'divide-slate-800 text-slate-300' : 'divide-slate-200 text-slate-700'}`}>
                                                    {mttrData.deptMttrList.map((d) => (
                                                        <tr key={d.department} className={isDark ? 'hover:bg-slate-750/40' : 'hover:bg-slate-50'}>
                                                            <td className={`py-2 px-3 font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{d.department}</td>
                                                            <td className={`py-2 px-3 text-right font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{d.solvedCount}</td>
                                                            <td className="py-2 px-3 text-center">
                                                                {d.pendingCount > 0 ? (
                                                                    <span
                                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm"
                                                                        title={`${d.pendingCount} tiket mengalami penundaan pending atau butuh suku cadang`}
                                                                    >
                                                                        ⏸️ {d.pendingCount} Tertunda
                                                                    </span>
                                                                ) : (
                                                                    <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                                        0 Kasus (Lancar)
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className={`py-2 px-3 text-right font-bold ${
                                                                d.avgHours !== null 
                                                                    ? (isDark ? 'text-sky-400' : 'text-sky-600') 
                                                                    : (isDark ? 'text-slate-500' : 'text-slate-400')
                                                            }`}>
                                                                {d.avgHours !== null ? `${d.avgHours} Jam` : '—'}
                                                            </td>
                                                            <td className="py-2 px-3 text-center">
                                                                {d.statusType === 'fast' ? (
                                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                                                        Sangat Cepat
                                                                    </span>
                                                                ) : d.statusType === 'normal' ? (
                                                                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/40">
                                                                        Standar
                                                                    </span>
                                                                ) : d.statusType === 'pending_delay' ? (
                                                                    <div className="inline-flex flex-col items-center">
                                                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                                                                            Tertunda Pending / Sparepart
                                                                        </span>
                                                                        <span className={`text-[9px] mt-0.5 font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                            Wajar (Kendala logistik/part)
                                                                        </span>
                                                                    </div>
                                                                ) : d.statusType === 'in_progress_only' ? (
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                                                        isDark ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                                                    }`}>
                                                                        Sedang Berjalan
                                                                    </span>
                                                                ) : d.statusType === 'no_issues' ? (
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-normal ${
                                                                        isDark ? 'text-slate-400 bg-slate-900/60 border border-slate-700/60' : 'text-slate-500 bg-slate-100 border border-slate-200'
                                                                    }`}>
                                                                        Belum Ada Isu
                                                                    </span>
                                                                ) : (
                                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
                                                                        Perlu Evaluasi
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="h-64 w-full mt-2">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart
                                                    data={mttrData.deptMttrList.filter((d) => d.avgHours !== null)}
                                                    layout="vertical"
                                                    margin={{ top: 10, right: 25, left: 20, bottom: 5 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} horizontal={false} />
                                                    <XAxis type="number" stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={10} unit="h" />
                                                    <YAxis type="category" dataKey="department" stroke={isDark ? '#cbd5e1' : '#334155'} fontSize={11} width={80} />
                                                    <RechartsTooltip content={<CustomMttrTooltip />} cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)' }} />
                                                    <Bar dataKey="avgHours" name="Rata-rata Durasi (Jam)" fill="#38bdf8" radius={[0, 4, 4, 0]}>
                                                        <LabelList dataKey="avgHours" position="right" fill={isDark ? '#93c5fd' : '#0284c7'} fontSize={10} fontWeight={600} formatter={(val) => `${val}h`} />
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* DEPARTMENT WORKLOAD */}
                            {widgetVisibility.dept_workload !== false && (
                                <div className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between ${
                                    isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
                                }`}>
                                    <div className={`flex items-center justify-between pb-2 border-b ${
                                        isDark ? 'border-slate-700/60' : 'border-slate-200'
                                    }`}>
                                        <div>
                                            <h3 className={`text-xs font-bold flex items-center gap-1.5 ${
                                                isDark ? 'text-white' : 'text-slate-900'
                                            }`}>
                                                <Briefcase className="w-4 h-4 text-emerald-400" />
                                                Laporan Beban per Departemen
                                            </h3>
                                            <p className={`text-[11px] mt-0.5 ${
                                                isDark ? 'text-slate-400' : 'text-slate-500'
                                            }`}>
                                                Distribusi tiket aktif vs terselesaikan tiap divisi
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => toggleViewMode('dept_workload')}
                                                className={`flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] transition-colors ${
                                                    isDark 
                                                        ? 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white' 
                                                        : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900'
                                                }`}
                                                title={widgetViewModes.dept_workload === 'table' ? 'Tampilkan Mode Grafik' : 'Tampilkan Mode ERP Tabel'}
                                            >
                                                {widgetViewModes.dept_workload === 'table' ? (
                                                    <>
                                                        <LayoutGrid className="w-3.5 h-3.5 text-teal-400" />
                                                        <span className="hidden sm:inline">Grafik</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Table className="w-3.5 h-3.5 text-amber-400" />
                                                        <span className="hidden sm:inline">Tabel ERP</span>
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleWidgetVisibility('dept_workload')}
                                                className={`p-1.5 rounded-lg transition-colors ${
                                                    isDark ? 'text-slate-400 hover:text-rose-400 hover:bg-slate-700/50' : 'text-slate-500 hover:text-rose-600 hover:bg-slate-100'
                                                }`}
                                                title="Sembunyikan Beban Departemen"
                                            >
                                                <EyeOff className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {departmentData.length === 0 ? (
                                        <div className="py-16 text-center text-xs text-slate-500">
                                            Belum ada data tiket departemen pada periode ini.
                                        </div>
                                    ) : widgetViewModes.dept_workload === 'table' ? (
                                        <div className="overflow-x-auto mt-2">
                                            <table className="w-full text-left text-xs">
                                                <thead className={`text-[11px] uppercase tracking-wider border-b ${
                                                    isDark ? 'bg-slate-900/80 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                                                }`}>
                                                    <tr>
                                                        <th className="py-2.5 px-3">Departemen</th>
                                                        <th className="py-2.5 px-3 text-center text-rose-500 font-bold">Open</th>
                                                        <th className="py-2.5 px-3 text-center text-sky-500 font-bold">Diproses</th>
                                                        <th className="py-2.5 px-3 text-center text-emerald-500 font-bold">Selesai</th>
                                                        <th className="py-2.5 px-3 text-right">Total Beban</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={`divide-y ${isDark ? 'divide-slate-800 text-slate-300' : 'divide-slate-200 text-slate-700'}`}>
                                                    {departmentData.map((d) => (
                                                        <tr key={d.department} className={isDark ? 'hover:bg-slate-750/40' : 'hover:bg-slate-50'}>
                                                            <td className={`py-2 px-3 font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{d.department}</td>
                                                            <td className="py-2 px-3 text-center font-bold text-rose-500">{d.open}</td>
                                                            <td className="py-2 px-3 text-center font-bold text-sky-500">{d.in_progress}</td>
                                                            <td className="py-2 px-3 text-center font-bold text-emerald-500">{d.resolved}</td>
                                                            <td className={`py-2 px-3 text-right font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{d.total}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="h-64 w-full mt-2">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart
                                                    data={departmentData}
                                                    margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} vertical={false} />
                                                    <XAxis dataKey="department" stroke={isDark ? '#cbd5e1' : '#334155'} fontSize={11} interval={0} angle={-15} textAnchor="end" height={35} />
                                                    <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={10} allowDecimals={false} />
                                                    <RechartsTooltip content={<CustomDeptTooltip />} cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)' }} />
                                                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                                                    <Bar dataKey="open" name="Belum Selesai" stackId="a" fill="#f43f5e" />
                                                    <Bar dataKey="in_progress" name="Sedang Diproses" stackId="a" fill="#38bdf8" />
                                                    <Bar dataKey="resolved" name="Selesai" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
