import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function Sheet({ open, onOpenChange, children }) {
    return (
        <SheetContext.Provider value={{ open, onOpenChange }}>
            {children}
        </SheetContext.Provider>
    );
}

import { createContext, useContext, useState } from 'react';
const SheetContext = createContext(null);

export function SheetContent({ children, side = 'right', className, ...props }) {
    const { open, onOpenChange } = useContext(SheetContext);
    const [mounted, setMounted] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (open) {
            setMounted(true);
            const raf1 = requestAnimationFrame(() => {
                const raf2 = requestAnimationFrame(() => {
                    setVisible(true);
                });
                return () => cancelAnimationFrame(raf2);
            });
            return () => cancelAnimationFrame(raf1);
        } else {
            setVisible(false);
            const timer = setTimeout(() => {
                setMounted(false);
            }, 700);
            return () => clearTimeout(timer);
        }
    }, [open]);

    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') onOpenChange(false);
        };
        if (open) {
            document.addEventListener('keydown', handleKey);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = '';
        };
    }, [open, onOpenChange]);

    if (!mounted) return null;

    const sideStyles = {
        bottom: visible
            ? 'translate-y-0 opacity-100'
            : 'translate-y-full opacity-0',
        right: visible
            ? 'translate-x-0 opacity-100'
            : 'translate-x-full opacity-0',
        left: visible
            ? 'translate-x-0 opacity-100'
            : '-translate-x-full opacity-0',
    }[side];

    const baseSideClasses = {
        bottom: 'bottom-0 left-0 right-0 w-full border-t rounded-t-3xl shadow-2xl',
        right: 'right-0 top-0 h-full border-l shadow-2xl w-full sm:max-w-md',
        left: 'left-0 top-0 h-full border-r shadow-2xl w-full sm:max-w-md',
    }[side];

    return createPortal(
        <>
            {/* Backdrop with smooth blur & fade */}
            <div
                onClick={() => onOpenChange(false)}
                className={cn(
                    'fixed inset-0 z-50 bg-black/60 backdrop-blur-md transition-opacity duration-600 ease-out cursor-pointer',
                    visible ? 'opacity-100' : 'opacity-0'
                )}
            />

            {/* Sheet drawer with smooth cubic-bezier physics */}
            <div
                className={cn(
                    'fixed z-50 bg-surface border-border transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] transform',
                    baseSideClasses,
                    sideStyles,
                    className
                )}
                {...props}
            >
                {/* Visual Pull / Drag Handle for Bottom Sheet */}
                {side === 'bottom' && (
                    <div 
                        className="w-full flex items-center justify-center pt-3 pb-1 cursor-pointer select-none" 
                        onClick={() => onOpenChange(false)}
                        title="Tutup / Close"
                    >
                        <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/50 transition-colors" />
                    </div>
                )}

                <button
                    onClick={() => onOpenChange(false)}
                    className="absolute right-4 top-4 z-10 rounded-full p-2 text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted transition-colors cursor-pointer"
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </button>
                {children}
            </div>
        </>,
        document.body,
    );
}

export function SheetHeader({ className, ...props }) {
    return <div className={cn('flex flex-col gap-1.5 p-6 pb-0', className)} {...props} />;
}

export function SheetTitle({ className, ...props }) {
    return <h2 className={cn('text-lg font-semibold text-foreground', className)} {...props} />;
}

export function SheetDescription({ className, ...props }) {
    return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
