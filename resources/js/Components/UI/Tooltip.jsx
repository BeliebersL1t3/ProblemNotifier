import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

/**
 * Luxury Telunas Tooltip Component
 * 
 * @param {string|React.ReactNode} content - Text or component to display inside tooltip
 * @param {React.ReactNode} children - The trigger element
 * @param {'top'|'bottom'|'left'|'right'} position - Preferred position relative to trigger
 * @param {string} className - Extra classes for tooltip content box
 * @param {number} delay - Hover delay in ms before showing
 */
export function Tooltip({ 
    content, 
    children, 
    position = 'top', 
    className = '',
    delay = 150 
}) {
    if (!content) return children;

    const [visible, setVisible] = useState(false);
    const timeoutRef = useRef(null);

    const show = () => {
        timeoutRef.current = setTimeout(() => {
            setVisible(true);
        }, delay);
    };

    const hide = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setVisible(false);
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const positionClasses = {
        top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
        bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
        left: 'right-full top-1/2 -translate-y-1/2 mr-2',
        right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    };

    const arrowClasses = {
        top: 'top-full left-1/2 -translate-x-1/2 border-t-[#3B3929] border-r-transparent border-b-transparent border-l-transparent border-4',
        bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-[#3B3929] border-r-transparent border-t-transparent border-l-transparent border-4',
        left: 'left-full top-1/2 -translate-y-1/2 border-l-[#3B3929] border-t-transparent border-b-transparent border-r-transparent border-4',
        right: 'right-full top-1/2 -translate-y-1/2 border-r-[#3B3929] border-t-transparent border-b-transparent border-l-transparent border-4',
    };

    return (
        <div 
            className="relative inline-flex items-center"
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
        >
            {children}

            {visible && (
                <div
                    role="tooltip"
                    className={cn(
                        'pointer-events-none absolute z-50 whitespace-normal text-center',
                        'px-2.5 py-1.5 rounded-xl border border-[#C9AA71]/30 bg-[#1C1B0E]/95 text-[#FAFAFA]',
                        'text-[11px] font-medium leading-snug shadow-xl backdrop-blur-md',
                        'max-w-xs animate-in fade-in zoom-in-95 duration-150',
                        positionClasses[position],
                        className
                    )}
                    style={{ filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.5))' }}
                >
                    {content}
                    <div 
                        className={cn('absolute w-0 h-0 pointer-events-none', arrowClasses[position])} 
                    />
                </div>
            )}
        </div>
    );
}
