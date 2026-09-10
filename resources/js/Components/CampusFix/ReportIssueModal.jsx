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
import { Loader2, AlertTriangle, CalendarClock, Clock } from 'lucide-react';
import { ALL_DEPARTMENTS, getStaffForDepartment, normalizeDepartment } from '@/constants/staff';
import { getDepartmentTheme } from '@/constants/departments';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';
import { useDepartmentScheduleConflicts } from '@/hooks/useDepartmentScheduleConflicts';
import { DepartmentScheduleWarning } from './DepartmentScheduleWarning';
import { InlineAnalogClockPicker } from './CircularTimePickerModal';

export function ReportIssueModal({ open, onOpenChange }) {
    const { t, lang } = useLanguage();
    const { addIssue } = useIssues();
    const { isDeptUser, department, staffName } = useAuth();
    const [originDept, setOriginDept] = useState('');
    const [reporter, setReporter] = useState('');
    const [title, setTitle] = useState('');
    const [locMain, setLocMain] = useState('');      // 'TPI' | 'TBR' | 'Kantor' | ''
    const [locDetail, setLocDetail] = useState('');  // Optional specifics
    const [category, setCategory] = useState('broken');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState('low');
    const [deadline, setDeadline] = useState('15');
    const [customDeadlineMs, setCustomDeadlineMs] = useState(null);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [assignedDepts, setAssignedDepts] = useState([]);
    const [taggedDepts, setTaggedDepts] = useState([]);
    const [imageFile, setImageFile] = useState(null);
    const [imageUrl, setImageUrl] = useState(undefined);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [showConflictConfirm, setShowConflictConfirm] = useState(false);

    const selectedTargetDepts = useMemo(() => {
        return [...new Set([...assignedDepts, ...taggedDepts])];
    }, [assignedDepts, taggedDepts]);

    const { conflicts, conflictsByDept, hasConflicts } = useDepartmentScheduleConflicts(selectedTargetDepts);

    const DRAFT_KEY = 'campusfix_report_draft';
    const [hasDraftRestored, setHasDraftRestored] = useState(false);

    // Check and restore saved draft when modal opens
    useEffect(() => {
        if (open) {
            if (isDeptUser && department) {
                setOriginDept(department);
                if (staffName) setReporter(staffName);
            }
            setShowConflictConfirm(false);

            try {
                const saved = localStorage.getItem(DRAFT_KEY);
                if (saved) {
                    const d = JSON.parse(saved);
                    if (d.title) setTitle(d.title);
                    if (d.description) setDescription(d.description);
                    if (d.locMain) setLocMain(d.locMain);
                    if (d.locDetail) setLocDetail(d.locDetail);
                    if (d.category) setCategory(d.category);
                    if (d.priority) setPriority(d.priority);
                    if (d.deadline) setDeadline(d.deadline);
                    if (d.originDept && !isDeptUser) setOriginDept(d.originDept);
                    if (d.reporter && !isDeptUser) setReporter(d.reporter);
                    if (Array.isArray(d.assignedDepts) && d.assignedDepts.length > 0) {
                        const restoredAssigned = d.assignedDepts.map(normalizeDepartment);
                        setAssignedDepts(restoredAssigned);
                        if (Array.isArray(d.taggedDepts) && d.taggedDepts.length > 0) {
                            const assignedSet = new Set(restoredAssigned.map(a => a.toLowerCase()));
                            setTaggedDepts(d.taggedDepts.map(normalizeDepartment).filter(t => !assignedSet.has(t.toLowerCase())));
                        }
                    } else if (Array.isArray(d.taggedDepts) && d.taggedDepts.length > 0) {
                        setTaggedDepts(d.taggedDepts.map(normalizeDepartment));
                    }
                    if (d.title || d.description) {
                        setHasDraftRestored(true);
                    }
                }
            } catch (e) {}
        }
    }, [open, isDeptUser, department, staffName]);

    // Auto-save draft changes to localStorage
    useEffect(() => {
        if (!open) return;
        try {
            const draft = {
                originDept,
                reporter,
                title,
                locMain,
                locDetail,
                category,
                description,
                priority,
                deadline,
                assignedDepts,
                taggedDepts,
            };
            if (title.trim() || description.trim() || locDetail.trim()) {
                localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
            }
        } catch (e) {}
    }, [open, originDept, reporter, title, locMain, locDetail, category, description, priority, deadline, assignedDepts, taggedDepts]);

    const clearDraft = () => {
        try {
            localStorage.removeItem(DRAFT_KEY);
        } catch (e) {}
        setHasDraftRestored(false);
        reset();
    };

    // Reset confirmation prompt if assigned or tagged depts change
    useEffect(() => {
        setShowConflictConfirm(false);
    }, [assignedDepts, taggedDepts]);

    const staffForOriginDept = useMemo(() => {
        if (!originDept) return [];
        return getStaffForDepartment(originDept);
    }, [originDept]);

    const handleOriginDeptChange = (dept) => {
        setOriginDept(dept);
        setReporter(''); // reset reporter when dept changes
    };

    // Build the full location string: "TBR - Room 12" or just "TBR"
    const location = locMain
        ? (locDetail.trim() ? `${locMain} - ${locDetail.trim()}` : locMain)
        : locDetail.trim();

    const MAIN_LOCATIONS = ['TPI', 'TBR', 'Kantor'];

    const valid = reporter.trim() && title.trim() && location.trim() && description.trim() && originDept && assignedDepts.length > 0 && imageFile;

    const reset = () => {
        setOriginDept(isDeptUser && department ? department : '');
        setReporter(isDeptUser && staffName ? staffName : '');
        setTitle('');
        setLocMain('');
        setLocDetail('');
        setCategory('broken');
        setDescription('');
        setPriority('low');
        setDeadline('15');
        setCustomDeadlineMs(null);
        setShowTimePicker(false);
        setAssignedDepts([]);
        setTaggedDepts([]);
        setImageFile(null);
        setImageUrl(undefined);
        setErrorMsg('');
        setShowConflictConfirm(false);
        setIsSubmitting(false);
        try {
            localStorage.removeItem(DRAFT_KEY);
        } catch (e) {}
        setHasDraftRestored(false);
    };

    const isAssigned = (dept) => {
        const norm = normalizeDepartment(dept).toLowerCase();
        return assignedDepts.some(a => normalizeDepartment(a).toLowerCase() === norm);
    };

    const isTagged = (dept) => {
        const norm = normalizeDepartment(dept).toLowerCase();
        return taggedDepts.some(t => normalizeDepartment(t).toLowerCase() === norm);
    };

    const toggleAssigned = (dept) => {
        const norm = normalizeDepartment(dept);
        const normLower = norm.toLowerCase();
        setAssignedDepts(prev => {
            const exists = prev.some(d => normalizeDepartment(d).toLowerCase() === normLower);
            return exists
                ? prev.filter(d => normalizeDepartment(d).toLowerCase() !== normLower)
                : [...prev.filter(d => normalizeDepartment(d).toLowerCase() !== normLower), norm];
        });
        // Mutually exclusive: strictly remove from tagged
        setTaggedDepts(prev => prev.filter(d => normalizeDepartment(d).toLowerCase() !== normLower));
    };

    const toggleTag = (dept) => {
        const norm = normalizeDepartment(dept);
        const normLower = norm.toLowerCase();
        setTaggedDepts(prev => {
            const exists = prev.some(d => normalizeDepartment(d).toLowerCase() === normLower);
            return exists
                ? prev.filter(d => normalizeDepartment(d).toLowerCase() !== normLower)
                : [...prev.filter(d => normalizeDepartment(d).toLowerCase() !== normLower), norm];
        });
        // Mutually exclusive: strictly remove from assigned
        setAssignedDepts(prev => prev.filter(d => normalizeDepartment(d).toLowerCase() !== normLower));
    };

    const handleSubmitClick = (e) => {
        e?.preventDefault();
        if (!valid || isSubmitting) return;

        // If there are conflicts on today's schedule and user hasn't confirmed, trigger confirmation
        if (hasConflicts && !showConflictConfirm) {
            setShowConflictConfirm(true);
            return;
        }

        executeSubmit();
    };

    const executeSubmit = async () => {
        if (!valid || isSubmitting) return;
        setIsSubmitting(true);
        setErrorMsg('');

        try {
            let finalDeadline = '';
            if (priority === 'critical') {
                finalDeadline = (customDeadlineMs || (Date.now() + 15 * 60000)).toString();
            }

            const res = await addIssue({
                reporter: reporter.trim(),
                title: title.trim(),
                location: location.trim(),
                category,
                department: originDept,
                assignedDepartments: assignedDepts.join(', '),
                taggedDepartments: taggedDepts.join(', '),
                description: description.trim(),
                imageFile,
                priority,
                deadline: finalDeadline,
            });

            if (res?.queuedOffline) {
                alert(lang === 'id'
                    ? `📡 Wi-Fi tidak terhubung. Laporan "${title}" telah disimpan di antrean offline dengan waktu saat ini (${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}). Laporan akan otomatis terkirim begitu Anda terhubung ke Wi-Fi.`
                    : `📡 Wi-Fi disconnected. Report "${title}" saved to offline outbox with original timestamp (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}). It will auto-upload as soon as Wi-Fi reconnects.`
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
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Report an issue</DialogTitle>
                    <DialogDescription>
                        Tell the community what is broken so someone nearby can pick it up.
                    </DialogDescription>
                </DialogHeader>

                {hasDraftRestored && (
                    <div className="flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-300">
                        <span>💾 {lang === 'id' ? 'Draft laporan otomatis dipulihkan' : 'Report draft auto-restored'}</span>
                        <button
                            type="button"
                            onClick={clearDraft}
                            className="underline text-amber-200 hover:text-white font-semibold cursor-pointer"
                        >
                            {lang === 'id' ? 'Hapus Draft' : 'Clear Draft'}
                        </button>
                    </div>
                )}

                {errorMsg && (
                    <div className="rounded-md bg-destructive/15 p-3 text-sm font-medium text-destructive">
                        {errorMsg}
                    </div>
                )}

                <div className="grid gap-4">
                    {/* Step 1: Origin Department */}
                    <div className="grid gap-2 p-3 rounded-lg border border-blue-500/30 bg-blue-500/5">
                        <div className="flex flex-col gap-0.5">
                            <Label htmlFor="originDept" className="text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1.5">
                                🏠 1. Origin Department (Discovered By) <span className="text-xs text-destructive">*</span>
                            </Label>
                            <span className="text-xs text-muted-foreground">
                                {isDeptUser 
                                    ? 'Locked to your department account.' 
                                    : 'Select department discovering the issue.'}
                            </span>
                        </div>

                        {isDeptUser && originDept ? (
                            <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#2A281E] border border-[#3B3929]">
                                <span className="text-xs font-bold text-[#C9AA71]">🔒 {originDept}</span>
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
                                <SelectTrigger id="originDept" className="bg-surface">
                                    <SelectValue placeholder="-- Select Your Department --" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ALL_DEPARTMENTS.map((dept) => (
                                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {/* Step 2: Submitter Name (from Staff Roster) */}
                    <div className="grid gap-2 p-3 rounded-lg border border-border bg-muted/30">
                        <div className="flex items-center justify-between">
                            <Label className="font-semibold flex items-center gap-1.5">
                                👤 2. Submitter Name (Pelapor) <span className="text-xs text-destructive">*</span>
                            </Label>
                            {originDept && (
                                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                    {originDept} Staff
                                </span>
                            )}
                        </div>

                        {isDeptUser && (staffName || reporter) ? (
                            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#2A281E] border border-[#3B3929]">
                                <span className="text-xs font-bold text-[#C9AA71] flex items-center gap-1.5">
                                    <span>🔒</span> {staffName || reporter}
                                </span>
                                <span className="text-[11px] text-[#A19F8D] font-medium">
                                    {t('locked_to_your_account') || (lang === 'id' ? 'Terkunci ke akun Anda' : 'Locked to your account')}
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
                                            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                                                reporter === name
                                                    ? 'bg-primary text-primary-foreground border-primary shadow-sm ring-2 ring-primary/20'
                                                    : 'bg-surface text-muted-foreground border-border hover:border-primary/50 hover:bg-primary/10'
                                            }`}
                                        >
                                            {reporter === name ? `✓ ${name}` : name}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <Input
                                    id="reporter"
                                    value={reporter}
                                    onChange={(e) => setReporter(e.target.value)}
                                    placeholder="Enter your name..."
                                    disabled={isSubmitting}
                                />
                            )
                        ) : (
                            <p className="text-xs text-muted-foreground italic py-1">
                                👆 {t('select_origin_dept_first') || (lang === 'id' ? 'Pilih Departemen Asal di atas untuk memilih nama.' : 'Please select an Origin Department above to choose your name.')}
                            </p>
                        )}
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="title">Issue title</Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Broken lab door handle"
                            disabled={isSubmitting}
                        />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                            <Label>Location</Label>
                            {/* Main location quick-select */}
                            <div className="flex gap-2">
                                {MAIN_LOCATIONS.map(loc => (
                                    <button
                                        key={loc}
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => setLocMain(prev => prev === loc ? '' : loc)}
                                        className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition-colors ${
                                            locMain === loc
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-surface text-muted-foreground border-border hover:border-primary/50'
                                        }`}
                                    >
                                        {loc}
                                    </button>
                                ))}
                            </div>
                            {/* Optional detail/specific location */}
                            <Input
                                id="location"
                                value={locDetail}
                                onChange={(e) => setLocDetail(e.target.value)}
                                placeholder={locMain ? `More specific in ${locMain}… (optional)` : 'Or just type a location…'}
                                disabled={isSubmitting}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="category">Category</Label>
                            <Select
                                value={category}
                                disabled={isSubmitting}
                                onValueChange={setCategory}
                            >
                                <SelectTrigger id="category">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="broken">Broken Equipment</SelectItem>
                                    <SelectItem value="plumbing">Plumbing</SelectItem>
                                    <SelectItem value="electrical">Electrical</SelectItem>
                                    <SelectItem value="structural">Structural / Building</SelectItem>
                                    <SelectItem value="pest-hygiene">Pest &amp; Hygiene</SelectItem>
                                    <SelectItem value="it-technology">IT &amp; Technology</SelectItem>
                                    <SelectItem value="marine-outdoor">Marine &amp; Outdoor</SelectItem>
                                    <SelectItem value="safety-hazard">Safety Hazard</SelectItem>
                                    <SelectItem value="guest-issues">Guest Issues</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Assigned Department(s) - Required & Multi-Select */}
                    <div className="grid gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                        <div className="flex flex-col gap-0.5">
                            <Label className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5">
                                🎯 Assigned Department(s) <span className="text-xs text-destructive">*</span>
                            </Label>
                            <span className="text-xs text-muted-foreground">
                                Select department(s) <strong>responsible for fixing / acting</strong> on this issue.
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                            {ALL_DEPARTMENTS
                                .filter(d => {
                                    const normD = normalizeDepartment(d).toLowerCase();
                                    if (originDept && normalizeDepartment(originDept).toLowerCase() === normD) return false;
                                    if (isTagged(d)) return false;
                                    return true;
                                })
                                .map(dept => (
                                    <button
                                        key={dept}
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => toggleAssigned(dept)}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                                            isAssigned(dept) 
                                                ? 'bg-amber-600 text-white border-amber-600 shadow-sm ring-2 ring-amber-500/20' 
                                                : 'bg-surface text-muted-foreground border-border hover:border-amber-500/50 hover:bg-amber-500/10'
                                        }`}
                                    >
                                        {isAssigned(dept) ? `✓ ${dept}` : dept}
                                    </button>
                                ))}
                        </div>
                    </div>

                    {/* Tagged Department(s) - Optional Info/FYI */}
                    <div className="grid gap-2 p-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5">
                        <div className="flex flex-col gap-0.5">
                            <Label className="text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1.5">
                                📢 Tagged Department(s) <span className="text-xs font-normal text-muted-foreground">(Info / Awareness only - Optional)</span>
                            </Label>
                            <span className="text-xs text-muted-foreground">
                                Notify other departments for situational awareness (e.g. tag GR if villa is under repair).
                            </span>
                            <div className="flex flex-wrap gap-2 pt-1">
                            {ALL_DEPARTMENTS
                                .filter(d => {
                                    const normD = normalizeDepartment(d).toLowerCase();
                                    if (originDept && normalizeDepartment(originDept).toLowerCase() === normD) return false;
                                    if (isAssigned(d)) return false;
                                    return true;
                                })
                                .map(dept => (
                                    <button
                                        key={dept}
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => toggleTag(dept)}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                                            isTagged(dept) 
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-500/20' 
                                                : 'bg-surface text-muted-foreground border-border hover:border-indigo-500/50 hover:bg-indigo-500/10'
                                        }`}
                                    >
                                        {isTagged(dept) ? `✓ ${dept}` : dept}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Department Calendar / Schedule Conflict Warning */}
                    {hasConflicts && (
                        <DepartmentScheduleWarning conflictsByDept={conflictsByDept} className="my-1" />
                    )}

                    <div className="grid gap-2">
                        <Label htmlFor="priority">{lang === 'id' ? 'Tingkat Prioritas' : 'Priority Level'}</Label>
                        <Select value={priority} onValueChange={setPriority} disabled={isSubmitting}>
                            <SelectTrigger id="priority">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="low">{lang === 'id' ? 'Prioritas' : 'Priority'}</SelectItem>
                                <SelectItem value="high">{lang === 'id' ? 'Prioritas Tinggi' : 'High Priority'}</SelectItem>
                                <SelectItem value="critical">{lang === 'id' ? '🚨 Kritis' : '🚨 Critical'}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

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

                    <div className="grid gap-2">
                        <Label htmlFor="description">Problem description</Label>
                        <Textarea
                            id="description"
                            rows={4}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe what happened and how it affects people."
                            disabled={isSubmitting}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label>Photo of the problem</Label>
                        <ImageDropzone
                            previewUrl={imageUrl}
                            onChange={(file, preview) => {
                                setImageFile(file);
                                setImageUrl(preview);
                            }}
                        />
                    </div>

                    {/* Schedule Conflict Confirmation Banner */}
                    {showConflictConfirm && hasConflicts && (
                        <div className="rounded-xl border border-amber-500/60 bg-amber-500/20 p-4 space-y-3 shadow-lg ring-2 ring-amber-500/40 animate-in fade-in zoom-in-95">
                            <div className="flex items-start gap-2.5">
                                <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="text-sm font-bold text-amber-200">
                                        {t('schedule_conflict_confirm_title')}
                                    </h4>
                                    <p className="text-xs text-amber-100/90 mt-1 leading-relaxed">
                                        {t('schedule_conflict_confirm_msg')}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-500/30">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowConflictConfirm(false)}
                                    disabled={isSubmitting}
                                    className="text-xs cursor-pointer"
                                >
                                    {t('review_assignment_btn')}
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={executeSubmit}
                                    disabled={isSubmitting}
                                    className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs cursor-pointer shadow-md"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                            Uploading...
                                        </>
                                    ) : (
                                        t('assign_anyway_btn')
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={handleSubmitClick} disabled={!valid || isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Uploading to Drive...
                            </>
                        ) : (
                            t('submit') || 'Submit report'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

