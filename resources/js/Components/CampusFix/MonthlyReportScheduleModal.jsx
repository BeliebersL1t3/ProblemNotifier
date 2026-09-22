import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/UI/Dialog';
import { Button } from '@/Components/UI/Button';
import { 
    Calendar, Clock, ShieldCheck, Mail, Send, Loader2, CheckCircle2, 
    AlertCircle, X, Sliders, BellRing, Building2, Check, User,
    FileText, FileSpreadsheet, Layers, BarChart3, Wrench, History
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const STATUS_OPTIONS = [
    { id: 'solved', label: 'Selesai (Solved)', color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
    { id: 'progress', label: 'In Progress', color: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
    { id: 'pending', label: 'Pending Delay', color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
    { id: 'open', label: 'Terbuka (Open)', color: 'text-rose-400 bg-rose-500/15 border-rose-500/30' },
    { id: 'archived', label: 'Terarsip (Archived)', color: 'text-gray-400 bg-gray-500/15 border-gray-500/30' },
];

export function MonthlyReportScheduleModal({ open, onOpenChange }) {
    const { t } = useLanguage();

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [toastMessage, setToastMessage] = useState(null);

    // Current user context
    const [currentUser, setCurrentUser] = useState(null);
    const [availableDepartments, setAvailableDepartments] = useState([]);

    // Personal Form State
    const [isEnabled, setIsEnabled] = useState(false);
    const [reportFormat, setReportFormat] = useState('both'); // 'pdf', 'excel', 'both'
    const [selectedStatuses, setSelectedStatuses] = useState(['solved', 'pending', 'progress', 'open']);
    const [includeKpiSummary, setIncludeKpiSummary] = useState(true);
    const [includeDelayTimeline, setIncludeDelayTimeline] = useState(true);
    const [includeSolutionNotes, setIncludeSolutionNotes] = useState(true);
    const [includeAuditTrail, setIncludeAuditTrail] = useState(false);
    const [selectedDepartments, setSelectedDepartments] = useState(['ALL']);
    const [lastDispatchedAt, setLastDispatchedAt] = useState(null);

    // Fetch personal settings on modal open
    useEffect(() => {
        if (open) {
            fetchSettings();
        } else {
            setToastMessage(null);
        }
    }, [open]);

    const fetchSettings = async () => {
        setIsLoading(true);
        try {
            const res = await axios.get('/api/report-schedule');
            if (res.data?.success) {
                const c = res.data.config || {};
                const u = res.data.user || {};
                setCurrentUser(u);
                setAvailableDepartments(res.data.availableDepartments || []);

                setIsEnabled(Boolean(c.is_enabled));
                setReportFormat(c.report_format || 'both');
                setSelectedStatuses(Array.isArray(c.selected_statuses) && c.selected_statuses.length > 0 
                    ? c.selected_statuses 
                    : ['solved', 'pending', 'progress', 'open']);
                setIncludeKpiSummary(c.include_kpi_summary !== undefined ? Boolean(c.include_kpi_summary) : true);
                setIncludeDelayTimeline(c.include_delay_timeline !== undefined ? Boolean(c.include_delay_timeline) : true);
                setIncludeSolutionNotes(c.include_solution_notes !== undefined ? Boolean(c.include_solution_notes) : true);
                setIncludeAuditTrail(Boolean(c.include_audit_trail));
                setLastDispatchedAt(c.last_dispatched_at);

                if (u.isAdmin) {
                    const depts = Array.isArray(c.departments) && c.departments.length > 0 
                        ? c.departments 
                        : ['ALL'];
                    setSelectedDepartments(depts);
                } else {
                    setSelectedDepartments([u.department || 'General']);
                }
            }
        } catch (err) {
            console.error('Failed to load personal report schedule', err);
            setToastMessage({ type: 'error', text: 'Gagal memuat preferensi jadwal laporan.' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleDept = (dept) => {
        if (dept === 'ALL') {
            setSelectedDepartments(['ALL']);
            return;
        }

        let updated = selectedDepartments.filter(d => d !== 'ALL');
        if (updated.includes(dept)) {
            updated = updated.filter(d => d !== dept);
        } else {
            updated.push(dept);
        }

        // If no departments selected, fallback to ALL
        if (updated.length === 0) {
            updated = ['ALL'];
        }

        setSelectedDepartments(updated);
    };

    const handleToggleStatus = (statusId) => {
        if (selectedStatuses.includes(statusId)) {
            if (selectedStatuses.length === 1) {
                return; // minimal 1 status aktif
            }
            setSelectedStatuses(selectedStatuses.filter(s => s !== statusId));
        } else {
            setSelectedStatuses([...selectedStatuses, statusId]);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setToastMessage(null);
        try {
            const payload = {
                is_enabled: isEnabled,
                report_format: reportFormat,
                selected_statuses: selectedStatuses,
                include_kpi_summary: includeKpiSummary,
                include_delay_timeline: includeDelayTimeline,
                include_solution_notes: includeSolutionNotes,
                include_audit_trail: includeAuditTrail,
            };

            if (currentUser?.isAdmin) {
                payload.departments = selectedDepartments;
            }

            const res = await axios.post('/api/report-schedule', payload);

            if (res.data?.success) {
                setToastMessage({
                    type: 'success',
                    text: res.data.message || 'Pengaturan laporan bulanan pribadi berhasil disimpan!'
                });
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'Gagal menyimpan pengaturan.';
            setToastMessage({ type: 'error', text: msg });
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestDispatch = async () => {
        setIsTesting(true);
        setToastMessage(null);
        try {
            const res = await axios.post('/api/report-schedule/test');
            if (res.data?.success) {
                setToastMessage({
                    type: 'success',
                    text: res.data.message || 'Laporan bulanan percobaan berhasil dikirim ke email Anda!'
                });
            } else {
                setToastMessage({
                    type: 'error',
                    text: res.data?.message || 'Gagal mengirim laporan percobaan.'
                });
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'Terjadi kesalahan saat pengiriman tes.';
            setToastMessage({ type: 'error', text: msg });
        } finally {
            setIsTesting(false);
        }
    };

    const isAllSelected = selectedDepartments.includes('ALL');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl bg-[#1C1B0E] border border-[#3B3929] text-[#E2DFD2] p-0 overflow-hidden rounded-2xl shadow-2xl">
                
                {/* Header with Telunas Gold Accent */}
                <div className="px-6 py-5 border-b border-[#3B3929] bg-gradient-to-r from-[#1C1B0E] via-[#242217] to-[#1C1B0E]">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-[#C9AA71]/15 border border-[#C9AA71]/40 text-[#C9AA71]">
                            <Calendar className="h-5 w-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold text-[#FAFAFA] tracking-wide">
                                Monthly Report Subscription
                            </DialogTitle>
                            <DialogDescription className="text-xs text-[#A19F8D] mt-0.5">
                                Langganan laporan bulanan resmi otomatis untuk akun Anda (dikirim setiap tanggal 1 pukul 08:00 WIB).
                            </DialogDescription>
                        </div>
                    </div>
                </div>

                {/* Body Content */}
                <div className="px-6 py-5 max-h-[70vh] overflow-y-auto space-y-4">

                    {/* Toast Alert */}
                    {toastMessage && (
                        <div className={`p-3 rounded-xl text-xs flex items-center gap-2.5 border transition-all ${
                            toastMessage.type === 'success' 
                                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                                : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                        }`}>
                            {toastMessage.type === 'success' ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                            ) : (
                                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                            )}
                            <span className="flex-1">{toastMessage.text}</span>
                            <button type="button" onClick={() => setToastMessage(null)} className="opacity-60 hover:opacity-100">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}

                    {isLoading ? (
                        <div className="py-12 flex flex-col items-center justify-center text-[#A19F8D] gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-[#C9AA71]" />
                            <span className="text-xs">Memuat preferensi laporan...</span>
                        </div>
                    ) : (
                        <>
                            {/* Personal Account Information Card */}
                            <div className="p-3.5 rounded-xl bg-[#242217] border border-[#3B3929] flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-[#1C1B0E] text-[#C9AA71]">
                                        <Mail className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-semibold text-[#FAFAFA] flex items-center gap-2">
                                            <span>Email Penerima:</span>
                                            <span className="text-[#C9AA71] font-mono">{currentUser?.email || '-'}</span>
                                        </div>
                                        <div className="text-[11px] text-[#A19F8D] mt-0.5">
                                            Akun: <strong className="text-white">{currentUser?.name}</strong> &bull; Peran: <span className="capitalize text-[#C9AA71]">{currentUser?.isAdmin ? 'Administrator' : `HOD (${currentUser?.department})`}</span>
                                        </div>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#C9AA71]/15 border border-[#C9AA71]/30 text-[#C9AA71]">
                                    Personal
                                </span>
                            </div>

                            {/* Master Toggle Card */}
                            <div className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                                isEnabled 
                                    ? 'bg-[#2A2616] border-[#C9AA71]' 
                                    : 'bg-[#242217] border-[#3B3929]'
                            }`}>
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${isEnabled ? 'bg-[#C9AA71] text-[#1C1B0E]' : 'bg-[#1C1B0E] text-[#A19F8D]'}`}>
                                        <BellRing className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-[#FAFAFA]">
                                            Aktifkan Pengiriman Laporan Bulanan Saya
                                        </div>
                                        <div className="text-xs text-[#A19F8D]">
                                            Dikirim otomatis ke email Anda setiap tanggal 1 pukul 08:00 WIB.
                                        </div>
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                    <input 
                                        type="checkbox" 
                                        checked={isEnabled} 
                                        onChange={(e) => setIsEnabled(e.target.checked)} 
                                        className="sr-only peer" 
                                    />
                                    <div className="w-11 h-6 bg-[#3B3929] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#C9AA71]"></div>
                                </label>
                            </div>

                            {/* SECTION 1: PILIHAN FORMAT LAPORAN */}
                            <div className="p-4 rounded-xl bg-[#242217] border border-[#3B3929] space-y-3">
                                <div className="text-xs font-bold uppercase tracking-wider text-[#C9AA71] flex items-center gap-1.5">
                                    <Layers className="h-3.5 w-3.5" />
                                    <span>Pilih Format Berkas Laporan</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    {/* Opsi Both */}
                                    <button
                                        type="button"
                                        onClick={() => setReportFormat('both')}
                                        className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                                            reportFormat === 'both'
                                                ? 'bg-[#2E2816] border-[#C9AA71] shadow-md shadow-[#C9AA71]/10'
                                                : 'bg-[#1C1B0E] border-[#3B3929] hover:border-[#615F52]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-1.5 text-[#C9AA71]">
                                                <FileText className="h-4 w-4" />
                                                <span className="text-xs font-bold">+</span>
                                                <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                                            </div>
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#C9AA71]/20 text-[#C9AA71] border border-[#C9AA71]/30">
                                                Lengkap
                                            </span>
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-white">Keduanya Sekaligus</div>
                                            <div className="text-[10px] text-[#A19F8D] mt-0.5 leading-tight">
                                                PDF cetak resmi &amp; Excel spreadsheet lengkap dalam 1 email.
                                            </div>
                                        </div>
                                    </button>

                                    {/* Opsi Excel */}
                                    <button
                                        type="button"
                                        onClick={() => setReportFormat('excel')}
                                        className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                                            reportFormat === 'excel'
                                                ? 'bg-[#152E20] border-emerald-500 shadow-md shadow-emerald-500/10'
                                                : 'bg-[#1C1B0E] border-[#3B3929] hover:border-[#615F52]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                .XLSX
                                            </span>
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-white">Excel Saja</div>
                                            <div className="text-[10px] text-[#A19F8D] mt-0.5 leading-tight">
                                                Spreadsheet dengan auto-filter, 2 sheet &amp; border kontras.
                                            </div>
                                        </div>
                                    </button>

                                    {/* Opsi PDF */}
                                    <button
                                        type="button"
                                        onClick={() => setReportFormat('pdf')}
                                        className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                                            reportFormat === 'pdf'
                                                ? 'bg-[#331D1D] border-rose-500 shadow-md shadow-rose-500/10'
                                                : 'bg-[#1C1B0E] border-[#3B3929] hover:border-[#615F52]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <FileText className="h-4 w-4 text-rose-400" />
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                                .PDF
                                            </span>
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-white">PDF Saja</div>
                                            <div className="text-[10px] text-[#A19F8D] mt-0.5 leading-tight">
                                                Dokumen resmi A4 landscape siap cetak atau presentasi.
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* SECTION 2: CAKUPAN DEPARTEMEN */}
                            {currentUser?.isAdmin ? (
                                /* Admin: Multi-Select Departments */
                                <div className="p-4 rounded-xl bg-[#242217] border border-[#3B3929] space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs font-bold uppercase tracking-wider text-[#C9AA71] flex items-center gap-1.5">
                                            <Building2 className="h-3.5 w-3.5" />
                                            <span>Pilih Cakupan Departemen (Multi-Select)</span>
                                        </div>
                                        <span className="text-[10px] text-[#A19F8D]">
                                            {isAllSelected ? 'Seluruh Resort' : `${selectedDepartments.length} Departemen Dipilih`}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-[#A19F8D]">
                                        Tentukan departemen mana saja yang ingin disertakan ke dalam laporan bulanan Anda:
                                    </p>

                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {/* All Departments Chip */}
                                        <button
                                            type="button"
                                            onClick={() => handleToggleDept('ALL')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                                                isAllSelected
                                                    ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] shadow'
                                                    : 'bg-[#1C1B0E] text-[#A19F8D] border-[#3B3929] hover:border-[#C9AA71]/60'
                                            }`}
                                        >
                                            {isAllSelected && <Check className="h-3 w-3 stroke-[3]" />}
                                            <span>Semua Departemen (All Scope)</span>
                                        </button>

                                        {/* Individual Department Chips */}
                                        {availableDepartments.map(dept => {
                                            const isSelected = !isAllSelected && selectedDepartments.includes(dept);
                                            return (
                                                <button
                                                    key={dept}
                                                    type="button"
                                                    onClick={() => handleToggleDept(dept)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all ${
                                                        isSelected
                                                            ? 'bg-[#C9AA71]/20 text-[#C9AA71] border-[#C9AA71]'
                                                            : 'bg-[#1C1B0E] text-[#A19F8D] border-[#3B3929] hover:border-[#615F52]'
                                                    }`}
                                                >
                                                    {isSelected && <Check className="h-3 w-3 text-[#C9AA71] stroke-[2.5]" />}
                                                    <span>{dept}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                /* HOD: Locked Department Card */
                                <div className="p-4 rounded-xl bg-[#242217] border border-[#3B3929] space-y-2">
                                    <div className="text-xs font-bold uppercase tracking-wider text-[#C9AA71] flex items-center gap-1.5">
                                        <Building2 className="h-3.5 w-3.5" />
                                        <span>Cakupan Departemen (Terkunci)</span>
                                    </div>
                                    <div className="p-3 rounded-lg bg-[#1C1B0E] border border-[#2E2C1E] flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                            <span className="text-xs font-bold text-white">
                                                Departemen {currentUser?.department || 'General'}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-[#A19F8D] bg-[#2E2C1E] px-2 py-0.5 rounded">
                                            Khusus HOD
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-[#A19F8D] leading-relaxed">
                                        Sebagai Kepala Departemen, laporan Anda secara otomatis difilter khusus untuk masalah dan perbaikan di departemen Anda.
                                    </p>
                                </div>
                            )}

                            {/* SECTION 3: FILTER STATUS TIKET */}
                            <div className="p-4 rounded-xl bg-[#242217] border border-[#3B3929] space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs font-bold uppercase tracking-wider text-[#C9AA71] flex items-center gap-1.5">
                                        <Sliders className="h-3.5 w-3.5" />
                                        <span>Filter Status Tiket yang Disertakan</span>
                                    </div>
                                    <span className="text-[10px] text-[#A19F8D]">
                                        {selectedStatuses.length} Status Dipilih
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-0.5">
                                    {STATUS_OPTIONS.map(opt => {
                                        const isChecked = selectedStatuses.includes(opt.id);
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => handleToggleStatus(opt.id)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                                                    isChecked
                                                        ? opt.color
                                                        : 'bg-[#1C1B0E] text-[#6B7280] border-[#3B3929] opacity-60 hover:opacity-100'
                                                }`}
                                            >
                                                {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                                                <span>{opt.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* SECTION 4: KUSTOMISASI MODULAR KONTEN */}
                            <div className="p-4 rounded-xl bg-[#242217] border border-[#3B3929] space-y-3">
                                <div className="text-xs font-bold uppercase tracking-wider text-[#C9AA71] flex items-center gap-1.5">
                                    <BarChart3 className="h-3.5 w-3.5" />
                                    <span>Komponen &amp; Detail Isi Laporan</span>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                    {/* 1. Ringkasan KPI */}
                                    <label className="p-3 rounded-xl bg-[#1C1B0E] border border-[#3B3929] flex items-start gap-3 cursor-pointer hover:border-[#615F52] transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={includeKpiSummary}
                                            onChange={(e) => setIncludeKpiSummary(e.target.checked)}
                                            className="mt-0.5 rounded text-[#C9AA71] focus:ring-[#C9AA71] h-4 w-4 bg-[#242217] border-[#3B3929]"
                                        />
                                        <div>
                                            <div className="text-xs font-bold text-[#FAFAFA] flex items-center gap-1.5">
                                                <BarChart3 className="h-3.5 w-3.5 text-[#C9AA71]" />
                                                <span>Ringkasan Metrik &amp; KPI</span>
                                            </div>
                                            <div className="text-[10px] text-[#A19F8D] mt-0.5 leading-tight">
                                                Tabel rekapitulasi status operasional &amp; performa per departemen.
                                            </div>
                                        </div>
                                    </label>

                                    {/* 2. Delay Timeline */}
                                    <label className="p-3 rounded-xl bg-[#1C1B0E] border border-[#3B3929] flex items-start gap-3 cursor-pointer hover:border-[#615F52] transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={includeDelayTimeline}
                                            onChange={(e) => setIncludeDelayTimeline(e.target.checked)}
                                            className="mt-0.5 rounded text-[#C9AA71] focus:ring-[#C9AA71] h-4 w-4 bg-[#242217] border-[#3B3929]"
                                        />
                                        <div>
                                            <div className="text-xs font-bold text-[#FAFAFA] flex items-center gap-1.5">
                                                <Clock className="h-3.5 w-3.5 text-amber-400" />
                                                <span>Alasan &amp; Timeline Pending</span>
                                            </div>
                                            <div className="text-[10px] text-[#A19F8D] mt-0.5 leading-tight">
                                                Rincian kendala sparepart/vendor pada tiket yang tertunda.
                                            </div>
                                        </div>
                                    </label>

                                    {/* 3. Solution Notes */}
                                    <label className="p-3 rounded-xl bg-[#1C1B0E] border border-[#3B3929] flex items-start gap-3 cursor-pointer hover:border-[#615F52] transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={includeSolutionNotes}
                                            onChange={(e) => setIncludeSolutionNotes(e.target.checked)}
                                            className="mt-0.5 rounded text-[#C9AA71] focus:ring-[#C9AA71] h-4 w-4 bg-[#242217] border-[#3B3929]"
                                        />
                                        <div>
                                            <div className="text-xs font-bold text-[#FAFAFA] flex items-center gap-1.5">
                                                <Wrench className="h-3.5 w-3.5 text-emerald-400" />
                                                <span>Catatan Solusi (Solved Notes)</span>
                                            </div>
                                            <div className="text-[10px] text-[#A19F8D] mt-0.5 leading-tight">
                                                Catatan perbaikan dan tindakan teknis pada tiket selesai.
                                            </div>
                                        </div>
                                    </label>

                                    {/* 4. Audit Trail */}
                                    <label className="p-3 rounded-xl bg-[#1C1B0E] border border-[#3B3929] flex items-start gap-3 cursor-pointer hover:border-[#615F52] transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={includeAuditTrail}
                                            onChange={(e) => setIncludeAuditTrail(e.target.checked)}
                                            className="mt-0.5 rounded text-[#C9AA71] focus:ring-[#C9AA71] h-4 w-4 bg-[#242217] border-[#3B3929]"
                                        />
                                        <div>
                                            <div className="text-xs font-bold text-[#FAFAFA] flex items-center gap-1.5">
                                                <History className="h-3.5 w-3.5 text-blue-400" />
                                                <span>Riwayat Perubahan (Audit Trail)</span>
                                            </div>
                                            <div className="text-[10px] text-[#A19F8D] mt-0.5 leading-tight">
                                                Jejak lengkap siapa yang klaim, ubah status, atau edit tiket.
                                            </div>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Execution Log */}
                            {lastDispatchedAt && (
                                <div className="p-3 rounded-xl bg-[#1C1B0E] border border-[#2E2C1E] text-xs text-[#A19F8D] flex items-center justify-between">
                                    <span>Pengiriman Terakhir Anda:</span>
                                    <span className="font-semibold text-[#FAFAFA]">
                                        {new Date(lastDispatchedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                                    </span>
                                </div>
                            )}
                        </>
                    )}

                </div>

                {/* Footer Buttons */}
                <DialogFooter className="px-6 py-4 border-t border-[#3B3929] bg-[#16150B] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleTestDispatch}
                        disabled={isTesting || isLoading}
                        className="border-[#C9AA71]/40 text-[#C9AA71] hover:bg-[#C9AA71]/15 hover:border-[#C9AA71] text-xs"
                    >
                        {isTesting ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                Membuat &amp; Mengirim Laporan Tes...
                            </>
                        ) : (
                            <>
                                <Send className="h-3.5 w-3.5 mr-1.5" />
                                Kirim Uji Coba Laporan Sekarang
                            </>
                        )}
                    </Button>

                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            className="text-xs text-[#A19F8D] hover:text-white"
                        >
                            Tutup
                        </Button>

                        <Button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving || isLoading}
                            className="bg-[#C9AA71] hover:bg-[#B8985E] text-[#1C1B0E] font-bold text-xs"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                    Menyimpan...
                                </>
                            ) : (
                                'Simpan Pengaturan'
                            )}
                        </Button>
                    </div>
                </DialogFooter>

            </DialogContent>
        </Dialog>
    );
}
