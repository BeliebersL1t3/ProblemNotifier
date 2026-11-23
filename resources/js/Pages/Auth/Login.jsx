import axios from 'axios';
import Checkbox from '@/Components/Checkbox';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import GuestLayout from '@/Layouts/GuestLayout';
import { useLanguage } from '@/context/LanguageContext';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    Bug,
    CheckCircle2,
    KeyRound,
    Loader2,
    LogIn,
    Power,
    Search,
    Shield,
    Users,
} from 'lucide-react';

const MAX_BOT_POLL_ATTEMPTS = 12;
const BOT_POLL_INTERVAL_MS = 2000;

export default function Login({
    status,
    canResetPassword,
    canRegister = false,
    canRecoverBot = false,
    botRecoveryState = null,
    botRecoveryExpiresAt = 0,
    serverNow = 0,
    devDebugAuthEnabled = false,
    devDebugAccounts = [],
    isAdminPortal = false,
    loginPostUrl = null,
}) {
    const { lang } = useLanguage();
    const isEn = lang === 'en';
    const isEnRef = useRef(isEn);
    isEnRef.current = isEn;

    const { data, setData, post, processing, errors, reset, transform } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    const [botStarting, setBotStarting] = useState(false);
    const [botPolling, setBotPolling] = useState(false);
    const [recoveryPhase, setRecoveryPhase] = useState(() =>
        canRecoverBot && botRecoveryState === 'needs_pairing' ? 'needs_pairing' : 'idle'
    );
    const [recoveryMessage, setRecoveryMessage] = useState(null);
    const [clockAnchor, setClockAnchor] = useState(() => ({
        clientTs: Math.floor(Date.now() / 1000),
        serverTs: Number(serverNow) || Math.floor(Date.now() / 1000),
    }));
    const [nowTick, setNowTick] = useState(() => Math.floor(Date.now() / 1000));

    const pollTimeoutRef = useRef(null);
    const isMountedRef = useRef(true);

    const stopPolling = useCallback(() => {
        if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
        }
        if (isMountedRef.current) {
            setBotPolling(false);
        }
    }, []);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (pollTimeoutRef.current) {
                clearTimeout(pollTimeoutRef.current);
                pollTimeoutRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const syncedServerTs = Number(serverNow) || Math.floor(Date.now() / 1000);
        const clientTs = Math.floor(Date.now() / 1000);
        setClockAnchor({ clientTs, serverTs: syncedServerTs });
        setNowTick(clientTs);

        if (!canRecoverBot) {
            stopPolling();
            setRecoveryPhase('idle');
            setRecoveryMessage(null);
        } else if (botRecoveryState === 'needs_pairing') {
            setRecoveryPhase('needs_pairing');
            setRecoveryMessage(
                isEn
                    ? 'The bot is running, but its WhatsApp session is disconnected or unpaired. Restore via server CLI (node bot-v2.js) or set LOGIN_OTP_ENABLED=false in .env for emergency recovery.'
                    : 'Bot menyala namun sesi WhatsApp terputus atau belum ter-pair. Pulihkan sesi via CLI server (node bot-v2.js) atau ubah LOGIN_OTP_ENABLED=false di .env untuk pemulihan darurat.'
            );
        }
    }, [canRecoverBot, botRecoveryState, botRecoveryExpiresAt, serverNow, stopPolling, isEn]);

    useEffect(() => {
        if (!canRecoverBot || !botRecoveryExpiresAt) {
            return;
        }
        const timer = setInterval(() => {
            setNowTick(Math.floor(Date.now() / 1000));
        }, 1000);
        return () => clearInterval(timer);
    }, [canRecoverBot, botRecoveryExpiresAt]);

    const estimatedServerNow = clockAnchor.serverTs + Math.max(0, nowTick - clockAnchor.clientTs);
    const recoverySecondsLeft = canRecoverBot && botRecoveryExpiresAt
        ? Math.max(0, Number(botRecoveryExpiresAt) - estimatedServerNow)
        : 0;
    const isRecoveryActive = Boolean(
        canRecoverBot && recoverySecondsLeft > 0 && recoveryPhase !== 'expired'
    );

    const pollBotReadiness = useCallback(async (attempt = 1) => {
        if (!isMountedRef.current) return;
        const enNow = isEnRef.current;

        try {
            const res = await axios.get(route('login.bot.status'));
            if (!isMountedRef.current) return;

            const payload = res.data || {};
            if (payload.status === 'otp_sent' && payload.redirect) {
                stopPolling();
                setRecoveryPhase('otp_sent');
                setRecoveryMessage(
                    payload.message ||
                        (enNow
                            ? 'Bot is active and OTP has been sent. Redirecting...'
                            : 'Bot aktif dan OTP terkirim. Mengalihkan...')
                );
                router.visit(payload.redirect);
                return;
            }

            if (payload.status === 'needs_pairing') {
                stopPolling();
                setRecoveryPhase('needs_pairing');
                setRecoveryMessage(payload.message);
                return;
            }

            setRecoveryPhase('booting');
            setRecoveryMessage(
                payload.message ||
                    (enNow
                        ? 'Waiting for WhatsApp Bot to connect...'
                        : 'Menunggu Bot WhatsApp terhubung...')
            );

            if (attempt >= MAX_BOT_POLL_ATTEMPTS) {
                stopPolling();
                setRecoveryPhase('error');
                setRecoveryMessage(
                    enNow
                        ? 'The bot is still connecting to WhatsApp. Click "Activate Bot" again to recheck and dispatch the OTP.'
                        : 'Bot masih menghubungkan sesi WhatsApp. Klik tombol "Aktifkan Bot" lagi untuk mengecek ulang dan mengirim OTP.'
                );
                return;
            }

            pollTimeoutRef.current = setTimeout(() => {
                pollBotReadiness(attempt + 1);
            }, BOT_POLL_INTERVAL_MS);
        } catch (err) {
            console.error('[LoginBotRecovery] Polling status gagal:', err);
            if (!isMountedRef.current) return;

            const httpStatus = err.response?.status;
            const errMsg = err.response?.data?.message;

            if (httpStatus === 403 || httpStatus === 419) {
                stopPolling();
                setRecoveryPhase('expired');
                setRecoveryMessage(
                    errMsg ||
                        (enNow
                            ? 'Admin bot recovery session has expired. Please re-enter your Admin email & password.'
                            : 'Sesi pemulihan bot telah berakhir. Silakan masukkan ulang email & password Admin.')
                );
                return;
            }

            if (httpStatus === 503 && attempt < MAX_BOT_POLL_ATTEMPTS) {
                setRecoveryPhase('booting');
                setRecoveryMessage(
                    errMsg ||
                        (enNow
                            ? 'Bot connected, retrying OTP delivery...'
                            : 'Bot terhubung, mencoba ulang pengiriman OTP...')
                );
                pollTimeoutRef.current = setTimeout(() => {
                    pollBotReadiness(attempt + 1);
                }, BOT_POLL_INTERVAL_MS);
                return;
            }

            stopPolling();
            setRecoveryPhase('error');
            setRecoveryMessage(
                errMsg ||
                    (enNow
                        ? 'Failed checking WhatsApp Bot status on the server.'
                        : 'Gagal memeriksa status Bot WhatsApp di server.')
            );
        }
    }, [stopPolling]);

    const handleActivateBot = async () => {
        if (botStarting || botPolling || !isRecoveryActive) {
            return;
        }

        stopPolling();
        setBotStarting(true);
        setRecoveryPhase('booting');
        setRecoveryMessage(
            isEn
                ? 'Sending command to start the WhatsApp Bot...'
                : 'Mengirim perintah menyalakan Bot WhatsApp...'
        );

        try {
            const res = await axios.post(route('login.bot.start'));
            if (!isMountedRef.current) return;

            const payload = res.data || {};
            if (payload.status === 'otp_sent' && payload.redirect) {
                setRecoveryPhase('otp_sent');
                setRecoveryMessage(
                    payload.message ||
                        (isEn
                            ? 'Bot is active and OTP code sent! Redirecting...'
                            : 'Bot aktif dan kode OTP terkirim! Mengalihkan...')
                );
                router.visit(payload.redirect);
                return;
            }

            if (payload.status === 'needs_pairing') {
                setRecoveryPhase('needs_pairing');
                setRecoveryMessage(payload.message);
                return;
            }

            setBotPolling(true);
            setRecoveryPhase('booting');
            setRecoveryMessage(
                payload.message ||
                    (isEn
                        ? 'Bot is starting, waiting for WhatsApp connection...'
                        : 'Bot sedang dinyalakan, menunggu koneksi WhatsApp...')
            );
            pollTimeoutRef.current = setTimeout(() => {
                pollBotReadiness(1);
            }, BOT_POLL_INTERVAL_MS);
        } catch (err) {
            console.error('[LoginBotRecovery] Gagal mengaktifkan bot:', err);
            if (!isMountedRef.current) return;

            const httpStatus = err.response?.status;
            const errMsg = err.response?.data?.message;

            if (httpStatus === 403 || httpStatus === 419) {
                setRecoveryPhase('expired');
                setRecoveryMessage(
                    errMsg ||
                        (isEn
                            ? 'Admin bot recovery session has expired. Please re-enter your Admin email & password.'
                            : 'Sesi pemulihan bot telah berakhir. Silakan masukkan ulang email & password Admin.')
                );
                return;
            }

            setRecoveryPhase('error');
            setRecoveryMessage(
                errMsg ||
                    (isEn
                        ? 'An error occurred while trying to start the WhatsApp Bot.'
                        : 'Terjadi kendala saat mencoba menyalakan Bot WhatsApp.')
            );
        } finally {
            if (isMountedRef.current) {
                setBotStarting(false);
            }
        }
    };

    const submit = (e) => {
        e.preventDefault();
        stopPolling();
        setRecoveryPhase('idle');
        setRecoveryMessage(null);

        const formEl = e.currentTarget;
        const emailVal = formEl.elements?.namedItem('email')?.value ?? data.email;
        const passwordVal = formEl.elements?.namedItem('password')?.value ?? data.password;

        transform((currentData) => ({
            ...currentData,
            email: (emailVal || '').trim(),
            password: passwordVal || '',
        }));

        post(loginPostUrl || route('login'), {
            onFinish: () => reset('password'),
        });
    };

    const emailErrLower = String(errors.email || '').toLowerCase();
    const isPendingOrRejected = Boolean(
        errors.email && (
            emailErrLower.includes('ditolak') ||
            emailErrLower.includes('belum aktif') ||
            emailErrLower.includes('dinonaktifkan') ||
            emailErrLower.includes('rejected') ||
            emailErrLower.includes('not active yet') ||
            emailErrLower.includes('deactivated')
        )
    );

    const botBusy = botStarting || botPolling;
    const leftRecoveryButton = (isAdminPortal && isRecoveryActive) ? (
        <button
            type="button"
            onClick={handleActivateBot}
            disabled={botBusy || recoveryPhase === 'otp_sent'}
            title={
                isEn
                    ? 'Admin-only recovery: start the WhatsApp Bot so it can deliver OTP codes'
                    : 'Pemulihan khusus Admin: nyalakan Bot WhatsApp agar dapat mengirim kode OTP'
            }
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold shadow-sm transition ${
                botBusy
                    ? 'border-amber-300 bg-amber-50 text-amber-800 cursor-wait'
                    : recoveryPhase === 'needs_pairing'
                    ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    : 'border-indigo-200 bg-white/95 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300'
            } disabled:opacity-75`}
        >
            {botBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
            ) : (
                <Power className="h-3.5 w-3.5" />
            )}
            <span>
                {botStarting
                    ? (isEn ? 'Starting Bot...' : 'Menyalakan Bot...')
                    : botPolling
                    ? (isEn ? 'Connecting WA...' : 'Menghubungkan WA...')
                    : recoveryPhase === 'needs_pairing'
                    ? (isEn ? 'Recheck Bot' : 'Cek Ulang Bot')
                    : (isEn ? 'Activate Bot' : 'Aktifkan Bot')}
            </span>
        </button>
    ) : null;

    // Local-only Debug Account Panel state & handlers
    const [debugSearch, setDebugSearch] = useState('');
    const [debugRoleFilter, setDebugRoleFilter] = useState('all'); // 'all' | 'admin' | 'staff'
    const [quickLoginUserId, setQuickLoginUserId] = useState(null);

    const filteredDebugAccounts = useMemo(() => {
        if (!devDebugAuthEnabled || !Array.isArray(devDebugAccounts)) return [];
        const q = debugSearch.trim().toLowerCase();
        return devDebugAccounts.filter((acc) => {
            if (debugRoleFilter === 'admin' && acc.role !== 'admin') return false;
            if (debugRoleFilter === 'staff' && acc.role === 'admin') return false;
            if (!q) return true;
            return (
                String(acc.name || '').toLowerCase().includes(q) ||
                String(acc.email || '').toLowerCase().includes(q) ||
                String(acc.department || '').toLowerCase().includes(q) ||
                String(acc.subdivision || '').toLowerCase().includes(q) ||
                String(acc.role || '').toLowerCase().includes(q)
            );
        });
    }, [devDebugAuthEnabled, devDebugAccounts, debugSearch, debugRoleFilter]);

    const handleFillDebugAccount = (acc) => {
        setData({
            ...data,
            email: acc.email || '',
            password: acc.dev_password || '',
        });
    };

    const handleDevQuickLogin = (acc) => {
        if (quickLoginUserId !== null || !acc?.id) return;
        setQuickLoginUserId(acc.id);
        router.post(
            route('dev.quick-login'),
            { user_id: acc.id },
            {
                preserveScroll: true,
                onError: (err) => {
                    console.error('[Login] Dev quick login failed:', err);
                    setQuickLoginUserId(null);
                },
                onFinish: () => {
                    setQuickLoginUserId(null);
                },
            }
        );
    };

    const devDebugPanel =
        devDebugAuthEnabled && Array.isArray(devDebugAccounts) && devDebugAccounts.length > 0 ? (
            <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-amber-300/60 bg-white/95 text-gray-900 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-md max-h-[540px]">
                {/* Header */}
                <div className="border-b border-gray-200 bg-amber-50/90 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 border border-amber-300">
                                <Bug className="h-4 w-4" />
                            </span>
                            <div>
                                <h4 className="text-xs font-extrabold text-gray-900 tracking-tight">
                                    {isEn ? 'Debug Account Switcher' : 'Panel Debug Akun'}
                                </h4>
                                <p className="text-[10px] font-semibold text-amber-700">
                                    LOCAL + APP_DEBUG ONLY
                                </p>
                            </div>
                        </div>
                        <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            {filteredDebugAccounts.length}/{devDebugAccounts.length}
                        </span>
                    </div>

                    {/* Search & Role Filter */}
                    <div className="mt-2.5 flex items-center gap-1.5">
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={debugSearch}
                                onChange={(e) => setDebugSearch(e.target.value)}
                                placeholder={isEn ? 'Search name, email, dept...' : 'Cari nama, email, dept...'}
                                className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-2.5 text-[11px] text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-[10px] font-bold">
                            {[
                                { id: 'all', label: isEn ? 'All' : 'Semua' },
                                { id: 'admin', label: 'Admin' },
                                { id: 'staff', label: 'Staff' },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setDebugRoleFilter(tab.id)}
                                    className={`rounded-md px-2 py-1 transition-all cursor-pointer ${
                                        debugRoleFilter === tab.id
                                            ? 'bg-indigo-600 text-white shadow-2xs'
                                            : 'text-gray-500 hover:text-gray-900'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Scrollable Account List */}
                <div className="flex-1 overflow-y-auto divide-y divide-gray-100 p-2 space-y-1.5">
                    {filteredDebugAccounts.length === 0 ? (
                        <div className="py-10 text-center text-xs text-gray-400">
                            {isEn ? 'No matching accounts found.' : 'Tidak ada akun yang cocok.'}
                        </div>
                    ) : (
                        filteredDebugAccounts.map((acc) => {
                            const isAdmin = acc.role === 'admin';
                            const isLoggingIn = quickLoginUserId === acc.id;
                            const isSelectedInForm = data.email === acc.email;

                            return (
                                <div
                                    key={acc.id}
                                    className={`rounded-xl border p-2.5 transition-all ${
                                        isSelectedInForm
                                            ? 'border-indigo-400 bg-indigo-50/60 shadow-2xs'
                                            : 'border-gray-200/90 bg-gray-50/60 hover:border-indigo-300 hover:bg-white'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="truncate text-xs font-bold text-gray-900">
                                                    {acc.name}
                                                </span>
                                                {isAdmin ? (
                                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 border border-rose-200 px-1.5 py-0.2 text-[9px] font-bold text-rose-700">
                                                        <Shield className="h-2.5 w-2.5" />
                                                        Admin
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 border border-sky-200 px-1.5 py-0.2 text-[9px] font-bold text-sky-800">
                                                        <Users className="h-2.5 w-2.5" />
                                                        {acc.department || acc.role || 'Staff'}
                                                        {acc.subdivision && acc.subdivision !== acc.department
                                                            ? ` • ${acc.subdivision}`
                                                            : ''}
                                                    </span>
                                                )}
                                                {acc.is_hod && (
                                                    <span className="rounded-full bg-amber-100 border border-amber-300 px-1.5 py-0.2 text-[9px] font-bold text-amber-800">
                                                        HOD
                                                    </span>
                                                )}
                                                {!acc.is_active && (
                                                    <span className="rounded-full bg-gray-200 px-1.5 py-0.2 text-[9px] font-bold text-gray-600">
                                                        Nonaktif
                                                    </span>
                                                )}
                                            </div>

                                            <p className="mt-0.5 truncate font-mono text-[10.5px] text-gray-600 select-all">
                                                {acc.email}
                                            </p>

                                            <div className="mt-1 flex items-center gap-1.5">
                                                <KeyRound className="h-3 w-3 shrink-0 text-gray-400" />
                                                {acc.dev_password ? (
                                                    <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 font-mono text-[10px] font-bold text-emerald-700 select-all">
                                                        {acc.dev_password}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] italic text-gray-400">
                                                        {isEn ? 'Custom Password (Hashed)' : 'Password Pribadi (Hash)'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handleFillDebugAccount(acc)}
                                                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[10px] font-bold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                                title={isEn ? 'Fill email & default password into form' : 'Isi email & password ke form login'}
                                            >
                                                {isEn ? 'Fill' : 'Isi'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDevQuickLogin(acc)}
                                                disabled={!acc.is_active || quickLoginUserId !== null}
                                                className="inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
                                                title={isEn ? '1-click local dev login (bypasses OTP)' : 'Login dev 1-klik (lewati OTP WA)'}
                                            >
                                                {isLoggingIn ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <LogIn className="h-3 w-3" />
                                                )}
                                                <span>{isEn ? 'Login' : 'Masuk'}</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Hint */}
                <div className="border-t border-gray-200 bg-gray-50 px-3 py-2 text-[10px] text-gray-500 leading-snug">
                    {isEn
                        ? 'Auto-hidden in production (APP_ENV !== local or APP_DEBUG=false). "Login" bypasses WA OTP for local testing.'
                        : 'Otomatis hilang di production. Tombol "Masuk" langsung login tanpa OTP WA khusus untuk testing lokal.'}
                </div>
            </div>
        ) : null;

    return (
        <GuestLayout leftBottomAction={leftRecoveryButton} rightSidePanel={devDebugPanel}>
            <Head
                title={
                    isAdminPortal
                        ? (isEn ? 'Admin Portal — Telunas Issue Tracker' : 'Portal Admin — Telunas Issue Tracker')
                        : (isEn ? 'Sign In — Telunas Issue Tracker' : 'Masuk — Telunas Issue Tracker')
                }
            />

            <div className="mb-6">
                {isAdminPortal && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 text-amber-400 text-[11px] font-bold tracking-wide uppercase mb-3 shadow-xs border border-slate-700">
                        <Shield className="w-3.5 h-3.5 text-amber-400" />
                        <span>{isEn ? 'Admin & Server Recovery Portal' : 'Portal Admin & Pemulihan Server'}</span>
                    </div>
                )}
                <h3 className="text-xl font-bold text-gray-900 tracking-tight">
                    {isAdminPortal
                        ? (isEn ? 'Admin Portal Sign In' : 'Masuk Portal Administrator')
                        : (isEn ? 'Sign In to Account' : 'Masuk ke Akun')}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                    {isAdminPortal
                        ? (isEn ? 'Special access for system administrators & bot recovery.' : 'Akses khusus administrator sistem & pemulihan server bot.')
                        : (isEn ? 'Enter your resort account email and password.' : 'Silakan masukkan email dan password akun resort Anda.')}
                </p>
            </div>

            {status === 'registration-pending' && (
                <div className="mb-5 rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800">
                    <div className="flex items-start gap-2">
                        <span className="text-base">⏳</span>
                        <div>
                            <p className="font-semibold text-emerald-900">
                                {isEn ? 'Registration Submitted!' : 'Pendaftaran Berhasil Dikirim!'}
                            </p>
                            <p className="mt-0.5">
                                {isEn ? (
                                    <>Your account request is awaiting review by your <strong>Department HOD</strong> and <strong>Admin</strong>. You will receive a WhatsApp notification once activated.</>
                                ) : (
                                    <>Permohonan akun Anda saat ini sedang menunggu tinjauan dari <strong>HOD Departemen</strong> dan <strong>Admin</strong>. Anda akan menerima pemberitahuan via WhatsApp dan dapat login setelah akun diaktifkan.</>
                                )}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {status && status !== 'registration-pending' && (
                <div className="mb-4 text-xs font-medium text-emerald-600 bg-emerald-50 p-2.5 rounded border border-emerald-200">
                    {status}
                </div>
            )}

            {isPendingOrRejected && (
                <div className="mb-5 rounded-lg bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800">
                    <div className="flex items-start gap-2">
                        <span className="text-base">⚠️</span>
                        <div>
                            <p className="font-semibold text-rose-900">
                                {isEn ? 'Account Status Notice' : 'Perhatian Status Akun'}
                            </p>
                            <p className="mt-0.5">{errors.email}</p>
                        </div>
                    </div>
                </div>
            )}

            {isAdminPortal && recoveryMessage && recoveryPhase !== 'idle' && (
                <div
                    className={`mb-4 rounded-lg border p-3 text-xs flex items-start gap-2 ${
                        recoveryPhase === 'otp_sent'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : recoveryPhase === 'booting'
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                >
                    {recoveryPhase === 'otp_sent' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                    ) : recoveryPhase === 'booting' ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-600 mt-0.5" />
                    ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    )}
                    <div>
                        <p className="font-semibold">
                            {recoveryPhase === 'booting'
                                ? (isEn ? 'Admin Bot Recovery' : 'Pemulihan Bot Admin')
                                : recoveryPhase === 'otp_sent'
                                ? (isEn ? 'Bot Active' : 'Bot Aktif')
                                : (isEn ? 'WhatsApp Bot Status' : 'Status Bot WhatsApp')}
                        </p>
                        <p className="mt-0.5 leading-relaxed">{recoveryMessage}</p>
                    </div>
                </div>
            )}

            <form onSubmit={submit} className="space-y-4">
                <div>
                    <InputLabel htmlFor="email" value="Email" />

                    <TextInput
                        id="email"
                        type="email"
                        name="email"
                        value={data.email}
                        className="mt-1 block w-full text-sm"
                        autoComplete="username"
                        isFocused={true}
                        placeholder={isEn ? 'name@telunasresorts.com' : 'nama@telunasresorts.com'}
                        onChange={(e) => setData('email', e.target.value)}
                        required
                    />

                    {!isPendingOrRejected && recoveryPhase === 'idle' && <InputError message={errors.email} className="mt-1.5" />}
                </div>

                <div>
                    <InputLabel htmlFor="password" value={isEn ? 'Password' : 'Password'} />

                    <TextInput
                        id="password"
                        type="password"
                        name="password"
                        value={data.password}
                        className="mt-1 block w-full text-sm"
                        autoComplete="current-password"
                        onChange={(e) => setData('password', e.target.value)}
                        required
                    />

                    <InputError message={errors.password} className="mt-1.5" />
                </div>

                <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center cursor-pointer">
                        <Checkbox
                            name="remember"
                            checked={data.remember}
                            onChange={(e) =>
                                setData('remember', e.target.checked)
                            }
                        />
                        <span className="ms-2 text-gray-600">
                            {isEn ? 'Remember me' : 'Ingat saya'}
                        </span>
                    </label>

                    {canResetPassword && (
                        <Link
                            href={route('password.request')}
                            className="text-gray-500 hover:text-indigo-600 underline"
                        >
                            {isEn ? 'Forgot password?' : 'Lupa password?'}
                        </Link>
                    )}
                </div>

                <div className="pt-2">
                    <PrimaryButton className="w-full justify-center py-2.5 bg-indigo-600 hover:bg-indigo-700 shadow-sm" disabled={processing}>
                        {processing
                            ? (isEn ? 'Verifying...' : 'Memverifikasi...')
                            : (isEn ? 'Sign In to Dashboard' : 'Masuk ke Dashboard')}
                    </PrimaryButton>
                </div>

                {canRegister && (
                    <div className="mt-6 pt-4 border-t border-gray-100 text-center">
                        <p className="text-xs text-gray-500">
                            {isEn ? "Don't have a staff account?" : 'Belum memiliki akun staf?'}{' '}
                            <Link
                                href={route('register')}
                                className="font-semibold text-indigo-600 hover:text-indigo-800 underline ml-1"
                            >
                                {isEn ? 'Register here' : 'Daftar di sini'}
                            </Link>
                        </p>
                    </div>
                )}
            </form>
        </GuestLayout>
    );
}
