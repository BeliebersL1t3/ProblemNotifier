import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/UI/Dialog';
import { Button } from '@/Components/UI/Button';
import { useLanguage } from '@/context/LanguageContext';
import { 
    MessageSquare, Play, Square, RefreshCw, Terminal, 
    CheckCircle2, AlertCircle, Loader2, Phone, Clock
} from 'lucide-react';

export function BotControlModal({ open, onOpenChange, botStatus, onRefreshStatus }) {
    const { lang } = useLanguage();
    const [actionLoading, setActionLoading] = useState(false);
    const [actionMsg, setActionMsg] = useState(null);
    const [logs, setLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [showLogs, setShowLogs] = useState(false);

    const fetchLogs = useCallback(async () => {
        setLoadingLogs(true);
        try {
            const res = await axios.get('/api/bot/logs');
            if (res.data?.success) {
                setLogs(res.data.logs || []);
            }
        } catch {
            setLogs(['Gagal memuat log runtime bot.']);
        } finally {
            setLoadingLogs(false);
        }
    }, []);

    useEffect(() => {
        if (open) {
            setActionMsg(null);
            if (showLogs) fetchLogs();
        }
    }, [open, showLogs, fetchLogs]);

    const handleStartBot = async () => {
        setActionLoading(true);
        setActionMsg(null);
        try {
            const res = await axios.post('/api/bot/start');
            setActionMsg({ type: 'success', text: res.data?.message || 'Perintah start terkirim.' });
            setTimeout(async () => {
                await onRefreshStatus?.();
                if (showLogs) fetchLogs();
                setActionLoading(false);
            }, 2500);
        } catch (err) {
            setActionMsg({ type: 'error', text: err.response?.data?.message || 'Gagal menyalakan bot.' });
            setActionLoading(false);
        }
    };

    const handleStopBot = async () => {
        setActionLoading(true);
        setActionMsg(null);
        try {
            const res = await axios.post('/api/bot/stop');
            setActionMsg({ type: 'success', text: res.data?.message || 'Bot berhasil dimatikan.' });
            setTimeout(async () => {
                await onRefreshStatus?.();
                if (showLogs) fetchLogs();
                setActionLoading(false);
            }, 1500);
        } catch (err) {
            setActionMsg({ type: 'error', text: err.response?.data?.message || 'Gagal mematikan bot.' });
            setActionLoading(false);
        }
    };

    const handleRestartBot = async () => {
        setActionLoading(true);
        setActionMsg(null);
        try {
            const res = await axios.post('/api/bot/restart');
            setActionMsg({ type: 'success', text: res.data?.message || 'Bot sedang di-restart...' });
            setTimeout(async () => {
                await onRefreshStatus?.();
                if (showLogs) fetchLogs();
                setActionLoading(false);
            }, 3500);
        } catch (err) {
            setActionMsg({ type: 'error', text: err.response?.data?.message || 'Gagal me-restart bot.' });
            setActionLoading(false);
        }
    };

    const isConnected = Boolean(botStatus?.connected);

    const formatUptime = (seconds) => {
        if (!seconds) return '0 menit';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h} jam ${m} mnt`;
        return `${m} menit`;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-[#1C1B0E] border border-amber-500/40 text-[#FAFAFA] p-6 shadow-2xl z-[9999]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-400 font-bold text-base">
                        <MessageSquare className="w-5 h-5 text-[#25D366]" />
                        <span>{lang === 'id' ? 'Kontrol WhatsApp Bot' : 'WhatsApp Bot Control'}</span>
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground pt-0.5">
                        {lang === 'id' 
                            ? 'Pantau status, nyalakan, matikan, atau restart WhatsApp Bot langsung dari dashboard.' 
                            : 'Monitor status, start, stop, or restart the WhatsApp Bot directly from your dashboard.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Status Badge Card */}
                    <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                        isConnected 
                            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' 
                            : 'bg-red-950/20 border-red-500/30 text-red-300'
                    }`}>
                        <div className="flex items-center gap-3">
                            <span className="relative flex h-3 w-3">
                                {isConnected && (
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                )}
                                <span className={`relative inline-flex rounded-full h-3 w-3 ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            </span>
                            <div>
                                <h4 className="font-bold text-sm text-[#FAFAFA] flex items-center gap-2">
                                    <span>{isConnected ? 'WhatsApp Bot Online' : 'WhatsApp Bot Offline'}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                                        isConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                    }`}>
                                        {isConnected ? 'ACTIVE' : 'STOPPED'}
                                    </span>
                                </h4>
                                <p className="text-xs text-muted-foreground pt-0.5">
                                    {isConnected 
                                        ? (botStatus.name || 'Information of Technology') 
                                        : (lang === 'id' ? 'Bot sedang nonaktif.' : 'Bot is not running.')}
                                </p>
                            </div>
                        </div>

                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={actionLoading}
                            onClick={async () => {
                                await onRefreshStatus?.();
                                if (showLogs) fetchLogs();
                            }}
                            className="h-8 w-8 p-0 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white"
                            title="Refresh Status"
                        >
                            <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>

                    {/* Extended Details when Online */}
                    {isConnected && (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2.5 rounded-lg bg-[#2A281E] border border-border/60">
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-emerald-400" />
                                    <span>{lang === 'id' ? 'Nomor Bot' : 'Phone'}</span>
                                </span>
                                <span className="font-mono font-bold text-sm text-foreground pt-0.5 block truncate">
                                    +{botStatus.phone || '-'}
                                </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-[#2A281E] border border-border/60">
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-amber-400" />
                                    <span>{lang === 'id' ? 'Lama Aktif (Uptime)' : 'Uptime'}</span>
                                </span>
                                <span className="font-mono font-bold text-sm text-foreground pt-0.5 block">
                                    {formatUptime(botStatus.uptime)}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Action Alert Banner */}
                    {actionMsg && (
                        <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 border ${
                            actionMsg.type === 'success' 
                                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' 
                                : 'bg-red-500/15 border-red-500/30 text-red-300'
                        }`}>
                            {actionMsg.type === 'success' ? (
                                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                            ) : (
                                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                            )}
                            <span className="truncate">{actionMsg.text}</span>
                        </div>
                    )}

                    {/* Action Controls */}
                    <div className="p-3 rounded-xl bg-[#2A281E]/60 border border-border/60 space-y-2">
                        <span className="text-[11px] font-semibold text-muted-foreground block">
                            {lang === 'id' ? 'Aksi Kontrol Layanan:' : 'Service Actions:'}
                        </span>

                        {!isConnected ? (
                            <Button
                                type="button"
                                disabled={actionLoading}
                                onClick={handleStartBot}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-9 gap-2 shadow-md cursor-pointer"
                            >
                                {actionLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Play className="w-4 h-4 fill-white" />
                                )}
                                <span>{lang === 'id' ? 'Nyalakan Bot Sekarang' : 'Start Bot Now'}</span>
                            </Button>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={handleRestartBot}
                                    className="bg-amber-600/80 hover:bg-amber-600 text-white font-bold text-xs h-9 gap-1.5 cursor-pointer"
                                >
                                    {actionLoading ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <RefreshCw className="w-3.5 h-3.5" />
                                    )}
                                    <span>Restart</span>
                                </Button>
                                <Button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={handleStopBot}
                                    variant="destructive"
                                    className="bg-red-600/80 hover:bg-red-600 text-white font-bold text-xs h-9 gap-1.5 cursor-pointer"
                                >
                                    {actionLoading ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Square className="w-3.5 h-3.5 fill-white" />
                                    )}
                                    <span>{lang === 'id' ? 'Matikan Bot' : 'Stop Bot'}</span>
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Toggle Log View */}
                    <div className="pt-1">
                        <button
                            type="button"
                            onClick={() => {
                                const next = !showLogs;
                                setShowLogs(next);
                                if (next) fetchLogs();
                            }}
                            className="flex items-center justify-between w-full text-[11px] text-muted-foreground hover:text-amber-300 py-1 transition-colors cursor-pointer select-none"
                        >
                            <span className="flex items-center gap-1.5">
                                <Terminal className="w-3.5 h-3.5" />
                                <span>{lang === 'id' ? 'Lihat Cuplikan Log Terminal' : 'View Terminal Log Snippet'}</span>
                            </span>
                            <span className="text-[10px] underline">{showLogs ? (lang === 'id' ? 'Sembunyikan' : 'Hide') : (lang === 'id' ? 'Tampilkan' : 'Show')}</span>
                        </button>

                        {showLogs && (
                            <div className="mt-2 space-y-1.5">
                                <div className="p-2.5 rounded-lg bg-black/80 border border-white/10 font-mono text-[10px] text-stone-300 max-h-36 overflow-y-auto space-y-0.5 leading-relaxed">
                                    {loadingLogs ? (
                                        <div className="flex items-center gap-2 text-stone-400 py-2">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            <span>Memuat log...</span>
                                        </div>
                                    ) : logs.length === 0 ? (
                                        <span className="text-stone-500 italic">Tidak ada log yang tercatat.</span>
                                    ) : (
                                        logs.map((line, idx) => (
                                            <div key={idx} className="whitespace-pre-wrap break-all hover:bg-white/5 px-1 py-0.5 rounded">
                                                {line}
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        disabled={loadingLogs}
                                        onClick={fetchLogs}
                                        className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                                    >
                                        <RefreshCw className={`w-3 h-3 ${loadingLogs ? 'animate-spin' : ''}`} />
                                        <span>Refresh Log</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="pt-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        className="text-xs border-border"
                    >
                        {lang === 'id' ? 'Tutup' : 'Close'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
