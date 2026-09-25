import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MapPin, X, ZoomIn, Target, FileText, Megaphone, User } from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { Label } from '@/Components/UI/Label';
import { useIssues } from '@/context/IssuesContext';
import { CriticalTimer } from './CriticalTimer';
import { ImageLightboxModal } from './ImageLightboxModal';
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

export function TakeJobModal({ issue, onClose }) {
    const { t, lang } = useLanguage();
    const { claimIssue, categories, updateIssueCategory } = useIssues();
    const { isDeptUser, department, staffName, isAdmin, activeStaffRoster } = useAuth();
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedStaff, setSelectedStaff] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [previewImage, setPreviewImage] = useState(null);

    const assignedList = useMemo(() => safeArray(issue?.assignedDepartments), [issue?.assignedDepartments]);
    const taggedList = useMemo(() => safeArray(issue?.taggedDepartments), [issue?.taggedDepartments]);

    // Check if the current user can claim this issue (only assigned department or admin; maker/origin department CANNOT claim)
    const canClaim = useMemo(() => {
        if (!issue || Boolean(issue._isPastContribution)) return false;
        if (isAdmin) return true;
        if (!department) return false;

        const userDeptNorm = normalizeDepartment(department).toLowerCase();
        const originDeptNorm = normalizeDepartment(issue.department).toLowerCase();

        // If the logged-in department is the maker / origin department, they CANNOT claim
        if (userDeptNorm === originDeptNorm) return false;

        // If no assigned departments, allow non-origin users
        if (assignedList.length === 0) return true;

        // Must be in assigned list (excluding origin)
        return assignedList.some(d => {
            const dNorm = normalizeDepartment(d).toLowerCase();
            return dNorm === userDeptNorm && dNorm !== originDeptNorm;
        });
    }, [isAdmin, issue, department, assignedList]);

    // Build the list of authorized departments for taking the job (assigned + tagged, EXCLUDING origin department)
    const authorizedDepts = useMemo(() => {
        if (!issue) return [];
        const originDeptNorm = normalizeDepartment(issue.department).toLowerCase();
        return [...new Set([...assignedList, ...taggedList])]
            .filter(Boolean)
            .filter(d => normalizeDepartment(d).toLowerCase() !== originDeptNorm);
    }, [issue, assignedList, taggedList]);

    const staffForSelectedDept = useMemo(() => {
        if (!selectedDept) return [];
        return getStaffForDepartment(selectedDept, activeStaffRoster) || [];
    }, [selectedDept, activeStaffRoster]);

    const hasAuthorizedDepts = authorizedDepts.length > 0;

    useEffect(() => {
        if (issue) {
            // Pre-fill from logged-in department account
            if (isDeptUser && department) {
                setSelectedDept(department);
                setSelectedStaff(staffName || '');
            } else {
                setSelectedDept('');
                setSelectedStaff('');
            }
            setErrorMsg('');
            setIsSubmitting(false);
            setPreviewImage(null);
        }
    }, [issue, isDeptUser, department, staffName]);

    // Close on Escape key
    useEffect(() => {
        if (!issue) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && !isSubmitting) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [issue, isSubmitting, onClose]);

    if (!issue) return null;

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

    const confirm = async () => {
        if (!issue) return;
        if (!selectedDept) {
            setErrorMsg('Please select your department first.');
            return;
        }
        if (!selectedStaff) {
            setErrorMsg('Please select your name.');
            return;
        }

        setIsSubmitting(true);
        setErrorMsg('');

        try {
            await claimIssue(issue, selectedStaff, selectedDept);
            onClose();
        } catch (err) {
            console.error(err);
            setErrorMsg(err.response?.data?.message || err.message || 'Display Error: Job Already Taken');
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <>
            <div 
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={(e) => {
                    if (e.target === e.currentTarget && !isSubmitting) onClose();
                }}
            >
                <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="flex items-start justify-between px-6 pt-6 pb-2">
                        <div>
                            <h2 className="text-lg font-bold text-foreground">
                                {canClaim ? 'Take this job' : 'Issue Details'}
                            </h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {canClaim 
                                    ? 'Select your department and name. The issue moves to In Progress.'
                                    : 'You are monitoring this issue. Only the assigned department can claim it.'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => !isSubmitting && onClose()}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted transition-colors cursor-pointer"
                        >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Close</span>
                        </button>
                    </div>

                    {/* Scrollable Body */}
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                        {errorMsg && (
                            <div className="rounded-md bg-destructive/15 p-3 text-sm font-medium text-destructive">
                                {errorMsg}
                            </div>
                        )}

                        <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
                            <div className="relative">
                                <img
                                    src={issue.imageUrl || '/barrier-placeholder.svg'}
                                    alt={issue.title || 'Issue photo'}
                                    className="h-48 w-full object-cover bg-black/20"
                                    onError={(e) => { e.currentTarget.src = '/barrier-placeholder.svg'; }}
                                />
                                {issue.imageUrl && (
                                    <button
                                        type="button"
                                        onClick={() => setPreviewImage(issue.imageUrl)}
                                        className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-black text-white transition-colors border border-white/20 shadow-md cursor-pointer"
                                        title="Lihat Foto Ukuran Penuh"
                                    >
                                        <ZoomIn className="w-4 h-4 text-[#C9AA71]" />
                                    </button>
                                )}
                                <CriticalTimer
                                    deadline={issue.deadline}
                                    status={issue.status}
                                    isArchived={Boolean(issue.isArchived || issue.statusDisplay === '0' || issue.displayStatus === '0')}
                                    className="absolute right-2 top-2"
                                />
                            </div>
                            <div className="p-3.5 space-y-2">
                                {issue.priority === 'critical' && issue.deadline && !issue.isArchived && (
                                    <div className="mb-2">
                                        <CriticalTimer
                                            deadline={issue.deadline}
                                            status={issue.status}
                                            isArchived={Boolean(issue.isArchived || issue.statusDisplay === '0' || issue.displayStatus === '0')}
                                            variant="banner"
                                        />
                                    </div>
                                )}
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-foreground">{issue.title || 'Untitled Issue'}</p>
                                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                        ID: {issue.id}-problem
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {assignedList.length > 0 && assignedList.map((dept, idx) => (
                                        <span key={'assign-' + idx} className="shrink-0 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 font-mono text-[10px] font-semibold border border-amber-500/30 flex items-center gap-1" title="Assigned Department (Responsible to fix)">
                                            <Target className="w-2.5 h-2.5 shrink-0" /> {dept}
                                        </span>
                                    ))}
                                    {issue.department && (
                                        <span className="shrink-0 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 font-mono text-[10px] font-medium border border-blue-500/20 flex items-center gap-1" title="Origin Department">
                                            <FileText className="w-2.5 h-2.5 shrink-0" /> {issue.department}
                                        </span>
                                    )}
                                    {taggedList.length > 0 && taggedList.map((tag, idx) => (
                                        <span key={'tag-' + idx} className="shrink-0 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 font-mono text-[10px] font-medium border border-purple-500/20 flex items-center gap-1" title="Tagged Department">
                                            <Megaphone className="w-2.5 h-2.5 shrink-0" /> @{tag}
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
                                            {(categories || []).map(c => (
                                                <option key={c.id} value={c.id}>{c.label}</option>
                                            ))}
                                        </select>
                                        {isUpdatingCategory && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                                    </div>
                                </div>
                                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                                    {issue.location || 'Location not specified'}
                                </p>
                                <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                                    {issue.description || 'No description provided.'}
                                </p>
                                <p className="text-xs font-medium text-muted-foreground pt-1">
                                    Reported by {issue.reporter || 'Staff'}
                                </p>
                            </div>
                        </div>

                        {!canClaim ? (
                            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
                                <span className="text-base">🔒</span>
                                <div>
                                    <p className="font-semibold text-amber-200">{t('monitor_mode_title')}</p>
                                    <p className="text-muted-foreground mt-0.5">
                                        {t('monitor_mode_desc').replace('{dept}', assignedList.join(', ') || t('department'))}
                                    </p>
                                </div>
                            </div>
                        ) : isDeptUser && department ? (() => {
                            const dTheme = getDepartmentTheme(department);
                            return (
                                <div className="rounded-xl border border-[#3B3929] bg-[#2A281E] p-4 space-y-3 shadow-md">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-[#A19F8D]">{t('claiming_department')}</span>
                                        <span 
                                            className="px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-sm"
                                            style={{
                                                backgroundColor: dTheme.bg === '#212121' ? 'rgba(255, 255, 255, 0.12)' : `${dTheme.bg}25`,
                                                borderColor: dTheme.bg === '#212121' ? 'rgba(255, 255, 255, 0.35)' : `${dTheme.bg}80`,
                                                color: dTheme.bg === '#212121' ? '#FFFFFF' : (dTheme.text === '#14130B' ? '#FBBF24' : dTheme.bg)
                                            }}
                                        >
                                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: dTheme.bg }} />
                                            <Target className="w-3.5 h-3.5 shrink-0" /> {department}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between pt-2.5 border-t border-[#3B3929]/70">
                                        <span className="text-xs font-semibold text-[#A19F8D]">{t('staff_name')}</span>
                                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#C9AA71]/15 text-[#E3D1AA] border border-[#C9AA71]/40 flex items-center gap-1.5 shadow-sm">
                                            <User className="w-3.5 h-3.5 shrink-0" /> {staffName || selectedStaff || 'Staff'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })() : (
                            <div className="space-y-4 pt-1">
                                <div className="grid gap-2">
                                    <Label>
                                        Step 1 — Your Department
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

                                {selectedDept && (
                                    <div className="grid gap-2">
                                        <Label>
                                            Step 2 — Your Name
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
                                                No staff roster found for {selectedDept}. Please contact your admin.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-border bg-muted/20">
                        <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                            {canClaim ? 'Cancel' : 'Close'}
                        </Button>
                        {canClaim && (
                            <Button
                                onClick={confirm}
                                disabled={!selectedDept || !selectedStaff || isSubmitting || !hasAuthorizedDepts}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Claiming...
                                    </>
                                ) : (
                                    'Confirm'
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <ImageLightboxModal 
                open={!!previewImage} 
                onClose={() => setPreviewImage(null)} 
                src={typeof previewImage === 'string' ? previewImage : previewImage?.src} 
                title={previewImage?.title || issue?.title} 
                subtitle="Foto Laporan Kerusakan (Full Size)" 
            />
        </>,
        document.body
    );
}
