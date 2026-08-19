import React, { useState } from 'react';
import { MapPin } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';
import DelayDetailModal from './DelayDetailModal';
import { ImageLightboxModal } from './ImageLightboxModal';
import { ZoomIn } from 'lucide-react';

import { CriticalTimer } from './CriticalTimer';

const FALLBACK_IMAGE = '/barrier-placeholder.svg';

function formatDate(ts) {
    return new Date(ts).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

export function IssueCard({ issue, onSelect }) {
    const [selectedDelay, setSelectedDelay] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);

    return (
        <button
            type="button"
            onClick={() => onSelect(issue)}
            className={cn(
                "group flex flex-col overflow-hidden rounded-xl border text-left transition-all duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 min-w-0 w-full",
                issue.priority === 'critical'
                    ? issue.status === 'solved'
                        ? "border-red-500/50 bg-red-950/10 shadow-[0_0_15px_rgba(239,68,68,0.2)] ring-1 ring-red-500/50"
                        : "border-red-500 bg-red-950/20 border-2 animate-aura ring-1 ring-red-500 z-10 relative"
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
                <CriticalTimer
                    deadline={issue.deadline}
                    status={issue.status}
                    className="absolute right-3 top-3"
                />
            </div>

            <div className="flex flex-1 flex-col gap-2 p-4 min-w-0 w-full">
                {issue.priority === 'critical' && issue.deadline && issue.status !== 'solved' && (
                    <CriticalTimer
                        deadline={issue.deadline}
                        status={issue.status}
                        variant="banner"
                    />
                )}
                <div className="flex flex-col gap-1.5 min-w-0 w-full">
                    <h3 className="text-base font-semibold leading-snug text-foreground break-words min-w-0">{issue.title}</h3>
                    <div className="flex gap-1.5 items-center flex-wrap w-full">
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

                    {issue.pendingTimeline && issue.pendingTimeline.length > 0 && (
                        <div className="flex flex-col gap-2 border-l-2 border-orange-500/50 pl-3 min-w-0">
                            <span className="font-semibold text-orange-500 flex items-center justify-between">
                                <span>Delay History ({issue.pendingTimeline.length}):</span>
                                {issue.status === 'solved' && (
                                    <span className="text-[9px] bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded font-normal border border-orange-500/20">
                                        Delayed before fix
                                    </span>
                                )}
                            </span>
                            {issue.pendingTimeline.map((item, idx) => (
                                <div key={idx} className="flex flex-col gap-1.5 pb-2 border-b border-border/50 last:border-0 last:pb-0 min-w-0">
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
                </div>

                {issue.status === 'progress' && issue.taker && (
                    <p className="text-xs font-medium text-muted-foreground">Claimed by {issue.taker}</p>
                )}
                {issue.status === 'pending' && issue.pendingBy && (
                    <p className="text-xs font-medium text-orange-500">Currently pending by {issue.pendingBy}</p>
                )}
                {issue.status === 'solved' && issue.solver && (
                    <p className="text-xs font-medium text-muted-foreground">Fixed by {issue.solver}</p>
                )}
                <div className="mt-auto border-t border-border pt-3 text-xs text-muted-foreground">
                    Reported by {issue.reporter} • {formatDate(issue.reportedAt)}
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
