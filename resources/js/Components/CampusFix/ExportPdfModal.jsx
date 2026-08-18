import { useState, useEffect, useRef } from 'react';
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
import { Loader2, Download, FileText, ChevronDown } from 'lucide-react';

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
    const { issues, categories, currentSheet, availableSheets } = useIssues();
    const [isExporting, setIsExporting] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    
    const [selectedSheets, setSelectedSheets] = useState([]);
    const [downloadedIssues, setDownloadedIssues] = useState({});
    
    const [selectedStatuses, setSelectedStatuses] = useState(['open', 'progress', 'pending', 'solved']);
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [selectedDepartments, setSelectedDepartments] = useState([]);
    const [limit, setLimit] = useState('All');

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

        // Filter issues based on selection
        let filtered = allSelectedIssues.filter(issue => {
            if (issue.status === 'pending') {
                if (!selectedStatuses.includes('pending') && !selectedStatuses.includes('progress')) return false;
            } else {
                const sMap = { 'open': 'open', 'progress': 'progress', 'solved': 'solved' };
                if (!selectedStatuses.includes(sMap[issue.status])) return false;
            }
            // selectedCategories empty = not yet loaded, treat as all selected
            // Also: issues with null/empty category always show (old data before categories were mandatory)
            if (selectedCategories.length > 0 && issue.category && !selectedCategories.includes(issue.category)) return false;
            
            // selectedDepartments empty = not yet loaded, treat as all selected
            // Only filter by dept when user has explicitly deselected some (but not all)
            if (selectedDepartments.length > 0 && selectedDepartments.length < DEPARTMENTS.length) {
                const deptMatch = selectedDepartments.includes(issue.department) || 
                                  (Array.isArray(issue.taggedDepartments) && issue.taggedDepartments.some(d => selectedDepartments.includes(d)));
                if (!deptMatch) return false;
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
        doc.setFontSize(10);
        doc.setTextColor(80, 80, 80);
        doc.text('PT Island Connections International - Ruko Imperium Superblok Blok B No 35&36,', 10, 60);
        doc.text('Jl. Sudirman, Taman Baloi, Batam Kota, Batam City, Riau Islands 29432', 10, 65);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(28, 27, 14); // Telunas dark
        const selectedTitle = selectedSheets.length > 0 ? selectedSheets.join(', ') : 'All';
        doc.text(`Issue Tracking Report — Period: ${selectedTitle}`, 10, 74);

        const formatDateTime = (val) => {
            if (!val) return '-';
            const d = new Date(val);
            if (isNaN(d.getTime())) return val;
            return d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
        };

        const cleanDuration = (val) => {
            if (!val || typeof val !== 'string') return '-';
            return val.replace(/(\d+\.\d+)/g, (match) => Math.round(parseFloat(match)));
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

            tableData.push([
                i.id.replace('TEL-', ''),
                formatDateTime(i.reportedAt),
                i.status === 'pending' ? `${formatDateTime(i.takenAt)}\nPENDING` : formatDateTime(i.takenAt),
                formatDateTime(i.solvedAt),
                cleanDuration(i.durationLabel),
                i.title,
                i.location,
                Array.isArray(i.taggedDepartments) && i.taggedDepartments.length > 0 ? i.taggedDepartments.join('\n') : '-',
                categories.find(c => c.id === i.category)?.label || i.category,
                i.reporter,
                i.status.toUpperCase(),
                i.priority.toUpperCase()
            ]);

            if (i.status === 'pending' && selectedStatuses.includes('pending')) {
                let timelineText = '';
                if (i.pendingTimeline && i.pendingTimeline.length > 0) {
                    timelineText = i.pendingTimeline.map(item => {
                        return `${item.date ? `[${item.date}] ` : ''}${item.by}: ${item.reason}`;
                    }).join('\n');
                } else if (i.pendingReason) {
                    timelineText = `Delay Reason: ${i.pendingReason} (Pending by: ${i.pendingBy || 'Unknown'})`;
                }

                if (timelineText) {
                    tableData.push([
                        {
                            content: `Delay Timeline:\n${timelineText}`,
                            colSpan: 12,
                            styles: { fillColor: [255, 247, 237], textColor: [194, 65, 12], fontStyle: 'italic', cellPadding: 3 }
                        }
                    ]);
                }
            }
        });

        autoTable(doc, {
            startY: 78,
            margin: { left: 10, right: 10, bottom: 25 },
            head: [['ID', 'Submitted', 'Taken', 'Solved', 'Time Solve', 'Problem', 'Location', 'Tags', 'Category', 'Reporter', 'Status', 'Priority']],
            body: tableData,
            theme: 'grid',
            styles: { 
                font: 'helvetica', 
                fontSize: 8,
                cellPadding: 3,
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
                0: { cellWidth: 26 }, // ID
                1: { cellWidth: 20 }, // Submitted
                2: { cellWidth: 20 }, // Taken
                3: { cellWidth: 20 }, // Solved
                4: { cellWidth: 18 }, // Duration
                5: { cellWidth: 45 }, // Problem (more space)
                6: { cellWidth: 22 }, // Location
                7: { cellWidth: 25 }, // Tags
                8: { cellWidth: 20 }, // Category
                9: { cellWidth: 25 }, // Reporter
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
                    if (data.cell.raw === 'SOLVED') {
                        data.cell.styles.textColor = [22, 163, 74]; // Green
                    } else if (data.cell.raw === 'PROGRESS') {
                        data.cell.styles.textColor = [37, 99, 235]; // Blue
                    } else if (data.cell.raw === 'PENDING') {
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

    // Reset initial render state when modal closes, and trigger it when issues are loaded
    useEffect(() => {
        if (!open) {
            setInitialRenderComplete(false);
            return;
        }
        if (open && issues.length > 0 && !initialRenderComplete) {
            setInitialRenderComplete(true);
        }
    }, [open, issues.length, initialRenderComplete]);

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
    }, [limit, selectedStatuses, selectedCategories, selectedDepartments, selectedSheets, downloadedIssues, initialRenderComplete, open]);

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

                        {/* Departments — collapsible pill section */}
                        <CollapsibleSection
                            label="Include Departments"
                            toggleLabel="Toggle All"
                            onToggleAll={toggleAllDepartments}
                            defaultOpen={false}
                        >
                            <div className="flex flex-wrap gap-2 pb-2">
                                {DEPARTMENTS.map(dept => (
                                    <button
                                        key={dept}
                                        type="button"
                                        onClick={() => handleDepartmentToggle(dept)}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                                            selectedDepartments.includes(dept)
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-surface text-muted-foreground border-border hover:border-primary/50'
                                        }`}
                                    >
                                        {dept}
                                    </button>
                                ))}
                            </div>
                        </CollapsibleSection>
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

                <DialogFooter className="shrink-0 mt-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isExporting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={handleDownload}
                        disabled={isExporting || selectedStatuses.length === 0 || selectedCategories.length === 0}
                        className="gap-2"
                    >
                        {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {isExporting ? 'Downloading...' : 'Download PDF'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
