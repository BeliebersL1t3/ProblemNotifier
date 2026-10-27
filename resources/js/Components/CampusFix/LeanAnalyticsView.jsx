import React, { useMemo, useState } from 'react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
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
} from 'lucide-react';
import { TPI_MASTERPLAN_ZONES } from '@/constants/locations';

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

// Custom Tooltip for Pareto: integer counts only, clean layout
const CustomParetoTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0];
    return (
        <div className="bg-slate-900 border border-slate-700/80 rounded-lg p-2.5 shadow-xl text-xs">
            <p className="font-bold text-white mb-1">{item.payload?.name}</p>
            <div className="flex items-center justify-between gap-4 text-emerald-400">
                <span className="text-slate-300">Jumlah Kasus:</span>
                <span className="font-bold text-white">{item.value}</span>
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

// --- Denah Arsitektural Masterplan TPI (Telunas Private Island) ---
function TpiResortMap({ zones = [], onSelectZone, selectedZoneId }) {
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
            <div className="relative w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-700/80 shadow-2xl select-none group">
                {/* HUD Toolbar */}
                <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 backdrop-blur-md shadow-lg">
                    <button
                        type="button"
                        onClick={() => setFilterMode(prev => prev === 'all' ? 'active' : 'all')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                            filterMode === 'active'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'text-slate-300 hover:text-white hover:bg-slate-800'
                        }`}
                        title="Filter hanya lokasi dengan isu aktif"
                    >
                        {filterMode === 'active' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        <span>{filterMode === 'active' ? 'Hanya Isu Aktif' : 'Semua 22 Titik'}</span>
                    </button>
                    <div className="h-4 w-px bg-slate-700 mx-0.5" />
                    <button
                        type="button"
                        onClick={handleZoomIn}
                        disabled={zoom >= 2.5}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
                        title="Perbesar Denah"
                    >
                        <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={handleZoomOut}
                        disabled={zoom <= 1}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
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

                {/* Blueprint Map Container with Pan/Zoom overflow */}
                <div className="relative w-full overflow-auto max-h-[640px] bg-[#fbf9f4]">
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
                <div className="px-4 py-2.5 bg-slate-900/95 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200">Denah Spasial Resmi Pulau Telunas</span>
                        <span className="text-[11px] text-slate-500">• 22 Titik Fasilitas Terpetakan</span>
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
                            <span className="w-2 h-2 rounded-full bg-slate-600" /> Tidak Ada Isu
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Denah Vektor Arsitektural TBR (Telunas Beach Resort) ---
function TbrResortMap({ zones = [] }) {
    return (
        <div className="relative w-full aspect-[16/9] min-h-[380px] max-h-[520px] rounded-xl overflow-hidden bg-gradient-to-b from-[#02182c] via-[#04243f] to-[#011425] border border-slate-700/80 shadow-inner select-none flex items-center justify-center p-2">
            <svg viewBox="0 0 800 450" className="w-full h-full object-contain pointer-events-none">
                <defs>
                    <linearGradient id="tbr-land-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#047857" />
                        <stop offset="100%" stopColor="#064e3b" />
                    </linearGradient>
                    <linearGradient id="tbr-beach-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#ca8a04" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#a16207" stopOpacity="0.1" />
                    </linearGradient>
                </defs>

                <rect width="800" height="450" fill="#031728" />

                {/* Mainland Top Half */}
                <path
                    d="M 0 0 L 800 0 L 800 130 C 650 145, 450 135, 300 140 C 150 145, 50 135, 0 130 Z"
                    fill="url(#tbr-land-grad)"
                    stroke="#059669"
                    strokeWidth="1.5"
                />

                {/* White Sandy Beach Shoreline */}
                <path
                    d="M 0 130 C 150 145, 350 140, 500 142 C 680 140, 750 135, 800 130 L 800 175 C 680 185, 480 180, 320 182 C 160 185, 50 175, 0 170 Z"
                    fill="url(#tbr-beach-grad)"
                />

                {/* Long Pier stretching straight into the ocean */}
                <line x1="400" y1="140" x2="400" y2="390" stroke="#b45309" strokeWidth="6" strokeLinecap="round" />
                <line x1="400" y1="140" x2="400" y2="390" stroke="#78350f" strokeWidth="9" strokeDasharray="3 14" />

                {/* Chalet branches on the Pier */}
                <line x1="330" y1="230" x2="470" y2="230" stroke="#b45309" strokeWidth="4" />
                <line x1="330" y1="285" x2="470" y2="285" stroke="#b45309" strokeWidth="4" />
                <line x1="330" y1="340" x2="470" y2="340" stroke="#b45309" strokeWidth="4" />

                {/* Overwater Chalet Silhouettes on Pier */}
                {[
                    { x: 310, y: 230 }, { x: 490, y: 230 },
                    { x: 310, y: 285 }, { x: 490, y: 285 },
                    { x: 310, y: 340 }, { x: 490, y: 340 },
                ].map((c, i) => (
                    <rect key={i} x={c.x - 12} y={c.y - 8} width="24" height="16" rx="2" fill="#92400e" stroke="#d97706" strokeWidth="1" />
                ))}

                {/* Large Overwater Lodge / Restaurant at Pierhead */}
                <rect x="355" y="380" width="90" height="45" rx="3" fill="#78350f" stroke="#f59e0b" strokeWidth="2" />
                <circle cx="400" cy="402" r="4" fill="#38bdf8" />

                {/* East Arrival Dock Pier */}
                <line x1="580" y1="150" x2="650" y2="200" stroke="#b45309" strokeWidth="4" strokeLinecap="round" />
                <rect x="640" y="190" width="30" height="22" rx="2" fill="#78350f" stroke="#d97706" strokeWidth="1" />

                {/* Beach Activities and Land Facilities */}
                <rect x="370" y="115" width="60" height="25" rx="2" fill="#047857" stroke="#10b981" strokeWidth="1" />
                <rect x="250" y="90" width="45" height="25" rx="2" fill="#1e293b" stroke="#64748b" strokeWidth="1" />
                <rect x="160" y="70" width="40" height="25" rx="2" fill="#1e293b" stroke="#64748b" strokeWidth="1" />
                <rect x="520" y="70" width="40" height="25" rx="2" fill="#1e293b" stroke="#64748b" strokeWidth="1" />

                {/* Compass Rose */}
                <g transform="translate(60, 60)" opacity="0.6">
                    <circle cx="0" cy="0" r="22" fill="#0f172a" stroke="#334155" strokeWidth="1" />
                    <polygon points="0,-18 5,-4 0,0 -5,-4" fill="#f43f5e" />
                    <polygon points="0,18 5,4 0,0 -5,4" fill="#94a3b8" />
                    <polygon points="18,0 4,5 0,0 4,-5" fill="#94a3b8" />
                    <polygon points="-18,0 -4,5 0,0 -4,-5" fill="#94a3b8" />
                    <text x="0" y="-22" textAnchor="middle" fill="#f43f5e" fontSize="9" fontWeight="bold">U</text>
                </g>

                {/* Watermark Label */}
                <text x="750" y="430" textAnchor="end" fill="#64748b" fontSize="10" fontWeight="bold" letterSpacing="1">
                    TELUNAS BEACH RESORT (TBR)
                </text>
            </svg>

            {/* Hotspot Zone Badges */}
            {zones.map((zone) => {
                const count = zone.count || 0;
                const urgency = zone.highestUrgency;
                const color = urgency ? (URGENCY_COLORS[urgency] || '#facc15') : '#10b981';

                return (
                    <div
                        key={zone.id}
                        className="absolute transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900/90 border border-slate-700/90 shadow-xl text-[10px] font-semibold text-white whitespace-nowrap backdrop-blur-md pointer-events-none"
                        style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
                    >
                        {count > 0 ? (
                            <span className="relative flex h-2 w-2 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }} />
                                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
                            </span>
                        ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                        )}
                        <span className="truncate max-w-[130px]">{zone.name}</span>
                        {count > 0 && (
                            <span
                                className="px-1.5 py-0.2 rounded font-bold text-[9px] border leading-none"
                                style={{
                                    backgroundColor: `${color}25`,
                                    borderColor: `${color}60`,
                                    color: color,
                                }}
                            >
                                {count}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export function LeanAnalyticsView({
    issues = [],
    aiPendingCount = 0,
    onRetryAi,
    isRetrying = false,
}) {
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchFilter, setSearchFilter] = useState('');
    const [hotspotTab, setHotspotTab] = useState('leaderboard'); // 'leaderboard' (default) | 'tpi' | 'tbr' | 'chart'
    const [selectedTpiZone, setSelectedTpiZone] = useState(null);
    
    // Time Range Filter states
    const [timeRange, setTimeRange] = useState('all'); // 'all' | 'today' | '7d' | '30d' | '6m' | '1y' | 'custom'
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    
    // Google Sheets Sync states
    const [isSyncingSheets, setIsSyncingSheets] = useState(false);
    const [syncFeedback, setSyncFeedback] = useState(null);

    // Filter issues reactively by selected time range
    const filteredIssues = useMemo(() => {
        if (timeRange === 'all') return issues;

        let minDate = null;
        let maxDate = new Date();
        maxDate.setHours(23, 59, 59, 999);

        if (timeRange === 'today') {
            minDate = new Date();
            minDate.setHours(0, 0, 0, 0);
        } else if (timeRange === '7d') {
            minDate = new Date();
            minDate.setDate(minDate.getDate() - 7);
            minDate.setHours(0, 0, 0, 0);
        } else if (timeRange === '30d') {
            minDate = new Date();
            minDate.setDate(minDate.getDate() - 30);
            minDate.setHours(0, 0, 0, 0);
        } else if (timeRange === '6m') {
            minDate = new Date();
            minDate.setMonth(minDate.getMonth() - 6);
            minDate.setHours(0, 0, 0, 0);
        } else if (timeRange === '1y') {
            minDate = new Date();
            minDate.setFullYear(minDate.getFullYear() - 1);
            minDate.setHours(0, 0, 0, 0);
        } else if (timeRange === 'custom') {
            if (startDate) {
                minDate = new Date(startDate);
                minDate.setHours(0, 0, 0, 0);
            }
            if (endDate) {
                maxDate = new Date(endDate);
                maxDate.setHours(23, 59, 59, 999);
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

    // Handler to trigger full sync to Google Sheets
    const handleSyncSheets = async () => {
        setIsSyncingSheets(true);
        setSyncFeedback(null);
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
            setSyncFeedback({
                type: data.success ? 'success' : 'error',
                message: data.message || (data.success ? 'Sinkronisasi berhasil!' : 'Sinkronisasi gagal.'),
            });
        } catch (err) {
            setSyncFeedback({
                type: 'error',
                message: 'Gagal menghubungi server untuk sinkronisasi Google Sheets.',
            });
        } finally {
            setIsSyncingSheets(false);
            setTimeout(() => setSyncFeedback(null), 6000);
        }
    };

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

    // --- 2. Pareto Chart Data (Top 7 Sub-Categories) ---
    const paretoData = useMemo(() => {
        const counts = {};
        filteredIssues.forEach((i) => {
            const sub = i.ai_sub_category || i.title || 'Lain-lain';
            counts[sub] = (counts[sub] || 0) + 1;
        });

        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 7);
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
                return {
                    ...item,
                    departments: Array.from(item.departments),
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
    }, [filteredIssues]);

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

        const tbrZones = {
            'pierhead_dining': { id: 'pierhead_dining', name: 'Lodge Overwater Dining', resort: 'TBR', x: 50, y: 88, count: 0, highestUrgency: null, issues: [] },
            'pier_villas_w':   { id: 'pier_villas_w', name: 'Overwater Chalets (Barat)', resort: 'TBR', x: 36, y: 58, count: 0, highestUrgency: null, issues: [] },
            'pier_villas_e':   { id: 'pier_villas_e', name: 'Overwater Chalets (Timur)', resort: 'TBR', x: 64, y: 58, count: 0, highestUrgency: null, issues: [] },
            'beach_front':     { id: 'beach_front', name: 'Beach Reception & Activities', resort: 'TBR', x: 50, y: 28, count: 0, highestUrgency: null, issues: [] },
            'kitchen':         { id: 'kitchen', name: 'Restoran & Dapur TBR', resort: 'TBR', x: 32, y: 22, count: 0, highestUrgency: null, issues: [] },
            'jetty':           { id: 'jetty', name: 'Dermaga Boat TBR', resort: 'TBR', x: 80, y: 44, count: 0, highestUrgency: null, issues: [] },
            'genset':          { id: 'genset', name: 'Genset & Utilitas TBR', resort: 'TBR', x: 68, y: 16, count: 0, highestUrgency: null, issues: [] },
            'staff':           { id: 'staff', name: 'Mes Staf TBR', resort: 'TBR', x: 22, y: 16, count: 0, highestUrgency: null, issues: [] },
        };

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
                if (loc.includes('dining') || loc.includes('restoran') || loc.includes('lodge') || aiZone === 'Dining Room') {
                    matchedKey = 'pierhead_dining';
                } else if (loc.includes('chalet') || loc.includes('villa') || loc.includes('kamar') || aiZone === 'Vila Terapung') {
                    matchedKey = 'pier_villas_w';
                } else if (loc.includes('dock') || loc.includes('boat') || loc.includes('dermaga') || aiZone === 'Dermaga Jetty') {
                    matchedKey = 'jetty';
                } else if (loc.includes('kitchen') || loc.includes('dapur') || aiZone === 'Kitchen & Dapur') {
                    matchedKey = 'kitchen';
                } else if (loc.includes('genset') || loc.includes('panel') || loc.includes('listrik') || aiZone === 'Genset & Utilitas') {
                    matchedKey = 'genset';
                } else if (loc.includes('staf') || loc.includes('mes') || aiZone === 'Mes Staf') {
                    matchedKey = 'staff';
                } else {
                    matchedKey = 'beach_front';
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
            <div className="bg-slate-900/95 border border-slate-700/80 rounded-2xl p-4 shadow-xl backdrop-blur space-y-3.5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Time Range Filter Buttons */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mr-2">
                            <Clock className="w-3.5 h-3.5 text-teal-400" />
                            Periode:
                        </span>
                        {[
                            { id: 'hari_ini', label: 'Hari Ini' },
                            { id: '7_hari', label: '7 Hari' },
                            { id: '30_hari', label: '30 Hari' },
                            { id: '6_bulan', label: '6 Bulan' },
                            { id: '1_tahun', label: '1 Tahun' },
                            { id: 'all', label: 'Semua' },
                            { id: 'custom', label: 'Kustom Tanggal' },
                        ].map((btn) => (
                            <button
                                key={btn.id}
                                type="button"
                                onClick={() => setTimeRange(btn.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    timeRange === btn.id
                                        ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                                }`}
                            >
                                {btn.label}
                            </button>
                        ))}
                    </div>

                    {/* Google Sheets Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={handleSyncSheets}
                            disabled={isSyncingSheets}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                            title="Kirim semua data tiket dan lokasi terkini ke Google Sheets"
                        >
                            <FileSpreadsheet className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                            <span>{isSyncingSheets ? 'Menyinkronkan...' : 'Sinkronkan Google Sheets'}</span>
                        </button>

                        <a
                            href="https://docs.google.com/spreadsheets/d/1o8SPuryJf__V1DJp6bm1MTRj60pkIsSX1GYr4-iJvhI/edit?usp=sharing"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition"
                            title="Buka Spreadsheet Log Tiket Masalah"
                        >
                            <span>Sheet Tiket</span>
                            <ExternalLink className="w-3 h-3 text-slate-400" />
                        </a>

                        <a
                            href="https://docs.google.com/spreadsheets/d/1-LiBd1vd8_YA4aTJsf0EiynuayX1_TE800Ylkr4BX5I/edit?usp=sharing"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition"
                            title="Buka Spreadsheet Master Lokasi Hotspot"
                        >
                            <span>Sheet Lokasi</span>
                            <ExternalLink className="w-3 h-3 text-slate-400" />
                        </a>
                    </div>
                </div>

                {/* Custom Date Range Pickers & Info row */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    {timeRange === 'custom' ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-slate-400">Dari:</span>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-white text-xs focus:outline-none focus:border-teal-500"
                            />
                            <span className="text-slate-400">Sampai:</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-white text-xs focus:outline-none focus:border-teal-500"
                            />
                        </div>
                    ) : (
                        <div className="text-slate-400 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span>Menampilkan <strong>{filteredIssues.length}</strong> dari <strong>{issues.length}</strong> total tiket</span>
                        </div>
                    )}

                    {syncFeedback && (
                        <div
                            className={`px-3 py-1 rounded-md text-xs font-medium ${
                                syncFeedback.type === 'success'
                                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                                    : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                            }`}
                        >
                            {syncFeedback.message}
                        </div>
                    )}
                </div>
            </div>

            {/* TOP KPI CARDS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Total & AI Coverage */}
                <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400">Total Tiket Terekam</span>
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <Layers className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-white">{stats.total}</span>
                        <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/50">
                            {stats.analyzed} Dianalisis AI
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                        {stats.resolved} tiket telah diselesaikan tim
                    </p>
                </div>

                {/* Top Category */}
                <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400">Kategori Dominan</span>
                        <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
                            <Sparkles className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-2">
                        <span className="text-base font-bold text-sky-300 truncate block">
                            {stats.topCat}
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                        Menyumbang {stats.topCatCount} laporan ({stats.total > 0 ? Math.round((stats.topCatCount / stats.total) * 100) : 0}%)
                    </p>
                </div>

                {/* Hotspot Location */}
                <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400">Titik Hotspot Masalah</span>
                        <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                            <Flame className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-2">
                        <span className="text-base font-bold text-rose-300 truncate block">
                            {stats.topLoc}
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                        {stats.topLocCount} insiden tercatat di lokasi ini
                    </p>
                </div>

                {/* Sparepart Dependency */}
                <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400">Ketergantungan Suku Cadang</span>
                        <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                            <Package className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-amber-300">{stats.sparepartRatio}%</span>
                        <span className="text-[11px] text-slate-400">kasus butuh part</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                        Audit kesiapan stok logistik pulau
                    </p>
                </div>
            </div>

            {/* CHARTS ROW 1: PARETO (TOP SUB-CATEGORIES) & CATEGORY DONUT */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* 1. PARETO HORIZONTAL BAR */}
                <div className="lg:col-span-2 p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                Analisa Pareto: Top Masalah Berulang (80/20 Rule)
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                                Sub-kategori kerusakan yang paling sering terjadi dan membutuhkan audit peremajaan unit
                            </p>
                        </div>
                    </div>

                    {paretoData.length === 0 ? (
                        <div className="py-12 text-center text-xs text-slate-500">
                            Belum ada data sub-kategori untuk ditampilkan.
                        </div>
                    ) : (
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    layout="vertical"
                                    data={paretoData}
                                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                                    <XAxis
                                        type="number"
                                        stroke="#94a3b8"
                                        fontSize={10}
                                        allowDecimals={false}
                                        domain={[0, (dataMax) => Math.max(1, dataMax)]}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        stroke="#cbd5e1"
                                        fontSize={11}
                                        width={120}
                                        tickFormatter={(val) => (val.length > 18 ? val.substring(0, 18) + '...' : val)}
                                    />
                                    <RechartsTooltip
                                        cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                                        content={<CustomParetoTooltip />}
                                    />
                                    <Bar dataKey="count" name="Jumlah Kasus" fill="#10b981" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* 2. CATEGORY DONUT */}
                <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm flex flex-col">
                    <div className="mb-2">
                        <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-sky-400" />
                            Distribusi Kategori Fasilitas
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            Proporsi beban pemeliharaan resort
                        </p>
                    </div>

                    {categoryData.length === 0 ? (
                        <div className="py-12 text-center text-xs text-slate-500 flex-1 flex items-center justify-center">
                            Belum ada kategori yang terdata.
                        </div>
                    ) : (
                        <div className="h-56 w-full relative flex-1">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={categoryData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={45}
                                        outerRadius={75}
                                        paddingAngle={3}
                                        dataKey="value"
                                    >
                                        {categoryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Compact Legend */}
                    <div className="mt-2 flex flex-wrap gap-1.5 justify-center">
                        {categoryData.map((item) => (
                            <span
                                key={item.name}
                                className="inline-flex items-center gap-1 text-[10px] text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/60"
                            >
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                {item.name}: <strong>{item.value}</strong>
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* CHARTS ROW 2: LAPORAN BEBAN PER DEPARTEMEN */}
            <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                        <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Briefcase className="w-4 h-4 text-sky-400" />
                            Laporan Beban per Departemen
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            Monitoring volume tiket penanganan departemen berdasarkan status pengerjaan (Open, On Progress, Selesai)
                        </p>
                    </div>
                    {/* Status Legend & Quick Summary */}
                    <div className="flex items-center gap-3 flex-wrap text-[10px]">
                        <span className="flex items-center gap-1 text-slate-300">
                            <span className="w-2 h-2 rounded bg-amber-500" /> Belum Diambil ({deptSummary.open})
                        </span>
                        <span className="flex items-center gap-1 text-slate-300">
                            <span className="w-2 h-2 rounded bg-sky-500" /> Sedang Dikerjakan ({deptSummary.in_progress})
                        </span>
                        <span className="flex items-center gap-1 text-slate-300">
                            <span className="w-2 h-2 rounded bg-emerald-500" /> Selesai ({deptSummary.resolved})
                        </span>
                    </div>
                </div>

                {departmentData.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500">
                        Belum ada data departemen untuk dianalisa.
                    </div>
                ) : (
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={departmentData} maxBarSize={48} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                <XAxis dataKey="department" stroke="#94a3b8" fontSize={11} />
                                <YAxis
                                    stroke="#94a3b8"
                                    fontSize={10}
                                    allowDecimals={false}
                                    domain={[0, (dataMax) => Math.max(1, dataMax)]}
                                />
                                <RechartsTooltip
                                    cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                                    content={<CustomDeptTooltip />}
                                />
                                <Bar dataKey="open" name="Belum Diambil" stackId="dept" fill="#f59e0b" />
                                <Bar dataKey="in_progress" name="Sedang Dikerjakan" stackId="dept" fill="#0ea5e9" />
                                <Bar dataKey="resolved" name="Selesai" stackId="dept" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* CHARTS ROW 3: HOTSPOT LOKASI & DENAH RESORT (TABBED) */}
            <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b border-slate-700/60">
                    <div>
                        <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-rose-400" />
                            Matriks Hotspot Lokasi & Peta Denah Resort
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            Visualisasi sebaran masalah pada unit/villa Telunas (Grafik analitik & denah spasial TPI/TBR)
                        </p>
                    </div>

                    {/* View Switcher Tabs (Default: Leaderboard Peringkat Risiko) */}
                    <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-700 self-start md:self-auto flex-wrap">
                        <button
                            type="button"
                            onClick={() => setHotspotTab('leaderboard')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                hotspotTab === 'leaderboard'
                                    ? 'bg-rose-500 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
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
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
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
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
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
                                    ? 'bg-slate-700 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                            }`}
                        >
                            <BarChart2 className="w-3.5 h-3.5" />
                            <span>Grafik Balok</span>
                        </button>
                    </div>
                </div>

                {/* TAB 1: PERINGKAT RISIKO LOKASI (LEADERBOARD - DEFAULT) */}
                {hotspotTab === 'leaderboard' && (
                    <div className="space-y-3">
                        {/* Summary Bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900/60 border border-slate-700/60 text-xs">
                            <span className="text-slate-300 flex items-center gap-1.5">
                                <Flame className="w-4 h-4 text-rose-400 shrink-0" />
                                Lokasi diurutkan berdasarkan <strong>Tingkat Keparahan Kritis</strong> (Darurat & Tinggi otomatis di posisi teratas)
                            </span>
                            <div className="flex items-center gap-2.5 flex-wrap text-[10px]">
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

                                    const urgencyBadge = {
                                        Darurat: { bg: 'bg-rose-500/20 text-rose-300 border-rose-500/50', dot: 'bg-rose-500' },
                                        Tinggi:  { bg: 'bg-orange-500/20 text-orange-300 border-orange-500/50', dot: 'bg-orange-400' },
                                        Sedang:  { bg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50', dot: 'bg-yellow-400' },
                                        Rendah:  { bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50', dot: 'bg-emerald-500' },
                                    }[item.highestUrgency] || { bg: 'bg-slate-700 text-slate-300 border-slate-600', dot: 'bg-slate-400' };

                                    return (
                                        <div
                                            key={item.location}
                                            className={`p-3.5 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                                                item.highestUrgency === 'Darurat'
                                                    ? 'bg-rose-950/25 border-rose-500/40 hover:border-rose-500/70 shadow-sm'
                                                    : 'bg-slate-900/60 border-slate-700/70 hover:border-slate-600'
                                            }`}
                                        >
                                            {/* Left: Rank & Location */}
                                            <div className="flex items-start gap-3 min-w-[240px]">
                                                <div
                                                    className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-black text-xs border ${
                                                        isRank1
                                                            ? 'bg-gradient-to-br from-amber-400 to-rose-500 text-slate-950 border-amber-300 shadow-sm'
                                                            : isRank2
                                                            ? 'bg-slate-700 text-slate-100 border-slate-500'
                                                            : isRank3
                                                            ? 'bg-orange-950/60 text-orange-200 border-orange-700/60'
                                                            : 'bg-slate-800 text-slate-400 border-slate-700'
                                                    }`}
                                                >
                                                    #{idx + 1}
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                                                            <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                                            {item.location}
                                                        </h4>
                                                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${urgencyBadge.bg}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${urgencyBadge.dot}`} />
                                                            Urgensi: {item.highestUrgency}
                                                        </span>
                                                        {item.departments && item.departments.length > 0 && (
                                                            <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                                                                {item.departments.join(', ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {item.latestIssueTitle && (
                                                        <p className="text-xs text-slate-400 line-clamp-1">
                                                            Laporan terbaru: <span className="text-slate-200 font-medium">"{item.latestIssueTitle}"</span>
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Middle / Right: Breakdown Bar & Stats */}
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 md:gap-6 self-stretch md:self-auto justify-between md:justify-end">
                                                {/* Visual Urgency Proportion Mini Bar */}
                                                <div className="min-w-[140px] max-w-[200px] flex-1">
                                                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                                                        <span>Distribusi Kasus</span>
                                                        <span className="font-semibold text-white">{item.total} Total</span>
                                                    </div>
                                                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
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
                                                    <div className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700/80 text-center min-w-[50px]">
                                                        <div className="text-[10px] text-slate-400">Aktif</div>
                                                        <div className={`text-xs font-black ${item.openCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                                            {item.openCount}
                                                        </div>
                                                    </div>
                                                    <div className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700/80 text-center min-w-[50px]">
                                                        <div className="text-[10px] text-slate-400">Selesai</div>
                                                        <div className="text-xs font-black text-emerald-400">{item.resolvedCount}</div>
                                                    </div>
                                                </div>
                                            </div>
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
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 gap-1 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/60">
                            <span className="flex items-center gap-1.5 font-medium text-emerald-300">
                                <Info className="w-3.5 h-3.5 shrink-0" />
                                Peta Spasial Telunas Private Island (TPI)
                            </span>
                            <span className="text-[11px] text-slate-400">
                                Lokasi dipetakan secara otomatis oleh AI berdasarkan isi laporan unit
                            </span>
                        </div>
                        <TpiResortMap
                            zones={spatialHotspots.tpiZones}
                            onSelectZone={(zone) => setSelectedTpiZone(prev => prev?.id === zone.id ? null : zone)}
                            selectedZoneId={selectedTpiZone?.id}
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
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 gap-1 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/60">
                            <span className="flex items-center gap-1.5 font-medium text-amber-300">
                                <Info className="w-3.5 h-3.5 shrink-0" />
                                Peta Spasial Telunas Beach Resort (TBR)
                            </span>
                            <span className="text-[11px] text-slate-400">
                                Lokasi dipetakan secara otomatis oleh AI berdasarkan isi laporan fasilitas
                            </span>
                        </div>
                        <TbrResortMap zones={spatialHotspots.tbrZones} />
                        <div className="flex items-center justify-center gap-4 text-[10px] text-slate-400 pt-1">
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-400/40" /> Hotspot Kritis (Darurat / Tinggi)
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-400/40" /> Hotspot Sedang
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-400/40" /> Normal / Rendah
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-slate-500" /> Tidak Ada Isu Aktif
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* SECTION 3: ACTIONABLE AUDIT & MITIGATION FEED */}
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

                                        {/* Issue Title & Department */}
                                        <h4 className="text-xs font-bold text-white mb-1.5">
                                            {issue.title}
                                        </h4>

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
        </div>
    );
}
