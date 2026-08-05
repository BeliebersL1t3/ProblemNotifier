import { cn } from '@/lib/utils';
import { useIssues } from '@/context/IssuesContext';

const STATUS_FILTERS = [
    { id: 'open', label: 'Open' },
    { id: 'progress', label: 'In Progress' },
    { id: 'solved', label: 'Solved' },
];

export function FilterChips({ active, onChange }) {
    const { categories } = useIssues();

    const filters = [
        { id: 'all', label: 'All' },
        ...categories.map((c) => ({ id: `category:${c.id}`, label: c.label })),
        ...STATUS_FILTERS,
    ];

    return (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {filters.map((filter) => (
                <button
                    key={filter.id}
                    type="button"
                    onClick={() => onChange(filter.id)}
                    aria-pressed={active === filter.id}
                    className={cn(
                        'shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                        active === filter.id
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground',
                    )}
                >
                    {filter.label}
                </button>
            ))}
        </div>
    );
}
