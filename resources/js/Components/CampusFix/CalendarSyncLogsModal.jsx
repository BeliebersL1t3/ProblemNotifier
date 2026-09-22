import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    History, X, RefreshCw, CheckCircle2, AlertCircle,
    ArrowDownToLine, ArrowUpToLine, RotateCcw, Clock,
    Loader2, User, Building2
} from 'lucide-react';

function formatRelativeTime(dateStr, lang = 'id') {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        const diffSec = Math.floor((new Date() - d) / 1000);
        if (diffSec < 60) return lang === 'id' ? 'Baru saja' : 'Just now';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return lang === 'id' ? `${diffMin} menit lalu` : `${diffMin}m ago`;
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return lang === 'id' ? `${diffHour} jam lalu` : `${diffHour}h ago`;
        const diffDay = Math.floor(diffHour / 24);
        return lang === 'id' ? `${diffDay} hari lalu` : `${diffDay}d ago`;
    } catch {
        return '';
    }
}

function formatExactDate(dateStr) {
    if (!dateStr) return '';
    try {
        return new Intl.DateTimeFormat('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        }).format(new Date(dateStr));
    } catch {
        return dateStr;
    }
}

export default function CalendarSyncLogsModal({ isOpen, onClose, lang = 'id' }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get('/api/operations/calendar-logs');
            const json = res.data;
            if (json.success) {
                setLogs(json.data || []);
            } else {
                setError(json.message || 'Gagal memuat log riwayat');
            }
        } catch (e) {
            setError(e.response?.data?.message || e.message || 'Gagal memuat log riwayat');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchLogs();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const getActionMeta = (action) => {
        switch (action) {
            case 'AUTO_SYNC':
                return {
                    label: lang === 'id' ? 'Auto-Sync (5m)' : 'Auto-Sync (5m)',
                    icon: Clock,
                    badgeClass: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60',
                };
            case 'MANUAL_PULL':
                return {
                    label: lang === 'id' ? 'Tarik dari G-Cal' : 'Pull from G-Cal',
                    icon: ArrowDownToLine,
                    badgeClass: 'bg-sky-950/80 text-sky-300 border-sky-700/60',
                };
            case 'MANUAL_PUSH':
                return {
                    label: lang === 'id' ? 'Kirim ke G-Cal' : 'Push to G-Cal',
                    icon: ArrowUpToLine,
                    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
                };
            case 'RESTORE_TASK':
                return {
                    label: lang === 'id' ? 'Pemulihan Jadwal' : 'Task Restored',
                    icon: RotateCcw,
                    badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
                };
            default:
                return {
                    label: action,
                    icon: History,
                    badgeClass: 'bg-[#2A281E] text-[#FAFAFA] border-white/10',
                };
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                className="bg-[#2A281E] border border-[#3B3929] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-[#3B3929] bg-[#1C1B0E]/80">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-[#C9AA71]/20 border border-[#C9AA71]/40 flex items-center justify-center text-[#C9AA71]">
                            <History className="h-4 w-4" />
                        </div>
                        <div>
                            <h3 className="text-base font-extrabold text-[#FAFAFA]">
                                {lang === 'id' ? 'Riwayat Aktivitas Google Calendar' : 'Google Calendar Activity History'}
                            </h3>
                            <p className="text-[11px] text-[#A19F8D]">
                                {lang === 'id' ? 'Log sinkronisasi otomatis, manual, dan pemulihan jadwal' : 'Logs of auto/manual sync and task restorations'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={fetchLogs}
                            disabled={loading}
                            title="Segarkan"
                            className="p-1.5 rounded-lg bg-[#1C1B0E] text-[#A19F8D] hover:text-[#FAFAFA] border border-[#3B3929] transition-all hover:scale-105 cursor-pointer disabled:opacity-50"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-[#C9AA71]' : ''}`} />
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-lg bg-[#1C1B0E] text-[#A19F8D] hover:text-[#FAFAFA] border border-[#3B3929] transition-all hover:scale-105 cursor-pointer"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 custom-scrollbar">
                    {loading && logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-[#A19F8D] gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-[#C9AA71]" />
                            <span className="text-xs font-semibold">{lang === 'id' ? 'Memuat riwayat...' : 'Loading history...'}</span>
                        </div>
                    ) : error ? (
                        <div className="rounded-xl p-4 text-xs bg-red-950/40 text-red-200 border border-red-500/40 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                            <span>{error}</span>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-16 border border-dashed border-[#3B3929] rounded-2xl bg-[#1C1B0E]/40">
                            <History className="h-10 w-10 mx-auto mb-2 text-[#A19F8D]/30" />
                            <p className="text-sm font-bold text-[#FAFAFA] mb-1">
                                {lang === 'id' ? 'Belum Ada Riwayat' : 'No Activity Logs Yet'}
                            </p>
                            <p className="text-xs text-[#A19F8D]">
                                {lang === 'id' ? 'Aktivitas sinkronisasi dan pemulihan kalender akan tercatat di sini.' : 'Calendar sync and restoration events will be listed here.'}
                            </p>
                        </div>
                    ) : (
                        logs.map((log) => {
                            const meta = getActionMeta(log.action);
                            const Icon = meta.icon;
                            const isSuccess = log.status === 'success';

                            return (
                                <div
                                    key={log.id}
                                    className="rounded-xl border border-[#3B3929] bg-[#1C1B0E]/70 p-3.5 space-y-2 hover:border-[#C9AA71]/40 transition-all shadow-md"
                                >
                                    {/* Top Row */}
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider border flex items-center gap-1.5 ${meta.badgeClass}`}>
                                                <Icon className="h-3 w-3" />
                                                <span>{meta.label}</span>
                                            </span>

                                            {log.department && (
                                                <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[#2A281E] text-[#E3D1AA] border border-white/10 flex items-center gap-1">
                                                    <Building2 className="h-2.5 w-2.5 text-[#C9AA71]" />
                                                    <span>{log.department}</span>
                                                </span>
                                            )}

                                            <div className="flex items-center gap-1 text-[11px] text-[#A19F8D]">
                                                <User className="h-3 w-3" />
                                                <span className="font-semibold text-[#FAFAFA]">{log.performed_by}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 text-right">
                                            <span className="text-[10px] font-mono text-[#A19F8D] bg-[#2A281E] px-1.5 py-0.5 rounded border border-white/5" title={formatExactDate(log.created_at)}>
                                                {formatRelativeTime(log.created_at, lang)}
                                            </span>
                                            {isSuccess ? (
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" title="Berhasil" />
                                            ) : (
                                                <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" title="Gagal" />
                                            )}
                                        </div>
                                    </div>

                                    {/* Task Info if available */}
                                    {log.task_title && (
                                        <div className="text-xs font-bold text-[#FAFAFA] pl-1 border-l-2 border-[#C9AA71]">
                                            {log.task_title}
                                        </div>
                                    )}

                                    {/* Message or details */}
                                    {log.message && (
                                        <p className="text-[11px] text-[#A19F8D] leading-relaxed">
                                            {log.message}
                                        </p>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-[#3B3929] bg-[#1C1B0E]/60 flex items-center justify-between text-xs text-[#A19F8D]">
                    <span>
                        {lang === 'id' ? 'Autosync berjalan otomatis setiap 5 menit' : 'Autosync runs automatically every 5 minutes'}
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-xl bg-[#2A281E] text-[#FAFAFA] hover:bg-[#3B3929] border border-[#3B3929] font-bold transition-all cursor-pointer"
                    >
                        {lang === 'id' ? 'Tutup' : 'Close'}
                    </button>
                </div>
            </div>
        </div>
    );
}
