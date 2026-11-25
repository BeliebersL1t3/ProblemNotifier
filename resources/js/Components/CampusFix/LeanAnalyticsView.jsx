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
    Settings,
    Copy,
    CheckCheck,
    Loader2,
    PlusCircle,
} from 'lucide-react';
import axios from 'axios';
import { getEtaBadgeInfo, formatEtaDisplayWib } from '@/Components/CampusFix/EtaPickerField';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { ExportPdfModal } from '@/Components/CampusFix/ExportPdfModal';

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

// Format duration in minutes into clear readable string (e.g. "45 mnt", "3 jam 20 mnt", "27 hari 19 jam")
const formatDurationCompact = (minutes, isEn = false) => {
    if (minutes === null || minutes === undefined || Number.isNaN(minutes) || minutes < 0) {
        return '-';
    }
    const totalMins = Math.round(minutes);
    if (totalMins < 60) {
        return isEn ? `${totalMins}m` : `${totalMins} mnt`;
    }
    const hours = Math.floor(totalMins / 60);
    const remMins = totalMins % 60;
    if (hours < 24) {
        if (remMins === 0) return isEn ? `${hours}h` : `${hours} jam`;
        return isEn ? `${hours}h ${remMins}m` : `${hours} jam ${remMins} mnt`;
    }
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    if (remHours === 0) return isEn ? `${days}d` : `${days} hari`;
    return isEn ? `${days}d ${remHours}h` : `${days} hari ${remHours} jam`;
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

// =========================================================================
// EXPORT PDF REKAP OPERASIONAL TELUNAS (100% Client-side via jsPDF & AutoTable)
// =========================================================================
export function exportTelunasPdfReport({
    filteredIssues = [],
    stats = {},
    timeLabel,
    deptTargetData = [],
    mttrByDept = [],
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
                ? `Escalation Timer Compliance: ${stats.onTimeResolvedCount || 0}/${stats.evaluatedSlaCount} Clean (${stats.onTimeRate}%)`
                : `Kepatuhan Timer Eskalasi: ${stats.onTimeResolvedCount || 0}/${stats.evaluatedSlaCount} Tanpa Eskalasi (${stats.onTimeRate}%)`)
            : (isEn ? 'Escalation Timer Compliance: No resolved tickets yet' : 'Kepatuhan Timer Eskalasi: Belum ada tiket selesai');
        const overdueText = isEn
            ? `Active Escalated (1h/3h+): ${stats.overdueActiveCount || 0} ticket(s) | Tracked: ${stats.withEtaCount}`
            : `Aktif Eskalasi (1j/3j+): ${stats.overdueActiveCount || 0} tiket | Terpantau Timer: ${stats.withEtaCount}`;

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

    // 4. Table: Kecepatan Penyelesaian (MTTR) per Departemen
    const mttrRows = (mttrByDept || []).slice(0, 8).map((d, idx) => [
        idx + 1,
        d.department === 'Umum' && isEn ? 'General' : d.department,
        d.solvedCount,
        formatDurationCompact(d.avgMinutes, isEn),
        formatDurationCompact(d.minMinutes, isEn),
        formatDurationCompact(d.maxMinutes, isEn),
    ]);

    if (mttrRows.length > 0) {
        autoTable(doc, {
            startY: startY,
            head: [
                isEn
                    ? ['#', 'Department', 'Resolved', 'Avg. Time (MTTR)', 'Fastest', 'Slowest']
                    : ['#', 'Departemen', 'Tiket Selesai', 'Rata-rata (MTTR)', 'Tercepat', 'Terlama'],
            ],
            body: mttrRows,
            theme: 'striped',
            headStyles: { fillColor: [51, 65, 85], fontSize: 8, fontStyle: 'bold' },
            bodyStyles: { fontSize: 8 },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 55 },
                2: { cellWidth: 25, halign: 'center' },
                3: { halign: 'center', fontStyle: 'bold', textColor: [3, 105, 161] },
                4: { halign: 'center', textColor: [21, 128, 61] },
                5: { halign: 'center', textColor: [180, 83, 9] },
            },
            margin: { left: 14, right: 14 },
        });
    }

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
            (() => {
                const tb = getEtaBadgeInfo(i, nowMs, isEn);
                return tb ? tb.primaryLabel : '-';
            })(),
            i.pending_reason || '-',
        ]);

        autoTable(doc, {
            startY: startY,
            head: [
                isEn
                    ? ['Code', 'Location', 'Target Dept', 'Issue Title', 'Reporter', 'Status', 'Progress Timer', 'Pending Notes']
                    : ['Kode', 'Lokasi', 'Dept Dituju', 'Judul Masalah', 'Pelapor', 'Status', 'Timer Progres', 'Catatan Pending'],
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
    spreadsheetUrl = null,
    monthGids = {},
    unconnectedYearAlerts = {},
}) {
    const { lang } = useLanguage();
    const { isAdmin } = useAuth();
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

    // 0. Global Year Filter (Default to '2026' active operational year per Option A)
    const [selectedYear, setSelectedYear] = useState('2026');

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

    // 2. Customizable Department Mode: 'target_issues' | 'reporters' | 'backlog_ratio'
    const [deptMode, setDeptMode] = useState('target_issues');
    // 2.1. Trend Chart Period Mode: '6m' | '1y' | 'semester' | 'yearly'
    const [trendPeriodMode, setTrendPeriodMode] = useState('6m');
    // 2.2. Chart 3 (Workload per Department) Controls: Top N / All + Multi-Department Picker
    const [deptChartLimit, setDeptChartLimit] = useState('6');
    const [deptChartSelectedDepts, setDeptChartSelectedDepts] = useState(null); // null = automatic Top N, string[] = custom multi-select
    const [deptChartIncludeZero, setDeptChartIncludeZero] = useState(false);
    const [isDeptChartPickerOpen, setIsDeptChartPickerOpen] = useState(false);
    const deptChartPickerRef = useRef(null);

    useEffect(() => {
        if (!isDeptChartPickerOpen) return;
        const handleClickOutside = (event) => {
            if (deptChartPickerRef.current && !deptChartPickerRef.current.contains(event.target)) {
                setIsDeptChartPickerOpen(false);
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsDeptChartPickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isDeptChartPickerOpen]);

    // 5. Performance & Speed Multi-Mode (KPI 4 & Chart 4) + Detail Modal
    const [perfMode, setPerfMode] = useState('mttr'); // 'mttr' | 'top_resolver' | 'oldest_active'
    const [chart4Mode, setChart4Mode] = useState('mttr_dept'); // 'mttr_dept' | 'top_workers'
    const [selectedPerfModal, setSelectedPerfModal] = useState(null);
    const [perfModalAgeFilter, setPerfModalAgeFilter] = useState('all'); // 'all' | 'overdue_eta' | 'over_7d' | 'over_3d'
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
    const [isExportPdfModalOpen, setIsExportPdfModalOpen] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());

    // 6. Yearly Spreadsheets Management State
    const [isSpreadsheetModalOpen, setIsSpreadsheetModalOpen] = useState(false);
    const [yearlySpreadsheets, setYearlySpreadsheets] = useState({});
    const [botEmail, setBotEmail] = useState('campusfix-bot@campusfix-504605.iam.gserviceaccount.com');
    const [newSheetYear, setNewSheetYear] = useState('2027');
    const [newSheetUrl, setNewSheetUrl] = useState('');
    const [isConnectingSheet, setIsConnectingSheet] = useState(false);
    const [sheetConnectMessage, setSheetConnectMessage] = useState(null);
    const [copiedBotEmail, setCopiedBotEmail] = useState(false);
    const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
    const [yearSearchQuery, setYearSearchQuery] = useState('');
    const yearComboboxRef = useRef(null);

    // Close searchable year dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (yearComboboxRef.current && !yearComboboxRef.current.contains(event.target)) {
                setIsYearDropdownOpen(false);
            }
        }
        if (isYearDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isYearDropdownOpen]);

    // Dynamic available years list derived from issues and connected yearly spreadsheets
    const availableYears = useMemo(() => {
        const yearSet = new Set();
        (issues || []).forEach((iss) => {
            if (iss?.created_at) {
                const yr = new Date(iss.created_at).getFullYear();
                if (!isNaN(yr)) yearSet.add(yr);
            }
        });
        Object.keys(yearlySpreadsheets || {}).forEach((yr) => {
            const num = parseInt(yr, 10);
            if (!isNaN(num)) yearSet.add(num);
        });
        yearSet.add(2026);
        return Array.from(yearSet).sort((a, b) => b - a);
    }, [issues, yearlySpreadsheets]);

    // Dynamic wide year options for connecting new yearly spreadsheets (2023 - 2035)
    const selectableConnectionYears = useMemo(() => {
        const currentYr = new Date().getFullYear();
        const startYr = 2023;
        const endYr = Math.max(currentYr + 6, 2035);
        const list = [];
        for (let y = startYr; y <= endYr; y++) {
            const strYr = String(y);
            const isConn = Boolean(yearlySpreadsheets?.[strYr] || (y === 2026 && yearlySpreadsheets?.['2026']));
            const isDef = strYr === '2026';
            list.push({
                year: strYr,
                isConnected: isConn,
                isDefault: isDef,
                label: isDef
                    ? `${strYr} (${isEn ? 'Connected • 2026 Default' : 'Terhubung • Default 2026'})`
                    : isConn
                        ? `${strYr} (${isEn ? 'Connected' : 'Terhubung'})`
                        : `${strYr} (${isEn ? '+ Ready to Connect' : '+ Siap Dihubungkan'})`,
            });
        }
        return list;
    }, [yearlySpreadsheets, isEn]);

    // Dynamic filtered years with custom 4-digit year search support (e.g. 2090)
    const filteredConnectionYears = useMemo(() => {
        const query = yearSearchQuery.trim();
        let list = [...selectableConnectionYears];

        // If user typed a search query
        if (query) {
            const isFourDigits = /^\d{4}$/.test(query);
            const queryNum = parseInt(query, 10);
            const existsInList = list.some((item) => item.year === query);

            // If user typed a valid year between 2000 and 2100 not in the base list (e.g. 2090)
            if (isFourDigits && !existsInList && queryNum >= 2000 && queryNum <= 2100) {
                const isConn = Boolean(yearlySpreadsheets?.[query] || (query === '2026' && yearlySpreadsheets?.['2026']));
                const customItem = {
                    year: query,
                    isConnected: isConn,
                    isDefault: query === '2026',
                    label: isConn
                        ? `${query} (${isEn ? 'Connected' : 'Terhubung'})`
                        : `${query} (${isEn ? '+ Ready to Connect' : '+ Siap Dihubungkan'})`,
                    isCustom: true,
                };
                list.unshift(customItem);
            }

            return list.filter((item) => item.year.includes(query) || item.label.toLowerCase().includes(query.toLowerCase()));
        }

        // If currently selected year is a custom year not in base list, keep it visible
        if (newSheetYear && !list.some((item) => item.year === String(newSheetYear))) {
            const strYr = String(newSheetYear);
            const isConn = Boolean(yearlySpreadsheets?.[strYr] || (strYr === '2026' && yearlySpreadsheets?.['2026']));
            list.unshift({
                year: strYr,
                isConnected: isConn,
                isDefault: strYr === '2026',
                label: isConn
                    ? `${strYr} (${isEn ? 'Connected' : 'Terhubung'})`
                    : `${strYr} (${isEn ? '+ Ready to Connect' : '+ Siap Dihubungkan'})`,
                isCustom: true,
            });
        }

        return list;
    }, [selectableConnectionYears, yearSearchQuery, yearlySpreadsheets, newSheetYear, isEn]);

    const selectedYearInfo = useMemo(() => {
        const strYr = String(newSheetYear);
        const found = selectableConnectionYears.find((item) => item.year === strYr);
        if (found) return found;
        const isConn = Boolean(yearlySpreadsheets?.[strYr] || (strYr === '2026' && yearlySpreadsheets?.['2026']));
        return {
            year: strYr,
            isConnected: isConn,
            isDefault: strYr === '2026',
            label: isConn
                ? `${strYr} (${isEn ? 'Connected' : 'Terhubung'})`
                : `${strYr} (${isEn ? '+ Ready to Connect' : '+ Siap Dihubungkan'})`,
        };
    }, [newSheetYear, selectableConnectionYears, yearlySpreadsheets, isEn]);

    // Dynamic Google Sheet URL with #gid anchor to open the exact month tab and year
    const dynamicSheetUrl = useMemo(() => {
        const targetYearNum = selectedYear !== 'all' ? parseInt(selectedYear, 10) : 2026;
        const targetSpreadsheetUrl =
            yearlySpreadsheets?.[targetYearNum]?.url ||
            yearlySpreadsheets?.[2026]?.url ||
            spreadsheetUrl;
        const gid = monthGids?.[activeMonthName];
        const baseUrl = (targetSpreadsheetUrl || '').split('#')[0];
        if (gid !== undefined && gid !== null && gid !== '') {
            return `${baseUrl}#gid=${gid}`;
        }
        return targetSpreadsheetUrl;
    }, [activeMonthName, monthGids, spreadsheetUrl, yearlySpreadsheets, selectedYear]);

    const fetchSpreadsheets = useCallback(async () => {
        if (!isAdmin) return;
        try {
            const res = await axios.get('/lapangan/spreadsheets');
            if (res.data?.success) {
                const sheets = res.data.yearly_spreadsheets || res.data.data || {};
                setYearlySpreadsheets(sheets);
                if (res.data.bot_email) {
                    setBotEmail(res.data.bot_email);
                }
            }
        } catch (err) {
            console.error('Failed to fetch spreadsheets config', err);
        }
    }, [isAdmin]);

    useEffect(() => {
        if (isAdmin) {
            fetchSpreadsheets();
        }
    }, [isAdmin, fetchSpreadsheets]);

    useEffect(() => {
        if (isAdmin && isSpreadsheetModalOpen) {
            fetchSpreadsheets();
        }
    }, [isAdmin, isSpreadsheetModalOpen, fetchSpreadsheets]);

    const handleConnectSheet = async (e) => {
        e?.preventDefault();
        const trimmedUrl = newSheetUrl.trim();
        if (!trimmedUrl) {
            setSheetConnectMessage({
                type: 'error',
                text: isEn ? 'Please enter a valid Google Spreadsheet URL or ID.' : 'Harap masukkan URL atau ID Google Spreadsheet yang valid.',
            });
            return;
        }

        setIsConnectingSheet(true);
        setSheetConnectMessage(null);
        try {
            const res = await axios.post('/lapangan/spreadsheets/connect', {
                year: parseInt(newSheetYear, 10),
                url: trimmedUrl,
            });

            if (res.data?.success) {
                setSheetConnectMessage({
                    type: 'success',
                    text: res.data.message || (isEn ? 'Spreadsheet connected and formatted successfully!' : 'Spreadsheet berhasil dihubungkan dan diformat!'),
                });
                setNewSheetUrl('');
                const updatedSheets = res.data.yearly_spreadsheets || res.data.data;
                if (updatedSheets) {
                    setYearlySpreadsheets(updatedSheets);
                }
                await fetchSpreadsheets();
            } else {
                setSheetConnectMessage({
                    type: 'error',
                    text: res.data?.message || (isEn ? 'Failed to connect spreadsheet.' : 'Gagal menghubungkan spreadsheet.'),
                });
            }
        } catch (err) {
            console.error('Error connecting spreadsheet:', err);
            const errMsg = err.response?.data?.message || err.message || (isEn ? 'Error connecting spreadsheet. Please ensure the bot has Editor access.' : 'Gagal menghubungkan spreadsheet. Pastikan bot memiliki akses Editor.');
            setSheetConnectMessage({
                type: 'error',
                text: errMsg,
            });
        } finally {
            setIsConnectingSheet(false);
        }
    };

    const handleCopyBotEmail = () => {
        navigator.clipboard?.writeText(botEmail);
        setCopiedBotEmail(true);
        setTimeout(() => setCopiedBotEmail(false), 2500);
    };

    useEffect(() => {
        const timer = setInterval(() => setNowMs(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    // Filter issues by year and time range
    const filteredIssues = useMemo(() => {
        const now = new Date();
        return issues.filter((i) => {
            if (!i.created_at) return true;
            const issueDate = new Date(i.created_at);
            if (isNaN(issueDate.getTime())) return true;

            // 1. Year filter
            if (selectedYear !== 'all') {
                if (issueDate.getFullYear() !== parseInt(selectedYear, 10)) {
                    return false;
                }
            }

            // 2. Time range / monthly tab filter
            if (timeRange === 'all') return true;

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
    }, [issues, timeRange, selectedYear]);

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
            const timerBadge = getEtaBadgeInfo(issue, nowMs, isEn);
            if (!timerBadge) return;
            withEtaCount += 1;

            if (issue.status === 'resolved') {
                evaluatedSlaCount += 1;
                if (timerBadge.state === 'resolved_clean') {
                    onTimeResolvedCount += 1;
                } else {
                    lateResolvedCount += 1;
                }
            } else if (timerBadge.state === 'owner_escalated' || timerBadge.state === 'group_escalated') {
                overdueActiveCount += 1;
            }
        });

        const onTimeRate = evaluatedSlaCount > 0
            ? Math.round((onTimeResolvedCount / evaluatedSlaCount) * 100)
            : (resolved > 0 ? 100 : null);

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

        // Full target department list (including 0-issue master departments) for multi-select filtering
        const allTargetList = Object.values(targetMap)
            .map((d) => ({
                ...d,
                pct: stats.total > 0 ? Math.round((d.total / stats.total) * 100) : 0,
                backlogRate: d.total > 0 ? Math.round((d.active / d.total) * 100) : 0,
            }))
            .sort((a, b) => {
                if (b.total !== a.total) return b.total - a.total;
                return a.name.localeCompare(b.name);
            });

        // Mode 1: Isu Terbanyak (Beban Ditugaskan)
        const targetList = allTargetList.filter((d) => d.total > 0);

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
            allTargetList,
            reporterList,
            backlogList,
        };
    }, [filteredIssues, departments, stats.total]);

    // Performa & Kecepatan Operasional (100% Akurat: MTTR, Top Teknisi/Staf, Isu Aktif Terlama)
    const performanceMetrics = useMemo(() => {
        const resolvedWithDuration = [];
        const deptMttrMap = {};
        const resolverMap = {};
        const oldestActiveList = [];

        const extractWorkerNames = (issue) => {
            const rawList = [];
            if (Array.isArray(issue.final_workers) && issue.final_workers.length > 0) {
                rawList.push(...issue.final_workers);
            } else if (issue.resolved_by_name) {
                rawList.push(...String(issue.resolved_by_name).split(/[,&]/));
            } else if (Array.isArray(issue.active_workers) && issue.active_workers.length > 0) {
                rawList.push(...issue.active_workers);
            } else if (issue.claimed_by_name) {
                rawList.push(...String(issue.claimed_by_name).split(/[,&]/));
            }

            const seen = new Set();
            const cleaned = [];
            rawList.forEach((raw) => {
                const name = String(raw || '').trim();
                if (!name || name === '-' || name.toLowerCase() === 'null') return;
                const key = name.toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    cleaned.push(name);
                }
            });
            return cleaned;
        };

        filteredIssues.forEach((issue) => {
            const createdMs = issue.created_at ? new Date(issue.created_at).getTime() : NaN;
            const targetDepts = Array.isArray(issue.target_departments) && issue.target_departments.length > 0
                ? issue.target_departments
                : [issue.target_departments || 'Umum'];

            if (issue.status === 'resolved') {
                const rawRes = issue.resolved_at || issue.solved_at || issue.updated_at;
                const resolvedMs = rawRes ? new Date(rawRes).getTime() : NaN;
                const validDuration = !Number.isNaN(createdMs) && !Number.isNaN(resolvedMs) && resolvedMs >= createdMs;
                const durationMinutes = validDuration ? (resolvedMs - createdMs) / 60000 : null;

                if (durationMinutes !== null) {
                    resolvedWithDuration.push({ issue, durationMinutes });
                }

                // Aggregate MTTR per target department
                targetDepts.forEach((d) => {
                    const deptName = (d || 'Umum').trim() || 'Umum';
                    if (!deptMttrMap[deptName]) {
                        deptMttrMap[deptName] = {
                            department: deptName,
                            totalMinutes: 0,
                            timedCount: 0,
                            minMinutes: Infinity,
                            maxMinutes: 0,
                            solvedCount: 0,
                            pendingCount: 0,
                            issues: [],
                        };
                    }
                    deptMttrMap[deptName].solvedCount += 1;
                    deptMttrMap[deptName].issues.push(issue);
                    if (issue.pending_reason) {
                        deptMttrMap[deptName].pendingCount += 1;
                    }
                    if (durationMinutes !== null) {
                        deptMttrMap[deptName].totalMinutes += durationMinutes;
                        deptMttrMap[deptName].timedCount += 1;
                        if (durationMinutes < deptMttrMap[deptName].minMinutes) {
                            deptMttrMap[deptName].minMinutes = durationMinutes;
                        }
                        if (durationMinutes > deptMttrMap[deptName].maxMinutes) {
                            deptMttrMap[deptName].maxMinutes = durationMinutes;
                        }
                    }
                });

                // Aggregate Top Resolvers (Technicians / Staff)
                const workers = extractWorkerNames(issue);
                workers.forEach((workerName) => {
                    const key = workerName.toLowerCase();
                    if (!resolverMap[key]) {
                        resolverMap[key] = {
                            name: workerName,
                            shortName: workerName.length > 16 ? `${workerName.substring(0, 16)}...` : workerName,
                            resolvedCount: 0,
                            activeCount: 0,
                            totalMinutes: 0,
                            timedCount: 0,
                            issues: [],
                        };
                    }
                    resolverMap[key].resolvedCount += 1;
                    resolverMap[key].issues.push(issue);
                    if (durationMinutes !== null) {
                        resolverMap[key].totalMinutes += durationMinutes;
                        resolverMap[key].timedCount += 1;
                    }
                });
            } else {
                // Active (unresolved) issues
                if (!Number.isNaN(createdMs)) {
                    const ageMinutes = Math.max(0, (nowMs - createdMs) / 60000);
                    const timerBadge = getEtaBadgeInfo(issue, nowMs, isEn);
                    const isOverdueEta = Boolean(
                        timerBadge && (timerBadge.state === 'owner_escalated' || timerBadge.state === 'group_escalated')
                    );
                    oldestActiveList.push({ issue, ageMinutes, isOverdueEta });
                }

                // Count pending issues per dept for MTTR tooltip context
                if (issue.status === 'pending') {
                    targetDepts.forEach((d) => {
                        const deptName = (d || 'Umum').trim() || 'Umum';
                        if (deptMttrMap[deptName]) {
                            deptMttrMap[deptName].pendingCount += 1;
                        }
                    });
                }

                // Track active workload for workers
                const activeWorkers = extractWorkerNames(issue);
                activeWorkers.forEach((workerName) => {
                    const key = workerName.toLowerCase();
                    if (resolverMap[key]) {
                        resolverMap[key].activeCount += 1;
                    }
                });
            }
        });

        // Sort resolved tickets by duration descending (slowest first for inspection)
        resolvedWithDuration.sort((a, b) => b.durationMinutes - a.durationMinutes);

        const resolvedTimedCount = resolvedWithDuration.length;
        const totalDurationMins = resolvedWithDuration.reduce((sum, item) => sum + item.durationMinutes, 0);
        const avgMttrMinutes = resolvedTimedCount > 0 ? totalDurationMins / resolvedTimedCount : null;
        const minMttrMinutes = resolvedTimedCount > 0 ? resolvedWithDuration[resolvedTimedCount - 1].durationMinutes : null;
        const maxMttrMinutes = resolvedTimedCount > 0 ? resolvedWithDuration[0].durationMinutes : null;

        // Build per-department MTTR array
        const mttrByDept = Object.values(deptMttrMap)
            .filter((d) => d.timedCount > 0)
            .map((d) => {
                const avgMins = d.totalMinutes / d.timedCount;
                const avgHours = Number((avgMins / 60).toFixed(1));
                let statusType = 'normal';
                let speedStatus = isEn ? 'Standard' : 'Normal';
                if (avgHours <= 4) {
                    statusType = 'fast';
                    speedStatus = isEn ? 'Fast' : 'Cepat';
                } else if (d.pendingCount > 0 && avgHours > 12) {
                    statusType = 'pending_delay';
                    speedStatus = isEn ? 'Pending Delay' : 'Terkendala Pending';
                } else if (avgHours > 24) {
                    statusType = 'slow';
                    speedStatus = isEn ? 'Needs Attention' : 'Perlu Evaluasi';
                }
                const displayDept = formatDeptDisplay(d.department);
                return {
                    department: displayDept,
                    rawDepartment: d.department,
                    shortName: displayDept.length > 15 ? `${displayDept.substring(0, 15)}...` : displayDept,
                    avgHours,
                    avgMinutes: avgMins,
                    minMinutes: d.minMinutes === Infinity ? null : d.minMinutes,
                    maxMinutes: d.maxMinutes,
                    solvedCount: d.solvedCount,
                    pendingCount: d.pendingCount,
                    statusType,
                    speedStatus,
                    issues: d.issues,
                };
            })
            .sort((a, b) => b.avgHours - a.avgHours);

        // Build Top Resolver ranking
        const resolverList = Object.values(resolverMap)
            .filter((w) => w.resolvedCount > 0)
            .map((w) => ({
                ...w,
                avgMinutes: w.timedCount > 0 ? w.totalMinutes / w.timedCount : null,
            }))
            .sort((a, b) => {
                if (b.resolvedCount !== a.resolvedCount) return b.resolvedCount - a.resolvedCount;
                return (a.avgMinutes ?? Infinity) - (b.avgMinutes ?? Infinity);
            });

        // Sort oldest active issues descending (longest waiting first)
        oldestActiveList.sort((a, b) => b.ageMinutes - a.ageMinutes);
        const activeOver24hCount = oldestActiveList.filter((item) => item.ageMinutes >= 24 * 60).length;
        const activeOver3dCount = oldestActiveList.filter((item) => item.ageMinutes >= 3 * 24 * 60).length;
        const activeOver7dCount = oldestActiveList.filter((item) => item.ageMinutes >= 7 * 24 * 60).length;
        const activeOverdueEtaCount = oldestActiveList.filter((item) => item.isOverdueEta).length;

        return {
            resolvedWithDuration,
            resolvedTimedCount,
            avgMttrMinutes,
            minMttrMinutes,
            maxMttrMinutes,
            mttrByDept,
            resolverList,
            oldestActiveList,
            activeOver24hCount,
            activeOver3dCount,
            activeOver7dCount,
            activeOverdueEtaCount,
        };
    }, [filteredIssues, nowMs, isEn]);

    // -------------------------------------------------------------
    // Executive Visual Charts Data
    // -------------------------------------------------------------
    // 1. Issue Volume Trend Data (Supports '6m' | '1y' | 'semester' | 'yearly')
    const trendChartData = useMemo(() => {
        const monthNamesId = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
        const monthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        if (trendPeriodMode === 'yearly') {
            // Group by calendar year
            const yearMap = {};
            (issues || []).forEach((issue) => {
                if (!issue.created_at) return;
                const d = new Date(issue.created_at);
                if (isNaN(d.getTime())) return;
                const y = String(d.getFullYear());
                if (!yearMap[y]) {
                    yearMap[y] = { name: y, fullName: isEn ? `Year ${y}` : `Tahun ${y}`, total: 0, resolved: 0 };
                }
                yearMap[y].total += 1;
                if (issue.status === 'resolved') {
                    yearMap[y].resolved += 1;
                }
            });
            const result = Object.values(yearMap).sort((a, b) => a.name.localeCompare(b.name));
            return result.length > 0 ? result : [{ name: '2026', total: 0, resolved: 0 }];
        }

        if (trendPeriodMode === 'semester') {
            // Group by Semester: S1 (Jan - Jun) vs S2 (Jul - Des)
            const semMap = {};
            (issues || []).forEach((issue) => {
                if (!issue.created_at) return;
                const d = new Date(issue.created_at);
                if (isNaN(d.getTime())) return;
                const y = d.getFullYear();
                if (selectedYear !== 'all' && y !== parseInt(selectedYear, 10)) return;
                const m = d.getMonth();
                const semNum = m < 6 ? 1 : 2;
                const key = `${y}-S${semNum}`;
                if (!semMap[key]) {
                    const semLabel = semNum === 1
                        ? `S1 ${y} (Jan-Jun)`
                        : (isEn ? `S2 ${y} (Jul-Dec)` : `S2 ${y} (Jul-Des)`);
                    semMap[key] = {
                        key,
                        name: semLabel,
                        fullName: semLabel,
                        total: 0,
                        resolved: 0,
                    };
                }
                semMap[key].total += 1;
                if (issue.status === 'resolved') {
                    semMap[key].resolved += 1;
                }
            });
            const result = Object.values(semMap).sort((a, b) => a.key.localeCompare(b.key));
            return result.length > 0 ? result : [
                { name: 'S1 (Jan-Jun)', total: 0, resolved: 0 },
                { name: isEn ? 'S2 (Jul-Dec)' : 'S2 (Jul-Des)', total: 0, resolved: 0 },
            ];
        }

        if (trendPeriodMode === '1y') {
            // 1 Year Full: 12 months (Jan s.d. Des) for selected year or latest year
            let targetYear = selectedYear !== 'all' ? parseInt(selectedYear, 10) : 2026;
            if (selectedYear === 'all') {
                for (const issue of (issues || [])) {
                    if (issue.created_at) {
                        const d = new Date(issue.created_at);
                        if (!isNaN(d.getTime())) {
                            targetYear = Math.max(targetYear, d.getFullYear());
                        }
                    }
                }
            }

            const yearMonths = [];
            for (let m = 0; m < 12; m++) {
                yearMonths.push({
                    monthIndex: m,
                    name: isEn ? monthNamesEn[m] : monthNamesId[m],
                    fullName: `${isEn ? monthNamesEn[m] : monthNamesId[m]} ${targetYear}`,
                    total: 0,
                    resolved: 0,
                });
            }

            (issues || []).forEach((issue) => {
                if (!issue.created_at) return;
                const d = new Date(issue.created_at);
                if (isNaN(d.getTime())) return;
                if (d.getFullYear() === targetYear) {
                    const m = d.getMonth();
                    if (yearMonths[m]) {
                        yearMonths[m].total += 1;
                        if (issue.status === 'resolved') {
                            yearMonths[m].resolved += 1;
                        }
                    }
                }
            });

            return yearMonths;
        }

        // Default '6m': Last 6 active monthly entries
        const map = {};
        (issues || []).forEach((issue) => {
            if (!issue.created_at) return;
            const d = new Date(issue.created_at);
            if (isNaN(d.getTime())) return;
            const y = d.getFullYear();
            if (selectedYear !== 'all' && y !== parseInt(selectedYear, 10)) return;
            const m = d.getMonth();
            const key = `${y}-${String(m + 1).padStart(2, '0')}`;
            if (!map[key]) {
                map[key] = {
                    key,
                    name: isEn ? monthNamesEn[m] : monthNamesId[m],
                    fullName: `${isEn ? monthNamesEn[m] : monthNamesId[m]} ${y}`,
                    total: 0,
                    resolved: 0,
                };
            }
            map[key].total += 1;
            if (issue.status === 'resolved') {
                map[key].resolved += 1;
            }
        });

        const sorted = Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
        return sorted.length > 6 ? sorted.slice(-6) : sorted;
    }, [issues, trendPeriodMode, isEn, selectedYear]);

    // 2. Auto Progress Timer & Escalation Donut Data (1h Group / 3h Owner)
    const slaDonutData = useMemo(() => {
        const onTime = stats.onTimeResolvedCount || 0;
        const late = (stats.lateResolvedCount || 0) + (stats.overdueActiveCount || 0);
        const activeScheduled = Math.max(0, (stats.withEtaCount || 0) - onTime - late);

        const data = [
            {
                name: isEn ? 'Resolved Clean (No Escalation)' : 'Selesai Tanpa Eskalasi',
                value: onTime,
                color: '#10b981', // emerald-500
            },
            {
                name: isEn ? 'Escalated (1h/3h+ No Update)' : 'Kena Eskalasi (1j/3j+)',
                value: late,
                color: '#f43f5e', // rose-500
            },
            {
                name: isEn ? 'Active / Paused (Safe)' : 'Aktif / Dijeda (Aman)',
                value: activeScheduled,
                color: '#0284c7', // sky-600
            },
        ].filter((d) => d.value > 0);

        return data.length > 0 ? data : [{ name: isEn ? 'No Data' : 'Belum Ada', value: 1, color: '#94a3b8' }];
    }, [stats, isEn]);

    // 3. Department Workload Data (Stacked Bar: Resolved vs Active)
    // Supports Top N / All limit, custom multi-department selection, and optional 0-issue departments
    const deptWorkloadFilteredItems = useMemo(() => {
        if (Array.isArray(deptChartSelectedDepts)) {
            const selectedSet = new Set(deptChartSelectedDepts);
            return (deptMetrics.allTargetList || []).filter((d) => selectedSet.has(d.name));
        }
        const sourceList = deptChartIncludeZero
            ? (deptMetrics.allTargetList || [])
            : (deptMetrics.targetList || []);
        if (deptChartLimit === 'all') {
            return sourceList;
        }
        const limitNum = parseInt(deptChartLimit, 10) || 6;
        return sourceList.slice(0, limitNum);
    }, [deptMetrics.allTargetList, deptMetrics.targetList, deptChartSelectedDepts, deptChartIncludeZero, deptChartLimit]);

    const deptWorkloadChartData = useMemo(() => {
        return deptWorkloadFilteredItems
            .map((d) => ({
                rawName: d.name,
                name: formatDeptDisplay(d.name),
                resolved: d.resolved,
                active: d.active,
                total: d.total,
            }))
            .reverse();
    }, [deptWorkloadFilteredItems]);

    const deptWorkloadActiveNamesSet = useMemo(
        () => new Set(deptWorkloadFilteredItems.map((d) => d.name)),
        [deptWorkloadFilteredItems]
    );

    const deptChecklistOptions = useMemo(() => {
        const all = deptMetrics.allTargetList || [];
        if (deptChartIncludeZero) return all;
        return all.filter((d) => d.total > 0 || deptWorkloadActiveNamesSet.has(d.name));
    }, [deptMetrics.allTargetList, deptChartIncludeZero, deptWorkloadActiveNamesSet]);

    const zeroIssueDeptCount = useMemo(
        () => (deptMetrics.allTargetList || []).filter((d) => d.total === 0).length,
        [deptMetrics.allTargetList]
    );

    const deptWorkloadChartHeight = useMemo(
        () => Math.max(240, deptWorkloadChartData.length * 38 + 56),
        [deptWorkloadChartData.length]
    );

    const handleToggleDeptChartItem = useCallback((deptName) => {
        setDeptChartSelectedDepts((prev) => {
            const baseList = Array.isArray(prev)
                ? prev
                : deptWorkloadFilteredItems.map((d) => d.name);
            if (baseList.includes(deptName)) {
                return baseList.filter((name) => name !== deptName);
            }
            return [...baseList, deptName];
        });
    }, [deptWorkloadFilteredItems]);

    const handleSelectAllDeptChart = useCallback(() => {
        const pool = deptChartIncludeZero
            ? (deptMetrics.allTargetList || [])
            : (deptMetrics.targetList || []);
        setDeptChartSelectedDepts(pool.map((d) => d.name));
    }, [deptChartIncludeZero, deptMetrics.allTargetList, deptMetrics.targetList]);

    const handleResetDeptChart = useCallback(() => {
        setDeptChartSelectedDepts(null);
        setDeptChartLimit('6');
        setDeptChartIncludeZero(false);
    }, []);

    // 4. Chart 4 Data: MTTR per Department & Top Resolvers (Technicians / Staff)
    const mttrChartData = useMemo(() => {
        return (performanceMetrics.mttrByDept || []).slice(0, 6);
    }, [performanceMetrics.mttrByDept]);

    const topWorkersChartData = useMemo(() => {
        return (performanceMetrics.resolverList || []).slice(0, 6);
    }, [performanceMetrics.resolverList]);

    const timeLabels = useMemo(() => {
        const base = isEn
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

        const yearLabel = selectedYear === 'all'
            ? (isEn ? 'All Years' : 'Semua Tahun')
            : (isEn ? `Year ${selectedYear}` : `Tahun ${selectedYear}`);

        const result = {};
        for (const [k, v] of Object.entries(base)) {
            result[k] = `${yearLabel} • ${v}`;
        }
        return result;
    }, [isEn, selectedYear]);

    // Handle Download PDF: Open official landscape export modal with interactive preview
    const handleDownloadPdf = () => {
        setIsExportPdfModalOpen(true);
    };

    return (
        <div className="space-y-6 animate-in fade-in pb-16">
            {/* SAFE HOLDING WARNING BANNER (ADMIN ONLY) */}
            {isAdmin && Object.keys(unconnectedYearAlerts).length > 0 && (
                <div className="border border-amber-500/40 rounded-2xl p-4 bg-amber-500/10 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <p className="font-bold text-sm text-amber-300">
                                {isEn ? 'Google Spreadsheet Not Connected for New Year' : 'Spreadsheet Belum Terhubung untuk Tahun Baru'}
                            </p>
                            <p className="text-amber-200/80 text-xs mt-0.5">
                                {Object.entries(unconnectedYearAlerts).map(([yr, count]) => (
                                    isEn 
                                        ? `Year ${yr}: ${count} ticket(s) safely held in database awaiting connection.` 
                                        : `Tahun ${yr}: ${count} tiket aman tertahan di database menunggu spreadsheet dihubungkan.`
                                )).join(' ')}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            const firstYr = Object.keys(unconnectedYearAlerts)[0];
                            if (firstYr) setNewSheetYear(firstYr);
                            setIsSpreadsheetModalOpen(true);
                            setSheetConnectMessage(null);
                        }}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 transition-all flex items-center gap-1.5 shadow-sm hover:scale-[1.02] active:scale-95 cursor-pointer"
                    >
                        <Settings className="w-4 h-4" />
                        <span>{isEn ? 'Connect Year Sheet' : 'Hubungkan Sheet Sekarang'}</span>
                    </button>
                </div>
            )}

            {/* ========================================================= */}
            {/* 1. TOP CONTROL BAR (TIME FILTER + QUICK ACTIONS)           */}
            {/* ========================================================= */}
            <div className="border rounded-2xl p-3.5 sm:p-4 transition-all liquid-glass-card">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {/* Filter Controls (Year Filter + Time / Month Filter) */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* 1. Global Year Filter Dropdown */}
                        <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-semibold flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                                {isEn ? 'Year:' : 'Tahun:'}
                            </span>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                                className={`text-xs font-semibold rounded-xl px-3 py-2 border shadow-sm cursor-pointer transition-all focus:ring-1 focus:ring-emerald-500 liquid-glass-control ${
                                    isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                                }`}
                                title={isEn ? 'Filter by Operating Year' : 'Filter berdasarkan Tahun Operasional'}
                            >
                                <option value="all">{isEn ? '📅 All Years' : '📅 Semua Tahun'}</option>
                                {availableYears.map((yr) => (
                                    <option key={yr} value={String(yr)}>
                                        {yr === 2026
                                            ? `✨ ${isEn ? 'Year' : 'Tahun'} ${yr} (${isEn ? 'Live' : 'Aktif'})`
                                            : `📁 ${isEn ? 'Year' : 'Tahun'} ${yr}`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 2. Time Filter Dropdown */}
                        <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-semibold flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                <Clock className="w-3.5 h-3.5 text-emerald-500" />
                                {isEn ? 'Period:' : 'Periode:'}
                            </span>
                            <select
                                value={timeRange}
                                onChange={(e) => setTimeRange(e.target.value)}
                                className={`text-xs font-semibold rounded-xl px-3 py-2 border shadow-sm cursor-pointer transition-all focus:ring-1 focus:ring-emerald-500 liquid-glass-control ${
                                    isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                                }`}
                            >
                                <option value="all">{isEn ? '📅 All Months (All Tabs)' : '📅 Semua Bulan (Semua Tab)'}</option>
                                <option value="today">{isEn ? '⚡ Today' : '⚡ Hari Ini'}</option>
                                <option value="7d">{isEn ? '🕒 Last 7 Days' : '🕒 7 Hari Terakhir'}</option>
                                <option value="30d">{isEn ? '🗓️ Last 30 Days' : '🗓️ 30 Hari Terakhir'}</option>
                                <optgroup label={isEn ? 'Monthly Filter' : 'Filter Bulanan'}>
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
                    </div>

                    {/* Quick Actions Bar: Ke Sheet Utama, Kelola Sheet (Hanya Admin) & Download PDF */}
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        {isAdmin && (
                            <>
                                {/* Tombol Ke Sheet Utama (Dinamis per Tab Bulan & Tahun - Khusus Admin) */}
                                {dynamicSheetUrl && (
                                    <a
                                        href={dynamicSheetUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white shadow-sm transition-all cursor-pointer group"
                                        title={
                                            isEn
                                                ? `Open Google Sheet: ${activeMonthDisplayName} Tab (${selectedYear !== 'all' ? selectedYear : '2026'})`
                                                : `Buka Google Sheet: Tab ${activeMonthName} (${selectedYear !== 'all' ? selectedYear : '2026'})`
                                        }
                                    >
                                        <FileSpreadsheet className="w-4 h-4 shrink-0 text-white" />
                                        <span className="text-white">
                                            {isEn
                                                ? `Open Sheet (${activeMonthDisplayName}${selectedYear !== 'all' ? ` '${String(selectedYear).slice(-2)}` : ''})`
                                                : `Ke Sheet (${activeMonthName}${selectedYear !== 'all' ? ` '${String(selectedYear).slice(-2)}` : ''})`}
                                        </span>
                                        <ExternalLink className="w-3.5 h-3.5 opacity-90 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-white" />
                                    </a>
                                )}

                                {/* Tombol Kelola Sheet Tahunan (Khusus Admin) */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsSpreadsheetModalOpen(true);
                                        setSheetConnectMessage(null);
                                    }}
                                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border shadow-sm transition-all cursor-pointer ${
                                        isDark 
                                            ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700' 
                                            : 'bg-white hover:bg-slate-50 text-emerald-700 border-slate-300'
                                    }`}
                                    title={isEn ? 'Manage Yearly Google Spreadsheets' : 'Kelola Google Spreadsheet Tahunan'}
                                >
                                    <Settings className="w-4 h-4 shrink-0" />
                                    <span>{isEn ? 'Manage Sheets' : 'Kelola Sheet'}</span>
                                </button>
                            </>
                        )}

                        {/* Tombol Download PDF (Tersedia untuk Semua Pengguna) */}
                        <button
                            type="button"
                            onClick={handleDownloadPdf}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white keep-white shadow-sm transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
                            title={isEn ? 'Open Official Telunas Landscape PDF Export (Classic Report with Preview)' : 'Buka Ekspor PDF Resmi Telunas (Format Klasik Landscape & Pratinjau)'}
                        >
                            <Download className="w-4 h-4 shrink-0 text-white" />
                            <span className="text-white">Download PDF</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ========================================================= */}
            {/* 2. CORE KPI METRICS 4-GRID BAR                            */}
            {/* ========================================================= */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* KPI 1: Total Tiket */}
                <div className={`p-4 rounded-2xl border shadow-sm relative overflow-hidden transition-all flex flex-col justify-between liquid-glass-card ${
                    isDark ? 'border-slate-700/80' : 'border-slate-200'
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
                                    {stats.onTimeRate}% {isEn ? 'Clean' : 'Tanpa Eskalasi'}
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
                <div className={`p-4 rounded-2xl border shadow-sm relative overflow-hidden transition-all flex flex-col justify-between liquid-glass-card ${
                    isDark ? 'border-slate-700/80' : 'border-slate-200'
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
                                    {stats.overdueActiveCount} {isEn ? 'Escalated (1h/3h+)' : 'Eskalasi (1j/3j+)'}
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
                        <div className={`p-4 rounded-2xl border shadow-sm relative overflow-hidden transition-all flex flex-col justify-between liquid-glass-card ${
                            isDark ? 'border-slate-700/80' : 'border-slate-200'
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

                {/* KPI 4: Performa & Kecepatan Operasional (Multi-Mode: MTTR / Top Teknisi / Isu Terlama) */}
                {(() => {
                    let headline = '-';
                    let bigValue = '-';
                    let badgeText = '';
                    let badgeStyle = '';
                    let subInfo = '';
                    let accentText = isDark ? 'text-amber-300' : 'text-amber-700';
                    let hoverBorder = isDark ? 'border-slate-700/80 hover:border-amber-500/50' : 'border-slate-200 hover:border-amber-400';
                    let canOpenModal = false;

                    const handleOpenPerfModal = () => {
                        if (perfMode === 'mttr' && performanceMetrics.resolvedWithDuration.length > 0) {
                            setSelectedPerfModal({
                                title: isEn ? 'Resolution Speed Breakdown (MTTR)' : 'Rincian Kecepatan Penyelesaian (MTTR)',
                                subtitle: isEn
                                    ? `Avg: ${formatDurationCompact(performanceMetrics.avgMttrMinutes, true)} across ${performanceMetrics.resolvedTimedCount} resolved tickets (sorted slowest first)`
                                    : `Rata-rata: ${formatDurationCompact(performanceMetrics.avgMttrMinutes, false)} dari ${performanceMetrics.resolvedTimedCount} tiket selesai (diurutkan terlama)`,
                                accent: 'sky',
                                items: performanceMetrics.resolvedWithDuration.map((r) => ({
                                    issue: r.issue,
                                    durationLabel: `${isEn ? 'Resolved in' : 'Selesai dlm'} ${formatDurationCompact(r.durationMinutes, isEn)}`,
                                })),
                            });
                        } else if (perfMode === 'top_resolver' && performanceMetrics.resolverList.length > 0) {
                            const topW = performanceMetrics.resolverList[0];
                            setSelectedPerfModal({
                                title: isEn ? `Resolved by ${topW.name}` : `Tiket Diselesaikan: ${topW.name}`,
                                subtitle: isEn
                                    ? `${topW.resolvedCount} tickets resolved${topW.avgMinutes !== null ? ` • Avg ${formatDurationCompact(topW.avgMinutes, true)}` : ''}`
                                    : `${topW.resolvedCount} tiket tuntas${topW.avgMinutes !== null ? ` • Rata-rata ${formatDurationCompact(topW.avgMinutes, false)}` : ''}`,
                                accent: 'emerald',
                                items: topW.issues.map((iss) => {
                                    const createdMs = iss.created_at ? new Date(iss.created_at).getTime() : NaN;
                                    const rawRes = iss.resolved_at || iss.solved_at || iss.updated_at;
                                    const resMs = rawRes ? new Date(rawRes).getTime() : NaN;
                                    const mins = !Number.isNaN(createdMs) && !Number.isNaN(resMs) && resMs >= createdMs ? (resMs - createdMs) / 60000 : null;
                                    return {
                                        issue: iss,
                                        durationLabel: mins !== null ? formatDurationCompact(mins, isEn) : null,
                                    };
                                }),
                            });
                        } else if (perfMode === 'oldest_active' && performanceMetrics.oldestActiveList.length > 0) {
                            setPerfModalAgeFilter('all');
                            setSelectedPerfModal({
                                title: isEn ? 'Oldest Unresolved Issues' : 'Daftar Isu Aktif Terlama',
                                subtitle: isEn
                                    ? `${performanceMetrics.oldestActiveList.length} active tickets • ${performanceMetrics.activeOverdueEtaCount} escalated (1h/3h+) • ${performanceMetrics.activeOver7dCount} waiting > 7 days`
                                    : `${performanceMetrics.oldestActiveList.length} tiket aktif • ${performanceMetrics.activeOverdueEtaCount} eskalasi (1j/3j+) • ${performanceMetrics.activeOver7dCount} tunggu > 7 hari`,
                                accent: 'rose',
                                enableAgeFilters: true,
                                items: performanceMetrics.oldestActiveList.map((o) => ({
                                    issue: o.issue,
                                    ageMinutes: o.ageMinutes,
                                    isOverdueEta: o.isOverdueEta,
                                    durationLabel: `${isEn ? 'Waiting' : 'Menunggu'} ${formatDurationCompact(o.ageMinutes, isEn)}`,
                                })),
                            });
                        }
                    };

                    if (perfMode === 'mttr') {
                        const hasData = performanceMetrics.resolvedTimedCount > 0;
                        canOpenModal = hasData;
                        accentText = isDark ? 'text-sky-300' : 'text-sky-700';
                        hoverBorder = isDark ? 'border-slate-700/80 hover:border-sky-500/50' : 'border-slate-200 hover:border-sky-400';
                        headline = isEn ? 'Avg. Resolution Time (MTTR)' : 'Rata-rata Durasi Selesai';
                        bigValue = hasData ? formatDurationCompact(performanceMetrics.avgMttrMinutes, isEn) : '-';
                        badgeText = `${performanceMetrics.resolvedTimedCount} ${isEn ? 'resolved' : 'tiket selesai'}`;
                        badgeStyle = isDark ? 'bg-sky-950/80 border-sky-800/60 text-sky-300' : 'bg-sky-100 border-sky-300 text-sky-800';
                        subInfo = hasData
                            ? (isEn
                                ? `Fastest: ${formatDurationCompact(performanceMetrics.minMttrMinutes, true)} • Slowest: ${formatDurationCompact(performanceMetrics.maxMttrMinutes, true)} (Click)`
                                : `Tercepat: ${formatDurationCompact(performanceMetrics.minMttrMinutes, false)} • Terlama: ${formatDurationCompact(performanceMetrics.maxMttrMinutes, false)} (Klik)`)
                            : (isEn ? 'No resolved tickets in this period' : 'Belum ada tiket selesai pada periode ini');
                    } else if (perfMode === 'top_resolver') {
                        const topW = performanceMetrics.resolverList[0] || null;
                        const rank2 = performanceMetrics.resolverList[1] || null;
                        const rank3 = performanceMetrics.resolverList[2] || null;
                        canOpenModal = Boolean(topW);
                        accentText = isDark ? 'text-emerald-300' : 'text-emerald-700';
                        hoverBorder = isDark ? 'border-slate-700/80 hover:border-emerald-500/50' : 'border-slate-200 hover:border-emerald-400';
                        headline = topW ? `#1 ${topW.name}` : '-';
                        bigValue = topW ? `${topW.resolvedCount} ${isEn ? 'Solved' : 'Selesai'}` : (isEn ? '0 Solved' : '0 Selesai');
                        badgeText = topW && topW.avgMinutes !== null
                            ? `Avg ${formatDurationCompact(topW.avgMinutes, isEn)}`
                            : (isEn ? 'Top Staff' : 'Teraktif');
                        badgeStyle = isDark ? 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-800';
                        subInfo = (rank2 || rank3)
                            ? `#2 ${rank2?.name || '-'}: ${rank2?.resolvedCount || 0} • #3 ${rank3?.name || '-'}: ${rank3?.resolvedCount || 0} (${isEn ? 'Click' : 'Klik'})`
                            : (topW
                                ? (isEn ? 'Most tickets resolved (Click details)' : 'Penyelesaian terbanyak (Klik rincian)')
                                : (isEn ? 'No technician data recorded' : 'Belum ada data penyelesaian teknisi'));
                    } else {
                        const oldest = performanceMetrics.oldestActiveList[0] || null;
                        canOpenModal = Boolean(oldest);
                        accentText = oldest ? (isDark ? 'text-rose-300' : 'text-rose-700') : (isDark ? 'text-emerald-300' : 'text-emerald-700');
                        hoverBorder = isDark ? 'border-slate-700/80 hover:border-rose-500/50' : 'border-slate-200 hover:border-rose-400';
                        headline = oldest
                            ? `#${oldest.issue.issue_code || oldest.issue.id} ${oldest.issue.title}`
                            : (isEn ? 'All Tickets Resolved!' : 'Semua Tiket Tuntas!');
                        bigValue = oldest ? formatDurationCompact(oldest.ageMinutes, isEn) : (isEn ? '0 Active' : '0 Aktif');

                        if (oldest) {
                            const oldestStatus = getStatusLabel(oldest.issue.status);
                            const oldestDeptRaw = Array.isArray(oldest.issue.target_departments) && oldest.issue.target_departments.length > 0
                                ? oldest.issue.target_departments[0]
                                : (oldest.issue.target_departments || 'Umum');
                            const oldestDept = formatDeptDisplay(oldestDeptRaw);
                            badgeText = `${oldestStatus} · ${oldestDept}`;
                            badgeStyle = oldest.issue.status === 'pending'
                                ? (isDark ? 'bg-amber-950/80 border-amber-700/60 text-amber-300' : 'bg-amber-100 border-amber-300 text-amber-800')
                                : oldest.issue.status === 'in_progress'
                                ? (isDark ? 'bg-sky-950/80 border-sky-700/60 text-sky-300' : 'bg-sky-100 border-sky-300 text-sky-800')
                                : (isDark ? 'bg-rose-950/80 border-rose-800/60 text-rose-300' : 'bg-rose-100 border-rose-300 text-rose-800');

                            const parts = [];
                            if (performanceMetrics.activeOverdueEtaCount > 0) {
                                parts.push(isEn ? `${performanceMetrics.activeOverdueEtaCount} escalated (1h/3h+)` : `${performanceMetrics.activeOverdueEtaCount} eskalasi (1j/3j+)`);
                            }
                            if (performanceMetrics.activeOver7dCount > 0) {
                                parts.push(isEn ? `${performanceMetrics.activeOver7dCount} > 7d` : `${performanceMetrics.activeOver7dCount} tunggu > 7 hari`);
                            } else if (performanceMetrics.activeOver3dCount > 0) {
                                parts.push(isEn ? `${performanceMetrics.activeOver3dCount} > 3d` : `${performanceMetrics.activeOver3dCount} tunggu > 3 hari`);
                            }
                            if (parts.length === 0) {
                                parts.push(isEn ? `${performanceMetrics.oldestActiveList.length} active tickets` : `${performanceMetrics.oldestActiveList.length} tiket aktif`);
                            }
                            subInfo = `${parts.join(' • ')} (${isEn ? 'Click details' : 'Klik rincian'})`;
                        } else {
                            badgeText = isEn ? 'Clear' : 'Tuntas';
                            badgeStyle = isDark ? 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-800';
                            subInfo = isEn ? 'No active backlog remaining' : 'Tidak ada antrean tiket aktif';
                        }
                    }

                    return (
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={() => canOpenModal && handleOpenPerfModal()}
                            onKeyDown={(e) => {
                                if ((e.key === 'Enter' || e.key === ' ') && canOpenModal) {
                                    e.preventDefault();
                                    handleOpenPerfModal();
                                }
                            }}
                            className={`p-4 rounded-2xl border shadow-sm relative overflow-hidden transition-all ${canOpenModal ? 'cursor-pointer' : 'cursor-default'} group flex flex-col justify-between liquid-glass-card liquid-glass-interactive ${hoverBorder}`}
                            title={canOpenModal ? (isEn ? 'Click to view ticket breakdown' : 'Klik untuk melihat rincian tiket') : undefined}
                        >
                            <div>
                                <div className="flex items-center justify-between gap-1.5">
                                    <span className={`text-xs font-semibold shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {isEn ? 'Speed & Team' : 'Performa & Tim'}
                                    </span>
                                    <select
                                        value={perfMode}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            const nextMode = e.target.value;
                                            setPerfMode(nextMode);
                                            if (nextMode === 'mttr') setChart4Mode('mttr_dept');
                                            if (nextMode === 'top_resolver') setChart4Mode('top_workers');
                                        }}
                                        className={`text-[10px] font-bold rounded-lg px-2 py-0.5 border cursor-pointer transition-colors focus:ring-1 focus:ring-sky-500 max-w-[135px] truncate ${
                                            isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-800'
                                        }`}
                                        title={isEn ? 'Switch metric: MTTR, Top Technician, or Oldest Active' : 'Pilih metrik: Rata-rata Selesai (MTTR), Teknisi Teraktif, atau Isu Terlama'}
                                    >
                                        <option value="mttr">{isEn ? '⏱️ Avg. Speed (MTTR)' : '⏱️ Rata-rata (MTTR)'}</option>
                                        <option value="top_resolver">{isEn ? '👷 Top Technician' : '👷 Teknisi Teraktif'}</option>
                                        <option value="oldest_active">{isEn ? '🚨 Oldest Active' : '🚨 Isu Terlama'}</option>
                                    </select>
                                </div>
                                <div className="mt-2">
                                    <span
                                        title={headline}
                                        className={`text-sm sm:text-base font-bold line-clamp-1 leading-snug block ${canOpenModal ? 'group-hover:underline' : ''} ${accentText}`}
                                    >
                                        {headline}
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
            </div>

            {stats.withEtaCount > 0 && (
                <div className={`px-4 py-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs liquid-glass-card ${
                    isDark ? 'border-slate-700/80' : 'border-slate-200 shadow-sm'
                }`}>
                    <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isDark ? 'bg-sky-500/20 text-sky-400' : 'bg-sky-100 text-sky-700'
                        }`}>
                            <CalendarClock className="w-4 h-4" />
                        </div>
                        <div>
                            <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {isEn ? 'Auto Progress Timer & Escalation Overview' : 'Ringkasan Timer Progres & Eskalasi Otomatis'}
                            </span>
                            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {isEn
                                    ? `${stats.withEtaCount} ticket(s) tracked by 1h Supervisor / 3h Owner escalation timer in this period`
                                    : `${stats.withEtaCount} tiket terpantau timer eskalasi otomatis (1j Supervisor / 3j Owner) pada periode ini`}
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
                                    ? `Clean Resolved: ${stats.onTimeResolvedCount}/${stats.evaluatedSlaCount} (${stats.onTimeRate}%)`
                                    : `Tanpa Eskalasi: ${stats.onTimeResolvedCount}/${stats.evaluatedSlaCount} (${stats.onTimeRate}%)`}
                            </span>
                        )}
                        <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
                            stats.overdueActiveCount > 0
                                ? (isDark ? 'bg-rose-950/75 border-rose-700/60 text-rose-300' : 'bg-rose-50 border-rose-300 text-rose-700')
                                : (isDark ? 'bg-emerald-950/60 border-emerald-800/50 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700')
                        }`}>
                            {stats.overdueActiveCount > 0
                                ? (isEn ? `Active Escalated (1h/3h+): ${stats.overdueActiveCount}` : `Aktif Eskalasi (1j/3j+): ${stats.overdueActiveCount}`)
                                : (isEn ? 'All Active Tickets Safe (< 1h)' : 'Semua Tiket Aktif Aman (< 1j)')}
                        </span>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* 4.5. EXECUTIVE OPERATIONS VISUAL CHARTS (THE BIG 4)        */}
            {/* ========================================================= */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            <BarChart2 className="w-4 h-4 text-sky-400" />
                            {isEn ? 'Executive Operations Analytics' : 'Grafik Analisis Operasional Eksekutif'}
                        </h3>
                        <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {isEn
                                ? 'Visual intelligence for monthly issue trends, auto escalation timer status (1h/3h), department workloads, and resolution speed (MTTR)'
                                : 'Visualisasi tren isu bulanan, status timer eskalasi (1j/3j), beban kerja departemen, serta kecepatan penyelesaian (MTTR) & performa tim'}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* CHART 1: Monthly Issue Trend (Composed Bar + Line with Period Switcher) */}
                    <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm transition-all liquid-glass-card min-w-0 flex flex-col justify-between ${
                        isDark ? 'border-slate-700/80 bg-slate-900/40' : 'border-slate-200 bg-white/70'
                    }`}>
                        <div className="flex items-center justify-between pb-3 border-b border-slate-700/20 mb-3 gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-sky-400 shrink-0" />
                                <h4 className={`text-xs sm:text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {trendPeriodMode === 'yearly'
                                        ? (isEn ? 'Yearly Issue Volume Trend' : 'Tren Volume Isu Tahunan')
                                        : trendPeriodMode === 'semester'
                                        ? (isEn ? 'Semester Volume Trend (6 Months)' : 'Tren Volume per 6 Bulan (Semester)')
                                        : trendPeriodMode === '1y'
                                        ? (isEn ? 'Full Year Trend (12 Months)' : 'Tren Volume 1 Tahun Penuh (12 Bulan)')
                                        : (isEn ? 'Last 6 Months Trend' : 'Tren Volume Isu (6 Bulan Terakhir)')}
                                </h4>
                            </div>

                            {/* Interactive Period Switcher */}
                            <select
                                value={trendPeriodMode}
                                onChange={(e) => setTrendPeriodMode(e.target.value)}
                                className={`text-[10.5px] font-semibold rounded-lg px-2.5 py-1 border shadow-2xs cursor-pointer transition-all focus:ring-1 focus:ring-sky-500 ${
                                    isDark
                                        ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
                                }`}
                                title={isEn ? 'Select trend aggregation period' : 'Pilih periode agregasi tren'}
                            >
                                <option value="6m">{isEn ? '📅 Last 6 Months' : '📅 6 Bulan Terakhir'}</option>
                                <option value="1y">{isEn ? '🗓️ Full Year (12 Mos)' : '🗓️ 1 Tahun (12 Bulan)'}</option>
                                <option value="semester">{isEn ? '🌓 Half-Yearly (Semesters)' : '🌓 Per 6 Bulan (Semester)'}</option>
                                <option value="yearly">{isEn ? '📆 Yearly (Annual)' : '📆 Per Tahun (Tahunan)'}</option>
                            </select>
                        </div>
                        <div className="w-full h-[240px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={trendChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.6} />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                                        axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                                        axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                                        tickLine={false}
                                    />
                                    <RechartsTooltip
                                        contentStyle={{
                                            backgroundColor: isDark ? '#0f172a' : '#ffffff',
                                            borderColor: isDark ? '#334155' : '#e2e8f0',
                                            borderRadius: '0.75rem',
                                            fontSize: '11px',
                                            color: isDark ? '#f8fafc' : '#0f172a',
                                        }}
                                        itemStyle={{ color: isDark ? '#f8fafc' : '#0f172a' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                                    <Bar
                                        dataKey="total"
                                        name={isEn ? 'New Issues' : 'Isu Masuk'}
                                        fill="#38bdf8"
                                        radius={[4, 4, 0, 0]}
                                        barSize={trendPeriodMode === '1y' ? 12 : (trendPeriodMode === 'yearly' || trendPeriodMode === 'semester' ? 32 : 18)}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="resolved"
                                        name={isEn ? 'Resolved' : 'Selesai'}
                                        stroke="#10b981"
                                        strokeWidth={2.5}
                                        dot={{ r: 3.5, fill: '#10b981' }}
                                        activeDot={{ r: 5 }}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* CHART 2: SLA Target Compliance (Donut) */}
                    <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm transition-all liquid-glass-card min-w-0 flex flex-col justify-between ${
                        isDark ? 'border-slate-700/80 bg-slate-900/40' : 'border-slate-200 bg-white/70'
                    }`}>
                        <div className="flex items-center justify-between pb-3 border-b border-slate-700/20 mb-3">
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-emerald-400" />
                                <h4 className={`text-xs sm:text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {isEn ? 'Progress Timer & Escalation Status' : 'Status Timer Progres & Eskalasi'}
                                </h4>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                (stats.onTimeRate ?? 0) >= 80
                                    ? isDark ? 'bg-emerald-950/80 text-emerald-300' : 'bg-emerald-100 text-emerald-800'
                                    : isDark ? 'bg-amber-950/80 text-amber-300' : 'bg-amber-100 text-amber-800'
                            }`}>
                                {stats.onTimeRate !== null ? `${stats.onTimeRate}% ${isEn ? 'Clean' : 'Tanpa Eskalasi'}` : (isEn ? 'No Data' : 'Belum Ada')}
                            </span>
                        </div>
                        <div className="relative w-full h-[240px] flex items-center justify-center">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={slaDonutData}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={55}
                                        outerRadius={80}
                                        paddingAngle={4}
                                    >
                                        {slaDonutData.map((entry, idx) => (
                                            <Cell key={`sla-cell-${idx}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip
                                        contentStyle={{
                                            backgroundColor: isDark ? '#0f172a' : '#ffffff',
                                            borderColor: isDark ? '#334155' : '#e2e8f0',
                                            borderRadius: '0.75rem',
                                            fontSize: '11px',
                                            color: isDark ? '#f8fafc' : '#0f172a',
                                        }}
                                        itemStyle={{ color: isDark ? '#f8fafc' : '#0f172a' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-6">
                                <span className={`text-xl font-extrabold ${
                                    (stats.onTimeRate ?? 0) >= 80 ? 'text-emerald-500' : 'text-amber-500'
                                }`}>
                                    {stats.onTimeRate !== null ? `${stats.onTimeRate}%` : '-'}
                                </span>
                                <span className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {isEn ? 'Clean' : 'Tanpa Eskalasi'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* CHART 3: Department Workload (Horizontal Stacked Bar) */}
                    <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm transition-all liquid-glass-card min-w-0 flex flex-col justify-between relative ${
                        isDeptChartPickerOpen ? 'z-40' : 'z-0'
                    } ${
                        isDark ? 'border-slate-700/80 bg-slate-900/40' : 'border-slate-200 bg-white/70'
                    }`}>
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-700/20 mb-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
                                <h4 className={`text-xs sm:text-sm font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {isEn ? 'Workload per Department' : 'Beban Kerja per Departemen'}
                                </h4>
                            </div>

                            {/* Interactive Controls: Top N / All Dropdown + Multi-Department Checklist Popover */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <select
                                    aria-label={isEn ? 'Department display limit' : 'Batas jumlah departemen'}
                                    value={Array.isArray(deptChartSelectedDepts) ? 'custom' : deptChartLimit}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'custom') return;
                                        setDeptChartSelectedDepts(null);
                                        setDeptChartLimit(val);
                                    }}
                                    className={`text-[11px] font-semibold rounded-lg px-2 py-1 border cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                                        isDark
                                            ? 'bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-600'
                                            : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
                                    }`}
                                >
                                    {Array.isArray(deptChartSelectedDepts) && (
                                        <option value="custom">
                                            {isEn ? `Custom (${deptWorkloadChartData.length})` : `Kustom (${deptWorkloadChartData.length})`}
                                        </option>
                                    )}
                                    <option value="5">{isEn ? 'Top 5 Depts' : 'Top 5 Dept'}</option>
                                    <option value="6">{isEn ? 'Top 6 Depts' : 'Top 6 Dept'}</option>
                                    <option value="10">{isEn ? 'Top 10 Depts' : 'Top 10 Dept'}</option>
                                    <option value="all">{isEn ? 'All Depts' : 'Semua Dept'}</option>
                                </select>

                                <div className="relative" ref={deptChartPickerRef}>
                                    <button
                                        type="button"
                                        aria-expanded={isDeptChartPickerOpen}
                                        onClick={() => setIsDeptChartPickerOpen((prev) => !prev)}
                                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                                            Array.isArray(deptChartSelectedDepts)
                                                ? (isDark
                                                    ? 'bg-emerald-950/80 border-emerald-600/70 text-emerald-300 hover:bg-emerald-900/70'
                                                    : 'bg-emerald-50 border-emerald-400 text-emerald-700 hover:bg-emerald-100')
                                                : (isDark
                                                    ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                                                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50')
                                        }`}
                                        title={isEn ? 'Select specific departments to compare' : 'Pilih beberapa departemen tertentu untuk dibandingkan'}
                                    >
                                        <Filter className="w-3 h-3 shrink-0" />
                                        <span>
                                            {Array.isArray(deptChartSelectedDepts)
                                                ? (isEn ? `${deptWorkloadChartData.length} Selected` : `${deptWorkloadChartData.length} Dipilih`)
                                                : (isEn ? 'Pick Depts' : 'Pilih Dept')}
                                        </span>
                                        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${isDeptChartPickerOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isDeptChartPickerOpen && (
                                        <div className={`absolute right-0 mt-1.5 w-64 max-w-[calc(100vw-3rem)] rounded-xl border shadow-2xl z-50 overflow-hidden ${
                                            isDark
                                                ? 'bg-slate-900 border-slate-700 text-slate-100'
                                                : 'bg-white border-slate-200 text-slate-800'
                                        }`}>
                                            <div className={`flex items-center justify-between px-3 py-2 border-b ${
                                                isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-100 bg-slate-50'
                                            }`}>
                                                <span className={`text-[11px] font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                    {isEn ? 'Compare Departments' : 'Pilih Departemen'}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleSelectAllDeptChart}
                                                        className={`text-[10px] font-semibold cursor-pointer ${
                                                            isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-700'
                                                        }`}
                                                    >
                                                        {isEn ? 'All' : 'Semua'}
                                                    </button>
                                                    <span className={isDark ? 'text-slate-700' : 'text-slate-300'}>|</span>
                                                    <button
                                                        type="button"
                                                        onClick={handleResetDeptChart}
                                                        className={`inline-flex items-center gap-0.5 text-[10px] font-semibold cursor-pointer ${
                                                            isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
                                                        }`}
                                                    >
                                                        <RotateCcw className="w-2.5 h-2.5" />
                                                        {isEn ? 'Reset' : 'Reset'}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="max-h-56 overflow-y-auto p-1.5 space-y-0.5">
                                                {deptChecklistOptions.length === 0 ? (
                                                    <p className={`text-[11px] text-center py-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        {isEn ? 'No departments available.' : 'Belum ada data departemen.'}
                                                    </p>
                                                ) : (
                                                    deptChecklistOptions.map((dept) => {
                                                        const isChecked = deptWorkloadActiveNamesSet.has(dept.name);
                                                        return (
                                                            <button
                                                                key={dept.name}
                                                                type="button"
                                                                onClick={() => handleToggleDeptChartItem(dept.name)}
                                                                className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                                                                    isChecked
                                                                        ? (isDark ? 'bg-emerald-950/60 text-emerald-200 hover:bg-emerald-950/80' : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100/80')
                                                                        : (isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100')
                                                                }`}
                                                            >
                                                                <span className="flex items-center gap-2 min-w-0">
                                                                    {isChecked ? (
                                                                        <CheckSquare className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                                                    ) : (
                                                                        <Square className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                                                                    )}
                                                                    <span className="truncate font-medium">
                                                                        {formatDeptDisplay(dept.name)}
                                                                    </span>
                                                                </span>
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                                                                    dept.total > 0
                                                                        ? (isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200/80 text-slate-700')
                                                                        : (isDark ? 'bg-slate-800/60 text-slate-500' : 'bg-slate-100 text-slate-400')
                                                                }`}>
                                                                    {dept.total}
                                                                </span>
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>

                                            {zeroIssueDeptCount > 0 && (
                                                <div className={`px-3 py-2 border-t ${
                                                    isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-100 bg-slate-50'
                                                }`}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeptChartIncludeZero((prev) => !prev)}
                                                        className={`w-full flex items-center justify-between text-[11px] font-medium cursor-pointer ${
                                                            isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                                                        }`}
                                                    >
                                                        <span className="flex items-center gap-1.5">
                                                            {deptChartIncludeZero ? (
                                                                <CheckSquare className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                                            ) : (
                                                                <Square className={`w-3.5 h-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                                                            )}
                                                            <span>{isEn ? 'Show 0-issue depts' : 'Tampilkan dept 0 isu'}</span>
                                                        </span>
                                                        <span className={`text-[10px] font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                            +{zeroIssueDeptCount}
                                                        </span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {(Array.isArray(deptChartSelectedDepts) || deptChartIncludeZero || deptChartLimit !== '6') && (
                                    <button
                                        type="button"
                                        onClick={handleResetDeptChart}
                                        className={`p-1 rounded-lg border transition-colors cursor-pointer ${
                                            isDark
                                                ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
                                                : 'bg-white border-slate-300 text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                                        }`}
                                        title={isEn ? 'Reset to Top 6' : 'Reset ke Top 6'}
                                        aria-label={isEn ? 'Reset department chart filter' : 'Reset filter grafik departemen'}
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {deptWorkloadChartData.length === 0 ? (
                            <div className="w-full h-[240px] flex flex-col items-center justify-center text-center gap-2.5 px-4">
                                <Building2 className={`w-8 h-8 ${isDark ? 'text-slate-600' : 'text-slate-300'}`} />
                                <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {Array.isArray(deptChartSelectedDepts)
                                        ? (isEn ? 'No departments selected to display.' : 'Belum ada departemen yang dipilih untuk ditampilkan.')
                                        : (isEn ? 'No department workload data in this period.' : 'Belum ada data beban kerja departemen pada periode ini.')}
                                </p>
                                {Array.isArray(deptChartSelectedDepts) && (
                                    <button
                                        type="button"
                                        onClick={handleResetDeptChart}
                                        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                                            isDark
                                                ? 'bg-emerald-950/70 border-emerald-700 text-emerald-300 hover:bg-emerald-900/80'
                                                : 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                                        }`}
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        {isEn ? 'Show Top 6 Departments' : 'Tampilkan Top 6 Departemen'}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="w-full max-h-[440px] overflow-y-auto pr-1">
                                <div style={{ height: `${deptWorkloadChartHeight}px`, width: '100%' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            layout="vertical"
                                            data={deptWorkloadChartData}
                                            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.6} horizontal={false} />
                                            <XAxis
                                                type="number"
                                                allowDecimals={false}
                                                tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                                                axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                type="category"
                                                dataKey="name"
                                                width={105}
                                                tick={{ fill: isDark ? '#e2e8f0' : '#334155', fontSize: 11 }}
                                                axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                                                tickLine={false}
                                            />
                                            <RechartsTooltip
                                                contentStyle={{
                                                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                                                    borderColor: isDark ? '#334155' : '#e2e8f0',
                                                    borderRadius: '0.75rem',
                                                    fontSize: '11px',
                                                    color: isDark ? '#f8fafc' : '#0f172a',
                                                }}
                                                itemStyle={{ color: isDark ? '#f8fafc' : '#0f172a' }}
                                            />
                                            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                                            <Bar
                                                dataKey="resolved"
                                                name={isEn ? 'Resolved' : 'Selesai'}
                                                stackId="deptStack"
                                                fill="#10b981"
                                                barSize={16}
                                            />
                                            <Bar
                                                dataKey="active"
                                                name={isEn ? 'Active / Backlog' : 'Sedang Berjalan'}
                                                stackId="deptStack"
                                                fill="#f59e0b"
                                                radius={[0, 4, 4, 0]}
                                                barSize={16}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* CHART 4: Resolution Speed (MTTR per Dept) / Top Active Technicians */}
                    <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm transition-all liquid-glass-card min-w-0 flex flex-col justify-between ${
                        isDark ? 'border-slate-700/80 bg-slate-900/40' : 'border-slate-200 bg-white/70'
                    }`}>
                        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-700/20 mb-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                {chart4Mode === 'mttr_dept' ? (
                                    <Clock className="w-4 h-4 text-sky-400" />
                                ) : (
                                    <Wrench className="w-4 h-4 text-emerald-400" />
                                )}
                                <h4 className={`text-xs sm:text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {chart4Mode === 'mttr_dept'
                                        ? (isEn ? 'Avg. Resolution Speed (MTTR) by Dept' : 'Kecepatan Penyelesaian (MTTR) per Dept')
                                        : (isEn ? 'Top Active Technicians / Staff' : 'Top 6 Teknisi / Staf Teraktif')}
                                </h4>
                            </div>
                            <div className={`inline-flex items-center p-0.5 rounded-lg border text-[10px] font-bold ${
                                isDark ? 'bg-slate-900/80 border-slate-700' : 'bg-slate-100 border-slate-200'
                            }`}>
                                <button
                                    type="button"
                                    onClick={() => setChart4Mode('mttr_dept')}
                                    className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                                        chart4Mode === 'mttr_dept'
                                            ? 'bg-sky-600 text-white shadow-xs keep-white'
                                            : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    {isEn ? 'MTTR Dept' : 'MTTR Dept'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setChart4Mode('top_workers')}
                                    className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                                        chart4Mode === 'top_workers'
                                            ? 'bg-emerald-600 text-white shadow-xs keep-white'
                                            : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    {isEn ? 'Top Staff' : 'Top Teknisi'}
                                </button>
                            </div>
                        </div>

                        <div className="w-full h-[240px]">
                            {chart4Mode === 'mttr_dept' ? (
                                mttrChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            layout="vertical"
                                            data={mttrChartData}
                                            margin={{ top: 5, right: 42, left: 10, bottom: 5 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.6} horizontal={false} />
                                            <XAxis
                                                type="number"
                                                unit={isEn ? 'h' : 'j'}
                                                tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                                                axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                type="category"
                                                dataKey="shortName"
                                                width={110}
                                                tick={{ fill: isDark ? '#e2e8f0' : '#334155', fontSize: 10 }}
                                                axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                                                tickLine={false}
                                            />
                                            <RechartsTooltip content={<CustomMttrTooltip />} />
                                            <Bar
                                                dataKey="avgHours"
                                                name={isEn ? 'Avg. Hours' : 'Rata-rata Jam'}
                                                radius={[0, 4, 4, 0]}
                                                barSize={16}
                                                className="cursor-pointer"
                                                onClick={(entry) => {
                                                    if (!entry || !entry.issues) return;
                                                    setSelectedPerfModal({
                                                        title: `${isEn ? 'Resolved Tickets:' : 'Tiket Selesai:'} ${entry.department}`,
                                                        subtitle: `${isEn ? 'Avg. MTTR' : 'Rata-rata MTTR'}: ${formatDurationCompact(entry.avgMinutes, isEn)} (${entry.solvedCount} ${isEn ? 'tickets' : 'tiket'})`,
                                                        accent: 'sky',
                                                        items: entry.issues.map((iss) => {
                                                            const cMs = iss.created_at ? new Date(iss.created_at).getTime() : NaN;
                                                            const rawR = iss.resolved_at || iss.solved_at || iss.updated_at;
                                                            const rMs = rawR ? new Date(rawR).getTime() : NaN;
                                                            const mins = !Number.isNaN(cMs) && !Number.isNaN(rMs) && rMs >= cMs ? (rMs - cMs) / 60000 : null;
                                                            return {
                                                                issue: iss,
                                                                durationLabel: mins !== null ? formatDurationCompact(mins, isEn) : null,
                                                            };
                                                        }),
                                                    });
                                                }}
                                            >
                                                {mttrChartData.map((entry, idx) => (
                                                    <Cell
                                                        key={`mttr-cell-${idx}`}
                                                        fill={
                                                            entry.statusType === 'fast'
                                                                ? '#10b981'
                                                                : entry.statusType === 'pending_delay'
                                                                ? '#f59e0b'
                                                                : entry.statusType === 'slow'
                                                                ? '#f43f5e'
                                                                : '#0ea5e9'
                                                        }
                                                    />
                                                ))}
                                                <LabelList
                                                    dataKey="avgHours"
                                                    position="right"
                                                    formatter={(v) => `${v}${isEn ? 'h' : 'j'}`}
                                                    fill={isDark ? '#e2e8f0' : '#334155'}
                                                    fontSize={10}
                                                    fontWeight={600}
                                                />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                                        <Clock className={`w-8 h-8 mb-2 ${isDark ? 'text-slate-600' : 'text-slate-300'}`} />
                                        <p className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {isEn ? 'No resolved ticket timing data for this period' : 'Belum ada data durasi tiket selesai pada periode ini'}
                                        </p>
                                    </div>
                                )
                            ) : (
                                topWorkersChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            layout="vertical"
                                            data={topWorkersChartData}
                                            margin={{ top: 5, right: 36, left: 10, bottom: 5 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.6} horizontal={false} />
                                            <XAxis
                                                type="number"
                                                allowDecimals={false}
                                                tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                                                axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                type="category"
                                                dataKey="shortName"
                                                width={110}
                                                tick={{ fill: isDark ? '#e2e8f0' : '#334155', fontSize: 10 }}
                                                axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                                                tickLine={false}
                                            />
                                            <RechartsTooltip
                                                formatter={(value, _name, item) => {
                                                    const avgStr = item?.payload?.avgMinutes !== null && item?.payload?.avgMinutes !== undefined
                                                        ? ` • Avg ${formatDurationCompact(item.payload.avgMinutes, isEn)}`
                                                        : '';
                                                    return [
                                                        `${value} ${isEn ? 'resolved' : 'selesai'}${avgStr}`,
                                                        item?.payload?.name || (isEn ? 'Technician' : 'Teknisi'),
                                                    ];
                                                }}
                                                contentStyle={{
                                                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                                                    borderColor: isDark ? '#334155' : '#e2e8f0',
                                                    borderRadius: '0.75rem',
                                                    fontSize: '11px',
                                                    color: isDark ? '#f8fafc' : '#0f172a',
                                                }}
                                                itemStyle={{ color: isDark ? '#f8fafc' : '#0f172a' }}
                                            />
                                            <Bar
                                                dataKey="resolvedCount"
                                                name={isEn ? 'Tickets Resolved' : 'Tiket Selesai'}
                                                fill="#10b981"
                                                radius={[0, 4, 4, 0]}
                                                barSize={16}
                                                className="cursor-pointer"
                                                onClick={(entry) => {
                                                    if (!entry || !entry.issues) return;
                                                    setSelectedPerfModal({
                                                        title: isEn ? `Resolved by ${entry.name}` : `Tiket Diselesaikan: ${entry.name}`,
                                                        subtitle: `${entry.resolvedCount} ${isEn ? 'tickets resolved' : 'tiket selesai'}${entry.avgMinutes !== null ? ` • Avg ${formatDurationCompact(entry.avgMinutes, isEn)}` : ''}`,
                                                        accent: 'emerald',
                                                        items: entry.issues.map((iss) => {
                                                            const cMs = iss.created_at ? new Date(iss.created_at).getTime() : NaN;
                                                            const rawR = iss.resolved_at || iss.solved_at || iss.updated_at;
                                                            const rMs = rawR ? new Date(rawR).getTime() : NaN;
                                                            const mins = !Number.isNaN(cMs) && !Number.isNaN(rMs) && rMs >= cMs ? (rMs - cMs) / 60000 : null;
                                                            return {
                                                                issue: iss,
                                                                durationLabel: mins !== null ? formatDurationCompact(mins, isEn) : null,
                                                            };
                                                        }),
                                                    });
                                                }}
                                            >
                                                <LabelList dataKey="resolvedCount" position="right" fill={isDark ? '#e2e8f0' : '#334155'} fontSize={10} fontWeight={600} />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                                        <Wrench className={`w-8 h-8 mb-2 ${isDark ? 'text-slate-600' : 'text-slate-300'}`} />
                                        <p className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {isEn ? 'No technician resolution records in this period' : 'Belum ada catatan penyelesaian teknisi pada periode ini'}
                                        </p>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ========================================================= */}
            {/* 6. MODAL DETAIL POPUP PERFORMA / MTTR / TOP TEKNISI       */}
            {/* ========================================================= */}
            {selectedPerfModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className={`w-full max-w-2xl max-h-[85vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl liquid-glass-modal ${
                        isDark ? 'liquid-glass-dark text-white' : 'liquid-glass-light text-slate-900'
                    }`}>
                        {/* Modal Header */}
                        <div className={`p-4 border-b flex items-center justify-between gap-3 liquid-glass-subtle ${
                            isDark ? 'liquid-glass-dark border-white/10' : 'liquid-glass-light border-slate-200/70'
                        }`}>
                            <div className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                                    selectedPerfModal.accent === 'emerald'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : selectedPerfModal.accent === 'rose'
                                        ? 'bg-rose-500/20 text-rose-400'
                                        : 'bg-sky-500/20 text-sky-400'
                                }`}>
                                    {selectedPerfModal.accent === 'emerald' ? (
                                        <Wrench className="w-4 h-4" />
                                    ) : selectedPerfModal.accent === 'rose' ? (
                                        <AlertTriangle className="w-4 h-4" />
                                    ) : (
                                        <Clock className="w-4 h-4" />
                                    )}
                                </div>
                                <div>
                                    <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {selectedPerfModal.title}
                                    </h3>
                                    <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {selectedPerfModal.subtitle}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedPerfModal(null)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                    isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                                }`}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Age / ETA Filter Pills (for Oldest Active Issues modal) */}
                        {selectedPerfModal.enableAgeFilters && (() => {
                            const allItems = selectedPerfModal.items || [];
                            const filterOptions = [
                                {
                                    key: 'all',
                                    label: isEn ? 'All Active' : 'Semua Aktif',
                                    count: allItems.length,
                                },
                                {
                                    key: 'overdue_eta',
                                    label: isEn ? 'Escalated (1h/3h+)' : 'Eskalasi 1j/3j+',
                                    count: allItems.filter((i) => i.isOverdueEta).length,
                                },
                                {
                                    key: 'over_7d',
                                    label: isEn ? '> 7 Days' : '> 7 Hari',
                                    count: allItems.filter((i) => (i.ageMinutes || 0) >= 7 * 24 * 60).length,
                                },
                                {
                                    key: 'over_3d',
                                    label: isEn ? '> 3 Days' : '> 3 Hari',
                                    count: allItems.filter((i) => (i.ageMinutes || 0) >= 3 * 24 * 60).length,
                                },
                            ];
                            return (
                                <div className={`px-4 py-2.5 border-b flex items-center gap-1.5 flex-wrap ${
                                    isDark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200/80 bg-slate-50/80'
                                }`}>
                                    {filterOptions.map((opt) => {
                                        const isActive = perfModalAgeFilter === opt.key;
                                        return (
                                            <button
                                                key={opt.key}
                                                type="button"
                                                onClick={() => setPerfModalAgeFilter(opt.key)}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                                                    isActive
                                                        ? 'bg-rose-600 border-rose-600 text-white keep-white shadow-xs'
                                                        : isDark
                                                        ? 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500'
                                                        : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300'
                                                }`}
                                            >
                                                <span>{opt.label}</span>
                                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                                    isActive
                                                        ? 'bg-white/20 text-white'
                                                        : isDark ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                    {opt.count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })()}

                        {/* Modal Body */}
                        <div className="p-4 overflow-y-auto space-y-3 flex-1">
                            {(() => {
                                const visibleItems = selectedPerfModal.enableAgeFilters
                                    ? (selectedPerfModal.items || []).filter((item) => {
                                          if (perfModalAgeFilter === 'overdue_eta') return Boolean(item.isOverdueEta);
                                          if (perfModalAgeFilter === 'over_7d') return (item.ageMinutes || 0) >= 7 * 24 * 60;
                                          if (perfModalAgeFilter === 'over_3d') return (item.ageMinutes || 0) >= 3 * 24 * 60;
                                          return true;
                                      })
                                    : (selectedPerfModal.items || []);

                                if (visibleItems.length === 0) {
                                    return (
                                        <div className="py-10 text-center">
                                            <p className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                {isEn ? 'No tickets match this filter.' : 'Tidak ada tiket pada kategori filter ini.'}
                                            </p>
                                        </div>
                                    );
                                }

                                return visibleItems.map(({ issue: iss, durationLabel }) => (
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
                                            {durationLabel && (
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                                                    selectedPerfModal.accent === 'rose'
                                                        ? (isDark ? 'bg-rose-950/75 border-rose-600/50 text-rose-300' : 'bg-rose-50 border-rose-300 text-rose-700')
                                                        : (isDark ? 'bg-sky-950/75 border-sky-600/50 text-sky-300' : 'bg-sky-50 border-sky-300 text-sky-700')
                                                }`}>
                                                    <Clock className="w-2.5 h-2.5 shrink-0" />
                                                    <span>{durationLabel}</span>
                                                </span>
                                            )}
                                            <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                Dept: {(iss.target_departments || []).map(formatDeptDisplay).join(', ') || (isEn ? 'General' : 'Umum')}
                                            </span>
                                            {(() => {
                                                const timerBadge = getEtaBadgeInfo(iss, nowMs, isEn);
                                                if (!timerBadge || (!timerBadge.isEscalated && !timerBadge.isPaused)) return null;
                                                return (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                                                        timerBadge.state === 'owner_escalated'
                                                            ? (isDark ? 'bg-rose-950/75 border-rose-600/50 text-rose-300' : 'bg-rose-50 border-rose-300 text-rose-700')
                                                            : timerBadge.state === 'group_escalated'
                                                            ? (isDark ? 'bg-amber-950/75 border-amber-600/50 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-800')
                                                            : (isDark ? 'bg-slate-800 border-slate-600 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-700')
                                                    }`}>
                                                        <CalendarClock className="w-2.5 h-2.5 shrink-0" />
                                                        <span>{timerBadge.primaryLabel}</span>
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
                                                setSelectedPerfModal(null);
                                                onSelectIssue(iss);
                                            }}
                                            className="shrink-0 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition-all flex items-center gap-1 self-end sm:self-center cursor-pointer"
                                        >
                                            <span>{isEn ? 'Details' : 'Rincian'}</span>
                                            <ArrowUpRight className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                ));
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* YEARLY GOOGLE SPREADSHEET MANAGER MODAL (KHUSUS ADMIN) */}
            {isAdmin && isSpreadsheetModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div
                        className={`border rounded-2xl max-w-2xl w-full p-5 max-h-[90vh] flex flex-col shadow-2xl overflow-hidden ${
                            isDark ? 'bg-slate-900 border-slate-700/80 text-white' : 'bg-white border-slate-200 text-slate-900'
                        }`}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3.5 border-b border-slate-700/60 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                                    <FileSpreadsheet className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold">
                                        {isEn ? 'Yearly Google Spreadsheet Manager' : 'Kelola Google Spreadsheet Tahunan'}
                                    </h3>
                                    <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {isEn
                                            ? 'Link separate Google Spreadsheets for each operating year (2025, 2026, etc.)'
                                            : 'Tautkan file Google Spreadsheet terpisah untuk tiap tahun operasional'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsSpreadsheetModalOpen(false)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                    isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body (Scrollable) */}
                        <div className="py-4 overflow-y-auto space-y-4 flex-1 text-xs pr-1">
                            {/* Alert Message if any */}
                            {sheetConnectMessage && (
                                <div
                                    className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                                        sheetConnectMessage.type === 'success'
                                            ? isDark
                                                ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300'
                                                : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                            : isDark
                                            ? 'bg-rose-950/50 border-rose-700/60 text-rose-300'
                                            : 'bg-rose-50 border-rose-300 text-rose-800'
                                    }`}
                                >
                                    {sheetConnectMessage.type === 'success' ? (
                                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                                    ) : (
                                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                                    )}
                                    <div className="flex-1 font-medium">{sheetConnectMessage.text}</div>
                                </div>
                            )}

                            {/* Section 1: How to connect (Google Service Account sharing) */}
                            <div
                                className={`p-3.5 rounded-xl border space-y-2.5 ${
                                    isDark ? 'bg-slate-800/60 border-slate-700/70' : 'bg-slate-50 border-slate-200'
                                }`}
                            >
                                <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                                    <Info className="w-3.5 h-3.5" />
                                    <span>{isEn ? 'How to Add a Yearly Spreadsheet:' : 'Panduan Menghubungkan Spreadsheet Baru:'}</span>
                                </div>
                                <ol className="list-decimal list-inside space-y-1.5 text-[11px] leading-relaxed opacity-90">
                                    <li>
                                        {isEn ? 'Create a new Google Sheet in your personal Google Drive (e.g. named ' : 'Buat file Google Sheet baru di Google Drive Anda (contoh: '}
                                        <span className="font-semibold text-emerald-300">Telunas Issue Tracker - 2025</span>).
                                    </li>
                                    <li>
                                        {isEn ? "Click 'Share' on your Google Sheet and invite this Service Account bot as " : "Klik tombol 'Share' (Bagikan) dan tambahkan bot Service Account ini sebagai "}
                                        <span className="font-bold underline text-amber-300">Editor</span>:
                                    </li>
                                </ol>

                                {/* Monospace Bot Email Box with 1-Click Copy */}
                                <div className="flex items-center gap-2 pt-1">
                                    <div
                                        className={`flex-1 font-mono text-[11px] px-3 py-2 rounded-lg border truncate select-all ${
                                            isDark ? 'bg-slate-950 border-slate-700 text-emerald-400' : 'bg-white border-slate-300 text-emerald-700'
                                        }`}
                                    >
                                        {botEmail}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleCopyBotEmail}
                                        className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs transition-all ${
                                            copiedBotEmail
                                                ? 'bg-emerald-600 text-white'
                                                : isDark
                                                ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                                                : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                                        }`}
                                    >
                                        {copiedBotEmail ? (
                                            <>
                                                <CheckCheck className="w-3.5 h-3.5" />
                                                <span>{isEn ? 'Copied!' : 'Tersalin!'}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="w-3.5 h-3.5" />
                                                <span>{isEn ? 'Copy Email' : 'Salin Email'}</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                                <p className={`text-[10px] italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {isEn
                                        ? '✨ Once shared, our bot will automatically create 12 monthly tabs (Januari - Desember), apply standard teal headers, and sync the tickets.'
                                        : '✨ Setelah dibagikan, bot otomatis membuat 12 tab bulanan (Januari - Desember), menerapkan header teal standar, dan menyinkronkan tiket.'}
                                </p>
                            </div>

                            {/* Section 2: Form to Connect */}
                            <form
                                onSubmit={handleConnectSheet}
                                className={`p-3.5 rounded-xl border space-y-3 ${
                                    isDark ? 'bg-slate-800/40 border-slate-700/70' : 'bg-slate-50/70 border-slate-200'
                                }`}
                            >
                                <h4 className="font-bold flex items-center gap-1.5">
                                    <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>{isEn ? 'Connect New Year Spreadsheet' : 'Hubungkan Spreadsheet Tahun Baru'}</span>
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                                    <div className="sm:col-span-2">
                                        <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                            {isEn ? 'Year (Search or Type)' : 'Tahun (Cari atau Ketik)'}
                                        </label>
                                        <div className="relative" ref={yearComboboxRef}>
                                            <button
                                                type="button"
                                                disabled={isConnectingSheet}
                                                onClick={() => {
                                                    setIsYearDropdownOpen(!isYearDropdownOpen);
                                                    setYearSearchQuery('');
                                                }}
                                                className={`w-full px-3 py-2 rounded-lg text-xs font-semibold border flex items-center justify-between gap-1.5 transition-all text-left cursor-pointer ${
                                                    isDark
                                                        ? 'bg-slate-900 border-slate-700 text-white hover:border-slate-500'
                                                        : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400'
                                                }`}
                                            >
                                                <span className="truncate flex items-center gap-1.5 min-w-0">
                                                    <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                                    <span className="font-bold text-xs">{selectedYearInfo.year}</span>
                                                    <span
                                                        className={`text-[10px] px-1.5 py-0.5 rounded font-normal truncate ${
                                                            selectedYearInfo.isDefault
                                                                ? 'bg-emerald-500/20 text-emerald-300'
                                                                : selectedYearInfo.isConnected
                                                                ? 'bg-teal-500/20 text-teal-300'
                                                                : 'bg-blue-500/20 text-blue-300'
                                                        }`}
                                                    >
                                                        {selectedYearInfo.isDefault
                                                            ? (isEn ? 'Default' : 'Default')
                                                            : selectedYearInfo.isConnected
                                                            ? (isEn ? 'Connected' : 'Terhubung')
                                                            : (isEn ? '+ Ready' : '+ Siap Dihubungkan')}
                                                    </span>
                                                </span>
                                                <ChevronDown
                                                    className={`w-3.5 h-3.5 shrink-0 opacity-60 transition-transform ${
                                                        isYearDropdownOpen ? 'rotate-180' : ''
                                                    }`}
                                                />
                                            </button>

                                            {/* Dropdown Menu with Search */}
                                            {isYearDropdownOpen && (
                                                <div
                                                    className={`absolute left-0 mt-1 w-full min-w-[260px] rounded-xl border shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 backdrop-blur-xl ${
                                                        isDark
                                                            ? 'bg-slate-900/95 border-slate-700 text-white'
                                                            : 'bg-white/95 border-slate-200 text-slate-900'
                                                    }`}
                                                >
                                                    {/* Search Input Box */}
                                                    <div className="relative mb-2">
                                                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                                        <input
                                                            type="text"
                                                            autoFocus
                                                            value={yearSearchQuery}
                                                            onChange={(e) => setYearSearchQuery(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    if (filteredConnectionYears.length > 0) {
                                                                        setNewSheetYear(filteredConnectionYears[0].year);
                                                                        setIsYearDropdownOpen(false);
                                                                        setYearSearchQuery('');
                                                                    }
                                                                }
                                                            }}
                                                            placeholder={isEn ? 'Search or type year (e.g. 2090)...' : 'Cari / ketik tahun (cth: 2090)...'}
                                                            className={`w-full pl-8 pr-7 py-1.5 rounded-lg text-xs border outline-none font-medium ${
                                                                isDark
                                                                    ? 'bg-slate-950/80 border-slate-700 text-white placeholder-slate-500 focus:border-emerald-500'
                                                                    : 'bg-slate-100 border-slate-300 text-slate-800 placeholder-slate-400 focus:border-emerald-500'
                                                            }`}
                                                        />
                                                        {yearSearchQuery && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setYearSearchQuery('')}
                                                                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-white"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* List of Years */}
                                                    <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1 text-xs">
                                                        {filteredConnectionYears.length === 0 ? (
                                                            <div className="py-3 px-2 text-center text-[11px] text-slate-400">
                                                                {isEn
                                                                    ? 'No year matching. Type a 4-digit year like 2090.'
                                                                    : 'Tahun tidak ditemukan. Ketik 4 digit tahun misal 2090.'}
                                                            </div>
                                                        ) : (
                                                            filteredConnectionYears.map((item) => {
                                                                const isSelected = String(newSheetYear) === item.year;
                                                                return (
                                                                    <button
                                                                        key={item.year}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setNewSheetYear(item.year);
                                                                            setIsYearDropdownOpen(false);
                                                                            setYearSearchQuery('');
                                                                        }}
                                                                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                                                                            isSelected
                                                                                ? 'bg-emerald-600/20 text-emerald-300 font-bold border border-emerald-500/30'
                                                                                : isDark
                                                                                ? 'hover:bg-slate-800 text-slate-200'
                                                                                : 'hover:bg-slate-100 text-slate-800'
                                                                        }`}
                                                                    >
                                                                        <div className="flex items-center gap-2 truncate">
                                                                            <span className="font-mono font-bold text-xs">{item.year}</span>
                                                                            <span
                                                                                className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                                                                                    item.isDefault
                                                                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                                                                        : item.isConnected
                                                                                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                                                                                        : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                                                                                }`}
                                                                            >
                                                                                {item.isDefault
                                                                                    ? (isEn ? 'Default 2026' : 'Default 2026')
                                                                                    : item.isConnected
                                                                                    ? (isEn ? 'Connected' : 'Terhubung')
                                                                                    : (isEn ? '+ Ready to Connect' : '+ Siap Dihubungkan')}
                                                                            </span>
                                                                        </div>
                                                                        {isSelected && (
                                                                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1.5" />
                                                                        )}
                                                                    </button>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="sm:col-span-3">
                                        <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                            {isEn ? 'Google Spreadsheet URL or Sheet ID' : 'URL atau ID Google Spreadsheet'}
                                        </label>
                                        <input
                                            type="text"
                                            value={newSheetUrl}
                                            onChange={(e) => setNewSheetUrl(e.target.value)}
                                            placeholder="https://docs.google.com/spreadsheets/d/1.../edit"
                                            className={`w-full px-3 py-2 rounded-lg text-xs border font-mono ${
                                                isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'
                                            }`}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end pt-1">
                                    <button
                                        type="submit"
                                        disabled={isConnectingSheet}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-sm transition-all cursor-pointer"
                                    >
                                        {isConnectingSheet ? (
                                            <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                <span>{isEn ? 'Configuring 12 tabs & syncing...' : 'Menyiapkan 12 tab & sinkronisasi...'}</span>
                                            </>
                                        ) : (
                                            <>
                                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                                <span>{isEn ? 'Connect & Auto-Format 12 Tabs' : 'Hubungkan & Format 12 Tab'}</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>

                            {/* Section 3: List of Connected Yearly Spreadsheets */}
                            <div className="space-y-2 pt-1">
                                <h4 className="font-bold flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1.5">
                                        <Layers className="w-3.5 h-3.5 text-sky-400" />
                                        <span>{isEn ? 'Connected Yearly Spreadsheets' : 'Spreadsheet Tahunan Terhubung'}</span>
                                    </span>
                                    <span className="text-[10px] opacity-75">
                                        {Object.keys(yearlySpreadsheets).length} {isEn ? 'connected' : 'terhubung'}
                                    </span>
                                </h4>

                                <div className="space-y-2">
                                    {Object.entries(yearlySpreadsheets).map(([year, info]) => (
                                        <div
                                            key={year}
                                            className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                                isDark ? 'bg-slate-800/80 border-slate-700/80' : 'bg-slate-50 border-slate-200'
                                            }`}
                                        >
                                            <div className="space-y-1 min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-sm text-emerald-400">
                                                        {year}
                                                    </span>
                                                    {info.title && (
                                                        <span className={`text-xs font-semibold truncate max-w-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                            • {info.title}
                                                        </span>
                                                    )}
                                                    {info.is_default ? (
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                                            isDark ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                                        }`}>
                                                            {isEn ? 'Default / Live' : 'Utama / Aktif'}
                                                        </span>
                                                    ) : (
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                                            isDark ? 'bg-sky-950/80 border-sky-700 text-sky-300' : 'bg-sky-100 border-sky-300 text-sky-800'
                                                        }`}>
                                                            {isEn ? 'Connected' : 'Terkoneksi'}
                                                        </span>
                                                    )}
                                                    <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        12 {isEn ? 'monthly tabs ready' : 'tab bulanan siap'}
                                                        {info.synced_issues_count !== undefined && (
                                                            <span className="ml-1 text-emerald-400 font-semibold">
                                                                ({info.synced_issues_count} {isEn ? 'issues synced' : 'tiket disinkronkan'})
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] font-mono text-slate-400 truncate max-w-md">
                                                    ID: {info.spreadsheet_id}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 self-end sm:self-center">
                                                <a
                                                    href={info.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all"
                                                >
                                                    <span>{isEn ? 'Open Sheet' : 'Buka Sheet'}</span>
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="pt-3 border-t border-slate-700/60 flex justify-end shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsSpreadsheetModalOpen(false)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                    isDark ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                                }`}
                            >
                                {isEn ? 'Close' : 'Tutup'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* OFFICIAL TELUNAS LANDSCAPE PDF EXPORT MODAL WITH LIVE PREVIEW */}
            <ExportPdfModal
                open={isExportPdfModalOpen}
                onOpenChange={setIsExportPdfModalOpen}
                issues={filteredIssues}
                allIssues={issues}
                initialYear={selectedYear}
                initialTimeRange={timeRange}
                availableYears={availableYears}
                departments={departments}
                timeLabel={timeLabels[timeRange] || timeRange}
                stats={stats}
                deptTargetData={deptMetrics.targetList}
                hotspotList={[]}
            />
        </div>
    );
}
