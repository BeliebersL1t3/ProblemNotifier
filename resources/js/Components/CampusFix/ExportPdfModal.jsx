import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/Components/UI/Button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/UI/Dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/Components/UI/Select';
import {
    Loader2, Download, FileText, Filter, RefreshCw, CheckCircle2,
    Clock, AlertTriangle, Layers, Building2, SlidersHorizontal, Check, X,
    ExternalLink
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useLeanTheme } from '@/hooks/useLeanTheme';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const STATUS_OPTIONS = [
    { id: 'open', labelId: 'Open', labelEn: 'Open', color: 'text-rose-500' },
    { id: 'in_progress', labelId: 'In Progress', labelEn: 'In Progress', color: 'text-blue-500' },
    { id: 'pending', labelId: 'Pending', labelEn: 'Pending', color: 'text-amber-500' },
    { id: 'resolved', labelId: 'Selesai (Resolved)', labelEn: 'Resolved', color: 'text-emerald-500' },
];

const LIMIT_OPTIONS = [15, 30, 50, 100, 200, 'All'];

export function ExportPdfModal({
    open,
    onOpenChange,
    issues = [],
    departments = [],
    timeLabel = '',
    stats = {},
    deptTargetData = [],
    hotspotList = [],
}) {
    const { lang } = useLanguage();
    const isEn = lang === 'en';
    const { isDark } = useLeanTheme();

    const [selectedStatuses, setSelectedStatuses] = useState(['open', 'in_progress', 'pending', 'resolved']);
    const [selectedDept, setSelectedDept] = useState('all');
    const [selectedPriority, setSelectedPriority] = useState('all');
    const [limit, setLimit] = useState('All');
    const [includeKpiSummary, setIncludeKpiSummary] = useState(true);
    const [includePendingTimeline, setIncludePendingTimeline] = useState(true);

    const [previewUrl, setPreviewUrl] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const logoImgRef = useRef(null);

    // Preload logo for jsPDF without transparent canvas artifacts
    useEffect(() => {
        if (!logoImgRef.current && typeof window !== 'undefined') {
            const img = new Image();
            img.src = '/logo.png';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width || 240;
                    canvas.height = img.height || 240;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    logoImgRef.current = canvas.toDataURL('image/jpeg', 0.95);
                } catch (e) {
                    console.warn('[ExportPdfModal] Failed to convert logo to canvas:', e);
                }
            };
        }
    }, []);

    // Filter issues based on user selection in modal
    const filteredIssues = useMemo(() => {
        return (issues || []).filter((issue) => {
            // Status match
            const statusKey = issue.status === 'solved' ? 'resolved' : (issue.status || 'open');
            if (!selectedStatuses.includes(statusKey)) return false;

            // Department match
            if (selectedDept !== 'all') {
                const targetDepts = Array.isArray(issue.target_departments)
                    ? issue.target_departments
                    : (issue.department ? [issue.department] : []);
                const match = targetDepts.some((d) => String(d).toLowerCase() === selectedDept.toLowerCase());
                if (!match) return false;
            }

            // Priority match
            if (selectedPriority !== 'all') {
                const p = String(issue.priority || 'low').toLowerCase();
                if (p !== selectedPriority.toLowerCase()) return false;
            }

            return true;
        });
    }, [issues, selectedStatuses, selectedDept, selectedPriority]);

    const displayIssues = useMemo(() => {
        if (limit === 'All') return filteredIssues;
        const num = parseInt(limit, 10);
        return isNaN(num) ? filteredIssues : filteredIssues.slice(0, num);
    }, [filteredIssues, limit]);

    // Helpers
    const formatDateTime = (val) => {
        if (!val) return '-';
        let d;
        if (typeof val === 'number') {
            d = new Date(val);
        } else if (/^\d+$/.test(String(val).trim())) {
            let num = parseInt(val, 10);
            if (num < 10000000000) num *= 1000;
            d = new Date(num);
        } else {
            d = new Date(val);
        }
        if (isNaN(d.getTime())) return String(val);
        return d.toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).replace(',', '');
    };

    const cleanDuration = (val) => {
        if (!val) return '-';
        return String(val).replace(/(\d+\.\d+)/g, (match) => Math.round(parseFloat(match)));
    };

    const sanitizePdfText = (str) => {
        if (!str || typeof str !== 'string') return '';
        return str
            .replace(/[\u2794\u2192\u21D2\u27A1]/g, '->')
            .replace(/🎯/g, '[Assign] ')
            .replace(/📢/g, '[Tag] ')
            .replace(/↩️|↩/g, '[ROLLBACK] ')
            .replace(/✏️|✏/g, '[EDIT] ')
            .replace(/✅/g, '[SOLVED] ')
            .replace(/⏳/g, '[PENDING] ')
            .replace(/🔧/g, '[CLAIM] ')
            .replace(/⚠️/g, '[!] ')
            .replace(/[^\x20-\x7E\n\r\t]/g, '');
    };

    const toggleStatus = (stId) => {
        setSelectedStatuses((prev) => {
            if (prev.includes(stId)) {
                if (prev.length <= 1) return prev; // Keep at least one
                return prev.filter((s) => s !== stId);
            }
            return [...prev, stId];
        });
    };

    // PDF Builder Engine (A4 Landscape - Classic Single-Flow Layout)
    const buildPdfDocument = () => {
        const doc = new jsPDF('landscape', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const resolvedPeriod = timeLabel || (isEn ? 'All Months' : 'Semua Bulan');

        // =========================================================================
        // KOP RESMI TELUNAS RESORTS (PAGE 1)
        // =========================================================================
        // Logo top left
        if (logoImgRef.current) {
            try {
                doc.addImage(logoImgRef.current, 'JPEG', 10, 8, 22, 22);
            } catch (e) {
                console.warn('[ExportPdfModal] Failed to add image to jsPDF:', e);
            }
        }

        // Company & Address header
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('PT Island Connections International - Telunas Resorts', 36, 12);
        doc.text('Ruko Imperium Superblok Blok B No 35&36, Jl. Sudirman, Taman Baloi, Batam Kota, Riau Islands 29432', 36, 16);
        doc.text(
            isEn
                ? 'Official Operational Issue Tracking & Resolution Report'
                : 'Laporan Resmi Penanganan & Rekapitulasi Isu Operasional',
            36,
            20
        );

        // Document Title & Filter Period
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(28, 27, 14); // #1C1B0E
        const deptLabel = selectedDept === 'all' ? (isEn ? 'All Depts' : 'Semua Dept') : selectedDept;
        doc.text(
            `Issue Tracking Report — Period: ${resolvedPeriod} | Filter: ${deptLabel}`,
            36,
            25
        );

        // Optional Compact 1-line KPI strip
        let startY = 28;
        if (includeKpiSummary) {
            const totalCount = stats.total || filteredIssues.length || 0;
            const resCount = stats.resolved || filteredIssues.filter((i) => i.status === 'resolved' || i.status === 'solved').length;
            const resRate = totalCount > 0 ? Math.round((resCount / totalCount) * 100) : 0;
            const unresCount = stats.activeCount || (totalCount - resCount);
            const backlogRate = totalCount > 0 ? Math.round((unresCount / totalCount) * 100) : 0;
            const slaText = (stats.evaluatedSlaCount || 0) > 0
                ? `${stats.onTimeResolvedCount || 0}/${stats.evaluatedSlaCount} (${stats.onTimeRate || 0}%)`
                : '-';

            const summaryY = 27.5;
            const summaryHeight = 6.5;

            doc.setFillColor(250, 248, 242); // Warm cream
            doc.setDrawColor(227, 209, 170); // Tan border
            doc.setLineWidth(0.3);
            doc.roundedRect(10, summaryY, pageWidth - 20, summaryHeight, 1.5, 1.5, 'FD');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(28, 27, 14);

            const summaryLine = isEn
                ? `TOTAL: ${totalCount} issues  |  SOLVED: ${resCount} (${resRate}%)  |  BACKLOG: ${unresCount} (${backlogRate}%)  |  ETA PUNCTUALITY: ${slaText}`
                : `TOTAL: ${totalCount} tiket  |  SELESAI: ${resCount} (${resRate}%)  |  BELUM SELESAI: ${unresCount} (${backlogRate}%)  |  KETEPATAN SLA: ${slaText}`;

            doc.text(summaryLine, 14, summaryY + 4.5);

            startY = 36.5;
        }

        // =========================================================================
        // CLASSIC DETAILED 12-COLUMN ISSUE TRACKING TABLE (STARTS ON PAGE 1)
        // =========================================================================
        const tableData = [];

        displayIssues.forEach((i) => {
            const rawCode = String(i.issue_code || i.id || '').replace(/^TEL-|^LEAN-/, '');
            const reportedTime = formatDateTime(i.created_at || i.reported_at || i.reportedAt);

            // Taken Cell: date + worker name
            let takenCell = '-';
            const takenTime = i.in_progress_at || i.claimed_at || i.taken_at || i.takenAt;
            const workerList = Array.isArray(i.active_workers) && i.active_workers.length > 0
                ? i.active_workers
                : (i.claimed_by_name ? [i.claimed_by_name] : []);
            const primaryWorker = workerList.length > 0 ? workerList[0].split(' ')[0] : '';

            if (takenTime) {
                takenCell = primaryWorker ? `${formatDateTime(takenTime)}\n[${primaryWorker}]` : formatDateTime(takenTime);
            } else if (i.status === 'in_progress') {
                takenCell = primaryWorker ? `[PROGRESS]\n${primaryWorker}` : '[PROGRESS]';
            } else if (i.status === 'pending') {
                takenCell = '[PENDING]';
            }

            // Solved Cell: date + resolver name
            let solvedCell = '-';
            const solvedTime = i.resolved_at || i.solved_at || i.solvedAt;
            const resolverList = Array.isArray(i.final_workers) && i.final_workers.length > 0
                ? i.final_workers
                : (i.resolved_by_name ? [i.resolved_by_name] : []);
            const primaryResolver = resolverList.length > 0 ? resolverList[0].split(' ')[0] : '';

            if (solvedTime) {
                solvedCell = primaryResolver ? `${formatDateTime(solvedTime)}\n[${primaryResolver}]` : formatDateTime(solvedTime);
            } else if (i.status === 'resolved' || i.status === 'solved') {
                solvedCell = primaryResolver ? `[SOLVED]\n${primaryResolver}` : '[SOLVED]';
            }

            // Duration / Time Solve
            const duration = cleanDuration(i.duration_label || i.time_to_solve || i.durationLabel);

            // Departments & Tags
            const targetDepts = Array.isArray(i.target_departments)
                ? i.target_departments
                : (i.department ? [i.department] : []);
            const taggedDepts = Array.isArray(i.tagged_departments) ? i.tagged_departments : [];
            const deptLines = [];
            if (targetDepts.length > 0) deptLines.push(`Dept: ${targetDepts.join(', ')}`);
            if (taggedDepts.length > 0) deptLines.push(`Tag: ${taggedDepts.join(', ')}`);
            const combinedDeptTags = sanitizePdfText(deptLines.join('\n')) || '-';

            // Status string
            let statusStr = (i.status || 'OPEN').toUpperCase();
            if (statusStr === 'IN_PROGRESS') statusStr = 'PROGRESS';
            if (statusStr === 'RESOLVED') statusStr = 'SOLVED';

            tableData.push([
                rawCode,
                reportedTime,
                takenCell,
                solvedCell,
                duration,
                sanitizePdfText(i.title || i.description || '-'),
                sanitizePdfText(i.location || '-'),
                combinedDeptTags,
                sanitizePdfText(i.category || '-'),
                sanitizePdfText(i.reporter_name || i.reporter || '-'),
                statusStr,
                String(i.priority || 'LOW').toUpperCase(),
            ]);

            // Sub-row: Pending Reason / Delay Timeline
            if (includePendingTimeline && (i.status === 'pending' || i.pending_reason)) {
                const reason = i.pending_reason || (i.pendingTimeline?.[0]?.reason) || 'Tertunda pengerjaan';
                tableData.push([
                    {
                        content: `Pending Reason: ${sanitizePdfText(reason)}`,
                        colSpan: 12,
                        styles: {
                            fillColor: [255, 247, 237],
                            textColor: [194, 65, 12],
                            fontStyle: 'italic',
                            cellPadding: 2.2,
                        },
                    },
                ]);
            }
        });

        if (tableData.length === 0) {
            tableData.push([
                {
                    content: isEn
                        ? 'No records found matching the selected filter criteria.'
                        : 'Tidak ada laporan isu yang cocok dengan kriteria filter yang dipilih.',
                    colSpan: 12,
                    styles: { halign: 'center', textColor: [120, 120, 120], fontStyle: 'italic', cellPadding: 8 },
                },
            ]);
        }

        autoTable(doc, {
            startY: startY,
            margin: { left: 10, right: 10, bottom: 15 },
            showHead: 'everyPage',
            head: [[
                'ID',
                'Submitted\n(Tgl & Waktu)',
                'Taken\n(Tgl & Waktu)',
                'Solved\n(Tgl & Waktu)',
                'Time Solve',
                'Problem',
                'Location',
                'Dept / Tags',
                'Category',
                'Reporter',
                'Status',
                'Priority',
            ]],
            body: tableData,
            theme: 'grid',
            styles: {
                font: 'helvetica',
                fontSize: 7.2,
                cellPadding: 2.2,
            },
            headStyles: {
                fillColor: [227, 209, 170], // Telunas tan/gold
                textColor: [28, 27, 14],
                fontStyle: 'bold',
                lineColor: [200, 180, 150],
                lineWidth: 0.1,
            },
            alternateRowStyles: {
                fillColor: [250, 248, 242], // Warm cream
            },
            columnStyles: {
                0: { cellWidth: 17, halign: 'center', fontStyle: 'bold' }, // ID
                1: { cellWidth: 22 }, // Submitted
                2: { cellWidth: 21 }, // Taken
                3: { cellWidth: 21 }, // Solved
                4: { cellWidth: 16 }, // Time Solve
                5: { cellWidth: 47 }, // Problem (fills to 277mm)
                6: { cellWidth: 20 }, // Location
                7: { cellWidth: 32 }, // Dept / Tags
                8: { cellWidth: 18 }, // Category
                9: { cellWidth: 21 }, // Reporter
                10: { cellWidth: 22, fontStyle: 'bold', halign: 'center' }, // Status
                11: { cellWidth: 20, fontStyle: 'bold', halign: 'center' }, // Priority
            },
            didParseCell: function (data) {
                // Color code Status column (Index 10)
                if (data.section === 'body' && data.column.index === 10) {
                    const st = String(data.cell.raw || '');
                    if (st === 'SOLVED') {
                        data.cell.styles.textColor = [22, 163, 74]; // Emerald
                    } else if (st === 'PROGRESS') {
                        data.cell.styles.textColor = [37, 99, 235]; // Blue
                    } else if (st === 'PENDING') {
                        data.cell.styles.textColor = [234, 88, 12]; // Orange
                    } else if (st === 'OPEN') {
                        data.cell.styles.textColor = [220, 38, 38]; // Red
                    }
                }
                // Color code Priority column (Index 11)
                if (data.section === 'body' && data.column.index === 11) {
                    const pr = String(data.cell.raw || '');
                    if (pr === 'CRITICAL') {
                        data.cell.styles.textColor = [220, 38, 38];
                    } else if (pr === 'HIGH') {
                        data.cell.styles.textColor = [234, 88, 12];
                    }
                }
            },
            didDrawPage: function (data) {
                const pageSize = doc.internal.pageSize;
                const pHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
                const pWidth = pageSize.width ? pageSize.width : pageSize.getWidth();

                // Footer Left: Timestamp
                const str = `Downloaded on: ${new Date().toLocaleString('en-GB')} WIB`;
                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(150, 150, 150);
                doc.text(str, data.settings.margin.left, pHeight - 6);

                // Footer Right: Title, Record Count & Page Number
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                doc.setTextColor(100, 100, 100);

                const footerRight = `Official Issue Report (${resolvedPeriod}) | Total: ${displayIssues.length} | Page ${data.pageNumber}`;
                const footerRightWidth = doc.getTextWidth(footerRight);

                doc.text(footerRight, pWidth - data.settings.margin.right - footerRightWidth, pHeight - 6);
            },
        });

        return doc;
    };

    // Live PDF Preview debounced generator
    useEffect(() => {
        if (!open) {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
            }
            return;
        }

        setIsPreviewLoading(true);
        const timer = setTimeout(() => {
            try {
                const doc = buildPdfDocument();
                const blob = doc.output('blob');
                if (previewUrl) {
                    URL.revokeObjectURL(previewUrl);
                }
                const url = URL.createObjectURL(blob);
                setPreviewUrl(url);
            } catch (err) {
                console.error('[ExportPdfModal] Failed generating preview:', err);
            } finally {
                setIsPreviewLoading(false);
            }
        }, 320);

        return () => clearTimeout(timer);
    }, [
        open,
        displayIssues,
        selectedStatuses,
        selectedDept,
        selectedPriority,
        includeKpiSummary,
        includePendingTimeline,
        timeLabel,
    ]);

    // Handle Download Action
    const handleDownload = () => {
        setIsExporting(true);
        try {
            const doc = buildPdfDocument();
            const dateSlug = new Date().toISOString().slice(0, 10);
            const periodSlug = (timeLabel || 'Report').replace(/[^a-zA-Z0-9]/g, '_');
            doc.save(`Telunas_Issue_Report_${periodSlug}_${dateSlug}.pdf`);
            onOpenChange(false);
        } catch (err) {
            console.error('[ExportPdfModal] Download failed:', err);
            alert(isEn ? 'Failed to download PDF report.' : 'Gagal mengunduh laporan PDF.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={`max-w-6xl w-[96vw] max-h-[92vh] flex flex-col p-0 overflow-hidden border shadow-2xl rounded-3xl liquid-glass-modal ${
                    isDark ? 'liquid-glass-dark text-slate-100' : 'liquid-glass-light text-slate-800'
                }`}
            >
                {/* Header */}
                <DialogHeader className={`px-6 py-4 border-b flex-shrink-0 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div
                                className={`w-10 h-10 rounded-2xl flex items-center justify-center border shadow-xs ${
                                    isDark
                                        ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                        : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                            >
                                <FileText className="w-5 h-5" />
                            </div>
                            <div>
                                <DialogTitle className={`text-base sm:text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {isEn ? 'Export Official PDF Report (Classic Landscape)' : 'Ekspor Laporan PDF Resmi (Format Klasik Landscape)'}
                                </DialogTitle>
                                <DialogDescription className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {isEn
                                        ? 'Official Telunas Resorts 12-column issue tracking report (A4 Landscape).'
                                        : 'Laporan resmi pelacakan isu operasional 12 kolom Telunas Resorts (A4 Landscape).'}
                                </DialogDescription>
                            </div>
                        </div>

                        <span
                            className={`hidden sm:inline-flex px-3 py-1 rounded-full text-xs font-bold border ${
                                isDark
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : 'bg-amber-50 text-amber-800 border-amber-300'
                            }`}
                        >
                            {timeLabel || (isEn ? 'All Months' : 'Semua Bulan')}
                        </span>
                    </div>
                </DialogHeader>

                {/* Body: Left Filter Controls & Right Live Preview */}
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-0">
                    {/* Left Filter Sidebar */}
                    <div
                        className={`lg:col-span-4 p-5 space-y-4 overflow-y-auto border-b lg:border-b-0 lg:border-r ${
                            isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50/60'
                        }`}
                    >
                        {/* Status Filter */}
                        <div>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                {isEn ? 'Filter by Status' : 'Status Tiket'}
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                                {STATUS_OPTIONS.map((st) => {
                                    const active = selectedStatuses.includes(st.id);
                                    return (
                                        <button
                                            key={st.id}
                                            type="button"
                                            onClick={() => toggleStatus(st.id)}
                                            className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                                                active
                                                    ? isDark
                                                        ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300 shadow-xs'
                                                        : 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-xs'
                                                    : isDark
                                                    ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                                                    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            <span className="truncate">{isEn ? st.labelEn : st.labelId}</span>
                                            {active ? (
                                                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                            ) : (
                                                <span className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Department Scope */}
                        <div>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                {isEn ? 'Target Department' : 'Cakupan Departemen'}
                            </label>
                            <Select value={selectedDept} onValueChange={setSelectedDept}>
                                <SelectTrigger
                                    className={`w-full rounded-xl text-xs font-medium border liquid-glass-control ${
                                        isDark ? 'border-slate-800 text-white' : 'border-slate-300 text-slate-900'
                                    }`}
                                >
                                    <SelectValue placeholder={isEn ? 'All Departments' : 'Semua Departemen'} />
                                </SelectTrigger>
                                <SelectContent className={isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
                                    <SelectItem value="all">{isEn ? 'All Departments (Entire Resort)' : 'Semua Departemen (Seluruh Resort)'}</SelectItem>
                                    {(departments || []).map((d) => (
                                        <SelectItem key={d} value={d}>
                                            {d === 'Umum' && isEn ? 'General' : d}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Priority Scope */}
                        <div>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                {isEn ? 'Priority Level' : 'Tingkat Prioritas'}
                            </label>
                            <Select value={selectedPriority} onValueChange={setSelectedPriority}>
                                <SelectTrigger
                                    className={`w-full rounded-xl text-xs font-medium border liquid-glass-control ${
                                        isDark ? 'border-slate-800 text-white' : 'border-slate-300 text-slate-900'
                                    }`}
                                >
                                    <SelectValue placeholder={isEn ? 'All Priorities' : 'Semua Prioritas'} />
                                </SelectTrigger>
                                <SelectContent className={isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
                                    <SelectItem value="all">{isEn ? 'All Priorities (Semua)' : 'Semua Prioritas (Semua)'}</SelectItem>
                                    <SelectItem value="critical">{isEn ? 'Critical Only' : 'Kritis (Critical)'}</SelectItem>
                                    <SelectItem value="high">{isEn ? 'High Priority' : 'Tinggi (High)'}</SelectItem>
                                    <SelectItem value="medium">{isEn ? 'Medium' : 'Sedang (Medium)'}</SelectItem>
                                    <SelectItem value="low">{isEn ? 'Low' : 'Rendah (Low)'}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Max Rows (Limit) */}
                        <div>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                {isEn ? 'Record Limit' : 'Batas Jumlah Baris'}
                            </label>
                            <Select value={String(limit)} onValueChange={setLimit}>
                                <SelectTrigger
                                    className={`w-full rounded-xl text-xs font-medium border liquid-glass-control ${
                                        isDark ? 'border-slate-800 text-white' : 'border-slate-300 text-slate-900'
                                    }`}
                                >
                                    <SelectValue placeholder="All" />
                                </SelectTrigger>
                                <SelectContent className={isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
                                    {LIMIT_OPTIONS.map((opt) => (
                                        <SelectItem key={String(opt)} value={String(opt)}>
                                            {opt === 'All' ? (isEn ? 'All Filtered Records' : 'Semua Data Terfilter') : `${opt} Data Teratas`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Additional Content Checkboxes */}
                        <div className="pt-2 border-t space-y-2.5">
                            <label className={`block text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                {isEn ? 'Report Options' : 'Opsi Konten Laporan'}
                            </label>

                            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold select-none">
                                <input
                                    type="checkbox"
                                    checked={includeKpiSummary}
                                    onChange={(e) => setIncludeKpiSummary(e.target.checked)}
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                                />
                                <span className={isDark ? 'text-slate-200' : 'text-slate-800'}>
                                    {isEn ? 'Include KPI Summary Header Strip' : 'Sertakan Baris Ringkasan KPI di Atas Tabel'}
                                </span>
                            </label>

                            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold select-none">
                                <input
                                    type="checkbox"
                                    checked={includePendingTimeline}
                                    onChange={(e) => setIncludePendingTimeline(e.target.checked)}
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                                />
                                <span className={isDark ? 'text-slate-200' : 'text-slate-800'}>
                                    {isEn ? 'Include Pending Delay Reason sub-rows' : 'Sertakan Catatan Keterlambatan Pending'}
                                </span>
                            </label>
                        </div>

                        {/* Record count summary pill */}
                        <div
                            className={`p-3 rounded-2xl border text-xs flex items-center justify-between ${
                                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
                            }`}
                        >
                            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                                {isEn ? 'Total issues to export:' : 'Total isu yang diekspor:'}
                            </span>
                            <span className={`font-extrabold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                {displayIssues.length} {isEn ? 'issues' : 'isu'}
                            </span>
                        </div>
                    </div>

                    {/* Right Live Preview Area */}
                    <div className="lg:col-span-8 flex flex-col h-full bg-slate-100 dark:bg-slate-950 relative overflow-hidden min-h-[350px]">
                        {/* Top bar with Paper Info and Open in New Tab action */}
                        <div
                            className={`px-4 py-2 border-b flex items-center justify-between text-xs font-semibold ${
                                isDark ? 'border-slate-800 bg-slate-900/90 text-slate-300' : 'border-slate-200 bg-white/90 text-slate-600'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                                <span>{isEn ? 'Preview: A4 Landscape Report' : 'Pratinjau: Laporan A4 Landscape'}</span>
                            </div>

                            {previewUrl && (
                                <button
                                    type="button"
                                    onClick={() => window.open(previewUrl, '_blank')}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                        isDark
                                            ? 'hover:bg-slate-800 text-slate-300 hover:text-white'
                                            : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                                    }`}
                                    title={isEn ? 'Open full document in new tab' : 'Buka dokumen penuh di tab baru'}
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>{isEn ? 'Open Fullscreen' : 'Buka Tab Baru'}</span>
                                </button>
                            )}
                        </div>

                        {/* Content viewport */}
                        <div className="flex-1 relative p-2 sm:p-3 overflow-hidden flex flex-col">
                            {isPreviewLoading && (
                                <div className="absolute inset-0 z-20 bg-slate-950/60 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-3 rounded-2xl">
                                    <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                                    <span className="text-xs font-bold text-slate-200">
                                        {isEn ? 'Rendering A4 Landscape Preview...' : 'Menyusun Pratinjau PDF A4 Landscape...'}
                                    </span>
                                </div>
                            )}

                            {previewUrl ? (
                                <iframe
                                    src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                                    title="Telunas PDF Preview"
                                    className="w-full h-full flex-1 rounded-xl bg-white shadow-md border border-slate-300 dark:border-slate-800"
                                />
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                                    <FileText className="w-12 h-12 text-slate-400 dark:text-slate-600 mb-3" />
                                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                                        {isEn ? 'Preparing PDF Preview...' : 'Pratinjau PDF Sedang Disiapkan'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Buttons */}
                <DialogFooter
                    className={`px-6 py-3.5 border-t flex-shrink-0 flex items-center justify-between gap-3 flex-row ${
                        isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50/60'
                    }`}
                >
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isDark
                                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                    >
                        {isEn ? 'Close' : 'Tutup'}
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={isExporting || isPreviewLoading || displayIssues.length === 0}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 active:scale-95 text-white keep-white transition-all shadow-lg hover:shadow-xl cursor-pointer disabled:opacity-50"
                        >
                            {isExporting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>{isEn ? 'Exporting PDF...' : 'Mengunduh PDF...'}</span>
                                </>
                            ) : (
                                <>
                                    <Download className="w-4 h-4" />
                                    <span>{isEn ? 'Download PDF Report' : 'Unduh Laporan PDF'}</span>
                                </>
                            )}
                        </button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default ExportPdfModal;

