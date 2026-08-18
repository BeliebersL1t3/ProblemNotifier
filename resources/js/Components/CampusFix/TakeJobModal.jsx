import { useEffect, useState } from 'react';
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
import { Input } from '@/Components/UI/Input';
import { Label } from '@/Components/UI/Label';
import { useIssues } from '@/context/IssuesContext';
import { CriticalTimer } from './CriticalTimer';

export function TakeJobModal({ issue, onClose }) {
    const { claimIssue, categories, updateIssueCategory } = useIssues();
    const [taker, setTaker] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (issue) {
            setTaker('');
            setErrorMsg('');
            setIsSubmitting(false);
        }
    }, [issue]);

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
        if (!taker.trim()) {
            setErrorMsg('Display Error: Name Required');
            return;
        }

        setIsSubmitting(true);
        setErrorMsg('');

        try {
            await claimIssue(issue, taker.trim());
            onClose();
        } catch (err) {
            console.error(err);
            setErrorMsg(err.response?.data?.message || err.message || 'Display Error: Job Already Taken');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={!!issue} onOpenChange={(o) => { if (!o && !isSubmitting) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Take this job</DialogTitle>
                    <DialogDescription>
                        Let everyone know you are handling it. The issue moves to In Progress.
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
                                className="h-32 w-full object-cover"
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
                                {issue.department && (
                                    <span className="shrink-0 rounded bg-blue-500/10 text-blue-600 px-1.5 py-0.5 font-mono text-[10px] font-medium border border-blue-500/20" title="Origin Department">
                                        🏠 {issue.department}
                                    </span>
                                )}
                                {issue.taggedDepartments && issue.taggedDepartments.map((tag, idx) => (
                                    <span key={idx} className="shrink-0 rounded bg-purple-500/10 text-purple-600 px-1.5 py-0.5 font-mono text-[10px] font-medium border border-purple-500/20" title="Tagged Department">
                                        @{tag}
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

                <div className="grid gap-2">
                    <Label htmlFor="taker">Your name</Label>
                    <Input
                        id="taker"
                        value={taker}
                        onChange={(e) => setTaker(e.target.value)}
                        placeholder="e.g. Budi S."
                        disabled={isSubmitting}
                    />
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button onClick={confirm} disabled={!taker.trim() || isSubmitting}>
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
            </DialogContent>
        </Dialog>
    );
}

