import { AlertTriangle, CheckCircle2, Clock, PauseCircle, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDurationLabel } from '@/lib/duration';
import { useLanguage } from '@/context/LanguageContext';

const STATUS_CLASS = {
    open: 'bg-status-open text-status-open-foreground',
    progress: 'bg-status-progress text-status-progress-foreground',
    pending: 'bg-orange-500 text-white',
    solved: 'bg-status-solved text-status-solved-foreground',
    archived: 'bg-stone-800 text-stone-200 border border-stone-600/50',
};

const STATUS_ICON = {
    open: AlertTriangle,
    progress: Clock,
    pending: PauseCircle,
    solved: CheckCircle2,
    archived: Archive,
};

const STATUS_KEYS = {
    open: 'status_badge_open',
    progress: 'status_badge_progress',
    pending: 'status_badge_pending',
    solved: 'status_badge_solved',
    archived: 'status_badge_archived',
};

export function StatusBadge({ status, label, className }) {
    const { t, lang } = useLanguage?.() || { lang: 'en', t: (k) => k };
    const Icon = STATUS_ICON[status] || AlertTriangle;
    
    let displayLabel;
    if (status === 'solved' && label) {
        displayLabel = formatDurationLabel(label, lang);
    } else if (label) {
        displayLabel = formatDurationLabel(label, lang);
    } else {
        displayLabel = t(STATUS_KEYS[status]) || (status === 'open' ? (lang === 'id' ? 'Perlu Perbaikan' : 'Needs Fixing') : status);
    }

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm',
                STATUS_CLASS[status] || 'bg-muted text-foreground',
                className,
            )}
        >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {displayLabel}
        </span>
    );
}

