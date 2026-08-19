import React, { useState, useEffect } from 'react';
import { Timer, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CriticalTimer({ deadline, status, className, variant = 'badge' }) {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (!deadline || status === 'solved') return;
        const interval = setInterval(() => {
            setNow(Date.now());
        }, 1000);
        return () => clearInterval(interval);
    }, [deadline, status]);

    if (!deadline || status === 'solved') return null;

    let targetTime; if (/^\d+$/.test(deadline)) { targetTime = parseInt(deadline, 10); if (targetTime < 10000000000) targetTime *= 1000; } else { targetTime = Date.parse(deadline); } if (isNaN(targetTime) || targetTime <= 0) return null;

    const diff = targetTime - now;
    const isOverdue = diff <= 0;
    const absDiff = Math.abs(diff);

    const totalSeconds = Math.floor(absDiff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n) => String(n).padStart(2, '0');

    let timeStr = '';
    if (days > 30) {
        timeStr = '>30d';
    } else if (days > 0) {
        timeStr = `${days}d ${hours}h`;
    } else if (hours > 0) {
        timeStr = `${hours}h ${pad(minutes)}m`;
    } else {
        timeStr = `${pad(minutes)}:${pad(seconds)}`;
    }

    if (variant === 'banner') {
        if (isOverdue) {
            return (
                <div className={cn("flex items-center justify-between rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-bold text-white shadow-md animate-pulse border border-red-500", className)}>
                    <span className="flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        CRITICAL OVERDUE!
                    </span>
                    <span className="font-mono text-sm">+{timeStr}</span>
                </div>
            );
        }

        const isUrgent = diff <= 5 * 60 * 1000;
        return (
            <div className={cn(
                "flex items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold border backdrop-blur-md shadow-sm",
                isUrgent 
                    ? "bg-red-500/20 text-red-400 border-red-500/50 animate-pulse font-bold" 
                    : "bg-amber-500/20 text-amber-300 border-amber-500/40",
                className
            )}>
                <span className="flex items-center gap-1.5">
                    <Timer className="h-4 w-4 shrink-0" />
                    Critical Time Limit:
                </span>
                <span className="font-mono text-sm">{timeStr} left</span>
            </div>
        );
    }

    // Default badge variant (e.g. for top-right corner of card image)
    if (isOverdue) {
        return (
            <div
                className={cn(
                    "flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white shadow-lg animate-pulse border border-red-300 z-10",
                    className
                )}
                title={`Deadline passed by ${timeStr}! Escalation active.`}
            >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>OVERDUE {timeStr}</span>
            </div>
        );
    }

    const isUrgent = diff <= 5 * 60 * 1000;

    return (
        <div
            className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold backdrop-blur-md shadow-md border z-10",
                isUrgent
                    ? "bg-red-950/80 text-red-400 border-red-500 animate-pulse font-bold"
                    : "bg-black/70 text-amber-300 border-amber-500/50",
                className
            )}
            title={`Time remaining: ${timeStr}`}
        >
            <Timer className="h-3 w-3 shrink-0 text-amber-400" />
            <span>{timeStr}</span>
        </div>
    );
}
// trigger HMR
