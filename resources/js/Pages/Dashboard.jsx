import { Head } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import { Loader2, RefreshCw, SearchX } from 'lucide-react';

import { IssuesProvider, useIssues } from '@/context/IssuesContext';
import { CampusFixHeader } from '@/Components/CampusFix/CampusFixHeader';
import { AnalyticsBar } from '@/Components/CampusFix/AnalyticsBar';
import { FilterChips } from '@/Components/CampusFix/FilterChips';
import { IssueCard } from '@/Components/CampusFix/IssueCard';
import { ReportIssueModal } from '@/Components/CampusFix/ReportIssueModal';
import { TakeJobModal } from '@/Components/CampusFix/TakeJobModal';
import { ResolveIssueSheet } from '@/Components/CampusFix/ResolveIssueSheet';
import { SolvedDetailModal } from '@/Components/CampusFix/SolvedDetailModal';
import { Button } from '@/Components/UI/Button';

export default function Dashboard() {
    return (
        <IssuesProvider>
            <Head title="Dashboard — CampusFix" />
            <DashboardInner />
        </IssuesProvider>
    );
}

function DashboardInner() {
    const { issues, loading, error, fetchIssues } = useIssues();
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [reportOpen, setReportOpen] = useState(false);
    const [takeTarget, setTakeTarget] = useState(null);
    const [resolveTarget, setResolveTarget] = useState(null);
    const [detailTarget, setDetailTarget] = useState(null);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return issues.filter((issue) => {
            const matchesQuery =
                !q ||
                issue.title.toLowerCase().includes(q) ||
                issue.location.toLowerCase().includes(q) ||
                issue.description.toLowerCase().includes(q);

            const matchesFilter =
                filter === 'all'
                    ? true
                    : filter.startsWith('category:')
                        ? issue.category === filter.slice('category:'.length)
                        : issue.status === filter;

            return matchesQuery && matchesFilter;
        });
    }, [issues, query, filter]);

    const handleSelect = (issue) => {
        if (issue.status === 'open') setTakeTarget(issue);
        else if (issue.status === 'progress') setResolveTarget(issue);
        else setDetailTarget(issue);
    };

    return (
        <div className="min-h-screen bg-background font-sans">
            <CampusFixHeader
                query={query}
                onQueryChange={setQuery}
                onReport={() => setReportOpen(true)}
            />

            <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                            Community facility dashboard
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Report what's broken, claim a job, and log the fix — connected directly to Google Sheets & Drive.
                        </p>
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchIssues}
                        disabled={loading}
                        className="w-fit shrink-0 gap-2"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Sync Sheets
                    </Button>
                </div>

                {error && (
                    <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                        <span>{error}</span>
                        <Button variant="outline" size="sm" onClick={fetchIssues}>
                            Retry
                        </Button>
                    </div>
                )}

                <AnalyticsBar />
                <FilterChips active={filter} onChange={setFilter} />

                {loading && issues.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface py-20 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm font-medium text-muted-foreground">Connecting to Google Sheets...</p>
                    </div>
                ) : visible.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface py-16 text-center">
                        <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
                        <p className="font-semibold text-foreground">No issues match your filters</p>
                        <p className="text-sm text-muted-foreground">
                            Try a different keyword or reset the filter chips.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {visible.map((issue) => (
                            <IssueCard key={issue.id} issue={issue} onSelect={handleSelect} />
                        ))}
                    </div>
                )}
            </main>

            <ReportIssueModal open={reportOpen} onOpenChange={setReportOpen} />
            <TakeJobModal issue={takeTarget} onClose={() => setTakeTarget(null)} />
            <ResolveIssueSheet issue={resolveTarget} onClose={() => setResolveTarget(null)} />
            <SolvedDetailModal issue={detailTarget} onClose={() => setDetailTarget(null)} />
        </div>
    );
}

