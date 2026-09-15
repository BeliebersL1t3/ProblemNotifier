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
import { Loader2, Download, FileText, Filter, ExternalLink, RefreshCw, CheckCircle2, Clock, XCircle, Shield } from 'lucide-react';
import { DEPARTMENTS } from '@/constants/departments';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import axios from 'axios';

const TICKET_TYPES = [
    { id: 'all', label: 'Semua Tipe' },
    { id: 'account_registration', label: 'Registrasi Akun Baru' },
    { id: 'whatsapp_change', label: 'Ubah Nomor WhatsApp' },
    { id: 'whatsapp_unlink', label: 'Unlink Nomor WhatsApp' },
    { id: 'password_reset', label: 'Reset Password Akun' },
    { id: 'department_transfer', label: 'Mutasi Departemen' },
];

const STATUS_OPTIONS = [
    { id: 'all', label: 'Semua Status' },
    { id: 'approved', label: 'Disetujui (Approved)' },
    { id: 'pending_admin', label: 'Menunggu ACC Admin' },
    { id: 'pending_hod', label: 'Menunggu HOD' },
    { id: 'rejected', label: 'Ditolak (Rejected)' },
];

const LIMITS = [10, 25, 50, 100, 'All'];

export function ExportTicketPdfModal({ open, onOpenChange, currentUser }) {
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [deptFilter, setDeptFilter] = useState('all');
    const [limit, setLimit] = useState('All');

    const [tickets, setTickets] = useState([]);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isExporting, setIsExporting] = useState(false);

    const logoImgRef = useRef(null);

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
        return d.toLocaleString('en-GB', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit' 
        }).replace(',', '');
    };

    const getTypeLabel = (type) => {
        switch (type) {
            case 'account_registration': return 'Registrasi Akun Baru';
            case 'whatsapp_change': return 'Ganti Nomor WA';
            case 'whatsapp_unlink': return 'Lepas Nomor WA';
            case 'password_reset': return 'Reset Password';
            case 'department_transfer': return 'Mutasi Departemen';
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
        doc.text('Laporan Rekapitulasi Tiket Persetujuan & Registrasi Staf', 10, 71);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        const filterSubtitle = `Status: ${STATUS_OPTIONS.find(s => s.id === statusFilter)?.label || 'Semua'} | Tipe: ${TICKET_TYPES.find(t => t.id === typeFilter)?.label || 'Semua'} | Dept: ${deptFilter === 'all' ? 'Semua Departemen' : deptFilter}`;
        doc.text(filterSubtitle, 10, 76);

        // Filter and slice data
        let displayList = [...tickets];
        if (limit !== 'All') {
            displayList = displayList.slice(0, parseInt(limit, 10));
        }

        // Table Rows
        const tableData = displayList.map(t => {
            const staffName = t.staff_name || t.user?.staff_name || t.user?.name || '-';
            const email = t.email || t.user?.email || '';
            const staffCol = email ? `${staffName}\n(${email})` : staffName;

            const deptCol = t.subdivision ? `${t.department || '-'}\n[${t.subdivision}]` : (t.department || '-');

            let reqCol = '-';
            if (t.type === 'whatsapp_change') {
                reqCol = `${t.current_value || '-'} -> ${t.requested_value || '-'}`;
            } else if (t.type === 'whatsapp_unlink') {
                reqCol = `Unlink: ${t.current_value || '-'}`;
            } else if (t.type === 'department_transfer') {
                reqCol = `${t.current_value || '-'} -> ${t.requested_value || '-'}`;
            } else if (t.requested_value) {
                reqCol = t.requested_value.startsWith('$2y$') ? 'Reset Password Hash' : t.requested_value;
            }

            // HOD Review
            let hodCol = '-';
            if (t.hod_reviewed_at) {
                const hodName = t.hod ? (t.hod.staff_name || t.hod.name) : 'HOD';
                const notes = t.hod_notes ? `\n"${t.hod_notes}"` : '';
                hodCol = `${hodName}\n${formatDateTime(t.hod_reviewed_at)}${notes}`;
            } else if (t.status === 'pending_hod') {
                hodCol = '[Menunggu Tinjauan]';
            }

            // Admin Review
            let adminCol = '-';
            if (t.admin_reviewed_at) {
                const adminName = t.admin ? (t.admin.staff_name || t.admin.name) : 'Admin';
                const notes = t.admin_notes ? `\n"${t.admin_notes}"` : '';
                adminCol = `${adminName}\n${formatDateTime(t.admin_reviewed_at)}${notes}`;
            } else if (t.status === 'pending_admin') {
                adminCol = '[Menunggu ACC]';
            }

            // Status Label
            let statusLabel = 'PENDING';
            if (t.status === 'approved') statusLabel = 'APPROVED';
            else if (t.status === 'pending_admin') statusLabel = 'PERLU ACC';
            else if (t.status === 'pending_hod') statusLabel = 'MENUNGGU HOD';
            else if (String(t.status).includes('rejected')) statusLabel = 'DITOLAK';

            return [
                t.ticket_number || '-',
                formatDateTime(t.created_at),
                sanitizePdfText(getTypeLabel(t.type)),
                sanitizePdfText(staffCol),
                sanitizePdfText(deptCol),
                sanitizePdfText(reqCol),
                sanitizePdfText(t.reason || '-'),
                sanitizePdfText(hodCol),
                sanitizePdfText(adminCol),
                statusLabel,
            ];
        });

        if (tableData.length === 0) {
            tableData.push([
                {
                    content: 'Tidak ada data tiket yang cocok dengan kriteria filter yang dipilih.',
                    colSpan: 10,
                    styles: { halign: 'center', textColor: [120, 120, 120], fontStyle: 'italic', cellPadding: 8 }
                }
            ]);
        }

        autoTable(doc, {
            startY: 80,
            margin: { left: 10, right: 10, bottom: 20 },
            head: [['No. Tiket', 'Pengajuan', 'Tipe Permintaan', 'Staf / Pemohon', 'Departemen', 'Nilai / Permintaan', 'Alasan', 'Tinjauan HOD', 'Keputusan Admin', 'Status']],
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
                    } else if (val.includes('PERLU ACC') || val.includes('MENUNGGU')) {
                        data.cell.styles.textColor = [234, 88, 12]; // Amber/Orange
                    } else if (val === 'DITOLAK') {
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
                doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')} | Dicetak oleh: ${currentUser?.name || 'Administrator'}`, data.settings.margin.left, pageHeight - 8);

                const pageStr = `Halaman ${data.pageNumber}`;
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
    }, [tickets, limit, open, isLoadingData]);

    const handleDownload = () => {
        setIsExporting(true);
        try {
            const doc = generatePdf();
            const dateStr = new Date().toISOString().slice(0, 10);
            doc.save(`Telunas_Laporan_Tiket_${dateStr}.pdf`);
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
                                    Ekspor Laporan Tiket (PDF)
                                </DialogTitle>
                                <DialogDescription className="text-xs text-[#A19F8D] mt-0.5">
                                    Unduh dokumen PDF rekapitulasi seluruh pengajuan tiket persetujuan dan registrasi staf.
                                </DialogDescription>
                            </div>
                        </div>

                        <a
                            href="https://docs.google.com/spreadsheets/d/1uMJNUgTPw-WuA_colsbIzSeVegO9QivjOZ_nAPZ1HWo/edit"
                            target="_blank"
                            rel="noreferrer"
                            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 border border-emerald-500/40 transition-colors"
                            title="Buka Google Spreadsheet Sinkronisasi Tiket"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Buka Spreadsheet</span>
                        </a>
                    </div>
                </DialogHeader>

                {/* Filter Options Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 border-b border-[#3B3929]/70 bg-[#2A281E]/40 p-3 rounded-xl mt-2">
                    {/* Status */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider block mb-1">Status</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] rounded-lg text-xs py-1.5 px-2 focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71]"
                        >
                            {STATUS_OPTIONS.map(s => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Tipe Tiket */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider block mb-1">Tipe Permohonan</label>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="w-full bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] rounded-lg text-xs py-1.5 px-2 focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71]"
                        >
                            {TICKET_TYPES.map(t => (
                                <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Departemen */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider block mb-1">Departemen</label>
                        <select
                            value={deptFilter}
                            onChange={(e) => setDeptFilter(e.target.value)}
                            className="w-full bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] rounded-lg text-xs py-1.5 px-2 focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71]"
                        >
                            <option value="all">Semua Departemen</option>
                            {DEPARTMENTS.map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>

                    {/* Limit Rows */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-[#A19F8D] tracking-wider block mb-1">Batas Baris</label>
                        <select
                            value={limit}
                            onChange={(e) => setLimit(e.target.value)}
                            className="w-full bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] rounded-lg text-xs py-1.5 px-2 focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71]"
                        >
                            {LIMITS.map(l => (
                                <option key={l} value={l}>{l === 'All' ? 'Semua (Tanpa Batas)' : `${l} Tiket Terkini`}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* PDF Live Preview Window */}
                <div className="flex-1 min-h-[350px] relative bg-stone-900 rounded-xl overflow-hidden border border-[#3B3929] mt-3">
                    {isLoadingData ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1C1B0E]/80 backdrop-blur-sm z-10 text-white">
                            <Loader2 className="w-7 h-7 animate-spin text-[#C9AA71]" />
                            <p className="text-xs font-semibold text-[#A19F8D]">Mengambil data tiket...</p>
                        </div>
                    ) : previewUrl ? (
                        <iframe
                            src={previewUrl}
                            className="w-full h-full min-h-[350px] border-0"
                            title="Pratinjau PDF Laporan Tiket"
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                            Membuat pratinjau PDF...
                        </div>
                    )}
                </div>

                <DialogFooter className="flex items-center justify-between mt-4 pt-3 border-t border-[#3B3929]">
                    <div className="text-xs text-[#A19F8D]">
                        Total: <strong className="text-[#FAFAFA]">{tickets.length}</strong> tiket ditemukan
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="border-[#3B3929] text-[#FAFAFA] hover:bg-[#2A281E]"
                        >
                            Tutup
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
                            <span>Unduh PDF</span>
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
