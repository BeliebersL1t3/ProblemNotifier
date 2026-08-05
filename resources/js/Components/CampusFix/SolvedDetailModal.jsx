import { CalendarClock, CheckCircle2, MapPin, User } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/Components/UI/Dialog';
import { StatusBadge } from './StatusBadge';

export function SolvedDetailModal({ issue, onClose }) {
    return (
        <Dialog open={!!issue} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{issue?.title ?? 'Issue'}</DialogTitle>
                    <DialogDescription>This issue has already been resolved.</DialogDescription>
                </DialogHeader>

                {issue && (
                    <div className="grid gap-4">
                        <StatusBadge
                            status="solved"
                            label={issue.durationLabel ?? 'Solved'}
                            className="w-fit"
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <figure className="space-y-1.5">
                                <img
                                    src={issue.imageUrl}
                                    alt={`${issue.title} before the fix`}
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
                                    src={issue.proofImageUrl ?? issue.imageUrl}
                                    alt={`${issue.title} after the fix`}
                                    className="h-36 w-full rounded-lg border border-border object-cover"
                                />
                                <figcaption className="text-center text-xs font-medium text-status-solved">
                                    After fix
                                </figcaption>
                                <span className="block text-center font-mono text-[10px] text-muted-foreground">
                                    ID: {issue.id}-proof
                                </span>
                            </figure>
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
                        </div>
                        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                            <p className="font-semibold text-foreground">Problem</p>
                            <p className="mt-1 text-muted-foreground">{issue.description}</p>
                            {issue.fixDescription && (
                                <>
                                    <p className="mt-3 font-semibold text-foreground">How it was fixed</p>
                                    <p className="mt-1 text-muted-foreground">{issue.fixDescription}</p>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
