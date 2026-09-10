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
import { 
    Loader2, 
    AlertTriangle, 
    CalendarClock, 
    Edit3, 
    Image as ImageIcon, 
    RefreshCw, 
    X,
    User,
    Clock,
    Hourglass,
    CheckCircle2,
    Wrench,
    FileText,
    Camera,
    Lock,
    MapPin,
    Building,
    RotateCcw
} from 'lucide-react';
import { ALL_DEPARTMENTS, getStaffForDepartment, getDepartmentForStaff, normalizeDepartment } from '@/constants/staff';
import { getDepartmentTheme } from '@/constants/departments';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { InlineAnalogClockPicker } from './CircularTimePickerModal';

const MAIN_LOCATIONS = ['TPI', 'TBR', 'Kantor'];

export function EditIssueModal({ issue, open, onOpenChange, onSuccess }) {
    const { t, lang } = useLanguage();
    const { updateIssue, categories } = useIssues();
    const { user, isAdmin, isDeptUser, department: userDept } = useAuth();

    const normalizedUserDept = normalizeDepartment(userDept);
    const originDept = normalizeDepartment(issue?.department);
    const takerDept = normalizeDepartment(getDepartmentForStaff(issue?.taker, issue));
    const pendingDept = normalizeDepartment(getDepartmentForStaff(issue?.pendingBy, issue));
    const solverDept = normalizeDepartment(getDepartmentForStaff(issue?.solver, issue));
    
    const assignedDeptsList = useMemo(() => {
        if (!issue?.assignedDepartments) return [];
        const arr = Array.isArray(issue.assignedDepartments) ? issue.assignedDepartments : String(issue.assignedDepartments).split(',');
        return arr.map(d => normalizeDepartment(d.trim())).filter(Boolean);
    }, [issue]);

    // Granular Section Permissions:
    const canEditReport = isAdmin || (isDeptUser && normalizedUserDept && normalizedUserDept === originDept);
    const canEditClaim = isAdmin || (isDeptUser && normalizedUserDept && (
        (takerDept && normalizedUserDept === takerDept) || 
        (!issue?.taker && assignedDeptsList.includes(normalizedUserDept))
    ));
    const canEditPending = isAdmin || (isDeptUser && normalizedUserDept && (
        (pendingDept && normalizedUserDept === pendingDept) ||
        (!issue?.pendingBy && assignedDeptsList.includes(normalizedUserDept))
    ));
    const canEditSolved = isAdmin || (isDeptUser && normalizedUserDept && (
        (solverDept && normalizedUserDept === solverDept) ||
        assignedDeptsList.includes(normalizedUserDept)
    ));

    const canChangeStatus = isAdmin || canEditClaim || canEditPending || canEditSolved || canEditReport;

    // Status State
    const [selectedStatus, setSelectedStatus] = useState('open');
    const [statusReason, setStatusReason] = useState('');
    const [removePending, setRemovePending] = useState(false);

    // Section 1: Initial Issue Fields
    const [title, setTitle] = useState('');
    const [locMain, setLocMain] = useState('');
    const [locDetail, setLocDetail] = useState('');
    const [category, setCategory] = useState('broken');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState('low');
    const [deadlineMinutes, setDeadlineMinutes] = useState('15');
    const [customDeadlineMs, setCustomDeadlineMs] = useState(null);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [assignedDepts, setAssignedDepts] = useState([]);
    const [taggedDepts, setTaggedDepts] = useState([]);
    const [newImageFile, setNewImageFile] = useState(null);
    const [newImageUrl, setNewImageUrl] = useState(undefined);
    const [isReplacingImage, setIsReplacingImage] = useState(false);

    // Section 2: Claim / In-Progress Fields (progress, pending, solved)
    const [taker, setTaker] = useState('');

    // Section 3: Pending Fields (pending)
    const [pendingBy, setPendingBy] = useState('');
    const [pendingReason, setPendingReason] = useState('');
    const [newPendingImageFile, setNewPendingImageFile] = useState(null);
    const [newPendingImageUrl, setNewPendingImageUrl] = useState(undefined);
    const [isReplacingPendingImage, setIsReplacingPendingImage] = useState(false);

    // Section 4: Solved Fields (solved)
    const [solver, setSolver] = useState('');
    const [fixDescription, setFixDescription] = useState('');
    const [newProofImageFile, setNewProofImageFile] = useState(null);
    const [newProofImageUrl, setNewProofImageUrl] = useState(undefined);
    const [isReplacingProofImage, setIsReplacingProofImage] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const originalStatus = issue?.status || 'open';
    const isProgress = selectedStatus === 'progress';
    const isPending = selectedStatus === 'pending';
    const isSolved = selectedStatus === 'solved';
    const hasClaimInfo = isProgress || isPending || isSolved;

    const isRollingBack = originalStatus !== selectedStatus && (
        selectedStatus === 'open' || 
        (originalStatus === 'solved' && (selectedStatus === 'progress' || selectedStatus === 'pending')) ||
        (originalStatus === 'pending' && selectedStatus === 'progress')
    );

    // Pre-populate fields when issue changes or modal opens
    useEffect(() => {
        if (issue && open) {
            setSelectedStatus(issue.status || 'open');
            setStatusReason('');

            setTitle(issue.title || '');
            setDescription(issue.description || '');
            setCategory(issue.category || 'broken');
            setPriority(issue.priority === 'medium' ? 'low' : (issue.priority || 'low'));

            // Parse location
            const rawLoc = issue.location || '';
            const matchedMain = MAIN_LOCATIONS.find(loc => rawLoc.startsWith(loc));
            if (matchedMain) {
                setLocMain(matchedMain);
                const remainder = rawLoc.replace(new RegExp(`^${matchedMain}\\s*[-–—:]?\\s*`), '');
                setLocDetail(remainder);
            } else {
                setLocMain('');
                setLocDetail(rawLoc);
            }

            // Parse deadline
            if (issue.priority === 'critical' && issue.deadline) {
                const dMs = parseInt(issue.deadline, 10);
                setCustomDeadlineMs(dMs);
                const diffMins = Math.max(1, Math.round((dMs - (issue.reportedAt || Date.now())) / 60000));
                setDeadlineMinutes(String(diffMins || '15'));
            } else {
                setCustomDeadlineMs(null);
                setDeadlineMinutes('15');
            }

            // Parse assigned and tagged departments (excluding origin department)
            const curOrigin = normalizeDepartment(issue.department).toLowerCase();
            const rawAssigned = (Array.isArray(issue.assignedDepartments)
                ? issue.assignedDepartments
                : (issue.assignedDepartments ? String(issue.assignedDepartments).split(',').map(s => s.trim()).filter(Boolean) : [])
            ).map(normalizeDepartment).filter(d => d.toLowerCase() !== curOrigin);
            setAssignedDepts(rawAssigned);

            const assignedNormSet = new Set(rawAssigned.map(a => a.toLowerCase()));
            const rawTagged = (Array.isArray(issue.taggedDepartments)
                ? issue.taggedDepartments
                : (issue.taggedDepartments ? String(issue.taggedDepartments).split(',').map(s => s.trim()).filter(Boolean) : [])
            ).map(normalizeDepartment).filter(d => d.toLowerCase() !== curOrigin && !assignedNormSet.has(d.toLowerCase()));
            setTaggedDepts(rawTagged);

            // Initial image
            setNewImageFile(null);
            setNewImageUrl(undefined);
            setIsReplacingImage(false);

            // Claim info
            setTaker(issue.taker || '');

            // Pending info
            let cleanReason = issue.pendingReason || '';
            let cleanBy = issue.pendingBy || '';

            if (typeof cleanReason === 'string' && (cleanReason.trim().startsWith('[') || cleanReason.trim().startsWith('{'))) {
                try {
                    const parsed = JSON.parse(cleanReason);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        const lastItem = parsed[parsed.length - 1];
                        cleanReason = lastItem?.reason || '';
                        if (!cleanBy) cleanBy = lastItem?.by || '';
                    }
                } catch (e) {}
            }

            if (!cleanReason && Array.isArray(issue.pendingTimeline) && issue.pendingTimeline.length > 0) {
                const lastItem = issue.pendingTimeline[issue.pendingTimeline.length - 1];
                cleanReason = lastItem?.reason || '';
                if (!cleanBy) cleanBy = lastItem?.by || '';
            }

            setPendingBy(cleanBy);
            setPendingReason(cleanReason);
            setNewPendingImageFile(null);
            setNewPendingImageUrl(undefined);
            setIsReplacingPendingImage(false);

            // Solved info
            setSolver(issue.solver || '');
            setFixDescription(issue.fixDescription || '');
            setNewProofImageFile(null);
            setNewProofImageUrl(undefined);
            setIsReplacingProofImage(false);

            setErrorMsg('');
        }
    }, [issue, open]);

    const location = locMain
        ? (locDetail.trim() ? `${locMain} - ${locDetail.trim()}` : locMain)
        : locDetail.trim();

    const valid = !canEditReport || (title.trim() && location.trim() && description.trim() && assignedDepts.length > 0);

    const isAssignedDept = (dept) => {
        const norm = normalizeDepartment(dept).toLowerCase();
        return assignedDepts.some(a => normalizeDepartment(a).toLowerCase() === norm);
    };

    const isTaggedDept = (dept) => {
        const norm = normalizeDepartment(dept).toLowerCase();
        return taggedDepts.some(t => normalizeDepartment(t).toLowerCase() === norm);
    };

    const toggleAssignedDept = (dept) => {
        const norm = normalizeDepartment(dept);
        const normLower = norm.toLowerCase();
        setAssignedDepts((prev) => {
            const exists = prev.some(d => normalizeDepartment(d).toLowerCase() === normLower);
            return exists
                ? prev.filter(d => normalizeDepartment(d).toLowerCase() !== normLower)
                : [...prev.filter(d => normalizeDepartment(d).toLowerCase() !== normLower), norm];
        });
        setTaggedDepts((prev) => prev.filter((d) => normalizeDepartment(d).toLowerCase() !== normLower));
    };

    const toggleTaggedDept = (dept) => {
        const norm = normalizeDepartment(dept);
        const normLower = norm.toLowerCase();
        setTaggedDepts((prev) => {
            const exists = prev.some(d => normalizeDepartment(d).toLowerCase() === normLower);
            return exists
                ? prev.filter(d => normalizeDepartment(d).toLowerCase() !== normLower)
                : [...prev.filter(d => normalizeDepartment(d).toLowerCase() !== normLower), norm];
        });
        setAssignedDepts((prev) => prev.filter((d) => normalizeDepartment(d).toLowerCase() !== normLower));
    };

    const handleSubmit = async (e) => {
        e?.preventDefault();
        if (!valid || isSubmitting || !issue) return;

        setIsSubmitting(true);
        setErrorMsg('');

        try {
            const payload = {};

            // Status rollback / change
            if (selectedStatus !== originalStatus) {
                payload.status = selectedStatus;
                if (statusReason.trim()) {
                    payload.statusReason = statusReason.trim();
                }
                if (removePending) {
                    payload.removePending = true;
                }
            }

            // Include Initial Report fields ONLY if authorized
            if (canEditReport) {
                let finalDeadline = '';
                if (priority === 'critical') {
                    finalDeadline = String(customDeadlineMs || (Date.now() + 15 * 60 * 1000));
                }
                payload.title = title.trim();
                payload.description = description.trim();
                payload.location = location.trim();
                payload.category = category;
                payload.priority = priority;
                payload.deadline = finalDeadline;
                payload.assignedDepartments = assignedDepts.join(',');
                payload.taggedDepartments = taggedDepts.join(',');
                if (newImageFile) payload.imageFile = newImageFile;
            }

            // Include Claim fields ONLY if authorized and in relevant status
            if (hasClaimInfo && canEditClaim) {
                payload.taker = taker.trim();
            }

            // Include Pending fields ONLY if authorized and in pending status
            if (isPending && canEditPending) {
                payload.pendingBy = pendingBy.trim();
                payload.pendingReason = pendingReason.trim();
                if (newPendingImageFile) {
                    payload.pendingImageFile = newPendingImageFile;
                }
            }

            // Include Solved fields ONLY if authorized and in solved status
            if (isSolved && canEditSolved) {
                payload.solver = solver.trim();
                payload.fixDescription = fixDescription.trim();
                if (newProofImageFile) {
                    payload.proofImageFile = newProofImageFile;
                }
            }

            await updateIssue(issue, payload);

            if (onSuccess) onSuccess();
            onOpenChange(false);
        } catch (err) {
            setErrorMsg(err.message || 'Failed to update issue.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!issue) return null;

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!isSubmitting) onOpenChange(o); }}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] shadow-2xl p-6">
                <DialogHeader className="border-b border-[#3B3929]/80 pb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-[#C9AA71] bg-[#2A281E] px-2.5 py-1 rounded-md border border-[#3B3929]">
                                {issue.id}
                            </span>
                            <DialogTitle className="text-lg font-bold text-foreground">
                                {lang === 'id' ? 'Edit & Pengaturan Progres Isu' : 'Edit Issue & Progress State'}
                            </DialogTitle>
                        </div>
                        {/* Contextual Status Badge */}
                        <div className="flex items-center gap-1.5">
                            {originalStatus === 'open' && (
                                <span className="px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold font-mono flex items-center gap-1">
                                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                                    OPEN
                                </span>
                            )}
                            {originalStatus === 'progress' && (
                                <span className="px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-bold font-mono flex items-center gap-1">
                                    <Wrench className="h-3 w-3" />
                                    IN PROGRESS
                                </span>
                            )}
                            {originalStatus === 'pending' && (
                                <span className="px-2.5 py-1 rounded-md bg-orange-500/20 text-orange-300 border border-orange-500/30 text-xs font-bold font-mono flex items-center gap-1">
                                    <Hourglass className="h-3 w-3" />
                                    PENDING
                                </span>
                            )}
                            {originalStatus === 'solved' && (
                                <span className="px-2.5 py-1 rounded-md bg-green-500/20 text-green-300 border border-green-500/30 text-xs font-bold font-mono flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    SOLVED
                                </span>
                            )}
                        </div>
                    </div>
                    <DialogDescription className="text-xs text-muted-foreground pt-1">
                        {lang === 'id' 
                            ? `Ubah detail laporan, petugas klaim, atau mundurkan progress jika pengerjaan dialihkan/dibatalkan.`
                            : `Update issue details or roll back progress state if work is reassigned/delayed.`}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5 pt-2">
                    {errorMsg && (
                        <div className="rounded-xl border border-destructive/40 bg-destructive/15 p-3 text-xs font-medium text-destructive flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {/* Meta Bar */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#2A281E] border border-[#3B3929] text-xs">
                        <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{lang === 'id' ? 'Origin Dept:' : 'Origin:'}</span>
                            <span className="font-bold text-[#C9AA71]">🏠 {issue.department || 'General'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{lang === 'id' ? 'Pelapor:' : 'Reporter:'}</span>
                            <span className="font-semibold text-foreground">{issue.reporter || 'Anonymous'}</span>
                        </div>
                    </div>

                    {/* ========================================================================= */}
                    {/* SECTION 0: STATUS & PROGRESS ROLLBACK CONTROL                             */}
                    {/* ========================================================================= */}
                    {canChangeStatus && (
                        <div className={`rounded-xl border p-3.5 space-y-3 transition-all ${
                            isRollingBack 
                                ? 'border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/30' 
                                : 'border-[#3B3929] bg-[#222118]'
                        }`}>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <Label htmlFor="edit-status-state" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                    <RotateCcw className={`w-3.5 h-3.5 ${isRollingBack ? 'text-amber-400 animate-spin-reverse' : 'text-[#C9AA71]'}`} />
                                    <span>{lang === 'id' ? 'Status & Progres Pengerjaan Kartu' : 'Card Progress Status'}</span>
                                </Label>
                                {isRollingBack && (
                                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold border border-amber-500/40 animate-pulse">
                                        ↩️ {lang === 'id' ? 'Mundur Status Aktif' : 'Rollback Mode Active'}
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                                <Select 
                                    value={selectedStatus} 
                                    onValueChange={setSelectedStatus} 
                                    disabled={isSubmitting || originalStatus === 'open'}
                                >
                                    <SelectTrigger id="edit-status-state" className="bg-[#2A281E] border-[#3B3929] text-xs h-9 font-semibold">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#2A281E] border-[#3B3929] text-foreground">
                                        {/* Dynamic options based on originalStatus: Only allowed rollback / current status */}
                                        {originalStatus === 'solved' && (
                                            <>
                                                <SelectItem value="solved" className="text-xs text-emerald-400 font-bold">
                                                    ✅ Solved (Tetap Selesai)
                                                </SelectItem>
                                                <SelectItem value="pending" className="text-xs text-orange-400 font-bold">
                                                    ⏳ Pending (Mundur ke Tertunda)
                                                </SelectItem>
                                                <SelectItem value="progress" className="text-xs text-blue-400 font-bold">
                                                    🔧 In Progress (Mundur untuk Diperbaiki Ulang)
                                                </SelectItem>
                                                <SelectItem value="open" className="text-xs text-amber-400 font-bold">
                                                    ⚠️ Open (Mundur ke Belum Diklaim / Lepas Klaim)
                                                </SelectItem>
                                            </>
                                        )}
                                        {originalStatus === 'pending' && (
                                            <>
                                                <SelectItem value="pending" className="text-xs text-orange-400 font-bold">
                                                    ⏳ Pending (Tetap Tertunda)
                                                </SelectItem>
                                                <SelectItem value="progress" className="text-xs text-blue-400 font-bold">
                                                    🔧 In Progress (Lanjut Pengerjaan)
                                                </SelectItem>
                                                <SelectItem value="open" className="text-xs text-amber-400 font-bold">
                                                    ⚠️ Open (Batal Klaim / Lepas ke Open)
                                                </SelectItem>
                                            </>
                                        )}
                                        {originalStatus === 'progress' && (
                                            <>
                                                <SelectItem value="progress" className="text-xs text-blue-400 font-bold">
                                                    🔧 In Progress (Sedang Dikerjakan)
                                                </SelectItem>
                                                <SelectItem value="open" className="text-xs text-amber-400 font-bold">
                                                    ⚠️ Open (Lepas Klaim / Buka Kembali ke Open)
                                                </SelectItem>
                                            </>
                                        )}
                                        {originalStatus === 'open' && (
                                            <SelectItem value="open" className="text-xs text-amber-400 font-bold">
                                                ⚠️ Open (Belum Diklaim)
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>

                                <div className="text-[11px] text-muted-foreground leading-tight">
                                    {originalStatus === 'open' && (
                                        <span className="text-muted-foreground italic">
                                            ℹ️ Kartu belum diklaim. Untuk mengambil pekerjaan atau memproses kartu, gunakan tombol <strong>Ambil Pekerjaan</strong> di dashboard.
                                        </span>
                                    )}
                                    {selectedStatus === 'open' && originalStatus !== 'open' && (
                                        <span className="text-amber-300 font-medium">
                                            ⚠️ Mengembalikan kartu ke <strong>Open</strong> akan melepas petugas klaim saat ini dan membuka kartu untuk staf lain.
                                        </span>
                                    )}
                                    {selectedStatus === 'progress' && originalStatus === 'solved' && (
                                        <span className="text-blue-300 font-medium">
                                            🔄 Membuka kembali isu yang telah selesai untuk diperbaiki ulang.
                                        </span>
                                    )}
                                    {selectedStatus === 'progress' && originalStatus === 'pending' && (
                                        <span className="text-blue-300 font-medium">
                                            ▶️ Melanjutkan pengerjaan dari status pending. Riwayat pending tetap tersimpan.
                                        </span>
                                    )}
                                    {selectedStatus === originalStatus && originalStatus !== 'open' && (
                                        <span>Status kartu tetap: <strong>{originalStatus.toUpperCase()}</strong></span>
                                    )}
                                </div>
                            </div>

                            {/* Rollback / Status Change Reason & Pending Cleanup */}
                            {selectedStatus !== originalStatus && (
                                <div className="space-y-2.5 pt-1 border-t border-amber-500/20 text-xs">
                                    {originalStatus === 'pending' && (
                                        <label className="flex items-center gap-2 p-2 rounded-lg bg-black/40 border border-amber-500/30 cursor-pointer hover:border-amber-500/60">
                                            <input
                                                type="checkbox"
                                                checked={removePending}
                                                onChange={(e) => setRemovePending(e.target.checked)}
                                                className="rounded text-amber-500 focus:ring-amber-500 bg-[#2A281E] border-[#3B3929] h-4 w-4"
                                            />
                                            <span className="text-foreground">
                                                {lang === 'id' ? 'Hapus catatan pending terakhir dari riwayat (jika sebelumnya salah klik pending)' : 'Delete last pending entry from delay history (accidental pending)'}
                                            </span>
                                        </label>
                                    )}

                                    <div className="space-y-1.5">
                                        <Label htmlFor="status-reason" className="text-xs font-bold text-amber-300 flex items-center gap-1">
                                            <span>{lang === 'id' ? 'Alasan Perubahan / Rollback Status' : 'Reason for Status Change / Rollback'}</span>
                                        </Label>
                                        <Input
                                            id="status-reason"
                                            value={statusReason}
                                            onChange={(e) => setStatusReason(e.target.value)}
                                            placeholder={lang === 'id' ? 'Contoh: Teknisi sibuk menangani genset utama, dialihkan ke tim lain' : 'e.g. Technician called to emergency task'}
                                            disabled={isSubmitting}
                                            className="bg-[#2A281E] border-amber-500/40 text-xs h-9 text-foreground placeholder:text-muted-foreground/60"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ========================================================================= */}
                    {/* SECTION 1: DATA LAPORAN MASALAH (INITIAL REPORT DETAILS)                  */}
                    {/* ========================================================================= */}
                    <div className="rounded-xl border border-[#3B3929] bg-[#222118] p-4 space-y-4 shadow-sm">
                        <div className="flex items-center justify-between border-b border-[#3B3929] pb-2">
                            <h3 className="text-xs font-bold text-[#C9AA71] uppercase tracking-wider flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5" />
                                {lang === 'id' ? '1. Informasi Laporan Isu' : '1. Initial Report Details'}
                            </h3>
                            {!canEditReport ? (
                                <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                                    <Lock className="w-3 h-3 text-[#C9AA71]" />
                                    {lang === 'id' ? `Hanya dapat diedit oleh Pelapor (${issue.department || 'Origin'})` : `Editable only by Reporter (${issue.department || 'Origin'})`}
                                </span>
                            ) : (
                                <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                                    <Edit3 className="w-3 h-3" />
                                    {lang === 'id' ? 'Dapat Anda Edit' : 'Editable'}
                                </span>
                            )}
                        </div>

                        {canEditReport ? (
                            <>
                                {/* Title */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="edit-title" className="text-xs font-bold text-foreground flex items-center gap-1">
                                        {lang === 'id' ? 'Judul Isu' : 'Issue Title'} <span className="text-red-400">*</span>
                                    </Label>
                                    <Input
                                        id="edit-title"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder={lang === 'id' ? 'Contoh: AC Bocor di Kamar 12' : 'e.g. Leaking AC in Room 12'}
                                        disabled={isSubmitting}
                                        className="bg-[#2A281E] border-[#3B3929] text-xs h-9"
                                        required
                                    />
                                </div>

                                {/* Category & Priority */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="edit-category" className="text-xs font-bold text-foreground">
                                            {lang === 'id' ? 'Kategori' : 'Category'}
                                        </Label>
                                        <Select value={category} onValueChange={setCategory} disabled={isSubmitting}>
                                            <SelectTrigger id="edit-category" className="bg-[#2A281E] border-[#3B3929] text-xs h-9">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#2A281E] border-[#3B3929] text-foreground">
                                                {categories.map((c) => (
                                                    <SelectItem key={c.id} value={c.id} className="text-xs">
                                                        {c.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="edit-priority" className="text-xs font-bold text-foreground">
                                            {lang === 'id' ? 'Prioritas' : 'Priority'}
                                        </Label>
                                        <Select value={priority} onValueChange={setPriority} disabled={isSubmitting}>
                                            <SelectTrigger id="edit-priority" className="bg-[#2A281E] border-[#3B3929] text-xs h-9">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#2A281E] border-[#3B3929] text-foreground">
                                                <SelectItem value="low" className="text-xs">🟢 {lang === 'id' ? 'Prioritas' : 'Priority'}</SelectItem>
                                                <SelectItem value="high" className="text-xs">🟠 {lang === 'id' ? 'Prioritas Tinggi' : 'High Priority'}</SelectItem>
                                                <SelectItem value="critical" className="text-xs text-red-400 font-bold">🔴 {lang === 'id' ? 'Kritis' : 'Critical'}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* Critical SLA Setting - Immediate Inline Analog Clock */}
                                {priority === 'critical' && (
                                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                        <InlineAnalogClockPicker
                                            valueMs={customDeadlineMs || (Date.now() + 15 * 60000)}
                                            onChange={(ms) => {
                                                setCustomDeadlineMs(ms);
                                            }}
                                            lang={lang}
                                        />
                                    </div>
                                )}

                                {/* Location */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                                        {lang === 'id' ? 'Lokasi' : 'Location'} <span className="text-red-400">*</span>
                                    </Label>
                                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                                        {MAIN_LOCATIONS.map((loc) => (
                                            <button
                                                key={loc}
                                                type="button"
                                                onClick={() => setLocMain(locMain === loc ? '' : loc)}
                                                className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                                                    locMain === loc
                                                        ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] shadow-sm'
                                                        : 'bg-[#2A281E] text-muted-foreground border-[#3B3929] hover:text-foreground'
                                                }`}
                                            >
                                                📍 {loc}
                                            </button>
                                        ))}
                                    </div>
                                    <Input
                                        value={locDetail}
                                        onChange={(e) => setLocDetail(e.target.value)}
                                        placeholder={lang === 'id' ? 'Detail spesifik (contoh: Villa 5, Dining Room)' : 'Specific detail (e.g. Villa 5, Dining Room)'}
                                        disabled={isSubmitting}
                                        className="bg-[#2A281E] border-[#3B3929] text-xs h-9"
                                    />
                                </div>

                                {/* Assigned & Tagged Depts (Origin dept cannot assign/tag itself, and mutually exclusive) */}
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                                                🎯 {lang === 'id' ? 'Departemen Ditugaskan (Wajib Perbaiki)' : 'Assigned Department'} <span className="text-red-400">*</span>
                                            </Label>
                                            <span className="text-[10px] text-muted-foreground">{assignedDepts.length} {lang === 'id' ? 'dipilih' : 'selected'}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl bg-[#2A281E] border border-[#3B3929]">
                                            {ALL_DEPARTMENTS
                                                .filter(d => {
                                                    const normD = normalizeDepartment(d).toLowerCase();
                                                    if (originDept && normalizeDepartment(originDept).toLowerCase() === normD) return false;
                                                    if (isTaggedDept(d)) return false;
                                                    return true;
                                                })
                                                .map((dept) => {
                                                    const active = isAssignedDept(dept);
                                                    const theme = getDepartmentTheme(dept);
                                                    return (
                                                        <button
                                                            key={'assign-' + dept}
                                                            type="button"
                                                            onClick={() => toggleAssignedDept(dept)}
                                                            disabled={isSubmitting}
                                                            style={{
                                                                backgroundColor: active ? theme.bg : 'transparent',
                                                                borderColor: active ? theme.bg : '#3B3929',
                                                                color: active ? theme.text : '#A19F8D',
                                                            }}
                                                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                                                                active ? 'shadow-xs scale-105' : 'hover:border-[#C9AA71]/50 hover:text-foreground'
                                                            }`}
                                                        >
                                                            {active && '✓ '} {dept}
                                                        </button>
                                                    );
                                                })}
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                                                🏷️ {lang === 'id' ? 'Tag Departemen Lain (Info Sahaja)' : 'Tag Other Departments'}
                                            </Label>
                                            <span className="text-[10px] text-muted-foreground">{taggedDepts.length} {lang === 'id' ? 'dipilih' : 'selected'}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto p-2 rounded-xl bg-[#2A281E]/60 border border-[#3B3929]/80">
                                            {ALL_DEPARTMENTS
                                                .filter(d => {
                                                    const normD = normalizeDepartment(d).toLowerCase();
                                                    if (originDept && normalizeDepartment(originDept).toLowerCase() === normD) return false;
                                                    if (isAssignedDept(d)) return false;
                                                    return true;
                                                })
                                                .map((dept) => {
                                                    const active = isTaggedDept(dept);
                                                    const theme = getDepartmentTheme(dept);
                                                    return (
                                                        <button
                                                            key={'tag-' + dept}
                                                            type="button"
                                                            onClick={() => toggleTaggedDept(dept)}
                                                            disabled={isSubmitting}
                                                            style={{
                                                                backgroundColor: active ? `${theme.bg}33` : 'transparent',
                                                                borderColor: active ? theme.bg : '#3B3929',
                                                                color: active ? '#FAFAFA' : '#A19F8D',
                                                            }}
                                                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-all cursor-pointer ${
                                                                active ? 'font-bold' : 'hover:border-white/20 hover:text-foreground'
                                                            }`}
                                                        >
                                                            {active && '🏷️ '} {dept}
                                                        </button>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="edit-desc" className="text-xs font-bold text-foreground flex items-center gap-1">
                                        {lang === 'id' ? 'Deskripsi Masalah' : 'Description'} <span className="text-red-400">*</span>
                                    </Label>
                                    <Textarea
                                        id="edit-desc"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={2}
                                        placeholder={lang === 'id' ? 'Jelaskan kondisi masalah secara rinci...' : 'Describe the problem in detail...'}
                                        disabled={isSubmitting}
                                        className="bg-[#2A281E] border-[#3B3929] text-xs resize-none"
                                        required
                                    />
                                </div>

                                {/* Initial Image */}
                                <div className="space-y-1.5 pt-1">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                            <ImageIcon className="h-3.5 w-3.5 text-[#C9AA71]" />
                                            <span>{lang === 'id' ? 'Foto Masalah Awal' : 'Initial Issue Photo'}</span>
                                        </Label>
                                        {!isReplacingImage && (
                                            <button
                                                type="button"
                                                onClick={() => setIsReplacingImage(true)}
                                                className="text-[11px] font-bold text-[#C9AA71] hover:underline flex items-center gap-1 cursor-pointer"
                                            >
                                                <RefreshCw className="h-3 w-3" />
                                                <span>{lang === 'id' ? 'Ganti Foto' : 'Replace Photo'}</span>
                                            </button>
                                        )}
                                    </div>

                                    {!isReplacingImage && issue.imageUrl && (
                                        <div className="relative aspect-[16/9] w-full max-h-32 rounded-lg overflow-hidden border border-[#3B3929] bg-black/30">
                                            <img src={issue.imageUrl} alt="Existing" className="w-full h-full object-cover" />
                                            <div className="absolute bottom-1 right-1 px-2 py-0.5 rounded bg-black/70 text-[10px] text-muted-foreground font-mono">
                                                {lang === 'id' ? 'Foto Saat Ini' : 'Current Photo'}
                                            </div>
                                        </div>
                                    )}

                                    {isReplacingImage && (
                                        <div className="space-y-2">
                                            <div className="flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsReplacingImage(false);
                                                        setNewImageFile(null);
                                                        setNewImageUrl(undefined);
                                                    }}
                                                    className="text-[10px] text-muted-foreground hover:text-white flex items-center gap-1 cursor-pointer"
                                                >
                                                    <X className="h-3 w-3" />
                                                    <span>{lang === 'id' ? 'Batal Ganti' : 'Cancel'}</span>
                                                </button>
                                            </div>
                                            <ImageDropzone
                                                file={newImageFile}
                                                previewUrl={newImageUrl}
                                                onFileSelect={(file, url) => {
                                                    setNewImageFile(file);
                                                    setNewImageUrl(url);
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            /* Read-Only View of Section 1 for non-origin users */
                            <div className="space-y-2 text-xs text-muted-foreground bg-black/30 p-3 rounded-lg border border-white/5 font-mono">
                                <div className="flex justify-between">
                                    <span className="text-foreground font-bold">{issue.title}</span>
                                    <span className="text-[#C9AA71]">📍 {issue.location}</span>
                                </div>
                                <p className="text-foreground/80 font-sans text-xs italic">"{issue.description}"</p>
                                <div className="flex items-center gap-2 pt-1 flex-wrap text-[11px]">
                                    <span>🎯 Assigned: <strong className="text-foreground">{issue.assignedDepartments || '-'}</strong></span>
                                    {issue.taggedDepartments && <span>🏷️ Tagged: <strong className="text-foreground">{issue.taggedDepartments}</strong></span>}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ========================================================================= */}
                    {/* SECTION 2: DATA PENGERJAAN / CLAIM (PROGRESS / PENDING / SOLVED)          */}
                    {/* ========================================================================= */}
                    {hasClaimInfo && (
                        <div className="rounded-xl border border-blue-500/30 bg-[#1A222B]/60 p-4 space-y-3 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 bottom-0 w-1 bg-blue-500" />
                            <div className="flex items-center justify-between border-b border-blue-500/20 pb-2">
                                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Wrench className="w-3.5 h-3.5" />
                                    {lang === 'id' ? '2. Data Pengerjaan / Petugas Klaim' : '2. Job Claim & Technician Info'}
                                </h3>
                                {!canEditClaim ? (
                                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                                        <Lock className="w-3 h-3 text-blue-400" />
                                        {lang === 'id' ? `Dikelola oleh Tim Pengerja (${takerDept || 'Assigned'})` : `Managed by Technician (${takerDept || 'Assigned'})`}
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-blue-400 font-mono flex items-center gap-1">
                                        <Edit3 className="w-3 h-3" />
                                        {lang === 'id' ? 'Dapat Anda Edit' : 'Editable'}
                                    </span>
                                )}
                            </div>

                            {canEditClaim ? (
                                <div className="space-y-1.5">
                                    <Label htmlFor="edit-taker" className="text-xs font-bold text-foreground flex items-center gap-1">
                                        <User className="w-3 h-3 text-blue-400" />
                                        {lang === 'id' ? 'Nama Petugas yang Mengambil (Taker)' : 'Assigned Technician / Taker'}
                                    </Label>
                                    <Input
                                        id="edit-taker"
                                        value={taker}
                                        onChange={(e) => setTaker(e.target.value)}
                                        placeholder={lang === 'id' ? 'Nama teknisi / staff pengerja' : 'Technician name'}
                                        disabled={isSubmitting}
                                        className="bg-[#2A281E] border-blue-500/30 text-xs h-9"
                                    />
                                </div>
                            ) : (
                                <div className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-black/30 border border-blue-500/20">
                                    <span className="text-muted-foreground">{lang === 'id' ? 'Petugas Pengambil:' : 'Claimed By:'}</span>
                                    <span className="font-bold text-blue-300">👷 {issue.taker || 'None'} {takerDept ? `(${takerDept})` : ''}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ========================================================================= */}
                    {/* SECTION 3: DATA PENUNDAAN (PENDING ONLY)                                  */}
                    {/* ========================================================================= */}
                    {isPending && (
                        <div className="rounded-xl border border-orange-500/30 bg-[#251E16]/60 p-4 space-y-3 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 bottom-0 w-1 bg-orange-500" />
                            <div className="flex items-center justify-between border-b border-orange-500/20 pb-2">
                                <h3 className="text-xs font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Hourglass className="w-3.5 h-3.5" />
                                    {lang === 'id' ? '3. Data Penundaan / Pending' : '3. Pending & Delay Details'}
                                </h3>
                                {!canEditPending ? (
                                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                                        <Lock className="w-3 h-3 text-orange-400" />
                                        {lang === 'id' ? `Dikelola oleh Tim Penunda (${pendingDept || 'Assigned'})` : `Managed by Pending Team (${pendingDept || 'Assigned'})`}
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-orange-400 font-mono flex items-center gap-1">
                                        <Edit3 className="w-3 h-3" />
                                        {lang === 'id' ? 'Dapat Anda Edit' : 'Editable'}
                                    </span>
                                )}
                            </div>

                            {canEditPending ? (
                                <>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="edit-pending-by" className="text-xs font-bold text-foreground flex items-center gap-1">
                                            <User className="w-3 h-3 text-orange-400" />
                                            {lang === 'id' ? 'Ditunda Oleh (Staff)' : 'Pending By'}
                                        </Label>
                                        <Input
                                            id="edit-pending-by"
                                            value={pendingBy}
                                            onChange={(e) => setPendingBy(e.target.value)}
                                            placeholder="Nama staff yang menunda"
                                            disabled={isSubmitting}
                                            className="bg-[#2A281E] border-orange-500/30 text-xs h-9"
                                        />
                                    </div>

                                    {Array.isArray(issue.pendingTimeline) && issue.pendingTimeline.length > 1 && (
                                        <div className="space-y-1.5 p-2.5 rounded-lg bg-black/40 border border-orange-500/20 text-xs">
                                            <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wide">
                                                {lang === 'id' ? 'Riwayat Penundaan Sebelumnya:' : 'Prior Delay History:'}
                                            </span>
                                            <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                                                {issue.pendingTimeline.slice(0, -1).map((item, idx) => (
                                                    <div key={idx} className="p-1.5 rounded bg-white/5 text-[11px] text-muted-foreground border border-white/5">
                                                        <div className="flex items-center justify-between font-mono text-[10px] text-orange-300">
                                                            <span>{item.by || 'Staff'}</span>
                                                            <span>{item.date || '-'}</span>
                                                        </div>
                                                        <p className="text-foreground/80 mt-0.5">{item.reason}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <Label htmlFor="edit-pending-reason" className="text-xs font-bold text-foreground">
                                            {lang === 'id' ? 'Alasan Penundaan (Terbaru)' : 'Pending Reason (Latest)'}
                                        </Label>
                                        <Textarea
                                            id="edit-pending-reason"
                                            value={pendingReason}
                                            onChange={(e) => setPendingReason(e.target.value)}
                                            rows={2}
                                            placeholder={lang === 'id' ? 'Contoh: Menunggu suku cadang dikirim dari Batam' : 'e.g. Waiting for spare parts'}
                                            disabled={isSubmitting}
                                            className="bg-[#2A281E] border-orange-500/30 text-xs resize-none"
                                        />
                                    </div>

                                    {/* Pending Photo */}
                                    <div className="space-y-1.5 pt-1">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                <Camera className="h-3.5 w-3.5 text-orange-400" />
                                                <span>{lang === 'id' ? 'Foto Kondisi Pending' : 'Pending Proof Photo'}</span>
                                            </Label>
                                            {!isReplacingPendingImage && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsReplacingPendingImage(true)}
                                                    className="text-[11px] font-bold text-orange-400 hover:underline flex items-center gap-1 cursor-pointer"
                                                >
                                                    <RefreshCw className="h-3 w-3" />
                                                    <span>{lang === 'id' ? 'Ganti Foto' : 'Replace'}</span>
                                                </button>
                                            )}
                                        </div>

                                        {!isReplacingPendingImage && issue.pendingImageUrl && (
                                            <div className="relative aspect-[16/9] w-full max-h-32 rounded-lg overflow-hidden border border-orange-500/30 bg-black/30">
                                                <img src={issue.pendingImageUrl} alt="Pending Proof" className="w-full h-full object-cover" />
                                            </div>
                                        )}

                                        {isReplacingPendingImage && (
                                            <div className="space-y-2">
                                                <div className="flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIsReplacingPendingImage(false);
                                                            setNewPendingImageFile(null);
                                                            setNewPendingImageUrl(undefined);
                                                        }}
                                                        className="text-[10px] text-muted-foreground hover:text-white flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <X className="h-3 w-3" />
                                                        <span>{lang === 'id' ? 'Batal' : 'Cancel'}</span>
                                                    </button>
                                                </div>
                                                <ImageDropzone
                                                    file={newPendingImageFile}
                                                    previewUrl={newPendingImageUrl}
                                                    onFileSelect={(file, url) => {
                                                        setNewPendingImageFile(file);
                                                        setNewPendingImageUrl(url);
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                /* Read-Only View of Section 3 */
                                <div className="space-y-2 text-xs text-muted-foreground bg-black/30 p-3 rounded-lg border border-orange-500/10">
                                    <div className="flex justify-between font-mono">
                                        <span>Pending by: <strong className="text-orange-300">{issue.pendingBy || 'Staff'}</strong></span>
                                    </div>
                                    <p className="text-foreground/90 italic">"{pendingReason || issue.pendingReason}"</p>
                                    {issue.pendingImageUrl && (
                                        <div className="relative aspect-[16/9] w-full max-h-28 rounded overflow-hidden border border-white/10 mt-1">
                                            <img src={issue.pendingImageUrl} alt="Pending Proof" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ========================================================================= */}
                    {/* SECTION 4: DATA PENYELESAIAN (SOLVED ONLY)                                */}
                    {/* ========================================================================= */}
                    {isSolved && (
                        <div className="rounded-xl border border-green-500/30 bg-[#18241B]/60 p-4 space-y-3 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 bottom-0 w-1 bg-green-500" />
                            <div className="flex items-center justify-between border-b border-green-500/20 pb-2">
                                <h3 className="text-xs font-bold text-green-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    {lang === 'id' ? '3. Data Penyelesaian / Solved' : '3. Resolution & Solved Details'}
                                </h3>
                                {!canEditSolved ? (
                                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                                        <Lock className="w-3 h-3 text-green-400" />
                                        {lang === 'id' ? `Dikelola oleh Tim Penyelesai (${solverDept || 'Assigned'})` : `Managed by Solver (${solverDept || 'Assigned'})`}
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-green-400 font-mono flex items-center gap-1">
                                        <Edit3 className="w-3 h-3" />
                                        {lang === 'id' ? 'Dapat Anda Edit' : 'Editable'}
                                    </span>
                                )}
                            </div>

                            {canEditSolved ? (
                                <>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="edit-solver" className="text-xs font-bold text-foreground flex items-center gap-1">
                                            <User className="w-3 h-3 text-green-400" />
                                            {lang === 'id' ? 'Diselesaikan Oleh (Solver)' : 'Resolved By (Solver)'}
                                        </Label>
                                        <Input
                                            id="edit-solver"
                                            value={solver}
                                            onChange={(e) => setSolver(e.target.value)}
                                            placeholder="Nama teknisi penyelesai"
                                            disabled={isSubmitting}
                                            className="bg-[#2A281E] border-green-500/30 text-xs h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="edit-fix-desc" className="text-xs font-bold text-foreground">
                                            {lang === 'id' ? 'Catatan Perbaikan / Tindakan' : 'Fix Description / Action Taken'}
                                        </Label>
                                        <Textarea
                                            id="edit-fix-desc"
                                            value={fixDescription}
                                            onChange={(e) => setFixDescription(e.target.value)}
                                            rows={2}
                                            placeholder={lang === 'id' ? 'Jelaskan perbaikan yang telah dilakukan...' : 'Action taken...'}
                                            disabled={isSubmitting}
                                            className="bg-[#2A281E] border-green-500/30 text-xs resize-none"
                                        />
                                    </div>

                                    {/* Proof Photo */}
                                    <div className="space-y-1.5 pt-1">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                <Camera className="h-3.5 w-3.5 text-green-400" />
                                                <span>{lang === 'id' ? 'Foto Bukti Penyelesaian' : 'Proof of Resolution Photo'}</span>
                                            </Label>
                                            {!isReplacingProofImage && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsReplacingProofImage(true)}
                                                    className="text-[11px] font-bold text-green-400 hover:underline flex items-center gap-1 cursor-pointer"
                                                >
                                                    <RefreshCw className="h-3 w-3" />
                                                    <span>{lang === 'id' ? 'Ganti Foto' : 'Replace'}</span>
                                                </button>
                                            )}
                                        </div>

                                        {!isReplacingProofImage && issue.proofImageUrl && (
                                            <div className="relative aspect-[16/9] w-full max-h-32 rounded-lg overflow-hidden border border-green-500/30 bg-black/30">
                                                <img src={issue.proofImageUrl} alt="Proof" className="w-full h-full object-cover" />
                                            </div>
                                        )}

                                        {isReplacingProofImage && (
                                            <div className="space-y-2">
                                                <div className="flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIsReplacingProofImage(false);
                                                            setNewProofImageFile(null);
                                                            setNewProofImageUrl(undefined);
                                                        }}
                                                        className="text-[10px] text-muted-foreground hover:text-white flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <X className="h-3 w-3" />
                                                        <span>{lang === 'id' ? 'Batal' : 'Cancel'}</span>
                                                    </button>
                                                </div>
                                                <ImageDropzone
                                                    file={newProofImageFile}
                                                    previewUrl={newProofImageUrl}
                                                    onFileSelect={(file, url) => {
                                                        setNewProofImageFile(file);
                                                        setNewProofImageUrl(url);
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                /* Read-Only View of Section 4 */
                                <div className="space-y-2 text-xs text-muted-foreground bg-black/30 p-3 rounded-lg border border-green-500/10">
                                    <div className="flex justify-between font-mono">
                                        <span>Resolved by: <strong className="text-green-300">{issue.solver || 'Technician'}</strong></span>
                                        {issue.durationLabel && <span>⏱️ {issue.durationLabel}</span>}
                                    </div>
                                    <p className="text-foreground/90 whitespace-pre-wrap">"{issue.fixDescription}"</p>
                                    {issue.proofImageUrl && (
                                        <div className="relative aspect-[16/9] w-full max-h-28 rounded overflow-hidden border border-white/10 mt-1">
                                            <img src={issue.proofImageUrl} alt="Proof" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="pt-2 gap-2 border-t border-[#3B3929]/50">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSubmitting}
                            className="border-[#3B3929] hover:bg-[#2A281E] text-xs h-9"
                        >
                            {lang === 'id' ? 'Batal' : 'Cancel'}
                        </Button>
                        <Button
                            type="submit"
                            disabled={!valid || isSubmitting}
                            className="bg-[#C9AA71] hover:bg-[#D8BE8A] text-[#1C1B0E] font-bold text-xs h-9 gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>{lang === 'id' ? 'Menyimpan...' : 'Saving...'}</span>
                                </>
                            ) : (
                                <>
                                    <Edit3 className="h-3.5 w-3.5" />
                                    <span>{lang === 'id' ? 'Simpan Perubahan' : 'Save Changes'}</span>
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
