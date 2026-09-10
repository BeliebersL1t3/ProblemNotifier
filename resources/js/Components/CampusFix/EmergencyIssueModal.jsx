import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/Components/UI/Button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/UI/Dialog';
import { Input } from '@/Components/UI/Input';
import { Label } from '@/Components/UI/Label';
import { Textarea } from '@/Components/UI/Textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/Components/UI/Select';
import { ImageDropzone } from './ImageDropzone';
import { useIssues } from '@/context/IssuesContext';
import { useLanguage } from '@/context/LanguageContext';
import { 
    Loader2, AlertTriangle, Flame, HeartPulse, Zap, 
    Droplets, Anchor, ShieldAlert, Camera
} from 'lucide-react';
import { ALL_DEPARTMENTS, getStaffForDepartment } from '@/constants/staff';
import { getDepartmentTheme } from '@/constants/departments';
import { useAuth } from '@/hooks/useAuth';

export function EmergencyIssueModal({ open, onOpenChange }) {
    const { t, lang } = useLanguage();
    const { addIssue } = useIssues();
    const { isDeptUser, department, staffName } = useAuth();
    const [originDept, setOriginDept] = useState('');
    const [reporter, setReporter] = useState('');
    const [title, setTitle] = useState('');
    const [selectedPreset, setSelectedPreset] = useState('');
    const [locMain, setLocMain] = useState('');
    const [locDetail, setLocDetail] = useState('');
    const [description, setDescription] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imageUrl, setImageUrl] = useState(undefined);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (open) {
            if (isDeptUser && department) {
                setOriginDept(department);
                if (staffName) setReporter(staffName);
            }
        }
    }, [open, isDeptUser, department, staffName]);

    const staffForOriginDept = useMemo(() => {
        if (!originDept) return [];
        return getStaffForDepartment(originDept);
    }, [originDept]);

    const handleOriginDeptChange = (dept) => {
        setOriginDept(dept);
        setReporter('');
    };

    const EMERGENCY_PRESETS = [
        {
            id: 'fire',
            labelEn: 'Fire / Electrical Hazard',
            labelId: 'Kebakaran / Bahaya Listrik',
            icon: Flame,
            color: 'text-orange-400 border-orange-500/40 bg-orange-950/30 hover:bg-orange-900/40',
        },
        {
            id: 'medical',
            labelEn: 'Medical / Guest Injury',
            labelId: 'Medis / Cedera Tamu',
            icon: HeartPulse,
            color: 'text-rose-400 border-rose-500/40 bg-rose-950/30 hover:bg-rose-900/40',
        },
        {
            id: 'power',
            labelEn: 'Power / Generator Failure',
            labelId: 'Mati Total / Genset Rusak',
            icon: Zap,
            color: 'text-yellow-400 border-yellow-500/40 bg-yellow-950/30 hover:bg-yellow-900/40',
        },
        {
            id: 'water',
            labelEn: 'Major Flood / Pipe Burst',
            labelId: 'Pipa Pecah / Banjir Besar',
            icon: Droplets,
            color: 'text-cyan-400 border-cyan-500/40 bg-cyan-950/30 hover:bg-cyan-900/40',
        },
        {
            id: 'marine',
            labelEn: 'Boat / Jetty Incident',
            labelId: 'Insiden Kapal / Dermaga',
            icon: Anchor,
            color: 'text-blue-400 border-blue-500/40 bg-blue-950/30 hover:bg-blue-900/40',
        },
        {
            id: 'safety',
            labelEn: 'Structural / Safety Risk',
            labelId: 'Struktur Runtuh / Bahaya Fisik',
            icon: ShieldAlert,
            color: 'text-red-400 border-red-500/40 bg-red-950/30 hover:bg-red-900/40',
        },
    ];

    const handlePresetClick = (preset) => {
        const label = lang === 'id' ? preset.labelId : preset.labelEn;
        setSelectedPreset(preset.id);
        if (!title || EMERGENCY_PRESETS.some(p => title.includes(lang === 'id' ? p.labelId : p.labelEn))) {
            setTitle(label);
        } else {
            setTitle(`[${label}] ${title}`);
        }
    };

    const location = locMain
        ? (locDetail.trim() ? `${locMain} - ${locDetail.trim()}` : locMain)
        : locDetail.trim();

    const MAIN_LOCATIONS = ['TPI', 'TBR', 'Kantor'];
    const valid = reporter.trim() && title.trim() && location.trim() && originDept;

    const reset = () => {
        setOriginDept(isDeptUser && department ? department : '');
        setReporter(isDeptUser && staffName ? staffName : '');
        setTitle('');
        setSelectedPreset('');
        setLocMain('');
        setLocDetail('');
        setDescription('');
        setImageFile(null);
        setImageUrl(undefined);
        setErrorMsg('');
        setIsSubmitting(false);
    };

    const submit = async () => {
        if (!valid || isSubmitting) return;
        setIsSubmitting(true);
        setErrorMsg('');

        try {
            const finalDesc = description.trim() 
                ? `${description.trim()} [EMERGENCY FAST-TRACK]`
                : '[EMERGENCY FAST-TRACK]';

            const res = await addIssue({
                reporter: reporter.trim(),
                title: title.trim(),
                location: location.trim(),
                department: originDept || 'Emergency',
                assignedDepartments: 'ALL',
                taggedDepartments: 'ALL',
                category: 'emergency',
                description: finalDesc,
                imageFile: imageFile || null,
                priority: 'critical',
                deadline: Date.now().toString(),
            });

            if (res?.queuedOffline) {
                alert(lang === 'id'
                    ? `📡 Wi-Fi terputus. Laporan DARURAT "${title}" berhasil disimpan di antrean offline lokal dan akan otomatis terkirim begitu Anda terhubung ke Wi-Fi kembali.`
                    : `📡 Wi-Fi disconnected. EMERGENCY report "${title}" stored in offline queue and will automatically send once reconnected.`
                );
            }

            reset();
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            setErrorMsg(err.response?.data?.message || err.message || 'Display Error: Upload Failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!isSubmitting) onOpenChange(o); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl border-2 border-red-500 shadow-[0_0_35px_rgba(239,68,68,0.4)] bg-[#190909]/95 text-white backdrop-blur-2xl">
                <DialogHeader>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <DialogTitle className="flex items-center gap-2.5 text-2xl font-black tracking-tight text-red-500">
                            <AlertTriangle className="h-6 w-6 animate-pulse text-red-400 shrink-0" />
                            <span>{lang === 'id' ? 'LAPORAN DARURAT' : 'EMERGENCY REPORT'}</span>
                        </DialogTitle>
                        <span className="px-3 py-1 rounded-full text-[11px] font-black tracking-wider uppercase bg-red-600 text-white shadow-md animate-pulse">
                            🚨 FAST-TRACK (NOW)
                        </span>
                    </div>
                    <DialogDescription className="text-xs text-red-200/90 leading-relaxed mt-1">
                        {lang === 'id'
                            ? 'Jalur cepat untuk situasi kritis yang membutuhkan respons darurat segera oleh seluruh tim resor.'
                            : 'Fast-track protocol for critical situations demanding immediate cross-department emergency action.'}
                    </DialogDescription>
                </DialogHeader>

                {/* Emergency Protocol Broadcast Banner */}
                <div className="p-3.5 rounded-xl border border-red-500/40 bg-red-950/40 space-y-2 mt-1">
                    <div className="flex items-start gap-2.5">
                        <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                        <div className="text-xs space-y-1">
                            <p className="font-bold text-red-100">
                                {lang === 'id' ? 'Dampak Pengiriman Darurat:' : 'Immediate Actions Triggered:'}
                            </p>
                            <ul className="list-disc list-inside text-red-200/80 space-y-0.5 leading-relaxed text-[11px]">
                                <li>{lang === 'id' ? 'Sirene audio berbunyi otomatis di dashboard semua staf yang sedang online.' : 'Audio alarm siren triggers instantly on all active staff dashboards.'}</li>
                                <li>{lang === 'id' ? 'Notifikasi prioritas tinggi terkirim ke WhatsApp Bot grup penanganan.' : 'High-priority notification dispatched to WhatsApp Bot groups.'}</li>
                                <li>{lang === 'id' ? 'Ditugaskan ke SEMUA departemen (ALL) dengan tenggat waktu SEKARANG.' : 'Dispatched to ALL departments simultaneously with deadline NOW.'}</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {errorMsg && (
                    <div className="rounded-xl bg-red-900/50 p-3 text-xs font-semibold text-red-100 border border-red-500 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                <div className="grid gap-4 mt-1">
                    {/* Step 1: Origin Department */}
                    <div className="grid gap-2 p-3 rounded-xl border border-red-500/40 bg-red-950/30">
                        <Label htmlFor="sos-originDept" className="text-red-300 font-semibold flex items-center gap-1.5 text-xs sm:text-sm">
                            🏠 1. Origin Department (Your Dept) <span className="text-xs text-red-400">*</span>
                        </Label>
                        {isDeptUser && originDept ? (
                            <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-black/60 border border-red-900/50">
                                <span className="text-xs font-bold text-red-400">🔒 {originDept}</span>
                                <span 
                                    className="px-2.5 py-0.5 rounded text-[11px] font-extrabold uppercase shadow-xs"
                                    style={{ 
                                        backgroundColor: getDepartmentTheme(originDept).bg, 
                                        color: getDepartmentTheme(originDept).text 
                                    }}
                                >
                                    {originDept}
                                </span>
                            </div>
                        ) : (
                            <Select value={originDept} onValueChange={handleOriginDeptChange} disabled={isSubmitting}>
                                <SelectTrigger id="sos-originDept" className="border-red-900/50 bg-black/60 text-white focus-visible:ring-red-500">
                                    <SelectValue placeholder="-- Select Your Department --" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 text-white border-zinc-800">
                                    {ALL_DEPARTMENTS.map((dept) => (
                                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {/* Step 2: Submitter Name */}
                    <div className="grid gap-2 p-3 rounded-xl border border-red-900/40 bg-black/40">
                        <div className="flex items-center justify-between">
                            <Label className="text-red-300 font-semibold flex items-center gap-1.5 text-xs sm:text-sm">
                                👤 2. Submitter Name (Pelapor) <span className="text-xs text-red-400">*</span>
                            </Label>
                            {originDept && (
                                <span className="text-xs text-red-400 font-medium">
                                    {originDept} Staff
                                </span>
                            )}
                        </div>

                        {isDeptUser && (staffName || reporter) ? (
                            <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/60 border border-red-900/50">
                                <span className="text-xs font-bold text-red-300 flex items-center gap-1.5">
                                    <span>🔒</span> {staffName || reporter}
                                </span>
                                <span className="text-[11px] text-red-400/80 font-medium">
                                    {lang === 'id' ? 'Terkunci ke akun Anda' : 'Locked to your account'}
                                </span>
                            </div>
                        ) : originDept ? (
                            staffForOriginDept.length > 0 ? (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {staffForOriginDept.map(name => (
                                        <button
                                            key={name}
                                            type="button"
                                            disabled={isSubmitting}
                                            onClick={() => setReporter(name)}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-all cursor-pointer ${
                                                reporter === name
                                                    ? 'bg-red-600 text-white border-red-400 shadow-md ring-2 ring-red-500/40'
                                                    : 'bg-black/50 text-red-300 border-red-900/60 hover:border-red-500/50 hover:bg-red-950/40'
                                            }`}
                                        >
                                            {reporter === name ? `✓ ${name}` : name}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <Input
                                    id="sos-reporter"
                                    value={reporter}
                                    onChange={(e) => setReporter(e.target.value)}
                                    placeholder="Enter your name..."
                                    disabled={isSubmitting}
                                    className="border-red-900/50 bg-black/50 text-white placeholder:text-red-800 focus-visible:ring-red-500"
                                />
                            )
                        ) : (
                            <p className="text-xs text-red-400/80 italic py-1">
                                👆 {lang === 'id' ? 'Pilih Departemen Asal terlebih dahulu untuk memilih nama.' : 'Please select an Origin Department above to choose your name.'}
                            </p>
                        )}
                    </div>

                    {/* Step 3: Quick Emergency Presets */}
                    <div className="grid gap-2 p-3 rounded-xl border border-red-900/40 bg-black/40">
                        <Label className="text-red-300 font-semibold flex items-center justify-between text-xs sm:text-sm">
                            <span>⚡ Quick Emergency Scenario (Tap to prefill)</span>
                            <span className="text-[11px] text-red-400/80 font-normal">{lang === 'id' ? 'Opsional' : 'Optional'}</span>
                        </Label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-0.5">
                            {EMERGENCY_PRESETS.map((preset) => {
                                const PresetIcon = preset.icon;
                                const isSelected = selectedPreset === preset.id;
                                const label = lang === 'id' ? preset.labelId : preset.labelEn;
                                return (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => handlePresetClick(preset)}
                                        disabled={isSubmitting}
                                        className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs font-semibold transition-all cursor-pointer select-none ${
                                            isSelected
                                                ? 'bg-red-600 text-white border-red-400 ring-2 ring-red-500/50 shadow-md scale-[1.02]'
                                                : preset.color
                                        }`}
                                    >
                                        <PresetIcon className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Step 4: Emergency Title */}
                    <div className="grid gap-2">
                        <Label htmlFor="sos-title" className="text-red-300 font-semibold text-xs sm:text-sm flex items-center gap-1">
                            <span>Emergency Title / Subject</span>
                            <span className="text-xs text-red-400">*</span>
                        </Label>
                        <Input
                            id="sos-title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={lang === 'id' ? 'Contoh: Kebakaran di dapur utama / Genset meledak' : 'e.g. Fire in main kitchen / Generator failure'}
                            disabled={isSubmitting}
                            className="border-red-900/50 bg-black/50 text-white placeholder:text-red-800 focus-visible:ring-red-500 font-bold"
                        />
                    </div>

                    {/* Step 5: Location */}
                    <div className="grid gap-2">
                        <Label className="text-red-300 font-semibold text-xs sm:text-sm flex items-center gap-1">
                            <span>Location</span>
                            <span className="text-xs text-red-400">*</span>
                        </Label>
                        <div className="flex gap-2">
                            {MAIN_LOCATIONS.map(loc => (
                                <button
                                    key={loc}
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={() => setLocMain(prev => prev === loc ? '' : loc)}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                                        locMain === loc
                                            ? 'bg-red-600 text-white border-red-400 shadow-sm'
                                            : 'bg-black/40 text-red-300 border-red-900/60 hover:border-red-500/50'
                                    }`}
                                >
                                    {loc}
                                </button>
                            ))}
                        </div>
                        <Input
                            id="sos-location"
                            value={locDetail}
                            onChange={(e) => setLocDetail(e.target.value)}
                            placeholder={locMain ? `More specific in ${locMain}… (optional)` : (lang === 'id' ? 'Ketik lokasi spesifik...' : 'Or type specific location…')}
                            disabled={isSubmitting}
                            className="border-red-900/50 bg-black/50 text-white placeholder:text-red-800 focus-visible:ring-red-500"
                        />
                    </div>

                    {/* Step 6: Description */}
                    <div className="grid gap-2">
                        <Label htmlFor="sos-desc" className="text-red-300 text-xs sm:text-sm flex items-center justify-between">
                            <span>Details &amp; Current Situation</span>
                            <span className="text-[11px] text-red-400/80 font-normal">{lang === 'id' ? 'Opsional' : 'Optional'}</span>
                        </Label>
                        <Textarea
                            id="sos-desc"
                            rows={3}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={lang === 'id' ? 'Jelaskan kondisi bahaya, ada korban atau tidak, dan evakuasi yang sudah dilakukan...' : 'Describe what is happening, if people are evacuated, or urgent equipment needed.'}
                            disabled={isSubmitting}
                            className="border-red-900/50 bg-black/50 text-white placeholder:text-red-800 focus-visible:ring-red-500 text-xs"
                        />
                    </div>

                    {/* Step 7: Emergency Photo (Optional) */}
                    <div className="grid gap-2 p-3 rounded-xl border border-red-900/40 bg-black/40">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <Label className="text-red-300 font-semibold flex items-center gap-1.5 text-xs sm:text-sm">
                                <Camera className="h-4 w-4 text-red-400" />
                                <span>{lang === 'id' ? 'Foto Situasi Darurat' : 'Emergency Situation Photo'}</span>
                                <span className="text-[11px] font-normal text-red-400/80">({lang === 'id' ? 'Opsional' : 'Optional'})</span>
                            </Label>
                            {imageFile && (
                                <button
                                    type="button"
                                    onClick={() => { setImageFile(null); setImageUrl(undefined); }}
                                    className="text-[11px] text-red-400 hover:text-red-200 underline cursor-pointer"
                                >
                                    {lang === 'id' ? 'Hapus Foto' : 'Remove Photo'}
                                </button>
                            )}
                        </div>
                        <p className="text-[11px] text-red-300/80 leading-relaxed">
                            {lang === 'id'
                                ? 'Ambil foto langsung atau unggah jika situasi aman. Jangan menunda evakuasi atau membahayakan diri demi mengambil foto.'
                                : 'Snap a quick photo if safe to do so. Do NOT delay personal safety or evacuation for photo taking.'}
                        </p>
                        <div className="mt-1">
                            <ImageDropzone
                                previewUrl={imageUrl}
                                onChange={(file, preview) => {
                                    setImageFile(file);
                                    setImageUrl(preview);
                                }}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter className="mt-6 sm:justify-between gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                        className="text-red-300 hover:text-red-100 hover:bg-red-900/50 cursor-pointer text-xs sm:text-sm"
                    >
                        {t('cancel') || 'Cancel'}
                    </Button>
                    <Button
                        type="button"
                        onClick={submit}
                        disabled={!valid || isSubmitting}
                        className="bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.6)] border border-red-400 font-extrabold cursor-pointer text-xs sm:text-sm py-2.5 px-5"
                    >
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isSubmitting 
                            ? (lang === 'id' ? 'Mengirim S.O.S...' : 'Broadcasting S.O.S...') 
                            : (lang === 'id' ? '🚨 KIRIM LAPORAN DARURAT' : '🚨 SUBMIT EMERGENCY NOW')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
