import React from 'react';
import { CalendarClock, AlertCircle } from 'lucide-react';
import { getDepartmentTheme } from '@/constants/departments';
import { useLanguage } from '@/context/LanguageContext';

function formatDateDisplay(dateStr, lang = 'id') {
    if (!dateStr) return '';
    try {
        const parts = String(dateStr).split('T')[0].split('-');
        if (parts.length === 3) {
            const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            }).format(d);
        }
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? dateStr : new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        }).format(d);
    } catch {
        return dateStr;
    }
}

export function DepartmentScheduleWarning({ conflictsByDept = {}, className = '' }) {
    const { t, lang } = useLanguage();
    const depts = Object.keys(conflictsByDept);

    if (depts.length === 0) return null;

    return (
        <div className={`rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2.5 transition-all shadow-sm ${className}`}>
            <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-amber-400 shrink-0" />
                <span className="text-xs font-bold text-amber-200">
                    {t('schedule_conflict_title')}
                </span>
            </div>

            <p className="text-xs text-amber-100/80 leading-relaxed">
                {t('schedule_conflict_desc')}
            </p>

            <div className="space-y-2 pt-1">
                {depts.map(dept => {
                    const tasks = conflictsByDept[dept] || [];
                    const theme = getDepartmentTheme(dept);

                    return (
                        <div key={dept} className="rounded-lg border border-amber-500/20 bg-[#1C1B0E]/80 p-2.5 space-y-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                    className="px-2 py-0.5 rounded text-[11px] font-bold border flex items-center gap-1 shrink-0"
                                    style={{
                                        backgroundColor: theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.12)' : `${theme.bg}25`,
                                        borderColor: theme.bg === '#212121' ? 'rgba(255, 255, 255, 0.35)' : `${theme.bg}80`,
                                        color: theme.bg === '#212121' ? '#FFFFFF' : (theme.text === '#14130B' ? '#FBBF24' : theme.bg)
                                    }}
                                >
                                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: theme.bg }} />
                                    <span>🎯</span> {dept}
                                </span>
                                <span className="text-[11px] text-[#A19F8D]">
                                    ({tasks.length} {t('active_task')})
                                </span>
                            </div>

                            <ul className="space-y-1 pl-1 text-xs">
                                {tasks.map((task, idx) => {
                                    const startFormatted = formatDateDisplay(task.startDate, lang);
                                    const endFormatted = task.endDate && task.endDate !== task.startDate
                                        ? formatDateDisplay(task.endDate, lang)
                                        : null;

                                    return (
                                        <li key={task.taskId || idx} className="text-amber-200/90 flex items-start gap-1.5">
                                            <span className="text-[#C9AA71] font-bold shrink-0">•</span>
                                            <div className="min-w-0 flex-1">
                                                <span className="font-semibold text-white">"{task.title}"</span>
                                                <span className="text-[11px] text-[#A19F8D] ml-1.5 whitespace-nowrap">
                                                    ({endFormatted ? `${startFormatted} – ${endFormatted}` : startFormatted})
                                                </span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
