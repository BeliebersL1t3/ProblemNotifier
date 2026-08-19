import { useEffect, useState } from 'react';
import { Loader2, MapPin, ZoomIn } from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/Components/UI/Sheet';
import { Input } from '@/Components/UI/Input';
import { Label } from '@/Components/UI/Label';
import { Textarea } from '@/Components/UI/Textarea';
import { ImageDropzone } from './ImageDropzone';
import { useIssues } from '@/context/IssuesContext';
import DelayDetailModal from './DelayDetailModal';
import { ImageLightboxModal } from './ImageLightboxModal';
import { CriticalTimer } from './CriticalTimer';

export function ResolveIssueSheet({ issue, onClose }) {
    const { resolveIssue, pendingIssue, categories, updateIssueCategory } = useIssues();
    const [isPendingMode, setIsPendingMode] = useState(false);
    const [solver, setSolver] = useState('');
    const [fixDescription, setFixDescription] = useState('');
    const [proofImageFile, setProofImageFile] = useState(null);
    const [proofImageUrl, setProofImageUrl] = useState(undefined);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [selectedDelay, setSelectedDelay] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);

    useEffect(() => {
        if (issue) {
            setIsPendingMode(false);
            setSolver(issue.taker ?? '');
            setFixDescription('');
            setProofImageFile(null);
            setProofImageUrl(undefined);
            setErrorMsg('');
            setIsSubmitting(false);
            setPreviewImage(null);
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

    const valid = solver.trim() && fixDescription.trim();

    const submit = async () => {
        if (!issue || !valid || isSubmitting) return;
        setIsSubmitting(true);
        setErrorMsg('');

        try {
            if (isPendingMode) {
                await pendingIssue(issue, {
                    pendingBy: solver.trim(),
                    pendingReason: fixDescription.trim(),
                    pendingImageFile: proofImageFile,
                });
            } else {
                await resolveIssue(issue, {
                    solver: solver.trim(),
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
                                <p className="mt-2 text-xs text-muted-foreground">{issue.description}</p>
                                <p className="mt-2 text-xs font-medium text-muted-foreground">
                                    Reported by {issue.reporter}
                                    {issue.taker ? ` • Claimed by ${issue.taker}` : ''}
                                </p>
                            </div>
                        </div>
                    )}

                    {issue && issue.status === 'pending' && issue.pendingTimeline && issue.pendingTimeline.length > 0 && (
                        <div className="overflow-hidden rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 flex flex-col gap-3">
                            <p className="text-sm font-semibold text-orange-600">Pending Delay History</p>
                            {issue.pendingTimeline.map((item, idx) => (
                                <div key={idx} className="flex flex-col gap-2 pb-3 border-b border-orange-500/20 last:border-0 last:pb-0">
                                    <div className="flex items-start gap-3">
                                        {item.image && (
                                            <img 
                                                src={item.image} 
                                                alt="delay proof" 
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

                    <div className="grid gap-2">
                        <Label htmlFor="solver">{isPendingMode ? 'Worker name' : 'Solver name'}</Label>
                        <Input
                            id="solver"
                            value={solver}
                            onChange={(e) => setSolver(e.target.value)}
                            placeholder={isPendingMode ? "Who is delaying this job?" : "Who fixed it?"}
                            disabled={isSubmitting}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="fix">{isPendingMode ? 'Reason for delay' : 'Fix description'}</Label>
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
                        <Label>{isPendingMode ? 'Proof of delay' : 'Proof of fix'}</Label>
                        <ImageDropzone
                            label={isPendingMode ? "Upload proof of delay" : "Upload proof photo"}
                            previewUrl={proofImageUrl}
                            onChange={(file, preview) => {
                                setProofImageFile(file);
                                setProofImageUrl(preview);
                            }}
                        />
                    </div>

                    <div className="flex flex-col gap-3">
                        <Button onClick={submit} disabled={!valid || isSubmitting} className="w-full">
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {isPendingMode ? 'Marking as Pending...' : 'Saving Fix & Uploading...'}
                                </>
                            ) : (
                                isPendingMode ? 'Confirm Pending' : 'Mark as Solved'
                            )}
                        </Button>
                        <Button 
                            variant="ghost" 
                            onClick={() => setIsPendingMode(!isPendingMode)}
                            disabled={isSubmitting}
                            className={isPendingMode ? "text-status-solved" : "text-orange-500 hover:text-orange-600 hover:bg-orange-50"}
                        >
                            {isPendingMode ? 'Cancel Pending, Mark Solved instead' : 'Problem during fix? Mark as Pending'}
                        </Button>
                    </div>
                </div>
            </SheetContent>
            
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
