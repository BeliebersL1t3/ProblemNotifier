import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/Components/UI/Dialog';
import { Button } from '@/Components/UI/Button';
import { Textarea } from '@/Components/UI/Textarea';
import { Label } from '@/Components/UI/Label';
import { useIssues } from '@/context/IssuesContext';
import { useLanguage } from '@/context/LanguageContext';
import { 
    Edit3, 
    AlertTriangle, 
    Loader2, 
    FileText, 
    History, 
    CheckCircle2, 
    Building2, 
    MapPin, 
    User,
    ChevronDown,
    ChevronUp
} from 'lucide-react';

export function EditDescriptionModal({ issue, open, onOpenChange, onSuccess }) {
    const { t, lang } = useLanguage();
    const { updateIssue } = useIssues();

    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [showHistory, setShowHistory] = useState(false);

    const editCount = typeof issue?.editCount === 'number' ? issue.editCount : 0;
    const isLimitReached = editCount >= 2;
    const nextEditNum = editCount + 1;

    useEffect(() => {
        if (issue && open) {
            setDescription(issue.description || '');
            setErrorMsg('');
            setShowHistory(false);
        }
    }, [issue, open]);

    if (!issue) return null;

    const isUnchanged = description.trim() === (issue.description || '').trim();
    const isValid = description.trim().length >= 3 && !isUnchanged && !isLimitReached;

    const handleSubmit = async (e) => {
        e?.preventDefault();
        if (!isValid || isSubmitting) return;

        setIsSubmitting(true);
        setErrorMsg('');

        try {
            const res = await updateIssue(issue, {
                description: description.trim()
            });

            if (onSuccess) {
                onSuccess(res?.data || { ...issue, description: description.trim(), editCount: nextEditNum });
            }
            onOpenChange(false);
        } catch (err) {
            console.error('Failed to update issue description:', err);
            const msg = err.response?.data?.message || err.message || (lang === 'id' ? 'Gagal memperbarui deskripsi isu.' : 'Failed to update issue description.');
            setErrorMsg(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] shadow-2xl p-6 rounded-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                <Edit3 className="w-5 h-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-bold text-[#FAFAFA] flex items-center gap-2">
                                    <span>{lang === 'id' ? 'Edit Deskripsi Isu' : 'Edit Issue Description'}</span>
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground">
                                    {lang === 'id' 
                                        ? 'Perbaiki redaksi teks deskripsi tiket (Khusus Administrator)' 
                                        : 'Refine issue description text formatting (Admin Only)'}
                                </DialogDescription>
                            </div>
                        </div>

                        {/* Quota Badge */}
                        <div className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                            isLimitReached
                                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                        }`}>
                            {isLimitReached ? (
                                <>
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                    <span>{lang === 'id' ? 'Batas Edit Tercapai (2/2)' : 'Edit Limit Reached (2/2)'}</span>
                                </>
                            ) : (
                                <>
                                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                                    <span>{lang === 'id' ? `Editan ke-${nextEditNum} dari 2` : `Edit #${nextEditNum} of 2`}</span>
                                </>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                {errorMsg && (
                    <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2 animate-in fade-in duration-200">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                        <span className="font-medium">{errorMsg}</span>
                    </div>
                )}

                {isLimitReached && (
                    <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                        <div className="space-y-1">
                            <p className="font-bold">{lang === 'id' ? 'Batas Maksimum 2x Pengeditan Telah Tercapai' : 'Maximum 2 Edits Reached'}</p>
                            <p className="text-red-300/80 leading-relaxed">
                                {lang === 'id'
                                    ? 'Isu ini sudah melalui 2 kali perbaikan deskripsi. Demi integritas audit riwayat, deskripsi tidak dapat diubah lagi.'
                                    : 'This issue has undergone 2 description revisions. To preserve audit trail integrity, no further edits are permitted.'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Ticket Summary Card */}
                <div className="bg-[#242217] p-3.5 rounded-xl border border-[#3B3929]/80 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2 border-b border-[#3B3929]/50 pb-2">
                        <span className="font-mono font-bold text-[#C9AA71] bg-[#1C1B0E] px-2 py-0.5 rounded border border-[#3B3929]">
                            {issue.id}
                        </span>
                        <span className="text-muted-foreground truncate max-w-[200px]">
                            {issue.title}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-stone-300">
                        <div className="flex items-center gap-1.5 truncate">
                            <Building2 className="w-3.5 h-3.5 text-[#C9AA71] shrink-0" />
                            <span className="truncate">{issue.department || '-'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                            <MapPin className="w-3.5 h-3.5 text-[#C9AA71] shrink-0" />
                            <span className="truncate">{issue.location || '-'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                            <User className="w-3.5 h-3.5 text-[#C9AA71] shrink-0" />
                            <span className="truncate">{issue.reporter || 'Staff'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate text-muted-foreground">
                            <span>{issue.submittedAt || issue.reportedAtIso || '-'}</span>
                        </div>
                    </div>
                </div>

                {/* Form Input for Description Only */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="issue-description" className="text-xs font-bold text-[#FAFAFA] flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-[#C9AA71]" />
                                <span>{lang === 'id' ? 'Deskripsi Masalah (Format Baru):' : 'Issue Description (Refined Format):'}</span>
                            </Label>
                            <span className="text-[11px] font-mono text-muted-foreground">
                                {description.trim().length} {lang === 'id' ? 'karakter' : 'chars'}
                            </span>
                        </div>

                        <Textarea
                            id="issue-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            disabled={isLimitReached || isSubmitting}
                            rows={6}
                            placeholder={lang === 'id' ? 'Tuliskan deskripsi isu dengan format rapi dan jelas...' : 'Enter refined description text with clean formatting...'}
                            className="w-full bg-[#181711] border-[#3B3929] text-[#FAFAFA] placeholder:text-stone-500 rounded-xl focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71] text-xs leading-relaxed transition-all resize-y"
                        />
                        <p className="text-[11px] text-muted-foreground">
                            {lang === 'id'
                                ? '• Hanya deskripsi yang diubah. Judul, status, kategori, lokasi, dan foto tidak akan berubah.'
                                : '• Only the description will be updated. Title, status, category, location, and photos remain untouched.'}
                        </p>
                    </div>

                    {/* Expandable Previous Versions Reference */}
                    {Array.isArray(issue.descriptionHistory) && issue.descriptionHistory.length > 0 && (
                        <div className="rounded-xl border border-[#3B3929]/70 bg-[#16150D] p-3">
                            <button
                                type="button"
                                onClick={() => setShowHistory(prev => !prev)}
                                className="flex items-center justify-between w-full text-left text-xs font-bold text-[#C9AA71] hover:text-[#FAFAFA] transition-colors cursor-pointer"
                            >
                                <span className="flex items-center gap-1.5">
                                    <History className="w-3.5 h-3.5" />
                                    <span>{lang === 'id' ? `Lihat Riwayat Versi Sebelumnya (${issue.descriptionHistory.length} versi)` : `View Previous Versions (${issue.descriptionHistory.length} versions)`}</span>
                                </span>
                                {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>

                            {showHistory && (
                                <div className="mt-2.5 space-y-2 border-t border-[#3B3929]/50 pt-2.5 max-h-48 overflow-y-auto">
                                    {issue.descriptionHistory.map((item, idx) => (
                                        <div key={idx} className="bg-[#1C1B0E] p-2.5 rounded-lg border border-[#3B3929] text-[11px]">
                                            <div className="flex items-center justify-between gap-2 text-stone-400 pb-1 mb-1 border-b border-[#3B3929]/40 text-[10px]">
                                                <span className="font-bold text-[#E3D1AA]">
                                                    {item.isOriginal 
                                                        ? (lang === 'id' ? 'Versi 1 (Asli)' : 'Version 1 (Original)') 
                                                        : (lang === 'id' ? `Versi ${item.version} (Editan ke-${item.version - 1})` : `Version ${item.version} (Edit #${item.version - 1})`)}
                                                </span>
                                                <span>{item.editedAt || '-'} ({item.by || 'Admin'})</span>
                                            </div>
                                            <p className="text-stone-300 italic whitespace-pre-wrap">"{item.description}"</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-[#3B3929]/50">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSubmitting}
                            className="bg-[#2A281E] border-[#3B3929] text-muted-foreground hover:text-white text-xs h-9 cursor-pointer"
                        >
                            {lang === 'id' ? 'Batal' : 'Cancel'}
                        </Button>
                        <Button
                            type="submit"
                            disabled={!isValid || isSubmitting}
                            className={`text-xs h-9 font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer ${
                                !isValid || isSubmitting
                                    ? 'bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed opacity-60'
                                    : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-400 shadow-blue-900/40'
                            }`}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>{lang === 'id' ? 'Menyimpan...' : 'Saving...'}</span>
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>{lang === 'id' ? 'Simpan Perbaikan Deskripsi' : 'Save Refined Description'}</span>
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
