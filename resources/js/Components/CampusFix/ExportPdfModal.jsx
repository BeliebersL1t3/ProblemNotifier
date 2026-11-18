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
    ExternalLink, ZoomIn, ZoomOut, Maximize2, Minimize2, PanelLeftClose,
    PanelLeftOpen, RotateCcw, Calendar
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
const ZOOM_LEVELS = [75, 100, 125, 150, 175, 200];

const TIME_RANGE_OPTIONS = [
    { id: 'all', labelId: 'Semua Bulan (Semua Tab)', labelEn: 'All Months (All Tabs)' },
    { id: 'today', labelId: 'Hari Ini', labelEn: 'Today' },
    { id: '7d', labelId: '7 Hari Terakhir', labelEn: 'Last 7 Days' },
    { id: '30d', labelId: '30 Hari Terakhir', labelEn: 'Last 30 Days' },
    { id: 'month_1', labelId: 'Bulan Januari', labelEn: 'January' },
    { id: 'month_2', labelId: 'Bulan Februari', labelEn: 'February' },
    { id: 'month_3', labelId: 'Bulan Maret', labelEn: 'March' },
    { id: 'month_4', labelId: 'Bulan April', labelEn: 'April' },
    { id: 'month_5', labelId: 'Bulan Mei', labelEn: 'May' },
    { id: 'month_6', labelId: 'Bulan Juni', labelEn: 'June' },
    { id: 'month_7', labelId: 'Bulan Juli', labelEn: 'July' },
    { id: 'month_8', labelId: 'Bulan Agustus', labelEn: 'August' },
    { id: 'month_9', labelId: 'Bulan September', labelEn: 'September' },
    { id: 'month_10', labelId: 'Bulan Oktober', labelEn: 'October' },
    { id: 'month_11', labelId: 'Bulan November', labelEn: 'November' },
    { id: 'month_12', labelId: 'Bulan Desember', labelEn: 'December' },
];

