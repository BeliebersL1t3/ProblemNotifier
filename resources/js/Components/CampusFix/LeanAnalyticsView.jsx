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
} from 'lucide-react';

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

// --- Denah Vektor Arsitektural TPI (Telunas Private Island) ---
function TpiResortMap({ zones = [] }) {
    return (
        <div className="relative w-full aspect-[16/9] min-h-[380px] max-h-[520px] rounded-xl overflow-hidden bg-gradient-to-b from-[#02182c] via-[#04243f] to-[#011425] border border-slate-700/80 shadow-inner select-none flex items-center justify-center p-2">
            <svg viewBox="0 0 800 450" className="w-full h-full object-contain pointer-events-none">
                <defs>
                    <radialGradient id="tpi-ocean-ripple" cx="70%" cy="40%" r="60%">
                        <stop offset="0%" stopColor="#0284c7" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#031728" stopOpacity="0" />
                    </radialGradient>
                    <linearGradient id="tpi-island-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#065f46" />
                        <stop offset="45%" stopColor="#047857" />
                        <stop offset="100%" stopColor="#064e3b" />
                    </linearGradient>
                    <linearGradient id="tpi-beach-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#ca8a04" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="#a16207" stopOpacity="0.15" />
                    </linearGradient>
                </defs>

                <rect width="800" height="450" fill="url(#tpi-ocean-ripple)" />

                {/* Coral Reef Faint Line */}
                <path
                    d="M 120 100 C 220 50, 420 50, 520 110 C 660 190, 720 320, 640 420 C 500 480, 240 460, 140 410 C 60 360, 50 160, 120 100 Z"
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="1"
                    strokeDasharray="4 6"
                    opacity="0.25"
                />

                {/* TPI Island Body (Curved organic shape matching satellite photo) */}
                <path
                    d="M 180 120 C 260 70, 380 80, 430 130 C 470 170, 460 250, 420 330 C 390 395, 300 420, 230 405 C 160 390, 120 330, 130 250 C 135 180, 145 140, 180 120 Z"
                    fill="url(#tpi-island-grad)"
                    stroke="#059669"
                    strokeWidth="2"
                    filter="drop-shadow(0 6px 16px rgba(0,0,0,0.6))"
                />

                {/* Sandy Beach Shoreline (East Coast) */}
                <path
                    d="M 360 90 C 420 120, 455 180, 445 270 C 435 340, 365 395, 290 415"
                    fill="none"
                    stroke="url(#tpi-beach-grad)"
                    strokeWidth="12"
                    strokeLinecap="round"
                />

                {/* TPI Curved Overwater Boardwalk (Pier to 15 Villas) */}
                <path
                    d="M 370 100 C 460 90, 580 130, 640 210 C 670 260, 650 310, 580 340"
                    fill="none"
                    stroke="#b45309"
                    strokeWidth="5"
                    strokeLinecap="round"
                />
                <path
                    d="M 370 100 C 460 90, 580 130, 640 210 C 670 260, 650 310, 580 340"
                    fill="none"
                    stroke="#78350f"
                    strokeWidth="8"
                    strokeDasharray="3 14"
                />

                {/* Overwater Villa Silhouettes along the curve */}
                {[
                    { x: 420, y: 88, rot: 15 },
                    { x: 460, y: 98, rot: 25 },
                    { x: 500, y: 115, rot: 35 },
                    { x: 540, y: 140, rot: 45 },
                    { x: 580, y: 175, rot: 60 },
                    { x: 610, y: 215, rot: 75 },
                    { x: 625, y: 260, rot: 90 },
                    { x: 615, y: 300, rot: 110 },
                    { x: 585, y: 330, rot: 135 },
                ].map((v, idx) => (
                    <g key={idx} transform={`translate(${v.x}, ${v.y}) rotate(${v.rot})`}>
                        <rect x="-8" y="-12" width="16" height="12" rx="1.5" fill="#92400e" stroke="#d97706" strokeWidth="1" />
                    </g>
                ))}

                {/* Arrival Boat Jetty (South East) */}
                <line x1="425" y1="305" x2="690" y2="335" stroke="#b45309" strokeWidth="5" strokeLinecap="round" />
                <rect x="670" y="320" width="35" height="28" rx="2" fill="#78350f" stroke="#d97706" strokeWidth="1.5" />
                <circle cx="687" cy="334" r="3" fill="#38bdf8" />

                {/* Compass Rose */}
                <g transform="translate(60, 60)" opacity="0.6">
                    <circle cx="0" cy="0" r="22" fill="#0f172a" stroke="#334155" strokeWidth="1" />
                    <polygon points="0,-18 5,-4 0,0 -5,-4" fill="#f43f5e" />
                    <polygon points="0,18 5,4 0,0 -5,4" fill="#94a3b8" />
                    <polygon points="18,0 4,5 0,0 4,-5" fill="#94a3b8" />
                    <polygon points="-18,0 -4,5 0,0 -4,-5" fill="#94a3b8" />
                    <text x="0" y="-22" textAnchor="middle" fill="#f43f5e" fontSize="9" fontWeight="bold">U</text>
                </g>

                {/* Map Scale / Label watermark */}
                <text x="750" y="430" textAnchor="end" fill="#64748b" fontSize="10" fontWeight="bold" letterSpacing="1">
                    TELUNAS PRIVATE ISLAND (TPI)
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
    const [hotspotTab, setHotspotTab] = useState('chart'); // 'chart' (default) | 'tpi' | 'tbr'

    // --- 1. Key Performance & Audit Metric Cards ---
    const stats = useMemo(() => {
        const total = issues.length;
        const analyzed = issues.filter((i) => i.ai_status === 'completed').length;
        const resolved = issues.filter((i) => i.status === 'resolved').length;
        const needParts = issues.filter((i) => i.ai_analysis?.perlu_sparepart).length;
        const sparepartRatio = total > 0 ? Math.round((needParts / total) * 100) : 0;

        // Top category
        const catCounts = {};
        issues.forEach((i) => {
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
        issues.forEach((i) => {
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
    }, [issues]);

    // --- 2. Pareto Chart Data (Top 7 Sub-Categories) ---
    const paretoData = useMemo(() => {
        const counts = {};
        issues.forEach((i) => {
            const sub = i.ai_sub_category || i.title || 'Lain-lain';
            counts[sub] = (counts[sub] || 0) + 1;
        });

        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 7);
    }, [issues]);

    // --- 3. Category Distribution (Donut Chart) ---
    const categoryData = useMemo(() => {
        const counts = {};
        issues.forEach((i) => {
            const cat = i.ai_category || 'Lain-lain';
            counts[cat] = (counts[cat] || 0) + 1;
        });

        return Object.entries(counts).map(([name, value]) => ({
            name,
            value,
            color: CATEGORY_COLORS[name] || '#94a3b8',
        }));
    }, [issues]);

    // --- 4. Hotspot Location & Urgency Breakdown (Stacked Bar) ---
    const hotspotData = useMemo(() => {
        const locMap = {};

        issues.forEach((i) => {
            const loc = i.location || 'Lainnya';
            if (!locMap[loc]) {
                locMap[loc] = {
                    location: loc,
                    Darurat: 0,
                    Tinggi: 0,
                    Sedang: 0,
                    Rendah: 0,
                    total: 0,
                };
            }
            const urg = i.ai_urgency || 'Sedang';
            if (locMap[loc][urg] !== undefined) {
                locMap[loc][urg] += 1;
            } else {
                locMap[loc]['Sedang'] += 1;
            }
            locMap[loc].total += 1;
        });

        return Object.values(locMap)
            .sort((a, b) => b.total - a.total)
            .slice(0, 6);
    }, [issues]);

    // --- 5. Department Workload Breakdown (Laporan per Departemen) ---
    const departmentData = useMemo(() => {
        const deptMap = {};

        issues.forEach((i) => {
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
    }, [issues]);

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
        const tpiZones = {
            'villas_north': { id: 'villas_north', name: 'Overwater Villas 1-7', resort: 'TPI', x: 68, y: 26, count: 0, highestUrgency: null },
            'villas_south': { id: 'villas_south', name: 'Overwater Villas 8-15', resort: 'TPI', x: 78, y: 56, count: 0, highestUrgency: null },
            'clubhouse':    { id: 'clubhouse', name: 'Main Clubhouse & Lobby', resort: 'TPI', x: 42, y: 38, count: 0, highestUrgency: null },
            'dining':       { id: 'dining', name: 'Dining Room & Bar', resort: 'TPI', x: 52, y: 48, count: 0, highestUrgency: null },
            'kitchen':      { id: 'kitchen', name: 'Kitchen & Bakery', resort: 'TPI', x: 38, y: 52, count: 0, highestUrgency: null },
            'jetty':        { id: 'jetty', name: 'Arrival Jetty Boat Dock', resort: 'TPI', x: 86, y: 74, count: 0, highestUrgency: null },
            'spa':          { id: 'spa', name: 'Spa Pavillion', resort: 'TPI', x: 25, y: 34, count: 0, highestUrgency: null },
            'genset':       { id: 'genset', name: 'Genset & Power House', resort: 'TPI', x: 24, y: 64, count: 0, highestUrgency: null },
            'staff':        { id: 'staff', name: 'Staff Quarters', resort: 'TPI', x: 34, y: 78, count: 0, highestUrgency: null },
        };

        const tbrZones = {
            'pierhead_dining': { id: 'pierhead_dining', name: 'Lodge Overwater Dining', resort: 'TBR', x: 50, y: 88, count: 0, highestUrgency: null },
            'pier_villas_w':   { id: 'pier_villas_w', name: 'Overwater Chalets (Barat)', resort: 'TBR', x: 36, y: 58, count: 0, highestUrgency: null },
            'pier_villas_e':   { id: 'pier_villas_e', name: 'Overwater Chalets (Timur)', resort: 'TBR', x: 64, y: 58, count: 0, highestUrgency: null },
            'beach_front':     { id: 'beach_front', name: 'Beach Reception & Activities', resort: 'TBR', x: 50, y: 28, count: 0, highestUrgency: null },
            'kitchen':         { id: 'kitchen', name: 'Restoran & Dapur TBR', resort: 'TBR', x: 32, y: 22, count: 0, highestUrgency: null },
            'jetty':           { id: 'jetty', name: 'Dermaga Boat TBR', resort: 'TBR', x: 80, y: 44, count: 0, highestUrgency: null },
            'genset':          { id: 'genset', name: 'Genset & Utilitas TBR', resort: 'TBR', x: 68, y: 16, count: 0, highestUrgency: null },
            'staff':           { id: 'staff', name: 'Mes Staf TBR', resort: 'TBR', x: 22, y: 16, count: 0, highestUrgency: null },
        };

        const urgencyWeight = { 'Darurat': 4, 'Tinggi': 3, 'Sedang': 2, 'Rendah': 1 };

        issues.forEach((issue) => {
            const loc = (issue.location || '').toLowerCase();
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
                // TPI
                if (loc.includes('villa') || loc.includes('kamar') || aiZone === 'Vila Terapung') {
                    const matchNum = loc.match(/\b([1-9]|1[0-5])\b/);
                    if (matchNum && parseInt(matchNum[1], 10) > 7) {
                        matchedKey = 'villas_south';
                    } else {
                        matchedKey = 'villas_north';
                    }
                } else if (loc.includes('jetty') || loc.includes('dock') || loc.includes('boat') || loc.includes('dermaga') || aiZone === 'Dermaga Jetty') {
                    matchedKey = 'jetty';
                } else if (loc.includes('clubhouse') || loc.includes('lobby') || loc.includes('reception') || loc.includes('lounge') || aiZone === 'Clubhouse & Lobby') {
                    matchedKey = 'clubhouse';
                } else if (loc.includes('dining') || loc.includes('restoran') || loc.includes('meja') || aiZone === 'Dining Room') {
                    matchedKey = 'dining';
                } else if (loc.includes('kitchen') || loc.includes('dapur') || loc.includes('bakery') || loc.includes('chiller') || aiZone === 'Kitchen & Dapur') {
                    matchedKey = 'kitchen';
                } else if (loc.includes('spa') || loc.includes('massage') || aiZone === 'Spa Pavillion') {
                    matchedKey = 'spa';
                } else if (loc.includes('genset') || loc.includes('panel') || loc.includes('listrik') || aiZone === 'Genset & Utilitas') {
                    matchedKey = 'genset';
                } else if (loc.includes('staf') || loc.includes('mes') || aiZone === 'Mes Staf') {
                    matchedKey = 'staff';
                } else {
                    matchedKey = 'clubhouse';
                }
            }

            if (matchedKey && targetMap[matchedKey]) {
                const zone = targetMap[matchedKey];
                zone.count += 1;
                const urg = issue.ai_urgency || 'Sedang';
                if (!zone.highestUrgency || (urgencyWeight[urg] || 0) > (urgencyWeight[zone.highestUrgency] || 0)) {
                    zone.highestUrgency = urg;
                }
            }
        });

        return { tpiZones: Object.values(tpiZones), tbrZones: Object.values(tbrZones) };
    }, [issues]);

    // --- 7. Actionable Mitigation Feed (Audit Recommendations) ---
    const mitigationFeed = useMemo(() => {
        const q = searchFilter.trim().toLowerCase();

        return issues
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
    }, [issues, selectedCategory, searchFilter]);

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

                    {/* View Switcher Tabs (Default: Grafik Balok) */}
                    <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-700 self-start md:self-auto">
                        <button
                            type="button"
                            onClick={() => setHotspotTab('chart')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                hotspotTab === 'chart'
                                    ? 'bg-rose-500 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                            }`}
                        >
                            <BarChart2 className="w-3.5 h-3.5" />
                            <span>Grafik Balok</span>
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
                    </div>
                </div>

                {/* TAB 1: GRAFIK BALOK (DEFAULT) */}
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
                        <TpiResortMap zones={spatialHotspots.tpiZones} />
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
