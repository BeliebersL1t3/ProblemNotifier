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
    Mail, Check, CheckCircle2, AlertCircle, X, Users, User, Plus, Sparkles
} from 'lucide-react';
import { normalizeDepartment } from '@/constants/staff';
import { formatDurationLabel } from '@/lib/duration';

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

    const buildPdfDocument = () => {
        // Combine issues from selected sheets
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

        // Filter issues based on selection
        let filtered = allSelectedIssues.filter(issue => {
            if (issue.isArchived) {
                // Archived issues explicitly included by Admin via includeArchived
            } else if (issue.status === 'pending') {
                if (!selectedStatuses.includes('pending') && !selectedStatuses.includes('progress')) return false;
            } else {
                const sMap = { 'open': 'open', 'progress': 'progress', 'solved': 'solved' };
                if (!selectedStatuses.includes(sMap[issue.status])) return false;
            }
            // selectedCategories empty = not yet loaded, treat as all selected
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

        // Sort newest first
        filtered.sort((a, b) => (b.reportedAt || 0) - (a.reportedAt || 0));

        // Apply limit
        if (limit !== 'All') {
            filtered = filtered.slice(0, parseInt(limit));
        }

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
        if (!open || !initialRenderComplete) return;
        
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
    }, [limit, selectedStatuses, selectedCategories, selectedDepartments, deptFilterMode, selectedSheets, downloadedIssues, initialRenderComplete, open, includeAuditTrail, includeAuditTime, includeAuditPerson, includeAuditReason, includeDelayTimeline, includeArchived]);

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

    // Calculate filtered issues count for summary & email metadata
    const filteredIssuesCount = useMemo(() => {
        let allSelectedIssues = [];
        selectedSheets.forEach(sheet => {
            if (downloadedIssues[sheet]) {
                const sheetIssues = downloadedIssues[sheet].map(i => ({ ...i, __sheetName: sheet }));
                allSelectedIssues = allSelectedIssues.concat(sheetIssues);
            }
        });

        if (isAdmin && includeArchived && Array.isArray(archivedIssues)) {
            const relevantArchived = archivedIssues
                .filter(i => selectedSheets.includes(i.sheet || i._sheet || currentSheet))
                .map(i => ({ ...i, __sheetName: i.sheet || i._sheet || currentSheet }));
            allSelectedIssues = allSelectedIssues.concat(relevantArchived);
        }

        return allSelectedIssues.filter(issue => {
            if (issue.isArchived) {
                // Included if admin checked includeArchived
            } else if (issue.status === 'pending') {
                if (!selectedStatuses.includes('pending') && !selectedStatuses.includes('progress')) return false;
            } else {
                const sMap = { 'open': 'open', 'progress': 'progress', 'solved': 'solved' };
                if (!selectedStatuses.includes(sMap[issue.status])) return false;
            }
            if (selectedCategories.length > 0 && issue.category && !selectedCategories.includes(issue.category)) return false;

            if (deptFilterMode === 'my_scope' && userDept) {
                const isRelated = normalizeDepartment(issue.department) === userDept ||
                                  (Array.isArray(issue.assignedDepartments) && issue.assignedDepartments.some(d => normalizeDepartment(d) === userDept)) ||
                                  (Array.isArray(issue.taggedDepartments) && issue.taggedDepartments.some(d => normalizeDepartment(d) === userDept));
                if (!isRelated) return false;
            } else if (deptFilterMode === 'to_fix' && userDept) {
                const isAssigned = Array.isArray(issue.assignedDepartments) && issue.assignedDepartments.some(d => normalizeDepartment(d) === userDept);
                if (!isAssigned) return false;
            } else if (deptFilterMode === 'my_reports' && userDept) {
                if (normalizeDepartment(issue.department) !== userDept) return false;
            } else if (deptFilterMode === 'mentions' && userDept) {
                const isTagged = Array.isArray(issue.taggedDepartments) && issue.taggedDepartments.some(d => normalizeDepartment(d) === userDept);
                if (!isTagged) return false;
            } else if (deptFilterMode === 'all') {
                const isDeptSelected = selectedDepartments.some(d => {
                    const normD = normalizeDepartment(d);
                    const origMatch = normalizeDepartment(issue.department) === normD;
                    const assignMatch = Array.isArray(issue.assignedDepartments) && issue.assignedDepartments.some(a => normalizeDepartment(a) === normD);
                    const tagMatch = Array.isArray(issue.taggedDepartments) && issue.taggedDepartments.some(t => normalizeDepartment(t) === normD);
                    return origMatch || assignMatch || tagMatch;
                });
                if (!isDeptSelected) return false;
            }
            return true;
        }).length;
    }, [selectedSheets, downloadedIssues, isAdmin, includeArchived, archivedIssues, currentSheet, selectedStatuses, selectedCategories, deptFilterMode, userDept, selectedDepartments]);

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
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <FileText className="h-5 w-5 text-primary" />
                        Export Issue Report
                    </DialogTitle>
                    <DialogDescription>
                        Configure the filters on the left and instantly preview your PDF report on the right.
                    </DialogDescription>
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
                                Table Appendices (Optional)
                            </label>
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
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Live Preview — shown on all screen sizes */}
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
                </div>

                <DialogFooter className="shrink-0 mt-2 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isExporting || isSendingEmail}
                        className="w-full sm:w-auto"
                    >
                        {t('cancel') || 'Cancel'}
                    </Button>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
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
