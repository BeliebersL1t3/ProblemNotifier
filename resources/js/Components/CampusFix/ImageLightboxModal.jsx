import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, ZoomIn, Download } from 'lucide-react';

export function ImageLightboxModal({ src, alt = 'Image preview', title, subtitle, open, onClose }) {
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose?.();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open || !src) return null;

    return createPortal(
        <div 
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onClose?.();
                }
            }}
        >
            <div className="relative flex flex-col w-full max-w-5xl max-h-[92vh] bg-[#14130E] border border-[#3B3929] shadow-2xl rounded-2xl overflow-hidden text-[#FAFAFA]">
                {/* Header bar */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#3B3929]/70 bg-[#1E1D16]">
                    <div className="flex flex-col min-w-0 pr-4">
                        {title && (
                            <span className="font-bold text-base text-[#FAFAFA] truncate">
                                {title}
                            </span>
                        )}
                        {subtitle && (
                            <span className="text-xs text-[#C9AA71] font-semibold flex items-center gap-1.5 mt-0.5">
                                <ZoomIn className="w-3.5 h-3.5" />
                                {subtitle}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <a
                            href={src}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2A281E] hover:bg-[#3B3929] text-[#C9AA71] hover:text-[#FAFAFA] transition-colors border border-[#3B3929] shadow-sm"
                            title="Buka gambar ukuran asli di tab baru"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Buka Tab Baru</span>
                        </a>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-lg bg-[#2A281E] hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors border border-[#3B3929] cursor-pointer"
                            title="Tutup (Esc)"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Main Full Image Area */}
                <div 
                    className="relative flex-1 flex items-center justify-center p-3 sm:p-5 bg-black/80 overflow-auto min-h-[320px] max-h-[80vh]"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            onClose?.();
                        }
                    }}
                >
                    <img
                        src={src}
                        alt={alt}
                        className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg shadow-2xl transition-transform duration-200 select-none"
                    />
                </div>
            </div>
        </div>,
        document.body
    );
}
