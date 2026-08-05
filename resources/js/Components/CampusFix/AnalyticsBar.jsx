import { AlertTriangle, CheckCircle2, ClipboardList, Clock } from 'lucide-react';
import { useIssues } from '@/context/IssuesContext';

export function AnalyticsBar() {
    const { stats } = useIssues();

    const cards = [
        {
            label: 'Total Reports',
            value: stats.total,
            Icon: ClipboardList,
            accent: 'bg-primary/10 text-primary',
        },
        {
            label: 'Needs Fixing',
            value: stats.open,
            Icon: AlertTriangle,
            accent: 'bg-[var(--status-open)]/15 text-status-open',
        },
        {
            label: 'In Progress',
            value: stats.progress,
            Icon: Clock,
            accent: 'bg-[var(--status-progress)]/20 text-status-progress',
        },
        {
            label: 'Resolved',
            value: stats.solved,
            Icon: CheckCircle2,
            accent: 'bg-[var(--status-solved)]/15 text-status-solved',
        },
    ];

    return (
        <section aria-label="Issue statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map(({ label, value, Icon, accent }) => (
                <div
                    key={label}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-card"
                >
                    <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
                        <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                        <p className="text-2xl font-bold leading-none text-foreground">{value}</p>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
                    </div>
                </div>
            ))}
        </section>
    );
}
