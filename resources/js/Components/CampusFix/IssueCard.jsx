import { MapPin } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

const FALLBACK_IMAGE = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%23e2e8f0"/><text x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-family="system-ui" font-size="14">No Image</text></svg>';

function formatDate(ts) {
    return new Date(ts).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

export function IssueCard({ issue, onSelect }) {
    return (
        <button
            type="button"
            onClick={() => onSelect(issue)}
            className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface text-left shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
            <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                <img
                    src={issue.imageUrl || FALLBACK_IMAGE}
                    alt={issue.title}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <StatusBadge
                    status={issue.status}
                    label={issue.status === 'solved' ? issue.durationLabel : undefined}
                    className="absolute left-3 top-3"
                />
            </div>

            <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="text-base font-semibold leading-snug text-foreground">{issue.title}</h3>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {issue.location}
                </p>
                {issue.status === 'progress' && issue.taker && (
                    <p className="text-xs font-medium text-muted-foreground">Claimed by {issue.taker}</p>
                )}
                {issue.status === 'solved' && issue.solver && (
                    <p className="text-xs font-medium text-muted-foreground">Fixed by {issue.solver}</p>
                )}
                <div className="mt-auto border-t border-border pt-3 text-xs text-muted-foreground">
                    Reported by {issue.reporter} • {formatDate(issue.reportedAt)}
                </div>
            </div>
        </button>
    );
}
