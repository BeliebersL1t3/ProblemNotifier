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
import { formatToLocalPhone } from '@/utils/phone';
import { 
    MessageSquare, Play, Square, RefreshCw, Terminal, 
    CheckCircle2, AlertCircle, Loader2, Phone, Clock,
    QrCode, KeyRound, ExternalLink, Unlink, Copy, Check,
    Info, ArrowRight
} from 'lucide-react';

export function BotControlModal({ open, onOpenChange, botStatus, onRefreshStatus, initialTab = 'status' }) {
    const { lang } = useLanguage();
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
    const pollIntervalRef = useRef(null);

    const isConnected = Boolean(botStatus?.connected || authState?.connected);
    const activePhone = botStatus?.phone || authState?.phone;
    const cleanActivePhone = activePhone ? String(activePhone).replace(/[^0-9]/g, '') : '';
    const waChatUrl = cleanActivePhone ? `https://wa.me/${cleanActivePhone}` : null;

    const fetchAuthState = useCallback(async () => {
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
        } catch {
            // Silently ignore or set basic offline
        } finally {
            setLoadingAuth(false);
        }
    }, [onRefreshStatus]);

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
            setActiveTab(initialTab);
            fetchAuthState();
            if (showLogs) fetchLogs();

            // Set up polling for connection updates while modal is open
            pollIntervalRef.current = setInterval(() => {
                fetchAuthState();
            }, 3500);
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
            const res = await axios.post('/api/bot/start');
            setActionMsg({ type: 'success', text: res.data?.message || 'Perintah start terkirim.' });
            setTimeout(async () => {
                await onRefreshStatus?.();
                await fetchAuthState();
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
                await fetchAuthState();
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
                await fetchAuthState();
                if (showLogs) fetchLogs();
                setActionLoading(false);
            }, 3500);
        } catch (err) {
            setActionMsg({ type: 'error', text: err.response?.data?.message || 'Gagal me-restart bot.' });
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
                setActionMsg({ type: 'error', text: res.data?.message || 'Gagal membuat kode pairing.' });
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
                setActionMsg({ type: 'error', text: res.data?.message || 'Gagal memutuskan sesi bot.' });
                setUnlinking(false);
            }
        } catch (err) {
            setActionMsg({ type: 'error', text: err.response?.data?.message || 'Gagal memutuskan sesi bot.' });
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
        if (!seconds) return '0 menit';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h} jam ${m} mnt`;
        return `${m} menit`;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg bg-[#1C1B0E] border border-amber-500/40 text-[#FAFAFA] p-6 shadow-2xl z-[9999] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-400 font-bold text-base">
                        <MessageSquare className="w-5 h-5 text-[#25D366]" />
                        <span>{lang === 'id' ? 'Kelola & Ganti Nomor WhatsApp Bot' : 'WhatsApp Bot & Number Management'}</span>
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground pt-0.5">
                        {lang === 'id' 
                            ? 'Pantau status, ubah nomor WhatsApp bot via Pairing Code / QR Code, atau kontrol layanan bot.' 
                            : 'Monitor status, change bot number via Pairing Code / QR, or control the bot service.'}
                    </DialogDescription>
                </DialogHeader>

                {/* Tab Navigation */}
                <div className="flex items-center gap-1.5 p-1 bg-[#2A281E] rounded-xl border border-white/5 text-xs font-semibold mt-2">
                    <button
                        type="button"
                        onClick={() => setActiveTab('status')}
                        className={`flex-1 py-1.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            activeTab === 'status' 
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold shadow-xs' 
                                : 'text-stone-400 hover:text-stone-200'
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
                                ? 'bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30 font-bold shadow-xs' 
                                : 'text-stone-400 hover:text-stone-200'
                        }`}
                    >
                        <KeyRound className="w-3.5 h-3.5 text-[#25D366]" />
                        <span>{lang === 'id' ? 'Ganti Nomor (Pairing)' : 'Pairing Code'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('qr')}
                        className={`flex-1 py-1.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            activeTab === 'qr' 
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold shadow-xs' 
                                : 'text-stone-400 hover:text-stone-200'
                        }`}
                    >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>{lang === 'id' ? 'Scan Live QR' : 'Scan QR'}</span>
                    </button>
                </div>

                <div className="space-y-4 py-2">
                    {/* Status Badge Card (Always Visible) */}
                    <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                        isConnected 
                            ? 'bg-emerald-950/25 border-emerald-500/30 text-emerald-300' 
                            : 'bg-red-950/25 border-red-500/30 text-red-300'
                    }`}>
                        <div className="flex items-center gap-3 min-w-0">
                            <span className="relative flex h-3 w-3 shrink-0">
                                {isConnected && (
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                )}
                                <span className={`relative inline-flex rounded-full h-3 w-3 ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            </span>
                            <div className="min-w-0">
                                <h4 className="font-bold text-sm text-[#FAFAFA] flex items-center gap-2 flex-wrap">
                                    <span>{isConnected ? 'WhatsApp Bot Online' : 'WhatsApp Bot Offline'}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                                        isConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                    }`}>
                                        {isConnected ? 'ACTIVE' : 'STOPPED'}
                                    </span>
                                </h4>
                                <p className="text-xs text-muted-foreground pt-0.5 truncate">
                                    {isConnected 
                                        ? (activePhone ? `Nomor: +${activePhone}` : 'Connected')
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
                                    className="h-8 px-2.5 rounded-lg bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] border border-[#25D366]/40 flex items-center gap-1.5 text-xs font-bold transition-all shadow-xs"
                                    title="Buka Chat WhatsApp Bot"
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
                                className="h-8 w-8 p-0 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white cursor-pointer"
                                title="Refresh Status"
                            >
                                <RefreshCw className={`w-4 h-4 ${actionLoading || loadingAuth ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </div>

                    {/* Action Alert Banner */}
                    {actionMsg && (
                        <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 border animate-in fade-in duration-200 ${
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

                    {/* TAB 1: STATUS & KONTROL LAYANAN */}
                    {activeTab === 'status' && (
                        <div className="space-y-4">
                            {/* Extended Details when Online */}
                            {isConnected && (
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="p-2.5 rounded-lg bg-[#2A281E] border border-border/60">
                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                            <Phone className="w-3 h-3 text-emerald-400" />
                                            <span>{lang === 'id' ? 'Nomor Aktif' : 'Active Number'}</span>
                                        </span>
                                        <span className="font-mono font-bold text-sm text-foreground pt-0.5 block truncate">
                                            +{activePhone || '-'}
                                        </span>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-[#2A281E] border border-border/60">
                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                            <Clock className="w-3 h-3 text-amber-400" />
                                            <span>{lang === 'id' ? 'Lama Aktif (Uptime)' : 'Uptime'}</span>
                                        </span>
                                        <span className="font-mono font-bold text-sm text-foreground pt-0.5 block">
                                            {formatUptime(botStatus?.uptime || authState?.uptime)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Service Control Actions */}
                            <div className="p-3 rounded-xl bg-[#2A281E]/60 border border-border/60 space-y-2">
                                <span className="text-[11px] font-semibold text-muted-foreground block">
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

                            {/* Quick Action: Change Number Button */}
                            <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-center justify-between gap-3">
                                <div>
                                    <h5 className="text-xs font-bold text-amber-300">
                                        {lang === 'id' ? 'Ingin Mengganti Nomor Bot?' : 'Need to Change Bot Number?'}
                                    </h5>
                                    <p className="text-[11px] text-muted-foreground pt-0.5">
                                        {lang === 'id' 
                                            ? 'Gunakan Pairing Code 8-digit untuk menghubungkan nomor baru tanpa scan kamera.' 
                                            : 'Use 8-digit Pairing Code to link new number without camera scan.'}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    onClick={() => setActiveTab('pair')}
                                    className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs h-8 px-3 shrink-0 gap-1.5 cursor-pointer"
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
                            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-xs text-emerald-200 flex items-start gap-2">
                                <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <span className="font-bold text-emerald-300">
                                        {lang === 'id' ? 'Pemasangan Mudah via Kode 8-Digit:' : 'Quick 8-Digit Pairing:'}
                                    </span>
                                    <p className="text-[11px] leading-relaxed text-emerald-200/90">
                                        {lang === 'id' 
                                            ? 'Ketik nomor WhatsApp bot baru, dapatkan kode pairing 8-digit, lalu masukkan di menu "Tautkan Perangkat" WhatsApp di HP Anda.' 
                                            : 'Enter the new WhatsApp bot phone number, get the 8-digit code, and enter it in WhatsApp Linked Devices on your phone.'}
                                    </p>
                                </div>
                            </div>

                            {/* Phone Input Form */}
                            <form onSubmit={handleRequestPairing} className="space-y-3 p-3.5 rounded-xl bg-[#2A281E] border border-border/60">
                                <label className="block text-xs font-bold text-[#FAFAFA]">
                                    {lang === 'id' ? 'Nomor WhatsApp Bot Baru:' : 'New WhatsApp Bot Number:'}
                                </label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <input
                                            type="text"
                                            value={newPhone}
                                            onChange={(e) => setNewPhone(formatToLocalPhone(e.target.value))}
                                            placeholder="Contoh: 081234567890"
                                            className="w-full bg-[#1C1B0E] border border-border/80 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-[#FAFAFA] placeholder:text-stone-600 focus:outline-none focus:border-amber-400"
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        disabled={pairingLoading || !newPhone}
                                        className="bg-[#25D366] hover:bg-[#20ba5a] text-black font-bold text-xs h-9 px-4 gap-1.5 shrink-0 cursor-pointer shadow-md"
                                    >
                                        {pairingLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin text-black" />
                                        ) : (
                                            <KeyRound className="w-4 h-4" />
                                        )}
                                        <span>{lang === 'id' ? 'Dapatkan Kode' : 'Get Code'}</span>
                                    </Button>
                                </div>
                            </form>

                            {/* Pairing Code Card Display */}
                            {pairingCode && (
                                <div className="p-4 rounded-xl bg-black/70 border-2 border-[#25D366]/60 text-center space-y-3 animate-in zoom-in-95 duration-200">
                                    <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                                        {lang === 'id' ? 'Kode Pemasangan WhatsApp Anda:' : 'Your WhatsApp Pairing Code:'}
                                    </span>

                                    <div className="flex items-center justify-center gap-2">
                                        <div className="bg-[#1C1B0E] px-6 py-2.5 rounded-xl border border-[#25D366]/40 font-mono font-extrabold text-2xl tracking-[0.25em] text-[#25D366] shadow-inner select-all">
                                            {pairingCode}
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={handleCopyCode}
                                            className="h-11 w-11 p-0 rounded-xl bg-[#2A281E] border border-border hover:border-emerald-400 text-stone-200 hover:text-white cursor-pointer"
                                            title="Salin Kode"
                                        >
                                            {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                                        </Button>
                                    </div>

                                    {pairingPhone && (
                                        <p className="text-[11px] text-muted-foreground">
                                            {lang === 'id' ? 'Menunggu konfirmasi pada nomor:' : 'Waiting confirmation on:'}{' '}
                                            <strong className="text-white font-mono">+{pairingPhone}</strong>
                                        </p>
                                    )}

                                    {/* 4-Step User Guide */}
                                    <div className="p-3 rounded-lg bg-[#1C1B0E]/80 border border-white/5 text-left text-[11px] text-stone-300 space-y-1.5 leading-relaxed">
                                        <p className="font-bold text-amber-300">
                                            {lang === 'id' ? '👉 Panduan Memasukkan Kode di HP:' : '👉 Instructions on Phone:'}
                                        </p>
                                        <ol className="list-decimal pl-4 space-y-1 text-stone-400">
                                            <li>{lang === 'id' ? 'Buka WhatsApp di HP nomor bot baru.' : 'Open WhatsApp on the bot phone.'}</li>
                                            <li>{lang === 'id' ? 'Buka Setelan / Titik Tiga > Perangkat Tertaut > Tautkan Perangkat.' : 'Open Settings > Linked Devices > Link a Device.'}</li>
                                            <li>{lang === 'id' ? 'Pilih "Tautkan dengan nomor telepon saja".' : 'Tap "Link with phone number instead".'}</li>
                                            <li>{lang === 'id' ? 'Ketikkan kode 8-digit di atas.' : 'Enter the 8-digit code above.'}</li>
                                        </ol>
                                        <p className="text-[10px] text-emerald-400/90 pt-1 border-t border-white/5 font-semibold">
                                            📢 {lang === 'id' 
                                                ? 'Setelah terhubung, bot otomatis mengirim siaran nomor baru ke grup WhatsApp!' 
                                                : 'Once connected, bot automatically broadcasts the new number to groups!'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Reset / Unlink Danger Action */}
                            {isConnected && (
                                <div className="p-3 rounded-xl bg-red-950/20 border border-red-500/30 flex items-center justify-between gap-3">
                                    <div className="text-xs">
                                        <span className="font-bold text-red-400 block">
                                            {lang === 'id' ? 'Putuskan Sesi Nomor Saat Ini' : 'Unlink Current Session'}
                                        </span>
                                        <span className="text-[11px] text-muted-foreground">
                                            {lang === 'id' ? 'Hapus sesi jika nomor bermasalah atau terblokir.' : 'Remove session if blocked or failing.'}
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        disabled={unlinking}
                                        onClick={handleUnlinkSession}
                                        className="bg-red-600/80 hover:bg-red-600 text-white font-bold text-xs h-8 px-3 shrink-0 gap-1.5 cursor-pointer"
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
                                <div className="p-6 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
                                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                                    <h4 className="font-bold text-sm text-[#FAFAFA]">
                                        {lang === 'id' ? 'WhatsApp Bot Sudah Terhubung!' : 'WhatsApp Bot is Connected!'}
                                    </h4>
                                    <p className="text-xs text-muted-foreground">
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
                                            className="text-xs h-8 gap-1.5 cursor-pointer"
                                        >
                                            <Unlink className="w-3.5 h-3.5" />
                                            <span>{lang === 'id' ? 'Putuskan & Scan Ulang' : 'Unlink & Re-scan'}</span>
                                        </Button>
                                    </div>
                                </div>
                            ) : authState?.qr ? (
                                <div className="p-4 rounded-xl bg-black/60 border border-white/10 space-y-3">
                                    <div className="bg-white p-3 rounded-xl inline-block shadow-lg mx-auto">
                                        <img 
                                            src={authState.qr} 
                                            alt="WhatsApp Bot QR Code" 
                                            className="w-48 h-48 sm:w-56 sm:h-56 object-contain block mx-auto"
                                        />
                                    </div>
                                    <p className="text-xs text-stone-300">
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
                                            className="text-xs h-8 gap-1.5 border-border"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            <span>{lang === 'id' ? 'Segarkan QR' : 'Refresh QR'}</span>
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-6 rounded-xl bg-[#2A281E] border border-border/60 space-y-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto" />
                                    <p className="text-xs text-stone-300">
                                        {lang === 'id' 
                                            ? 'Menunggu QR Code dari bot... Nyalakan bot atau gunakan tab Pairing Code.' 
                                            : 'Waiting for QR Code... Start bot or use Pairing Code tab.'}
                                    </p>
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleStartBot}
                                        disabled={actionLoading}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 gap-1.5"
                                    >
                                        <Play className="w-3.5 h-3.5 fill-white" />
                                        <span>{lang === 'id' ? 'Nyalakan Bot' : 'Start Bot'}</span>
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Toggle Log View (Snippet) */}
                    <div className="pt-1 border-t border-white/5">
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

                <DialogFooter className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-stone-500">
                        Telunas Resort WhatsApp Bot Engine
                    </span>
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
