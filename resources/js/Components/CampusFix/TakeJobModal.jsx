import { useEffect, useState, useMemo } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/UI/Dialog';
import { Label } from '@/Components/UI/Label';
import { useIssues } from '@/context/IssuesContext';
import { CriticalTimer } from './CriticalTimer';
import { ImageLightboxModal } from './ImageLightboxModal';
import { getStaffForDepartment } from '@/constants/staff';

export function TakeJobModal({ issue, onClose }) {
    const { claimIssue, categories, updateIssueCategory } = useIssues();
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedStaff, setSelectedStaff] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [previewImage, setPreviewImage] = useState(null);

    // Build the list of authorized departments (assigned + tagged)
    const authorizedDepts = useMemo(() => {
        if (!issue) return [];
        const assigned = Array.isArray(issue.assignedDepartments) ? issue.assignedDepartments : [];
        const tagged = Array.isArray(issue.taggedDepartments) ? issue.taggedDepartments : [];
        // Deduplicate
        return [...new Set([...assigned, ...tagged])];
    }, [issue]);

    const staffForSelectedDept = useMemo(() => {
        if (!selectedDept) return [];
        return getStaffForDepartment(selectedDept);
    }, [selectedDept]);

    useEffect(() => {
        if (issue) {
            setSelectedDept('');
            setSelectedStaff('');
            setErrorMsg('');
            setIsSubmitting(false);
        }
    }, [issue]);

    // When dept changes, clear staff selection
    useEffect(() => {
        setSelectedStaff('');
    }, [selectedDept]);

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

    const hasAuthorizedDepts = authorizedDepts.length > 0;

    return (
        <Dialog open={!!issue} onOpenChange={(o) => { if (!o && !isSubmitting) onClose(); }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Take this job</DialogTitle>
                    <DialogDescription>
                        Select your department and name. The issue moves to In Progress.
                    </DialogDescription>
                </DialogHeader>

                {errorMsg && (
                    <div className="rounded-md bg-destructive/15 p-3 text-sm font-medium text-destructive">
                        {errorMsg}
                    </div>
                )}

                {issue && (
                    <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
                        <div className="relative">
                            <img
                                src={issue.imageUrl || '/barrier-placeholder.svg'}
                                alt={issue.title}
                                onError={(e) => { e.currentTarget.src = '/barrier-placeholder.svg'; }}
                                className="h-60 sm:h-72 w-full object-cover bg-black/40 rounded-t-lg transition-transform duration-300 hover:scale-105"
                            />
                            <CriticalTimer
                                deadline={issue.deadline}
                                status={issue.status}
                                className="absolute right-3 top-3"
                            />
                        </div>
                        <div className="p-3">
                            {issue.priority === 'critical' && issue.deadline && issue.status !== 'solved' && (
                                <CriticalTimer
                                    deadline={issue.deadline}
                                    status={issue.status}
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
                                {issue.assignedDepartments && issue.assignedDepartments.length > 0 && issue.assignedDepartments.map((dept, idx) => (
                                    <span key={'assign-' + idx} className="shrink-0 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 font-mono text-[10px] font-semibold border border-amber-500/30" title="Assigned Department (Responsible to fix)">
                                        🎯 {dept}
                                    </span>
                                ))}
                                {issue.department && (
                                    <span className="shrink-0 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 font-mono text-[10px] font-medium border border-blue-500/20" title="Origin Department">
                                        🏠 {issue.department}
                                    </span>
                                )}
                                {issue.taggedDepartments && issue.taggedDepartments.map((tag, idx) => (
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
                            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                {issue.description}
                            </p>
                            <p className="mt-2 text-xs font-medium text-muted-foreground">
                                Reported by {issue.reporter}
                            </p>
                        </div>
                    </div>
                )}

                {/* Step 1: Department Selection */}
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
                                    onClick={() => setSelectedDept(dept)}
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

                {/* Step 2: Staff Name Selection */}
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

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
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
                </DialogFooter>
                <ImageLightboxModal 
                    open={!!previewImage} 
                    onClose={() => setPreviewImage(null)} 
                    src={previewImage} 
                    title={issue?.title} 
                    subtitle="Foto Laporan Kerusakan (Full Size)" 
                />
            </DialogContent>
        </Dialog>
    );
}
