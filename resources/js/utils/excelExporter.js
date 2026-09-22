import ExcelJS from 'exceljs';
import { formatDurationLabel } from '@/lib/duration';

/**
 * Format timestamp or date string to readable format "YYYY-MM-DD HH:mm"
 */
function formatDateTime(val) {
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

    const pad = (n) => String(n).padStart(2, '0');
    const YYYY = d.getFullYear();
    const MM = pad(d.getMonth() + 1);
    const DD = pad(d.getDate());
    const HH = pad(d.getHours());
    const mm = pad(d.getMinutes());
    return `${YYYY}-${MM}-${DD} ${HH}:${mm}`;
}

/**
 * Clean and round duration label
 */
function cleanDuration(val) {
    if (!val || typeof val !== 'string') return '-';
    const formatted = formatDurationLabel(val);
    return formatted.replace(/(\d+\.\d+)/g, (match) => Math.round(parseFloat(match)));
}

/**
 * Extract numeric hours from duration string or calculate from timestamps
 */
function getNumericHours(issue) {
    if (issue.reportedAt && issue.solvedAt) {
        const start = new Date(issue.reportedAt).getTime();
        const end = new Date(issue.solvedAt).getTime();
        if (!isNaN(start) && !isNaN(end) && end >= start) {
            return (end - start) / (1000 * 60 * 60);
        }
    }
    if (issue.durationLabel) {
        const match = issue.durationLabel.match(/(\d+(?:\.\d+)?)\s*hours?/i);
        if (match) return parseFloat(match[1]);
    }
    return null;
}

// Styling Constants (Telunas Signature Palette)
const TELUNAS_GOLD_FILL = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE3D1AA' }, // Telunas warm tan/gold
};

const TELUNAS_DARK_GOLD_FILL = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFC9AA71' },
};

const SECTION_HEADER_FILL = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF3EAD8' },
};

const HEADER_FONT = {
    name: 'Segoe UI',
    size: 10,
    bold: true,
    color: { argb: 'FF1C1B0E' },
};

// High-Contrast Crisp Borders
const CELL_BORDER_COLOR = 'FF94A3B8'; // Slate-400 (sharp, clear cell gridlines)
const GROUP_BORDER_COLOR = 'FF334155'; // Slate-700 (solid distinct divider between column groups)
const HEADER_BORDER_COLOR = 'FF9A7B38'; // Dark Tan/Gold border for header cells
const HEADER_BOTTOM_BORDER_COLOR = 'FF1C1B0E'; // Charcoal dark bottom border for header

const CRISP_BORDER = {
    top: { style: 'thin', color: { argb: CELL_BORDER_COLOR } },
    left: { style: 'thin', color: { argb: CELL_BORDER_COLOR } },
    bottom: { style: 'thin', color: { argb: CELL_BORDER_COLOR } },
    right: { style: 'thin', color: { argb: CELL_BORDER_COLOR } },
};

const STATUS_STYLES = {
    SOLVED: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } },
        font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF166534' } },
    },
    PENDING: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } },
        font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF92400E' } },
    },
    PROGRESS: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } },
        font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF075985' } },
    },
    OPEN: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } },
        font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF991B1B' } },
    },
    ARCHIVED: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } },
        font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF4B5563' } },
    },
};

