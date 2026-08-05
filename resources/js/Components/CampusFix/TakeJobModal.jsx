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

export function TakeJobModal({ issue, onClose }) {
    const { claimIssue } = useIssues();
    const [taker, setTaker] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (issue) {
            setTaker('');
            setErrorMsg('');
            setIsSubmitting(false);
        }
    }, [issue]);

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
                        <img src={issue.imageUrl} alt={issue.title} className="h-32 w-full object-cover" />
                        <div className="p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-foreground">{issue.title}</p>
                                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                    ID: {issue.id}-problem
                                </span>
                            </div>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
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

