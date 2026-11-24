import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
import { useLeanTheme } from '@/hooks/useLeanTheme';
import { useLanguage } from '@/context/LanguageContext';
import LeanHeader from '@/Components/CampusFix/LeanHeader';
import { LeanAnalyticsView } from '@/Components/CampusFix/LeanAnalyticsView';
import {
    getOutboxCount,
    registerOutboxAutoSync,
} from '@/services/offlineOutbox';
import {
    X,
    MapPin,
    Clock,
    ExternalLink,
} from 'lucide-react';

export default function LeanAnalytics({
    issues = [],
    departments = [],
    locations = [],
    currentUser = null,
    spreadsheetUrl = null,
    monthGids = [],
    needsAutoReconcile = false,
    unconnectedYearAlerts = [],
}) {
    const { theme, isDark } = useLeanTheme();
    const { lang } = useLanguage();
    const isEn = lang === 'en';

    const [activeAnalyticsTab, setActiveAnalyticsTab] = useState('executive');
    const [selectedDetailIssue, setSelectedDetailIssue] = useState(null);

    // Mobile & Offline Outbox State for LeanHeader
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [outboxCount, setOutboxCount] = useState(0);

    useEffect(() => {
        const refreshOutbox = async () => {
            try {
                const count = await getOutboxCount();
                setOutboxCount(count);
            } catch (err) {
                console.warn('[LeanAnalytics] Error fetching outbox count:', err);
            }
        };
        refreshOutbox();
        const cleanupAutoSync = registerOutboxAutoSync(({ isOnline: online, outboxCount: count }) => {
            setIsOnline(online);
            setOutboxCount(count);
        });
        return () => cleanupAutoSync();
    }, []);

    const formatDateTimeId = (isoStr) => {
        if (!isoStr) return '';
        try {
            const localeCode = isEn ? 'en-US' : 'id-ID';
            return new Date(isoStr).toLocaleString(localeCode, {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch (err) {
            return isoStr;
        }
    };

    return (
        <div className={`lean-root ${isDark ? 'lean-theme-dark text-[#F2F3EF]' : 'lean-theme-light text-slate-800'} flex flex-col font-sans pb-12 transition-colors duration-300 w-full max-w-full overflow-x-clip min-h-screen`}>
            <Head title="Analisis Operasional — Telunas Issue Tracker" />
            <LeanHeader
                activePage="analytics"
                viewMode="analytics"
                currentUser={currentUser}
                outboxProps={{
                    outboxCount,
                    isOnline,
                    onOpenOutbox: () => router.visit('/lapangan'),
                }}
            />

            <main className="w-full px-2 sm:px-4 lg:px-8 pt-2 sm:pt-4 flex-1">
                <LeanAnalyticsView
                    issues={issues}
                    departments={departments}
                    theme={theme}
                    activeTab={activeAnalyticsTab}
                    onTabChange={setActiveAnalyticsTab}
                    onSelectIssue={setSelectedDetailIssue}
                    focusMapRequest={(issue) => {
                        if (issue?.id) {
                            router.visit(`/lapangan/peta?focus_map=${issue.id}`);
                        }
                    }}
                    spreadsheetUrl={spreadsheetUrl}
                    monthGids={monthGids}
                    unconnectedYearAlerts={unconnectedYearAlerts}
                />
            </main>

            {/* DETAIL MODAL FROM ANALYTICS SELECTION */}
            {selectedDetailIssue && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className={`w-full max-w-lg border rounded-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden liquid-glass-modal ${
                        isDark ? 'liquid-glass-dark' : 'liquid-glass-light'
                    }`}>
                        <div className={`p-4 border-b flex items-start justify-between gap-3 ${
                            isDark ? 'border-slate-800' : 'border-slate-200'
                        }`}>
                            <div className="space-y-1 min-w-0">
                                <span className={`font-mono font-bold text-xs ${
                                    isDark ? 'text-amber-300' : 'text-amber-700'
                                }`}>
                                    #{selectedDetailIssue.issue_code || ('LEAN-' + selectedDetailIssue.id)}
                                </span>
                                <h3 className={`font-bold text-base leading-snug truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {selectedDetailIssue.title}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedDetailIssue(null)}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                                    isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
                            <div className="grid grid-cols-2 gap-2">
                                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                                    <span className="text-[10px] text-slate-400 block">{isEn ? 'Location' : 'Lokasi'}</span>
                                    <span className={`font-bold flex items-center gap-1 mt-0.5 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                        <MapPin className="w-3.5 h-3.5" />
                                        {selectedDetailIssue.location}
                                    </span>
                                </div>
                                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                                    <span className="text-[10px] text-slate-400 block">{isEn ? 'Created At' : 'Dilaporkan'}</span>
                                    <span className="font-bold flex items-center gap-1 mt-0.5">
                                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                                        {formatDateTimeId(selectedDetailIssue.created_at)}
                                    </span>
                                </div>
                            </div>

                            {selectedDetailIssue.description && (
                                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800/50 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
                                    <p className="text-[11px] font-bold text-slate-400 mb-1">{isEn ? 'Description' : 'Deskripsi Masalah'}</p>
                                    <p className="leading-relaxed whitespace-pre-wrap">{selectedDetailIssue.description}</p>
                                </div>
                            )}

                            <div className="flex items-center gap-2 pt-2">
                                {selectedDetailIssue.map_x != null && selectedDetailIssue.map_y != null && (
                                    <button
                                        type="button"
                                        onClick={() => router.visit(`/lapangan/peta?focus_map=${selectedDetailIssue.id}`)}
                                        className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                                    >
                                        <MapPin className="w-3.5 h-3.5" />
                                        <span>{isEn ? 'View on Map' : 'Lihat di Peta'}</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => router.visit(`/lapangan?issue=${selectedDetailIssue.id}`)}
                                    className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>{isEn ? 'Open in Dashboard' : 'Buka di Dashboard'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
