import { useEffect, useState, useMemo } from 'react';
import { Loader2, MapPin, ZoomIn, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/Components/UI/Sheet';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/UI/Dialog';
import { Label } from '@/Components/UI/Label';
import { Textarea } from '@/Components/UI/Textarea';
import { ImageDropzone } from './ImageDropzone';
import { useIssues } from '@/context/IssuesContext';
import DelayDetailModal from './DelayDetailModal';
import { ImageLightboxModal } from './ImageLightboxModal';
import { CriticalTimer } from './CriticalTimer';
import { getStaffForDepartment, normalizeDepartment } from '@/constants/staff';
import { getDepartmentTheme } from '@/constants/departments';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';

const safeArray = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
    return [];
};

export function ResolveIssueSheet({ issue, onClose }) {
    const { t, lang } = useLanguage();
    const { resolveIssue, pendingIssue, updateIssue, categories, updateIssueCategory } = useIssues();
    const [isPendingMode, setIsPendingMode] = useState(false);
    const [isUnclaimModalOpen, setIsUnclaimModalOpen] = useState(false);
    const [unclaimReason, setUnclaimReason] = useState('');
    const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
    const [resumeReason, setResumeReason] = useState('');
    const [removePendingOnResume, setRemovePendingOnResume] = useState(false);
    const [isUnclaiming, setIsUnclaiming] = useState(false);
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedStaff, setSelectedStaff] = useState('');
    const [fixDescription, setFixDescription] = useState('');
    const [proofImageFile, setProofImageFile] = useState(null);
    const [proofImageUrl, setProofImageUrl] = useState(undefined);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const { isDeptUser, department, staffName, isAdmin } = useAuth();
    const [selectedDelay, setSelectedDelay] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);

    const assignedList = useMemo(() => safeArray(issue?.assignedDepartments), [issue?.assignedDepartments]);
    const taggedList = useMemo(() => safeArray(issue?.taggedDepartments), [issue?.taggedDepartments]);
    const pendingTimelineList = useMemo(() => {
        const raw = safeArray(issue?.pendingTimeline);
        return raw
            .filter(Boolean)
            .map(item => {
                if (typeof item === 'object' && item !== null) return item;
                return { date: '', by: 'Staff', reason: String(item || ''), image: '' };
            });
    }, [issue?.pendingTimeline]);

    // Check if the current user can resolve/pending this issue (only assigned department or admin; maker/origin department CANNOT)
    const canAct = useMemo(() => {
        if (!issue || Boolean(issue._isPastContribution)) return false;
        if (isAdmin) return true;
        if (!department) return false;

        const userDeptNorm = normalizeDepartment(department).toLowerCase();
        const originDeptNorm = normalizeDepartment(issue.department).toLowerCase();

        // If the logged-in department is the maker / origin department, they CANNOT pending/solve
        if (userDeptNorm === originDeptNorm) return false;

        if (assignedList.length === 0) return true;

        // Must be in assigned list (excluding origin)
        return assignedList.some(d => {
            const dNorm = normalizeDepartment(d).toLowerCase();
            return dNorm === userDeptNorm && dNorm !== originDeptNorm;
        });
    }, [isAdmin, issue, department, assignedList]);

    // Build authorized departments (assigned + tagged, EXCLUDING origin department)
    const authorizedDepts = useMemo(() => {
        if (!issue) return [];
        const originDeptNorm = normalizeDepartment(issue.department).toLowerCase();
        return [...new Set([...assignedList, ...taggedList])]
            .filter(Boolean)
            .filter(d => normalizeDepartment(d).toLowerCase() !== originDeptNorm);
    }, [issue, assignedList, taggedList]);

    const staffForSelectedDept = useMemo(() => {
        if (!selectedDept) return [];
        return getStaffForDepartment(selectedDept);
    }, [selectedDept]);

    const hasAuthorizedDepts = authorizedDepts.length > 0;

    useEffect(() => {
        if (issue) {
            setIsPendingMode(false);
            if (isDeptUser && department) {
                setSelectedDept(department);
                setSelectedStaff(staffName || issue.taker || '');
            } else {
                setSelectedDept('');
                setSelectedStaff(issue.taker ?? '');
            }
            setFixDescription('');
            setProofImageFile(null);
            setProofImageUrl(undefined);
            setErrorMsg('');
            setIsSubmitting(false);
            setPreviewImage(null);
        }
    }, [issue, isDeptUser, department, staffName]);

    const handleCategoryChange = async (e) => {
        setIsUpdatingCategory(true);
        setErrorMsg('');
        try {
            await updateIssueCategory(issue, e.target.value);
        } catch (err) {
            setErrorMsg(err.message || 'Failed to update category');
        } finally {
            setIsUpdatingCategory(false);
        }
    };

    const valid = Boolean(
        selectedStaff && 
        typeof selectedStaff === 'string' && 
        selectedStaff.trim() && 
        fixDescription && 
        typeof fixDescription === 'string' && 
        fixDescription.trim()
    );

    const submit = async () => {
        if (!issue || !valid || isSubmitting) return;
        if (!selectedStaff || !selectedStaff.trim()) {
            setErrorMsg('Please select your name.');
            return;
        }
        setIsSubmitting(true);
        setErrorMsg('');

        try {
            if (isPendingMode) {
                await pendingIssue(issue, {
                    pendingBy: selectedStaff.trim(),
                    pendingReason: fixDescription.trim(),
                    pendingImageFile: proofImageFile,
                });
            } else {
                await resolveIssue(issue, {
                    solver: selectedStaff.trim(),
                    fixDescription: fixDescription.trim(),
                    proofImageFile,
                });
            }
            onClose();
        } catch (err) {
            console.error(err);
            setErrorMsg(err.response?.data?.message || err.message || 'Display Error: Upload Failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Sheet open={!!issue} onOpenChange={(o) => { if (!o && !isSubmitting) onClose(); }}>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>{isPendingMode ? 'Mark Issue as Pending' : 'Resolve Issue'}</SheetTitle>
                    <SheetDescription>
                        {isPendingMode 
                            ? 'Document the reason for the delay so the report reflects the status.'
                            : 'Document the fix so the report can be closed out.'}
                    </SheetDescription>
                </SheetHeader>

                <div className="grid gap-5 px-4 pb-8 pt-6">
                    {errorMsg && (
                        <div className="rounded-md bg-destructive/15 p-3 text-sm font-medium text-destructive">
                            {errorMsg}
                        </div>
                    )}

                    {issue && (
                        <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
                            <div 
                                className="relative group cursor-pointer"
                                onClick={() => setPreviewImage({
                                    src: issue.imageUrl || '/barrier-placeholder.svg',
                                    title: issue.title,
                                    subtitle: 'Foto Kerusakan / Masalah Awal (Full Preview)'
                                })}
                            >
                                <img
                                    src={issue.imageUrl || '/barrier-placeholder.svg'}
                                    alt={issue.title}
                                    onError={(e) => { e.currentTarget.src = '/barrier-placeholder.svg'; }}
                                    className="h-52 sm:h-64 w-full object-cover bg-black/40 rounded-t-lg transition-transform duration-300 group-hover:scale-[1.02]"
                                />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 text-white font-medium text-xs border border-white/20 shadow-lg backdrop-blur-sm">
                                        <ZoomIn className="w-4 h-4 text-[#C9AA71]" />
                                        Klik untuk Full Preview
                                    </span>
                                </div>
                                <CriticalTimer
                                    deadline={issue.deadline}
                                    status={issue.status}
                                    isArchived={Boolean(issue.isArchived || issue.statusDisplay === '0' || issue.displayStatus === '0')}
                                    className="absolute right-3 top-3"
                                />
                            </div>
                            <div className="p-3">
                                {issue.priority === 'critical' && issue.deadline && issue.status !== 'solved' && !issue.isArchived && (
                                    <CriticalTimer
                                        deadline={issue.deadline}
                                        status={issue.status}
                                        isArchived={Boolean(issue.isArchived || issue.statusDisplay === '0' || issue.displayStatus === '0')}
                                        variant="banner"
                                        className="mb-2"
                                    />
                                )}
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-foreground">{issue.title}</p>
                                    <div className="flex gap-1.5 items-center shrink-0 flex-wrap justify-end">
                                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                            ID: {issue.id}-problem
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    {assignedList.length > 0 && assignedList.map((dept, idx) => (
                                        <span key={'assign-' + idx} className="shrink-0 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 font-mono text-[10px] font-semibold border border-amber-500/30" title="Assigned Department (Responsible to fix)">
                                            🎯 {dept}
                                        </span>
                                    ))}
                                    {issue.department && (
                                        <span className="shrink-0 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 font-mono text-[10px] font-medium border border-blue-500/20" title="Origin Department">
                                            🏠 {issue.department}
                                        </span>
                                    )}
                                    {taggedList.length > 0 && taggedList.map((tag, idx) => (
                                        <span key={'tag-' + idx} className="shrink-0 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 font-mono text-[10px] font-medium border border-purple-500/20" title="Tagged Department">
                                            📢 @{tag}
                                        </span>
                                    ))}
                                    
                                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                                        <span className="text-[10px] text-muted-foreground font-medium">Category:</span>
                                        <select
                                            value={issue.category || ''}
                                            onChange={handleCategoryChange}
                                            disabled={isUpdatingCategory}
                                            className="h-5 text-[10px] rounded border border-border bg-surface px-1 py-0 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                                        >
                                            <option value="" disabled>Select category</option>
                                            {categories.map(c => (
                                                <option key={c.id} value={c.id}>{c.label}</option>
                                            ))}
                                        </select>
                                        {isUpdatingCategory && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                                    </div>
                                </div>
                                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                                    {issue.location}
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">{issue.description}</p>
                                <p className="mt-2 text-xs font-medium text-muted-foreground">
                                    Reported by {issue.reporter}
                                    {issue.taker ? ` • Claimed by ${issue.taker}` : ''}
                                </p>
                            </div>
                        </div>
                    )}

                    {issue && issue.status === 'pending' && pendingTimelineList.length > 0 && (
                        <div className="overflow-hidden rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 flex flex-col gap-3">
                            <p className="text-sm font-semibold text-orange-600">Pending Delay History</p>
                            {pendingTimelineList.map((item, idx) => (
                                <div key={idx} className="flex flex-col gap-2 pb-3 border-b border-orange-500/20 last:border-0 last:pb-0">
                                    <div className="flex items-start gap-3">
                                        {item.image && (
                                            <img 
                                                src={item.image} 
                                                alt="delay proof" 
                                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                className="w-12 h-12 object-cover rounded shadow-sm shrink-0 cursor-pointer hover:opacity-80 transition-opacity" 
                                                onClick={() => setPreviewImage({
                                                    src: item.image,
                                                    title: 'Bukti Penundaan / Delay Proof',
                                                    subtitle: item.by ? `Oleh: ${item.by} (${item.date || ''})` : 'Delay Proof'
                                                })}
                                            />
                                        )}
                                        <div className="flex flex-col">
                                            <span className="text-xs font-medium text-orange-600/90">
                                                {item.date ? `${item.date} - ${item.by}` : item.by}
                                            </span>
                                            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap mt-0.5">
                                                {item.reason}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!canAct ? (
                        <div className="space-y-4 pt-2">
                            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
                                <span className="text-base">🔒</span>
                                <div>
                                    <p className="font-semibold text-amber-200">{t('monitor_mode_title')}</p>
                                    <p className="text-muted-foreground mt-0.5">
                                        {t('monitor_mode_desc').replace('{dept}', assignedList.join(', ') || t('department'))}
                                    </p>
                                </div>
                            </div>
                            <Button variant="outline" onClick={onClose} className="w-full">
                                {t('close_btn')}
                            </Button>
                        </div>
                    ) : (
                        <>
                            {issue?.takerHasTransferred && (
                                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
                                    <ArrowRightLeft className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    <div className="space-y-0.5">
                                        <p className="font-bold text-amber-300">
                                            {lang === 'id' ? 'Pemberitahuan: Staf Pemegang Klaim Telah Pindah Divisi' : 'Notice: Claimant Staff Transferred Department'}
                                        </p>
                                        <p className="text-[11px] text-[#A19F8D] leading-relaxed">
                                            {lang === 'id' 
                                                ? `Staf yang sebelumnya mengklaim tiket ini (${issue.taker}) saat ini bertugas di departemen ${issue.takerCurrentDept || 'lain'}. Departemen Anda tetap memiliki wewenang penuh untuk melanjutkan penanganan, memperbarui status pending, melepas klaim, atau menyelesaikan isu ini.`
                                                : `Staff who previously claimed this ticket (${issue.taker}) is now in ${issue.takerCurrentDept || 'another department'}. Your department retains full authorization to resume work, update pending status, release claim, or resolve this issue.`}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {isDeptUser && department ? (() => {
                                const dTheme = getDepartmentTheme(department);
                                return (
                                    <div className="rounded-xl border border-[#3B3929] bg-[#2A281E] p-4 space-y-3 shadow-md">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-semibold text-[#A19F8D]">{t('department')}</span>
                                            <span 
                                                className="px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-sm"
                                                style={{
                                                    backgroundColor: dTheme.bg === '#212121' ? 'rgba(255, 255, 255, 0.12)' : `${dTheme.bg}25`,
                                                    borderColor: dTheme.bg === '#212121' ? 'rgba(255, 255, 255, 0.35)' : `${dTheme.bg}80`,
                                                    color: dTheme.bg === '#212121' ? '#FFFFFF' : (dTheme.text === '#14130B' ? '#FBBF24' : dTheme.bg)
                                                }}
                                            >
                                                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: dTheme.bg }} />
                                                <span>🎯</span> {department}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between pt-2.5 border-t border-[#3B3929]/70">
                                            <span className="text-xs font-semibold text-[#A19F8D]">
                                                {isPendingMode ? t('delay_staff') : t('resolver_staff')}
                                            </span>
                                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#C9AA71]/15 text-[#E3D1AA] border border-[#C9AA71]/40 flex items-center gap-1.5 shadow-sm">
                                                <span>👤</span> {staffName || selectedStaff || 'Staff'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })() : (
                                <>
                                    {/* Step 1: Department */}
                                    <div className="grid gap-2">
                                        <Label>
                                            {isPendingMode ? t('step_dept_delay') : t('step_dept_resolve')}
                                            {hasAuthorizedDepts && (
                                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                                    (only authorized departments shown)
                                                </span>
                                            )}
                                        </Label>
                                        {hasAuthorizedDepts ? (
                                            <div className="flex flex-wrap gap-2">
                                                {authorizedDepts.map(dept => (
                                                    <button
                                                        key={dept}
                                                        type="button"
                                                        disabled={isSubmitting}
                                                        onClick={() => { setSelectedDept(dept); setSelectedStaff(''); }}
                                                        className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                                                            selectedDept === dept
                                                                ? 'bg-amber-600 text-white border-amber-600 shadow-sm ring-2 ring-amber-500/20'
                                                                : 'bg-surface text-muted-foreground border-border hover:border-amber-500/50 hover:bg-amber-500/10'
                                                        }`}
                                                    >
                                                        {selectedDept === dept ? `✓ ${dept}` : dept}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted-foreground italic">
                                                No assigned/tagged departments set on this issue. Contact the reporter to update it.
                                            </p>
                                        )}
                                    </div>

                                    {/* Step 2: Staff Name */}
                                    {selectedDept && (
                                        <div className="grid gap-2">
                                            <Label>
                                                Step 2 — {isPendingMode ? t('step_worker_delay') : t('step_worker_resolve')}
                                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">({selectedDept} staff)</span>
                                            </Label>
                                            {staffForSelectedDept.length > 0 ? (
                                                <div className="flex flex-wrap gap-2">
                                                    {staffForSelectedDept.map(name => (
                                                        <button
                                                            key={name}
                                                            type="button"
                                                            disabled={isSubmitting}
                                                            onClick={() => setSelectedStaff(name)}
                                                            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                                                                selectedStaff === name
                                                                    ? 'bg-primary text-primary-foreground border-primary shadow-sm ring-2 ring-primary/20'
                                                                    : 'bg-surface text-muted-foreground border-border hover:border-primary/50 hover:bg-primary/10'
                                                            }`}
                                                        >
                                                            {selectedStaff === name ? `✓ ${name}` : name}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-muted-foreground italic">
                                                    No staff roster found for {selectedDept}.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}

                            <div className="grid gap-2">
                                <Label htmlFor="fix">{isPendingMode ? t('proof_of_delay') : 'Fix description'}</Label>
                                <Textarea
                                    id="fix"
                                    rows={4}
                                    value={fixDescription}
                                    onChange={(e) => setFixDescription(e.target.value)}
                                    placeholder={isPendingMode ? "Why can't this job be finished right now?" : "What did you do to fix the problem?"}
                                    disabled={isSubmitting}
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label>{isPendingMode ? t('proof_of_delay') : t('proof_of_fix')}</Label>
                                <ImageDropzone
                                    label={isPendingMode ? t('upload_proof_delay') : t('upload_proof_fix')}
                                    previewUrl={proofImageUrl}
                                    onChange={(file, preview) => {
                                        setProofImageFile(file);
                                        setProofImageUrl(preview);
                                    }}
                                />
                            </div>

                            <div className="flex flex-col gap-2.5 pt-2">
                                <Button onClick={submit} disabled={!valid || isSubmitting || isUnclaiming} className="w-full">
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            {isPendingMode ? t('marking_pending') : t('saving_fix')}
                                        </>
                                    ) : (
                                        isPendingMode ? t('confirm_pending') : t('mark_as_solved')
                                    )}
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    onClick={() => setIsPendingMode(!isPendingMode)}
                                    disabled={isSubmitting || isUnclaiming}
                                    className={isPendingMode ? "text-status-solved" : "text-orange-500 hover:text-orange-600 hover:bg-orange-50"}
                                >
                                    {isPendingMode ? t('cancel_pending_btn') : t('mark_pending_btn')}
                                </Button>

                                {/* Quick Actions for Pending & Progress */}
                                {issue?.status === 'pending' && (
                                    <div className="pt-2 border-t border-border/40 space-y-2">
                                        <Button
                                            variant="outline"
                                            type="button"
                                            onClick={() => setIsResumeModalOpen(true)}
                                            disabled={isSubmitting || isUnclaiming}
                                            className="w-full border-blue-500/40 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 text-xs font-semibold"
                                        >
                                            ▶️ {lang === 'id' ? 'Batalkan Pending & Lanjut Pengerjaan (In Progress)' : 'Cancel Pending & Resume Work'}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            type="button"
                                            onClick={() => setIsUnclaimModalOpen(true)}
                                            disabled={isSubmitting || isUnclaiming}
                                            className="w-full border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 text-xs font-semibold"
                                        >
                                            ↩️ {lang === 'id' ? 'Batal Klaim Sepenuhnya (Kembalikan ke Open)' : 'Release Claim (Back to Open)'}
                                        </Button>
                                    </div>
                                )}

                                {issue?.status === 'progress' && (
                                    <div className="pt-2 border-t border-border/40">
                                        <Button
                                            variant="outline"
                                            type="button"
                                            onClick={() => setIsUnclaimModalOpen(true)}
                                            disabled={isSubmitting || isUnclaiming}
                                            className="w-full border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 text-xs font-semibold"
                                        >
                                            ↩️ {lang === 'id' ? 'Batal Klaim / Lepas Pekerjaan (Kembalikan ke Open)' : 'Unclaim / Release Job (Back to Open)'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </SheetContent>
            
            {/* Resume from Pending Dialog */}
            <Dialog open={isResumeModalOpen} onOpenChange={setIsResumeModalOpen}>
                <DialogContent className="max-w-md bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] p-5 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold flex items-center gap-2 text-blue-400">
                            <span>▶️</span>
                            <span>{lang === 'id' ? 'Batalkan Pending & Kembali ke Klaim' : 'Resume Work from Pending'}</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground pt-1">
                            {lang === 'id'
                                ? 'Status kartu akan dikembalikan ke IN PROGRESS di bawah nama klaim Anda.'
                                : 'Card status will return to IN PROGRESS under your claim.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2 text-xs">
                        <label className="flex items-center gap-2 p-2.5 rounded-lg bg-[#2A281E] border border-[#3B3929] cursor-pointer hover:border-blue-500/50">
                            <input
                                type="checkbox"
                                checked={removePendingOnResume}
                                onChange={(e) => setRemovePendingOnResume(e.target.checked)}
                                className="rounded text-blue-500 focus:ring-blue-500 bg-black/40 border-[#3B3929] h-4 w-4"
                            />
                            <span className="text-foreground">
                                {lang === 'id' ? 'Hapus catatan pending ini dari riwayat (misal karena salah klik pending)' : 'Delete this pending entry from history (accidental pending)'}
                            </span>
                        </label>

                        <div className="space-y-1.5">
                            <Label htmlFor="resume-reason-input" className="text-xs font-bold text-foreground">
                                {lang === 'id' ? 'Catatan / Alasan Lanjut Kerja' : 'Notes / Reason'}
                            </Label>
                            <Textarea
                                id="resume-reason-input"
                                rows={2}
                                value={resumeReason}
                                onChange={(e) => setResumeReason(e.target.value)}
                                placeholder={lang === 'id' ? 'Contoh: Salah pencet pending / kendala telah selesai' : 'e.g. Accidental pending / issue resolved'}
                                disabled={isUnclaiming}
                                className="bg-[#2A281E] border-[#3B3929] text-xs resize-none"
                            />
                        </div>
                    </div>

                    <DialogFooter className="gap-2 pt-2">
                        <Button
                            variant="outline"
                            type="button"
                            onClick={() => setIsResumeModalOpen(false)}
                            disabled={isUnclaiming}
                            className="text-xs h-9"
                        >
                            {lang === 'id' ? 'Batal' : 'Cancel'}
                        </Button>
                        <Button
                            type="button"
                            disabled={isUnclaiming}
                            onClick={async () => {
                                setIsUnclaiming(true);
                                try {
                                    await updateIssue(issue, {
                                        status: 'progress',
                                        statusReason: resumeReason.trim() || 'Melanjutkan pengerjaan dari pending',
                                        removePending: removePendingOnResume
                                    });
                                    setIsResumeModalOpen(false);
                                    onClose?.();
                                } catch (err) {
                                    alert(err.message || 'Failed to resume');
                                } finally {
                                    setIsUnclaiming(false);
                                }
                            }}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs h-9"
                        >
                            {isUnclaiming ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {lang === 'id' ? 'Memproses...' : 'Processing...'}
                                </>
                            ) : (
                                lang === 'id' ? 'Lanjut Pengerjaan' : 'Resume Progress'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Unclaim Confirmation Dialog */}
            <Dialog open={isUnclaimModalOpen} onOpenChange={setIsUnclaimModalOpen}>
                <DialogContent className="max-w-md bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] p-5 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold flex items-center gap-2 text-amber-400">
                            <span>↩️</span>
                            <span>{lang === 'id' ? 'Konfirmasi Batal Klaim Sepenuhnya' : 'Confirm Unclaim / Release Job'}</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground pt-1">
                            {lang === 'id'
                                ? 'Status kartu akan dikembalikan ke OPEN sehingga staf lain dapat mengambilnya. Nama Anda dan alasan pembatalan tetap tercatat di log kartu.'
                                : 'Card status will be reverted to OPEN for other technicians. Your name and unclaim reason will be recorded in the audit log.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2 text-xs">
                        {issue?.status === 'pending' && (
                            <label className="flex items-center gap-2 p-2.5 rounded-lg bg-[#2A281E] border border-[#3B3929] cursor-pointer hover:border-amber-500/50">
                                <input
                                    type="checkbox"
                                    checked={removePendingOnResume}
                                    onChange={(e) => setRemovePendingOnResume(e.target.checked)}
                                    className="rounded text-amber-500 focus:ring-amber-500 bg-black/40 border-[#3B3929] h-4 w-4"
                                />
                                <span className="text-foreground">
                                    {lang === 'id' ? 'Hapus juga catatan pending yang sedang berlangsung' : 'Also delete active pending record'}
                                </span>
                            </label>
                        )}

                        <div className="space-y-1.5">
                            <Label htmlFor="unclaim-reason-input" className="text-xs font-bold text-foreground">
                                {lang === 'id' ? 'Alasan Pembatalan / Pelepasan Pekerjaan' : 'Reason for Unclaiming'}
                            </Label>
                            <Textarea
                                id="unclaim-reason-input"
                                rows={3}
                                value={unclaimReason}
                                onChange={(e) => setUnclaimReason(e.target.value)}
                                placeholder={lang === 'id' ? 'Contoh: Sedang menangani pekerjaan darurat lain, dialihkan ke tim lain.' : 'e.g. Assigned to another urgent job.'}
                                disabled={isUnclaiming}
                                className="bg-[#2A281E] border-[#3B3929] text-xs resize-none"
                            />
                        </div>
                    </div>

                    <DialogFooter className="gap-2 pt-2">
                        <Button
                            variant="outline"
                            type="button"
                            onClick={() => setIsUnclaimModalOpen(false)}
                            disabled={isUnclaiming}
                            className="text-xs h-9"
                        >
                            {lang === 'id' ? 'Batal' : 'Cancel'}
                        </Button>
                        <Button
                            type="button"
                            disabled={isUnclaiming}
                            onClick={async () => {
                                setIsUnclaiming(true);
                                try {
                                    await updateIssue(issue, {
                                        status: 'open',
                                        statusReason: unclaimReason.trim() || 'Batal klaim oleh staf',
                                        removePending: removePendingOnResume
                                    });
                                    setIsUnclaimModalOpen(false);
                                    onClose?.();
                                } catch (err) {
                                    alert(err.message || 'Failed to unclaim');
                                } finally {
                                    setIsUnclaiming(false);
                                }
                            }}
                            className="bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs h-9"
                        >
                            {isUnclaiming ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {lang === 'id' ? 'Memproses...' : 'Processing...'}
                                </>
                            ) : (
                                lang === 'id' ? 'Ya, Lepas Klaim' : 'Yes, Release Claim'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <DelayDetailModal 
                open={!!selectedDelay} 
                onOpenChange={(open) => !open && setSelectedDelay(null)} 
                delayItem={selectedDelay} 
            />

            <ImageLightboxModal
                open={!!previewImage}
                onClose={() => setPreviewImage(null)}
                src={previewImage?.src || previewImage}
                title={previewImage?.title || issue?.title}
                subtitle={previewImage?.subtitle || 'Foto Laporan Kerusakan (Full Resolution)'}
            />
        </Sheet>
    );
}
