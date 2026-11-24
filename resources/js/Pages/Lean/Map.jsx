import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Head, router } from '@inertiajs/react';
import { useLeanTheme } from '@/hooks/useLeanTheme';
import { useLanguage } from '@/context/LanguageContext';
import LeanHeader from '@/Components/CampusFix/LeanHeader';
import LeanInteractiveMapView from '@/Components/CampusFix/LeanInteractiveMapView';
import {
    getOutboxCount,
    getOutboxTickets,
    registerOutboxAutoSync,
} from '@/services/offlineOutbox';
import {
    X,
    MapPin,
    Calendar,
    User,
    Users,
    CheckCircle2,
    Clock,
    AlertTriangle,
    History,
    MessageSquare,
    ExternalLink,
    Lock,
    PauseCircle,
    Play,
    ArrowRightLeft,
    Wrench,
} from 'lucide-react';
import axios from 'axios';

export default function LeanMap({
    issues = [],
    departments = [],
    locations = [],
    currentUser = null,
    staffDirectory = [],
    spreadsheetUrl = null,
    monthGids = [],
    needsAutoReconcile = false,
    unconnectedYearAlerts = [],
}) {
    const { theme, isDark } = useLeanTheme();
    const { lang } = useLanguage();
    const isEn = lang === 'en';

    const [focusedMapIssueId, setFocusedMapIssueId] = useState(null);
    const [pendingPinIssue, setPendingPinIssue] = useState(null);
    const [selectedDetailIssue, setSelectedDetailIssue] = useState(null);

    // Mobile & Offline Outbox State for LeanHeader
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [outboxCount, setOutboxCount] = useState(0);

    const refreshOutbox = async () => {
        try {
            const count = await getOutboxCount();
            setOutboxCount(count);
        } catch (err) {
            console.warn('[LeanMap] Error fetching outbox count:', err);
        }
    };

    useEffect(() => {
        refreshOutbox();
        const cleanupAutoSync = registerOutboxAutoSync(({ isOnline: online, outboxCount: count }) => {
            setIsOnline(online);
            setOutboxCount(count);
        });
        return () => cleanupAutoSync();
    }, []);

    // Read URL params: ?focus_map=ID or ?pin_issue=ID
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        const params = url.searchParams;
        let shouldClean = false;

        const focusParam = params.get('focus_map') || params.get('map_issue');
        if (focusParam) {
            setFocusedMapIssueId(focusParam);
            params.delete('focus_map');
            params.delete('map_issue');
            shouldClean = true;
        }

        const pinParam = params.get('pin_issue');
        if (pinParam) {
            const target = issues.find(i => String(i.id) === String(pinParam) || (i.issue_code && i.issue_code.toLowerCase() === pinParam.toLowerCase()));
            if (target) {
                setPendingPinIssue(target);
            }
            params.delete('pin_issue');
            shouldClean = true;
        }

        if (shouldClean) {
            const nextSearch = params.toString();
            const cleanPath = url.pathname + (nextSearch ? `?${nextSearch}` : '') + url.hash;
            window.history.replaceState(window.history.state, '', cleanPath);
        }
    }, [issues]);

    // Formatters
    const formatDeptDisplay = (dept) => {
        if (!dept) return dept;
        if (isEn && (dept === 'Umum' || dept === 'Lainnya')) return 'General';
        return dept;
    };

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

    const activeDetailIssue = useMemo(() => {
        if (!selectedDetailIssue) return null;
        return issues.find((i) => i.id === selectedDetailIssue.id) || selectedDetailIssue;
    }, [issues, selectedDetailIssue]);

    // Handle Open Create Issue from Map -> navigate to dashboard with prefilled query
    const handleOpenCreateIssueFromMap = ({ resort, x, y, label }) => {
        const query = new URLSearchParams();
        query.set('report', '1');
        if (resort) query.set('map_resort', resort);
        if (x !== null && x !== undefined) query.set('map_x', String(x));
        if (y !== null && y !== undefined) query.set('map_y', String(y));
        if (label) query.set('map_label', label);
        router.visit(`/lapangan?${query.toString()}`);
    };

    return (
        <div className={`lean-root ${isDark ? 'lean-theme-dark text-[#F2F3EF]' : 'lean-theme-light text-slate-800'} flex flex-col font-sans pb-12 transition-colors duration-300 w-full max-w-full overflow-x-clip min-h-screen`}>
            <Head title="Peta Denah — Telunas Issue Tracker" />
            <LeanHeader
                activePage="map"
                viewMode="map"
                currentUser={currentUser}
                outboxProps={{
                    outboxCount,
                    isOnline,
                    onOpenOutbox: () => router.visit('/lapangan'),
                }}
            />

            <main className="w-full px-2 sm:px-4 lg:px-8 pt-2 sm:pt-4 flex-1">
                <LeanInteractiveMapView
                    issues={issues}
                    currentUser={currentUser}
                    onSelectIssue={setSelectedDetailIssue}
                    onOpenCreateIssue={handleOpenCreateIssueFromMap}
                    focusedIssueId={focusedMapIssueId}
                    onClearFocusIssue={() => setFocusedMapIssueId(null)}
                    initialPendingPinIssue={pendingPinIssue}
                    onClearPendingPinIssue={() => setPendingPinIssue(null)}
                    isDark={isDark}
                    isEn={isEn}
                />
            </main>

            {/* DETAIL MODAL FROM MAP SELECTION */}
            {activeDetailIssue && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className={`w-full max-w-lg border rounded-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden liquid-glass-modal ${
                        isDark ? 'liquid-glass-dark' : 'liquid-glass-light'
                    }`}>
                        {/* Header */}
                        <div className={`p-4 border-b flex items-start justify-between gap-3 ${
                            isDark ? 'border-slate-800' : 'border-slate-200'
                        }`}>
                            <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`font-mono font-bold text-xs ${
                                        isDark ? 'text-amber-300' : 'text-amber-700'
                                    }`}>
                                        #{activeDetailIssue.issue_code || ('LEAN-' + activeDetailIssue.id)}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                                        activeDetailIssue.status === 'open'
                                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                            : activeDetailIssue.status === 'in_progress'
                                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                            : activeDetailIssue.status === 'pending'
                                            ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    }`}>
                                        {activeDetailIssue.status}
                                    </span>
                                </div>
                                <h3 className={`font-bold text-base leading-snug truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {activeDetailIssue.title}
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

                        {/* Body */}
                        <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
                            {/* Location & Time */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                                    <span className="text-[10px] text-slate-400 block">{isEn ? 'Location' : 'Lokasi'}</span>
                                    <span className={`font-bold flex items-center gap-1 mt-0.5 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                        <MapPin className="w-3.5 h-3.5" />
                                        {activeDetailIssue.location}
                                    </span>
                                </div>
                                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                                    <span className="text-[10px] text-slate-400 block">{isEn ? 'Created At' : 'Dilaporkan'}</span>
                                    <span className="font-bold flex items-center gap-1 mt-0.5">
                                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                                        {formatDateTimeId(activeDetailIssue.created_at)}
                                    </span>
                                </div>
                            </div>

                            {/* Description */}
                            {activeDetailIssue.description && (
                                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800/50 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
                                    <p className="text-[11px] font-bold text-slate-400 mb-1">{isEn ? 'Description' : 'Deskripsi Masalah'}</p>
                                    <p className="leading-relaxed whitespace-pre-wrap">{activeDetailIssue.description}</p>
                                </div>
                            )}

                            {/* Photo Proof */}
                            {activeDetailIssue.image_url && (
                                <div className="space-y-1">
                                    <span className="text-[11px] font-bold text-slate-400">{isEn ? 'Photo Evidence' : 'Foto Bukti'}</span>
                                    <div className="rounded-xl overflow-hidden border border-slate-700 max-h-56 bg-black/40 flex items-center justify-center">
                                        <img src={activeDetailIssue.image_url} alt="Proof" className="w-full max-h-56 object-cover" />
                                    </div>
                                </div>
                            )}

                            {/* Timeline Aktivitas */}
                            {(() => {
                                const activityLogs = (activeDetailIssue.progress_logs || []).filter(log => log.type !== 'transfer');
                                if (activityLogs.length === 0) return null;

                                return (
                                    <div className={`p-3 rounded-xl border space-y-2 ${
                                        isDark ? 'bg-slate-900/90 border-sky-900/50' : 'bg-sky-50/60 border-sky-200'
                                    }`}>
                                        <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-sky-400' : 'text-sky-800'}`}>
                                            <History className="w-3.5 h-3.5" />
                                            <span>{isEn ? `Activity History (${activityLogs.length})` : `Riwayat Aktivitas (${activityLogs.length})`}</span>
                                        </div>
                                        <div className="space-y-1.5 pl-2.5 border-l-2 border-sky-500/40">
                                            {activityLogs.map((log, idx) => {
                                                const badgeStyles = isDark ? ({
                                                    pin_placed: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
                                                    pin_moved: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
                                                    pin_removed: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
                                                }[log.type] || 'bg-slate-500/20 text-slate-300 border-slate-500/30') : ({
                                                    pin_placed: 'bg-teal-100 text-teal-800 border-teal-300',
                                                    pin_moved: 'bg-cyan-100 text-cyan-800 border-cyan-300',
                                                    pin_removed: 'bg-slate-100 text-slate-700 border-slate-300',
                                                }[log.type] || 'bg-slate-100 text-slate-700 border-slate-300');

                                                return (
                                                    <div key={log.id || idx} className={`p-2 rounded-lg border space-y-1 ${
                                                        isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white border-sky-200 shadow-2xs'
                                                    }`}>
                                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold border ${badgeStyles}`}>
                                                                    {log.type}
                                                                </span>
                                                                <span className={`font-bold text-[11px] ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                                                    {log.actor}
                                                                </span>
                                                            </div>
                                                            <span className="text-[9.5px] text-slate-400">
                                                                {formatDateTimeId(log.created_at)}
                                                            </span>
                                                        </div>
                                                        {log.message && (
                                                            <p className={`text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                                                {log.message}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* View Full in Dashboard Link */}
                            <div className="pt-2">
                                <button
                                    type="button"
                                    onClick={() => router.visit(`/lapangan?issue=${activeDetailIssue.id}`)}
                                    className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>{isEn ? 'Open Full Issue Details in Dashboard' : 'Buka Detail Penuh di Dashboard'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
