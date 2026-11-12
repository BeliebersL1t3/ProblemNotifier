import React, { useState, useEffect } from 'react';
import { Loader2, RefreshCw, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLeanTheme } from '@/hooks/useLeanTheme';

const DEFAULT_FALLBACK = '/barrier-placeholder.svg';

/**
 * ProgressiveImage
 * Komponen gambar tangguh untuk koneksi pulau / Wi-Fi lambat.
 * Mendukung skeleton shimmer loading, transisi fade-in mulus, dan penanganan retry interaktif.
 */
export function ProgressiveImage({
    src,
    alt = '',
    className,
    containerClassName,
    fallbackSrc = DEFAULT_FALLBACK,
    showLoader = true,
    showRetry = true,
    maxRetries = 2,
    onLoad,
    onError,
    onClick,
    ...props
}) {
    const { isDark } = useLeanTheme();
    const [status, setStatus] = useState('loading'); // 'loading' | 'loaded' | 'error'
    const [currentSrc, setCurrentSrc] = useState(src || fallbackSrc);
    const [retryCount, setRetryCount] = useState(0);

    // Reset saat URL prop `src` berganti
    useEffect(() => {
        if (!src) {
            setStatus('error');
            setCurrentSrc(fallbackSrc);
            return;
        }
        setStatus('loading');
        setCurrentSrc(src);
        setRetryCount(0);
    }, [src, fallbackSrc]);

    const handleLoad = (e) => {
        setStatus('loaded');
        onLoad?.(e);
    };

    const handleError = (e) => {
        if (retryCount < maxRetries) {
            // Auto-retry dengan delay singkat untuk fluktuasi sinyal
            const nextRetry = retryCount + 1;
            setRetryCount(nextRetry);
            setTimeout(() => {
                const sep = (src || '').includes('?') ? '&' : '?';
                setCurrentSrc(`${src}${sep}_retry=${nextRetry}_${Date.now()}`);
            }, 1200 * nextRetry);
        } else {
            setStatus('error');
            onError?.(e);
        }
    };

    const handleManualRetry = (e) => {
        e.stopPropagation();
        setStatus('loading');
        setRetryCount(0);
        const sep = (src || '').includes('?') ? '&' : '?';
        setCurrentSrc(`${src}${sep}_retry=${Date.now()}`);
    };

    return (
        <div
            className={cn(
                "relative overflow-hidden flex items-center justify-center select-none",
                isDark ? "bg-slate-950" : "bg-slate-100",
                containerClassName
            )}
            onClick={onClick}
        >
            {/* 1. SKELETON SHIMMER / LOADING STATE */}
            {status === 'loading' && (
                <div className={cn(
                    "absolute inset-0 z-10 flex flex-col items-center justify-center backdrop-blur-xs transition-opacity duration-300 pointer-events-none",
                    isDark ? "bg-slate-900/90" : "bg-slate-100/90"
                )}>
                    {/* Shimmer gradient strip */}
                    <div className={cn(
                        "absolute inset-0 bg-gradient-to-r from-transparent to-transparent animate-pulse pointer-events-none",
                        isDark ? "via-white/5" : "via-slate-300/40"
                    )} />
                    
                    {showLoader && (
                        <div className="relative flex flex-col items-center gap-2 p-3 text-center">
                            <Loader2 className={cn("w-5 h-5 animate-spin opacity-90", isDark ? "text-emerald-400" : "text-emerald-600")} />
                            <span className={cn("text-[11px] font-medium tracking-wide select-none", isDark ? "text-emerald-300/80" : "text-emerald-700")}>
                                Memuat foto...
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* 2. ERROR STATE (Koneksi putus / Foto gagal diunduh) */}
            {status === 'error' && (
                <div className={cn(
                    "absolute inset-0 z-10 flex flex-col items-center justify-center p-3 text-center border rounded-lg",
                    isDark ? "bg-slate-900/95 border-rose-500/20" : "bg-slate-50/95 border-rose-200"
                )}>
                    <div className={cn("p-2 mb-1.5 rounded-full", isDark ? "bg-rose-500/10 text-rose-400" : "bg-rose-100 text-rose-600")}>
                        <ImageOff className="w-5 h-5" />
                    </div>
                    <p className={cn("text-xs font-medium mb-2 max-w-[200px] truncate", isDark ? "text-slate-300" : "text-slate-600")}>
                        Gagal memuat foto
                    </p>
                    {showRetry && src && (
                        <button
                            type="button"
                            onClick={handleManualRetry}
                            className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors cursor-pointer shadow-sm active:scale-95",
                                isDark
                                    ? "bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-white border-slate-700"
                                    : "bg-white hover:bg-slate-50 text-emerald-700 border-slate-300"
                            )}
                        >
                            <RefreshCw className="w-3 h-3" />
                            <span>Coba Lagi</span>
                        </button>
                    )}
                </div>
            )}

            {/* 3. ACTUAL IMAGE TAG */}
            <img
                src={currentSrc}
                alt={alt}
                loading="lazy"
                onLoad={handleLoad}
                onError={handleError}
                className={cn(
                    "transition-opacity duration-300 ease-in-out",
                    status === 'loaded' ? 'opacity-100' : 'opacity-0 pointer-events-none',
                    className
                )}
                {...props}
            />
        </div>
    );
}

export default ProgressiveImage;
