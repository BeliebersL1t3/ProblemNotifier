import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/Components/UI/Sheet';
import { LayoutGrid, Building, Lock, Globe, ChevronDown, RotateCcw } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { ALL_DEPARTMENTS } from '@/constants/staff';
import { getDepartmentTheme } from '@/constants/departments';
import { useAuth } from '@/hooks/useAuth';

const DEPARTMENT_FILTERS = ALL_DEPARTMENTS;

export function FilterChips({ deptFilter = 'all', onDeptChange, isMobileToolbar = false }) {
    const { t, lang } = useLanguage();
    const { isAdmin, department: userDept, canViewAllDepartments } = useAuth();
    const canSelectDept = isAdmin || canViewAllDepartments;
    const [deptSheetOpen, setDeptSheetOpen] = useState(false);

    const hasActiveDept = canSelectDept && deptFilter && deptFilter !== 'all';

    return (
        <>
            {isMobileToolbar ? (
                <div className="flex items-center gap-1 shrink-0">
                    {/* Department trigger icon */}
                    {canSelectDept ? (
                        <button
                            type="button"
                            onClick={() => setDeptSheetOpen(true)}
                            title={deptFilter !== 'all' ? deptFilter : (!isAdmin && canViewAllDepartments ? (lang === 'id' ? 'Wewenang Khusus: Semua Departemen' : 'Special Permission: All Departments') : (t('department') || 'Departemen'))}
                            className={cn(
                                'p-2.5 rounded-xl transition-all flex items-center justify-center cursor-pointer',
                                hasActiveDept
                                    ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                            )}
                        >
                            {!isAdmin && canViewAllDepartments ? (
                                <Globe className="h-5 w-5" />
                            ) : (
                                <Building className="h-5 w-5" />
                            )}
                        </button>
                    ) : (
                        <div 
                            className="p-2.5 rounded-xl flex items-center justify-center text-[#C9AA71]"
                            title={userDept ? `Departemen: ${userDept}` : undefined}
                        >
                            <Lock className="h-5 w-5" />
                        </div>
                    )}

                    {hasActiveDept && (
                        <button
                            type="button"
                            onClick={() => {
                                if (canSelectDept) onDeptChange('all');
                            }}
                            className="p-2.5 rounded-xl text-amber-400 hover:text-amber-300 hover:bg-white/5 transition-all cursor-pointer"
                            title={lang === 'id' ? 'Reset filter' : 'Reset filters'}
                        >
                            <RotateCcw className="h-4 w-4" />
                        </button>
                    )}
                </div>
            ) : (
                <div className="flex items-center gap-2.5 flex-nowrap shrink min-w-0">
                    {/* Department trigger chip — Interactive for Admin or users with canViewAllDepartments, Locked badge for Dept user */}
                    {canSelectDept ? (
                        <button
                            type="button"
                            onClick={() => setDeptSheetOpen(true)}
                            title={deptFilter !== 'all' ? deptFilter : (!isAdmin && canViewAllDepartments ? (lang === 'id' ? 'Wewenang Khusus: Semua Departemen' : 'Special Permission: All Departments') : (t('department') || 'Departemen'))}
                            className={cn(
                                'flex items-center justify-center gap-2.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all duration-200 cursor-pointer shadow-xs shrink-0',
                                hasActiveDept
                                    ? 'border-[#C9AA71] bg-[#C9AA71] text-[#1C1B0E] shadow-sm font-extrabold'
                                    : 'border-[#3B3929] bg-[#2A281E] text-[#E3D1AA] hover:border-[#C9AA71]/60 hover:bg-[#343226]',
                            )}
                        >
                            {!isAdmin && canViewAllDepartments ? (
                                <Globe className={cn("h-4 w-4 shrink-0", hasActiveDept ? "text-[#1C1B0E]" : "text-sky-400")} />
                            ) : (
                                <Building className={cn("h-4 w-4 shrink-0", hasActiveDept ? "text-[#1C1B0E]" : "text-blue-400")} />
                            )}
                            <span className="truncate max-w-[130px]">{deptFilter !== 'all' ? deptFilter : (t('department') || 'Departemen')}</span>
                            {!isAdmin && canViewAllDepartments && deptFilter === 'all' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-extrabold uppercase">
                                    ALL
                                </span>
                            )}
                            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", hasActiveDept ? "text-[#1C1B0E]" : "text-[#A19F8D]")} />
                        </button>
                    ) : (
                        <div 
                            className="flex items-center gap-2 rounded-xl border border-[#3B3929] bg-[#2A281E] px-3.5 py-2 text-xs font-bold shadow-xs shrink-0"
                            title={userDept ? `Departemen: ${userDept}` : undefined}
                        >
                            <Lock className="h-3.5 w-3.5 text-[#C9AA71]" />
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
                            <span className="text-[11px] text-[#A19F8D] hidden sm:inline">
                                {t('locked_to_department') || 'Cakupan Departemen'}
                            </span>
                        </div>
                    )}

                    {/* Reset button if dept filter active */}
                    {hasActiveDept && (
                        <button
                            type="button"
                            onClick={() => {
                                if (canSelectDept) onDeptChange('all');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent hover:border-[#3B3929] transition-all cursor-pointer"
                            title={lang === 'id' ? 'Reset filter departemen' : 'Reset department filter'}
                        >
                            <RotateCcw className="h-3 w-3 text-[#C9AA71]" />
                            <span>{lang === 'id' ? 'Reset Filter' : 'Reset Filters'}</span>
                        </button>
                    )}
                </div>
            )}

            {/* Department picker sheet */}
            <Sheet open={deptSheetOpen} onOpenChange={setDeptSheetOpen}>
                <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto rounded-t-2xl pb-8">
                    <SheetHeader className="mb-5">
                        <SheetTitle className="flex items-center gap-2">
                            <span>{t('filter_by_department')}</span>
                            {!isAdmin && canViewAllDepartments && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                    {lang === 'id' ? 'Izin Khusus' : 'Special Access'}
                                </span>
                            )}
                        </SheetTitle>
                        <SheetDescription>
                            {!isAdmin && canViewAllDepartments 
                                ? (lang === 'id' ? 'Anda memiliki izin khusus untuk memfilter dan memantau tiket di semua departemen.' : 'You have special permission to filter and monitor tickets in all departments.')
                                : t('filter_by_department_desc')}
                        </SheetDescription>
                    </SheetHeader>

                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                        {/* All departments option */}
                        <button
                            type="button"
                            onClick={() => { onDeptChange('all'); setDeptSheetOpen(false); }}
                            className={cn(
                                'animate-sheet-item flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all duration-200 bg-muted/60 cursor-pointer',
                                deptFilter === 'all'
                                    ? 'ring-2 ring-primary border-primary scale-[0.98]'
                                    : 'hover:scale-[0.98] active:scale-[0.95]',
                            )}
                        >
                            <LayoutGrid className="h-5 w-5 text-foreground" />
                            <span className="text-sm font-semibold leading-tight text-foreground">
                                {t('all_departments')}
                            </span>
                            {deptFilter === 'all' && (
                                <span className="mt-auto text-[10px] font-bold uppercase tracking-wider text-primary">
                                    {t('active_badge')}
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
