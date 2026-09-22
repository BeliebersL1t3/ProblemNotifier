import { useState, useEffect, useRef, useMemo } from 'react';
import { usePage } from '@inertiajs/react';
import axios from 'axios';
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
import { useIssues } from '@/context/IssuesContext';
import { useLanguage } from '@/context/LanguageContext';
import { 
    Loader2, Download, FileText, ChevronDown, Layers, Wrench, Send, AtSign, Globe,
    Mail, Check, CheckCircle2, AlertCircle, X, Users, User, Plus, Sparkles,
    FileSpreadsheet, Table
} from 'lucide-react';
import { normalizeDepartment } from '@/constants/staff';
import { formatDurationLabel } from '@/lib/duration';
import { generateExcelReport } from '@/utils/excelExporter';

// Mobile-friendly collapsible section
function CollapsibleSection({ label, toggleLabel, onToggleAll, children, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="grid gap-2">
            <div className="flex items-center justify-between">
                <button
                    type="button"
                    className="flex items-center gap-1 text-sm font-semibold text-foreground"
                    onClick={() => setOpen(o => !o)}
                >
                    <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
                    {label}
                </button>
                <button type="button" onClick={onToggleAll} className="text-xs text-primary hover:underline">
                    {toggleLabel}
                </button>
            </div>
            {open && children}
        </div>
    );
}
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const LIMITS = [
    5, 10, 15, 20, 25, 30, 35, 40, 45, 50,
    100, 150, 200, 250, 300, 350, 400, 450, 500,
    'All'
];

// Toggle this to true in the future when official Telunas Google Workspace is configured.
// Kept false for now so all staff dispatch cleanly via the centralized Telunas system mailer.
const SHOW_GOOGLE_OAUTH_CARD = false;

