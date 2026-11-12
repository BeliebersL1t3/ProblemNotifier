import { useState, useEffect } from 'react';
import { BellRing, AlertTriangle, X, ExternalLink } from 'lucide-react';
import { router } from '@inertiajs/react';
import { useLeanTheme } from '@/hooks/useLeanTheme';

export default function NotificationToast() {
    const [toasts, setToasts] = useState([]);
    const { isDark } = useLeanTheme();

    useEffect(() => {
        const handleToastEvent = (e) => {
            // Respect user preference for browser pop-up toasts
            try {
                const isPopupEnabled = localStorage.getItem('campusfix_browser_popup_enabled') !== 'false';
                if (!isPopupEnabled) return;
            } catch (err) {
                console.warn('[NotificationToast] Unable to read localStorage popup preference:', err);
            }

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
            } catch (e) {
                console.warn('[NotificationToast] Invalid toast notification URL:', item.link, e);
            }
        }

        const isAlreadyOnDashboard = window.location.pathname === '/' || window.location.pathname === '/lapangan';
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
                            ? isDark
                                ? 'bg-rose-950/95 border-rose-500/60 text-white shadow-rose-950/40 ring-1 ring-rose-500/30'
                                : 'bg-rose-50/95 border-rose-300 text-rose-950 shadow-rose-200/60 ring-1 ring-rose-500/20'
                            : isDark
                                ? 'bg-slate-900/95 border-emerald-500/40 text-slate-100 shadow-black/60 ring-1 ring-emerald-500/20'
                                : 'bg-white/95 border-emerald-200 text-slate-900 shadow-slate-200/70 ring-1 ring-emerald-500/15'
                    }`}
                    role="alert"
                >
                    <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                                isEmergency
                                    ? isDark
                                        ? 'bg-rose-600/30 border-rose-400 text-rose-300 animate-pulse'
                                        : 'bg-rose-100 border-rose-300 text-rose-600 animate-pulse'
                                    : isDark
                                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                        : 'bg-emerald-50 border-emerald-200 text-emerald-600'
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
                                <span
                                    className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                        isEmergency
                                            ? isDark
                                                ? 'bg-rose-500/30 text-rose-200'
                                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                                            : isDark
                                                ? 'bg-emerald-500/20 text-emerald-300'
                                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    }`}
                                >
                                    {isEmergency ? '🚨 Darurat (SOS)' : '🔔 Notifikasi Baru'}
                                </span>
                            </div>
                            <h4
                                className={`text-xs sm:text-sm font-bold mt-1 leading-snug truncate ${
                                    isDark ? 'text-white' : 'text-slate-900'
                                }`}
                            >
                                {notification.title || 'Pemberitahuan Baru'}
                            </h4>
                            <p
                                className={`text-[11px] mt-0.5 line-clamp-2 leading-relaxed ${
                                    isEmergency
                                        ? isDark
                                            ? 'text-rose-100/90'
                                            : 'text-rose-800'
                                        : isDark
                                            ? 'text-slate-300'
                                            : 'text-slate-600'
                                }`}
                            >
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
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-sm ${
                                        isEmergency
                                            ? 'bg-rose-600 hover:bg-rose-500 text-white keep-white'
                                            : 'bg-emerald-600 hover:bg-emerald-500 text-white keep-white'
                                    }`}
                                >
                                    <span>Lihat</span>
                                    <ExternalLink className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => dismissToast(id)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                        isDark
                                            ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                    }`}
                                >
                                    Tutup
                                </button>
                            </div>
                        </div>

                        {/* Top Close Button */}
                        <button
                            type="button"
                            onClick={() => dismissToast(id)}
                            className={`p-1 rounded-lg transition-colors shrink-0 cursor-pointer ${
                                isDark
                                    ? 'text-slate-400 hover:text-white hover:bg-white/10'
                                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                            }`}
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
