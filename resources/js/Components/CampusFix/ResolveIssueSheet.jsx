import { useEffect, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/Components/UI/Sheet';
import { Input } from '@/Components/UI/Input';
import { Label } from '@/Components/UI/Label';
import { Textarea } from '@/Components/UI/Textarea';
import { ImageDropzone } from './ImageDropzone';
import { useIssues } from '@/context/IssuesContext';

export function ResolveIssueSheet({ issue, onClose }) {
    const { resolveIssue } = useIssues();
    const [solver, setSolver] = useState('');
    const [fixDescription, setFixDescription] = useState('');
    const [proofImageFile, setProofImageFile] = useState(null);
    const [proofImageUrl, setProofImageUrl] = useState(undefined);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (issue) {
            setSolver(issue.taker ?? '');
            setFixDescription('');
            setProofImageFile(null);
            setProofImageUrl(undefined);
            setErrorMsg('');
            setIsSubmitting(false);
        }
    }, [issue]);

    const valid = solver.trim() && fixDescription.trim();

    const submit = async () => {
        if (!issue || !valid || isSubmitting) return;
        setIsSubmitting(true);
        setErrorMsg('');

        try {
            await resolveIssue(issue, {
                solver: solver.trim(),
                fixDescription: fixDescription.trim(),
                proofImageFile,
            });
            onClose();
        } catch (err) {
            console.error(err);
            setErrorMsg(err.message || 'Display Error: Upload Failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Sheet open={!!issue} onOpenChange={(o) => { if (!o && !isSubmitting) onClose(); }}>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>Resolve Issue</SheetTitle>
                    <SheetDescription>Document the fix so the report can be closed out.</SheetDescription>
                </SheetHeader>

                <div className="grid gap-5 px-4 pb-8 pt-6">
                    {errorMsg && (
                        <div className="rounded-md bg-destructive/15 p-3 text-sm font-medium text-destructive">
                            {errorMsg}
                        </div>
                    )}

                    {issue && (
                        <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
                            <img src={issue.imageUrl} alt={issue.title} className="h-32 w-full object-cover" />
                            <div className="p-3">
                                <p className="text-sm font-semibold text-foreground">{issue.title}</p>
                                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
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

                    <div className="grid gap-2">
                        <Label htmlFor="solver">Solver name</Label>
                        <Input
                            id="solver"
                            value={solver}
                            onChange={(e) => setSolver(e.target.value)}
                            placeholder="Who fixed it?"
                            disabled={isSubmitting}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="fix">Fix description</Label>
                        <Textarea
                            id="fix"
                            rows={4}
                            value={fixDescription}
                            onChange={(e) => setFixDescription(e.target.value)}
                            placeholder="What did you do to fix the problem?"
                            disabled={isSubmitting}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label>Proof of fix</Label>
                        <ImageDropzone
                            label="Upload proof photo"
                            previewUrl={proofImageUrl}
                            onChange={(file, preview) => {
                                setProofImageFile(file);
                                setProofImageUrl(preview);
                            }}
                        />
                    </div>

                    <Button onClick={submit} disabled={!valid || isSubmitting} className="w-full">
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving Fix & Uploading...
                            </>
                        ) : (
                            'Mark as Solved'
                        )}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

