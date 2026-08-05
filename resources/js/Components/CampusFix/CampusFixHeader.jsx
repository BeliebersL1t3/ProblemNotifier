import { Plus, Search, Wrench } from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';

export function CampusFixHeader({ query, onQueryChange, onReport }) {
    return (
        <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:gap-6">
                <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Wrench className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="leading-tight">
                        <p className="text-lg font-bold tracking-tight text-foreground">CampusFix</p>
                        <p className="hidden text-xs text-muted-foreground sm:block">
                            Vocational Faculty · Universitas Brawijaya
                        </p>
                    </div>
                </div>

                <div className="relative flex-1 md:mx-auto md:max-w-xl">
                    <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                    />
                    <Input
                        value={query}
                        onChange={(e) => onQueryChange(e.target.value)}
                        placeholder="Search issues or locations..."
                        aria-label="Search issues or locations"
                        className="pl-9"
                    />
                </div>

                <Button onClick={onReport} className="shrink-0 gap-2">
                    <Plus className="h-4 w-4" aria-hidden />
                    Report Issue
                </Button>
            </div>
        </header>
    );
}
