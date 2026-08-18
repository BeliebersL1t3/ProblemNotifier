import { AlertTriangle, CheckCircle2, Clock, PauseCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_LABEL = {
    open: 'Needs Fixing',
    progress: 'In Progress',
    pending: 'Pending',
    solved: 'Solved',
};

const STATUS_CLASS = {
    open: 'bg-status-open text-status-open-foreground',
    progress: 'bg-status-progress text-status-progress-foreground',
    pending: 'bg-orange-500 text-white',
    solved: 'bg-status-solved text-status-solved-foreground',
};

const STATUS_ICON = {
    open: AlertTriangle,
    progress: Clock,
    pending: PauseCircle,
    solved: CheckCircle2,
};

export function StatusBadge({ status, label, className }) {
    const Icon = STATUS_ICON[status];
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm',
                STATUS_CLASS[status],
                className,
            )}
        >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label ?? STATUS_LABEL[status]}
        </span>
    );
}
