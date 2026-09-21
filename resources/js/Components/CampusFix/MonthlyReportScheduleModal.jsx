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
    Calendar, Clock, Users, ShieldCheck, Mail, Send, Loader2, CheckCircle2, 
    AlertCircle, Plus, X, Sparkles, Sliders, FileText, BellRing
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export function MonthlyReportScheduleModal({ open, onOpenChange }) {
    const { t, lang } = useLanguage();

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [toastMessage, setToastMessage] = useState(null);

    // Form state
    const [isEnabled, setIsEnabled] = useState(false);
    const [dayOfMonth, setDayOfMonth] = useState(1);
    const [dispatchTime, setDispatchTime] = useState('08:00');
    const [sendToAllHods, setSendToAllHods] = useState(true);
    const [sendToAdmins, setSendToAdmins] = useState(true);
    const [includeDelayTimeline, setIncludeDelayTimeline] = useState(true);
    const [additionalRecipients, setAdditionalRecipients] = useState([]);
    const [emailInput, setEmailInput] = useState('');
    const [lastDispatchedAt, setLastDispatchedAt] = useState(null);
    const [lastDispatchSummary, setLastDispatchSummary] = useState(null);

    // Fetch existing settings on open
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
            if (res.data?.success && res.data?.config) {
                const c = res.data.config;
                setIsEnabled(Boolean(c.is_enabled));
                setDayOfMonth(c.day_of_month || 1);
                setDispatchTime(c.dispatch_time || '08:00');
                setSendToAllHods(Boolean(c.send_to_all_hods));
                setSendToAdmins(Boolean(c.send_to_admins));
                setIncludeDelayTimeline(Boolean(c.include_delay_timeline));
                setAdditionalRecipients(Array.isArray(c.additional_recipients) ? c.additional_recipients : []);
                setLastDispatchedAt(c.last_dispatched_at);
                setLastDispatchSummary(c.last_dispatch_summary);
            }
        } catch (err) {
            console.error('Failed to load report schedule', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddEmail = (e) => {
        e?.preventDefault();
        const trimmed = emailInput.trim().toLowerCase();
        if (!trimmed) return;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmed)) {
            setToastMessage({ type: 'error', text: 'Format alamat email tidak valid.' });
            return;
        }
        if (additionalRecipients.includes(trimmed)) {
            setEmailInput('');
            return;
        }
        setAdditionalRecipients(prev => [...prev, trimmed]);
        setEmailInput('');
        setToastMessage(null);
    };

    const handleRemoveEmail = (email) => {
        setAdditionalRecipients(prev => prev.filter(e => e !== email));
    };

    const handleSave = async () => {
        setIsSaving(true);
        setToastMessage(null);
        try {
            const res = await axios.post('/api/report-schedule', {
                is_enabled: isEnabled,
                day_of_month: parseInt(dayOfMonth),
                dispatch_time: dispatchTime,
                send_to_all_hods: sendToAllHods,
                send_to_admins: sendToAdmins,
                include_delay_timeline: includeDelayTimeline,
                additional_recipients: additionalRecipients,
            });

            if (res.data?.success) {
                setToastMessage({
                    type: 'success',
                    text: res.data.message || 'Pengaturan laporan bulanan berhasil disimpan!'
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
                                Automated Monthly Report Settings
                            </DialogTitle>
                            <DialogDescription className="text-xs text-[#A19F8D] mt-0.5">
                                Jadwal rekapitulasi laporan bulanan resmi otomatis untuk Admin &amp; HOD.
                            </DialogDescription>
                        </div>
                    </div>
                </div>

                {/* Body Content */}
                <div className="px-6 py-5 max-h-[70vh] overflow-y-auto space-y-5">

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
                            <span className="text-xs">Memuat konfigurasi jadwal...</span>
                        </div>
                    ) : (
                        <>
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
                                            Aktifkan Pengiriman Otomatis Setiap Bulan
                                        </div>
                                        <div className="text-xs text-[#A19F8D]">
                                            Sistem akan membuat PDF dan mengirimkan email laporan secara berkala.
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

                            {/* Schedule Timing Options */}
                            <div className="p-4 rounded-xl bg-[#242217] border border-[#3B3929] space-y-3">
                                <div className="text-xs font-bold uppercase tracking-wider text-[#C9AA71] flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span>Waktu &amp; Tanggal Eksekusi</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                    <div>
                                        <label className="text-xs text-[#A19F8D] block mb-1">
                                            Tanggal Pengiriman Bulanan
                                        </label>
                                        <select
                                            value={dayOfMonth}
                                            onChange={(e) => setDayOfMonth(parseInt(e.target.value))}
                                            className="w-full bg-[#1C1B0E] border border-[#3B3929] rounded-lg px-3 py-2 text-xs text-[#FAFAFA] focus:outline-none focus:border-[#C9AA71]"
                                        >
                                            <option value={1}>Tanggal 1 (Awal Bulan - Rekap Bulan Lalu)</option>
                                            <option value={2}>Tanggal 2</option>
                                            <option value={5}>Tanggal 5</option>
                                            <option value={10}>Tanggal 10</option>
                                            <option value={15}>Tanggal 15</option>
                                            <option value={20}>Tanggal 20</option>
                                            <option value={25}>Tanggal 25</option>
                                            <option value={28}>Tanggal 28 (Akhir Bulan)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-xs text-[#A19F8D] block mb-1">
                                            Jam Pengiriman (WIB)
                                        </label>
                                        <select
                                            value={dispatchTime}
                                            onChange={(e) => setDispatchTime(e.target.value)}
                                            className="w-full bg-[#1C1B0E] border border-[#3B3929] rounded-lg px-3 py-2 text-xs text-[#FAFAFA] focus:outline-none focus:border-[#C9AA71]"
                                        >
                                            <option value="07:00">07:00 WIB (Pagi Hari)</option>
                                            <option value="08:00">08:00 WIB (Jam Kerja Masuk)</option>
                                            <option value="09:00">09:00 WIB</option>
                                            <option value="12:00">12:00 WIB (Siang)</option>
                                            <option value="17:00">17:00 WIB (Sore)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Recipients & Smart Scoping */}
                            <div className="p-4 rounded-xl bg-[#242217] border border-[#3B3929] space-y-3">
                                <div className="text-xs font-bold uppercase tracking-wider text-[#C9AA71] flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5" />
                                    <span>Penerima &amp; Cakupan Laporan (Smart Scoping)</span>
                                </div>

                                <div className="space-y-2.5 pt-1">
                                    {/* HOD Checkbox */}
                                    <label className="flex items-start gap-3 p-2.5 rounded-lg bg-[#1C1B0E] border border-[#2E2C1E] cursor-pointer hover:border-[#3B3929] transition-all">
                                        <input
                                            type="checkbox"
                                            checked={sendToAllHods}
                                            onChange={(e) => setSendToAllHods(e.target.checked)}
                                            className="mt-0.5 rounded text-[#C9AA71] focus:ring-[#C9AA71] h-4 w-4 bg-[#242217] border-[#3B3929]"
                                        />
                                        <div>
                                            <div className="text-xs font-semibold text-[#FAFAFA]">
                                                Kirim ke Semua HOD Departemen (Department Scoped)
                                            </div>
                                            <div className="text-[11px] text-[#A19F8D] mt-0.5">
                                                Setiap HOD otomatis hanya menerima laporan bulanan yang difilter spesifik untuk departemen mereka (Housekeeping, FB, Engineering, IT, dll).
                                            </div>
                                        </div>
                                    </label>

                                    {/* Admin Checkbox */}
                                    <label className="flex items-start gap-3 p-2.5 rounded-lg bg-[#1C1B0E] border border-[#2E2C1E] cursor-pointer hover:border-[#3B3929] transition-all">
                                        <input
                                            type="checkbox"
                                            checked={sendToAdmins}
                                            onChange={(e) => setSendToAdmins(e.target.checked)}
                                            className="mt-0.5 rounded text-[#C9AA71] focus:ring-[#C9AA71] h-4 w-4 bg-[#242217] border-[#3B3929]"
                                        />
                                        <div>
                                            <div className="text-xs font-semibold text-[#FAFAFA]">
                                                Kirim ke Administrator / Management (All Scope)
                                            </div>
                                            <div className="text-[11px] text-[#A19F8D] mt-0.5">
                                                Admin menerima rekap komprehensif seluruh departemen dan seluruh villa resort.
                                            </div>
                                        </div>
                                    </label>

                                    {/* Include Delay Timeline */}
                                    <label className="flex items-start gap-3 p-2.5 rounded-lg bg-[#1C1B0E] border border-[#2E2C1E] cursor-pointer hover:border-[#3B3929] transition-all">
                                        <input
                                            type="checkbox"
                                            checked={includeDelayTimeline}
                                            onChange={(e) => setIncludeDelayTimeline(e.target.checked)}
                                            className="mt-0.5 rounded text-[#C9AA71] focus:ring-[#C9AA71] h-4 w-4 bg-[#242217] border-[#3B3929]"
                                        />
                                        <div>
                                            <div className="text-xs font-semibold text-[#FAFAFA]">
                                                Sertakan Catatan &amp; Alasan Tiket Pending (Delay Timeline)
                                            </div>
                                            <div className="text-[11px] text-[#A19F8D] mt-0.5">
                                                Menampilkan catatan alasan keterlambatan pada tiket yang berstatus Pending di dalam PDF.
                                            </div>
                                        </div>
                                    </label>
                                </div>

                                {/* Custom Extra Emails */}
                                <div className="pt-2">
                                    <label className="text-xs text-[#A19F8D] block mb-1.5 font-medium">
                                        Email Tambahan (Opsional - misal Direksi/Owner)
                                    </label>
                                    <form onSubmit={handleAddEmail} className="flex gap-2 mb-2">
                                        <input
                                            type="email"
                                            placeholder="ketik email lalu tekan Enter / Tambah..."
                                            value={emailInput}
                                            onChange={(e) => setEmailInput(e.target.value)}
                                            className="flex-1 bg-[#1C1B0E] border border-[#3B3929] rounded-lg px-3 py-1.5 text-xs text-[#FAFAFA] placeholder:text-[#615F52] focus:outline-none focus:border-[#C9AA71]"
                                        />
                                        <Button
                                            type="submit"
                                            variant="secondary"
                                            className="px-3 py-1.5 text-xs bg-[#2E2C1E] text-[#C9AA71] border border-[#3B3929] hover:bg-[#3B3929]"
                                        >
                                            <Plus className="h-3.5 w-3.5 mr-1" />
                                            Tambah
                                        </Button>
                                    </form>

                                    {additionalRecipients.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {additionalRecipients.map(email => (
                                                <span
                                                    key={email}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA]"
                                                >
                                                    <Mail className="h-3 w-3 text-[#C9AA71]" />
                                                    {email}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveEmail(email)}
                                                        className="text-[#A19F8D] hover:text-rose-400"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Execution Log & Status */}
                            {lastDispatchedAt && (
                                <div className="p-3 rounded-xl bg-[#1C1B0E] border border-[#2E2C1E] text-xs text-[#A19F8D] flex items-center justify-between">
                                    <span>Pengiriman Terakhir:</span>
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
                                Membuat &amp; Mengirim PDF Tes...
                            </>
                        ) : (
                            <>
                                <Send className="h-3.5 w-3.5 mr-1.5" />
                                Kirim Percobaan Sekarang (Test Run)
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
