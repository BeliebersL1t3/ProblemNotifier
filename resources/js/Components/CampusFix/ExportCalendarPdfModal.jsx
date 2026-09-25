import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import axios from 'axios';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/Components/UI/Dialog';
import { Button } from '@/Components/UI/Button';
import {
    Calendar as CalendarIcon, FileText, Download, Loader2,
    Building2, CheckCircle2, Clock, MapPin, RefreshCw,
    SlidersHorizontal, Layers, Check, X,
    Mail, Send, Sparkles, Users, User, Plus, AlertCircle, Globe
} from 'lucide-react';
import { ALL_DEPARTMENTS, normalizeDepartment } from '@/constants/staff';
import { getDepartmentTheme } from '@/constants/departments';
import { parseTaskRanges, formatDateShort } from './OperationsCalendarView';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/hooks/useAuth';

// Available Locations
const ALL_LOCATIONS = ['TPI', 'TBR', 'Kantor'];

// Format Date YYYY-MM-DD
function toDateString(d) {
    if (!d) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDateStr(str) {
    if (!str) return null;
    try {
        const clean = str.split('T')[0];
        const parts = clean.split('-');
        if (parts.length === 3) {
            return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        }
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
    } catch {
        return null;
    }
}

// Calculate total calendar days span
function calculateDaysSpan(startStr, endStr) {
    if (!startStr) return 1;
    const s = parseDateStr(startStr);
    const e = parseDateStr(endStr || startStr);
    if (!s || !e) return 1;
    return Math.max(1, Math.round(Math.abs(e - s) / (1000 * 60 * 60 * 24)) + 1);
}

export function ExportCalendarPdfModal({ open, onOpenChange, tasks = [] }) {
    const { t, lang } = useLanguage();
    const { user, isDeptUser, department: userDept } = useAuth();
    const lockedDept = isDeptUser && userDept ? normalizeDepartment(userDept) : null;
    const currentUserEmail = (user?.email || '').toLowerCase().trim();
    const myDept = userDept ? normalizeDepartment(userDept) : (user?.department ? normalizeDepartment(user?.department) : null);

    // Filters state
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    // Default to Current Month
    const [periodPreset, setPeriodPreset] = useState('current_month'); // 'current_month' | 'next_month' | 'all' | 'custom'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    // Departments filter
    const [selectedDepartments, setSelectedDepartments] = useState(() => {
        return lockedDept ? [lockedDept] : [...ALL_DEPARTMENTS];
    });

    // Status filter
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'done'

    // Location filter (multi-select)
    const [selectedLocations, setSelectedLocations] = useState(() => [...ALL_LOCATIONS]);

    // Grouping & Sorting
    const [groupingMode, setGroupingMode] = useState('department'); // 'department' | 'chronological'

    // Content toggles
    const [includeKpi, setIncludeKpi] = useState(true);
    const [includeNotes, setIncludeNotes] = useState(true);

    // Live preview state
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Email Dispatch Modal state
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [emailRecipients, setEmailRecipients] = useState([]);
    const [recipientInput, setRecipientInput] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailMessage, setEmailMessage] = useState('');
    const [availableRecipients, setAvailableRecipients] = useState({ users: [], hods: [], by_department: {} });
    const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);
    const [emailStatusToast, setEmailStatusToast] = useState(null);
    const [googleStatus, setGoogleStatus] = useState({ connected: false, google_email: null });
    const [isCheckingGoogle, setIsCheckingGoogle] = useState(false);

    // Preloaded logo data URL
    const logoImgRef = useRef(null);

    // Preload logo and draw on solid white canvas to prevent dark transparency boxes in jsPDF
    useEffect(() => {
        if (!logoImgRef.current) {
            const img = new window.Image();
            img.src = '/logo.png';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                logoImgRef.current = canvas.toDataURL('image/jpeg', 1.0);
            };
        }
    }, []);

    // Sync lockedDept when user auth loads
    useEffect(() => {
        if (lockedDept) {
            setSelectedDepartments([lockedDept]);
        }
    }, [lockedDept]);

    // Active Date Range boundaries based on preset
    const activeDateRange = useMemo(() => {
        if (periodPreset === 'current_month') {
            const start = new Date(currentYear, currentMonth, 1);
            const end = new Date(currentYear, currentMonth + 1, 0);
            return {
                start: toDateString(start),
                end: toDateString(end),
                label: new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { month: 'long', year: 'numeric' }).format(start)
            };
        }
        if (periodPreset === 'next_month') {
            const start = new Date(currentYear, currentMonth + 1, 1);
            const end = new Date(currentYear, currentMonth + 2, 0);
            return {
                start: toDateString(start),
                end: toDateString(end),
                label: new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { month: 'long', year: 'numeric' }).format(start)
            };
        }
        if (periodPreset === 'custom') {
            const s = customStartDate || toDateString(new Date(currentYear, currentMonth, 1));
            const e = customEndDate || toDateString(new Date(currentYear, currentMonth + 1, 0));
            return {
                start: s,
                end: e,
                label: `${formatDateShort(s, lang)} – ${formatDateShort(e, lang)}`
            };
        }
        // 'all'
        return {
            start: null,
            end: null,
            label: lang === 'id' ? 'Semua Jadwal Terdaftar' : 'All Scheduled Work Orders'
        };
    }, [periodPreset, currentYear, currentMonth, customStartDate, customEndDate, lang]);

    // Department toggles
    const handleDeptToggle = (dept) => {
        if (lockedDept) return;
        setSelectedDepartments(prev => {
            if (prev.includes(dept)) {
                if (prev.length === 1) return prev; // keep at least one
                return prev.filter(d => d !== dept);
            }
            return [...prev, dept];
        });
    };

    const handleSelectAllDepts = () => {
        if (lockedDept) return;
        setSelectedDepartments([...ALL_DEPARTMENTS]);
    };

    const handleClearDepts = () => {
        if (lockedDept) return;
        setSelectedDepartments([ALL_DEPARTMENTS[0]]);
    };

    const handleSelectMyDept = () => {
        if (lockedDept) return;
        if (myDept) {
            setSelectedDepartments([myDept]);
        }
    };

    // Location toggles (multi-select)
    const handleLocationToggle = (loc) => {
        setSelectedLocations(prev => {
            if (prev.includes(loc)) {
                return prev.filter(l => l !== loc);
            }
            return [...prev, loc];
        });
    };

    const handleToggleAllLocations = () => {
        if (selectedLocations.length === ALL_LOCATIONS.length) {
            setSelectedLocations([]);
        } else {
            setSelectedLocations([...ALL_LOCATIONS]);
        }
    };

    // Filter tasks based on all selections
    const filteredTasks = useMemo(() => {
        if (!tasks || tasks.length === 0) return [];

        return tasks.filter(task => {
            // 1. Department filter
            const normDept = normalizeDepartment(task.department || task.dept);
            if (!selectedDepartments.includes(normDept)) return false;

            // 2. Status filter
            if (statusFilter === 'active' && task.status !== 'active') return false;
            if (statusFilter === 'done' && task.status !== 'done') return false;

            // 3. Location filter (matches if task location contains ANY of the selected locations)
            if (selectedLocations.length > 0 && selectedLocations.length < ALL_LOCATIONS.length) {
                const loc = (task.location || task.locDetail || '').toUpperCase();
                const matchesAny = selectedLocations.some(sel => loc.includes(sel.toUpperCase()));
                if (!matchesAny) return false;
            } else if (selectedLocations.length === 0) {
                return false;
            }

            // 4. Date Range filter
            if (activeDateRange.start && activeDateRange.end) {
                const rStart = activeDateRange.start;
                const rEnd = activeDateRange.end;
                const ranges = parseTaskRanges(task);

                if (ranges.length > 0) {
                    const overlaps = ranges.some(r => {
                        const s = r.startDate || r.endDate;
                        const e = r.endDate || r.startDate;
                        if (!s) return false;
                        return s <= rEnd && e >= rStart;
                    });
                    if (!overlaps) return false;
                } else if (task.startDate || task.endDate) {
                    const s = task.startDate || task.endDate;
                    const e = task.endDate || task.startDate;
                    if (s > rEnd || e < rStart) return false;
                }
            }

            return true;
        });
    }, [tasks, selectedDepartments, statusFilter, selectedLocations, activeDateRange]);

    // Sort or Group tasks
    const processedTasks = useMemo(() => {
        const list = [...filteredTasks];

        const getPrimaryDate = (task) => {
            const ranges = parseTaskRanges(task);
            if (ranges.length > 0 && ranges[0].startDate) return ranges[0].startDate;
            return task.startDate || task.createdAt || '9999-99-99';
        };

        if (groupingMode === 'department') {
            list.sort((a, b) => {
                const deptA = a.department || a.dept || '';
                const deptB = b.department || b.dept || '';
                if (deptA !== deptB) return deptA.localeCompare(deptB);
                return getPrimaryDate(a).localeCompare(getPrimaryDate(b));
            });
        } else {
            // Chronological
            list.sort((a, b) => getPrimaryDate(a).localeCompare(getPrimaryDate(b)));
        }

        return list;
    }, [filteredTasks, groupingMode]);

    // KPI Summary
    const totalCount = filteredTasks.length;
    const activeCount = filteredTasks.filter(t => t.status === 'active').length;
    const doneCount = filteredTasks.filter(t => t.status === 'done').length;

    // Sanitize text for standard PDF fonts (no Unicode/emoji corruption)
    const sanitizePdfText = (str) => {
        if (!str || typeof str !== 'string') return '';
        return str
            .replace(/[\u2794\u2192\u21D2\u27A1]/g, '->')
            .replace(/[^\x20-\x7E\n\r\t]/g, '');
    };

    // ─── Email Modal Handlers ─────────────────────────────────────────────────
    const handleOpenEmailModal = async () => {
        setIsEmailModalOpen(true);
        setEmailStatusToast(null);

        const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const periodLabel = activeDateRange.label || 'Operations Schedule';
        setEmailSubject(`[Telunas Schedule] Operations Calendar Report - ${periodLabel} (${dateStr})`);

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
            const pdfFilename = `Telunas_Calendar_Report_${new Date().toISOString().split('T')[0]}.pdf`;

            const formData = new FormData();
            formData.append('pdf_file', pdfBlob, pdfFilename);
            formData.append('recipients', JSON.stringify(emailRecipients));
            formData.append('subject', emailSubject || 'Telunas Operations Calendar Schedule Report');
            formData.append('message', emailMessage || '');
            formData.append('meta', JSON.stringify({
                period: activeDateRange.label,
                locations: selectedLocations,
                departments: selectedDepartments,
                total_tasks: processedTasks.length,
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

    const isSendingToSelf = Boolean(
        currentUserEmail && emailRecipients.some(e => e.toLowerCase() === currentUserEmail)
    );

    // ─── Core jsPDF Document Builder ──────────────────────────────────────────
    const buildPdfDocument = useCallback(() => {
        const doc = new jsPDF('landscape', 'mm', 'a4');
        const pageWidth = 297;
        const pageHeight = 210;
        const marginX = 14;

        // 1. Official Telunas Logo (Rendered via solid white canvas)
        if (logoImgRef.current) {
            doc.addImage(logoImgRef.current, 'JPEG', marginX, 10, 34, 34);
        }

        // 2. Official Header Letterhead (Exact text as requested)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(90, 90, 90);
        doc.text('PT. Telunas Resort Indonesia', marginX, 47);
        doc.text('Pulau Sugi, Sugie, Kec. Moro, Kabupaten Karimun, Kepulauan Riau 29663', marginX, 51);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(28, 27, 14); // Telunas charcoal
        doc.text('Telunas Resorts Operations & Department Schedule Report', marginX, 56);

        // 3. Subtitle / Metadata Info
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(110, 110, 110);
        const deptSummary = selectedDepartments.length === ALL_DEPARTMENTS.length 
            ? 'All Departments' 
            : selectedDepartments.join(', ');
        const locSummary = selectedLocations.length === ALL_LOCATIONS.length
            ? 'All Locations'
            : (selectedLocations.length === 0 ? 'None' : selectedLocations.join(', '));
        const genDate = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        doc.text(`Period: ${activeDateRange.label}   |   Locations: ${locSummary}   |   Departments: ${deptSummary}   |   Generated: ${genDate}`, marginX, 61);

        let currentY = 66;

        // 4. Executive KPI Summary Cards (if enabled)
        if (includeKpi) {
            const cardW = 62;
            const cardH = 13;
            const gap = 6;

            const cards = [
                { label: 'TOTAL SCHEDULED TASKS', value: String(totalCount), bg: [248, 246, 240], border: [201, 170, 113], text: [28, 27, 14] },
                { label: 'ACTIVE / IN PROGRESS', value: String(activeCount), bg: [254, 243, 199], border: [245, 158, 11], text: [146, 64, 14] },
                { label: 'COMPLETED / DONE', value: String(doneCount), bg: [209, 250, 229], border: [16, 185, 129], text: [6, 95, 70] },
                { label: 'DEPARTMENTS COVERED', value: `${selectedDepartments.length} of ${ALL_DEPARTMENTS.length}`, bg: [241, 245, 249], border: [148, 163, 184], text: [30, 41, 59] },
            ];

            cards.forEach((c, idx) => {
                const x = marginX + idx * (cardW + gap);
                doc.setFillColor(...c.bg);
                doc.setDrawColor(...c.border);
                doc.setLineWidth(0.3);
                doc.roundedRect(x, currentY, cardW, cardH, 1.5, 1.5, 'FD');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6.5);
                doc.setTextColor(...c.text);
                doc.text(c.label, x + 3.5, currentY + 4.5);

                doc.setFontSize(11);
                doc.text(c.value, x + 3.5, currentY + 10.5);
            });

            currentY += cardH + 5;
        }

        // 5. Build Table Rows
        const headers = ['#', 'Dept', 'Task Title & Description', 'Location', 'Schedule / Dates', 'Status'];
        if (includeNotes) {
            headers.push('Notes / Catatan');
        }

        const tableRows = [];
        const deptChangeRowIndices = new Set();

        processedTasks.forEach((task, index) => {
            const taskDept = task.department || task.dept || '-';
            const nextTask = processedTasks[index + 1];
            const nextDept = nextTask ? (nextTask.department || nextTask.dept || '-') : null;

            // Date formatting: ONLY DATES, clean list without block labels or days clutter
            const ranges = parseTaskRanges(task);
            let scheduleText = '';

            if (ranges.length > 0) {
                scheduleText = ranges.map(r => {
                    const s = formatDateShort(r.startDate, 'en');
                    const e = formatDateShort(r.endDate || r.startDate, 'en');
                    if (!r.endDate || r.startDate === r.endDate) {
                        return s;
                    }
                    return `${s} - ${e}`;
                }).join('\n');
            } else if (task.startDate || task.endDate) {
                const s = task.startDate || task.endDate;
                const e = task.endDate || task.startDate;
                if (!e || s === e) {
                    scheduleText = formatDateShort(s, 'en');
                } else {
                    scheduleText = `${formatDateShort(s, 'en')} - ${formatDateShort(e, 'en')}`;
                }
            } else {
                scheduleText = '-';
            }

            // Description combining title & detail
            let titleDescText = task.title || '-';
            if (task.description) {
                titleDescText += `\n${task.description}`;
            }

            // Clean notes without internal JSON tags or stray brackets
            let cleanNotes = task.notes || '-';
            if (cleanNotes.includes('[SCHEDULE_RANGES:')) {
                cleanNotes = cleanNotes.replace(/\[SCHEDULE_RANGES:\s*\[.*?\]\s*\]/gis, '').trim();
            }
            cleanNotes = cleanNotes.replace(/^\]+|\s*\]+$/g, '').trim() || '-';

            const isDone = task.status === 'done';
            const statusCell = {
                content: isDone ? 'DONE' : 'ACTIVE',
                styles: {
                    textColor: isDone ? [6, 95, 70] : [146, 64, 14],
                    fontStyle: 'bold',
                    halign: 'center'
                }
            };

            const row = [
                String(index + 1).padStart(2, '0'),
                taskDept,
                sanitizePdfText(titleDescText),
                sanitizePdfText(task.location || '-'),
                sanitizePdfText(scheduleText),
                statusCell
            ];

            if (includeNotes) {
                row.push(sanitizePdfText(cleanNotes));
            }

            tableRows.push(row);

            // When grouped by department, mark boundary between different departments
            if (groupingMode === 'department' && nextDept !== null && nextDept !== taskDept) {
                deptChangeRowIndices.add(index);
            }
        });

        // 6. Column Widths Definition (Landscape A4: 297mm - 28mm margin = 269mm total)
        const columnStyles = includeNotes
            ? {
                0: { cellWidth: 10, halign: 'center' }, // #
                1: { cellWidth: 26, fontStyle: 'bold' }, // Dept
                2: { cellWidth: 70 }, // Title & Desc
                3: { cellWidth: 36 }, // Location
                4: { cellWidth: 62 }, // Schedule Dates
                5: { cellWidth: 20 }, // Status
                6: { cellWidth: 45 }, // Notes
            }
            : {
                0: { cellWidth: 12, halign: 'center' },
                1: { cellWidth: 32, fontStyle: 'bold' },
                2: { cellWidth: 95 },
                3: { cellWidth: 44 },
                4: { cellWidth: 64 },
                5: { cellWidth: 22 },
            };

        autoTable(doc, {
            head: [headers],
            body: tableRows,
            startY: currentY,
            margin: { left: marginX, right: marginX, bottom: 16 },
            styles: {
                font: 'helvetica',
                fontSize: 7.5,
                cellPadding: 2.5,
                lineColor: [225, 225, 220],
                lineWidth: 0.2,
                textColor: [30, 30, 30],
                overflow: 'linebreak',
            },
            headStyles: {
                fillColor: [28, 27, 14], // Telunas charcoal
                textColor: [250, 250, 250],
                fontStyle: 'bold',
                halign: 'left',
                fontSize: 8,
                cellPadding: 3,
            },
            alternateRowStyles: {
                fillColor: [252, 251, 248]
            },
            columnStyles,
            didDrawCell: (data) => {
                // Thicker dividing line between different departments
                if (data.section === 'body' && deptChangeRowIndices.has(data.row.index)) {
                    doc.saveGraphicsState();
                    doc.setDrawColor(160, 140, 95); // Warm gold/dark divider
                    doc.setLineWidth(0.8); // Prominently thicker dividing line
                    doc.line(
                        data.cell.x,
                        data.cell.y + data.cell.height,
                        data.cell.x + data.cell.width,
                        data.cell.y + data.cell.height
                    );
                    doc.restoreGraphicsState();
                }
            },
            didDrawPage: (data) => {
                // Page numbering footer on every page
                const totalPages = doc.internal.getNumberOfPages();
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(140, 140, 140);
                doc.text(
                    `Page ${data.pageNumber} of ${totalPages}`,
                    marginX,
                    pageHeight - 8
                );
                doc.text(
                    'Telunas Resort Internal Operational Document',
                    pageWidth - marginX,
                    pageHeight - 8,
                    { align: 'right' }
                );
            }
        });

        return doc;
    }, [
        processedTasks, selectedDepartments, selectedLocations, activeDateRange,
        groupingMode, includeKpi, includeNotes,
        totalCount, activeCount, doneCount
    ]);

    // Update Live PDF Preview when filters or modal visibility change
    useEffect(() => {
        if (!open) return;

        setIsPreviewLoading(true);
        const timer = setTimeout(() => {
            try {
                const doc = buildPdfDocument();
                const blob = doc.output('blob');
                const url = URL.createObjectURL(blob);
                setPreviewUrl(prev => {
                    if (prev) URL.revokeObjectURL(prev);
                    return url;
                });
            } catch (err) {
                console.error('Failed to generate preview PDF:', err);
            } finally {
                setIsPreviewLoading(false);
            }
        }, 150);

        return () => clearTimeout(timer);
    }, [open, buildPdfDocument]);

    // Download PDF Action
    const handleDownload = () => {
        setIsExporting(true);
        try {
            const doc = buildPdfDocument();
            const dateTag = toDateString(new Date());
            const deptTag = selectedDepartments.length === 1 ? selectedDepartments[0] : 'All_Depts';
            doc.save(`Telunas_Schedule_Report_${deptTag}_${dateTag}.pdf`);
        } catch (err) {
            console.error('Download PDF Failed:', err);
            alert('Failed to download PDF. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!isExporting) onOpenChange(o); }}>
            <DialogContent className="max-h-[100dvh] overflow-hidden flex flex-col w-full sm:max-w-6xl h-[100dvh] sm:h-[88vh] sm:max-h-[95vh] rounded-none sm:rounded-2xl bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] shadow-2xl p-0">
                {/* Modal Header */}
                <DialogHeader className="px-6 py-4 border-b border-[#3B3929] bg-[#2A281E]/80 backdrop-blur-md flex flex-row items-center justify-between shrink-0">
                    <div>
                        <DialogTitle className="flex items-center gap-2.5 text-lg sm:text-xl font-extrabold text-[#FAFAFA]">
                            <FileText className="h-5 w-5 text-[#C9AA71]" />
                            <span>{t('export_calendar_pdf') || 'Export Calendar Schedule to PDF'}</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs text-[#A19F8D] mt-0.5">
                            {t('export_calendar_pdf_desc') || 'Sesuaikan filter jadwal di sebelah kiri dan tinjau pratinjau PDF langsung di sebelah kanan.'}
                        </DialogDescription>
                    </div>
                </DialogHeader>

                {/* Main Body: 2 Columns on Desktop, scrollable stack on mobile */}
                <div className="flex-1 min-h-0 flex flex-col overflow-y-auto md:grid md:grid-cols-[360px_1fr] md:overflow-hidden bg-[#1C1B0E]">
                    
                    {/* ─── LEFT COLUMN: Filter & Report Controls ─── */}
                    <div className="p-4 sm:p-5 space-y-5 border-b md:border-b-0 md:border-r border-[#3B3929] bg-[#242217]/50 text-xs md:overflow-y-auto custom-scrollbar shrink-0 md:shrink">
                        
                        {/* 1. Schedule Period Filter */}
                        <div className="space-y-2">
                            <label className="flex items-center gap-1.5 font-bold text-[#E3D1AA] text-xs uppercase tracking-wider">
                                <CalendarIcon className="h-3.5 w-3.5 text-[#C9AA71]" />
                                <span>{t('schedule_period') || 'Periode Jadwal'}</span>
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                                {[
                                    { id: 'current_month', label: t('current_month') || 'Bulan Ini' },
                                    { id: 'next_month', label: t('next_month') || 'Bulan Depan' },
                                    { id: 'all', label: t('all_scheduled') || 'Semua Jadwal' },
                                    { id: 'custom', label: t('custom_range') || 'Rentang Kustom' },
                                ].map(p => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setPeriodPreset(p.id)}
                                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all text-left cursor-pointer border ${
                                            periodPreset === p.id
                                                ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] shadow-md font-extrabold'
                                                : 'bg-[#1C1B0E] text-[#A19F8D] border-[#3B3929] hover:text-[#FAFAFA] hover:border-[#C9AA71]/50'
                                        }`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>

                            {/* Custom Date Pickers if 'custom' is selected */}
                            {periodPreset === 'custom' && (
                                <div className="grid grid-cols-2 gap-2 pt-1 animate-in fade-in">
                                    <div>
                                        <label className="text-[10px] text-[#A19F8D] block mb-1">Mulai (From)</label>
                                        <input
                                            type="date"
                                            value={customStartDate}
                                            onChange={(e) => setCustomStartDate(e.target.value)}
                                            className="w-full bg-[#1C1B0E] border border-[#3B3929] rounded-lg px-2.5 py-1.5 text-xs text-[#FAFAFA] focus:outline-none focus:border-[#C9AA71] [color-scheme:dark]"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-[#A19F8D] block mb-1">Sampai (To)</label>
                                        <input
                                            type="date"
                                            value={customEndDate}
                                            min={customStartDate}
                                            onChange={(e) => setCustomEndDate(e.target.value)}
                                            className="w-full bg-[#1C1B0E] border border-[#3B3929] rounded-lg px-2.5 py-1.5 text-xs text-[#FAFAFA] focus:outline-none focus:border-[#C9AA71] [color-scheme:dark]"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 2. Department Selection */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-1.5 font-bold text-[#E3D1AA] text-xs uppercase tracking-wider">
                                    <Building2 className="h-3.5 w-3.5 text-[#C9AA71]" />
                                    <span>{t('department') || 'Departemen'}</span>
                                </label>
                                {!lockedDept && (
                                    <div className="flex items-center gap-2">
                                        {myDept && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={handleSelectMyDept}
                                                    className={`text-[10px] font-semibold cursor-pointer px-1.5 py-0.5 rounded transition-colors ${
                                                        selectedDepartments.length === 1 && selectedDepartments[0] === myDept
                                                            ? 'bg-[#C9AA71] text-[#1C1B0E] font-bold shadow-xs'
                                                            : 'text-[#C9AA71] hover:underline'
                                                    }`}
                                                    title={t('select_my_dept_desc') || 'Pilih hanya departemen Anda sendiri'}
                                                >
                                                    {t('my_department') || 'Dept Saya'}
                                                </button>
                                                <span className="text-[#3B3929]">&middot;</span>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            onClick={handleSelectAllDepts}
                                            className="text-[10px] text-[#C9AA71] hover:underline font-semibold cursor-pointer"
                                        >
                                            {t('select_all') || 'Semua'}
                                        </button>
                                        <span className="text-[#3B3929]">&middot;</span>
                                        <button
                                            type="button"
                                            onClick={handleClearDepts}
                                            className="text-[10px] text-[#A19F8D] hover:underline cursor-pointer"
                                        >
                                            {t('reset') || 'Reset'}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {lockedDept ? (
                                <div className="p-2.5 rounded-xl border border-[#3B3929] bg-[#1C1B0E] flex items-center justify-between">
                                    <span className="font-bold text-[#FAFAFA]">{lockedDept}</span>
                                    <span className="text-[10px] text-[#C9AA71] font-bold">🔒 Locked</span>
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                                    {ALL_DEPARTMENTS.map(dept => {
                                        const isSelected = selectedDepartments.includes(dept);
                                        const dTheme = getDepartmentTheme(dept);

                                        return (
                                            <button
                                                key={dept}
                                                type="button"
                                                onClick={() => handleDeptToggle(dept)}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border flex items-center gap-1 cursor-pointer ${
                                                    isSelected
                                                        ? 'shadow-xs scale-100'
                                                        : 'opacity-40 hover:opacity-80 bg-[#1C1B0E] border-[#3B3929] text-[#A19F8D]'
                                                }`}
                                                style={isSelected ? {
                                                    backgroundColor: `${dTheme.bg}25`,
                                                    borderColor: dTheme.bg,
                                                    color: dTheme.bg === '#212121' ? '#FFFFFF' : dTheme.bg
                                                } : {}}
                                            >
                                                {isSelected && <Check className="h-3 w-3" />}
                                                <span>{dept}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* 3. Task Status Filter */}
                        <div className="space-y-2">
                            <label className="flex items-center gap-1.5 font-bold text-[#E3D1AA] text-xs uppercase tracking-wider">
                                <Clock className="h-3.5 w-3.5 text-[#C9AA71]" />
                                <span>{t('task_status') || 'Status Tugas'}</span>
                            </label>
                            <div className="grid grid-cols-3 gap-1.5">
                                {[
                                    { id: 'all', label: t('all') || 'Semua' },
                                    { id: 'active', label: t('status_active') || 'Aktif' },
                                    { id: 'done', label: t('done_work') || 'Selesai' },
                                ].map(s => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => setStatusFilter(s.id)}
                                        className={`py-1.5 px-2 rounded-xl text-xs font-bold text-center border transition-all cursor-pointer ${
                                            statusFilter === s.id
                                                ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] font-extrabold shadow-sm'
                                                : 'bg-[#1C1B0E] text-[#A19F8D] border-[#3B3929] hover:text-[#FAFAFA]'
                                        }`}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 4. Location Filter (Multi-Select) */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-1.5 font-bold text-[#E3D1AA] text-xs uppercase tracking-wider">
                                    <MapPin className="h-3.5 w-3.5 text-[#C9AA71]" />
                                    <span>{t('location') || 'Lokasi'}</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={handleToggleAllLocations}
                                    className="text-[10px] text-[#C9AA71] hover:underline font-semibold cursor-pointer"
                                >
                                    {selectedLocations.length === ALL_LOCATIONS.length
                                        ? (t('unselect_all') || 'Batal Semua')
                                        : (t('select_all') || 'Semua')}
                                </button>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                                {ALL_LOCATIONS.map(loc => {
                                    const isSelected = selectedLocations.includes(loc);
                                    return (
                                        <button
                                            key={loc}
                                            type="button"
                                            onClick={() => handleLocationToggle(loc)}
                                            className={`py-1.5 px-1 rounded-xl text-xs font-bold text-center border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                                isSelected
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] font-extrabold shadow-sm'
                                                    : 'bg-[#1C1B0E] text-[#A19F8D] border-[#3B3929] hover:text-[#FAFAFA]'
                                            }`}
                                        >
                                            {isSelected && <Check className="h-3 w-3 stroke-[2.5]" />}
                                            <span>{loc}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 5. Grouping & Sorting Mode */}
                        <div className="space-y-2">
                            <label className="flex items-center gap-1.5 font-bold text-[#E3D1AA] text-xs uppercase tracking-wider">
                                <Layers className="h-3.5 w-3.5 text-[#C9AA71]" />
                                <span>{t('grouping_and_order') || 'Pengelompokan & Urutan'}</span>
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                                {[
                                    { id: 'department', label: t('group_by_dept') || 'Per Departemen' },
                                    { id: 'chronological', label: t('chronological') || 'Urut Tanggal' },
                                ].map(g => (
                                    <button
                                        key={g.id}
                                        type="button"
                                        onClick={() => setGroupingMode(g.id)}
                                        className={`py-2 px-2.5 rounded-xl text-xs font-bold text-center border transition-all cursor-pointer ${
                                            groupingMode === g.id
                                                ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] font-extrabold shadow-sm'
                                                : 'bg-[#1C1B0E] text-[#A19F8D] border-[#3B3929] hover:text-[#FAFAFA]'
                                        }`}
                                    >
                                        {g.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 6. Report Options Toggles */}
                        <div className="space-y-2.5 pt-1 border-t border-[#3B3929]/70">
                            <label className="flex items-center gap-1.5 font-bold text-[#E3D1AA] text-xs uppercase tracking-wider">
                                <SlidersHorizontal className="h-3.5 w-3.5 text-[#C9AA71]" />
                                <span>{t('report_options') || 'Opsi Tambahan'}</span>
                            </label>
                            
                            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-[#FAFAFA]">
                                <input
                                    type="checkbox"
                                    checked={includeKpi}
                                    onChange={(e) => setIncludeKpi(e.target.checked)}
                                    className="rounded border-[#3B3929] bg-[#1C1B0E] text-[#C9AA71] focus:ring-[#C9AA71]"
                                />
                                <span>{t('include_kpi_summary') || 'Tampilkan Kartu Ringkasan Metrik (KPI)'}</span>
                            </label>

                            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-[#FAFAFA]">
                                <input
                                    type="checkbox"
                                    checked={includeNotes}
                                    onChange={(e) => setIncludeNotes(e.target.checked)}
                                    className="rounded border-[#3B3929] bg-[#1C1B0E] text-[#C9AA71] focus:ring-[#C9AA71]"
                                />
                                <span>{t('include_notes_column') || 'Sertakan Kolom Catatan (Notes)'}</span>
                            </label>
                        </div>
                    </div>

                    {/* ─── RIGHT COLUMN: Live Interactive PDF Preview ─── */}
                    <div className="flex flex-col bg-[#14130A] overflow-hidden p-4 sm:p-5 min-h-[520px] md:min-h-0 flex-1">
                        {/* Live Preview Toolbar */}
                        <div className="flex items-center justify-between pb-3 border-b border-[#3B3929] text-xs font-semibold text-[#A19F8D]">
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[#FAFAFA] font-bold">
                                    {processedTasks.length} {t('tasks_selected') || 'tugas dipilih'}
                                </span>
                                <span className="text-[#3B3929]">&middot;</span>
                                <span className="text-[11px] text-[#A19F8D]">
                                    {activeDateRange.label}
                                </span>
                            </div>

                            {isPreviewLoading && (
                                <div className="flex items-center gap-1.5 text-[#C9AA71] text-xs animate-in fade-in">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>{t('generating_preview') || 'Menyiapkan pratinjau...'}</span>
                                </div>
                            )}
                        </div>

                        {/* PDF Iframe Preview Box */}
                        <div className="flex-1 min-h-[300px] mt-3 rounded-xl border border-[#3B3929] bg-[#2A281E]/40 overflow-hidden relative shadow-inner flex items-center justify-center">
                            {previewUrl ? (
                                <iframe
                                    src={`${previewUrl}#toolbar=0&navpanes=0`}
                                    className="w-full h-full border-none"
                                    title="Live Calendar Schedule PDF Preview"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-2 text-[#A19F8D]">
                                    <Loader2 className="h-8 w-8 animate-spin text-[#C9AA71]" />
                                    <span className="text-xs font-medium">{t('loading_preview') || 'Memuat Pratinjau PDF...'}</span>
                                </div>
                            )}
                        </div>

                        {/* Footer Action Buttons */}
                        <div className="pt-3.5 flex items-center justify-end gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => onOpenChange(false)}
                                className="px-4 py-2.5 rounded-xl text-xs font-bold border border-[#3B3929] text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#3B3929]/50 transition-all cursor-pointer"
                            >
                                {t('cancel') || 'Batal'}
                            </button>

                            <button
                                type="button"
                                onClick={handleOpenEmailModal}
                                disabled={isExporting || processedTasks.length === 0}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border border-[#C9AA71]/50 text-[#E3D1AA] hover:bg-[#C9AA71]/15 hover:border-[#C9AA71] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                            >
                                <Mail className="h-4 w-4 text-[#C9AA71]" />
                                <span>{t('send_email_button') || 'Kirim Email'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={handleDownload}
                                disabled={isExporting || processedTasks.length === 0}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-[#C9AA71] to-[#D4BA85] text-[#1C1B0E] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none shadow-lg cursor-pointer"
                            >
                                {isExporting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Download className="h-4 w-4 stroke-[2.5]" />
                                )}
                                <span>
                                    {isExporting 
                                        ? (t('downloading') || 'Mengunduh...') 
                                        : `${t('download_pdf') || 'Unduh PDF'} (${processedTasks.length})`}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* ─── EMAIL DISPATCH MODAL OVERLAY ─── */}
                {isEmailModalOpen && (
                    <div className="absolute inset-0 bg-[#1C1B0E] z-50 flex flex-col animate-in fade-in zoom-in-95 duration-200 p-6 overflow-hidden">
                        {/* Overlay Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-[#3B3929] shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-[#2A281E] border border-[#C9AA71]/40 text-[#C9AA71]">
                                    <Mail className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-[#FAFAFA]">
                                        {t('send_report_email_title') || 'Send Schedule Report via Email'}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        {t('send_report_email_subtitle') || 'Deliver this PDF schedule report directly to department heads or staff members.'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setIsEmailModalOpen(false); setEmailStatusToast(null); }}
                                className="p-2 rounded-xl hover:bg-[#2A281E] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Status feedback banner if any */}
                        {emailStatusToast && (
                            <div className={`mt-3 p-3 rounded-xl border text-xs flex items-center justify-between shrink-0 animate-in fade-in slide-in-from-top-2 duration-150 ${
                                emailStatusToast.type === 'success'
                                    ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                                    : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
                            }`}>
                                <div className="flex items-center gap-2">
                                    {emailStatusToast.type === 'success' ? (
                                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                                    )}
                                    <span>{emailStatusToast.message}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setEmailStatusToast(null)}
                                    className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
                                >
                                    Dismiss
                                </button>
                            </div>
                        )}

                        {/* Overlay Form Content (Scrollable) */}
                        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 custom-scrollbar">
                            {/* Google Account Connection Status Banner */}
                            <div className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                                googleStatus.connected
                                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                                    : 'bg-[#2A281E]/60 border-[#3B3929] text-muted-foreground'
                            }`}>
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg border shrink-0 ${
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
                                            className="text-xs text-rose-400/80 hover:text-rose-300 hover:underline transition-all cursor-pointer"
                                        >
                                            {t('disconnect_google') || 'Disconnect'}
                                        </button>
                                    ) : (
                                        <a
                                            href={`/auth/google/redirect?return_to=${encodeURIComponent(window.location.pathname)}`}
                                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1C1B0E] text-[#FAFAFA] border border-[#C9AA71]/60 hover:bg-[#C9AA71]/15 hover:border-[#C9AA71] transition-all shadow-sm cursor-pointer"
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
                                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                                                availableRecipients.hods.every(h => emailRecipients.includes((h.email || '').toLowerCase()))
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] shadow-sm font-bold'
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
                                                className={`px-2 py-0.5 text-xs font-medium rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                                                    allDeptSelected
                                                        ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] font-bold'
                                                        : 'bg-[#1C1B0E] text-muted-foreground border-[#3B3929] hover:border-[#C9AA71]/50 hover:text-foreground'
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
                                            className="text-[11px] text-muted-foreground hover:text-rose-400 transition-colors cursor-pointer"
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
                                            const cleanEmail = (email || '').toLowerCase().trim();
                                            const isSelf = Boolean(currentUserEmail && cleanEmail === currentUserEmail);
                                            const matchedUser = availableRecipients.users?.find(u => (u.email || '').toLowerCase().trim() === cleanEmail);
                                            return (
                                                <span
                                                    key={email}
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs shadow-sm animate-in fade-in zoom-in-95 duration-100 transition-all ${
                                                        isSelf
                                                            ? 'bg-amber-500/15 border border-amber-500/50 text-[#FAFAFA]'
                                                            : 'bg-[#2A281E] border border-[#C9AA71]/40 text-[#FAFAFA]'
                                                    }`}
                                                >
                                                    <span className="font-medium flex items-center gap-1.5">
                                                        {matchedUser ? `${matchedUser.name} (${matchedUser.department || 'Staff'})` : email}
                                                        {isSelf && (
                                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40 uppercase tracking-wider flex items-center gap-0.5">
                                                                <User className="h-2.5 w-2.5" />
                                                                {t('self_recipient_badge') || 'Akun Anda'}
                                                            </span>
                                                        )}
                                                    </span>
                                                    {matchedUser && (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            &lt;{email}&gt;
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveRecipient(email)}
                                                        className="p-0.5 rounded-full hover:bg-rose-500/20 text-muted-foreground hover:text-rose-300 cursor-pointer"
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
                                        className="text-xs gap-1 border-[#3B3929] hover:border-[#C9AA71] cursor-pointer"
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
                                            Telunas_Calendar_Report_{new Date().toISOString().split('T')[0]}.pdf
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {processedTasks.length} {t('tasks_selected') || 'tugas'} • {activeDateRange.label} • {selectedLocations.length === ALL_LOCATIONS.length ? 'All Locations' : (selectedLocations.join(', ') || 'No locations')}
                                        </p>
                                    </div>
                                </div>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#C9AA71]/20 text-[#C9AA71] border border-[#C9AA71]/30">
                                    PDF ATTACHMENT
                                </span>
                            </div>
                        </div>

                        {/* Overlay Footer */}
                        <div className="pt-3 border-t border-[#3B3929] shrink-0 space-y-2.5">
                            {isSendingToSelf && (
                                <div className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 flex items-center gap-2.5 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
                                    <div className="p-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                                        <AlertCircle className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="flex-1 leading-snug">
                                        <span className="font-semibold text-amber-300">
                                            {(t('self_recipient_badge') || 'Akun Anda')}:{' '}
                                        </span>
                                        <span>
                                            {(t('self_recipient_notice') || 'Pemberitahuan: Laporan ini juga akan dikirimkan ke email akun Anda sendiri ({email}).').replace('{email}', currentUserEmail)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => { setIsEmailModalOpen(false); setEmailStatusToast(null); }}
                                    disabled={isSendingEmail}
                                    className="cursor-pointer"
                                >
                                    Back to Preview
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleSendEmail}
                                    disabled={isSendingEmail || emailRecipients.length === 0}
                                    className="gap-2 bg-[#C9AA71] text-[#1C1B0E] hover:bg-[#b89960] font-bold cursor-pointer"
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
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
