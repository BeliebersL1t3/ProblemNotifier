import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/Components/UI/Dialog';
import {
    Eye,
    FileText,
    User,
    MapPin,
    Building,
    Tag,
    Calendar,
    AlertCircle,
    CheckCircle2,
    Clock,
    PauseCircle,
    Wrench,
    Hourglass,
    ChevronRight,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export function ActivityDetailModal({ issue, onClose, onOpenCardModal }) {
    const { t, lang } = useLanguage();

    if (!issue) return null;

    const locale = lang === 'id' ? 'id-ID' : 'en-US';

    // Format Helpers
    const formatDateTime = (rawTime) => {
        if (!rawTime) return t('date_na');
        const d = new Date(rawTime);
        if (isNaN(d.getTime())) return String(rawTime);
        const dateStr = d.toLocaleDateString(locale, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
        const timeStr = d.toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        return `${dateStr} at ${timeStr}`;
    };

    // Calculation helper for duration between two timestamps
    const calculateGap = (startRaw, endRaw) => {
        if (!startRaw || !endRaw) return null;
        const start = new Date(startRaw).getTime();
        const end = new Date(endRaw).getTime();
        if (isNaN(start) || isNaN(end) || end < start) return null;
        const diffMs = end - start;
        const diffMins = Math.round(diffMs / 60000);
        if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'}`;
        const diffHours = (diffMins / 60).toFixed(1);
        if (diffHours < 24) return `${diffHours} hr${diffHours === '1.0' ? '' : 's'}`;
        const diffDays = (diffMins / 1440).toFixed(1);
        return `${diffDays} day${diffDays === '1.0' ? '' : 's'}`;
    };

    // Stage Flags
    const hasClaimed = !!(issue.taker || issue.takenAt || issue.status === 'progress' || issue.status === 'pending' || issue.status === 'solved');
    const hasPending = !!(
        (issue.pendingTimeline && issue.pendingTimeline.length > 0) ||
        issue.pendingReason ||
        issue.status === 'pending'
    );
    const hasSolved = !!(issue.status === 'solved' || issue.solvedAt || issue.solver);

    const reportTimeStr = formatDateTime(issue.reportedAt || issue.reportedAtIso);
    const claimTimeStr = issue.takenAt ? formatDateTime(issue.takenAt) : null;
    const solvedTimeStr = issue.solvedAt ? formatDateTime(issue.solvedAt) : null;
    const responseGap = calculateGap(issue.reportedAt || issue.reportedAtIso, issue.takenAt);

    return (
        <Dialog open={!!issue} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl bg-[#181711] border border-[#3B3929] text-[#FAFAFA] shadow-2xl p-6">
                <DialogHeader className="border-b border-[#3B3929]/80 pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-[#C9AA71] bg-[#2A281E] px-2.5 py-1 rounded-md border border-[#3B3929] shadow-inner">
                                {issue.id}
                            </span>
                            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                                issue.status === 'solved'   ? 'bg-green-500/15 border-green-500/30 text-green-400' :
                                issue.status === 'progress' ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' :
                                issue.status === 'pending'  ? 'bg-orange-500/15 border-orange-500/30 text-orange-400' :
                                'bg-blue-500/15 border-blue-500/30 text-blue-400'
                            }`}>
                                {issue.status === 'progress' ? t('in_progress') : issue.status === 'solved' ? t('solved') : issue.status === 'pending' ? t('pending') : t('open')}
                            </span>
                            {issue.priority === 'critical' && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                                    🚨 {t('critical')}
                                </span>
                            )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {lang === 'id' ? 'Detail Jejak Aktivitas Laporan' : 'Full Issue Event Lifecycle'}
                        </span>
                    </div>
                    <DialogTitle className="text-xl font-bold text-[#FAFAFA] mt-2">
                        {issue.title}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-5 mt-4">

                    {/* ================= STAGE 1: CREATION / OPEN ================= */}
                    <div className="rounded-xl border border-blue-500/30 bg-[#1E1D16] p-4 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-blue-500" />
                        
                        <div className="flex items-center justify-between pb-3 border-b border-border/40">
                            <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-black font-bold text-xs">
                                    1
                                </span>
                                <h3 className="font-bold text-sm text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <FileText className="w-4 h-4" />
                                    {lang === 'id' ? 'Tahap 1: Laporan Dibuat (Open)' : 'Stage 1: Report Created (Open)'}
                                </h3>
                            </div>
                            <span className="text-xs text-muted-foreground font-medium">
                                📅 {reportTimeStr}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-xs">
                            <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50">
                                <User className="w-4 h-4 text-[#C9AA71] shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-muted-foreground">{lang === 'id' ? 'Pelapor' : 'Reported By'}</p>
                                    <p className="font-bold text-foreground text-sm">{issue.reporter || 'Anonymous'}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50">
                                <Building className="w-4 h-4 text-[#C9AA71] shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-muted-foreground">{lang === 'id' ? 'Departemen Asal' : 'Origin Department'}</p>
                                    <p className="font-bold text-foreground text-sm">{issue.department || 'Not Specified'}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50">
                                <MapPin className="w-4 h-4 text-[#C9AA71] shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-muted-foreground">{lang === 'id' ? 'Lokasi Kerusakan' : 'Issue Location'}</p>
                                    <p className="font-semibold text-foreground">{issue.location || '-'}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50">
                                <Tag className="w-4 h-4 text-[#C9AA71] shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-muted-foreground">{lang === 'id' ? 'Kategori' : 'Category'}</p>
                                    <p className="font-semibold text-foreground uppercase">{issue.category || 'Other'}</p>
                                </div>
                            </div>
                        </div>

                        {issue.description && (
                            <div className="mt-3 bg-black/30 p-3 rounded-lg border border-border/40 text-xs">
                                <p className="text-muted-foreground font-semibold mb-1">{lang === 'id' ? 'Deskripsi Masalah Awal:' : 'Initial Problem Description:'}</p>
                                <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{issue.description}</p>
                            </div>
                        )}

                        {issue.taggedDepartments && issue.taggedDepartments.length > 0 && (
                            <div className="mt-3 flex items-center gap-1.5 flex-wrap text-xs">
                                <span className="text-muted-foreground">{lang === 'id' ? 'Departemen Ditandai:' : 'Tagged Departments:'}</span>
                                {issue.taggedDepartments.map((dept, i) => (
                                    <span key={i} className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-medium">
                                        {dept}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ================= STAGE 2: CLAIM / IN-PROGRESS ================= */}
                    {hasClaimed && (
                        <div className="rounded-xl border border-amber-500/30 bg-[#1E1D16] p-4 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-amber-500" />
                            
                            <div className="flex items-center justify-between pb-3 border-b border-border/40">
                                <div className="flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-black font-bold text-xs">
                                        2
                                    </span>
                                    <h3 className="font-bold text-sm text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <Wrench className="w-4 h-4" />
                                        {lang === 'id' ? 'Tahap 2: Diambil / Dikerjakan (Claimed)' : 'Stage 2: Claimed & In Progress'}
                                    </h3>
                                </div>
                                <span className="text-xs text-muted-foreground font-medium">
                                    📅 {claimTimeStr || t('date_na')}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-xs">
                                <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50">
                                    <User className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-muted-foreground">{lang === 'id' ? 'Diambil Oleh' : 'Claimed By'}</p>
                                        <p className="font-bold text-foreground text-sm">{issue.taker || 'Staff Member'}</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50">
                                    <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-muted-foreground">{lang === 'id' ? 'Waktu Respon (Dari Dibuat)' : 'Response Time (From Report)'}</p>
                                        <p className="font-semibold text-foreground">{responseGap ? `~${responseGap}` : '-'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ================= STAGE 3: PENDING DETAILS ================= */}
                    {hasPending && (
                        <div className="rounded-xl border border-orange-500/30 bg-[#1E1D16] p-4 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-orange-500" />
                            
                            <div className="flex items-center justify-between pb-3 border-b border-border/40">
                                <div className="flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-black font-bold text-xs">
                                        3
                                    </span>
                                    <h3 className="font-bold text-sm text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <Hourglass className="w-4 h-4" />
                                        {lang === 'id' ? 'Tahap 3: Riwayat Penundaan (Pending Details)' : 'Stage 3: Pending & Delay Details'}
                                    </h3>
                                </div>
                                <span className="text-xs text-orange-400 font-semibold px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/20">
                                    {issue.pendingTimeline?.length || 1} {lang === 'id' ? 'Catatan Pending' : 'Pending Log(s)'}
                                </span>
                            </div>

                            <div className="flex flex-col gap-2.5 mt-3">
                                {issue.pendingTimeline && issue.pendingTimeline.length > 0 ? (
                                    issue.pendingTimeline.map((pt, idx) => (
                                        <div key={idx} className="bg-black/30 p-3 rounded-lg border border-border/40 text-xs">
                                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                                <span className="font-bold text-orange-300 flex items-center gap-1">
                                                    <User className="w-3.5 h-3.5" />
                                                    {pt.by || issue.pendingBy || 'Staff'}
                                                </span>
                                                <span className="text-muted-foreground text-[11px]">
                                                    📅 {pt.date || t('date_na')}
                                                </span>
                                            </div>
                                            <p className="text-foreground/90 italic leading-relaxed">
                                                "{pt.reason || 'No specific delay reason recorded'}"
                                            </p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="bg-black/30 p-3 rounded-lg border border-border/40 text-xs">
                                        <div className="flex items-center justify-between gap-2 mb-1.5">
                                            <span className="font-bold text-orange-300 flex items-center gap-1">
                                                <User className="w-3.5 h-3.5" />
                                                {issue.pendingBy || 'Staff'}
                                            </span>
                                        </div>
                                        <p className="text-foreground/90 italic leading-relaxed">
                                            "{issue.pendingReason || 'Marked as pending'}"
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ================= STAGE 4: RESOLUTION / SOLVED ================= */}
                    {hasSolved && (
                        <div className="rounded-xl border border-green-500/30 bg-[#1E1D16] p-4 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-green-500" />
                            
                            <div className="flex items-center justify-between pb-3 border-b border-border/40">
                                <div className="flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-black font-bold text-xs">
                                        4
                                    </span>
                                    <h3 className="font-bold text-sm text-green-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4" />
                                        {lang === 'id' ? 'Tahap 4: Diselesaikan (Solved)' : 'Stage 4: Issue Resolved & Solved'}
                                    </h3>
                                </div>
                                <span className="text-xs text-muted-foreground font-medium">
                                    📅 {solvedTimeStr || t('date_na')}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-xs">
                                <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50">
                                    <User className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-muted-foreground">{lang === 'id' ? 'Diselesaikan Oleh' : 'Resolved By'}</p>
                                        <p className="font-bold text-foreground text-sm">{issue.solver || 'Technician'}</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2 bg-[#2A281E]/60 p-2.5 rounded-lg border border-[#3B3929]/50">
                                    <Clock className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-muted-foreground">{lang === 'id' ? 'Total Waktu Penyelesaian' : 'Total Resolution Duration'}</p>
                                        <p className="font-semibold text-green-300">{issue.durationLabel || 'Solved'}</p>
                                    </div>
                                </div>
                            </div>

                            {issue.fixDescription && (
                                <div className="mt-3 bg-black/30 p-3 rounded-lg border border-border/40 text-xs">
                                    <p className="text-green-400 font-semibold mb-1">{lang === 'id' ? 'Catatan Perbaikan / Tindakan:' : 'Fix Description / Action Taken:'}</p>
                                    <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{issue.fixDescription}</p>
                                </div>
                            )}
                        </div>
                    )}

                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#3B3929]/50">
                    {onOpenCardModal && (
                        <button
                            type="button"
                            onClick={() => {
                                onClose?.();
                                onOpenCardModal(issue);
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C9AA71]/20 hover:bg-[#C9AA71]/30 text-[#C9AA71] hover:text-[#FAFAFA] border border-[#C9AA71]/40 font-semibold text-xs transition-all shadow-sm cursor-pointer"
                        >
                            <Eye className="w-4 h-4" />
                            <span>{lang === 'id' ? 'Buka Kartu Isu & Foto Lengkap' : 'Open Issue Card & Photos'}</span>
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="px-5 py-2 rounded-lg bg-[#2A281E] hover:bg-[#3B3929] text-[#FAFAFA] font-medium text-xs border border-[#3B3929] transition-colors ml-auto cursor-pointer"
                    >
                        {t('cancel') || 'Close'}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
