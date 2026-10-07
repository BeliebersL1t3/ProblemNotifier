import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/Components/UI/Sheet';
import { SlidersHorizontal, Wrench, Droplets, Zap, Building2, Bug, Monitor, Anchor, ShieldAlert, UserRound, HelpCircle, LayoutGrid, Building, Lock, Globe, ChevronDown, RotateCcw } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { ALL_DEPARTMENTS } from '@/constants/staff';
import { getDepartmentTheme } from '@/constants/departments';
import { useAuth } from '@/hooks/useAuth';

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
    const { t, lang } = useLanguage();
    const { isAdmin, department: userDept, canViewAllDepartments } = useAuth();
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

    return (
        <>
            <div className="flex items-center gap-1.5 sm:gap-2.5 flex-nowrap shrink min-w-0">
                {/* Category trigger chip */}
                <button
                    type="button"
                    onClick={() => setCatSheetOpen(true)}
                    className={cn(
                        'flex items-center justify-between gap-1.5 sm:gap-2.5 rounded-xl border px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold transition-all duration-200 cursor-pointer shadow-xs shrink-0',
                        hasActiveCategory
                            ? 'border-[#C9AA71] bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                            : 'border-[#3B3929] bg-[#2A281E] text-[#E3D1AA] hover:border-[#C9AA71]/60 hover:bg-[#343226]',
                    )}
                >
                    <div className="flex items-center gap-1.5 sm:gap-2 truncate">
                        <SlidersHorizontal className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0", hasActiveCategory ? "text-[#1C1B0E]" : "text-[#C9AA71]")} />
                        <span className="truncate max-w-[75px] sm:max-w-none">{activeCategoryLabel ?? (t('category') || 'Kategori')}</span>
                    </div>
                    <ChevronDown className={cn("h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 transition-transform", hasActiveCategory ? "text-[#1C1B0E]" : "text-[#A19F8D]")} />
                </button>

                {/* Department trigger chip — Interactive for Admin or users with canViewAllDepartments, Locked badge for Dept user */}
                {canSelectDept ? (
                    <button
                        type="button"
                        onClick={() => setDeptSheetOpen(true)}
                        title={!isAdmin && canViewAllDepartments ? (lang === 'id' ? 'Wewenang Khusus: Anda dapat memilih dan memantau isu seluruh departemen' : 'Special Permission: You can view and filter all resort departments') : undefined}
                        className={cn(
                            'flex items-center justify-between gap-1.5 sm:gap-2.5 rounded-xl border px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold transition-all duration-200 cursor-pointer shadow-xs shrink-0',
                            hasActiveDept
                                ? 'border-[#C9AA71] bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                                : 'border-[#3B3929] bg-[#2A281E] text-[#E3D1AA] hover:border-[#C9AA71]/60 hover:bg-[#343226]',
                        )}
                    >
                        <div className="flex items-center gap-1.5 sm:gap-2 truncate">
                            {!isAdmin && canViewAllDepartments ? (
                                <Globe className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0", hasActiveDept ? "text-[#1C1B0E]" : "text-sky-400")} />
                            ) : (
                                <Building className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0", hasActiveDept ? "text-[#1C1B0E]" : "text-blue-400")} />
                            )}
                            <span className="truncate max-w-[85px] sm:max-w-none">{deptFilter !== 'all' ? deptFilter : (t('department') || 'Departemen')}</span>
                            {!isAdmin && canViewAllDepartments && deptFilter === 'all' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-extrabold uppercase">
                                    ALL
                                </span>
                            )}
                        </div>
                        <ChevronDown className={cn("h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 transition-transform", hasActiveDept ? "text-[#1C1B0E]" : "text-[#A19F8D]")} />
                    </button>
                ) : (
                    <div 
                        className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-[#3B3929] bg-[#2A281E] px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold shadow-xs shrink-0"
                    >
                        <Lock className="h-3.5 w-3.5 text-[#C9AA71]" />
                        {userDept && (
                            <span 
                                className="px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-extrabold uppercase"
                                style={{ 
                                    background: getDepartmentTheme(userDept).bg, 
                                    color: getDepartmentTheme(userDept).text 
                                }}
                            >
                                {userDept}
                            </span>
                        )}
                        <span className="text-[11px] text-[#A19F8D] hidden sm:inline">
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
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent hover:border-[#3B3929] transition-all cursor-pointer"
                        title={lang === 'id' ? 'Reset semua filter' : 'Reset all filters'}
                    >
                        <RotateCcw className="h-3 w-3 text-[#C9AA71]" />
                        <span>{lang === 'id' ? 'Reset Filter' : 'Reset Filters'}</span>
                    </button>
                )}
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

