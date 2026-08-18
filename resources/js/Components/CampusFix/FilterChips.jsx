import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/Components/UI/Sheet';
import { SlidersHorizontal, Wrench, Droplets, Zap, Building2, Bug, Monitor, Anchor, ShieldAlert, UserRound, HelpCircle, LayoutGrid, Building } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const STATUS_FILTERS = [
    { id: 'open',     key: 'open' },
    { id: 'progress', key: 'in_progress' },
    { id: 'pending',  key: 'pending' },
    { id: 'solved',   key: 'solved' },
];

const CATEGORY_FILTERS = [
    { id: 'all',                     label: 'All Categories',        icon: LayoutGrid,   color: 'text-foreground',       bg: 'bg-muted/60' },
    { id: 'category:broken',         label: 'Broken Equipment',      icon: Wrench,       color: 'text-amber-600',        bg: 'bg-amber-500/10 border-amber-500/20' },
    { id: 'category:plumbing',       label: 'Plumbing',              icon: Droplets,     color: 'text-blue-600',         bg: 'bg-blue-500/10 border-blue-500/20' },
    { id: 'category:electrical',     label: 'Electrical',            icon: Zap,          color: 'text-yellow-600',       bg: 'bg-yellow-500/10 border-yellow-500/20' },
    { id: 'category:structural',     label: 'Structural / Building', icon: Building2,    color: 'text-stone-600',        bg: 'bg-stone-500/10 border-stone-500/20' },
    { id: 'category:pest-hygiene',   label: 'Pest & Hygiene',        icon: Bug,          color: 'text-green-700',        bg: 'bg-green-500/10 border-green-500/20' },
    { id: 'category:it-technology',  label: 'IT & Technology',       icon: Monitor,      color: 'text-violet-600',       bg: 'bg-violet-500/10 border-violet-500/20' },
    { id: 'category:marine-outdoor', label: 'Marine & Outdoor',      icon: Anchor,       color: 'text-cyan-600',         bg: 'bg-cyan-500/10 border-cyan-500/20' },
    { id: 'category:safety-hazard',  label: 'Safety Hazard',         icon: ShieldAlert,  color: 'text-red-600',          bg: 'bg-red-500/10 border-red-500/20' },
    { id: 'category:guest-issues',   label: 'Guest Issues',          icon: UserRound,    color: 'text-pink-600',         bg: 'bg-pink-500/10 border-pink-500/20' },
    { id: 'category:other',          label: 'Other',                 icon: HelpCircle,   color: 'text-muted-foreground', bg: 'bg-muted/60' },
];

const DEPARTMENT_FILTERS = [
    'Engineer', 'Tekong', 'Pest Control', 'Security', 'Fasilitas', 
    'HK', 'F&B', 'Service', 'Bar', 'GR', 'Spa', 'TiRek', 'OE', 
    'IT', 'Procurement', 'Sales/Marketing', 'Reservasi', 'Finance'
];

