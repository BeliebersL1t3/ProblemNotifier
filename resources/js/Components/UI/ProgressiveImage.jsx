import React, { useState, useEffect } from 'react';
import { Loader2, RefreshCw, AlertCircle, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

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
                "relative overflow-hidden flex items-center justify-center select-none bg-[#14130E]",
                containerClassName
            )}
            onClick={onClick}
        >
            {/* 1. SKELETON SHIMMER / LOADING STATE */}
            {status === 'loading' && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#1E1D16]/90 backdrop-blur-xs transition-opacity duration-300 pointer-events-none">
                    {/* Shimmer gradient strip */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse pointer-events-none" />
                    
                    {showLoader && (
                        <div className="relative flex flex-col items-center gap-2 p-3 text-center">
                            <Loader2 className="w-5 h-5 text-[#C9AA71] animate-spin opacity-90" />
                            <span className="text-[11px] font-medium tracking-wide text-[#C9AA71]/80 select-none">
                                Memuat foto...
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* 2. ERROR STATE (Koneksi putus / Foto gagal diunduh) */}
            {status === 'error' && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-3 text-center bg-[#1E1D16]/95 border border-red-500/20 rounded-lg">
                    <div className="p-2 mb-1.5 rounded-full bg-red-500/10 text-red-400">
                        <ImageOff className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-medium text-foreground/80 mb-2 max-w-[200px] truncate">
                        Gagal memuat foto
                    </p>
                    {showRetry && src && (
                        <button
                            type="button"
                            onClick={handleManualRetry}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-[#2A281E] hover:bg-[#3B3929] text-[#C9AA71] hover:text-[#FAFAFA] border border-[#3B3929] transition-colors cursor-pointer shadow-sm active:scale-95"
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
