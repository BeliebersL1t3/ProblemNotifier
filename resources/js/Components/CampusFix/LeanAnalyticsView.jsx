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
    'Perlu Dicek': '#a855f7',// Purple
};

export function LeanAnalyticsView({
    issues = [],
    aiPendingCount = 0,
    onRetryAi,
    isRetrying = false,
}) {
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchFilter, setSearchFilter] = useState('');

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
                    'Perlu Dicek': 0,
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

    // --- 5. Actionable Mitigation Feed (Audit Recommendations) ---
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
                                    <XAxis type="number" stroke="#94a3b8" fontSize={10} />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        stroke="#cbd5e1"
                                        fontSize={11}
                                        width={120}
                                        tickFormatter={(val) => (val.length > 18 ? val.substring(0, 18) + '...' : val)}
                                    />
                                    <RechartsTooltip
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                                        itemStyle={{ color: '#38bdf8' }}
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

            {/* CHARTS ROW 2: HOTSPOT LOKASI & URGENSI STACK */}
            <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                        <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-rose-400" />
                            Matriks Hotspot Lokasi & Tingkat Urgensi
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            Memetakan unit atau villa yang paling sering bermasalah beserta tingkat kegawatan insiden
                        </p>
                    </div>
                    {/* Urgency Legend */}
                    <div className="flex items-center gap-2 flex-wrap text-[10px]">
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

                {hotspotData.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500">
                        Belum ada data lokasi untuk dianalisa.
                    </div>
                ) : (
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={hotspotData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                <XAxis dataKey="location" stroke="#94a3b8" fontSize={11} />
                                <YAxis stroke="#94a3b8" fontSize={10} allowDecimals={false} />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                                />
                                <Bar dataKey="Darurat" stackId="a" fill="#f43f5e" />
                                <Bar dataKey="Tinggi" stackId="a" fill="#fb923c" />
                                <Bar dataKey="Sedang" stackId="a" fill="#facc15" />
                                <Bar dataKey="Rendah" stackId="a" fill="#10b981" />
                                <Bar dataKey="Perlu Dicek" stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
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
