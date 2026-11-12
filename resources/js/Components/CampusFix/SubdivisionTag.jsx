import React from 'react';
import { getDepartmentTheme } from '@/constants/departments';
import { useLeanTheme } from '@/hooks/useLeanTheme';

/**
 * SubdivisionTag — displays a distinct tag differentiating sub-units within large departments.
 */
export default function SubdivisionTag({ department, subdivision, size = 'sm', className = '' }) {
    const { isDark } = useLeanTheme();
    if (!department && !subdivision) return null;

    const mainDept = department || '';
    const subDept = subdivision || '';
    const theme = getDepartmentTheme(mainDept);

    const isSame = mainDept.toLowerCase().trim() === subDept.toLowerCase().trim();
    const hasDistinctSub = subDept && !isSame;

    const sizeClasses = {
        xs: 'text-[10px] px-1.5 py-0.5 gap-1',
        sm: 'text-xs px-2 py-0.5 gap-1.5',
        md: 'text-sm px-2.5 py-1 gap-2',
    }[size] || 'text-xs px-2 py-0.5 gap-1.5';

    const resolvedColor =
        theme.bg === '#212121'
            ? isDark
                ? '#e2e8f0'
                : '#1e293b'
            : theme.bg;

    return (
        <span
            className={`inline-flex items-center rounded-full font-bold tracking-wide shadow-xs border ${sizeClasses} ${className}`}
            style={{
                backgroundColor: isDark ? `${theme.bg}22` : `${theme.bg}15`,
                borderColor: isDark ? `${theme.bg}55` : `${theme.bg}45`,
                color: resolvedColor,
            }}
            title={`${mainDept}${hasDistinctSub ? ` — Sub-unit: ${subDept}` : ''}`}
        >
            <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: theme.bg }}
            />
            <span className="uppercase font-extrabold">{mainDept}</span>
            {hasDistinctSub && (
                <>
                    <span className="opacity-40 text-[10px]">/</span>
                    <span
                        className={`font-semibold px-1.5 py-0.2 rounded text-[11px] tracking-normal ${
                            isDark ? 'text-slate-100 bg-slate-950/60' : 'text-slate-800 bg-white/80'
                        }`}
                        style={{ borderLeft: `2px solid ${theme.bg}` }}
                    >
                        {subDept}
                    </span>
                </>
            )}
        </span>
    );
}
