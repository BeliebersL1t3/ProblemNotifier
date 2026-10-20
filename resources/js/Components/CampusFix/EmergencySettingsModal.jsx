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
import { Label } from '@/Components/UI/Label';
import { Input } from '@/Components/UI/Input';
import { useLanguage } from '@/context/LanguageContext';
import { 
    AlertTriangle, BellRing, Clock, ShieldCheck, 
    Check, Loader2, Volume2, Settings2, Sliders, Monitor
} from 'lucide-react';

export function EmergencySettingsModal({ open, onOpenChange, isAdmin = false, onSettingsUpdated }) {
    const { lang } = useLanguage();

    // User preference: Browser pop-up enabled/disabled (per-device)
    const [popupEnabled, setPopupEnabled] = useState(() => {
        try {
            return localStorage.getItem('campusfix_browser_popup_enabled') !== 'false';
        } catch (e) {
            return true;
        }
    });

    // Admin System-wide Emergency Settings
    const [slaMinutes, setSlaMinutes] = useState(15);
    const [customSla, setCustomSla] = useState('');
    const [slaPreset, setSlaPreset] = useState('15'); // '0', '10', '15', '30', '45', '60', 'custom'

    const [reminderMode, setReminderMode] = useState('standard'); // 'standard' | 'interval'
    const [intervalMinutes, setIntervalMinutes] = useState(5);
    const [intervalPreset, setIntervalPreset] = useState('5'); // '2', '5', '10', '15', '30', 'custom'
    const [customInterval, setCustomInterval] = useState('');

    const [allowCustomSla, setAllowCustomSla] = useState(true);
    const [lastUpdatedBy, setLastUpdatedBy] = useState(null);
    const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    // Fetch current system settings from server on modal open
    useEffect(() => {
        if (!open) return;

        // Sync local popup state with storage
        try {
            setPopupEnabled(localStorage.getItem('campusfix_browser_popup_enabled') !== 'false');
        } catch (e) {}

        const fetchSettings = async () => {
            setIsLoading(true);
            setErrorMsg('');
            try {
                const res = await axios.get('/api/settings/emergency');
                if (res.data?.success && res.data.settings) {
                    const s = res.data.settings;
                    const sla = typeof s.sla_minutes === 'number' ? s.sla_minutes : 15;
                    setSlaMinutes(sla);
                    if (['0', '10', '15', '30', '45', '60'].includes(String(sla))) {
                        setSlaPreset(String(sla));
                        setCustomSla('');
                    } else {
                        setSlaPreset('custom');
                        setCustomSla(String(sla));
                    }

                    const mode = s.reminder_mode || 'standard';
                    setReminderMode(mode);

                    const interval = typeof s.interval_minutes === 'number' ? s.interval_minutes : 5;
                    setIntervalMinutes(interval);
                    if (['2', '5', '10', '15', '30'].includes(String(interval))) {
                        setIntervalPreset(String(interval));
                        setCustomInterval('');
                    } else {
                        setIntervalPreset('custom');
                        setCustomInterval(String(interval));
                    }

                    setAllowCustomSla(s.allow_reporter_custom_sla !== false);
                    setLastUpdatedBy(s.updated_by || null);
                    setLastUpdatedAt(s.updated_at || null);
                }
            } catch (err) {
                console.error('Failed to load emergency settings:', err);
                setErrorMsg(lang === 'id' ? 'Gagal memuat pengaturan darurat dari server.' : 'Failed to load emergency settings from server.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchSettings();
    }, [open, lang]);

    // Save user popup preference locally
    const handleTogglePopup = (enabled) => {
        setPopupEnabled(enabled);
        try {
            localStorage.setItem('campusfix_browser_popup_enabled', enabled ? 'true' : 'false');
            window.dispatchEvent(new CustomEvent('campusfix-popup-preference-changed', {
                detail: { popupEnabled: enabled }
            }));
        } catch (e) {}
    };

    // Handle Admin SLA preset change
    const handleSlaPresetChange = (preset) => {
        setSlaPreset(preset);
        if (preset !== 'custom') {
            const val = parseInt(preset, 10);
            setSlaMinutes(val);
        } else if (customSla) {
            setSlaMinutes(parseInt(customSla, 10) || 15);
        }
    };

    // Handle Admin Interval preset change
    const handleIntervalPresetChange = (preset) => {
        setIntervalPreset(preset);
        if (preset !== 'custom') {
            const val = parseInt(preset, 10);
            setIntervalMinutes(val);
        } else if (customInterval) {
            setIntervalMinutes(parseInt(customInterval, 10) || 5);
        }
    };

    // Save Admin system-wide settings
    const handleSaveAdminSettings = async () => {
        setIsSaving(true);
        setErrorMsg('');
        setSaveSuccess(false);

        const finalSla = slaPreset === 'custom' ? (parseInt(customSla, 10) || 0) : slaMinutes;
        const finalInterval = intervalPreset === 'custom' ? (parseInt(customInterval, 10) || 5) : intervalMinutes;

        try {
            const res = await axios.post('/api/settings/emergency', {
                sla_minutes: finalSla,
                reminder_mode: reminderMode,
                interval_minutes: finalInterval,
                allow_reporter_custom_sla: allowCustomSla,
            });

            if (res.data?.success) {
                setSaveSuccess(true);
                if (onSettingsUpdated) {
                    onSettingsUpdated(res.data.settings);
                }
                setTimeout(() => {
                    setSaveSuccess(false);
                    onOpenChange(false);
                }, 1200);
            } else {
                throw new Error(res.data?.message || 'Failed to save');
            }
        } catch (err) {
            console.error('Failed to save emergency settings:', err);
            setErrorMsg(err.response?.data?.message || err.message || (lang === 'id' ? 'Gagal menyimpan pengaturan.' : 'Failed to save settings.'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl border border-red-500/40 shadow-[0_0_35px_rgba(239,68,68,0.25)] bg-[#190909]/95 text-white backdrop-blur-2xl">
                <DialogHeader>
                    <div className="flex items-center gap-2.5 text-xl font-bold text-red-400">
                        <Sliders className="h-5 w-5 shrink-0" />
                        <span>{lang === 'id' ? 'Penyesuaian Emergency & Notifikasi' : 'Emergency & Notification Settings'}</span>
                    </div>
                    <DialogDescription className="text-xs text-red-200/80 leading-relaxed mt-1">
                        {isAdmin
                            ? (lang === 'id'
                                ? 'Sebagai Administrator, Anda berwenang mengatur SLA batas waktu tanggap darurat dan interval frekuensi pengingat yang berlaku bagi seluruh resort.'
                                : 'As an Administrator, you can configure the resort-wide emergency SLA response target and alarm frequency intervals.')
                            : (lang === 'id'
                                ? 'Pengaturan interval darurat ditentukan oleh Administrator. Anda dapat mengatur preferensi tampilan notifikasi pop-up di browser Anda di bawah ini.'
                                : 'Emergency intervals are configured by Administrators. You can customize your local browser pop-up notification preference below.')}
                    </DialogDescription>
                </DialogHeader>

                {errorMsg && (
                    <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/60 text-red-200 text-xs font-medium">
                        ⚠️ {errorMsg}
                    </div>
                )}

                {saveSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/60 text-emerald-200 text-xs font-semibold flex items-center gap-2">
                        <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                        <span>{lang === 'id' ? 'Pengaturan darurat berhasil disimpan dan diterapkan!' : 'Emergency settings successfully saved and applied!'}</span>
                    </div>
                )}

                <div className="space-y-5 my-2">
                    {/* SECTION 1: USER PREFERENCE (Available for EVERY user) */}
                    <div className="p-4 rounded-xl border border-[#C9AA71]/30 bg-[#2A281E]/60 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Monitor className="h-4 w-4 text-[#E3D1AA]" />
                                <Label className="text-xs sm:text-sm font-bold text-[#E3D1AA]">
                                    {lang === 'id' ? 'Bentuk Notifikasi di Browser (Perangkat Ini)' : 'Browser Notification Style (This Device)'}
                                </Label>
                            </div>
                            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#C9AA71]/20 text-[#E3D1AA] border border-[#C9AA71]/40">
                                {lang === 'id' ? 'Preferensi Anda' : 'Your Preference'}
                            </span>
                        </div>
                        <p className="text-[11px] text-[#A19F8D] leading-relaxed">
                            {lang === 'id'
                                ? 'Pilih apakah Anda ingin menerima banner pop-up mengapung di layar saat ada tiket baru / darurat, atau hanya bunyi audio & tanda bel tanpa pop-up.'
                                : 'Choose whether to receive floating pop-up banners on screen for new/emergency tickets, or only audio chimes & bell counters without screen pop-ups.'}
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => handleTogglePopup(true)}
                                className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                                    popupEnabled
                                        ? 'bg-red-950/60 border-red-500 text-white shadow-sm ring-1 ring-red-500/40'
                                        : 'bg-black/30 border-white/10 text-white/70 hover:bg-white/5'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold flex items-center gap-1.5">
                                        <BellRing className="h-3.5 w-3.5 text-red-400" />
                                        <span>{lang === 'id' ? 'Pop-up Banner Aktif' : 'Pop-up Banner Active'}</span>
                                    </span>
                                    {popupEnabled && <Check className="h-3.5 w-3.5 text-red-400" />}
                                </div>
                                <span className="text-[10px] text-white/60">
                                    {lang === 'id' ? 'Muncul di pojok layar + suara' : 'Shows floating toast + audio'}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => handleTogglePopup(false)}
                                className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                                    !popupEnabled
                                        ? 'bg-amber-950/60 border-amber-500 text-white shadow-sm ring-1 ring-amber-500/40'
                                        : 'bg-black/30 border-white/10 text-white/70 hover:bg-white/5'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold flex items-center gap-1.5">
                                        <Volume2 className="h-3.5 w-3.5 text-amber-400" />
                                        <span>{lang === 'id' ? 'Hanya Suara & Bel' : 'Sound & Bell Only'}</span>
                                    </span>
                                    {!popupEnabled && <Check className="h-3.5 w-3.5 text-amber-400" />}
                                </div>
                                <span className="text-[10px] text-white/60">
                                    {lang === 'id' ? 'Tanpa pop-up yang menutupi layar' : 'No floating pop-up banners'}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* SECTION 2: ADMIN GLOBAL SYSTEM SETTINGS */}
                    <div className={`p-4 rounded-xl border space-y-4 ${
                        isAdmin 
                            ? 'border-red-900/60 bg-black/40' 
                            : 'border-white/10 bg-white/5 opacity-80'
                    }`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-red-400" />
                                <Label className="text-xs sm:text-sm font-bold text-red-300">
                                    {lang === 'id' ? 'Konfigurasi Sistem Darurat (Resort-Wide)' : 'System Emergency Configuration (Resort-Wide)'}
                                </Label>
                            </div>
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800">
                                {isAdmin ? (lang === 'id' ? 'Dikelola oleh Admin' : 'Admin Managed') : (lang === 'id' ? 'Hanya Baca (Admin Only)' : 'Read Only')}
                            </span>
                        </div>

                        {lastUpdatedBy && (
                            <p className="text-[10px] text-red-300/60 italic">
                                {lang === 'id' 
                                    ? `Terakhir diperbarui oleh ${lastUpdatedBy} (${new Date(lastUpdatedAt).toLocaleDateString('id-ID')})`
                                    : `Last updated by ${lastUpdatedBy}`}
                            </p>
                        )}

                        {/* Setting 1: SLA Target Response Minutes */}
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-white/90 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5 text-red-400" />
                                    <span>{lang === 'id' ? 'Target Waktu Tanggap Darurat (SLA Deadline)' : 'Emergency Response Target (SLA Deadline)'}</span>
                                </span>
                                <span className="text-[11px] font-mono text-red-400">
                                    {slaMinutes === 0 
                                        ? (lang === 'id' ? '0m (Langsung Overdue)' : '0m (Instant Overdue)')
                                        : `${slaMinutes} ${lang === 'id' ? 'Menit' : 'Mins'}`}
                                </span>
                            </Label>
                            <p className="text-[11px] text-white/60">
                                {lang === 'id'
                                    ? 'Batas waktu hitung mundur setelah tiket darurat dibuat sebelum statusnya berubah menjadi "CRITICAL OVERDUE".'
                                    : 'Countdown limit before an emergency ticket transitions into "CRITICAL OVERDUE".'}
                            </p>

                            {isAdmin ? (
                                <div className="space-y-2 pt-1">
                                    <div className="flex flex-wrap gap-1.5">
                                        {[
                                            { val: '0', label: lang === 'id' ? '0m (Segera)' : '0m (Now)' },
                                            { val: '10', label: '10m' },
                                            { val: '15', label: lang === 'id' ? '15m (Standar)' : '15m (Std)' },
                                            { val: '30', label: '30m' },
                                            { val: '45', label: '45m' },
                                            { val: '60', label: '1 Jam' },
                                            { val: 'custom', label: lang === 'id' ? 'Kustom...' : 'Custom...' },
                                        ].map((opt) => (
                                            <button
                                                key={opt.val}
                                                type="button"
                                                onClick={() => handleSlaPresetChange(opt.val)}
                                                className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition-all cursor-pointer ${
                                                    slaPreset === opt.val
                                                        ? 'bg-red-600 border-red-400 text-white shadow-sm'
                                                        : 'bg-black/40 border-white/10 text-white/70 hover:bg-white/10'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    {slaPreset === 'custom' && (
                                        <div className="flex items-center gap-2 pt-1">
                                            <Input
                                                type="number"
                                                min="0"
                                                max="1440"
                                                value={customSla}
                                                onChange={(e) => {
                                                    setCustomSla(e.target.value);
                                                    setSlaMinutes(parseInt(e.target.value, 10) || 0);
                                                }}
                                                placeholder={lang === 'id' ? 'Masukkan menit (cth: 20)' : 'Enter minutes (e.g. 20)'}
                                                className="border-red-900/60 bg-black/60 text-white text-xs max-w-[200px]"
                                            />
                                            <span className="text-xs text-white/70">{lang === 'id' ? 'menit' : 'minutes'}</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-xs font-mono font-bold text-red-300">
                                    {slaMinutes === 0 ? (lang === 'id' ? 'Langsung Overdue (0 Menit)' : 'Instant Overdue (0 Mins)') : `${slaMinutes} ${lang === 'id' ? 'Menit' : 'Minutes'}`}
                                </div>
                            )}
                        </div>

                        {/* Setting 2: Alarm Reminder Frequency */}
                        <div className="space-y-2 pt-2 border-t border-white/10">
                            <Label className="text-xs font-semibold text-white/90 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                    <Volume2 className="h-3.5 w-3.5 text-red-400" />
                                    <span>{lang === 'id' ? 'Interval Perhitungan & Pengingat Alarm (Chime)' : 'Alarm Calculation & Reminder Interval'}</span>
                                </span>
                                <span className="text-[11px] font-mono text-amber-300">
                                    {reminderMode === 'standard' 
                                        ? (lang === 'id' ? 'Standar Telunas (Progresif)' : 'Telunas Standard')
                                        : `${lang === 'id' ? 'Tiap' : 'Every'} ${intervalMinutes}m`}
                                </span>
                            </Label>
                            <p className="text-[11px] text-white/60">
                                {lang === 'id'
                                    ? 'Seberapa sering sistem membunyikan lonceng pengingat darurat saat insiden belum selesai.'
                                    : 'Frequency of repetitive alarm chimes while the emergency remains active.'}
                            </p>

                            {isAdmin ? (
                                <div className="space-y-2 pt-1">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setReminderMode('standard')}
                                            className={`flex-1 py-1.5 px-3 text-xs rounded-lg font-bold border transition-all cursor-pointer ${
                                                reminderMode === 'standard'
                                                    ? 'bg-amber-600 border-amber-400 text-white shadow-sm'
                                                    : 'bg-black/40 border-white/10 text-white/70 hover:bg-white/10'
                                            }`}
                                        >
                                            {lang === 'id' ? 'Standar Telunas (Progresif 1-5-10-30m...)' : 'Telunas Progressive'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setReminderMode('interval')}
                                            className={`flex-1 py-1.5 px-3 text-xs rounded-lg font-bold border transition-all cursor-pointer ${
                                                reminderMode === 'interval'
                                                    ? 'bg-red-600 border-red-400 text-white shadow-sm'
                                                    : 'bg-black/40 border-white/10 text-white/70 hover:bg-white/10'
                                            }`}
                                        >
                                            {lang === 'id' ? 'Interval Berulang Tetap' : 'Fixed Repeat Interval'}
                                        </button>
                                    </div>

                                    {reminderMode === 'interval' && (
                                        <div className="space-y-2 pt-1">
                                            <div className="flex flex-wrap gap-1.5">
                                                {[
                                                    { val: '2', label: 'Tiap 2m (Agresif)' },
                                                    { val: '5', label: 'Tiap 5m (Cepat)' },
                                                    { val: '10', label: 'Tiap 10m (Sedang)' },
                                                    { val: '15', label: 'Tiap 15m' },
                                                    { val: '30', label: 'Tiap 30m' },
                                                    { val: 'custom', label: lang === 'id' ? 'Kustom...' : 'Custom...' },
                                                ].map((opt) => (
                                                    <button
                                                        key={opt.val}
                                                        type="button"
                                                        onClick={() => handleIntervalPresetChange(opt.val)}
                                                        className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition-all cursor-pointer ${
                                                            intervalPreset === opt.val
                                                                ? 'bg-red-600 border-red-400 text-white shadow-sm'
                                                                : 'bg-black/40 border-white/10 text-white/70 hover:bg-white/10'
                                                        }`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                            {intervalPreset === 'custom' && (
                                                <div className="flex items-center gap-2 pt-1">
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        max="360"
                                                        value={customInterval}
                                                        onChange={(e) => {
                                                            setCustomInterval(e.target.value);
                                                            setIntervalMinutes(parseInt(e.target.value, 10) || 5);
                                                        }}
                                                        placeholder={lang === 'id' ? 'Masukkan interval (cth: 7)' : 'Enter interval (e.g. 7)'}
                                                        className="border-red-900/60 bg-black/60 text-white text-xs max-w-[200px]"
                                                    />
                                                    <span className="text-xs text-white/70">{lang === 'id' ? 'menit sekali' : 'minutes'}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-xs font-mono font-bold text-amber-200">
                                    {reminderMode === 'standard' 
                                        ? (lang === 'id' ? 'Standar Telunas (Progresif 1, 2, 3, 4, 5, 10, 15...)' : 'Telunas Progressive Standard')
                                        : `${lang === 'id' ? 'Setiap' : 'Every'} ${intervalMinutes} ${lang === 'id' ? 'menit' : 'minutes'}`}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="mt-4 sm:justify-between gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isSaving}
                        className="text-red-300 hover:text-red-100 hover:bg-red-900/50 cursor-pointer text-xs"
                    >
                        {lang === 'id' ? 'Tutup' : 'Close'}
                    </Button>
                    {isAdmin && (
                        <Button
                            type="button"
                            onClick={handleSaveAdminSettings}
                            disabled={isSaving || isLoading}
                            className="bg-red-600 hover:bg-red-500 text-white font-bold cursor-pointer text-xs py-2 px-4 shadow-md"
                        >
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isSaving ? (lang === 'id' ? 'Menyimpan...' : 'Saving...') : (lang === 'id' ? 'Simpan Pengaturan Admin' : 'Save Admin Settings')}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
