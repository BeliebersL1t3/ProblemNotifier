import React from 'react';
import { getDepartmentTheme } from '@/constants/departments';

/**
  * SubdivisionTag — displays a distinct tag differentiating sub-units within large departments.
  * 
  * Examples:
  * - department="HR", subdivision="Legal" => [HR • Legal]
  * - department="GR", subdivision="Spa"   => [GR • Spa]
  * - department="Reservasi", subdivision="Sales" => [Reservasi • Sales]
  * - department="Fasilitas", subdivision="Security" => [Fasilitas • Security]
  */
export default function SubdivisionTag({ department, subdivision, size = 'sm', className = '' }) {
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

    return (
        <span 
            className={`inline-flex items-center rounded-full font-bold tracking-wide shadow-sm border ${sizeClasses} ${className}`}
            style={{ 
                backgroundColor: `${theme.bg}22`,
                borderColor: `${theme.bg}55`,
                color: theme.bg === '#212121' ? '#FAFAFA' : theme.bg
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
                        className="font-semibold text-white/90 px-1.5 py-0.2 rounded bg-black/30 text-[11px] tracking-normal"
                        style={{ borderLeft: `2px solid ${theme.bg}` }}
                    >
                        {subDept}
                    </span>
                </>
            )}
        </span>
    );
}
