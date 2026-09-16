import React from 'react';
import { Wifi, CheckCircle2, Clock, X } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export function OfflineSyncToast({ toast, onDismiss }) {
    const { lang } = useLanguage();

    if (!toast || !toast.items || toast.items.length === 0) return null;

    return (
        <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 max-w-md w-[calc(100vw-2rem)] sm:w-96 bg-[#1E1D16] border border-amber-500/40 rounded-xl shadow-2xl p-4 animate-in fade-in slide-in-from-bottom-5 duration-300">
            <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 mt-0.5">
                    <Wifi className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                            <span>{lang === 'id' ? 'Koneksi Pulih: Laporan Terkirim!' : 'Wi-Fi Restored: Report Sent!'}</span>
                        </h4>
                        <button
                            type="button"
                            onClick={onDismiss}
                            className="text-stone-400 hover:text-white p-1 -mr-1 rounded-md transition-colors"
                            aria-label="Close"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto pr-1">
                        {toast.items.map((item, idx) => (
                            <div key={idx} className="text-xs bg-[#2A281E]/60 p-2 rounded-lg border border-[#3B3929]/50">
                                <p className="font-semibold text-foreground truncate">
                                    "{item.title}"
                                </p>
                                <div className="flex items-center gap-1 text-[11px] text-amber-300 font-mono mt-0.5">
                                    <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                                    <span>
                                        {lang === 'id'
                                            ? `Berhasil disinkronkan (+${item.delayText} tertunda)`
                                            : `Synced to server (+${item.delayText} delayed)`}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="mt-2 text-[10px] text-stone-400">
                        {lang === 'id'
                            ? 'Laporan yang tertahan di antrean offline telah diterima server dengan aman.'
                            : 'Reports queued while offline have been safely saved to the server.'}
                    </p>
                </div>
            </div>
        </div>
    );
}