export function ExportPdfModal({ open, onOpenChange }) {
    const { issues, archivedIssues, categories, currentSheet, availableSheets } = useIssues();
    const { auth } = usePage().props;
    const isAdmin = auth?.user?.role === 'admin';
    const userDept = normalizeDepartment(auth?.user?.department || '');

    const [isExporting, setIsExporting] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    
    const [selectedSheets, setSelectedSheets] = useState([]);
    const [downloadedIssues, setDownloadedIssues] = useState({});
    
    const [selectedStatuses, setSelectedStatuses] = useState(['open', 'progress', 'pending', 'solved']);
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [selectedDepartments, setSelectedDepartments] = useState([]);
    const [deptFilterMode, setDeptFilterMode] = useState('all'); // 'all' | 'my_scope' | 'to_fix' | 'my_reports' | 'mentions'
    const [limit, setLimit] = useState('All');
    
    // Format Selection: 'pdf' or 'excel'
    const [exportFormat, setExportFormat] = useState('pdf');
    const [includeKpiSummary, setIncludeKpiSummary] = useState(true);
    const [includeSolvedNotes, setIncludeSolvedNotes] = useState(true);
    const [isExportingExcel, setIsExportingExcel] = useState(false);
    const [excelActiveTabPreview, setExcelActiveTabPreview] = useState('kpi'); // 'kpi' | 'raw'

    // Optional PDF details
    const [includeAuditTrail, setIncludeAuditTrail] = useState(false);
    const [includeAuditTime, setIncludeAuditTime] = useState(true);
    const [includeAuditPerson, setIncludeAuditPerson] = useState(true);
    const [includeAuditReason, setIncludeAuditReason] = useState(true);
    const [includeDelayTimeline, setIncludeDelayTimeline] = useState(true);
    const [includeArchived, setIncludeArchived] = useState(false);

    const { t, lang } = useLanguage();

    // Email dispatch state
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [emailRecipients, setEmailRecipients] = useState([]);
    const [recipientInput, setRecipientInput] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailMessage, setEmailMessage] = useState('');
    const [availableRecipients, setAvailableRecipients] = useState({ users: [], by_department: {}, hods: [] });
    const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);
    const [emailStatusToast, setEmailStatusToast] = useState(null);
    const [googleStatus, setGoogleStatus] = useState({ connected: false, google_email: null });
    const [isCheckingGoogle, setIsCheckingGoogle] = useState(false);

    const DEPARTMENTS = [
        'Engineer', 'Tekong', 'Pest Control', 'Security', 'Fasilitas', 
        'HK', 'F&B', 'Service', 'Bar', 'GR', 'Spa', 'TiRek', 'OE', 
        'IT', 'Procurement', 'Sales/Marketing', 'Reservasi', 'Finance'
    ];
    
    // Store logo in ref to avoid re-fetching
    const logoImgRef = useRef(null);

    // Initialize all categories as selected when modal opens or categories load
    useEffect(() => {
        if (categories.length > 0 && selectedCategories.length === 0) {
            setSelectedCategories(categories.map(c => c.id));
        }
        if (selectedDepartments.length === 0) {
            setSelectedDepartments([...DEPARTMENTS]);
        }
        if (open && selectedSheets.length === 0 && currentSheet) {
            setSelectedSheets([currentSheet]);
            setDownloadedIssues(prev => ({ ...prev, [currentSheet]: issues }));
        }
    }, [categories, open, currentSheet, issues]);

    // Fetch missing sheets dynamically
    useEffect(() => {
        const fetchMissingSheets = async () => {
            const missing = selectedSheets.filter(s => !downloadedIssues[s]);
            if (missing.length === 0) return;
            
            setIsPreviewLoading(true);
            try {
                const newDownloads = { ...downloadedIssues };
                for (const sheet of missing) {
                    try {
                        const response = await window.axios.get(`/api/issues?sheet=${encodeURIComponent(sheet)}`);
                        if (response.data?.success) {
                            newDownloads[sheet] = response.data.data;
                        }
                    } catch (err) {
                        console.error(`Failed to fetch sheet ${sheet}`, err);
                    }
                }
                setDownloadedIssues(newDownloads);
            } catch (e) {
                console.error("Failed to process missing sheets", e);
            } finally {
                setIsPreviewLoading(false);
            }
        };
        fetchMissingSheets();
    }, [selectedSheets, downloadedIssues]);

    // Preload logo and remove transparent background for jsPDF
    useEffect(() => {
        if (!logoImgRef.current) {
            const img = new window.Image();
            img.src = '/logo.png';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                
                // Fill with solid white to remove transparency shadow bugs in jsPDF
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                
                // Store as JPEG data URL for perfect PDF rendering
                logoImgRef.current = canvas.toDataURL('image/jpeg', 1.0);
            };
        }
    }, []);

    const handleStatusToggle = (status) => {
        setSelectedStatuses(prev => 
            prev.includes(status) 
                ? prev.filter(s => s !== status) 
                : [...prev, status]
        );
    };

    const toggleAllStatuses = () => {
        const ALL = ['open', 'progress', 'pending', 'solved'];
        if (selectedStatuses.length === ALL.length) {
            setSelectedStatuses([]);
        } else {
            setSelectedStatuses(ALL);
        }
    };

    const handleCategoryToggle = (catId) => {
        setSelectedCategories(prev => 
            prev.includes(catId) 
                ? prev.filter(c => c !== catId) 
                : [...prev, catId]
        );
    };

    const toggleAllCategories = () => {
        if (selectedCategories.length === categories.length) {
            setSelectedCategories([]);
        } else {
            setSelectedCategories(categories.map(c => c.id));
        }
    };

    const deptCounts = useMemo(() => {
        let allIssues = [];
        selectedSheets.forEach(sheet => {
            if (downloadedIssues[sheet]) {
                allIssues = allIssues.concat(downloadedIssues[sheet]);
            }
        });
        const counts = {};
        DEPARTMENTS.forEach(d => { counts[d] = 0; });
        allIssues.forEach(i => {
            const assigned = Array.isArray(i.assignedDepartments) ? i.assignedDepartments : [i.assignedDepartments];
            const tagged = Array.isArray(i.taggedDepartments) ? i.taggedDepartments : [i.taggedDepartments];
            const origin = i.department;
            DEPARTMENTS.forEach(d => {
                const normD = normalizeDepartment(d);
                if (
                    normalizeDepartment(origin) === normD ||
                    assigned.some(a => normalizeDepartment(a) === normD) ||
                    tagged.some(t => normalizeDepartment(t) === normD)
                ) {
                    counts[d] = (counts[d] || 0) + 1;
                }
            });
        });
        return counts;
    }, [selectedSheets, downloadedIssues]);

    const handleDepartmentToggle = (dept) => {
        setSelectedDepartments(prev => 
            prev.includes(dept) 
                ? prev.filter(d => d !== dept) 
                : [...prev, dept]
        );
    };

    const toggleAllDepartments = () => {
        if (selectedDepartments.length === DEPARTMENTS.length) {
            setSelectedDepartments([]);
        } else {
            setSelectedDepartments([...DEPARTMENTS]);
        }
    };

    // Centralized filtered issues for both PDF preview/generation and Excel export
    const filteredIssues = useMemo(() => {
        let allSelectedIssues = [];
        selectedSheets.forEach(sheet => {
            if (downloadedIssues[sheet]) {
                const sheetIssues = downloadedIssues[sheet].map(i => ({ ...i, __sheetName: sheet }));
                allSelectedIssues = allSelectedIssues.concat(sheetIssues);
            }
        });

        // Optional inclusion of archived issues for Admin
        if (isAdmin && includeArchived && Array.isArray(archivedIssues)) {
            const relevantArchived = archivedIssues
                .filter(i => selectedSheets.includes(i.sheet || i._sheet || currentSheet))
                .map(i => ({ ...i, __sheetName: i.sheet || i._sheet || currentSheet }));
            allSelectedIssues = allSelectedIssues.concat(relevantArchived);
        }

        let filtered = allSelectedIssues.filter(issue => {
            if (issue.isArchived) {
                // Archived issues explicitly included by Admin via includeArchived
            } else if (issue.status === 'pending') {
                if (!selectedStatuses.includes('pending') && !selectedStatuses.includes('progress')) return false;
            } else {
                const sMap = { 'open': 'open', 'progress': 'progress', 'solved': 'solved' };
                if (!selectedStatuses.includes(sMap[issue.status])) return false;
            }
            if (selectedCategories.length > 0 && issue.category && !selectedCategories.includes(issue.category)) return false;
            
            // Department Scope Filtering
            if (deptFilterMode === 'my_scope' && userDept) {
                const isRelated = normalizeDepartment(issue.department) === userDept ||
                                  (Array.isArray(issue.assignedDepartments) && issue.assignedDepartments.some(d => normalizeDepartment(d) === userDept)) ||
                                  (Array.isArray(issue.taggedDepartments) && issue.taggedDepartments.some(d => normalizeDepartment(d) === userDept));
                if (!isRelated) return false;
            } else if (deptFilterMode === 'to_fix' && userDept) {
                const isAssigned = Array.isArray(issue.assignedDepartments) && issue.assignedDepartments.some(d => normalizeDepartment(d) === userDept);
                if (!isAssigned) return false;
            } else if (deptFilterMode === 'my_reports' && userDept) {
                const isOrigin = normalizeDepartment(issue.department) === userDept;
                if (!isOrigin) return false;
            } else if (deptFilterMode === 'mentions' && userDept) {
                const isTagged = Array.isArray(issue.taggedDepartments) && issue.taggedDepartments.some(d => normalizeDepartment(d) === userDept);
                if (!isTagged) return false;
            } else {
                // All / Custom Depts
                if (selectedDepartments.length > 0 && selectedDepartments.length < DEPARTMENTS.length) {
                    const deptMatch = selectedDepartments.some(d => {
                        const normD = normalizeDepartment(d);
                        return normalizeDepartment(issue.department) === normD || 
                               (Array.isArray(issue.assignedDepartments) && issue.assignedDepartments.some(ad => normalizeDepartment(ad) === normD)) ||
                               (Array.isArray(issue.taggedDepartments) && issue.taggedDepartments.some(td => normalizeDepartment(td) === normD));
                    });
                    if (!deptMatch) return false;
                }
            }
            
            return true;
        });

        filtered.sort((a, b) => (b.reportedAt || 0) - (a.reportedAt || 0));

        if (limit !== 'All') {
            filtered = filtered.slice(0, parseInt(limit));
        }

        return filtered;
    }, [selectedSheets, downloadedIssues, isAdmin, includeArchived, archivedIssues, currentSheet, selectedStatuses, selectedCategories, deptFilterMode, userDept, selectedDepartments, limit]);

    const filteredIssuesCount = filteredIssues.length;

    // KPI Metrics for Excel Sheet 1 & Interactive Preview
    const excelPreviewKpi = useMemo(() => {
        const total = filteredIssues.length;
        const solved = filteredIssues.filter(i => i.status === 'solved').length;
        const pending = filteredIssues.filter(i => i.status === 'pending').length;
        const progress = filteredIssues.filter(i => i.status === 'progress').length;
        const open = filteredIssues.filter(i => i.status === 'open').length;
        const rate = total > 0 ? ((solved / total) * 100).toFixed(1) : '0.0';

        const deptMap = {};
        filteredIssues.forEach(i => {
            const depts = (i.assignedDepartments && i.assignedDepartments.length > 0)
                ? i.assignedDepartments
                : [i.department || 'Other'];
            depts.forEach(d => {
                const name = d || 'Unassigned';
                if (!deptMap[name]) deptMap[name] = { total: 0, solved: 0, pending: 0 };
                deptMap[name].total += 1;
                if (i.status === 'solved') deptMap[name].solved += 1;
                if (i.status === 'pending') deptMap[name].pending += 1;
            });
        });
        const topDepts = Object.entries(deptMap)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 6);

        return { total, solved, pending, progress, open, rate, topDepts };
    }, [filteredIssues]);

    const handleExportExcel = async () => {
        try {
            setIsExportingExcel(true);
            await generateExcelReport(filteredIssues, {
                selectedSheets,
                categories,
                includeKpiSummary,
                includeDelayTimeline,
                includeSolvedNotes,
            });
        } catch (err) {
            console.error('Failed to export Excel report:', err);
            alert(lang === 'id' ? 'Gagal membuat file Excel. Silakan coba lagi.' : 'Failed to generate Excel file. Please try again.');
        } finally {
            setIsExportingExcel(false);
        }
    };

    const buildPdfDocument = () => {
        const filtered = filteredIssues;

        // Generate PDF
        const doc = new jsPDF('landscape');
        
        // Add logo (x, y, width, height)
        if (logoImgRef.current) {
            // The new image has tight bounds, so we render it at a normal size and align it to the left margin.
            doc.addImage(logoImgRef.current, 'JPEG', 10, 17, 40, 40);
        }
        
        // Address block (moved below the logo)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text('PT. Telunas Resort Indonesia', 10, 60);
        doc.text('Pulau Sugi, Sugie, Kec. Moro, Kabupaten Karimun, Kepulauan Riau 29663', 10, 64);
        doc.text('Telunas Resorts Issue Tracking & Resolution Report', 10, 68);

        // Document Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(28, 27, 14); // #1c1b0e (Telunas charcoal)
        const selectedTitle = selectedSheets.length === 1 ? selectedSheets[0] : `Multiple (${selectedSheets.join(', ')})`;
        doc.text(`Issue Tracking Report — Period: ${selectedTitle}`, 10, 74);

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
            return d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
        };

        const cleanDuration = (val) => {
            if (!val || typeof val !== 'string') return '-';
            const formatted = formatDurationLabel(val);
            return formatted.replace(/(\d+\.\d+)/g, (match) => Math.round(parseFloat(match)));
        };

        const sanitizePdfText = (str) => {
            if (!str || typeof str !== 'string') return '';
            return str
                .replace(/[\u2794\u2192\u21D2\u27A1]/g, '->') // arrow symbols to ASCII ->
                .replace(/🎯/g, '[Assign] ')
                .replace(/📢/g, '[Tag] ')
                .replace(/↩️|↩/g, '[ROLLBACK] ')
                .replace(/✏️|✏/g, '[EDIT] ')
                .replace(/✅/g, '[SOLVED] ')
                .replace(/⏳/g, '[PENDING] ')
                .replace(/🔧/g, '[CLAIM] ')
                .replace(/⚠️/g, '[!] ')
                .replace(/[^\x20-\x7E\n\r\t]/g, ''); // strip any non-ASCII characters that corrupt standard PDF fonts
        };

        // Prepare table data
        const tableData = [];
        let currentGroupSheet = null;

        filtered.forEach(i => {
            if (selectedSheets.length > 1 && i.__sheetName !== currentGroupSheet) {
                currentGroupSheet = i.__sheetName;
                tableData.push([
                    {
                        content: `--- Period: ${currentGroupSheet} ---`,
                        colSpan: 12,
                        styles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', cellPadding: 4 }
                    }
                ]);
            }

            const deptLines = [];
            const assigns = Array.isArray(i.assignedDepartments) 
                ? i.assignedDepartments.filter(Boolean) 
                : (i.assignedDepartments ? [i.assignedDepartments] : []);
            const tags = Array.isArray(i.taggedDepartments) 
                ? i.taggedDepartments.filter(Boolean) 
                : (i.taggedDepartments ? [i.taggedDepartments] : []);

            if (assigns.length > 0) {
                deptLines.push(`Assign: ${assigns.join(', ')}`);
            }
            if (tags.length > 0) {
                deptLines.push(`Tag: ${tags.join(', ')}`);
            }
            const combinedDeptTags = sanitizePdfText(deptLines.join('\n\n')) || '-';

            // Format Taken and Solved cell strings cleanly
            let takenCell = '-';
            if (i.takenAt) {
                const takerName = i.taker ? `\n${i.taker.split(' ')[0]}` : '';
                takenCell = i.status === 'pending' ? `${formatDateTime(i.takenAt)}\n[PENDING]` : `${formatDateTime(i.takenAt)}${takerName}`;
            } else if (i.status === 'pending') {
                takenCell = `[PENDING]`;
            }

            let solvedCell = '-';
            if (i.status === 'solved' || i.solvedAt) {
                const solverName = i.solver ? `\n${i.solver.split(' ')[0]}` : '';
                solvedCell = `${formatDateTime(i.solvedAt)}${solverName}`;
            }

            let statusCell = (i.status || 'OPEN').toUpperCase();
            if (i.isArchived) {
                const archiveLog = (i.editLogs || []).slice().reverse().find(l => l && (l.type === 'archive' || String(l.changes).toLowerCase().includes('arsip') || String(l.changes).toLowerCase().includes('archive')));
                const rawArchiveDate = i.archivedAtStr || i.archivedAt || archiveLog?.date;
                const formattedArchivedDate = rawArchiveDate ? formatDateTime(rawArchiveDate) : null;
                statusCell = formattedArchivedDate && formattedArchivedDate !== '-'
                    ? `ARCHIVED\n${formattedArchivedDate}`
                    : 'ARCHIVED';
            }

            tableData.push([
                i.id.replace('TEL-', ''),
                formatDateTime(i.reportedAt),
                takenCell,
                solvedCell,
                cleanDuration(i.durationLabel),
                sanitizePdfText(i.title),
                sanitizePdfText(i.location),
                combinedDeptTags,
                sanitizePdfText(categories.find(c => c.id === i.category)?.label || i.category),
                sanitizePdfText(i.reporter),
                statusCell,
                (i.priority || 'LOW').toUpperCase()
            ]);

            if (includeDelayTimeline && i.status === 'pending' && selectedStatuses.includes('pending')) {
                let timelineText = '';
                if (i.pendingTimeline && i.pendingTimeline.length > 0) {
                    timelineText = i.pendingTimeline.map(item => {
                        return sanitizePdfText(`• ${item.date ? `[${item.date}] ` : ''}${item.by || 'Staff'}: ${item.reason}`);
                    }).join('\n');
                } else if (i.pendingReason) {
                    timelineText = sanitizePdfText(`• Delay Reason: ${i.pendingReason} (Pending by: ${i.pendingBy || 'Unknown'})`);
                }

                if (timelineText) {
                    tableData.push([
                        {
                            content: `Pending Delay Timeline:\n${timelineText}`,
                            colSpan: 12,
                            styles: { fillColor: [255, 247, 237], textColor: [194, 65, 12], fontStyle: 'italic', cellPadding: 3 }
                        }
                    ]);
                }
            }

            // Optional Append Audit & Complete Lifecycle Trail
            if (includeAuditTrail && Array.isArray(i.editLogs) && i.editLogs.length > 0) {
                const editLogText = i.editLogs.map(log => {
                    let logTypeLabel = '[EDIT]';
                    if (log.type === 'revert_status' || log.type === 'revert_and_edit') {
                        logTypeLabel = '[ROLLBACK]';
                    } else if (log.type === 'claim') {
                        logTypeLabel = '[CLAIM]';
                    } else if (log.type === 'solve') {
                        logTypeLabel = '[SOLVED]';
                    } else if (log.type === 'pending') {
                        logTypeLabel = '[PENDING]';
                    } else if (log.type === 'archive') {
                        logTypeLabel = '[ARCHIVE]';
                    } else if (log.type === 'restore') {
                        logTypeLabel = '[RESTORE]';
                    }

                    const timeStr = includeAuditTime && log.date ? `[${log.date}] ` : '';
                    const personStr = includeAuditPerson ? `${log.by || 'Staff'}${log.dept ? ` (${log.dept})` : ''}: ` : '';
                    const statusChangeStr = log.statusChange ? `[${log.statusChange.replace(/[\u2794\u2192]/g, '->')}] ` : '';
                    const cleanChanges = (log.changes || '').replace(/[\u2794\u2192]/g, '->');
                    const reasonStr = includeAuditReason && log.reason ? ` (Reason: "${log.reason}")` : '';

                    return sanitizePdfText(`• ${logTypeLabel} ${timeStr}${personStr}${statusChangeStr}${cleanChanges}${reasonStr}`);
                }).join('\n');

                if (editLogText) {
                    tableData.push([
                        {
                            content: `Audit & Complete Lifecycle Trail:\n${editLogText}`,
                            colSpan: 12,
                            styles: { fillColor: [240, 249, 255], textColor: [3, 105, 161], fontStyle: 'italic', cellPadding: 3 }
                        }
                    ]);
                }
            }
        });

        if (tableData.length === 0) {
            tableData.push([
                {
                    content: 'No records found matching the selected filter criteria.',
                    colSpan: 12,
                    styles: { halign: 'center', textColor: [120, 120, 120], fontStyle: 'italic', cellPadding: 8 }
                }
            ]);
        }

        autoTable(doc, {
            startY: 78,
            margin: { left: 10, right: 10, bottom: 25 },
            head: [['ID', 'Submitted', 'Taken', 'Solved', 'Time Solve', 'Problem', 'Location', 'Dept / Tags', 'Category', 'Reporter', 'Status', 'Priority']],
            body: tableData,
            theme: 'grid',
            styles: { 
                font: 'helvetica', 
                fontSize: 7.5, 
                cellPadding: 2.5,
            },
            headStyles: { 
                fillColor: [227, 209, 170], // Telunas tan/gold
                textColor: [28, 27, 14],
                fontStyle: 'bold',
                lineColor: [200, 180, 150],
                lineWidth: 0.1
            },
            alternateRowStyles: { 
                fillColor: [250, 248, 242] 
            },
            columnStyles: {
                0: { cellWidth: 22 }, // ID
                1: { cellWidth: 20 }, // Submitted
                2: { cellWidth: 18 }, // Taken
                3: { cellWidth: 18 }, // Solved
                4: { cellWidth: 16 }, // Duration
                5: { cellWidth: 40 }, // Problem
                6: { cellWidth: 20 }, // Location
                7: { cellWidth: 32 }, // Dept / Tags
                8: { cellWidth: 20 }, // Category
                9: { cellWidth: 22 }, // Reporter
                10: { cellWidth: 22, fontStyle: 'bold' }, // Status
                11: { cellWidth: 20, fontStyle: 'bold' }, // Priority
            },
            didParseCell: function(data) {
                // Color code Priority column (Index 11)
                if (data.section === 'body' && data.column.index === 11) {
                    if (data.cell.raw === 'CRITICAL') {
                        data.cell.styles.textColor = [220, 38, 38]; // Red
                    } else if (data.cell.raw === 'HIGH') {
                        data.cell.styles.textColor = [234, 88, 12]; // Orange
                    }
                }
                // Color code Taken column (Index 2)
                if (data.section === 'body' && data.column.index === 2) {
                    if (data.cell.raw && data.cell.raw.includes('PENDING')) {
                        data.cell.styles.textColor = [234, 88, 12]; // Orange
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
                // Color code Status column (Index 10)
                if (data.section === 'body' && data.column.index === 10) {
                    const rawStatus = String(data.cell.raw || '');
                    if (rawStatus.startsWith('ARCHIVED')) {
                        data.cell.styles.textColor = [190, 24, 93]; // Rose-700
                        data.cell.styles.fontSize = 6.5; // Compact font for ARCHIVED and timestamp
                    } else if (rawStatus === 'SOLVED') {
                        data.cell.styles.textColor = [22, 163, 74]; // Green
                    } else if (rawStatus === 'PROGRESS') {
                        data.cell.styles.textColor = [37, 99, 235]; // Blue
                    } else if (rawStatus === 'PENDING') {
                        data.cell.styles.textColor = [234, 88, 12]; // Orange
                    } else {
                        data.cell.styles.textColor = [220, 38, 38]; // Red (Open)
                    }
                }
            },
                didDrawPage: function (data) {
                const pageSize = doc.internal.pageSize;
                const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
                const pageWidth = pageSize.width ? pageSize.width : pageSize.getWidth();
                
                // Footer Left: Date and Time
                const str = `Downloaded on: ${new Date().toLocaleString()}`;
                doc.setFontSize(8);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(150, 150, 150);
                doc.text(str, data.settings.margin.left, pageHeight - 10);
                
                // Footer Right: Report Title and Total Records
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(100, 100, 100);
                
                const selectedTitle = selectedSheets.length > 0 ? selectedSheets.join(', ') : 'All';
                const titleText = `Official Issue Report (${selectedTitle})`;
                const totalText = `Total Records: ${filtered.length}`;
                
                const titleWidth = doc.getTextWidth(titleText);
                const totalWidth = doc.getTextWidth(totalText);
                
                doc.text(titleText, pageWidth - data.settings.margin.right - titleWidth, pageHeight - 13);
                
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.text(totalText, pageWidth - data.settings.margin.right - totalWidth, pageHeight - 8);
            }
        });

        return doc;
    };

    const [initialRenderComplete, setInitialRenderComplete] = useState(false);

    // Reset initial render state when modal closes, and trigger it when modal opens
    useEffect(() => {
        if (!open) {
            setInitialRenderComplete(false);
            return;
        }
        if (open && !initialRenderComplete) {
            setInitialRenderComplete(true);
        }
    }, [open, initialRenderComplete]);

    // Update live preview only when filters change or initial render triggers
    useEffect(() => {
        if (!open || !initialRenderComplete || exportFormat !== 'pdf') return;
        
        setIsPreviewLoading(true);
        const debounce = setTimeout(() => {
            try {
                const doc = buildPdfDocument();
                // Revoke old URL to prevent memory leaks
                if (previewUrl) {
                    URL.revokeObjectURL(previewUrl);
                }
                const blob = doc.output('blob');
                const url = URL.createObjectURL(blob);
                setPreviewUrl(url);
            } catch (err) {
                console.error("Preview generation failed", err);
            } finally {
                setIsPreviewLoading(false);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(debounce);
    }, [limit, selectedStatuses, selectedCategories, selectedDepartments, deptFilterMode, selectedSheets, downloadedIssues, initialRenderComplete, open, exportFormat, includeAuditTrail, includeAuditTime, includeAuditPerson, includeAuditReason, includeDelayTimeline, includeArchived]);

    const handleDownload = () => {
        setIsExporting(true);
        try {
            const doc = buildPdfDocument();
            doc.save(`Telunas_Report_${new Date().toISOString().split('T')[0]}.pdf`);
            onOpenChange(false);
        } catch (err) {
            console.error('PDF Generation Failed', err);
            alert('Failed to generate PDF. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleOpenEmailModal = async () => {
        setIsEmailModalOpen(true);
        setEmailStatusToast(null);

        const scopeLabels = {
            'all': 'All Scope',
            'my_scope': `My Scope (${auth?.user?.department || 'You'})`,
            'to_fix': 'To Fix',
            'my_reports': 'My Reports',
            'mentions': 'Mentions',
        };
        const scopeStr = scopeLabels[deptFilterMode] || 'General Scope';
        const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        setEmailSubject(`[Telunas CampusFix] Issue Report - ${scopeStr} (${dateStr})`);

        if (!availableRecipients.users || availableRecipients.users.length === 0) {
            setIsLoadingRecipients(true);
            try {
                const res = await axios.get('/api/export/recipients');
                if (res.data?.success) {
                    setAvailableRecipients(res.data);
                }
            } catch (err) {
                console.error('Failed to load recipients list', err);
            } finally {
                setIsLoadingRecipients(false);
            }
        }

        // Fetch Google OAuth connection status
        setIsCheckingGoogle(true);
        try {
            const res = await axios.get('/api/google/status');
            if (res.data?.success) {
                setGoogleStatus(res.data);
            }
        } catch (err) {
            console.error('Failed to check Google status', err);
        } finally {
            setIsCheckingGoogle(false);
        }
    };

    const handleDisconnectGoogle = async () => {
        try {
            const res = await axios.post('/auth/google/disconnect');
            if (res.data?.success) {
                setGoogleStatus({ connected: false, google_email: null });
            }
        } catch (err) {
            console.error('Failed to disconnect Google account', err);
        }
    };

    const toggleRecipientEmail = (email) => {
        if (!email) return;
        const lower = email.toLowerCase().trim();
        setEmailRecipients(prev => 
            prev.includes(lower) 
                ? prev.filter(e => e !== lower)
                : [...prev, lower]
        );
    };

    const toggleAllHods = () => {
        const hodEmails = (availableRecipients.hods || [])
            .map(h => (h.email || '').toLowerCase().trim())
            .filter(Boolean);
        if (hodEmails.length === 0) return;

        const allSelected = hodEmails.every(e => emailRecipients.includes(e));
        if (allSelected) {
            setEmailRecipients(prev => prev.filter(e => !hodEmails.includes(e)));
        } else {
            setEmailRecipients(prev => Array.from(new Set([...prev, ...hodEmails])));
        }
    };

    const toggleDepartmentRecipients = (dept) => {
        const deptUsers = (availableRecipients.by_department?.[dept] || [])
            .map(u => (u.email || '').toLowerCase().trim())
            .filter(Boolean);
        if (deptUsers.length === 0) return;

        const allSelected = deptUsers.every(e => emailRecipients.includes(e));
        if (allSelected) {
            setEmailRecipients(prev => prev.filter(e => !deptUsers.includes(e)));
        } else {
            setEmailRecipients(prev => Array.from(new Set([...prev, ...deptUsers])));
        }
    };

    const handleAddCustomEmail = (e) => {
        if (e) e.preventDefault();
        const trimmed = recipientInput.trim().toLowerCase();
        if (!trimmed) return;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmed)) {
            setEmailStatusToast({
                type: 'error',
                message: lang === 'id' ? 'Format email tidak valid: ' + trimmed : 'Invalid email format: ' + trimmed,
            });
            return;
        }

        if (!emailRecipients.includes(trimmed)) {
            setEmailRecipients(prev => [...prev, trimmed]);
        }
        setRecipientInput('');
        setEmailStatusToast(null);
    };

    const handleRemoveRecipient = (email) => {
        setEmailRecipients(prev => prev.filter(e => e !== email));
    };

    const handleSendEmail = async () => {
        if (emailRecipients.length === 0) {
            setEmailStatusToast({
                type: 'error',
                message: t('no_recipients_selected') || 'Please select or add at least one recipient email.',
            });
            return;
        }

        setIsSendingEmail(true);
        setEmailStatusToast(null);

        try {
            const doc = buildPdfDocument();
            const pdfBlob = doc.output('blob');
            const pdfFilename = `Telunas_Report_${new Date().toISOString().split('T')[0]}.pdf`;

            const formData = new FormData();
            formData.append('pdf_file', pdfBlob, pdfFilename);
            formData.append('recipients', JSON.stringify(emailRecipients));
            formData.append('subject', emailSubject || 'Telunas Issue Report');
            formData.append('message', emailMessage || '');
            formData.append('meta', JSON.stringify({
                scope: deptFilterMode,
                sheets: selectedSheets,
                total_issues: filteredIssuesCount,
            }));

            const res = await axios.post('/api/export/email-pdf', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            if (res.data?.success) {
                setEmailStatusToast({
                    type: 'success',
                    message: res.data.message || (t('email_sent_success') || 'Report successfully sent via email!'),
                });
            } else {
                setEmailStatusToast({
                    type: 'error',
                    message: res.data?.message || (t('email_send_failed') || 'Failed to send email.'),
                });
            }
        } catch (err) {
            console.error('Email dispatch error', err);
            const serverMsg = err.response?.data?.message || err.message;
            setEmailStatusToast({
                type: 'error',
                message: serverMsg || (t('email_send_failed') || 'Failed to send email.'),
            });
        } finally {
            setIsSendingEmail(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!isExporting) onOpenChange(o); }}>
            <DialogContent className="max-h-[100dvh] overflow-hidden flex flex-col w-full sm:max-w-6xl h-[100dvh] sm:h-[85vh] sm:max-h-[95vh] rounded-none sm:rounded-2xl">
                <DialogHeader className="shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <DialogTitle className="flex items-center gap-2 text-xl">
                                {exportFormat === 'excel' ? (
                                    <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
                                ) : (
                                    <FileText className="h-5 w-5 text-primary" />
                                )}
                                {t('export_report') || 'Export Issue Report'}
                            </DialogTitle>
                            <DialogDescription>
                                {exportFormat === 'pdf'
                                    ? (lang === 'id' ? 'Sesuaikan filter di sebelah kiri dan pratinjau langsung laporan PDF di sebelah kanan.' : 'Configure the filters on the left and instantly preview your PDF report on the right.')
                                    : (lang === 'id' ? 'Sesuaikan filter di sebelah kiri dan unduh spreadsheet Excel (.xlsx) rapi dengan 2 sheet.' : 'Configure filters on the left and download a 2-sheet styled Excel (.xlsx) report.')
                                }
                            </DialogDescription>
                        </div>

                        {/* Format Switcher: PDF vs Excel */}
                        <div className="flex items-center bg-[#1C1B0E] p-1 rounded-xl border border-[#3B3929] self-start sm:self-auto shrink-0 shadow-sm">
                            <button
                                type="button"
                                onClick={() => setExportFormat('pdf')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    exportFormat === 'pdf'
                                        ? 'bg-[#C9AA71] text-[#1C1B0E] shadow'
                                        : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                                }`}
                            >
                                <FileText className="w-3.5 h-3.5" />
                                <span>{t('export_format_pdf') || 'Dokumen PDF'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setExportFormat('excel')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    exportFormat === 'excel'
                                        ? 'bg-emerald-600 text-white shadow'
                                        : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                                }`}
                            >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                <span>{t('export_format_excel') || 'Spreadsheet Excel'}</span>
                            </button>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col gap-4 py-4 overflow-y-auto md:grid md:grid-cols-[340px_1fr] md:overflow-hidden">

                    {/* LEFT COLUMN: Controls */}
                    <div className="flex flex-col gap-5 md:overflow-y-auto pr-2">
                        {/* Row Limit */}
                        <div className="grid gap-2">
                            <label className="text-sm font-semibold">Row Limit</label>
                            <Select value={limit.toString()} onValueChange={setLimit}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select limit" />
                                </SelectTrigger>
                                <SelectContent className="max-h-64">
                                    {LIMITS.map(l => (
                                        <SelectItem key={l} value={l.toString()}>
                                            {l === 'All' ? 'Export All Records' : `First ${l} Records`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Periods — pill buttons */}
                        {availableSheets.length > 0 && (
                            <div className="grid gap-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-semibold">Include Periods</label>
                                    <button type="button" onClick={() => {
                                        if (selectedSheets.length === availableSheets.length) setSelectedSheets([]);
                                        else setSelectedSheets([...availableSheets]);
                                    }} className="text-xs text-primary hover:underline">Toggle All</button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {availableSheets.map(sheet => (
                                        <button
                                            key={sheet}
                                            type="button"
                                            onClick={() => {
                                                setSelectedSheets(prev =>
                                                    prev.includes(sheet) ? prev.filter(s => s !== sheet) : [...prev, sheet]
                                                );
                                            }}
                                            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                                                selectedSheets.includes(sheet)
                                                    ? 'bg-primary text-primary-foreground border-primary'
                                                    : 'bg-surface text-muted-foreground border-border hover:border-primary/50'
                                            }`}
                                        >
                                            {sheet}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Statuses — pill buttons */}
                        <div className="grid gap-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-semibold">Include Statuses</label>
                                <button type="button" onClick={toggleAllStatuses} className="text-xs text-primary hover:underline">Toggle All</button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { id: 'open',     label: 'Open' },
                                    { id: 'progress', label: 'In Progress' },
                                    { id: 'pending',  label: 'Pending' },
                                    { id: 'solved',   label: 'Solved' },
                                ].map(status => (
                                    <button
                                        key={status.id}
                                        type="button"
                                        onClick={() => handleStatusToggle(status.id)}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                                            selectedStatuses.includes(status.id)
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-surface text-muted-foreground border-border hover:border-primary/50'
                                        }`}
                                    >
                                        {status.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Categories — collapsible pill section */}
                        <CollapsibleSection
                            label="Include Categories"
                            toggleLabel="Toggle All"
                            onToggleAll={toggleAllCategories}
                            defaultOpen={true}
                        >
                            <div className="flex flex-wrap gap-2">
                                {categories.map(cat => (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => handleCategoryToggle(cat.id)}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                                            selectedCategories.includes(cat.id)
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-surface text-muted-foreground border-border hover:border-primary/50'
                                        }`}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>
                        </CollapsibleSection>

                        {/* Departments — with Scope Presets & Active counts */}
                        <CollapsibleSection
                            label="Department Scope & Filters"
                            toggleLabel="Toggle All"
                            onToggleAll={toggleAllDepartments}
                            defaultOpen={true}
                        >
                            {/* Quick Scope Presets */}
                            {userDept && (
                                <div className="flex flex-wrap gap-1.5 pb-1">
                                    <button
                                        type="button"
                                        onClick={() => { setDeptFilterMode('all'); setSelectedDepartments([...DEPARTMENTS]); }}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 ${
                                            deptFilterMode === 'all'
                                                ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] shadow-sm'
                                                : 'bg-[#2A281E] text-muted-foreground border-[#3B3929] hover:text-foreground'
                                        }`}
                                    >
                                        <Globe className="w-3 h-3" />
                                        <span>All Scope</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDeptFilterMode('my_scope')}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 ${
                                            deptFilterMode === 'my_scope'
                                                ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] shadow-sm'
                                                : 'bg-[#2A281E] text-muted-foreground border-[#3B3929] hover:text-foreground'
                                        }`}
                                    >
                                        <Layers className="w-3 h-3 text-amber-400" />
                                        <span>My Scope ({auth?.user?.department || 'You'})</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDeptFilterMode('to_fix')}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 ${
                                            deptFilterMode === 'to_fix'
                                                ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] shadow-sm'
                                                : 'bg-[#2A281E] text-muted-foreground border-[#3B3929] hover:text-foreground'
                                        }`}
                                    >
                                        <Wrench className="w-3 h-3 text-blue-400" />
                                        <span>To Fix</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDeptFilterMode('my_reports')}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 ${
                                            deptFilterMode === 'my_reports'
                                                ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] shadow-sm'
                                                : 'bg-[#2A281E] text-muted-foreground border-[#3B3929] hover:text-foreground'
                                        }`}
                                    >
                                        <Send className="w-3 h-3 text-purple-400" />
                                        <span>My Reports</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDeptFilterMode('mentions')}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 ${
                                            deptFilterMode === 'mentions'
                                                ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] shadow-sm'
                                                : 'bg-[#2A281E] text-muted-foreground border-[#3B3929] hover:text-foreground'
                                        }`}
                                    >
                                        <AtSign className="w-3 h-3 text-pink-400" />
                                        <span>Mentions</span>
                                    </button>
                                </div>
                            )}

                            {/* Individual Department Pills with live counts */}
                            <div className="flex flex-wrap gap-1.5 pt-1 pb-2">
                                {DEPARTMENTS.map(dept => {
                                    const count = deptCounts[dept] || 0;
                                    const isUser = normalizeDepartment(dept) === userDept;
                                    const isSelected = deptFilterMode === 'all' && selectedDepartments.includes(dept);

                                    return (
                                        <button
                                            key={dept}
                                            type="button"
                                            onClick={() => {
                                                setDeptFilterMode('all');
                                                handleDepartmentToggle(dept);
                                            }}
                                            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 ${
                                                isSelected
                                                    ? 'bg-primary text-primary-foreground border-primary'
                                                    : 'bg-surface text-muted-foreground border-border hover:border-primary/50'
                                            } ${count === 0 ? 'opacity-40' : ''}`}
                                        >
                                            <span>{dept}</span>
                                            {isUser && <span className="text-[9px] px-1 py-0.2 rounded bg-amber-400/20 text-amber-300 font-bold">YOU</span>}
                                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-black/30 text-white' : 'bg-muted text-muted-foreground'}`}>
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </CollapsibleSection>

                        {/* Appendices / Detail Options */}
                        <div className="grid gap-2.5 p-3 rounded-xl bg-[#2A281E] border border-[#3B3929]">
                            <label className="text-xs font-bold text-[#C9AA71] uppercase tracking-wider">
                                {exportFormat === 'excel' ? 'Opsi Ekspor Spreadsheet Excel' : 'Table Appendices (Optional)'}
                            </label>
                            
                            {exportFormat === 'excel' ? (
                                <div className="flex flex-col gap-2.5 text-xs text-foreground">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={includeKpiSummary}
                                            onChange={(e) => setIncludeKpiSummary(e.target.checked)}
                                            className="rounded text-emerald-500 focus:ring-emerald-500 h-4 w-4 bg-[#1C1B0E] border-[#3B3929]"
                                        />
                                        <span className="font-semibold text-[#FAFAFA]">Sertakan Tab Ringkasan KPI (Sheet 1)</span>
                                    </label>
                                    <span className="text-[11px] text-[#A19F8D] -mt-1.5 pl-6">
                                        Membuat sheet ringkasan metriks status & performa per departemen.
                                    </span>

                                    <label className="flex items-center gap-2 cursor-pointer select-none pt-2 border-t border-[#3B3929]/50">
                                        <input
                                            type="checkbox"
                                            checked={includeSolvedNotes}
                                            onChange={(e) => setIncludeSolvedNotes(e.target.checked)}
                                            className="rounded text-emerald-500 focus:ring-emerald-500 h-4 w-4 bg-[#1C1B0E] border-[#3B3929]"
                                        />
                                        <span>Sertakan Kolom Catatan Penyelesaian (Solved Notes)</span>
                                    </label>

                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={includeDelayTimeline}
                                            onChange={(e) => setIncludeDelayTimeline(e.target.checked)}
                                            className="rounded text-emerald-500 focus:ring-emerald-500 h-4 w-4 bg-[#1C1B0E] border-[#3B3929]"
                                        />
                                        <span>Sertakan Kolom Alasan Pending & Timeline Tertunda</span>
                                    </label>

                                    {isAdmin && (
                                        <label className="flex items-center gap-2 text-rose-300/90 font-medium cursor-pointer select-none pt-2 border-t border-[#3B3929]/50">
                                            <input
                                                type="checkbox"
                                                checked={includeArchived}
                                                onChange={(e) => setIncludeArchived(e.target.checked)}
                                                className="rounded text-rose-500 focus:ring-rose-500 h-4 w-4 bg-[#1C1B0E] border-[#3B3929]"
                                            />
                                            <span>Sertakan Isu Terarsip ({archivedIssues?.length || 0})</span>
                                        </label>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2.5">
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-xs text-foreground font-semibold cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={includeAuditTrail}
                                                onChange={(e) => setIncludeAuditTrail(e.target.checked)}
                                                className="rounded text-[#C9AA71] focus:ring-[#C9AA71] h-4 w-4 bg-[#1C1B0E] border-[#3B3929]"
                                            />
                                            <span>Include Audit & Reversion Trail</span>
                                        </label>

                                        {/* Granular Sub-options for Audit Trail */}
                                        {includeAuditTrail && (
                                            <div className="pl-6 space-y-1.5 border-l-2 border-[#C9AA71]/40 ml-2 py-1 text-[11px] text-muted-foreground">
                                                <label className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                                                    <input
                                                        type="checkbox"
                                                        checked={includeAuditTime}
                                                        onChange={(e) => setIncludeAuditTime(e.target.checked)}
                                                        className="rounded text-[#C9AA71] h-3.5 w-3.5 bg-[#1C1B0E] border-[#3B3929]"
                                                    />
                                                    <span>Include Date & Time</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                                                    <input
                                                        type="checkbox"
                                                        checked={includeAuditPerson}
                                                        onChange={(e) => setIncludeAuditPerson(e.target.checked)}
                                                        className="rounded text-[#C9AA71] h-3.5 w-3.5 bg-[#1C1B0E] border-[#3B3929]"
                                                    />
                                                    <span>Include Staff & Department</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                                                    <input
                                                        type="checkbox"
                                                        checked={includeAuditReason}
                                                        onChange={(e) => setIncludeAuditReason(e.target.checked)}
                                                        className="rounded text-[#C9AA71] h-3.5 w-3.5 bg-[#1C1B0E] border-[#3B3929]"
                                                    />
                                                    <span>Include Reason / Note</span>
                                                </label>
                                            </div>
                                        )}
                                    </div>

                                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none pt-1 border-t border-[#3B3929]/50">
                                        <input
                                            type="checkbox"
                                            checked={includeDelayTimeline}
                                            onChange={(e) => setIncludeDelayTimeline(e.target.checked)}
                                            className="rounded text-[#C9AA71] focus:ring-[#C9AA71] h-4 w-4 bg-[#1C1B0E] border-[#3B3929]"
                                        />
                                        <span>Include Pending Delay Timeline</span>
                                    </label>

                                    {isAdmin && (
                                        <label className="flex items-center gap-2 text-xs text-rose-300/90 font-medium cursor-pointer select-none pt-1 border-t border-[#3B3929]/50">
                                            <input
                                                type="checkbox"
                                                checked={includeArchived}
                                                onChange={(e) => setIncludeArchived(e.target.checked)}
                                                className="rounded text-rose-500 focus:ring-rose-500 h-4 w-4 bg-[#1C1B0E] border-[#3B3929]"
                                            />
                                            <span>Include Archived Issues ({archivedIssues?.length || 0})</span>
                                        </label>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Live Preview */}
                    {exportFormat === 'excel' ? (
                        <div className="flex flex-col bg-[#1C1B0E]/90 border border-[#3B3929] rounded-xl overflow-hidden p-4 relative min-h-[350px] md:min-h-0">
                            {/* Top Header of Excel Workbook Preview */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#3B3929] shrink-0">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                                        <FileSpreadsheet className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-[#FAFAFA] flex items-center gap-1.5 flex-wrap">
                                            <span>Telunas_Issues_Report_{selectedSheets.join('_')}.xlsx</span>
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-semibold">XLSX</span>
                                        </div>
                                        <div className="text-[11px] text-[#A19F8D]">
                                            {includeKpiSummary ? '2 Sheet: Ringkasan KPI + Data Tiket' : '1 Sheet: Data Tiket'} • {filteredIssuesCount} Tiket Terfilter
                                        </div>
                                    </div>
                                </div>

                                {/* Tab Preview Switcher */}
                                <div className="flex items-center gap-1 bg-[#2A281E] p-1 rounded-lg border border-[#3B3929] self-start sm:self-auto text-xs shrink-0">
                                    {includeKpiSummary && (
                                        <button
                                            type="button"
                                            onClick={() => setExcelActiveTabPreview('kpi')}
                                            className={`px-2.5 py-1 rounded font-semibold transition-all ${
                                                excelActiveTabPreview === 'kpi'
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm'
                                                    : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                                            }`}
                                        >
                                            Tab 1: Ringkasan KPI
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setExcelActiveTabPreview('raw')}
                                        className={`px-2.5 py-1 rounded font-semibold transition-all ${
                                            excelActiveTabPreview === 'raw' || !includeKpiSummary
                                                ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm'
                                                : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                                        }`}
                                    >
                                        Tab 2: Data Tiket ({filteredIssuesCount})
                                    </button>
                                </div>
                            </div>

                            {/* Tab Content Preview */}
                            <div className="flex-1 overflow-y-auto mt-3 pr-1">
                                {excelActiveTabPreview === 'kpi' && includeKpiSummary ? (
                                    <div className="space-y-4">
                                        {/* Banner Mini Sheet */}
                                        <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#2A281E] to-[#1C1B0E] border border-[#C9AA71]/30">
                                            <div className="text-xs font-bold text-[#C9AA71] tracking-wider uppercase">Pratinjau Lembar Ringkasan KPI (Sheet 1)</div>
                                            <div className="text-[11px] text-[#A19F8D] mt-0.5">
                                                Sheet pertama berisi header resmi Telunas Resorts, rekapitulasi status, serta breakdown performa tiap departemen.
                                            </div>
                                        </div>

                                        {/* KPI Cards Grid */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                            <div className="p-3 rounded-xl bg-[#2A281E]/80 border border-[#3B3929]">
                                                <div className="text-[10px] uppercase font-bold text-[#A19F8D]">Total Tiket</div>
                                                <div className="text-xl font-black text-[#FAFAFA] mt-1">{excelPreviewKpi.total}</div>
                                                <div className="text-[10px] text-[#A19F8D] mt-0.5">Semua data terfilter</div>
                                            </div>
                                            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/40">
                                                <div className="text-[10px] uppercase font-bold text-emerald-400">Selesai (Solved)</div>
                                                <div className="text-xl font-black text-emerald-300 mt-1">{excelPreviewKpi.solved}</div>
                                                <div className="text-[10px] text-emerald-400/80 mt-0.5">{excelPreviewKpi.rate}% rasio</div>
                                            </div>
                                            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/40">
                                                <div className="text-[10px] uppercase font-bold text-amber-400">Tertunda (Pending)</div>
                                                <div className="text-xl font-black text-amber-300 mt-1">{excelPreviewKpi.pending}</div>
                                                <div className="text-[10px] text-amber-400/80 mt-0.5">Menunggu part/akses</div>
                                            </div>
                                            <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-800/40">
                                                <div className="text-[10px] uppercase font-bold text-blue-400">Dalam Pengerjaan</div>
                                                <div className="text-xl font-black text-blue-300 mt-1">{excelPreviewKpi.progress}</div>
                                                <div className="text-[10px] text-blue-400/80 mt-0.5">Progress aktif</div>
                                            </div>
                                        </div>

                                        {/* Top Departments Mini Table */}
                                        <div className="rounded-xl border border-[#3B3929] overflow-hidden bg-[#2A281E]/50">
                                            <div className="px-3 py-2 bg-[#E3D1AA] text-[#1C1B0E] font-bold text-xs flex items-center justify-between">
                                                <span>Breakdown Departemen Penanggung Jawab</span>
                                                <span className="text-[10px] font-mono font-semibold">Sheet 1: Ringkasan KPI</span>
                                            </div>
                                            <div className="divide-y divide-[#3B3929]">
                                                {excelPreviewKpi.topDepts.length > 0 ? (
                                                    excelPreviewKpi.topDepts.map(([dName, stat]) => (
                                                        <div key={dName} className="px-3 py-2 text-xs flex items-center justify-between text-[#FAFAFA]">
                                                            <span className="font-medium">{dName}</span>
                                                            <div className="flex items-center gap-3 text-[11px] font-mono">
                                                                <span className="text-[#A19F8D]">{stat.total} tiket</span>
                                                                <span className="text-emerald-400 font-semibold">{stat.solved} selesai</span>
                                                                {stat.pending > 0 && <span className="text-amber-400">{stat.pending} pending</span>}
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="p-4 text-center text-xs text-[#A19F8D]">Tidak ada data tiket sesuai filter.</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* Raw Tickets Table Preview */
                                    <div className="space-y-3">
                                        <div className="rounded-xl border border-[#3B3929] overflow-x-auto bg-[#1C1B0E]">
                                            <table className="w-full text-left text-xs text-[#FAFAFA]">
                                                <thead>
                                                    <tr className="bg-[#E3D1AA] text-[#1C1B0E] font-bold border-b border-[#C9AA71]">
                                                        <th className="px-3 py-2 whitespace-nowrap">ID Tiket</th>
                                                        <th className="px-3 py-2 whitespace-nowrap">Waktu</th>
                                                        <th className="px-3 py-2 whitespace-nowrap">Lokasi</th>
                                                        <th className="px-3 py-2 min-w-[180px]">Judul Masalah</th>
                                                        <th className="px-3 py-2 whitespace-nowrap">Departemen</th>
                                                        <th className="px-3 py-2 whitespace-nowrap">Status</th>
                                                        <th className="px-3 py-2 whitespace-nowrap">Pelapor</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[#3B3929]/60">
                                                    {filteredIssues.slice(0, 6).map((item) => (
                                                        <tr key={item.id} className="hover:bg-white/[0.03] transition-colors">
                                                            <td className="px-3 py-2 font-mono text-[11px] text-[#C9AA71] font-bold whitespace-nowrap">
                                                                {String(item.id || '').replace(/^TEL-/, 'TEL-')}
                                                            </td>
                                                            <td className="px-3 py-2 text-[11px] text-[#A19F8D] whitespace-nowrap">
                                                                {item.reportedAt ? new Date(item.reportedAt).toLocaleDateString('id-ID') : '-'}
                                                            </td>
                                                            <td className="px-3 py-2 text-[11px] font-medium whitespace-nowrap">
                                                                {item.location || '-'}
                                                            </td>
                                                            <td className="px-3 py-2 text-[11px] max-w-xs truncate">
                                                                {item.title || item.description || '-'}
                                                            </td>
                                                            <td className="px-3 py-2 text-[11px] text-[#A19F8D] whitespace-nowrap">
                                                                {item.department || (item.assignedDepartments || [])[0] || '-'}
                                                            </td>
                                                            <td className="px-3 py-2 whitespace-nowrap">
                                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                                    item.status === 'solved'
                                                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                                        : item.status === 'pending'
                                                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                                        : item.status === 'progress'
                                                                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                                                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                                                }`}>
                                                                    {item.status || 'OPEN'}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-[11px] text-[#A19F8D] whitespace-nowrap">
                                                                {item.reporter || '-'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="text-[11px] text-[#A19F8D] italic text-center py-1">
                                            Menampilkan cuplikan 6 dari {filteredIssuesCount} baris. File spreadsheet .xlsx lengkap mencakup 18 kolom data mentah, auto-filter di setiap kolom, freeze header, dan pewarnaan status otomatis.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col bg-muted/30 border rounded-lg overflow-hidden relative min-h-[300px] md:min-h-0">
                            {isPreviewLoading && (
                                <div className="absolute inset-0 z-10 bg-background/50 backdrop-blur-sm flex items-center justify-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                </div>
                            )}
                            {previewUrl ? (
                                <iframe 
                                    src={`${previewUrl}#toolbar=0`} 
                                    className="w-full h-full border-0 bg-white"
                                    title="PDF Preview"
                                />
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                                    Loading preview...
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="shrink-0 mt-2 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isExporting || isSendingEmail || isExportingExcel}
                        className="w-full sm:w-auto"
                    >
                        {t('cancel') || 'Cancel'}
                    </Button>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        {exportFormat === 'excel' ? (
                            <Button
                                type="button"
                                onClick={handleExportExcel}
                                disabled={isExportingExcel || filteredIssuesCount === 0}
                                className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-md active:scale-95 flex-1 sm:flex-initial"
                            >
                                {isExportingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                                {isExportingExcel ? (t('generating_excel') || 'Membuat Excel...') : (t('download_excel') || 'Unduh Excel (.xlsx)')}
                            </Button>
                        ) : (
                            <>
                                <Button
                                    type="button"
                                    onClick={handleOpenEmailModal}
                                    disabled={isExporting || isSendingEmail || selectedStatuses.length === 0 || selectedCategories.length === 0}
                                    className="gap-2 bg-[#2A281E] border border-[#C9AA71]/60 text-[#F5DEB3] hover:bg-[#C9AA71]/20 hover:border-[#C9AA71] transition-all flex-1 sm:flex-initial"
                                >
                                    <Mail className="h-4 w-4 text-[#C9AA71]" />
                                    {t('send_via_email') || 'Send via Email'}
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleDownload}
                                    disabled={isExporting || isSendingEmail || selectedStatuses.length === 0 || selectedCategories.length === 0}
                                    className="gap-2 flex-1 sm:flex-initial"
                                >
                                    {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    {isExporting ? (t('downloading') || 'Downloading...') : (t('download_pdf') || 'Download PDF')}
                                </Button>
                            </>
                        )}
                    </div>
                </DialogFooter>

                {/* Email Dispatch Overlay */}
                {isEmailModalOpen && (
                    <div className="absolute inset-0 z-50 bg-[#1C1B0E] p-4 sm:p-6 flex flex-col overflow-hidden animate-in fade-in duration-200">
                        {/* Overlay Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-[#3B3929] shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-[#2A281E] border border-[#C9AA71]/40 text-[#C9AA71]">
                                    <Mail className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-[#FAFAFA]">
                                        {t('email_report_title') || 'Send Report via Email'}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        {lang === 'id' 
                                            ? 'Kirimkan lampiran laporan PDF ini langsung ke alamat email staf, HOD, atau manajemen.'
                                            : 'Send this generated PDF report directly to staff, HODs, or management email addresses.'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setIsEmailModalOpen(false); setEmailStatusToast(null); }}
                                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-[#2A281E] transition-all"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Status Toast Banner */}
                        {emailStatusToast && (
                            <div className={`mt-3 p-3 rounded-xl border text-xs flex items-start gap-2.5 shrink-0 ${
                                emailStatusToast.type === 'success'
                                    ? 'bg-emerald-950/70 border-emerald-500/80 text-emerald-200'
                                    : 'bg-rose-950/70 border-rose-500/80 text-rose-200'
                            }`}>
                                {emailStatusToast.type === 'success' ? (
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                                ) : (
                                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                                )}
                                <div className="flex-1">
                                    <p className="font-semibold">{emailStatusToast.message}</p>
                                    {emailStatusToast.type === 'error' && (
                                        <p className="text-[11px] opacity-80 mt-1">
                                            {lang === 'id' 
                                                ? 'Catatan: Pastikan pengaturan SMTP (MAIL_HOST, MAIL_USERNAME, MAIL_PASSWORD) pada file .env server sudah diisi.'
                                                : 'Note: Ensure SMTP settings (MAIL_HOST, MAIL_USERNAME, MAIL_PASSWORD) in your .env file are configured.'}
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setEmailStatusToast(null)}
                                    className="opacity-70 hover:opacity-100"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        )}

                        {/* Scrollable Form Body */}
                        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
                            {/* Sender Account / Google OAuth Status Card (Kept intact for future company Google Workspace integration) */}
                            {SHOW_GOOGLE_OAUTH_CARD && (
                                <div className="p-3.5 rounded-xl bg-[#242217] border border-[#C9AA71]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-xl border ${
                                            googleStatus.connected
                                                ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-400'
                                                : 'bg-[#1C1B0E] border-[#3B3929] text-muted-foreground'
                                        }`}>
                                            <Globe className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-[#FAFAFA]">
                                                    {googleStatus.connected ? (t('google_connected_banner') || 'Sending directly from your Google Account:') : (t('google_not_connected_banner') || 'Sending via Telunas System Mailer')}
                                                </span>
                                                {googleStatus.connected && (
                                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                                        REAL GMAIL
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">
                                                {googleStatus.connected 
                                                    ? googleStatus.google_email
                                                    : (t('connect_google_hint') || 'Connect your Google account to send reports directly from your real Gmail.')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="shrink-0">
                                        {isCheckingGoogle ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        ) : googleStatus.connected ? (
                                            <button
                                                type="button"
                                                onClick={handleDisconnectGoogle}
                                                className="text-xs text-rose-400/80 hover:text-rose-300 hover:underline transition-all"
                                            >
                                                {t('disconnect_google') || 'Disconnect'}
                                            </button>
                                        ) : (
                                            <a
                                                href={`/auth/google/redirect?return_to=${encodeURIComponent(window.location.pathname)}`}
                                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1C1B0E] text-[#FAFAFA] border border-[#C9AA71]/60 hover:bg-[#C9AA71]/15 hover:border-[#C9AA71] transition-all shadow-sm"
                                            >
                                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                                                </svg>
                                                <span>{t('connect_google_button') || 'Connect Google'}</span>
                                            </a>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Quick Select Recipients */}
                            <div className="p-3.5 rounded-xl bg-[#2A281E]/60 border border-[#3B3929] space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-[#C9AA71] uppercase tracking-wider flex items-center gap-1.5">
                                        <Users className="h-3.5 w-3.5" />
                                        <span>{t('quick_select_recipients') || 'Quick Select Recipients'}</span>
                                    </label>
                                    {isLoadingRecipients && (
                                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            Loading directory...
                                        </span>
                                    )}
                                </div>

                                {/* HOD & Department Quick Buttons */}
                                <div className="flex flex-wrap gap-1.5">
                                    {/* All HODs Button */}
                                    {availableRecipients.hods?.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={toggleAllHods}
                                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 ${
                                                availableRecipients.hods.every(h => emailRecipients.includes((h.email || '').toLowerCase()))
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] shadow-sm'
                                                    : 'bg-[#1C1B0E] text-[#C9AA71] border-[#C9AA71]/40 hover:bg-[#C9AA71]/15'
                                            }`}
                                        >
                                            <Sparkles className="w-3 h-3" />
                                            <span>{t('all_hods') || 'All HODs'} ({availableRecipients.hods.length})</span>
                                        </button>
                                    )}

                                    {/* Department Pills */}
                                    {Object.keys(availableRecipients.by_department || {}).map(dept => {
                                        const deptUsers = availableRecipients.by_department[dept] || [];
                                        if (deptUsers.length === 0) return null;
                                        const allDeptSelected = deptUsers.every(u => emailRecipients.includes((u.email || '').toLowerCase()));

                                        return (
                                            <button
                                                key={dept}
                                                type="button"
                                                onClick={() => toggleDepartmentRecipients(dept)}
                                                className={`px-2 py-0.5 text-xs font-medium rounded-lg border transition-all flex items-center gap-1 ${
                                                    allDeptSelected
                                                        ? 'bg-primary text-primary-foreground border-primary'
                                                        : 'bg-[#1C1B0E] text-muted-foreground border-[#3B3929] hover:border-primary/50 hover:text-foreground'
                                                }`}
                                            >
                                                <span>{dept}</span>
                                                <span className="text-[10px] px-1 py-0.2 rounded-full bg-[#2A281E]">
                                                    {deptUsers.length}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Selected Recipients & Manual Input */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                                    <span>{t('email_recipients') || 'Recipients'} ({emailRecipients.length})</span>
                                    {emailRecipients.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setEmailRecipients([])}
                                            className="text-[11px] text-muted-foreground hover:text-rose-400 transition-colors"
                                        >
                                            Clear All
                                        </button>
                                    )}
                                </label>

                                {/* Selected Chips */}
                                <div className="min-h-[42px] p-2 rounded-xl bg-[#2A281E]/40 border border-[#3B3929] flex flex-wrap gap-1.5 items-center">
                                    {emailRecipients.length === 0 ? (
                                        <span className="text-xs text-muted-foreground italic px-1">
                                            {t('no_recipients_selected') || 'No recipients selected. Choose from above or type below.'}
                                        </span>
                                    ) : (
                                        emailRecipients.map(email => {
                                            const matchedUser = availableRecipients.users?.find(u => (u.email || '').toLowerCase() === email);
                                            return (
                                                <span
                                                    key={email}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-[#2A281E] border border-[#C9AA71]/40 text-[#FAFAFA] shadow-sm animate-in fade-in zoom-in-95 duration-100"
                                                >
                                                    <span className="font-medium">
                                                        {matchedUser ? `${matchedUser.name} (${matchedUser.department || 'Staff'})` : email}
                                                    </span>
                                                    {matchedUser && (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            &lt;{email}&gt;
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveRecipient(email)}
                                                        className="p-0.5 rounded-full hover:bg-rose-500/20 text-muted-foreground hover:text-rose-300"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </span>
                                            );
                                        })
                                    )}
                                </div>

                                {/* Custom Email Input Box */}
                                <form onSubmit={handleAddCustomEmail} className="flex gap-2 pt-1">
                                    <input
                                        type="email"
                                        value={recipientInput}
                                        onChange={(e) => setRecipientInput(e.target.value)}
                                        placeholder={t('email_recipients_placeholder') || 'Type an email and press Enter or click Add...'}
                                        className="flex-1 px-3 py-2 text-xs rounded-xl bg-[#2A281E] border border-[#3B3929] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#C9AA71]"
                                    />
                                    <Button
                                        type="submit"
                                        variant="outline"
                                        size="sm"
                                        className="text-xs gap-1 border-[#3B3929] hover:border-[#C9AA71]"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        Add
                                    </Button>
                                </form>
                            </div>

                            {/* Subject */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-foreground">
                                    {t('email_subject') || 'Subject'}
                                </label>
                                <input
                                    type="text"
                                    value={emailSubject}
                                    onChange={(e) => setEmailSubject(e.target.value)}
                                    placeholder={t('email_subject_placeholder') || 'Subject...'}
                                    className="w-full px-3 py-2 text-xs rounded-xl bg-[#2A281E] border border-[#3B3929] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#C9AA71]"
                                />
                            </div>

                            {/* Personal Note */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-foreground">
                                    {t('email_message') || 'Personal Note (Optional)'}
                                </label>
                                <textarea
                                    rows={3}
                                    value={emailMessage}
                                    onChange={(e) => setEmailMessage(e.target.value)}
                                    placeholder={t('email_message_placeholder') || 'Add any additional notes or instructions for the recipients...'}
                                    className="w-full px-3 py-2 text-xs rounded-xl bg-[#2A281E] border border-[#3B3929] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#C9AA71] resize-none"
                                />
                            </div>

                            {/* Attachment Details Pill */}
                            <div className="p-3 rounded-xl bg-[#242217] border border-[#C9AA71]/40 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-[#C9AA71]" />
                                    <div>
                                        <p className="font-bold text-[#FAFAFA]">
                                            Telunas_Report_{new Date().toISOString().split('T')[0]}.pdf
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {filteredIssuesCount} issues included • Scope: {deptFilterMode} • Periods: {selectedSheets.join(', ') || 'All'}
                                        </p>
                                    </div>
                                </div>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#C9AA71]/20 text-[#C9AA71] border border-[#C9AA71]/30">
                                    PDF ATTACHMENT
                                </span>
                            </div>
                        </div>

                        {/* Overlay Footer */}
                        <div className="pt-3 border-t border-[#3B3929] flex items-center justify-between gap-2 shrink-0">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => { setIsEmailModalOpen(false); setEmailStatusToast(null); }}
                                disabled={isSendingEmail}
                            >
                                Back to Preview
                            </Button>
                            <Button
                                type="button"
                                onClick={handleSendEmail}
                                disabled={isSendingEmail || emailRecipients.length === 0}
                                className="gap-2 bg-[#C9AA71] text-[#1C1B0E] hover:bg-[#b89960] font-bold"
                            >
                                {isSendingEmail ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>{t('sending_email') || 'Sending Email...'}</span>
                                    </>
                                ) : (
                                    <>
                                        <Send className="h-4 w-4" />
                                        <span>{t('send_email_button') || 'Send Email'} ({emailRecipients.length})</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
