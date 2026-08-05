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

import { createContext, useContext } from 'react';
const SheetContext = createContext(null);

export function SheetContent({ children, side = 'right', className, ...props }) {
    const { open, onOpenChange } = useContext(SheetContext);
    const overlayRef = useRef(null);

    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') onOpenChange(false);
        };
        if (open) document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [open, onOpenChange]);

    if (!open) return null;

    const sideClass = {
        right: 'right-0 top-0 h-full border-l translate-x-full data-open:translate-x-0',
        left: 'left-0 top-0 h-full border-r -translate-x-full data-open:translate-x-0',
    }[side];

    return createPortal(
        <>
            <div
                ref={overlayRef}
                onClick={() => onOpenChange(false)}
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            />
            <div
                className={cn(
                    'fixed z-50 bg-surface shadow-xl transition-transform duration-300 w-full sm:max-w-md',
                    sideClass,
                    className,
                )}
                {...props}
            >
                <button
                    onClick={() => onOpenChange(false)}
                    className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:text-foreground"
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