export function FilterChips({ categoryFilter, onCategoryChange, statusFilter, onStatusChange, deptFilter, onDeptChange }) {
    const { t } = useLanguage();
    const [catSheetOpen, setCatSheetOpen] = useState(false);
    const [deptSheetOpen, setDeptSheetOpen] = useState(false);

    const activeCategory = CATEGORY_FILTERS.find(f => f.id === categoryFilter);
    const activeCategoryLabel = categoryFilter !== 'all' ? activeCategory?.label : null;

    const handleCategorySelect = (id) => {
        onCategoryChange(id);
        setCatSheetOpen(false);
    };

    // Toggle status: clicking the active status resets to 'all'
    const handleStatusClick = (id) => {
        onStatusChange(statusFilter === id ? 'all' : id);
    };

    return (
        <>
        <div className="w-full flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
            {/* Mobile Row 1: Category & Department trigger buttons side by side */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2 shrink-0">
                {/* Category trigger chip */}
                <button
                    type="button"
                    onClick={() => setCatSheetOpen(true)}
                    className={cn(
                        'flex items-center justify-between gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all sm:rounded-full sm:py-1.5 sm:px-4',
                        activeCategoryLabel
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-border bg-surface text-foreground hover:border-primary/40',
                    )}
                >
                    <div className="flex items-center gap-1.5 truncate">
                        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="truncate">{activeCategoryLabel ?? t('category')}</span>
                    </div>
                    <span className="text-[10px] opacity-60">▼</span>
                </button>

                {/* Department trigger chip */}
                <button
                    type="button"
                    onClick={() => setDeptSheetOpen(true)}
                    className={cn(
                        'flex items-center justify-between gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all sm:rounded-full sm:py-1.5 sm:px-4',
                        deptFilter !== 'all'
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-border bg-surface text-foreground hover:border-primary/40',
                    )}
                >
                    <div className="flex items-center gap-1.5 truncate">
                        <Building className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                        <span className="truncate">{deptFilter !== 'all' ? deptFilter : t('department')}</span>
                    </div>
                    <span className="text-[10px] opacity-60">▼</span>
                </button>
            </div>

            <div className="hidden sm:block mx-1 w-px shrink-0 self-stretch bg-border/60" />

            {/* Status Filter Pills (Horizontal Scroll Strip on Mobile, Flex on Desktop) */}
            <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none items-center"
                 style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {/* Status: All */}
                <button
                    type="button"
                    onClick={() => onStatusChange('all')}
                    aria-pressed={statusFilter === 'all'}
                    className={cn(
                        'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap',
                        statusFilter === 'all'
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-border/60 bg-surface/80 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                    )}
                >
                    {t('all')}
                </button>

                {/* Individual status chips */}
                {STATUS_FILTERS.map((filter) => (
                    <button
                        key={filter.id}
                        type="button"
                        onClick={() => handleStatusClick(filter.id)}
                        aria-pressed={statusFilter === filter.id}
                        className={cn(
                            'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap',
                            statusFilter === filter.id
                                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                : 'border-border/60 bg-surface/80 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                        )}
                    >
                        {t(filter.key)}
                    </button>
                ))}
            </div>
        </div>


            {/* Category picker sheet */}
            <Sheet open={catSheetOpen} onOpenChange={setCatSheetOpen}>
                <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto rounded-t-2xl pb-8">
                    <SheetHeader className="mb-5">
                        <SheetTitle>Filter by Category</SheetTitle>
                        <SheetDescription>
                            Select a category to narrow down issues. Status filters still apply on top of this.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {CATEGORY_FILTERS.map((cat) => {
                            const Icon = cat.icon;
                            const isActive = categoryFilter === cat.id;
                            return (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => handleCategorySelect(cat.id)}
                                    className={cn(
                                        'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all',
                                        cat.bg,
                                        isActive
                                            ? 'ring-2 ring-primary border-primary scale-[0.98]'
                                            : 'hover:scale-[0.97] active:scale-[0.95]',
                                    )}
                                >
                                    <Icon className={cn('h-5 w-5', cat.color)} />
                                    <span className={cn('text-sm font-semibold leading-tight', cat.color)}>
                                        {cat.label}
                                    </span>
                                    {isActive && (
                                        <span className="mt-auto text-[10px] font-bold uppercase tracking-wider text-primary">
                                            Active ✓
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </SheetContent>
            </Sheet>

            {/* Department picker sheet */}
            <Sheet open={deptSheetOpen} onOpenChange={setDeptSheetOpen}>
                <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto rounded-t-2xl pb-8">
                    <SheetHeader className="mb-5">
                        <SheetTitle>Filter by Department</SheetTitle>
                        <SheetDescription>
                            Select a department to narrow down issues.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <button
                            type="button"
                            onClick={() => { onDeptChange('all'); setDeptSheetOpen(false); }}
                            className={cn(
                                'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all bg-muted/60',
                                deptFilter === 'all'
                                    ? 'ring-2 ring-primary border-primary scale-[0.98]'
                                    : 'hover:scale-[0.97] active:scale-[0.95]',
                            )}
                        >
                            <LayoutGrid className="h-5 w-5 text-foreground" />
                            <span className="text-sm font-semibold leading-tight text-foreground">
                                All Departments
                            </span>
                            {deptFilter === 'all' && (
                                <span className="mt-auto text-[10px] font-bold uppercase tracking-wider text-primary">
                                    Active ✓
                                </span>
                            )}
                        </button>
                        {DEPARTMENT_FILTERS.map((dept) => {
                            const isActive = deptFilter === dept;
                            return (
                                <button
                                    key={dept}
                                    type="button"
                                    onClick={() => { onDeptChange(dept); setDeptSheetOpen(false); }}
                                    className={cn(
                                        'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all bg-blue-500/5 border-blue-500/10',
                                        isActive
                                            ? 'ring-2 ring-primary border-primary scale-[0.98]'
                                            : 'hover:scale-[0.97] active:scale-[0.95]',
                                    )}
                                >
                                    <Building className="h-5 w-5 text-blue-600" />
                                    <span className="text-sm font-semibold leading-tight text-blue-600">
                                        {dept}
                                    </span>
                                    {isActive && (
                                        <span className="mt-auto text-[10px] font-bold uppercase tracking-wider text-primary">
                                            Active ✓
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}
