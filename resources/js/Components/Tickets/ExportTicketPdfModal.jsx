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
import { Loader2, Download, FileText, Filter, ExternalLink, RefreshCw, CheckCircle2, Clock, XCircle, Shield } from 'lucide-react';
import { DEPARTMENTS } from '@/constants/departments';
import { useLanguage } from '@/context/LanguageContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import axios from 'axios';

const LIMITS = [10, 25, 50, 100, 'All'];

export function ExportTicketPdfModal({ open, onOpenChange, currentUser }) {
    const { t, lang } = useLanguage();
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [deptFilter, setDeptFilter] = useState('all');
    const [limit, setLimit] = useState('All');

    const [tickets, setTickets] = useState([]);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isExporting, setIsExporting] = useState(false);

    const logoImgRef = useRef(null);

    const ticketTypes = useMemo(() => [
        { id: 'all', label: t('ticket_all_types') },
        { id: 'account_registration', label: t('ticket_type_account_reg') },
        { id: 'whatsapp_change', label: t('ticket_type_wa_change') },
        { id: 'whatsapp_unlink', label: t('ticket_type_wa_unlink') },
        { id: 'password_reset', label: t('ticket_type_pwd_reset') },
        { id: 'department_transfer', label: t('ticket_type_dept_transfer') },
    ], [t]);

    const statusOptions = useMemo(() => [
        { id: 'all', label: t('ticket_all_status') },
        { id: 'approved', label: t('ticket_status_approved') },
        { id: 'pending_admin', label: t('ticket_status_pending_admin') },
        { id: 'pending_hod', label: t('ticket_status_pending_hod') },
        { id: 'rejected', label: t('ticket_status_rejected') },
    ], [t]);

    // Preload logo for jsPDF without transparent canvas issues
    useEffect(() => {
        if (!logoImgRef.current) {
            const img = new Image();
            img.src = '/logo.png';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                logoImgRef.current = canvas.toDataURL('image/jpeg', 0.95);
            };
        }
    }, []);

    // Fetch all tickets matching criteria
    const fetchTickets = async () => {
        setIsLoadingData(true);
        try {
            const params = {};
            if (statusFilter !== 'all') params.status = statusFilter;
            if (typeFilter !== 'all') params.type = typeFilter;
            if (deptFilter !== 'all') params.department = deptFilter;

            const res = await axios.get('/tickets/export-data', { params });
            if (res.data?.success && Array.isArray(res.data.data)) {
                setTickets(res.data.data);
            }
        } catch (err) {
            console.error('Failed to load tickets for PDF export', err);
        } finally {
            setIsLoadingData(false);
        }
    };

    useEffect(() => {
        if (open) {
            fetchTickets();
        }
    }, [open, statusFilter, typeFilter, deptFilter]);

    const formatDateTime = (val) => {
        if (!val) return '-';
        const d = new Date(val);
        if (isNaN(d.getTime())) return String(val);
        return d.toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit' 
        }).replace(',', '');
    };

    const formatPhone = (phone) => {
        if (!phone || phone === '-') return '-';
        let digits = String(phone).replace(/\D/g, '');
        if (digits.startsWith('00')) digits = digits.slice(2);
        else if (digits.startsWith('0')) digits = digits.slice(1);
        if (digits.startsWith('8')) digits = '62' + digits;
        if (!digits) return '-';
        return `+${digits}`;
    };

    const getTypeLabel = (type) => {
        switch (type) {
            case 'account_registration': return t('ticket_type_account_reg');
            case 'whatsapp_change': return t('ticket_type_wa_change');
            case 'whatsapp_unlink': return t('ticket_type_wa_unlink');
            case 'password_reset': return t('ticket_type_pwd_reset');
            case 'department_transfer': return t('ticket_type_dept_transfer');
            default: return type || '-';
        }
    };

    const sanitizePdfText = (str) => {
        if (!str || typeof str !== 'string') return '';
        return str
            .replace(/[\u2794\u2192\u21D2\u27A1]/g, '->')
            .replace(/[^\x20-\x7E\n\r\t]/g, '');
    };

    // Generate PDF Document
    const generatePdf = () => {
        const doc = new jsPDF('landscape');

        // Logo
        if (logoImgRef.current) {
            doc.addImage(logoImgRef.current, 'JPEG', 10, 15, 38, 38);
        }

        // Header Telunas
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text('PT. Telunas Resort Indonesia', 10, 56);
        doc.text('Pulau Sugi, Sugie, Kec. Moro, Kabupaten Karimun, Kepulauan Riau 29663', 10, 60);
        doc.text('Telunas Resorts — Approval & Staff Request Ticketing Report', 10, 64);

        // Document Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(28, 27, 14); // #1c1b0e (Telunas charcoal)
        doc.text(t('ticket_pdf_doc_title'), 10, 71);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        const filterSubtitle = `Status: ${statusOptions.find(s => s.id === statusFilter)?.label || 'All'} | Type: ${ticketTypes.find(tItem => tItem.id === typeFilter)?.label || 'All'} | Dept: ${deptFilter === 'all' ? t('all_departments') : deptFilter}`;
        doc.text(filterSubtitle, 10, 76);

        // Filter and slice data
        let displayList = [...tickets];
        if (limit !== 'All') {
            displayList = displayList.slice(0, parseInt(limit, 10));
        }

        // Table Rows
        const tableData = displayList.map(tItem => {
            const staffName = tItem.staff_name || tItem.user?.staff_name || tItem.user?.name || '-';
            const email = tItem.email || tItem.user?.email || '';
            const staffCol = email ? `${staffName}\n(${email})` : staffName;

            const deptCol = tItem.subdivision ? `${tItem.department || '-'}\n[${tItem.subdivision}]` : (tItem.department || '-');

            let reqCol = '-';
            if (tItem.type === 'whatsapp_change') {
                reqCol = `${formatPhone(tItem.current_value)} -> ${formatPhone(tItem.requested_value)}`;
            } else if (tItem.type === 'whatsapp_unlink') {
                reqCol = `Unlink: ${formatPhone(tItem.current_value)}`;
            } else if (tItem.type === 'account_registration') {
                reqCol = formatPhone(tItem.requested_value);
            } else if (tItem.type === 'department_transfer') {
                reqCol = `${tItem.current_value || '-'} -> ${tItem.requested_value ? tItem.requested_value.replace('::', ' — ') : '-'}`;
            } else if (tItem.type === 'password_reset' || (tItem.requested_value && tItem.requested_value.startsWith('$2y$'))) {
                reqCol = lang === 'id' ? 'Reset Kata Sandi Diminta' : 'Password Reset Requested';
            } else if (tItem.requested_value) {
                reqCol = tItem.requested_value;
            }

            // HOD Review
            let hodCol = '-';
            if (tItem.hod_reviewed_at) {
                const hodName = tItem.hod ? (tItem.hod.staff_name || tItem.hod.name) : 'HOD';
                const notes = tItem.hod_notes ? `\n"${tItem.hod_notes}"` : '';
                hodCol = `${hodName}\n${formatDateTime(tItem.hod_reviewed_at)}${notes}`;
            } else if (tItem.status === 'pending_hod') {
                hodCol = `[${t('ticket_status_pending_hod')}]`;
            }

            // Admin Review
            let adminCol = '-';
            if (tItem.admin_reviewed_at) {
                const adminName = tItem.admin ? (tItem.admin.staff_name || tItem.admin.name) : 'Admin';
                const notes = tItem.admin_notes ? `\n"${tItem.admin_notes}"` : '';
                adminCol = `${adminName}\n${formatDateTime(tItem.admin_reviewed_at)}${notes}`;
            } else if (tItem.status === 'pending_admin') {
                adminCol = `[${t('ticket_status_pending_admin')}]`;
            }

            // Status Label
            let statusLabel = 'PENDING';
            if (tItem.status === 'approved') statusLabel = 'APPROVED';
            else if (tItem.status === 'pending_admin') statusLabel = lang === 'id' ? 'PERLU ACC' : 'NEEDS ACC';
            else if (tItem.status === 'pending_hod') statusLabel = lang === 'id' ? 'MENUNGGU HOD' : 'PENDING HOD';
            else if (String(tItem.status).includes('rejected')) statusLabel = lang === 'id' ? 'DITOLAK' : 'REJECTED';

            return [
                tItem.ticket_number || '-',
                formatDateTime(tItem.created_at),
                sanitizePdfText(getTypeLabel(tItem.type)),
                sanitizePdfText(staffCol),
                sanitizePdfText(deptCol),
                sanitizePdfText(reqCol),
                sanitizePdfText(tItem.reason || '-'),
                sanitizePdfText(hodCol),
                sanitizePdfText(adminCol),
                statusLabel,
            ];
        });

        if (tableData.length === 0) {
            tableData.push([
                {
                    content: t('ticket_empty_filter'),
                    colSpan: 10,
                    styles: { halign: 'center', textColor: [120, 120, 120], fontStyle: 'italic', cellPadding: 8 }
                }
            ]);
        }

        autoTable(doc, {
            startY: 80,
            margin: { left: 10, right: 10, bottom: 20 },
            head: [[
                t('ticket_pdf_col_no'),
                t('ticket_pdf_col_date'),
                t('ticket_pdf_col_type'),
                t('ticket_pdf_col_staff'),
                t('ticket_department'),
                t('ticket_pdf_col_detail'),
                t('ticket_reason_label'),
                t('ticket_pdf_col_hod'),
                t('ticket_pdf_col_admin'),
                t('ticket_pdf_col_status')
            ]],
            body: tableData,
            theme: 'grid',
            styles: {
                font: 'helvetica',
                fontSize: 7,
                cellPadding: 2.5,
            },
            headStyles: {
                fillColor: [227, 209, 170], // Telunas gold/tan
                textColor: [28, 27, 14],
                fontStyle: 'bold',
                lineColor: [200, 180, 150],
                lineWidth: 0.1,
            },
            alternateRowStyles: {
                fillColor: [250, 248, 242],
            },
            columnStyles: {
                0: { cellWidth: 26, fontStyle: 'bold' }, // No. Tiket
                1: { cellWidth: 20 },                   // Pengajuan
                2: { cellWidth: 28 },                   // Tipe
                3: { cellWidth: 28 },                   // Staf / Pemohon
                4: { cellWidth: 22 },                   // Departemen
                5: { cellWidth: 30 },                   // Nilai / Permintaan
                6: { cellWidth: 45 },                   // Alasan
                7: { cellWidth: 30 },                   // Tinjauan HOD
                8: { cellWidth: 28 },                   // Keputusan Admin
                9: { cellWidth: 20, fontStyle: 'bold' },// Status
            },
            didParseCell: function(data) {
                // Color code Status column
                if (data.section === 'body' && data.column.index === 9) {
                    const val = String(data.cell.raw || '');
                    if (val === 'APPROVED') {
                        data.cell.styles.textColor = [22, 163, 74]; // Green
                    } else if (val.includes('ACC') || val.includes('HOD')) {
                        data.cell.styles.textColor = [234, 88, 12]; // Amber/Orange
                    } else if (val === 'DITOLAK' || val === 'REJECTED') {
                        data.cell.styles.textColor = [220, 38, 38]; // Red
                    }
                }
            },
            didDrawPage: function(data) {
                const pageSize = doc.internal.pageSize;
                const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
                const pageWidth = pageSize.width ? pageSize.width : pageSize.getWidth();

                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(150, 150, 150);
                doc.text(`${t('ticket_pdf_generated_at')}: ${new Date().toLocaleString(lang === 'id' ? 'id-ID' : 'en-US')} | ${t('ticket_pdf_by_admin')}: ${currentUser?.name || 'Administrator'}`, data.settings.margin.left, pageHeight - 8);

                const pageStr = `${lang === 'id' ? 'Halaman' : 'Page'} ${data.pageNumber}`;
                doc.text(pageStr, pageWidth - data.settings.margin.right - 15, pageHeight - 8);
            }
        });

        return doc;
    };

    // Update live preview URL
    useEffect(() => {
        if (!open || isLoadingData) return;

        try {
            const doc = generatePdf();
            const blob = doc.output('blob');
            const url = URL.createObjectURL(blob);
            setPreviewUrl(prev => {
                if (prev) URL.revokeObjectURL(prev);
                return url;
            });
        } catch (e) {
            console.error("Failed to generate PDF preview", e);
        }

        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [tickets, limit, open, isLoadingData, lang]);

    const handleDownload = () => {
        setIsExporting(true);
        try {
            const doc = generatePdf();
            const dateStr = new Date().toISOString().slice(0, 10);
            doc.save(`Telunas_Ticket_Report_${dateStr}.pdf`);
        } catch (e) {
            console.error("Export error:", e);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-6 bg-[#1C1B0E] border-[#3B3929] text-[#FAFAFA] shadow-2xl">
                <DialogHeader className="border-b border-[#3B3929] pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-[#C9AA71]/15 text-[#C9AA71] border border-[#C9AA71]/30">
                                <FileText className="w-5 h-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold text-[#FAFAFA]">
                                    {t('ticket_pdf_modal_title')}
                                </DialogTitle>
                                <DialogDescription className="text-xs text-[#A19F8D] mt-0.5">
                                    {t('ticket_pdf_modal_desc')}
                                </DialogDescription>
                            </div>
                        </div>

                        <a
                            href="https://docs.google.com/spreadsheets/d/1uMJNUgTPw-WuA_colsbIzSeVegO9QivjOZ_nAPZ1HWo/edit?usp=sharing"
                            target="_blank"
                            rel="noreferrer"
                            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 border border-emerald-500/40 transition-colors"
                            title={t('ticket_open_sheet_btn')}
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>{t('ticket_open_sheet_btn')}</span>
                        </a>
                    </div>
                </DialogHeader>

                {/* Filter Options Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 border-b border-[#3B3929]/70 bg-[#2A281E]/40 p-3 rounded-xl mt-2">
                    {/* Status */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider block mb-1">
                            {t('ticket_pdf_filter_status')}
                        </label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] rounded-lg text-xs py-1.5 px-2 focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71]"
                        >
                            {statusOptions.map(s => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Tipe Tiket */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider block mb-1">
                            {t('ticket_pdf_filter_type')}
                        </label>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="w-full bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] rounded-lg text-xs py-1.5 px-2 focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71]"
                        >
                            {ticketTypes.map(tItem => (
                                <option key={tItem.id} value={tItem.id}>{tItem.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Departemen */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider block mb-1">
                            {t('ticket_pdf_filter_dept')}
                        </label>
                        <select
                            value={deptFilter}
                            onChange={(e) => setDeptFilter(e.target.value)}
                            className="w-full bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] rounded-lg text-xs py-1.5 px-2 focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71]"
                        >
                            <option value="all">{t('all_departments')}</option>
                            {DEPARTMENTS.map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>

                    {/* Limit Rows */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider block mb-1">
                            {t('ticket_pdf_max_rows')}
                        </label>
                        <select
                            value={limit}
                            onChange={(e) => setLimit(e.target.value)}
                            className="w-full bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] rounded-lg text-xs py-1.5 px-2 focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71]"
                        >
                            {LIMITS.map(l => (
                                <option key={l} value={l}>
                                    {l === 'All' ? (lang === 'id' ? 'Semua (Tanpa Batas)' : 'All (Unlimited)') : `${l} ${lang === 'id' ? 'Tiket Terkini' : 'Recent Tickets'}`}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* PDF Live Preview Window */}
                <div className="flex-1 min-h-[350px] relative bg-stone-900 rounded-xl overflow-hidden border border-[#3B3929] mt-3">
                    {isLoadingData ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1C1B0E]/80 backdrop-blur-sm z-10 text-white">
                            <Loader2 className="w-7 h-7 animate-spin text-[#C9AA71]" />
                            <p className="text-xs font-semibold text-[#A19F8D]">
                                {lang === 'id' ? 'Mengambil data tiket...' : 'Fetching ticket data...'}
                            </p>
                        </div>
                    ) : previewUrl ? (
                        <iframe
                            src={previewUrl}
                            className="w-full h-full min-h-[350px] border-0"
                            title={t('ticket_pdf_modal_title')}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                            {t('ticket_pdf_preview_loading')}
                        </div>
                    )}
                </div>

                <DialogFooter className="flex items-center justify-between mt-4 pt-3 border-t border-[#3B3929]">
                    <div className="text-xs text-[#A19F8D]">
                        Total: <strong className="text-[#FAFAFA]">{tickets.length}</strong> {lang === 'id' ? 'tiket ditemukan' : 'tickets found'}
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="border-[#3B3929] text-[#FAFAFA] hover:bg-[#2A281E]"
                        >
                            {t('ticket_modal_btn_cancel')}
                        </Button>
                        <Button
                            type="button"
                            onClick={handleDownload}
                            disabled={isExporting || isLoadingData || tickets.length === 0}
                            className="bg-gradient-to-r from-[#C9AA71] to-[#B39355] text-[#1C1B0E] hover:brightness-110 font-bold shadow-md shadow-[#C9AA71]/20 flex items-center gap-2"
                        >
                            {isExporting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Download className="w-4 h-4" />
                            )}
                            <span>{t('ticket_pdf_download_btn')}</span>
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
