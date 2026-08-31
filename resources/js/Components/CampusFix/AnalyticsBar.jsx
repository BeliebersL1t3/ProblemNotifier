import { AlertTriangle, CheckCircle2, ClipboardList, Clock, PauseCircle } from 'lucide-react';
import { useIssues } from '@/context/IssuesContext';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';

export function AnalyticsBar({ statusFilter = 'all', onStatusChange }) {
    const { stats } = useIssues();
    const { t } = useLanguage();

    const cards = [
        {
            key: 'total_reports',
            status: 'all',
            label: t('total_reports'),
            value: stats.total,
            Icon: ClipboardList,
            accent: 'bg-primary/10 text-primary',
            activeRing: 'ring-primary border-primary shadow-[0_0_12px_rgba(201,170,113,0.25)]',
            activeAccent: 'bg-primary/25 text-primary',
        },
        {
            key: 'needs_fixing',
            status: 'open',
            label: t('needs_fixing'),
            value: stats.open,
            Icon: AlertTriangle,
            accent: 'bg-[var(--status-open)]/15 text-status-open',
            activeRing: 'ring-status-open border-status-open shadow-[0_0_12px_rgba(245,158,11,0.25)]',
            activeAccent: 'bg-status-open/30 text-status-open',
        },
        {
            key: 'in_progress',
            status: 'progress',
            label: t('in_progress'),
            value: stats.progress,
            Icon: Clock,
            accent: 'bg-[var(--status-progress)]/20 text-status-progress',
            activeRing: 'ring-status-progress border-status-progress shadow-[0_0_12px_rgba(59,130,246,0.25)]',
            activeAccent: 'bg-status-progress/35 text-status-progress',
        },
        {
            key: 'pending',
            status: 'pending',
            label: t('pending'),
            value: stats.pending,
            Icon: PauseCircle,
            accent: 'bg-status-pending/20 text-status-pending',
            activeRing: 'ring-status-pending border-status-pending shadow-[0_0_12px_rgba(249,115,22,0.25)]',
            activeAccent: 'bg-status-pending/35 text-status-pending',
        },
        {
            key: 'resolved',
            status: 'solved',
            label: t('resolved'),
            value: stats.solved,
            Icon: CheckCircle2,
            accent: 'bg-[var(--status-solved)]/15 text-status-solved',
            activeRing: 'ring-status-solved border-status-solved shadow-[0_0_12px_rgba(16,185,129,0.25)]',
            activeAccent: 'bg-status-solved/30 text-status-solved',
        },
    ];

    const handleCardClick = (status) => {
        if (!onStatusChange) return;
        if (status === 'all') {
            onStatusChange('all');
        } else {
            onStatusChange(statusFilter === status ? 'all' : status);
        }
    };

    return (
        <section aria-label="Issue statistics and filters" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cards.map(({ key, status, label, value, Icon, accent, activeRing, activeAccent }, idx) => {
                const isActive = statusFilter === status;
                const isFiltered = statusFilter !== 'all';
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => handleCardClick(status)}
                        aria-pressed={isActive}
                        className={cn(
                            'group relative flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition-all duration-200 shadow-card select-none cursor-pointer',
                            idx === 0 ? 'col-span-2 sm:col-span-1' : '',
                            isActive
                                ? cn('bg-surface ring-2 scale-[1.01]', activeRing)
                                : isFiltered
                                    ? 'border-border/60 bg-surface/60 opacity-60 hover:opacity-100 hover:border-border hover:bg-surface hover:scale-[1.01]'
                                    : 'border-border bg-surface hover:border-primary/40 hover:bg-surface/90 hover:scale-[1.01] active:scale-[0.99]',
                        )}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <span
                                className={cn(
                                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105',
                                    isActive ? activeAccent : accent,
                                )}
                            >
                                <Icon className="h-5 w-5" aria-hidden />
                            </span>
                            <div className="min-w-0">
                                <p className="text-2xl font-bold leading-none text-foreground">{value}</p>
                                <p className="mt-1 text-xs font-medium text-muted-foreground truncate">{label}</p>
                            </div>
                        </div>

                        {isActive && (
                            <span className="hidden sm:inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-primary">
                                ✓
                            </span>
                        )}
                    </button>
                );
            })}
        </section>
    );
}