const PRIORITY_STYLES = {
    HIGH: { font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFDC2626' } } },
    CRITICAL: { font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFDC2626' } } },
    SOS: { font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFDC2626' } } },
    MEDIUM: { font: { name: 'Segoe UI', size: 9.5, color: { argb: 'FFD97706' } } },
    LOW: { font: { name: 'Segoe UI', size: 9.5, color: { argb: 'FF4B5563' } } },
};

/**
 * Generate and download an Excel (.xlsx) file with KPI Summary and Raw Tickets sheets.
 */
export async function generateExcelReport(issues = [], options = {}) {
    const {
        selectedSheets = ['2026'],
        categories = [],
        includeKpiSummary = true,
        includeDelayTimeline = true,
        includeSolvedNotes = true,
        filename,
    } = options;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Telunas Resort Issue Tracker';
    workbook.lastModifiedBy = 'Telunas Resort System';
    workbook.created = new Date();
    workbook.modified = new Date();

    // ==========================================
    // 1. SHEET 1: RINGKASAN KPI (Optional)
    // ==========================================
    if (includeKpiSummary) {
        const kpiSheet = workbook.addWorksheet('Ringkasan KPI', {
            views: [{ showGridLines: true }],
        });

        // Title Header
        kpiSheet.mergeCells('A1:F1');
        const titleCell = kpiSheet.getCell('A1');
        titleCell.value = 'TELUNAS RESORTS — REKAPITULASI LAPORAN OPERASIONAL';
        titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF1C1B0E' } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
        kpiSheet.getRow(1).height = 28;

        kpiSheet.mergeCells('A2:F2');
        const subtitleCell = kpiSheet.getCell('A2');
        subtitleCell.value = 'Pulau Sugi, Moro, Kepulauan Riau — Sistem Pelacakan Masalah & Resolusi Kamar/Fasilitas';
        subtitleCell.font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF6B7280' } };
        subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
        kpiSheet.getRow(2).height = 18;

        kpiSheet.mergeCells('A3:F3');
        const metaCell = kpiSheet.getCell('A3');
        const periodStr = selectedSheets.length === 1 ? selectedSheets[0] : selectedSheets.join(', ');
        metaCell.value = `Periode: ${periodStr} | Tanggal Ekspor: ${new Date().toLocaleString('id-ID')} | Total Data Terfilter: ${issues.length} Tiket`;
        metaCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF4B5563' } };
        metaCell.alignment = { vertical: 'middle', horizontal: 'left' };
        kpiSheet.getRow(3).height = 18;

        // Space
        kpiSheet.getRow(4).height = 10;

        // Metric calculations
        const total = issues.length;
        const solved = issues.filter(i => i.status === 'solved').length;
        const pending = issues.filter(i => i.status === 'pending').length;
        const progress = issues.filter(i => i.status === 'progress').length;
        const open = issues.filter(i => i.status === 'open').length;
        const archived = issues.filter(i => i.isArchived).length;
        const rate = total > 0 ? ((solved / total) * 100).toFixed(1) : '0.0';

        // --- Table 1: Ringkasan Metriks Global ---
        kpiSheet.mergeCells('A5:C5');
        const h1 = kpiSheet.getCell('A5');
        h1.value = '1. RINGKASAN STATUS OPERASIONAL';
        h1.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF1C1B0E' } };
        h1.fill = SECTION_HEADER_FILL;
        h1.alignment = { vertical: 'middle', horizontal: 'left' };
        kpiSheet.getRow(5).height = 22;

        const kpiTableHeaders = ['Status / Kondisi', 'Jumlah Tiket', 'Persentase (%)'];
        const kpiHeadRow = kpiSheet.addRow(kpiTableHeaders);
        kpiHeadRow.height = 22;
        kpiHeadRow.eachCell((cell) => {
            cell.fill = TELUNAS_GOLD_FILL;
            cell.font = HEADER_FONT;
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin', color: { argb: HEADER_BORDER_COLOR } },
                bottom: { style: 'medium', color: { argb: HEADER_BOTTOM_BORDER_COLOR } },
                left: { style: 'thin', color: { argb: CELL_BORDER_COLOR } },
                right: { style: 'thin', color: { argb: CELL_BORDER_COLOR } },
            };
        });

        const statusData = [
            ['Selesai (Solved)', solved, total > 0 ? `${((solved / total) * 100).toFixed(1)}%` : '0%'],
            ['Sedang Dikerjakan (Progress)', progress, total > 0 ? `${((progress / total) * 100).toFixed(1)}%` : '0%'],
            ['Tertunda (Pending Delay)', pending, total > 0 ? `${((pending / total) * 100).toFixed(1)}%` : '0%'],
            ['Terbuka / Menunggu Diambil (Open)', open, total > 0 ? `${((open / total) * 100).toFixed(1)}%` : '0%'],
            ['Tiket Terarsip (Archived)', archived, total > 0 ? `${((archived / total) * 100).toFixed(1)}%` : '0%'],
            ['TOTAL TIKET TERFILTER', total, '100%'],
        ];

        statusData.forEach((row, idx) => {
            const r = kpiSheet.addRow(row);
            r.height = 20;
            const isTotal = idx === statusData.length - 1;
            const isEvenRow = idx % 2 === 1;
            r.eachCell((cell, colNum) => {
                cell.font = { name: 'Segoe UI', size: 9.5, bold: isTotal };
                cell.border = CRISP_BORDER;
                cell.alignment = {
                    vertical: 'middle',
                    horizontal: colNum === 1 ? 'left' : 'center',
                };
                if (isTotal) {
                    cell.fill = SECTION_HEADER_FILL;
                } else if (isEvenRow) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5EFE6' } };
                } else {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
                }
            });
        });

        // Space
        const curRow = kpiSheet.rowCount + 2;

        // --- Table 2: Breakdown per Departemen ---
        kpiSheet.mergeCells(`A${curRow}:E${curRow}`);
        const h2 = kpiSheet.getCell(`A${curRow}`);
        h2.value = '2. REKAPITULASI PER DEPARTEMEN PENANGGUNG JAWAB';
        h2.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF1C1B0E' } };
        h2.fill = SECTION_HEADER_FILL;
        h2.alignment = { vertical: 'middle', horizontal: 'left' };
        kpiSheet.getRow(curRow).height = 22;

        const deptHeaders = ['Departemen Penanggung Jawab', 'Total Tiket', 'Selesai', 'Pending', 'Tingkat Selesai (%)'];
        const deptHeadRow = kpiSheet.addRow(deptHeaders);
        deptHeadRow.height = 22;
        deptHeadRow.eachCell((cell) => {
            cell.fill = TELUNAS_GOLD_FILL;
            cell.font = HEADER_FONT;
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin', color: { argb: HEADER_BORDER_COLOR } },
                bottom: { style: 'medium', color: { argb: HEADER_BOTTOM_BORDER_COLOR } },
                left: { style: 'thin', color: { argb: CELL_BORDER_COLOR } },
                right: { style: 'thin', color: { argb: CELL_BORDER_COLOR } },
            };
        });

        // Aggregate by department
        const deptStats = {};
        issues.forEach((issue) => {
            const depts = (issue.assignedDepartments && issue.assignedDepartments.length > 0)
                ? issue.assignedDepartments
                : [issue.department || 'Other'];

            depts.forEach((d) => {
                const name = d || 'Unassigned';
                if (!deptStats[name]) {
                    deptStats[name] = { total: 0, solved: 0, pending: 0 };
                }
                deptStats[name].total += 1;
                if (issue.status === 'solved') deptStats[name].solved += 1;
                if (issue.status === 'pending') deptStats[name].pending += 1;
            });
        });

        const sortedDepts = Object.entries(deptStats).sort((a, b) => b[1].total - a[1].total);
        sortedDepts.forEach(([dName, stat], idx) => {
            const completion = stat.total > 0 ? `${((stat.solved / stat.total) * 100).toFixed(1)}%` : '0%';
            const r = kpiSheet.addRow([dName, stat.total, stat.solved, stat.pending, completion]);
            r.height = 20;
            const isEvenRow = idx % 2 === 1;
            r.eachCell((cell, colNum) => {
                cell.font = { name: 'Segoe UI', size: 9.5 };
                cell.border = CRISP_BORDER;
                cell.alignment = {
                    vertical: 'middle',
                    horizontal: colNum === 1 ? 'left' : 'center',
                };
                if (isEvenRow) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5EFE6' } };
                } else {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
                }
            });
        });

        // Auto width for KPI Sheet
        kpiSheet.columns = [
            { width: 34 },
            { width: 16 },
            { width: 16 },
            { width: 14 },
            { width: 22 },
            { width: 20 },
        ];
    }

    // ==========================================
    // 2. SHEET 2: DATA TIKET MENTAH
    // ==========================================
    const dataSheet = workbook.addWorksheet('Data Tiket', {
        views: [{ state: 'frozen', ySplit: 1, showGridLines: true }],
    });

    // Column configurations with widened widths (prevents Excel filter arrow overlap)
    // and isGroupEnd markers for thematic vertical dividers (Opsi 2)
    const columnsConfig = [
        // Kelompok 1: Identifikasi & Lokasi
        { header: 'ID Tiket', key: 'id', width: 16, align: 'center' },
        { header: 'Tanggal Lapor', key: 'reportedAt', width: 22, align: 'center' },
        { header: 'Lokasi / Kamar', key: 'location', width: 26, align: 'left', isGroupEnd: true },

        // Kelompok 2: Detail Masalah & Departemen
        { header: 'Judul Masalah', key: 'title', width: 42, align: 'left' },
        { header: 'Kategori', key: 'category', width: 22, align: 'left' },
        { header: 'Departemen Utama', key: 'department', width: 24, align: 'left' },
        { header: 'Departemen Terkait (Tags)', key: 'tags', width: 26, align: 'left', isGroupEnd: true },

        // Kelompok 3: Status & Penanggung Jawab
        { header: 'Status', key: 'status', width: 16, align: 'center' },
        { header: 'Prioritas', key: 'priority', width: 15, align: 'center' },
        { header: 'Pelapor', key: 'reporter', width: 22, align: 'left', isGroupEnd: true },

        // Kelompok 4: Penanganan & Timeline Waktu
        { header: 'Diambil Oleh', key: 'taker', width: 22, align: 'left' },
        { header: 'Waktu Diambil', key: 'takenAt', width: 22, align: 'center' },
        { header: 'Diselesaikan Oleh', key: 'solver', width: 24, align: 'left' },
        { header: 'Waktu Selesai', key: 'solvedAt', width: 22, align: 'center' },
        { header: 'Durasi Pengerjaan', key: 'duration', width: 25, align: 'center', isGroupEnd: true },

        // Kelompok 5: Catatan Tambahan & Status Arsip
        { header: 'Alasan Pending / Timeline', key: 'pendingReason', width: 36, align: 'left' },
        { header: 'Catatan Solved', key: 'solvedNotes', width: 38, align: 'left' },
        { header: 'Status Arsip', key: 'isArchived', width: 16, align: 'center', isGroupEnd: true },
    ];

    dataSheet.columns = columnsConfig.map(col => ({
        header: col.header,
        key: col.key,
        width: col.width,
    }));

    // Header styling with dark bottom line and group divider
    const dataHeadRow = dataSheet.getRow(1);
    dataHeadRow.height = 28;
    dataHeadRow.eachCell((cell, colNumber) => {
        const config = columnsConfig[colNumber - 1];
        const isGroupEnd = config?.isGroupEnd;
        cell.fill = TELUNAS_GOLD_FILL;
        cell.font = HEADER_FONT;
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: HEADER_BORDER_COLOR } },
            bottom: { style: 'medium', color: { argb: HEADER_BOTTOM_BORDER_COLOR } },
            left: { style: 'thin', color: { argb: HEADER_BORDER_COLOR } },
            right: isGroupEnd
                ? { style: 'medium', color: { argb: GROUP_BORDER_COLOR } }
                : { style: 'thin', color: { argb: HEADER_BORDER_COLOR } },
        };
    });

    // Auto-filter on entire column range
    const lastColLetter = String.fromCharCode(64 + columnsConfig.length);
    dataSheet.autoFilter = `A1:${lastColLetter}1`;

    // Category label lookup map
    const catMap = new Map();
    categories.forEach(c => catMap.set(c.id, c.label || c.name || c.id));

    // Populate data rows
    issues.forEach((issue, index) => {
        // Category Label
        const catLabel = catMap.get(issue.category) || issue.category || '-';

        // Department Tags
        const tags = (issue.taggedDepartments || []).join(', ') || '-';
        const assignedDept = (issue.assignedDepartments || []).join(', ') || issue.department || '-';

        // Pending Timeline / Reason
        let pendingText = '-';
        if (includeDelayTimeline && issue.pendingTimeline && issue.pendingTimeline.length > 0) {
            pendingText = issue.pendingTimeline.map(item => {
                const dateStr = item.date ? `[${item.date}] ` : '';
                return `${dateStr}${item.by || 'Staff'}: ${item.reason}`;
            }).join(' | ');
        } else if (issue.pendingReason) {
            pendingText = issue.pendingReason;
            if (issue.pendingBy) pendingText += ` (by: ${issue.pendingBy})`;
        }

        // Solved Notes
        const solvedNotes = includeSolvedNotes && (issue.solutionNote || issue.notes || issue.note)
            ? (issue.solutionNote || issue.notes || issue.note)
            : '-';

        const statusKey = (issue.status || 'OPEN').toUpperCase();

        const rowData = {
            id: (issue.id || '').replace(/^TEL-/, 'TEL-'),
            reportedAt: formatDateTime(issue.reportedAt),
            location: issue.location || '-',
            title: issue.title || issue.description || '-',
            category: catLabel,
            department: assignedDept,
            tags: tags,
            status: statusKey,
            priority: (issue.priority || 'LOW').toUpperCase(),
            reporter: issue.reporter || '-',
            taker: issue.taker || '-',
            takenAt: formatDateTime(issue.takenAt),
            solver: issue.solver || '-',
            solvedAt: formatDateTime(issue.solvedAt),
            duration: cleanDuration(issue.durationLabel),
            pendingReason: pendingText,
            solvedNotes: solvedNotes,
            isArchived: issue.isArchived ? 'ARCHIVED' : 'ACTIVE',
        };

        const row = dataSheet.addRow(rowData);
        row.height = 21;

        // Distinct alternating background: Telunas soft linen cream vs crisp white
        const isEven = index % 2 === 1;
        const defaultFill = isEven
            ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5EFE6' } }
            : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

        row.eachCell((cell, colNumber) => {
            const config = columnsConfig[colNumber - 1];
            const isGroupEnd = config?.isGroupEnd;

            // Crisp cell borders with thicker group divider on group boundaries
            cell.border = {
                top: { style: 'thin', color: { argb: CELL_BORDER_COLOR } },
                bottom: { style: 'thin', color: { argb: CELL_BORDER_COLOR } },
                left: { style: 'thin', color: { argb: CELL_BORDER_COLOR } },
                right: isGroupEnd
                    ? { style: 'medium', color: { argb: GROUP_BORDER_COLOR } }
                    : { style: 'thin', color: { argb: CELL_BORDER_COLOR } },
            };

            cell.font = { name: 'Segoe UI', size: 9 };
            cell.fill = defaultFill;
            cell.alignment = {
                vertical: 'middle',
                horizontal: config?.align || 'left',
                wrapText: ['title', 'location', 'pendingReason', 'solvedNotes'].includes(config?.key),
            };

            // Custom styling for Status column
            if (config?.key === 'status') {
                const style = STATUS_STYLES[statusKey] || STATUS_STYLES.OPEN;
                cell.fill = style.fill;
                cell.font = style.font;
            }

            // Custom styling for Priority column
            if (config?.key === 'priority') {
                const pStyle = PRIORITY_STYLES[rowData.priority] || PRIORITY_STYLES.LOW;
                cell.font = pStyle.font;
            }

            // Custom styling for Archived column
            if (config?.key === 'isArchived' && issue.isArchived) {
                cell.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF9CA3AF' } };
            }
        });
    });

    // ==========================================
    // 3. GENERATE BLOB & DOWNLOAD
    // ==========================================
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const nowStr = new Date().toISOString().slice(0, 10);
    const finalFilename = filename || `Telunas_Issues_Report_${selectedSheets.join('_')}_${nowStr}.xlsx`;

    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = finalFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);

    return true;
}
