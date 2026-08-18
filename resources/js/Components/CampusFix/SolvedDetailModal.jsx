import { useState } from 'react';
import { CalendarClock, CheckCircle2, MapPin, User, Loader2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/Components/UI/Dialog';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';
import { useIssues } from '@/context/IssuesContext';
import DelayDetailModal from './DelayDetailModal';

export function SolvedDetailModal({ issue, onClose }) {
    const { categories, updateIssueCategory } = useIssues();
    const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [selectedDelay, setSelectedDelay] = useState(null);

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

    return (
        <Dialog open={!!issue} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{issue?.title ?? 'Issue'}</DialogTitle>
                    <DialogDescription>
                        {issue?.status === 'pending'
                            ? 'This issue is currently pending.'
                            : 'This issue has already been resolved.'}
                    </DialogDescription>
                </DialogHeader>

                {errorMsg && (
                    <div className="rounded-md bg-destructive/15 p-3 text-sm font-medium text-destructive mb-2">
                        {errorMsg}
                    </div>
                )}

                {issue && (
                    <div className="grid gap-4">
                        <StatusBadge
                            status={issue.status}
                            label={issue.status === 'solved' ? (issue.durationLabel ?? 'Solved') : 'Pending'}
                            className="w-fit"
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <figure className="space-y-1.5">
                                <img
                                    src={issue.imageUrl || '/barrier-placeholder.svg'}
                                    alt={`${issue.title} before the fix`}
                                    onError={(e) => { e.currentTarget.src = '/barrier-placeholder.svg'; }}
                                    className="h-36 w-full rounded-lg border border-border object-cover"
                                />
                                <figcaption className="text-center text-xs font-medium text-status-open">
                                    Before fix
                                </figcaption>
                                <span className="block text-center font-mono text-[10px] text-muted-foreground">
                                    ID: {issue.id}-problem
                                </span>
                            </figure>
                            <figure className="space-y-1.5">
                                <img
                                    src={(issue.status === 'pending' ? issue.pendingImageUrl : (issue.proofImageUrl ?? issue.imageUrl)) || '/barrier-placeholder.svg'}
                                    alt={`${issue.title} after update`}
                                    onError={(e) => { e.currentTarget.src = '/barrier-placeholder.svg'; }}
                                    className="h-36 w-full rounded-lg border border-border object-cover"
                                />
                                <figcaption className={cn("text-center text-xs font-medium", issue.status === 'pending' ? 'text-orange-500' : 'text-status-solved')}>
                                    {issue.status === 'pending' ? 'Reason for delay' : 'After fix'}
                                </figcaption>
                                <span className="block text-center font-mono text-[10px] text-muted-foreground">
                                    ID: {issue.id}-{issue.status === 'pending' ? 'pending' : 'proof'}
                                </span>
                            </figure>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
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

                        <div className="grid gap-2 text-sm text-muted-foreground">
                            <p className="flex items-center gap-2">
                                <MapPin className="h-4 w-4" aria-hidden />
                                {issue.location}
                            </p>
                            <p className="flex items-center gap-2">
                                <User className="h-4 w-4" aria-hidden />
                                Reported by {issue.reporter}
                            </p>
                            {issue.status === 'solved' ? (
                                <>
                                    <p className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                                        Fixed by {issue.solver}
                                    </p>
                                    {issue.solvedAt && (
                                        <p className="flex items-center gap-2">
                                            <CalendarClock className="h-4 w-4" aria-hidden />
                                            {new Date(issue.solvedAt).toLocaleString()}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="flex items-center gap-2 text-orange-500">
                                    <User className="h-4 w-4" aria-hidden />
                                    Pending by {issue.pendingBy}
                                </p>
                            )}
                        </div>

                        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm min-w-0">
                            <p className="font-semibold text-foreground">Problem</p>
                            <p className="mt-1 text-muted-foreground whitespace-pre-wrap break-words min-w-0">{issue.description}</p>
                            
                            {issue.status === 'solved' && issue.fixDescription && (
                                <>
                                    <p className="mt-3 font-semibold text-foreground">How it was fixed</p>
                                    <p className="mt-1 text-muted-foreground whitespace-pre-wrap break-words min-w-0">{issue.fixDescription}</p>
                                </>
                            )}

                            {issue.pendingTimeline && issue.pendingTimeline.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-border/60 min-w-0">
                                    <p className="font-semibold text-orange-500 text-xs mb-2">
                                        Delay History ({issue.pendingTimeline.length} delay{issue.pendingTimeline.length > 1 ? 's' : ''}):
                                    </p>
                                    <div className="flex flex-col gap-2.5 pl-2 border-l-2 border-orange-500/50 min-w-0">
                                        {issue.pendingTimeline.map((item, idx) => (
                                            <div key={idx} className="flex flex-col gap-1 pb-2 border-b border-border/40 last:border-0 last:pb-0 min-w-0">
                                                <div className="flex items-start gap-2 min-w-0">
                                                    {item.image && (
                                                        <img
                                                            src={item.image}
                                                            alt="delay proof"
                                                            className="w-10 h-10 object-cover rounded shadow-sm shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedDelay(item);
                                                            }}
                                                        />
                                                    )}
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-[11px] font-medium text-orange-600 break-words">
                                                            {item.date ? `${item.date} - ${item.by}` : item.by}
                                                        </span>
                                                        <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap break-words min-w-0 mt-0.5">
                                                            {item.reason}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {issue.status === 'pending' && issue.pendingReason && (!issue.pendingTimeline || issue.pendingTimeline.length === 0) && (
                                <>
                                    <p className="mt-3 font-semibold text-orange-500">Reason for Delay</p>
                                    <p className="mt-1 text-muted-foreground whitespace-pre-wrap break-words min-w-0">{issue.pendingReason}</p>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>

            <DelayDetailModal
                open={!!selectedDelay}
                onOpenChange={(open) => !open && setSelectedDelay(null)}
                delayItem={selectedDelay}
            />
        </Dialog>
    );
}