export function ExportPdfModal({
    open,
    onOpenChange,
    issues = [],
    allIssues = null,
    initialYear = 'all',
    initialTimeRange = 'all',
    availableYears = [],
    departments = [],
    timeLabel = '',
    stats = {},
    deptTargetData = [],
    hotspotList = [],
}) {
    const { lang } = useLanguage();
    const isEn = lang === 'en';
    const { isDark } = useLeanTheme();

    const sourceIssues = Array.isArray(allIssues) ? allIssues : issues;

    const [selectedYear, setSelectedYear] = useState(String(initialYear || 'all'));
    const [selectedTimeRange, setSelectedTimeRange] = useState(initialTimeRange || 'all');
    const [selectedStatuses, setSelectedStatuses] = useState(['open', 'in_progress', 'pending', 'resolved']);
    const [selectedDept, setSelectedDept] = useState('all');
    const [selectedLocation, setSelectedLocation] = useState('all');
    const [selectedSlaStatus, setSelectedSlaStatus] = useState('all');
    const [sortOrder, setSortOrder] = useState('newest');
    const [limit, setLimit] = useState('All');
    const [includeKpiSummary, setIncludeKpiSummary] = useState(true);
    const [includePendingTimeline, setIncludePendingTimeline] = useState(true);

    const [previewUrl, setPreviewUrl] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Preview zoom & layout controls
    const [previewZoom, setPreviewZoom] = useState('fit'); // 'fit' | 75 | 100 | 125 | 150 | 175 | 200
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const handleZoomIn = () => {
        setPreviewZoom((prev) => {
            if (prev === 'fit') return 125;
            const idx = ZOOM_LEVELS.indexOf(prev);
            if (idx === -1) return 125;
            return ZOOM_LEVELS[Math.min(idx + 1, ZOOM_LEVELS.length - 1)];
        });
    };

    const handleZoomOut = () => {
        setPreviewZoom((prev) => {
            if (prev === 'fit') return 75;
            const idx = ZOOM_LEVELS.indexOf(prev);
            if (idx === -1) return 100;
            return ZOOM_LEVELS[Math.max(idx - 1, 0)];
        });
    };

    const handleZoomReset = () => setPreviewZoom('fit');

    const canZoomIn = previewZoom === 'fit' || previewZoom < ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
    const canZoomOut = previewZoom === 'fit' || previewZoom > ZOOM_LEVELS[0];

    // Freeze/snapshot issues dataset on modal open so background 4s polling does not trigger PDF rebuilds
    const [modalIssues, setModalIssues] = useState(sourceIssues);
    const prevOpenRef = useRef(false);

    useEffect(() => {
        if (open && !prevOpenRef.current) {
            setModalIssues(sourceIssues);
            setSelectedYear(String(initialYear || 'all'));
            setSelectedTimeRange(initialTimeRange || 'all');
            setIsFullscreen(false);
            setIsSidebarOpen(true);
            setPreviewZoom('fit');
        }
        prevOpenRef.current = open;
    }, [open, sourceIssues, initialYear, initialTimeRange]);

    // Derive sorted year options from availableYears prop + modalIssues
    const yearOptions = useMemo(() => {
        const yearSet = new Set();
        (availableYears || []).forEach((yr) => {
            const num = parseInt(yr, 10);
            if (!isNaN(num)) yearSet.add(num);
        });
        (modalIssues || []).forEach((iss) => {
            const rawDate = iss?.created_at || iss?.reported_at || iss?.reportedAt;
            if (rawDate) {
                const yr = new Date(rawDate).getFullYear();
                if (!isNaN(yr)) yearSet.add(yr);
            }
        });
        if (selectedYear !== 'all') {
            const num = parseInt(selectedYear, 10);
            if (!isNaN(num)) yearSet.add(num);
        }
        return Array.from(yearSet).sort((a, b) => b - a);
    }, [availableYears, modalIssues, selectedYear]);

    // Filter modalIssues by selectedYear and selectedTimeRange
    const periodFilteredIssues = useMemo(() => {
        const now = new Date();
        return (modalIssues || []).filter((issue) => {
            const rawDate = issue.created_at || issue.reported_at || issue.reportedAt;
            if (!rawDate) return true;
            const issueDate = new Date(rawDate);
            if (isNaN(issueDate.getTime())) return true;

            if (selectedYear !== 'all') {
                if (issueDate.getFullYear() !== parseInt(selectedYear, 10)) {
                    return false;
                }
            }

            if (selectedTimeRange === 'all') return true;
            if (selectedTimeRange === 'today') {
                return issueDate.toDateString() === now.toDateString();
            }
            if (selectedTimeRange === '7d') {
                return now.getTime() - issueDate.getTime() <= 7 * 24 * 60 * 60 * 1000;
            }
            if (selectedTimeRange === '30d') {
                return now.getTime() - issueDate.getTime() <= 30 * 24 * 60 * 60 * 1000;
            }
            if (selectedTimeRange.startsWith('month_')) {
                const mNum = parseInt(selectedTimeRange.replace('month_', ''), 10);
                return issueDate.getMonth() + 1 === mNum;
            }
            return true;
        });
    }, [modalIssues, selectedYear, selectedTimeRange]);

    // Extract unique locations from periodFilteredIssues
    const availableLocations = useMemo(() => {
        const set = new Set();
        periodFilteredIssues.forEach((i) => {
            if (i.location && typeof i.location === 'string' && i.location.trim()) {
                set.add(i.location.trim());
            }
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }, [periodFilteredIssues]);

    // Reset selectedLocation if it no longer exists in the newly selected year/period
    useEffect(() => {
        if (selectedLocation !== 'all' && !availableLocations.includes(selectedLocation)) {
            setSelectedLocation('all');
        }
    }, [availableLocations, selectedLocation]);

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

    // Filter & sort issues based on user selection in modal (using stable periodFilteredIssues snapshot)
    const filteredIssues = useMemo(() => {
        const result = periodFilteredIssues.filter((issue) => {
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

            // Location match
            if (selectedLocation !== 'all') {
                if (String(issue.location || '').trim().toLowerCase() !== selectedLocation.toLowerCase()) {
                    return false;
                }
            }

            // SLA / ETA Status match
            if (selectedSlaStatus !== 'all') {
                const rawEta = issue.estimated_completion_at || issue.estimatedCompletionAt;
                const hasEta = !!rawEta;
                if (selectedSlaStatus === 'has_eta' && !hasEta) return false;
                if (selectedSlaStatus === 'no_eta' && hasEta) return false;

                if (selectedSlaStatus === 'overdue' || selectedSlaStatus === 'on_time') {
                    if (!hasEta) return false;
                    const etaMs = new Date(rawEta).getTime();
                    const resolvedMs = (issue.resolved_at || issue.solved_at || issue.solvedAt)
                        ? new Date(issue.resolved_at || issue.solved_at || issue.solvedAt).getTime()
                        : null;

                    const isSolved = issue.status === 'resolved' || issue.status === 'solved';
                    let isOverdue = false;
                    if (isSolved) {
                        isOverdue = resolvedMs ? resolvedMs > etaMs : false;
                    } else {
                        isOverdue = Date.now() > etaMs;
                    }

                    if (selectedSlaStatus === 'overdue' && !isOverdue) return false;
                    if (selectedSlaStatus === 'on_time' && isOverdue) return false;
                }
            }

            return true;
        });

        // Apply sort order
        return result.sort((a, b) => {
            const timeA = new Date(a.created_at || a.reported_at || a.reportedAt || 0).getTime();
            const timeB = new Date(b.created_at || b.reported_at || b.reportedAt || 0).getTime();

            if (sortOrder === 'oldest') {
                return timeA - timeB;
            }
            if (sortOrder === 'eta_closest') {
                const rawEtaA = a.estimated_completion_at || a.estimatedCompletionAt;
                const rawEtaB = b.estimated_completion_at || b.estimatedCompletionAt;
                const etaA = rawEtaA ? new Date(rawEtaA).getTime() : Infinity;
                const etaB = rawEtaB ? new Date(rawEtaB).getTime() : Infinity;
                return etaA - etaB;
            }
            if (sortOrder === 'duration') {
                const durA = (a.resolved_at ? new Date(a.resolved_at).getTime() : Date.now()) - timeA;
                const durB = (b.resolved_at ? new Date(b.resolved_at).getTime() : Date.now()) - timeB;
                return durB - durA;
            }
            // default newest
            return timeB - timeA;
        });
    }, [periodFilteredIssues, selectedStatuses, selectedDept, selectedLocation, selectedSlaStatus, sortOrder]);

    const displayIssues = useMemo(() => {
        if (limit === 'All') return filteredIssues;
        const num = parseInt(limit, 10);
        return isNaN(num) ? filteredIssues : filteredIssues.slice(0, num);
    }, [filteredIssues, limit]);

    // Dynamic period label derived from modal's selectedYear & selectedTimeRange
    const resolvedPeriod = useMemo(() => {
        const yrText = selectedYear === 'all'
            ? (isEn ? 'All Years' : 'Semua Tahun')
            : (isEn ? `Year ${selectedYear}` : `Tahun ${selectedYear}`);
        const trOpt = TIME_RANGE_OPTIONS.find((o) => o.id === selectedTimeRange);
        const trText = trOpt
            ? (isEn ? trOpt.labelEn : trOpt.labelId)
            : (timeLabel || (isEn ? 'All Months' : 'Semua Bulan'));
        return `${yrText} • ${trText}`;
    }, [selectedYear, selectedTimeRange, isEn, timeLabel]);

    // Dynamic KPI summary stats recomputed from filteredIssues inside the modal
    const computedStats = useMemo(() => {
        const total = filteredIssues.length;
        const resolved = filteredIssues.filter((i) => i.status === 'resolved' || i.status === 'solved').length;
        const activeCount = total - resolved;
        const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
        const backlogRate = total > 0 ? Math.round((activeCount / total) * 100) : 0;

        let evaluatedSlaCount = 0;
        let onTimeResolvedCount = 0;

        filteredIssues.forEach((issue) => {
            const isRes = issue.status === 'resolved' || issue.status === 'solved';
            const rawEta = issue.estimated_completion_at || issue.estimatedCompletionAt;
            if (!isRes || !rawEta) return;

            const etaMs = new Date(rawEta).getTime();
            const rawRes = issue.resolved_at || issue.solved_at || issue.solvedAt || issue.updated_at;
            const resMs = rawRes ? new Date(rawRes).getTime() : NaN;
            if (isNaN(etaMs) || isNaN(resMs)) return;

            evaluatedSlaCount += 1;
            if (resMs <= etaMs) {
                onTimeResolvedCount += 1;
            }
        });

        const onTimeRate = evaluatedSlaCount > 0
            ? Math.round((onTimeResolvedCount / evaluatedSlaCount) * 100)
            : 0;

        return {
            total,
            resolved,
            activeCount,
            resolutionRate,
            backlogRate,
            evaluatedSlaCount,
            onTimeResolvedCount,
            onTimeRate,
        };
    }, [filteredIssues]);

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

        // Optional Compact 1-line KPI strip (dynamically computed from modal filters)
        let startY = 28;
        if (includeKpiSummary) {
            const totalCount = computedStats.total;
            const resCount = computedStats.resolved;
            const resRate = computedStats.resolutionRate;
            const unresCount = computedStats.activeCount;
            const backlogRate = computedStats.backlogRate;
            const slaText = computedStats.evaluatedSlaCount > 0
                ? `${computedStats.onTimeResolvedCount}/${computedStats.evaluatedSlaCount} (${computedStats.onTimeRate}%)`
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

            // Problem: Title + Description
            let problemText = '';
            if (i.title && i.description && i.title.trim().toLowerCase() !== i.description.trim().toLowerCase()) {
                problemText = `${i.title.trim()}\n${i.description.trim()}`;
            } else {
                problemText = i.title || i.description || '-';
            }
            const cleanProblem = sanitizePdfText(problemText);

            // Taken Cell: date + worker name(s)
            let takenCell = '-';
            const takenTime = i.in_progress_at || i.claimed_at || i.taken_at || i.takenAt;
            const activeWorkerList = Array.isArray(i.active_workers) && i.active_workers.length > 0
                ? i.active_workers
                : (Array.isArray(i.progress_workers) && i.progress_workers.length > 0
                    ? i.progress_workers
                    : (i.claimed_by_name ? [i.claimed_by_name] : []));
            const shortWorkerNames = activeWorkerList.map((w) => String(w).split(' ')[0]).join(', ');

            if (takenTime) {
                takenCell = shortWorkerNames ? `${formatDateTime(takenTime)}\n[${shortWorkerNames}]` : formatDateTime(takenTime);
            } else if (i.status === 'in_progress') {
                takenCell = shortWorkerNames ? `[PROGRESS]\n${shortWorkerNames}` : '[PROGRESS]';
            } else if (i.status === 'pending') {
                takenCell = shortWorkerNames ? `[PENDING]\n${shortWorkerNames}` : '[PENDING]';
            }

            // Solved Cell: date + resolver name(s)
            let solvedCell = '-';
            const solvedTime = i.resolved_at || i.solved_at || i.solvedAt;
            const finalWorkerList = Array.isArray(i.final_workers) && i.final_workers.length > 0
                ? i.final_workers
                : (i.resolved_by_name ? [i.resolved_by_name] : activeWorkerList);
            const shortResolverNames = finalWorkerList.map((w) => String(w).split(' ')[0]).join(', ');

            if (solvedTime) {
                solvedCell = shortResolverNames ? `${formatDateTime(solvedTime)}\n[${shortResolverNames}]` : formatDateTime(solvedTime);
            } else if (i.status === 'resolved' || i.status === 'solved') {
                solvedCell = shortResolverNames ? `[SOLVED]\n${shortResolverNames}` : '[SOLVED]';
            }

            // Duration / Time Solve
            const duration = cleanDuration(i.duration_label || i.time_to_solve || i.durationLabel);

            // Departments with ACC Status & Tags
            const targetDepts = Array.isArray(i.target_departments)
                ? i.target_departments
                : (i.department ? [i.department] : []);
            const accs = (typeof i.department_accs === 'object' && i.department_accs !== null)
                ? i.department_accs
                : {};

            const deptLines = targetDepts.map((dept) => {
                const isClaimed = i.claimed_by_dept && (i.claimed_by_dept.toLowerCase() === dept.toLowerCase());
                const isAcc = accs[dept]?.is_acc || isClaimed;
                const isWorking = i.status === 'in_progress' && isClaimed;

                let tag = '';
                if (isWorking) {
                    tag = isEn ? ' [Working]' : ' [Dikerjakan]';
                } else if (isAcc) {
                    tag = ' [ACC]';
                }
                return `${dept}${tag}`;
            });

            const taggedDepts = Array.isArray(i.tagged_departments) ? i.tagged_departments : [];
            if (taggedDepts.length > 0) {
                deptLines.push(`Tag: ${taggedDepts.join(', ')}`);
            }
            const combinedDeptTags = sanitizePdfText(deptLines.join('\n')) || '-';

            // Status string
            let statusStr = (i.status || 'OPEN').toUpperCase();
            if (statusStr === 'IN_PROGRESS') statusStr = 'PROGRESS';
            if (statusStr === 'RESOLVED') statusStr = 'SOLVED';

            // ETA (Target Selesai) Cell with SLA status
            let etaCell = '-';
            const rawEta = i.estimated_completion_at || i.estimatedCompletionAt;
            if (rawEta) {
                const etaFormatted = formatDateTime(rawEta);
                const etaTimeMs = new Date(rawEta).getTime();
                const resolvedTimeMs = (i.resolved_at || i.solved_at || i.solvedAt)
                    ? new Date(i.resolved_at || i.solved_at || i.solvedAt).getTime()
                    : null;

                if (i.status === 'resolved' || i.status === 'solved') {
                    if (resolvedTimeMs && !isNaN(resolvedTimeMs) && !isNaN(etaTimeMs)) {
                        const onTime = resolvedTimeMs <= etaTimeMs;
                        etaCell = onTime
                            ? `${etaFormatted}\n[${isEn ? 'On Time' : 'Tepat Waktu'}]`
                            : `${etaFormatted}\n[${isEn ? 'Overdue' : 'Lewat Target'}]`;
                    } else {
                        etaCell = etaFormatted;
                    }
                } else {
                    if (!isNaN(etaTimeMs)) {
                        const isOverdue = Date.now() > etaTimeMs;
                        etaCell = isOverdue
                            ? `${etaFormatted}\n[${isEn ? 'Overdue' : 'Lewat Target'}]`
                            : `${etaFormatted}\n[${isEn ? 'Target' : 'Target'}]`;
                    } else {
                        etaCell = etaFormatted;
                    }
                }
            }

            tableData.push([
                rawCode,
                reportedTime,
                takenCell,
                solvedCell,
                duration,
                cleanProblem,
                sanitizePdfText(i.location || '-'),
                combinedDeptTags,
                sanitizePdfText(i.reporter_name || i.reporter || '-'),
                statusStr,
                etaCell,
            ]);

            // Sub-row: Pending Reason / Delay Timeline
            if (includePendingTimeline && (i.status === 'pending' || i.pending_reason)) {
                const reason = i.pending_reason || (i.pendingTimeline?.[0]?.reason) || 'Tertunda pengerjaan';
                tableData.push([
                    {
                        content: `Pending Reason: ${sanitizePdfText(reason)}`,
                        colSpan: 11,
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
                    colSpan: 11,
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
                'Taken / Petugas\n(Tgl & Waktu)',
                'Solved / Penyelesai\n(Tgl & Waktu)',
                'Time Solve',
                'Problem\n(Judul & Ket)',
                'Location',
                'Dept (ACC)',
                'Reporter',
                'Status',
                'Target Selesai\n(ETA / SLA)',
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
                0: { cellWidth: 16, halign: 'center', fontStyle: 'bold' }, // ID
                1: { cellWidth: 22 }, // Submitted
                2: { cellWidth: 22 }, // Taken / Petugas
                3: { cellWidth: 22 }, // Solved / Penyelesai
                4: { cellWidth: 16 }, // Time Solve
                5: { cellWidth: 56 }, // Problem (Judul & Ket - broadened)
                6: { cellWidth: 24 }, // Location
                7: { cellWidth: 30 }, // Dept (ACC)
                8: { cellWidth: 20 }, // Reporter
                9: { cellWidth: 18, fontStyle: 'bold', halign: 'center' }, // Status
                10: { cellWidth: 31, halign: 'center' }, // Target Selesai (ETA)
            },
            didParseCell: function (data) {
                // Color code Status column (Index 9)
                if (data.section === 'body' && data.column.index === 9) {
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
                // Color code Target Selesai (ETA) column (Index 10)
                if (data.section === 'body' && data.column.index === 10) {
                    const text = String(data.cell.raw || '');
                    if (text.includes('[Overdue]') || text.includes('[Lewat Target]')) {
                        data.cell.styles.textColor = [220, 38, 38]; // Red
                        data.cell.styles.fontStyle = 'bold';
                    } else if (text.includes('[On Time]') || text.includes('[Tepat Waktu]')) {
                        data.cell.styles.textColor = [22, 163, 74]; // Emerald
                        data.cell.styles.fontStyle = 'bold';
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
                const url = URL.createObjectURL(blob);
                setPreviewUrl((prev) => {
                    if (prev) {
                        URL.revokeObjectURL(prev);
                    }
                    return url;
                });
            } catch (err) {
                console.error('[ExportPdfModal] Failed generating preview:', err);
            } finally {
                setIsPreviewLoading(false);
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [
        open,
        displayIssues,
        selectedYear,
        selectedTimeRange,
        selectedStatuses,
        selectedDept,
        selectedLocation,
        selectedSlaStatus,
        sortOrder,
        includeKpiSummary,
        includePendingTimeline,
        resolvedPeriod,
        computedStats,
    ]);

    // Handle Download Action
    const handleDownload = () => {
        setIsExporting(true);
        try {
            const doc = buildPdfDocument();
            const dateSlug = new Date().toISOString().slice(0, 10);
            const periodSlug = (resolvedPeriod || 'Report')
                .replace(/[^a-zA-Z0-9]+/g, '_')
                .replace(/^_|_$/g, '');
            doc.save(`Telunas_Issue_Report_${periodSlug}_${dateSlug}.pdf`);
            onOpenChange(false);
        } catch (err) {
            console.error('[ExportPdfModal] Download failed:', err);
            alert(isEn ? 'Failed to download PDF report.' : 'Gagal mengunduh laporan PDF.');
        } finally {
            setIsExporting(false);
        }
    };

    const selectTriggerClass = `w-full rounded-xl text-xs font-medium border shadow-2xs transition-colors ${
        isDark
            ? 'bg-slate-900 border-slate-700 text-slate-100 hover:bg-slate-800/90'
            : 'bg-white border-slate-300 text-slate-900 hover:bg-slate-50'
    }`;
    const headerPillTriggerClass = `h-8 w-auto rounded-full px-3 py-1 text-xs font-bold border shadow-2xs transition-colors gap-1.5 ${
        isDark
            ? 'bg-amber-950/60 border-amber-500/40 text-amber-300 hover:bg-amber-950/90'
            : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100/80'
    }`;
    const selectContentClass = isDark
        ? 'bg-slate-900 border-slate-700 text-slate-100'
        : 'bg-white border-slate-200 text-slate-900 shadow-lg';
    const selectItemClass = isDark
        ? 'text-xs focus:bg-slate-800 focus:text-white'
        : 'text-xs focus:bg-emerald-50 focus:text-emerald-900';

    const iframeZoomFragment = previewZoom === 'fit' ? 'view=FitH' : `zoom=${previewZoom}`;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={`${
                    isFullscreen
                        ? 'max-w-none w-[99vw] h-[97vh] max-h-[97vh] rounded-2xl'
                        : 'max-w-[1520px] w-[95vw] h-[92vh] max-h-[92vh] rounded-3xl'
                } flex flex-col p-0 overflow-hidden border shadow-2xl transition-all duration-200 liquid-glass-modal ${
                    isDark
                        ? 'liquid-glass-dark bg-slate-900 border-slate-800 text-slate-100'
                        : 'liquid-glass-light bg-white border-slate-200 text-slate-800'
                }`}
            >
                {/* Header */}
                <DialogHeader className={`px-6 pr-12 py-3.5 border-b flex-shrink-0 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div
                                className={`w-10 h-10 rounded-2xl flex items-center justify-center border shadow-xs shrink-0 ${
                                    isDark
                                        ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                        : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                            >
                                <FileText className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <DialogTitle className={`text-base sm:text-lg font-extrabold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {isEn ? 'Export Official PDF Report (Classic Landscape)' : 'Ekspor Laporan PDF Resmi (Format Klasik Landscape)'}
                                </DialogTitle>
                                <DialogDescription className={`text-xs mt-0.5 truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {isEn
                                        ? 'Official Telunas Resorts 12-column issue tracking report (A4 Landscape).'
                                        : 'Laporan resmi pelacakan isu operasional 12 kolom Telunas Resorts (A4 Landscape).'}
                                </DialogDescription>
                            </div>
                        </div>

                        {/* Interactive Year + Period Pill Selectors */}
                        <div className="flex items-center gap-2 flex-wrap sm:justify-end shrink-0">
                            {/* Year Selector */}
                            <Select value={selectedYear} onValueChange={setSelectedYear}>
                                <SelectTrigger
                                    className={`${headerPillTriggerClass} min-w-[126px]`}
                                    title={isEn ? 'Select report year' : 'Pilih tahun laporan'}
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 shrink-0 opacity-80" />
                                        <SelectValue placeholder={isEn ? 'Select Year' : 'Pilih Tahun'} />
                                    </span>
                                </SelectTrigger>
                                <SelectContent className={selectContentClass}>
                                    <SelectItem value="all" className={selectItemClass}>
                                        {isEn ? 'All Years' : 'Semua Tahun'}
                                    </SelectItem>
                                    {yearOptions.map((yr) => (
                                        <SelectItem key={yr} value={String(yr)} className={selectItemClass}>
                                            {isEn ? `Year ${yr}` : `Tahun ${yr}`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Month / Period Selector */}
                            <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
                                <SelectTrigger
                                    className={`${headerPillTriggerClass} min-w-[170px]`}
                                    title={isEn ? 'Select report month or period' : 'Pilih bulan atau periode laporan'}
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 shrink-0 opacity-80" />
                                        <SelectValue placeholder={isEn ? 'All Months' : 'Semua Bulan'} />
                                    </span>
                                </SelectTrigger>
                                <SelectContent className={selectContentClass}>
                                    {TIME_RANGE_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.id} value={opt.id} className={selectItemClass}>
                                            {isEn ? opt.labelEn : opt.labelId}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </DialogHeader>

                {/* Body: Left Filter Controls & Right Live Preview */}
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-0">
                    {/* Left Filter Sidebar (Collapsible) */}
                    {isSidebarOpen && (
                    <div
                        className={`lg:col-span-4 xl:col-span-3 p-4 sm:p-5 space-y-4 overflow-y-auto border-b lg:border-b-0 lg:border-r ${
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
                                <SelectTrigger className={selectTriggerClass}>
                                    <SelectValue placeholder={isEn ? 'All Departments' : 'Semua Departemen'} />
                                </SelectTrigger>
                                <SelectContent className={selectContentClass}>
                                    <SelectItem value="all" className={selectItemClass}>{isEn ? 'All Departments (Entire Resort)' : 'Semua Departemen (Seluruh Resort)'}</SelectItem>
                                    {(departments || []).map((d) => (
                                        <SelectItem key={d} value={d} className={selectItemClass}>
                                            {d === 'Umum' && isEn ? 'General' : d}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Location Scope */}
                        <div>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                {isEn ? 'Location / Area' : 'Cakupan Lokasi'}
                            </label>
                            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                                <SelectTrigger className={selectTriggerClass}>
                                    <SelectValue placeholder={isEn ? 'All Locations' : 'Semua Lokasi'} />
                                </SelectTrigger>
                                <SelectContent className={selectContentClass}>
                                    <SelectItem value="all" className={selectItemClass}>{isEn ? 'All Locations (Entire Resort)' : 'Semua Lokasi (Seluruh Area)'}</SelectItem>
                                    {availableLocations.map((loc) => (
                                        <SelectItem key={loc} value={loc} className={selectItemClass}>
                                            {loc}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* ETA / SLA Punctuality Status */}
                        <div>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                {isEn ? 'ETA / SLA Punctuality' : 'Ketepatan Target (SLA)'}
                            </label>
                            <Select value={selectedSlaStatus} onValueChange={setSelectedSlaStatus}>
                                <SelectTrigger className={selectTriggerClass}>
                                    <SelectValue placeholder={isEn ? 'All SLA Status' : 'Semua Status SLA'} />
                                </SelectTrigger>
                                <SelectContent className={selectContentClass}>
                                    <SelectItem value="all" className={selectItemClass}>{isEn ? 'All Tickets (All SLA Status)' : 'Semua Tiket (Seluruh SLA)'}</SelectItem>
                                    <SelectItem value="overdue" className={selectItemClass}>{isEn ? 'Overdue Only (Late)' : 'Lewat Target Saja (Terlambat)'}</SelectItem>
                                    <SelectItem value="on_time" className={selectItemClass}>{isEn ? 'On Time Only (Met SLA)' : 'Tepat Waktu Saja (Sesuai SLA)'}</SelectItem>
                                    <SelectItem value="has_eta" className={selectItemClass}>{isEn ? 'With Target Date (Has ETA)' : 'Memiliki Target Tanggal (Ada ETA)'}</SelectItem>
                                    <SelectItem value="no_eta" className={selectItemClass}>{isEn ? 'Without Target Date (No ETA)' : 'Tanpa Target Tanggal (Belum Ada ETA)'}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Sort Order */}
                        <div>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                {isEn ? 'Sort Order' : 'Urutan Data'}
                            </label>
                            <Select value={sortOrder} onValueChange={setSortOrder}>
                                <SelectTrigger className={selectTriggerClass}>
                                    <SelectValue placeholder={isEn ? 'Newest First' : 'Terbaru Dahulu'} />
                                </SelectTrigger>
                                <SelectContent className={selectContentClass}>
                                    <SelectItem value="newest" className={selectItemClass}>{isEn ? 'Newest Reported First' : 'Terbaru Dilaporkan'}</SelectItem>
                                    <SelectItem value="oldest" className={selectItemClass}>{isEn ? 'Oldest Reported First' : 'Terlama Dilaporkan'}</SelectItem>
                                    <SelectItem value="eta_closest" className={selectItemClass}>{isEn ? 'Closest Target ETA' : 'Target Selesai Terdekat'}</SelectItem>
                                    <SelectItem value="duration" className={selectItemClass}>{isEn ? 'Longest Duration / Pending' : 'Durasi Penanganan Terlama'}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Max Rows (Limit) */}
                        <div>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                {isEn ? 'Record Limit' : 'Batas Jumlah Baris'}
                            </label>
                            <Select value={String(limit)} onValueChange={setLimit}>
                                <SelectTrigger className={selectTriggerClass}>
                                    <SelectValue placeholder="All" />
                                </SelectTrigger>
                                <SelectContent className={selectContentClass}>
                                    {LIMIT_OPTIONS.map((opt) => (
                                        <SelectItem key={String(opt)} value={String(opt)} className={selectItemClass}>
                                            {opt === 'All' ? (isEn ? 'All Filtered Records' : 'Semua Data Terfilter') : `${opt} Data Teratas`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Additional Content Checkboxes */}
                        <div className={`pt-3 border-t space-y-2.5 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
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

                        {/* Record count summary pill & sync button */}
                        <div
                            className={`p-3 rounded-2xl border text-xs flex items-center justify-between ${
                                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
                            }`}
                        >
                            <div>
                                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                                    {isEn ? 'Total issues to export:' : 'Total isu yang diekspor:'}
                                </span>
                                <span className={`ml-1.5 font-extrabold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                    {displayIssues.length} {isEn ? 'issues' : 'isu'}
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={() => setModalIssues(sourceIssues)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer border ${
                                    isDark
                                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                        : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                                title={isEn ? 'Sync latest issues from live dashboard' : 'Tarik data isu paling mutakhir dari dashboard'}
                            >
                                <RefreshCw className="w-3 h-3" />
                                <span>{isEn ? 'Sync' : 'Sinkronkan'}</span>
                            </button>
                        </div>
                    </div>
                    )}

                    {/* Right Live Preview Area */}
                    <div className={`${isSidebarOpen ? 'lg:col-span-8 xl:col-span-9' : 'lg:col-span-12'} flex flex-col h-full relative overflow-hidden min-h-[350px] ${
                        isDark ? 'bg-slate-950' : 'bg-slate-100'
                    }`}>
                        {/* Top bar with Sidebar Toggle, Paper Info, Zoom Controls, Fullscreen & Open in New Tab */}
                        <div
                            className={`px-3 sm:px-4 py-2 border-b flex items-center justify-between gap-2 flex-wrap text-xs font-semibold ${
                                isDark ? 'border-slate-800 bg-slate-900/90 text-slate-300' : 'border-slate-200 bg-white/90 text-slate-600'
                            }`}
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                {/* Toggle Filter Sidebar Button */}
                                <button
                                    type="button"
                                    onClick={() => setIsSidebarOpen((prev) => !prev)}
                                    className={`hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer shrink-0 ${
                                        !isSidebarOpen
                                            ? isDark
                                                ? 'bg-emerald-950/70 border-emerald-700 text-emerald-300'
                                                : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                            : isDark
                                            ? 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
                                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                                    }`}
                                    title={
                                        isSidebarOpen
                                            ? (isEn ? 'Hide filter panel for wider preview' : 'Sembunyikan panel filter agar pratinjau penuh')
                                            : (isEn ? 'Show filter panel' : 'Tampilkan kembali panel filter')
                                    }
                                >
                                    {isSidebarOpen ? (
                                        <>
                                            <PanelLeftClose className="w-3.5 h-3.5" />
                                            <span>{isEn ? 'Hide Filters' : 'Sembunyikan Filter'}</span>
                                        </>
                                    ) : (
                                        <>
                                            <PanelLeftOpen className="w-3.5 h-3.5" />
                                            <span>{isEn ? 'Show Filters' : 'Tampilkan Filter'}</span>
                                        </>
                                    )}
                                </button>

                                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="truncate">{isEn ? 'Preview: A4 Landscape' : 'Pratinjau: A4 Landscape'}</span>
                                {isPreviewLoading && (
                                    <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-500 font-medium ml-1 animate-pulse shrink-0">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        <span>{isEn ? 'Updating...' : 'Memperbarui...'}</span>
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                {/* Zoom Controls (- | Fit / % | + | Reset) */}
                                {previewUrl && (
                                    <div
                                        className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg border ${
                                            isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200'
                                        }`}
                                        role="group"
                                        aria-label={isEn ? 'PDF Preview Zoom Controls' : 'Kontrol Zoom Pratinjau PDF'}
                                    >
                                        <button
                                            type="button"
                                            onClick={handleZoomOut}
                                            disabled={!canZoomOut}
                                            className={`p-1 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                                isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-200/80 text-slate-700'
                                            }`}
                                            title={isEn ? 'Zoom Out' : 'Perkecil (-)'}
                                        >
                                            <ZoomOut className="w-3.5 h-3.5" />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleZoomReset}
                                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold min-w-[46px] text-center transition-colors cursor-pointer ${
                                                previewZoom === 'fit'
                                                    ? isDark
                                                        ? 'bg-emerald-950/70 text-emerald-300'
                                                        : 'bg-emerald-100/80 text-emerald-800'
                                                    : isDark
                                                    ? 'text-slate-200 hover:bg-slate-700'
                                                    : 'text-slate-800 hover:bg-slate-200/80'
                                            }`}
                                            title={isEn ? 'Click to reset zoom to Fit Width' : 'Klik untuk reset zoom ke Fit Lebar'}
                                        >
                                            {previewZoom === 'fit' ? 'Fit' : `${previewZoom}%`}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleZoomIn}
                                            disabled={!canZoomIn}
                                            className={`p-1 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                                isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-200/80 text-slate-700'
                                            }`}
                                            title={isEn ? 'Zoom In' : 'Perbesar (+)'}
                                        >
                                            <ZoomIn className="w-3.5 h-3.5" />
                                        </button>

                                        {previewZoom !== 'fit' && (
                                            <button
                                                type="button"
                                                onClick={handleZoomReset}
                                                className={`p-1 rounded-md transition-colors cursor-pointer ${
                                                    isDark ? 'hover:bg-slate-700 text-slate-400 hover:text-white' : 'hover:bg-slate-200/80 text-slate-500 hover:text-slate-900'
                                                }`}
                                                title={isEn ? 'Reset to Fit Width' : 'Reset ke Fit Lebar'}
                                            >
                                                <RotateCcw className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Maximize / Restore Modal Button */}
                                <button
                                    type="button"
                                    onClick={() => setIsFullscreen((prev) => !prev)}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                                        isFullscreen
                                            ? isDark
                                                ? 'bg-emerald-950/70 border-emerald-700 text-emerald-300'
                                                : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                            : isDark
                                            ? 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
                                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                                    }`}
                                    title={isFullscreen ? (isEn ? 'Restore modal size' : 'Kembalikan ukuran normal') : (isEn ? 'Expand modal to fullscreen' : 'Perbesar modal ke layar penuh')}
                                >
                                    {isFullscreen ? (
                                        <>
                                            <Minimize2 className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">{isEn ? 'Normal' : 'Normal'}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Maximize2 className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">{isEn ? 'Expand' : 'Perbesar'}</span>
                                        </>
                                    )}
                                </button>

                                {/* Open Fullscreen in New Browser Tab */}
                                {previewUrl && (
                                    <button
                                        type="button"
                                        onClick={() => window.open(previewUrl, '_blank')}
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                                            isDark
                                                ? 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'
                                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 hover:text-slate-900'
                                        }`}
                                        title={isEn ? 'Open full document in new tab' : 'Buka dokumen penuh di tab baru'}
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">{isEn ? 'New Tab' : 'Tab Baru'}</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Content viewport */}
                        <div className="flex-1 relative p-2 sm:p-3 overflow-hidden flex flex-col">
                            {!previewUrl && isPreviewLoading && (
                                <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl ${
                                    isDark ? 'bg-slate-950 text-slate-400' : 'bg-slate-100 text-slate-500'
                                }`}>
                                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                                    <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                        {isEn ? 'Rendering A4 Landscape Preview...' : 'Menyusun Pratinjau PDF A4 Landscape...'}
                                    </span>
                                </div>
                            )}

                            {previewUrl ? (
                                <iframe
                                    key={`${previewUrl}-${previewZoom}`}
                                    src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=1&${iframeZoomFragment}`}
                                    title="Telunas PDF Preview"
                                    className={`w-full h-full flex-1 rounded-xl bg-white shadow-md border ${
                                        isDark ? 'border-slate-800' : 'border-slate-300'
                                    }`}
                                />
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                                    <FileText className={`w-12 h-12 mb-3 ${isDark ? 'text-slate-600' : 'text-slate-400'}`} />
                                    <p className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
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

