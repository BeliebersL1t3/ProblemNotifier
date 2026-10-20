import { useState, useEffect } from 'react';
import { BellRing, AlertTriangle, X, ExternalLink } from 'lucide-react';
import { router } from '@inertiajs/react';

export default function NotificationToast() {
    const [toasts, setToasts] = useState([]);

    useEffect(() => {
        const handleToastEvent = (e) => {
            // Respect user preference for browser pop-up toasts
            try {
                const isPopupEnabled = localStorage.getItem('campusfix_browser_popup_enabled') !== 'false';
                if (!isPopupEnabled) return;
            } catch (err) {}

            const { notification, isEmergency } = e.detail || {};
            if (!notification) return;

            const id = `${notification.id || Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
            const newToast = {
                id,
                notification,
                isEmergency: !!isEmergency,
                timestamp: Date.now(),
            };

            setToasts((prev) => [newToast, ...prev].slice(0, 3)); // Max 3 toasts at once

            // Auto dismiss after 7 seconds
            setTimeout(() => {
                setToasts((current) => current.filter((t) => t.id !== id));
            }, 7000);
        };

        window.addEventListener('campusfix-toast-notification', handleToastEvent);
        return () => window.removeEventListener('campusfix-toast-notification', handleToastEvent);
    }, []);

    const dismissToast = (id) => {
        setToasts((current) => current.filter((t) => t.id !== id));
    };

    const handleClickToast = (item, isEmergency) => {
        if (!item) return;

        // Extract issue ID if present
        let issueId = null;
        let sheet = null;
        if (item.link) {
            try {
                const u = new URL(item.link, window.location.origin);
                issueId = u.searchParams.get('issue') || u.searchParams.get('id') || u.searchParams.get('search');
                sheet = u.searchParams.get('sheet');
            } catch (e) {}
        }

        const isAlreadyOnDashboard = window.location.pathname === '/' || window.location.pathname === '/dashboard';
        if (issueId && isAlreadyOnDashboard) {
            window.dispatchEvent(new CustomEvent('campusfix-open-issue', {
                detail: { issueId, sheet }
            }));
        } else if (item.link) {
            router.visit(item.link);
        }
    };

    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-20 right-3 sm:right-6 z-50 flex flex-col gap-2.5 max-w-sm w-[calc(100vw-24px)] sm:w-96 pointer-events-none">
            {toasts.map(({ id, notification, isEmergency }) => (
                <div
                    key={id}
                    className={`pointer-events-auto rounded-2xl p-4 shadow-2xl border backdrop-blur-md transition-all duration-300 animate-in slide-in-from-top-3 fade-in ${
                        isEmergency
                            ? 'bg-red-950/95 border-red-500/60 text-white shadow-red-950/40 ring-1 ring-red-500/30'
                            : 'bg-[#2A281E]/95 border-[#C9AA71]/50 text-[#FAFAFA] shadow-black/60 ring-1 ring-[#C9AA71]/20'
                    }`}
                    role="alert"
                >
                    <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                                isEmergency
                                    ? 'bg-red-600/30 border-red-400 text-red-300 animate-pulse'
                                    : 'bg-[#C9AA71]/20 border-[#C9AA71]/40 text-[#E3D1AA]'
                            }`}
                        >
                            {isEmergency ? (
                                <AlertTriangle className="w-5 h-5" />
                            ) : (
                                <BellRing className="w-5 h-5 animate-bounce" />
                            )}
                        </div>

                        {/* Text Content */}
                        <div className="flex-1 min-w-0 pr-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                    isEmergency ? 'bg-red-500/30 text-red-200' : 'bg-[#C9AA71]/20 text-[#E3D1AA]'
                                }`}>
                                    {isEmergency ? '🚨 Darurat (SOS)' : '🔔 Notifikasi Baru'}
                                </span>
                            </div>
                            <h4 className="text-xs sm:text-sm font-bold mt-1 text-white leading-snug truncate">
                                {notification.title || 'Pemberitahuan Baru'}
                            </h4>
                            <p className="text-[11px] text-[#D4D2C5] mt-0.5 line-clamp-2 leading-relaxed">
                                {notification.message || 'Ada tiket atau tugas baru yang memerlukan perhatian.'}
                            </p>

                            {/* Action Buttons */}
                            <div className="mt-2.5 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        handleClickToast(notification, isEmergency);
                                        dismissToast(id);
                                    }}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                        isEmergency
                                            ? 'bg-red-600 hover:bg-red-500 text-white shadow-md'
                                            : 'bg-[#C9AA71] hover:bg-[#D4B982] text-[#1C1B0E] shadow-md'
                                    }`}
                                >
                                    <span>Lihat</span>
                                    <ExternalLink className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => dismissToast(id)}
                                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-[#A19F8D] hover:text-white transition-colors cursor-pointer"
                                >
                                    Tutup
                                </button>
                            </div>
                        </div>

                        {/* Top Close Button */}
                        <button
                            type="button"
                            onClick={() => dismissToast(id)}
                            className="text-[#A19F8D] hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
                            title="Tutup Notifikasi"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
