import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/Components/UI/Sheet';
import { SlidersHorizontal, Wrench, Droplets, Zap, Building2, Bug, Monitor, Anchor, ShieldAlert, UserRound, HelpCircle, LayoutGrid, Building, Lock, Globe } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { ALL_DEPARTMENTS } from '@/constants/staff';
import { getDepartmentTheme } from '@/constants/departments';
import { useAuth } from '@/hooks/useAuth';

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

const DEPARTMENT_FILTERS = ALL_DEPARTMENTS;

export function FilterChips({ categoryFilter, onCategoryChange, deptFilter, onDeptChange }) {
    const { t } = useLanguage();
    const { isAdmin, isDeptUser, department: userDept, canViewAllDepartments } = useAuth();
    const canSelectDept = isAdmin || canViewAllDepartments;
    const [catSheetOpen, setCatSheetOpen] = useState(false);
    const [deptSheetOpen, setDeptSheetOpen] = useState(false);

    const activeCategory = CATEGORY_FILTERS.find(f => f.id === categoryFilter);
    const activeCategoryLabel = categoryFilter !== 'all' ? activeCategory?.label : null;

    const handleCategorySelect = (id) => {
        onCategoryChange(id);
        setCatSheetOpen(false);
    };

    const hasActiveCategory = categoryFilter && categoryFilter !== 'all';
    const hasActiveDept = canSelectDept && deptFilter && deptFilter !== 'all';
    const hasActiveFilters = hasActiveCategory || hasActiveDept;

    const deptTheme = deptFilter && deptFilter !== 'all' ? getDepartmentTheme(deptFilter) : null;

    return (
        <>
        <div className="w-full flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
                {/* Category trigger chip */}
                <button
                    type="button"
                    onClick={() => setCatSheetOpen(true)}
                    className={cn(
                        'flex items-center justify-between gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all sm:rounded-full sm:py-1.5 sm:px-4 cursor-pointer',
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

                {/* Department trigger chip — Interactive for Admin or users with canViewAllDepartments, Locked badge for Dept user */}
                {canSelectDept ? (
                    <button
                        type="button"
                        onClick={() => setDeptSheetOpen(true)}
                        title={!isAdmin && canViewAllDepartments ? (lang === 'id' ? 'Wewenang Khusus: Anda dapat memilih dan memantau isu seluruh departemen' : 'Special Permission: You can view and filter all resort departments') : undefined}
                        className={cn(
                            'flex items-center justify-between gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all sm:rounded-full sm:py-1.5 sm:px-4 cursor-pointer',
                            deptFilter !== 'all'
                                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                : 'border-border bg-surface text-foreground hover:border-primary/40',
                        )}
                    >
                        <div className="flex items-center gap-1.5 truncate">
                            {!isAdmin && canViewAllDepartments ? (
                                <Globe className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                            ) : (
                                <Building className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                            )}
                            <span className="truncate">{deptFilter !== 'all' ? deptFilter : t('department')}</span>
                            {!isAdmin && canViewAllDepartments && deptFilter === 'all' && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-sky-500/20 text-sky-300 font-extrabold uppercase">
                                    ALL
                                </span>
                            )}
                        </div>
                        <span className="text-[10px] opacity-60">▼</span>
                    </button>
                ) : (
                    <div 
                        className="flex items-center gap-1.5 rounded-xl border border-[#3B3929] bg-[#2A281E] px-3 py-1.5 text-xs font-bold sm:rounded-full shadow-xs"
                    >
                        <Lock className="h-3 w-3 text-[#C9AA71]" />
                        {userDept && (
                            <span 
                                className="px-2 py-0.5 rounded text-[11px] font-extrabold uppercase"
                                style={{ 
                                    background: getDepartmentTheme(userDept).bg, 
                                    color: getDepartmentTheme(userDept).text 
                                }}
                            >
                                {userDept}
                            </span>
                        )}
                        <span className="text-[10px] text-[#A19F8D] hidden sm:inline">
                            {t('locked_to_department') || 'Cakupan Departemen'}
                        </span>
                    </div>
                )}

                {/* Reset button if category or admin dept filter active */}
                {hasActiveFilters && (
                    <button
                        type="button"
                        onClick={() => {
                            onCategoryChange('all');
                            if (canSelectDept) onDeptChange('all');
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1 transition-colors cursor-pointer"
                    >
                        Reset filters
                    </button>
                )}
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
                        {CATEGORY_FILTERS.map((cat, idx) => {
                            const Icon = cat.icon;
                            const isActive = categoryFilter === cat.id;
                            return (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => handleCategorySelect(cat.id)}
                                    style={{ animationDelay: `${idx * 45}ms` }}
                                    className={cn(
                                        'animate-sheet-item flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all duration-200 cursor-pointer',
                                        cat.bg,
                                        isActive
                                            ? 'ring-2 ring-primary border-primary scale-[0.98]'
                                            : 'hover:scale-[0.98] active:scale-[0.95]',
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
                            style={{ animationDelay: '0ms' }}
                            className={cn(
                                'animate-sheet-item flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all duration-200 bg-muted/60 cursor-pointer',
                                deptFilter === 'all'
                                    ? 'ring-2 ring-primary border-primary scale-[0.98]'
                                    : 'hover:scale-[0.98] active:scale-[0.95]',
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
                        {DEPARTMENT_FILTERS.map((dept, idx) => {
                            const isActive = deptFilter === dept;
                            const theme = getDepartmentTheme(dept);
                            return (
                                <button
                                    key={dept}
                                    type="button"
                                    onClick={() => { onDeptChange(dept); setDeptSheetOpen(false); }}
                                    style={{
                                        animationDelay: `${(idx + 1) * 35}ms`,
                                        ...(isActive ? {
                                            backgroundColor: theme.bg,
                                            color: theme.text,
                                            borderColor: theme.bg,
                                            boxShadow: `0 0 12px ${theme.bg}80`
                                        } : {
                                            backgroundColor: theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.08)' : `${theme.bg}12`,
                                            borderColor: theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.25)' : `${theme.bg}30`,
                                        })
                                    }}
                                    className={cn(
                                        'animate-sheet-item flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all duration-200 cursor-pointer',
                                        isActive
                                            ? 'ring-2 ring-white/30 scale-[0.98]'
                                            : 'hover:scale-[0.98] active:scale-[0.95] hover:border-primary/40',
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <span 
                                            className="h-3 w-3 rounded-full shrink-0 border border-white/20" 
                                            style={{ backgroundColor: theme.bg }} 
                                        />
                                        <Building 
                                            className="h-4 w-4" 
                                            style={{ color: isActive ? theme.text : (theme.bg === '#212121' ? '#FFFFFF' : theme.bg) }} 
                                        />
                                    </div>
                                    <span 
                                        className="text-sm font-bold leading-tight"
                                        style={{ color: isActive ? theme.text : (theme.bg === '#212121' ? '#FFFFFF' : theme.bg) }}
                                    >
                                        {dept}
                                    </span>
                                    {isActive && (
                                        <span 
                                            className="mt-auto text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded"
                                            style={{ 
                                                backgroundColor: theme.text === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                                                color: theme.text
                                            }}
                                        >
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
