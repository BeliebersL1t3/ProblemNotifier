import { useState, useEffect, useCallback, useRef } from 'react';
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
import { useLeanTheme } from '@/hooks/useLeanTheme';
import { formatToLocalPhone } from '@/utils/phone';
import {
    MessageSquare, Play, Square, RefreshCw, Terminal,
    CheckCircle2, AlertCircle, Loader2, Phone, Clock,
    QrCode, KeyRound, ExternalLink, Unlink, Copy, Check,
    Info, ArrowRight, HardDrive, Trash2, Sparkles
} from 'lucide-react';

export function BotControlModal({ open, onOpenChange, botStatus, onRefreshStatus, initialTab = 'status', botVersion = 'v2' }) {
    const { lang } = useLanguage();
    const { isDark } = useLeanTheme();
    const [activeTab, setActiveTab] = useState(initialTab); // 'status' | 'pair' | 'qr'
    const [actionLoading, setActionLoading] = useState(false);
    const [actionMsg, setActionMsg] = useState(null);
    const [logs, setLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [showLogs, setShowLogs] = useState(false);

    // Number Pairing & Auth State
    const [authState, setAuthState] = useState(null);
    const [loadingAuth, setLoadingAuth] = useState(false);
    const [newPhone, setNewPhone] = useState('');
    const [pairingCode, setPairingCode] = useState(null);
    const [pairingPhone, setPairingPhone] = useState(null);
    const [pairingLoading, setPairingLoading] = useState(false);
    const [unlinking, setUnlinking] = useState(false);
    const [copied, setCopied] = useState(false);
    const [authStats, setAuthStats] = useState(null);
    const [loadingStats, setLoadingStats] = useState(false);
    const [cleaningAuth, setCleaningAuth] = useState(false);
    const pollIntervalRef = useRef(null);

    const isConnected = Boolean(botStatus?.connected || authState?.connected);
    const activePhone = botStatus?.phone || authState?.phone;
    const cleanActivePhone = activePhone ? String(activePhone).replace(/[^0-9]/g, '') : '';
    const waChatUrl = cleanActivePhone ? `https://wa.me/${cleanActivePhone}` : null;

    const isBackingOffRef = useRef(false);

    const fetchAuthState = useCallback(async () => {
        if (isBackingOffRef.current) return;
        try {
            setLoadingAuth(true);
            const res = await axios.get('/api/bot/auth-state');
            if (res.data) {
                setAuthState(res.data);
                if (res.data.pairingCode) setPairingCode(res.data.pairingCode);
                if (res.data.pairingPhone) setPairingPhone(res.data.pairingPhone);
                if (res.data.connected && onRefreshStatus) {
                    onRefreshStatus();
                }
            }
        } catch (err) {
            if (err.response?.status === 429) {
                // Rate limited: pause polling for 15 seconds to allow cooling off
                isBackingOffRef.current = true;
                setTimeout(() => {
                    isBackingOffRef.current = false;
                }, 15000);
            } else {
                console.warn('[BotControlModal] Failed fetching auth state:', err?.message || err);
            }
        } finally {
            setLoadingAuth(false);
        }
    }, [onRefreshStatus]);

    const fetchLogs = useCallback(async () => {
        setLoadingLogs(true);
        try {
            const res = await axios.get('/api/bot/logs', { params: { version: botVersion } });
            if (res.data?.success) {
                setLogs(res.data.logs || []);
            }
        } catch (err) {
            console.warn('[BotControlModal] Failed fetching bot runtime logs:', err?.message || err);
            setLogs([lang === 'id' ? 'Gagal memuat log runtime bot.' : 'Failed to load bot runtime logs.']);
        } finally {
            setLoadingLogs(false);
        }
    }, [botVersion, lang]);

    const fetchAuthStats = useCallback(async () => {
        try {
            setLoadingStats(true);
            const res = await axios.get('/api/bot/auth-stats');
            if (res.data?.success && res.data?.stats) {
                setAuthStats(res.data.stats);
            }
        } catch (err) {
            console.warn('[BotControlModal] Failed fetching auth storage stats:', err?.message || err);
        } finally {
            setLoadingStats(false);
        }
    }, []);

    const handleCleanupAuth = async () => {
        setCleaningAuth(true);
        setActionMsg(null);
        try {
            const res = await axios.post('/api/bot/cleanup');
            if (res.data?.success) {
                setActionMsg({
                    type: 'success',
                    text: res.data.message || (lang === 'id' ? 'File sampah sesi berhasil dibersihkan.' : 'Session junk cleaned.')
                });
                if (res.data.currentStats) {
                    setAuthStats(res.data.currentStats);
                } else {
                    await fetchAuthStats();
                }
            } else {
                setActionMsg({
                    type: 'error',
                    text: res.data?.message || (lang === 'id' ? 'Gagal membersihkan file sampah.' : 'Failed to clean session junk.')
                });
            }
        } catch (err) {
            setActionMsg({
                type: 'error',
                text: err.response?.data?.message || (lang === 'id' ? 'Gagal membersihkan file sampah sesi.' : 'Failed cleaning session junk.')
            });
        } finally {
            setCleaningAuth(false);
        }
    };

    useEffect(() => {
        if (open) {
            setActionMsg(null);
            setActiveTab(initialTab);
            fetchAuthState();
            fetchAuthStats();
            if (showLogs) fetchLogs();

            // Set up polling for connection updates while modal is open (relaxed to 5s)
            pollIntervalRef.current = setInterval(() => {
                fetchAuthState();
            }, 5000);
        } else {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        }

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, [open, initialTab, showLogs, fetchLogs, fetchAuthState]);

    const handleStartBot = async () => {
        setActionLoading(true);
        setActionMsg(null);
        try {
            const res = await axios.post('/api/bot/start', { version: botVersion });
            setActionMsg({ type: 'success', text: res.data?.message || (lang === 'id' ? 'Perintah start terkirim.' : 'Start command sent.') });
            setTimeout(async () => {
                await onRefreshStatus?.();
                await fetchAuthState();
                if (showLogs) fetchLogs();
                setActionLoading(false);
            }, 2500);
        } catch (err) {
            setActionMsg({ type: 'error', text: err.response?.data?.message || (lang === 'id' ? 'Gagal menyalakan bot.' : 'Failed to start bot.') });
            setActionLoading(false);
        }
    };

    const handleStopBot = async () => {
        setActionLoading(true);
        setActionMsg(null);
        try {
            const res = await axios.post('/api/bot/stop', { version: botVersion });
            setActionMsg({ type: 'success', text: res.data?.message || (lang === 'id' ? 'Bot berhasil dimatikan.' : 'Bot stopped successfully.') });
            setTimeout(async () => {
                await onRefreshStatus?.();
                await fetchAuthState();
                if (showLogs) fetchLogs();
                setActionLoading(false);
            }, 1500);
        } catch (err) {
            setActionMsg({ type: 'error', text: err.response?.data?.message || (lang === 'id' ? 'Gagal mematikan bot.' : 'Failed to stop bot.') });
            setActionLoading(false);
        }
    };

    const handleRestartBot = async () => {
        setActionLoading(true);
        setActionMsg(null);
        try {
            const res = await axios.post('/api/bot/restart', { version: botVersion });
            setActionMsg({ type: 'success', text: res.data?.message || (lang === 'id' ? 'Bot sedang di-restart...' : 'Restarting bot...') });
            setTimeout(async () => {
                await onRefreshStatus?.();
                await fetchAuthState();
                if (showLogs) fetchLogs();
                setActionLoading(false);
            }, 3500);
        } catch (err) {
            setActionMsg({ type: 'error', text: err.response?.data?.message || (lang === 'id' ? 'Gagal me-restart bot.' : 'Failed to restart bot.') });
            setActionLoading(false);
        }
    };

    // Request 8-digit WhatsApp Pairing Code
    const handleRequestPairing = async (e) => {
        e?.preventDefault();
        const rawPhone = newPhone.trim();
        if (!rawPhone) {
            setActionMsg({ type: 'error', text: lang === 'id' ? 'Masukkan nomor WhatsApp bot terlebih dahulu.' : 'Please enter a WhatsApp phone number.' });
            return;
        }

        setPairingLoading(true);
        setActionMsg(null);
        try {
            const res = await axios.post('/api/bot/pair-phone', { phone: rawPhone });
            if (res.data?.success) {
                setPairingCode(res.data.pairingCode);
                setPairingPhone(res.data.phone);
                setActionMsg({
                    type: 'success',
                    text: lang === 'id'
                        ? 'Kode pairing berhasil dibuat! Masukkan kode ini di WhatsApp HP bot.'
                        : 'Pairing code generated! Enter this code in WhatsApp on the bot phone.'
                });
                await fetchAuthState();
            } else {
                setActionMsg({ type: 'error', text: res.data?.message || (lang === 'id' ? 'Gagal membuat kode pairing.' : 'Failed to generate pairing code.') });
            }
        } catch (err) {
            setActionMsg({
                type: 'error',
                text: err.response?.data?.message || err.response?.data?.error || (lang === 'id' ? 'Gagal menghubungi service bot.' : 'Failed to reach bot service.')
            });
        } finally {
            setPairingLoading(false);
        }
    };

    // Unlink / Reset WhatsApp Session
    const handleUnlinkSession = async () => {
        const confirmMsg = lang === 'id'
            ? 'Apakah Anda yakin ingin memutuskan sesi WhatsApp bot saat ini? Nomor bot akan terputus dan perlu ditautkan ulang.'
            : 'Are you sure you want to unlink the current WhatsApp bot session? The bot will disconnect and need to be re-linked.';

        if (!window.confirm(confirmMsg)) return;

        setUnlinking(true);
        setActionMsg(null);
        try {
            const res = await axios.post('/api/bot/unlink');
            if (res.data?.success) {
                setPairingCode(null);
                setPairingPhone(null);
                setNewPhone('');
                setActionMsg({
                    type: 'success',
                    text: res.data.message || (lang === 'id' ? 'Sesi bot berhasil diputuskan.' : 'Bot session unlinked.')
                });
                setActiveTab('pair');
                setTimeout(async () => {
                    await onRefreshStatus?.();
                    await fetchAuthState();
                    setUnlinking(false);
                }, 1500);
            } else {
                setActionMsg({ type: 'error', text: res.data?.message || (lang === 'id' ? 'Gagal memutuskan sesi bot.' : 'Failed to unlink bot session.') });
                setUnlinking(false);
            }
        } catch (err) {
            setActionMsg({ type: 'error', text: err.response?.data?.message || (lang === 'id' ? 'Gagal memutuskan sesi bot.' : 'Failed to unlink bot session.') });
            setUnlinking(false);
        }
    };

    const handleCopyCode = () => {
        if (!pairingCode) return;
        navigator.clipboard.writeText(pairingCode.replace(/[^a-zA-Z0-9]/g, ''));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const formatUptime = (seconds) => {
        if (!seconds) return lang === 'id' ? '0 menit' : '0 min';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return lang === 'id' ? `${h} jam ${m} mnt` : `${h} hr ${m} min`;
        return lang === 'id' ? `${m} menit` : `${m} min`;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={`sm:max-w-lg p-6 shadow-2xl z-[9999] max-h-[90vh] overflow-y-auto border rounded-2xl liquid-glass-modal ${
                    isDark
                        ? 'liquid-glass-dark text-slate-100'
                        : 'liquid-glass-light text-slate-900'
                }`}
            >
                <DialogHeader>
                    <DialogTitle className={`flex items-center gap-2 font-bold text-base ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        <MessageSquare className="w-5 h-5 text-emerald-500" />
                        <span>{lang === 'id' ? 'Kelola & Ganti Nomor WhatsApp Bot' : 'WhatsApp Bot & Number Management'}</span>
                    </DialogTitle>
                    <DialogDescription className={`text-xs pt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {lang === 'id'
                            ? 'Pantau status, ubah nomor WhatsApp bot via Pairing Code / QR Code, atau kontrol layanan bot.'
                            : 'Monitor status, change bot number via Pairing Code / QR, or control the bot service.'}
                    </DialogDescription>
                </DialogHeader>

                {/* Tab Navigation */}
                <div
                    className={`flex items-center gap-1.5 p-1 rounded-xl border text-xs font-semibold mt-2 liquid-glass-subtle ${
                        isDark
                            ? 'liquid-glass-dark'
                            : 'liquid-glass-light'
                    }`}
                >
                    <button
                        type="button"
                        onClick={() => setActiveTab('status')}
                        className={`flex-1 py-1.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            activeTab === 'status'
                                ? 'bg-emerald-600 text-white font-bold shadow-xs'
                                : isDark
                                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                        }`}
                    >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{lang === 'id' ? 'Status & Kontrol' : 'Status & Control'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('pair')}
                        className={`flex-1 py-1.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            activeTab === 'pair'
                                ? 'bg-emerald-600 text-white font-bold shadow-xs'
                                : isDark
                                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                        }`}
                    >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>{lang === 'id' ? 'Ganti Nomor (Pairing)' : 'Pairing Code'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('qr')}
                        className={`flex-1 py-1.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            activeTab === 'qr'
                                ? 'bg-emerald-600 text-white font-bold shadow-xs'
                                : isDark
                                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                        }`}
                    >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>{lang === 'id' ? 'Scan Live QR' : 'Scan QR'}</span>
                    </button>
                </div>

                <div className="space-y-4 py-2">
                    {/* Status Badge Card (Always Visible) */}
                    <div
                        className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                            isConnected
                                ? isDark
                                    ? 'bg-emerald-950/30 border-emerald-500/35 text-emerald-300'
                                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : isDark
                                    ? 'bg-rose-950/30 border-rose-500/35 text-rose-300'
                                    : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <span className="relative flex h-3 w-3 shrink-0">
                                {isConnected && (
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                )}
                                <span className={`relative inline-flex rounded-full h-3 w-3 ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            </span>
                            <div className="min-w-0">
                                <h4 className={`font-bold text-sm flex items-center gap-2 flex-wrap ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    <span>{isConnected ? 'WhatsApp Bot Online' : 'WhatsApp Bot Offline'}</span>
                                    <span
                                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                                            isConnected
                                                ? isDark
                                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                : isDark
                                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                                    : 'bg-rose-100 text-rose-800 border-rose-300'
                                        }`}
                                    >
                                        {isConnected ? 'ACTIVE' : 'STOPPED'}
                                    </span>
                                </h4>
                                <p className={`text-xs pt-0.5 truncate ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                    {isConnected
                                        ? (activePhone ? (lang === 'id' ? `Nomor: +${activePhone}` : `Number: +${activePhone}`) : 'Connected')
                                        : (lang === 'id' ? 'Bot belum terhubung / memerlukan pairing.' : 'Bot is disconnected.')}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                            {isConnected && waChatUrl && (
                                <a
                                    href={waChatUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`h-8 px-2.5 rounded-lg border flex items-center gap-1.5 text-xs font-bold transition-all shadow-xs ${
                                        isDark
                                            ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                                            : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300'
                                    }`}
                                    title={lang === 'id' ? 'Buka Chat WhatsApp Bot' : 'Open Bot WhatsApp Chat'}
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Chat</span>
                                </a>
                            )}
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={actionLoading || loadingAuth}
                                onClick={async () => {
                                    await onRefreshStatus?.();
                                    await fetchAuthState();
                                    if (showLogs) fetchLogs();
                                }}
                                className={`h-8 w-8 p-0 rounded-lg cursor-pointer ${
                                    isDark
                                        ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                                        : 'hover:bg-white/80 text-slate-600 hover:text-slate-900'
                                }`}
                                title="Refresh Status"
                            >
                                <RefreshCw className={`w-4 h-4 ${actionLoading || loadingAuth ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </div>

                    {/* Action Alert Banner */}
                    {actionMsg && (
                        <div
                            className={`p-2.5 rounded-lg text-xs flex items-center gap-2 border animate-in fade-in duration-200 ${
                                actionMsg.type === 'success'
                                    ? isDark
                                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                        : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : isDark
                                        ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                                        : 'bg-rose-50 border-rose-200 text-rose-700'
                            }`}
                        >
                            {actionMsg.type === 'success' ? (
                                <CheckCircle2 className={`w-4 h-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                            ) : (
                                <AlertCircle className={`w-4 h-4 shrink-0 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} />
                            )}
                            <span className="truncate">{actionMsg.text}</span>
                        </div>
                    )}

                    {/* TAB 1: STATUS & KONTROL LAYANAN */}
                    {activeTab === 'status' && (
                        <div className="space-y-4">
                            {/* Extended Details when Online */}
                            {isConnected && (
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div
                                        className={`p-2.5 rounded-lg border ${
                                            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                                        }`}
                                    >
                                        <span className={`text-[10px] flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            <Phone className={`w-3 h-3 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                            <span>{lang === 'id' ? 'Nomor Aktif' : 'Active Number'}</span>
                                        </span>
                                        <span className={`font-mono font-bold text-sm pt-0.5 block truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            +{activePhone || '-'}
                                        </span>
                                    </div>
                                    <div
                                        className={`p-2.5 rounded-lg border ${
                                            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                                        }`}
                                    >
                                        <span className={`text-[10px] flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            <Clock className={`w-3 h-3 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                                            <span>{lang === 'id' ? 'Lama Aktif (Uptime)' : 'Uptime'}</span>
                                        </span>
                                        <span className={`font-mono font-bold text-sm pt-0.5 block ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {formatUptime(botStatus?.uptime || authState?.uptime)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Service Control Actions */}
                            <div
                                className={`p-3 rounded-xl border space-y-2 ${
                                    isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
                                }`}
                            >
                                <span className={`text-[11px] font-semibold block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                    {lang === 'id' ? 'Kontrol Layanan Background:' : 'Service Actions:'}
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
                                            className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs h-9 gap-1.5 cursor-pointer"
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
                                            className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs h-9 gap-1.5 cursor-pointer"
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

                            {/* Storage & Auto-Cleanup Housekeeping Section */}
                            <div
                                className={`p-3.5 rounded-xl border space-y-2.5 ${
                                    isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className={`text-[11px] font-semibold flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                        <HardDrive className={`w-3.5 h-3.5 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
                                        <span>{lang === 'id' ? 'Penyimpanan Sesi (Auth Baileys):' : 'Session Storage (Auth Baileys):'}</span>
                                    </span>
                                    {authStats && (
                                        <span className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {authStats.storageMode === 'sqlite' ? 'SQLite • ' : ''}
                                            {authStats.totalFiles} file
                                            {authStats.totalKeys !== undefined ? ` • ${authStats.totalKeys} key` : ''}
                                            {` (${authStats.totalSizeKB} KB)`}
                                        </span>
                                    )}
                                </div>

                                <div
                                    className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 text-xs ${
                                        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                                    }`}
                                >
                                    <div className="space-y-0.5 min-w-0">
                                        <p className={`text-[11px] font-semibold flex items-center gap-1.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                            <Sparkles className={`w-3 h-3 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                            <span>{lang === 'id' ? 'Auto-Cleanup Harian Aktif (03:00 AM • TTL 60 Hari)' : 'Daily Auto-Cleanup Active (03:00 AM • 60d TTL)'}</span>
                                        </p>
                                        <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {lang === 'id'
                                                ? 'Penyimpanan SQLite tunggal + pangkas key usang >60 hari. Sesi login & mapping staf selalu dilindungi.'
                                                : 'Single SQLite storage + 60-day dormant key pruning. Login session & staff mappings are always protected.'}
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={cleaningAuth}
                                        onClick={handleCleanupAuth}
                                        className="h-8 px-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shrink-0 gap-1.5 cursor-pointer shadow-xs"
                                        title={lang === 'id' ? 'Bersihkan key usang (>60 hari) & kompres SQLite sekarang' : 'Prune dormant keys (>60d) & compact SQLite now'}
                                    >
                                        {cleaningAuth ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-3.5 h-3.5" />
                                        )}
                                        <span className="hidden sm:inline">{lang === 'id' ? 'Bersihkan' : 'Clean'}</span>
                                    </Button>
                                </div>
                            </div>

                            {/* Quick Action: Change Number Button */}
                            <div
                                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                                    isDark
                                        ? 'bg-emerald-950/25 border-emerald-500/30'
                                        : 'bg-emerald-50/80 border-emerald-200'
                                }`}
                            >
                                <div>
                                    <h5 className={`text-xs font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}>
                                        {lang === 'id' ? 'Ingin Mengganti Nomor Bot?' : 'Need to Change Bot Number?'}
                                    </h5>
                                    <p className={`text-[11px] pt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                        {lang === 'id'
                                            ? 'Gunakan Pairing Code 8-digit untuk menghubungkan nomor baru tanpa scan kamera.'
                                            : 'Use 8-digit Pairing Code to link new number without camera scan.'}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    onClick={() => setActiveTab('pair')}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 px-3 shrink-0 gap-1.5 cursor-pointer"
                                >
                                    <span>{lang === 'id' ? 'Ganti Nomor' : 'Change Number'}</span>
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: GANTI NOMOR VIA PAIRING CODE */}
                    {activeTab === 'pair' && (
                        <div className="space-y-4">
                            <div
                                className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                                    isDark
                                        ? 'bg-emerald-950/25 border-emerald-500/30 text-emerald-200'
                                        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                }`}
                            >
                                <Info className={`w-4 h-4 shrink-0 mt-0.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                <div className="space-y-1">
                                    <span className={`font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}>
                                        {lang === 'id' ? 'Pemasangan Mudah via Kode 8-Digit:' : 'Quick 8-Digit Pairing:'}
                                    </span>
                                    <p className={`text-[11px] leading-relaxed ${isDark ? 'text-emerald-200/90' : 'text-emerald-800'}`}>
                                        {lang === 'id'
                                            ? 'Ketik nomor WhatsApp bot baru, dapatkan kode pairing 8-digit, lalu masukkan di menu "Tautkan Perangkat" WhatsApp di HP Anda.'
                                            : 'Enter the new WhatsApp bot phone number, get the 8-digit code, and enter it in WhatsApp Linked Devices on your phone.'}
                                    </p>
                                </div>
                            </div>

                            {/* Phone Input Form */}
                            <form
                                onSubmit={handleRequestPairing}
                                className={`space-y-3 p-3.5 rounded-xl border ${
                                    isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
                                }`}
                            >
                                <label className={`block text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {lang === 'id' ? 'Nomor WhatsApp Bot Baru:' : 'New WhatsApp Bot Number:'}
                                </label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Phone className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                                        <input
                                            type="text"
                                            value={newPhone}
                                            onChange={(e) => setNewPhone(formatToLocalPhone(e.target.value))}
                                            placeholder={lang === 'id' ? 'Contoh: 081234567890' : 'Example: 081234567890'}
                                            className={`w-full rounded-lg border pl-9 pr-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 ${
                                                isDark
                                                    ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500'
                                                    : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500'
                                            }`}
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        disabled={pairingLoading || !newPhone}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-9 px-4 gap-1.5 shrink-0 cursor-pointer shadow-md"
                                    >
                                        {pairingLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <KeyRound className="w-4 h-4" />
                                        )}
                                        <span>{lang === 'id' ? 'Dapatkan Kode' : 'Get Code'}</span>
                                    </Button>
                                </div>
                            </form>

                            {/* Pairing Code Card Display */}
                            {pairingCode && (
                                <div
                                    className={`p-4 rounded-xl border-2 text-center space-y-3 animate-in zoom-in-95 duration-200 ${
                                        isDark
                                            ? 'bg-slate-950 border-emerald-500/50'
                                            : 'bg-emerald-50/70 border-emerald-400'
                                    }`}
                                >
                                    <span className={`text-[11px] font-bold uppercase tracking-wider block ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                                        {lang === 'id' ? 'Kode Pemasangan WhatsApp Anda:' : 'Your WhatsApp Pairing Code:'}
                                    </span>

                                    <div className="flex items-center justify-center gap-2">
                                        <div
                                            className={`px-6 py-2.5 rounded-xl border font-mono font-extrabold text-2xl tracking-[0.25em] shadow-inner select-all ${
                                                isDark
                                                    ? 'bg-slate-900 border-emerald-500/40 text-emerald-400'
                                                    : 'bg-white border-emerald-300 text-emerald-700'
                                            }`}
                                        >
                                            {pairingCode}
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={handleCopyCode}
                                            className={`h-11 w-11 p-0 rounded-xl border cursor-pointer ${
                                                isDark
                                                    ? 'bg-slate-900 border-slate-700 hover:border-emerald-400 text-slate-200 hover:text-white'
                                                    : 'bg-white border-slate-300 hover:border-emerald-500 text-slate-700 hover:text-emerald-700'
                                            }`}
                                            title={lang === 'id' ? 'Salin Kode' : 'Copy Code'}
                                        >
                                            {copied ? <Check className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
                                        </Button>
                                    </div>

                                    {pairingPhone && (
                                        <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                            {lang === 'id' ? 'Menunggu konfirmasi pada nomor:' : 'Waiting confirmation on:'}{' '}
                                            <strong className={`font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>+{pairingPhone}</strong>
                                        </p>
                                    )}

                                    {/* 4-Step User Guide */}
                                    <div
                                        className={`p-3 rounded-lg border text-left text-[11px] space-y-1.5 leading-relaxed ${
                                            isDark
                                                ? 'bg-slate-900/90 border-slate-800 text-slate-300'
                                                : 'bg-white border-slate-200 text-slate-700'
                                        }`}
                                    >
                                        <p className={`font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                            {lang === 'id' ? '👉 Panduan Memasukkan Kode di HP:' : '👉 Instructions on Phone:'}
                                        </p>
                                        <ol className={`list-decimal pl-4 space-y-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                            <li>{lang === 'id' ? 'Buka WhatsApp di HP nomor bot baru.' : 'Open WhatsApp on the bot phone.'}</li>
                                            <li>{lang === 'id' ? 'Buka Setelan / Titik Tiga > Perangkat Tertaut > Tautkan Perangkat.' : 'Open Settings > Linked Devices > Link a Device.'}</li>
                                            <li>{lang === 'id' ? 'Pilih "Tautkan dengan nomor telepon saja".' : 'Tap "Link with phone number instead".'}</li>
                                            <li>{lang === 'id' ? 'Ketikkan kode 8-digit di atas.' : 'Enter the 8-digit code above.'}</li>
                                        </ol>
                                        <p className={`text-[10px] pt-1 border-t font-semibold ${isDark ? 'text-emerald-400/90 border-slate-800' : 'text-emerald-700 border-slate-200'}`}>
                                            📢 {lang === 'id'
                                                ? 'Setelah terhubung, bot otomatis mengirim siaran nomor baru ke grup WhatsApp!'
                                                : 'Once connected, bot automatically broadcasts the new number to groups!'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Reset / Unlink Danger Action */}
                            {isConnected && (
                                <div
                                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                                        isDark
                                            ? 'bg-rose-950/25 border-rose-500/35'
                                            : 'bg-rose-50 border-rose-200'
                                    }`}
                                >
                                    <div className="text-xs">
                                        <span className={`font-bold block ${isDark ? 'text-rose-400' : 'text-rose-700'}`}>
                                            {lang === 'id' ? 'Putuskan Sesi Nomor Saat Ini' : 'Unlink Current Session'}
                                        </span>
                                        <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-rose-800/80'}`}>
                                            {lang === 'id' ? 'Hapus sesi jika nomor bermasalah atau terblokir.' : 'Remove session if blocked or failing.'}
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        disabled={unlinking}
                                        onClick={handleUnlinkSession}
                                        className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs h-8 px-3 shrink-0 gap-1.5 cursor-pointer"
                                    >
                                        {unlinking ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Unlink className="w-3.5 h-3.5" />
                                        )}
                                        <span>{lang === 'id' ? 'Putuskan Sesi' : 'Unlink'}</span>
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 3: SCAN LIVE QR CODE */}
                    {activeTab === 'qr' && (
                        <div className="space-y-3 text-center">
                            {isConnected ? (
                                <div
                                    className={`p-6 rounded-xl border space-y-2 ${
                                        isDark
                                            ? 'bg-emerald-950/25 border-emerald-500/35'
                                            : 'bg-emerald-50 border-emerald-200'
                                    }`}
                                >
                                    <CheckCircle2 className={`w-10 h-10 mx-auto ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                    <h4 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {lang === 'id' ? 'WhatsApp Bot Sudah Terhubung!' : 'WhatsApp Bot is Connected!'}
                                    </h4>
                                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                        {lang === 'id'
                                            ? `Bot aktif pada nomor +${activePhone}. Jika ingin mengganti nomor, putuskan sesi terlebih dahulu.`
                                            : `Bot is active on +${activePhone}. To change number, please unlink first.`}
                                    </p>
                                    <div className="pt-2">
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            onClick={handleUnlinkSession}
                                            disabled={unlinking}
                                            className="bg-rose-600 hover:bg-rose-500 text-white text-xs h-8 gap-1.5 cursor-pointer"
                                        >
                                            <Unlink className="w-3.5 h-3.5" />
                                            <span>{lang === 'id' ? 'Putuskan & Scan Ulang' : 'Unlink & Re-scan'}</span>
                                        </Button>
                                    </div>
                                </div>
                            ) : authState?.qr ? (
                                <div
                                    className={`p-4 rounded-xl border space-y-3 ${
                                        isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                                    }`}
                                >
                                    <div className="bg-white p-3 rounded-xl inline-block shadow-lg mx-auto border border-slate-200">
                                        <img
                                            src={authState.qr}
                                            alt="WhatsApp Bot QR Code"
                                            className="w-48 h-48 sm:w-56 sm:h-56 object-contain block mx-auto"
                                        />
                                    </div>
                                    <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                        {lang === 'id'
                                            ? 'Buka WhatsApp di HP > Perangkat Tertaut > Tautkan Perangkat > Arahkan kamera ke QR ini.'
                                            : 'Open WhatsApp on phone > Linked Devices > Link a Device > Scan this QR.'}
                                    </p>
                                    <div className="flex justify-center">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={fetchAuthState}
                                            className={`text-xs h-8 gap-1.5 cursor-pointer ${
                                                isDark
                                                    ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                                                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                            }`}
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            <span>{lang === 'id' ? 'Segarkan QR' : 'Refresh QR'}</span>
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className={`p-6 rounded-xl border space-y-3 ${
                                        isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                                    }`}
                                >
                                    <Loader2 className={`w-8 h-8 animate-spin mx-auto ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                    <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                        {lang === 'id'
                                            ? 'Menunggu QR Code dari bot... Nyalakan bot atau gunakan tab Pairing Code.'
                                            : 'Waiting for QR Code... Start bot or use Pairing Code tab.'}
                                    </p>
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleStartBot}
                                        disabled={actionLoading}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 gap-1.5 cursor-pointer"
                                    >
                                        <Play className="w-3.5 h-3.5 fill-white" />
                                        <span>{lang === 'id' ? 'Nyalakan Bot' : 'Start Bot'}</span>
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Toggle Log View (Snippet) */}
                    <div className={`pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <button
                            type="button"
                            onClick={() => {
                                const next = !showLogs;
                                setShowLogs(next);
                                if (next) fetchLogs();
                            }}
                            className={`flex items-center justify-between w-full text-[11px] py-1 transition-colors cursor-pointer select-none ${
                                isDark ? 'text-slate-400 hover:text-emerald-300' : 'text-slate-500 hover:text-emerald-700'
                            }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <Terminal className="w-3.5 h-3.5" />
                                <span>{lang === 'id' ? 'Lihat Cuplikan Log Terminal' : 'View Terminal Log Snippet'}</span>
                            </span>
                            <span className="text-[10px] underline">{showLogs ? (lang === 'id' ? 'Sembunyikan' : 'Hide') : (lang === 'id' ? 'Tampilkan' : 'Show')}</span>
                        </button>

                        {showLogs && (
                            <div className="mt-2 space-y-1.5">
                                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[10px] text-slate-300 max-h-36 overflow-y-auto space-y-0.5 leading-relaxed">
                                    {loadingLogs ? (
                                        <div className="flex items-center gap-2 text-slate-400 py-2">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            <span>{lang === 'id' ? 'Memuat log...' : 'Loading logs...'}</span>
                                        </div>
                                    ) : logs.length === 0 ? (
                                        <span className="text-slate-500 italic">{lang === 'id' ? 'Tidak ada log yang tercatat.' : 'No logs recorded.'}</span>
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
                                        className={`text-[10px] flex items-center gap-1 cursor-pointer ${
                                            isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-700 hover:text-emerald-800'
                                        }`}
                                    >
                                        <RefreshCw className={`w-3 h-3 ${loadingLogs ? 'animate-spin' : ''}`} />
                                        <span>{lang === 'id' ? 'Refresh Log' : 'Refresh Logs'}</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className={`pt-2 border-t flex items-center justify-between gap-2 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                    <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                        Telunas Resort WhatsApp Bot Engine
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        className={`text-xs cursor-pointer ${
                            isDark
                                ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                        {lang === 'id' ? 'Tutup' : 'Close'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
