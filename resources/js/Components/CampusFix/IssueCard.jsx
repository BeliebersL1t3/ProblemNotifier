import React, { useState } from 'react';
import { MapPin, Building, ZoomIn, Edit3, Trash2, RotateCcw, Clock, ArrowRightLeft } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';
import DelayDetailModal from './DelayDetailModal';
import { ImageLightboxModal } from './ImageLightboxModal';
import { CriticalTimer } from './CriticalTimer';
import { getDepartmentForStaff, normalizeDepartment } from '@/constants/staff';
import { getDepartmentTheme } from '@/constants/departments';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';

const FALLBACK_IMAGE = '/barrier-placeholder.svg';

const safeArray = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
    return [];
};

function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export function IssueCard({ issue, onSelect, onEdit, onDelete, onRestore, density = '3', isHighlighted = false }) {
    const [selectedDelay, setSelectedDelay] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const { isAdmin, isDeptUser, department } = useAuth();
    const { lang } = useLanguage();

    const isArchived = Boolean(issue?.isArchived || issue?.statusDisplay === '0' || issue?.displayStatus === '0');
    const archiveLog = (issue?.editLogs || []).slice().reverse().find(l => l && (l.type === 'archive' || String(l.changes).toLowerCase().includes('arsip') || String(l.changes).toLowerCase().includes('archive')));
    const archivedRawDate = issue?.archivedAtStr || issue?.archivedAt || archiveLog?.date;
    const archivedDateFormatted = archivedRawDate ? formatDate(archivedRawDate) : null;

    const userDept = normalizeDepartment(department);
    const originDept = normalizeDepartment(issue?.department);
    const takerDept = normalizeDepartment(getDepartmentForStaff(issue?.taker, issue));
    const pendingDept = normalizeDepartment(getDepartmentForStaff(issue?.pendingBy, issue));
    const solverDept = normalizeDepartment(getDepartmentForStaff(issue?.solver, issue));
    const assignedList = safeArray(issue?.assignedDepartments);
    const assignedDeptsNormalized = assignedList.map(normalizeDepartment);

    const canEditReport = isAdmin || (isDeptUser && userDept && userDept === originDept);
    const canEditClaim = isAdmin || (isDeptUser && userDept && (
        (takerDept && userDept === takerDept) || 
        (!issue?.taker && assignedDeptsNormalized.includes(userDept)) ||
        (issue?.takerHasTransferred && assignedDeptsNormalized.includes(userDept))
    ));
    const canEditPending = isAdmin || (isDeptUser && userDept && (
        (pendingDept && userDept === pendingDept) ||
        (!issue?.pendingBy && assignedDeptsNormalized.includes(userDept))
    ));
    const canEditSolved = isAdmin || (isDeptUser && userDept && (
        (solverDept && userDept === solverDept) ||
        assignedDeptsNormalized.includes(userDept)
    ));

    const isPastContribution = Boolean(issue?._isPastContribution);
    const pastContribTooltip = isPastContribution
        ? (lang === 'id'
            ? `Isu riwayat kontribusi Anda saat bertugas di departemen ${issue.department || 'sebelumnya'}. Akses dalam mode lihat detail (Read-Only).`
            : `Past contribution issue from your former department (${issue.department || 'previous'}). View-only mode.`)
        : '';
    const canEdit = !isPastContribution && (isAdmin || canEditReport || canEditClaim || canEditPending || canEditSolved);
    const canDelete = !isPastContribution && isAdmin;
    const needsReassignment = Boolean(issue?.takerHasTransferred && (issue?.status === 'progress' || issue?.status === 'pending'));

    const taggedList = safeArray(issue?.taggedDepartments);
    const pendingTimelineList = safeArray(issue?.pendingTimeline)
        .filter(Boolean)
        .map(item => {
            if (typeof item === 'object' && item !== null) return item;
            return { date: '', by: 'Staff', reason: String(item || ''), image: '' };
        });

    const activeImage = (issue.status === 'pending' && issue.pendingImageUrl) 
        ? issue.pendingImageUrl 
        : (issue.imageUrl || FALLBACK_IMAGE);

    // =========================================================================
    // DENSITY 10 — MICRO MATRIX VIEW
    // =========================================================================
    if (density === '10') {
        const isEmergency = !isArchived && ((issue.category || '').toLowerCase() === 'emergency' || String(issue.id || '').startsWith('SOS'));
        const isCritical = !isArchived && !isEmergency && issue.priority === 'critical';
        const isSolved = issue.status === 'solved';
        const isPending = issue.status === 'pending';
        const isProgress = issue.status === 'progress';

        const statusColor = isArchived
            ? 'border-stone-700 bg-stone-800/20 text-stone-400'
            : isSolved
                ? 'border-emerald-500/80 bg-emerald-500/10 text-emerald-400'
            : isPending
                ? 'border-orange-500/80 bg-orange-500/10 text-orange-400'
                : isProgress
                    ? 'border-blue-500/80 bg-blue-500/10 text-blue-400'
                    : 'border-amber-500/80 bg-amber-500/10 text-amber-400';

        const statusDot = isSolved
            ? 'bg-emerald-400'
            : isPending
                ? 'bg-orange-400'
                : isProgress
                    ? 'bg-blue-400'
                    : 'bg-amber-400';

        const primaryDept = assignedList[0] || issue.department || null;
        const deptTheme = primaryDept ? getDepartmentTheme(primaryDept) : null;

        const tooltipText = `[${issue.id}] ${issue.title}\nStatus: ${issue.status.toUpperCase()}${isArchived ? ' (ARCHIVED)' : isEmergency ? ' (SOS EMERGENCY)' : isCritical ? ' (CRITICAL)' : ''}${isArchived && archivedDateFormatted ? `\nArchived: ${archivedDateFormatted}` : ''}\nLocation: ${issue.location || '-'}\nDept: ${primaryDept || '-'}\nReported: ${issue.reporter || '-'}`;

        return (
            <button
                id={`issue-card-${issue.id}`}
                type="button"
                onClick={() => onSelect(issue)}
                title={tooltipText}
                className={cn(
                    "group relative flex flex-col p-2 rounded-lg border text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-1 min-w-0 w-full bg-surface select-none",
                    isHighlighted && "ring-4 ring-[#C9AA71] shadow-[0_0_30px_rgba(201,170,113,0.85)] z-20 animate-pulse scale-[1.02]",
                    isArchived
                        ? "border-stone-700/70 bg-stone-900/40 opacity-80"
                        : isEmergency
                            ? isSolved
                                ? "border-red-500/50 bg-red-950/15 ring-1 ring-red-500/40"
                                : "border-red-500 bg-red-950/30 border-2 ring-1 ring-red-500 z-10"
                            : isCritical
                                ? isSolved
                                    ? "border-amber-500/50 bg-amber-950/15 ring-1 ring-amber-500/40"
                                    : "border-amber-500 bg-amber-950/20 border-2 ring-1 ring-amber-500 z-10"
                                : isPending
                                    ? "border-orange-500/40 ring-1 ring-orange-500/20"
                                    : "border-border/80 hover:border-border"
                )}
            >
                {/* Header Row: ID + Status Dot */}
                <div className="flex items-center justify-between gap-1 w-full mb-1">
                    <span className="font-mono text-[9px] font-bold text-muted-foreground group-hover:text-foreground truncate">
                        {issue.id}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                        {isEmergency ? (
                            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse ring-1 ring-red-400" />
                        ) : isCritical ? (
                            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse ring-1 ring-amber-400" />
                        ) : (
                            <span className={cn("h-1.5 w-1.5 rounded-full", statusDot)} />
                        )}
                    </div>
                </div>

                {/* Title */}
                <span className="text-[11px] font-semibold leading-tight text-foreground truncate w-full mb-1 group-hover:text-primary">
                    {issue.title}
                </span>

                {/* Micro Meta: Dept pill + Timer if critical */}
                <div className="flex items-center justify-between gap-1 w-full mt-auto pt-1 border-t border-border/40 text-[9px]">
                    {deptTheme ? (
                        <span 
                            className="px-1 py-0.2 rounded text-[8px] font-bold truncate max-w-[60px]"
                            style={{ backgroundColor: `${deptTheme.bg}25`, color: deptTheme.bg }}
                        >
                            {primaryDept}
                        </span>
                    ) : (
                        <span className="text-muted-foreground truncate">{issue.location || '-'}</span>
                    )}
                    {isPastContribution && (
                        <span className="text-[9px] font-bold text-amber-300 shrink-0 cursor-help" title={pastContribTooltip}>
                            🔒
                        </span>
                    )}
                    {needsReassignment && (
                        <span className="text-[9px] font-bold text-sky-400 shrink-0 cursor-help" title={lang === 'id' ? `Staf (${issue.taker}) pindah ke ${issue.takerCurrentDept || 'dept lain'}` : `Staff (${issue.taker}) transferred to ${issue.takerCurrentDept || 'another dept'}`}>
                            🔄
                        </span>
                    )}
                    {isCritical && issue.deadline && !isSolved && (
                        <span className="text-[8px] font-mono font-bold text-amber-400 shrink-0">
                            ⏱️
                        </span>
                    )}
                </div>
            </button>
        );
    }

    // =========================================================================
    // DENSITY 5 — COMPACT VIEW
    // =========================================================================
    if (density === '5') {
        const isEmergency = !isArchived && ((issue.category || '').toLowerCase() === 'emergency' || String(issue.id || '').startsWith('SOS'));
        const isCritical = !isArchived && !isEmergency && issue.priority === 'critical';
        const isSolved = issue.status === 'solved';
        const isPending = issue.status === 'pending';

        return (
            <button
                id={`issue-card-${issue.id}`}
                type="button"
                onClick={() => onSelect(issue)}
                className={cn(
                    "group flex flex-col overflow-hidden rounded-xl border text-left transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 min-w-0 w-full bg-surface",
                    isHighlighted && "ring-4 ring-[#C9AA71] shadow-[0_0_35px_rgba(201,170,113,0.85)] z-20 animate-pulse scale-[1.02]",
                    isArchived
                        ? "border-stone-700/60 bg-surface shadow-card opacity-90 hover:opacity-100"
                        : isEmergency
                            ? isSolved
                                ? "border-red-500/50 bg-red-950/10 shadow-[0_0_15px_rgba(239,68,68,0.2)] ring-1 ring-red-500/50"
                                : "border-red-500 bg-red-950/25 border-2 ring-1 ring-red-500 z-10 relative"
                            : isCritical
                                ? isSolved
                                    ? "border-amber-500/50 bg-amber-950/10 shadow-[0_0_15px_rgba(245,158,11,0.2)] ring-1 ring-amber-500/50"
                                    : "border-amber-500 bg-amber-950/20 border-2 ring-1 ring-amber-500 z-10 relative"
                                : isPending
                                    ? "border-orange-500/50 shadow-card hover:shadow-card-hover ring-1 ring-orange-500/30"
                                    : "border-border shadow-card hover:shadow-card-hover focus-visible:ring-ring"
                )}
            >
                <div className="relative aspect-[16/10] overflow-hidden bg-muted group/img">
                    <img
                        src={activeImage}
                        alt={issue.title}
                        loading="lazy"
                        onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(activeImage);
                        }}
                        className="absolute bottom-2 right-2 p-1 rounded-md bg-black/70 hover:bg-black text-white opacity-0 group-hover/img:opacity-100 transition-all duration-200 border border-white/20 shadow-md cursor-pointer hover:scale-110 z-10"
                        title="Lihat Foto Ukuran Penuh"
                    >
                        <ZoomIn className="w-3.5 h-3.5 text-[#C9AA71]" />
                    </button>
                    <StatusBadge
                        status={issue.status}
                        label={issue.status === 'solved' ? issue.durationLabel : undefined}
                        className="absolute left-2 top-2 scale-90 origin-top-left"
                    />
                    {isPastContribution && (
                        <div 
                            className="absolute left-2 top-8 z-10 flex items-center gap-1 rounded bg-[#1C1B0E]/90 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 text-[9px] font-bold shadow-xs cursor-help"
                            title={pastContribTooltip}
                        >
                            <span>🔒</span>
                            <span>Riwayat</span>
                        </div>
                    )}
                    {needsReassignment && (
                        <div 
                            className="absolute left-2 top-8 z-10 flex items-center gap-1 rounded bg-[#1C1B0E]/90 text-sky-300 border border-sky-500/40 px-1.5 py-0.2 text-[9px] font-bold shadow-xs cursor-help"
                            title={lang === 'id' ? `Staf (${issue.taker}) pindah ke ${issue.takerCurrentDept || 'dept lain'}` : `Staff (${issue.taker}) transferred to ${issue.takerCurrentDept || 'another dept'}`}
                        >
                            <ArrowRightLeft className="w-2.5 h-2.5 text-sky-400" />
                            <span>{lang === 'id' ? 'Pindah Dept' : 'Transferred'}</span>
                        </div>
                    )}
                    {isCritical && !canEdit && !canDelete && !isArchived && (
                        <CriticalTimer
                            deadline={issue.deadline}
                            status={issue.status}
                            isArchived={isArchived}
                            className="absolute right-2 top-2 scale-90 origin-top-right"
                        />
                    )}
                    {/* Action buttons (Edit / Delete / Restore) for authorized users */}
                    {(canEdit || canDelete || onRestore) && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 z-20">
                            {onRestore ? (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRestore(issue);
                                    }}
                                    className="px-2 py-0.5 rounded bg-emerald-600/90 hover:bg-emerald-500 text-white border border-emerald-400/50 shadow-sm transition-all cursor-pointer hover:scale-105 flex items-center gap-1 text-[11px] font-bold"
                                    title="Pulihkan Isu ke Dashboard"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Restore</span>
                                </button>
                            ) : (
                                <>
                                    {canEdit && onEdit && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEdit(issue);
                                            }}
                                            className="p-1 rounded bg-black/80 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/40 shadow-sm transition-all cursor-pointer hover:scale-110"
                                            title="Edit Issue"
                                        >
                                            <Edit3 className="w-3 h-3" />
                                        </button>
                                    )}
                                    {canDelete && onDelete && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete(issue);
                                            }}
                                            className="p-1 rounded bg-black/80 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 shadow-sm transition-all cursor-pointer hover:scale-110"
                                            title="Delete Issue"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex flex-1 flex-col gap-2 p-3 min-w-0 w-full">
                    {isCritical && issue.deadline && !isSolved && !isArchived && (
                        <CriticalTimer
                            deadline={issue.deadline}
                            status={issue.status}
                            isArchived={isArchived}
                            variant="banner"
                        />
                    )}

                    <div className="flex flex-col gap-1 min-w-0 w-full">
                        <div className="flex items-center justify-between gap-1">
                            <span className="shrink-0 rounded bg-muted/80 px-1 py-0.5 font-mono text-[9px] font-medium text-muted-foreground">
                                {issue.id}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">{issue.location}</span>
                            </span>
                        </div>
                        <h3 className="text-sm font-semibold leading-snug text-foreground line-clamp-2 break-words min-w-0 group-hover:text-primary transition-colors">
                            {issue.title}
                        </h3>
                    </div>

                    {/* Department Chips */}
                    <div className="flex gap-1 items-center flex-wrap w-full">
                        {assignedList.length > 0 && assignedList.map((dept, idx) => {
                            const theme = getDepartmentTheme(dept);
                            const isMine = isDeptUser && userDept && normalizeDepartment(dept) === userDept;
                            return (
                                <span
                                    key={'assign-' + idx}
                                    style={{
                                        backgroundColor: theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.12)' : `${theme.bg}22`,
                                        borderColor: isMine ? '#F59E0B' : (theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.35)' : `${theme.bg}70`),
                                        color: theme.bg === '#212121' ? '#FFFFFF' : (theme.text === '#14130B' ? '#FBBF24' : theme.bg)
                                    }}
                                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold border flex items-center gap-0.5 ${
                                        isMine ? 'ring-1.5 ring-amber-400 bg-amber-500/20 font-bold shadow-xs' : ''
                                    }`}
                                    title={`Assigned Department${isMine ? ' (Your Department)' : ''}`}
                                >
                                    <span>🎯</span> {dept} {isMine && <span className="text-[8px] uppercase tracking-wider bg-amber-500 text-black px-1 rounded-xs font-bold">You</span>}
                                </span>
                            );
                        })}
                        {issue.department && (() => {
                            const theme = getDepartmentTheme(issue.department);
                            const isMine = isDeptUser && userDept && normalizeDepartment(issue.department) === userDept;
                            return (
                                <span
                                    style={{
                                        backgroundColor: theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.1)' : `${theme.bg}18`,
                                        borderColor: isMine ? '#10B981' : (theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.3)' : `${theme.bg}50`),
                                        color: theme.bg === '#212121' ? '#FFFFFF' : (theme.text === '#14130B' ? '#FBBF24' : theme.bg)
                                    }}
                                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-medium border flex items-center gap-0.5 ${
                                        isMine ? 'ring-1.5 ring-emerald-400 bg-emerald-500/20 font-bold shadow-xs' : ''
                                    }`}
                                    title={`Origin Department${isMine ? ' (Your Department)' : ''}`}
                                >
                                    <span>🏠</span> {issue.department} {isMine && <span className="text-[8px] uppercase tracking-wider bg-emerald-500 text-black px-1 rounded-xs font-bold">You</span>}
                                </span>
                            );
                        })()}
                        {taggedList.length > 0 && taggedList.map((tag, idx) => {
                            const theme = getDepartmentTheme(tag);
                            const isMine = isDeptUser && userDept && normalizeDepartment(tag) === userDept;
                            return (
                                <span
                                    key={'tag-' + idx}
                                    style={{
                                        backgroundColor: isMine ? 'rgba(99, 102, 241, 0.25)' : (theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.1)' : `${theme.bg}15`),
                                        borderColor: isMine ? '#818CF8' : (theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.3)' : `${theme.bg}50`),
                                        color: isMine ? '#EEF2FF' : (theme.bg === '#212121' ? '#FFFFFF' : (theme.text === '#14130B' ? '#FBBF24' : theme.bg))
                                    }}
                                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-medium border flex items-center gap-0.5 ${
                                        isMine ? 'ring-1.5 ring-indigo-400 font-bold shadow-xs' : ''
                                    }`}
                                    title={`Tagged Department${isMine ? ' (Mentioned to You!)' : ''}`}
                                >
                                    <span>📢</span> @{tag} {isMine && <span className="text-[8px] uppercase tracking-wider bg-indigo-500 text-white px-1 rounded-xs font-bold">You</span>}
                                </span>
                            );
                        })}
                    </div>

                    {/* Short problem snippet */}
                    {issue.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1 break-words">
                            {issue.description}
                        </p>
                    )}

                    {/* Delay indicator chip */}
                    {pendingTimelineList.length > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-orange-400 font-medium bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-md w-fit">
                            <span>⏱️</span>
                            <span>{pendingTimelineList.length} delay history</span>
                        </div>
                    )}

                    {/* Edit history chip (only for actual content modifications, not claims) */}
                    {issue.editLogs && issue.editLogs.filter(l => l && l.type !== 'claim' && l.type !== 'create').length > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-sky-400 font-medium bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-md w-fit">
                            <span>✏️</span>
                            <span>{issue.editLogs.filter(l => l && l.type !== 'claim' && l.type !== 'create').length} edit history</span>
                        </div>
                    )}

                    {/* Actor snippet */}
                    {issue.status === 'progress' && issue.taker && (
                        <div className="text-[11px] font-medium text-muted-foreground truncate">
                            Claimed: <strong className="text-foreground">{issue.taker}</strong>
                        </div>
                    )}
                    {issue.status === 'pending' && issue.pendingBy && (
                        <div className="text-[11px] font-medium text-orange-400 truncate">
                            Pending: <strong className="text-orange-300">{issue.pendingBy}</strong>
                        </div>
                    )}
                    {issue.status === 'solved' && issue.solver && (
                        <div className="text-[11px] font-medium text-muted-foreground truncate">
                            Fixed: <strong className="text-foreground">{issue.solver}</strong>
                        </div>
                    )}

                    <div className="mt-auto border-t border-border/60 pt-2 text-[10px] text-muted-foreground flex flex-col gap-0.5">
                        <div className="flex items-center justify-between">
                            <span className="truncate">By {issue.reporter}</span>
                            <span className="shrink-0">{formatDate(issue.reportedAt)}</span>
                        </div>
                        {issue.isLateUpload && (
                            <div 
                                className="text-amber-500 dark:text-amber-400 font-medium flex items-center justify-between text-[9px] pt-0.5 border-t border-border/30"
                                title={lang === 'id' 
                                    ? `Laporan tertunda di antrean offline (+${issue.lateDuration || ''}) karena kendala sinyal Wi-Fi.` 
                                    : `Report delayed in offline outbox (+${issue.lateDuration || ''}) due to lost Wi-Fi connection.`}
                            >
                                <span className="flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                    <span className="font-semibold">{lang === 'id' ? 'Telat Terkirim' : 'Late Send'}</span>
                                </span>
                                <span className="font-mono font-medium text-amber-600 dark:text-amber-300 shrink-0">
                                    +{issue.lateDuration || '>5m'}
                                </span>
                            </div>
                        )}
                        {isArchived && (
                            <div className="text-stone-400 font-medium flex items-center justify-between text-[9px] pt-0.5 border-t border-border/30">
                                <span className="flex items-center gap-1 text-stone-300">
                                    <span>🗄️</span>
                                    <span className="truncate">Archived</span>
                                </span>
                                {archivedDateFormatted && <span className="font-mono text-stone-300 shrink-0">{archivedDateFormatted}</span>}
                            </div>
                        )}
                    </div>
                </div>

                <ImageLightboxModal
                    open={!!previewImage}
                    onClose={() => setPreviewImage(null)}
                    src={previewImage}
                    title={issue.title}
                    subtitle="Foto Laporan (Full Resolution Preview)"
                />
            </button>
        );
    }

    // =========================================================================
    // DENSITY 3 — STANDARD DETAILED VIEW (DEFAULT)
    // =========================================================================
    const isEmergency = !isArchived && ((issue.category || '').toLowerCase() === 'emergency' || String(issue.id || '').startsWith('SOS'));
    const isCritical = !isArchived && !isEmergency && issue.priority === 'critical';

    return (
        <button
            id={`issue-card-${issue.id}`}
            type="button"
            onClick={() => onSelect(issue)}
            className={cn(
                "group flex flex-col overflow-hidden rounded-xl border text-left transition-all duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 min-w-0 w-full",
                isHighlighted && "ring-4 ring-[#C9AA71] shadow-[0_0_40px_rgba(201,170,113,0.85)] z-20 animate-pulse scale-[1.02]",
                isArchived
                    ? "border-stone-700/60 bg-surface shadow-card opacity-90 hover:opacity-100"
                    : isEmergency
                        ? issue.status === 'solved'
                            ? "border-red-500/50 bg-red-950/10 shadow-[0_0_15px_rgba(239,68,68,0.2)] ring-1 ring-red-500/50"
                            : "border-red-500 bg-red-950/25 border-2 ring-1 ring-red-500 z-10 relative"
                        : isCritical
                            ? issue.status === 'solved'
                                ? "border-amber-500/50 bg-amber-950/10 shadow-[0_0_15px_rgba(245,158,11,0.2)] ring-1 ring-amber-500/50"
                                : "border-amber-500 bg-amber-950/20 border-2 ring-1 ring-amber-500 z-10 relative"
                            : issue.status === 'pending'
                                ? "border-orange-500/50 bg-surface shadow-card hover:shadow-card-hover focus-visible:ring-ring ring-1 ring-orange-500/30"
                                : "border-border bg-surface shadow-card hover:shadow-card-hover focus-visible:ring-ring"
            )}
        >
            <div className="relative aspect-[4/3] overflow-hidden bg-muted group/img">
                <img
                    src={(issue.status === 'pending' && issue.pendingImageUrl) ? issue.pendingImageUrl : (issue.imageUrl || FALLBACK_IMAGE)}
                    alt={issue.title}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setPreviewImage((issue.status === 'pending' && issue.pendingImageUrl) ? issue.pendingImageUrl : (issue.imageUrl || FALLBACK_IMAGE));
                    }}
                    className="absolute bottom-2.5 right-2.5 p-1.5 rounded-lg bg-black/70 hover:bg-black text-white opacity-0 group-hover/img:opacity-100 transition-all duration-200 border border-white/20 shadow-md cursor-pointer hover:scale-110 z-10"
                    title="Lihat Foto Ukuran Penuh"
                >
                    <ZoomIn className="w-4 h-4 text-[#C9AA71]" />
                </button>
                <StatusBadge
                    status={issue.status}
                    label={issue.status === 'solved' ? issue.durationLabel : undefined}
                    className="absolute left-3 top-3"
                />
                {isPastContribution && (
                    <div 
                        className="absolute left-3 top-11 z-10 flex items-center gap-1.5 rounded-md bg-[#1C1B0E]/90 text-amber-300 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold shadow-md backdrop-blur-xs cursor-help"
                        title={pastContribTooltip}
                    >
                        <span>🔒</span>
                        <span>Riwayat ({issue.department})</span>
                    </div>
                )}
                {isArchived && (
                    <div className="absolute left-3 top-11 z-10 flex items-center gap-1.5 rounded-md bg-stone-900/90 text-stone-200 border border-stone-600/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-md backdrop-blur-xs">
                        <span>🗄️</span>
                        <span>Archived</span>
                    </div>
                )}
                {isCritical && !canEdit && !canDelete && !isArchived && (
                    <CriticalTimer
                        deadline={issue.deadline}
                        status={issue.status}
                        isArchived={isArchived}
                        className="absolute right-3 top-3"
                    />
                )}
                {/* Action buttons (Edit / Delete / Restore) for authorized users */}
                {(canEdit || canDelete || onRestore) && (
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20">
                        {onRestore ? (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRestore(issue);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white border border-emerald-400/50 shadow-md transition-all cursor-pointer hover:scale-105 flex items-center gap-1.5 text-xs font-bold"
                                title="Pulihkan Isu ke Dashboard Operasional"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Pulihkan</span>
                            </button>
                        ) : (
                            <>
                                {canEdit && onEdit && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEdit(issue);
                                        }}
                                        className="p-1.5 rounded-lg bg-black/80 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/40 shadow-md transition-all cursor-pointer hover:scale-110"
                                        title="Edit Issue"
                                    >
                                        <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                {canDelete && onDelete && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete(issue);
                                        }}
                                        className="p-1.5 rounded-lg bg-black/80 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 shadow-md transition-all cursor-pointer hover:scale-110"
                                        title="Delete Issue"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="flex flex-1 flex-col gap-2 p-4 min-w-0 w-full">
                {isCritical && issue.deadline && issue.status !== 'solved' && !isArchived && (
                    <CriticalTimer
                        deadline={issue.deadline}
                        status={issue.status}
                        isArchived={isArchived}
                        variant="banner"
                    />
                )}
                {needsReassignment && (
                    <div 
                        className="w-full rounded-lg bg-sky-500/10 border border-sky-500/25 px-2.5 py-1.5 text-xs text-sky-200 flex items-center justify-between gap-2 shadow-xs"
                        title={lang === 'id'
                            ? `Staf yang menangani isu ini (${issue.taker}) telah pindah ke departemen ${issue.takerCurrentDept || 'lain'}.`
                            : `Staff handling this issue (${issue.taker}) has transferred to ${issue.takerCurrentDept || 'another department'}.`}
                    >
                        <span className="flex items-center gap-1.5 font-semibold text-sky-300">
                            <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
                            <span>{lang === 'id' ? 'Staf Pindah Departemen' : 'Staff Changed Department'}</span>
                        </span>
                        <span className="text-[10px] text-sky-200/90 font-mono">
                            {issue.taker} ➔ {issue.takerCurrentDept || (lang === 'id' ? 'Departemen Baru' : 'New Dept')}
                        </span>
                    </div>
                )}
                <div className="flex flex-col gap-1.5 min-w-0 w-full">
                    <h3 className="text-base font-semibold leading-snug text-foreground break-words min-w-0">{issue.title}</h3>
                    <div className="flex gap-1.5 items-center flex-wrap w-full">
                        {assignedList.length > 0 && assignedList.map((dept, idx) => {
                            const theme = getDepartmentTheme(dept);
                            const isMine = isDeptUser && userDept && normalizeDepartment(dept) === userDept;
                            return (
                                <span 
                                    key={'assign-' + idx} 
                                    style={{ 
                                        backgroundColor: theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.12)' : `${theme.bg}22`, 
                                        borderColor: isMine ? '#F59E0B' : (theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.35)' : `${theme.bg}70`),
                                        color: theme.bg === '#212121' ? '#FFFFFF' : (theme.text === '#14130B' ? '#FBBF24' : theme.bg)
                                    }}
                                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold border flex items-center gap-1 shadow-2xs ${
                                        isMine ? 'ring-1.5 ring-amber-400 bg-amber-500/20 font-bold shadow-xs' : ''
                                    }`}
                                    title={`Assigned Department (Responsible to fix)${isMine ? ' - YOUR DEPARTMENT' : ''}`}
                                >
                                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: theme.bg }} />
                                    <span>🎯</span> {dept} {isMine && <span className="text-[8px] uppercase tracking-wider bg-amber-500 text-black px-1 rounded-xs font-bold">You</span>}
                                </span>
                            );
                        })}
                        {issue.department && (() => {
                            const theme = getDepartmentTheme(issue.department);
                            const isMine = isDeptUser && userDept && normalizeDepartment(issue.department) === userDept;
                            return (
                                <span 
                                    style={{ 
                                        backgroundColor: theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.1)' : `${theme.bg}18`, 
                                        borderColor: isMine ? '#10B981' : (theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.3)' : `${theme.bg}50`),
                                        color: theme.bg === '#212121' ? '#FFFFFF' : (theme.text === '#14130B' ? '#FBBF24' : theme.bg)
                                    }}
                                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium border flex items-center gap-1 shadow-2xs ${
                                        isMine ? 'ring-1.5 ring-emerald-400 bg-emerald-500/20 font-bold shadow-xs' : ''
                                    }`}
                                    title={`Origin Department (Discovered / Reported by)${isMine ? ' - YOUR DEPARTMENT' : ''}`}
                                >
                                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: theme.bg }} />
                                    <span>🏠</span> {issue.department} {isMine && <span className="text-[8px] uppercase tracking-wider bg-emerald-500 text-black px-1 rounded-xs font-bold">You</span>}
                                </span>
                            );
                        })()}
                        {taggedList.length > 0 && taggedList.map((tag, idx) => {
                            const theme = getDepartmentTheme(tag);
                            const isMine = isDeptUser && userDept && normalizeDepartment(tag) === userDept;
                            return (
                                <span 
                                    key={'tag-' + idx} 
                                    style={{ 
                                        backgroundColor: isMine ? 'rgba(99, 102, 241, 0.25)' : (theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.1)' : `${theme.bg}15`), 
                                        borderColor: isMine ? '#818CF8' : (theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.3)' : `${theme.bg}50`),
                                        color: isMine ? '#EEF2FF' : (theme.bg === '#212121' ? '#FFFFFF' : (theme.text === '#14130B' ? '#FBBF24' : theme.bg))
                                    }}
                                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium border flex items-center gap-1 shadow-2xs ${
                                        isMine ? 'ring-1.5 ring-indigo-400 font-bold shadow-xs' : ''
                                    }`}
                                    title={`Tagged Department (Info / Notification only)${isMine ? ' - MENTIONED TO YOU!' : ''}`}
                                >
                                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: theme.bg }} />
                                    <span>📢</span> @{tag} {isMine && <span className="text-[8px] uppercase tracking-wider bg-indigo-500 text-white px-1 rounded-xs font-bold">You</span>}
                                </span>
                            );
                        })}
                        <span className="shrink-0 rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground ml-auto">
                            {issue.id}
                        </span>
                    </div>
                </div>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground break-words min-w-0">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {issue.location}
                </p>
                <div className="flex max-h-40 flex-col gap-3 overflow-y-auto pr-1 text-xs text-muted-foreground min-w-0 w-full">
                    <div className="whitespace-pre-wrap break-words min-w-0">
                        <span className="font-semibold text-foreground block mb-0.5">Original Problem:</span>
                        {issue.description}
                    </div>

                    {pendingTimelineList.length > 0 && (
                        <div className="flex flex-col gap-2 border-l-2 border-orange-500/50 pl-3 min-w-0">
                            <span className="font-semibold text-orange-500 flex items-center justify-between">
                                <span>Delay History ({pendingTimelineList.length}):</span>
                                {issue.status === 'solved' && (
                                    <span className="text-[9px] bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded font-normal border border-orange-500/20">
                                        Delayed before fix
                                    </span>
                                )}
                            </span>
                            {pendingTimelineList.map((item, idx) => (
                                <div key={idx} className="flex flex-col gap-1.5 pb-2 border-b border-border/50 last:border-0 last:pb-0 min-w-0">
                                    <div className="flex items-start gap-2 min-w-0">
                                        {item.image && (
                                            <img 
                                                src={item.image} 
                                                alt="delay proof" 
                                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                className="w-10 h-10 object-cover rounded shadow-sm shrink-0 cursor-pointer hover:opacity-80 transition-opacity" 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedDelay(item);
                                                }}
                                            />
                                        )}
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[10px] font-medium text-orange-600/90 break-words">
                                                {item.date ? `${item.date} - ${item.by}` : item.by}
                                            </span>
                                            <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap break-words min-w-0 mt-0.5">
                                                {item.reason}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Edit history chip (only for actual content modifications, not claims) */}
                    {issue.editLogs && issue.editLogs.filter(l => l && l.type !== 'claim' && l.type !== 'create').length > 0 && (
                        <div className="flex items-center gap-1.5 text-[10px] text-sky-400 font-medium bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-md w-fit">
                            <span>✏️</span>
                            <span>{issue.editLogs.filter(l => l && l.type !== 'claim' && l.type !== 'create').length} edit history</span>
                        </div>
                    )}
                </div>

                {issue.status === 'progress' && issue.taker && (
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span>Claimed by <strong className="text-foreground font-semibold">{issue.taker}</strong></span>
                        {issue.takerHasTransferred ? (
                            <span 
                                className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1"
                                title={lang === 'id' 
                                    ? `Staf pemegang klaim telah pindah ke departemen ${issue.takerCurrentDept || 'lain'}. Departemen Anda tetap dapat melanjutkan atau menyelesaikan isu ini.` 
                                    : `Claimant staff has transferred to ${issue.takerCurrentDept || 'another department'}. Your department can still resume or solve this issue.`}
                            >
                                <ArrowRightLeft className="w-2.5 h-2.5 text-amber-400" />
                                {lang === 'id' ? `Pindah ke ${issue.takerCurrentDept || 'Lain'}` : `Moved to ${issue.takerCurrentDept || 'Other'}`}
                            </span>
                        ) : (
                            getDepartmentForStaff(issue.taker, issue) && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold font-mono flex items-center gap-1">
                                    <Building className="w-2.5 h-2.5" />
                                    {getDepartmentForStaff(issue.taker, issue)}
                                </span>
                            )
                        )}
                    </div>
                )}
                {issue.status === 'pending' && issue.pendingBy && (
                    <div className="text-xs font-medium text-orange-400 flex items-center gap-1.5 flex-wrap">
                        <span>Pending by <strong className="text-orange-300 font-semibold">{issue.pendingBy}</strong></span>
                        {getDepartmentForStaff(issue.pendingBy, issue) && (
                            <span className="px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/30 text-[10px] font-semibold font-mono flex items-center gap-1">
                                <Building className="w-2.5 h-2.5" />
                                {getDepartmentForStaff(issue.pendingBy, issue)}
                            </span>
                        )}
                    </div>
                )}
                {issue.status === 'solved' && issue.solver && (
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span>Fixed by <strong className="text-foreground font-semibold">{issue.solver}</strong></span>
                        {getDepartmentForStaff(issue.solver, issue) && (
                            <span className="px-1.5 py-0.5 rounded bg-green-500/15 text-green-300 border border-green-500/30 text-[10px] font-semibold font-mono flex items-center gap-1">
                                <Building className="w-2.5 h-2.5" />
                                {getDepartmentForStaff(issue.solver, issue)}
                            </span>
                        )}
                    </div>
                )}
                <div className="mt-auto border-t border-border pt-3 text-xs text-muted-foreground flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                        <span>Reported by {issue.reporter}</span>
                        <span>{formatDate(issue.reportedAt)}</span>
                    </div>
                    {issue.isLateUpload && (
                        <div 
                            className="text-amber-500 dark:text-amber-400 font-medium flex items-center justify-between text-[11px] pt-1.5 border-t border-border/40"
                            title={lang === 'id' 
                                ? `Laporan tertunda di antrean offline (+${issue.lateDuration || ''}) karena kendala sinyal Wi-Fi saat mengirim.` 
                                : `Report delayed in offline outbox (+${issue.lateDuration || ''}) due to lost Wi-Fi connection.`}
                        >
                            <span className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                <span className="font-semibold">{lang === 'id' ? 'Laporan Telat Terkirim' : 'Late Send Report'}</span>
                                <span className="text-[10px] text-muted-foreground">({lang === 'id' ? 'Kendala Sinyal Wi-Fi' : 'Wi-Fi Disconnected'})</span>
                            </span>
                            <span className="font-mono font-semibold text-amber-600 dark:text-amber-300 shrink-0">
                                +{issue.lateDuration || '>5m'}
                            </span>
                        </div>
                    )}
                    {isArchived && (
                        <div className="text-stone-400 font-medium flex items-center justify-between text-[11px] pt-1.5 border-t border-border/40">
                            <span className="flex items-center gap-1.5 text-stone-300">
                                <span>🗄️</span>
                                <span>Archived</span>
                                <span className="text-stone-400 font-normal">
                                    by <strong className="text-amber-300/90 font-semibold">{issue.archivedBy || archiveLog?.by || 'Admin'}</strong>
                                </span>
                            </span>
                            {archivedDateFormatted && (
                                <span className="font-mono text-stone-300 font-semibold">{archivedDateFormatted}</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
            
            <DelayDetailModal 
                open={!!selectedDelay} 
                onOpenChange={(open) => !open && setSelectedDelay(null)} 
                delayItem={selectedDelay} 
            />
            <ImageLightboxModal
                open={!!previewImage}
                onClose={() => setPreviewImage(null)}
                src={previewImage}
                title={issue.title}
                subtitle="Foto Laporan (Full Resolution Preview)"
            />
        </button>
    );
}
