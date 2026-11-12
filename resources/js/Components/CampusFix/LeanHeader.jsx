import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Link, router, usePage } from '@inertiajs/react';
import {
    Table,
    LayoutGrid,
    BarChart3,
    CloudUpload,
    Wifi,
    WifiOff,
    Sun,
    Moon,
    Ticket,
    Users,
    LogOut,
    LogIn,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useLeanTheme } from '@/hooks/useLeanTheme';
import { BotControlModal } from '@/Components/CampusFix/BotControlModal';
import { MandatoryRealEmailModal } from '@/Components/CampusFix/MandatoryRealEmailModal';
import NotificationDropdown from '@/Components/CampusFix/NotificationDropdown';
import NotificationToast from '@/Components/CampusFix/NotificationToast';

export function LeanHeader({
    activePage = 'dashboard', // 'dashboard' | 'tickets' | 'users' | 'profile'
    viewMode = 'cards',
    onViewModeChange = null,
    currentUser = null,
    outboxProps = null, // { outboxCount, isOnline, onOpenOutbox }
    onBotStatusChange = null,
}) {
    const { props: pageProps } = usePage();
    const authUser = pageProps?.auth?.user || null;
    const effectiveUser = currentUser || authUser;
    const webNotificationsEnabled = Boolean(pageProps?.features?.web_notifications);

    const { lang, setLang } = useLanguage();
    const isEn = lang === 'en';
    const { isDark, toggleTheme } = useLeanTheme();

    const isAdmin = Boolean(effectiveUser?.is_admin || effectiveUser?.role === 'admin');
    const displayName = effectiveUser?.staff_name || effectiveUser?.name || 'Supervisor';
    const displayDept = effectiveUser?.department || 'Supervisor';
    const avatarSrc =
        effectiveUser?.avatar_url ||
        (effectiveUser?.avatar
            ? effectiveUser.avatar.startsWith('http')
                ? effectiveUser.avatar
                : `/uploads/avatars/${effectiveUser.avatar}`
            : null);

    const formatDeptDisplay = (dept) => (dept === 'Umum' && isEn ? 'General' : dept);

    // --- WhatsApp Bot V2 Status Polling & Control Modal ---
    const [botControlModalOpen, setBotControlModalOpen] = useState(false);
    const [botStatus, setBotStatus] = useState(null);

    const fetchBotStatus = useCallback(async () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        try {
            let res;
            try {
                res = await axios.get('/api/bot/status');
            } catch (apiErr) {
                console.warn('[LeanHeader] /api/bot/status fallback to /bot/status:', apiErr?.message || apiErr);
                res = await axios.get('/bot/status');
            }
            if (res?.data) {
                setBotStatus(res.data);
                onBotStatusChange?.(res.data);
            }
        } catch (err) {
            console.warn('[LeanHeader] Failed polling bot status:', err?.message || err);
        }
    }, [onBotStatusChange]);

    useEffect(() => {
        fetchBotStatus();
        const timer = setInterval(fetchBotStatus, 10000);
        const handleFocus = () => {
            if (typeof document !== 'undefined' && !document.hidden) {
                fetchBotStatus();
            }
        };
        window.addEventListener('focus', handleFocus);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', handleFocus);
        };
    }, [fetchBotStatus]);

    const handleViewSwitch = (targetView) => {
        if (activePage === 'dashboard' && typeof onViewModeChange === 'function') {
            onViewModeChange(targetView);
        } else {
            router.visit(`/?view=${targetView}`);
        }
    };

    const isDashboard = activePage === 'dashboard';
    const isTickets = activePage === 'tickets';
    const isUsers = activePage === 'users';
    const isProfile = activePage === 'profile';

    const viewBtnClass = (targetView) => {
        const active = isDashboard && viewMode === targetView;
        if (active) {
            return 'bg-emerald-600 text-white shadow-sm keep-white';
        }
        return isDark
            ? 'text-slate-400 hover:text-slate-200'
            : 'text-slate-600 hover:text-slate-900 hover:bg-white';
    };

    const navChipBase =
        'h-7 sm:h-8 flex items-center justify-center gap-1.5 rounded-lg border text-xs font-bold transition-all shadow-xs shrink-0';

    const inactiveNavClass = isDark
        ? 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-slate-700'
        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300';

    const activeEmeraldNavClass =
        'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-sm ring-1 ring-emerald-400/40 keep-white';

    const outboxCount = outboxProps?.outboxCount ?? 0;
    const isOnline = outboxProps?.isOnline ?? true;

    return (
        <>
            {webNotificationsEnabled && <NotificationToast />}
            <MandatoryRealEmailModal user={authUser || effectiveUser} />

            {/* TOP HEADER */}
            <header
                className={`sticky top-0 z-40 backdrop-blur-md border-b px-2 sm:px-6 lg:px-8 py-2 sm:py-2.5 shadow-xs transition-colors duration-200 w-full max-w-full ${
                    isDark
                        ? 'bg-slate-900/95 border-slate-800 shadow-slate-950/40'
                        : 'bg-white/95 border-slate-200 shadow-slate-200/50'
                }`}
            >
                <div className="w-full flex items-center justify-between gap-1 sm:gap-3">
                    {/* Brand (Left) */}
                    <Link href="/" className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink group">
                        <div
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden flex items-center justify-center border shadow-xs shrink-0 ${
                                isDark ? 'bg-slate-800 border-emerald-500/40' : 'bg-white border-emerald-200'
                            }`}
                        >
                            <img src="/logo.png" alt="Telunas Resorts" className="w-full h-full object-contain p-0.5" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <h1
                                    className={`text-xs sm:text-sm font-bold tracking-tight truncate ${
                                        isDark ? 'text-white' : 'text-slate-900'
                                    }`}
                                >
                                    <span className="sm:hidden">Telunas</span>
                                    <span className="hidden sm:inline">Telunas Issue Tracker</span>
                                </h1>
                                <span
                                    className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 hidden lg:inline ${
                                        isDark
                                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                            : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                    }`}
                                >
                                    {isEn ? 'Operations' : 'Operasional'}
                                </span>
                            </div>
                            <p
                                className={`text-[10px] sm:text-[11px] truncate hidden md:block ${
                                    isDark ? 'text-slate-400' : 'text-slate-500'
                                }`}
                            >
                                Telunas Resorts Tracker
                            </p>
                        </div>
                    </Link>

                    {/* View Mode Switcher (Tabel ERP / Kartu / Analisis) */}
                    <div
                        className={`hidden md:flex items-center p-0.5 sm:p-1 rounded-xl border shrink-0 ${
                            isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200 shadow-xs'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => handleViewSwitch('table')}
                            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${viewBtnClass('table')}`}
                            title={isEn ? 'ERP Spreadsheet Table View' : 'Tampilan Tabel Spreadsheet ERP'}
                        >
                            <Table className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{isEn ? 'ERP Table' : 'Tabel ERP'}</span>
                            <span className="sm:hidden">{isEn ? 'Table' : 'Tabel'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleViewSwitch('cards')}
                            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${viewBtnClass('cards')}`}
                            title={isEn ? 'Visual Card View' : 'Tampilan Kartu Visual'}
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            <span>{isEn ? 'Cards' : 'Kartu'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleViewSwitch('analytics')}
                            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${viewBtnClass('analytics')}`}
                            title={isEn ? 'Operational Statistics & Resort Map Analytics' : 'Analisa Statistik Operasional & Peta Resort'}
                        >
                            <BarChart3 className="w-3.5 h-3.5" />
                            <span>{isEn ? 'Analytics' : 'Analisis'}</span>
                        </button>
                    </div>

                    {/* Right Action Bar */}
                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
                        {/* Offline / Outbox Status Pill (Dashboard Outbox Hook) */}
                        {outboxProps && (
                            <button
                                type="button"
                                onClick={outboxProps.onOpenOutbox}
                                className={`h-7 sm:h-8 flex items-center gap-1 px-1.5 sm:px-2.5 rounded-lg border text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0 ${
                                    outboxCount > 0
                                        ? isDark
                                            ? 'bg-amber-950/70 hover:bg-amber-900/80 text-amber-300 border-amber-500/60 animate-pulse'
                                            : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 animate-pulse'
                                        : isOnline
                                        ? isDark
                                            ? 'bg-slate-800/90 text-emerald-400 border-slate-700'
                                            : 'bg-white text-emerald-700 border-slate-200'
                                        : isDark
                                        ? 'bg-rose-950/70 text-rose-300 border-rose-600/50'
                                        : 'bg-rose-50 text-rose-800 border-rose-200'
                                }`}
                                title={
                                    outboxCount > 0
                                        ? isEn
                                            ? `${outboxCount} ticket(s) saved on device. Click to view / sync.`
                                            : `${outboxCount} tiket tersimpan di HP. Klik untuk melihat / sinkronkan.`
                                        : isOnline
                                        ? isEn
                                            ? 'Online (Connected to Internet)'
                                            : 'Online (Terhubung ke Internet)'
                                        : isEn
                                        ? 'Offline (0 Bars / No Signal)'
                                        : 'Offline (0 Bar / Tanpa Sinyal)'
                                }
                            >
                                {outboxCount > 0 ? (
                                    <>
                                        <CloudUpload className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                                        <span className={`text-[10px] sm:text-xs font-extrabold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                                            {isEn ? `${outboxCount} queued` : `${outboxCount} di HP`}
                                        </span>
                                    </>
                                ) : isOnline ? (
                                    <>
                                        <Wifi className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                        <span className="text-[10px] sm:text-xs hidden sm:inline">Online</span>
                                    </>
                                ) : (
                                    <>
                                        <WifiOff className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} />
                                        <span className="text-[10px] sm:text-xs">Offline</span>
                                    </>
                                )}
                            </button>
                        )}

                        {/* ID | EN Language Switcher */}
                        <div
                            className={`h-7 sm:h-8 flex items-center rounded-lg border p-0.5 text-[10px] sm:text-xs font-bold shadow-xs shrink-0 ${
                                isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-white border-slate-200'
                            }`}
                            role="group"
                            aria-label={isEn ? 'Language switcher' : 'Pemilih bahasa'}
                        >
                            <button
                                type="button"
                                onClick={() => setLang('id')}
                                className={`h-full px-1.5 sm:px-2 rounded-md transition-all cursor-pointer ${
                                    lang === 'id'
                                        ? 'bg-emerald-600 text-white shadow-xs keep-white'
                                        : isDark
                                        ? 'text-slate-400 hover:text-slate-200'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                ID
                            </button>
                            <button
                                type="button"
                                onClick={() => setLang('en')}
                                className={`h-full px-1.5 sm:px-2 rounded-md transition-all cursor-pointer ${
                                    lang === 'en'
                                        ? 'bg-emerald-600 text-white shadow-xs keep-white'
                                        : isDark
                                        ? 'text-slate-400 hover:text-slate-200'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                EN
                            </button>
                        </div>

                        {/* Quick Theme Toggle */}
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className={`h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg border transition-all shadow-xs cursor-pointer shrink-0 ${
                                isDark
                                    ? 'bg-slate-800/90 hover:bg-slate-700 text-amber-300 border-slate-700'
                                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                            title={
                                isDark
                                    ? isEn
                                        ? 'Switch to Light Mode'
                                        : 'Beralih ke Mode Terang'
                                    : isEn
                                    ? 'Switch to Dark Mode'
                                    : 'Beralih ke Mode Gelap'
                            }
                            aria-label={isEn ? 'Toggle Theme' : 'Toggle Tema'}
                        >
                            {isDark ? (
                                <Sun className="w-3.5 h-3.5 text-amber-400" />
                            ) : (
                                <Moon className="w-3.5 h-3.5 text-slate-600" />
                            )}
                        </button>

                        {/* WhatsApp Bot V2 Status */}
                        {isAdmin ? (
                            <button
                                type="button"
                                onClick={() => setBotControlModalOpen(true)}
                                className={`h-8 hidden sm:flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 rounded-lg border text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0 ${
                                    botStatus?.connected
                                        ? isDark
                                            ? 'bg-emerald-950/70 hover:bg-emerald-900/80 border-emerald-600/50 text-emerald-300'
                                            : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800'
                                        : isDark
                                        ? 'bg-rose-950/70 hover:bg-rose-900/80 border-rose-600/50 text-rose-300'
                                        : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-800'
                                }`}
                                title={
                                    isEn
                                        ? 'Click to Control WA Bot (View Status / Stop / Start)'
                                        : 'Klik untuk Kontrol Bot WA (Lihat Status / Matikan / Nyalakan)'
                                }
                            >
                                <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                        botStatus?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                                    }`}
                                />
                                <span className="hidden lg:inline">Bot WA:</span>
                                <span className="text-[10px] sm:text-xs">
                                    {botStatus?.connected ? 'Online' : 'Offline'}
                                </span>
                            </button>
                        ) : (
                            <div
                                className={`h-8 hidden sm:flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 rounded-lg border text-xs font-bold shadow-xs shrink-0 ${
                                    botStatus?.connected
                                        ? isDark
                                            ? 'bg-emerald-950/70 border-emerald-600/50 text-emerald-300'
                                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                        : isDark
                                        ? 'bg-rose-950/70 border-rose-600/50 text-rose-300'
                                        : 'bg-rose-50 border-rose-200 text-rose-800'
                                }`}
                                title={
                                    isEn
                                        ? 'WhatsApp Bot Connection Status (Bot control is Admin only)'
                                        : 'Status Koneksi WhatsApp Bot (Kontrol bot hanya untuk Administrator)'
                                }
                            >
                                <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                        botStatus?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                                    }`}
                                />
                                <span className="hidden lg:inline">Bot WA:</span>
                                <span className="text-[10px] sm:text-xs">
                                    {botStatus?.connected ? 'Online' : 'Offline'}
                                </span>
                            </div>
                        )}

                        {effectiveUser ? (
                            <>
                                {/* Approval Tickets Link */}
                                <Link
                                    href="/tickets"
                                    className={`${navChipBase} ${
                                        isTickets
                                            ? `w-7 sm:w-auto px-0 sm:px-2.5 ${activeEmeraldNavClass}`
                                            : `w-7 sm:w-auto sm:px-2.5 ${inactiveNavClass} ${
                                                  isDark ? 'hover:border-amber-500/50' : ''
                                              }`
                                    }`}
                                    title={isEn ? 'Approval Tickets' : 'Tiket Persetujuan'}
                                    aria-label={isEn ? 'Approval Tickets' : 'Tiket Persetujuan'}
                                    aria-current={isTickets ? 'page' : undefined}
                                >
                                    <Ticket
                                        className={`w-3.5 h-3.5 shrink-0 ${
                                            isTickets ? 'text-white' : 'text-amber-500'
                                        }`}
                                    />
                                    <span className={isTickets ? 'hidden sm:inline' : 'hidden xl:inline'}>
                                        {isEn ? 'Tickets' : 'Tiket'}
                                    </span>
                                </Link>

                                {/* User Management & Audit Trail Link (Admin Only) */}
                                {isAdmin && (
                                    <Link
                                        href="/users"
                                        className={`${navChipBase} ${
                                            isUsers
                                                ? `w-7 sm:w-auto px-0 sm:px-2.5 ${activeEmeraldNavClass}`
                                                : `w-7 sm:w-auto sm:px-2.5 ${inactiveNavClass} ${
                                                      isDark ? 'hover:border-sky-500/50' : ''
                                                  }`
                                        }`}
                                        title={isEn ? 'User Management & Audit Trail' : 'Manajemen Pengguna & Audit Trail'}
                                        aria-label={isEn ? 'User Management' : 'Manajemen Pengguna'}
                                        aria-current={isUsers ? 'page' : undefined}
                                    >
                                        <Users
                                            className={`w-3.5 h-3.5 shrink-0 ${
                                                isUsers ? 'text-white' : 'text-sky-500'
                                            }`}
                                        />
                                        <span className={isUsers ? 'hidden sm:inline' : 'hidden xl:inline'}>
                                            {isEn ? 'Users' : 'Pengguna'}
                                        </span>
                                    </Link>
                                )}

                                {/* Notification Bell Dropdown (Controlled by WEB_NOTIFICATIONS_ENABLED feature flag) */}
                                {webNotificationsEnabled && (
                                    <NotificationDropdown themeVariant="lean" isDark={isDark} />
                                )}

                                {/* Account Profile Link */}
                                <Link
                                    href="/profile"
                                    className={`${navChipBase} w-7 sm:w-auto sm:px-2 ${
                                        isProfile
                                            ? activeEmeraldNavClass
                                            : `${inactiveNavClass} ${isDark ? 'hover:border-emerald-500/50' : ''}`
                                    }`}
                                    title={
                                        isEn
                                            ? `Profile Settings (${displayName})`
                                            : `Pengaturan Profil (${displayName})`
                                    }
                                    aria-label={isEn ? 'Account Profile' : 'Profil Akun'}
                                    aria-current={isProfile ? 'page' : undefined}
                                >
                                    {avatarSrc ? (
                                        <img
                                            src={avatarSrc}
                                            alt={displayName}
                                            className={`w-5 h-5 rounded-full object-cover shrink-0 border ${
                                                isProfile ? 'border-white/60' : 'border-emerald-500/40'
                                            }`}
                                        />
                                    ) : (
                                        <span
                                            className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                                                isProfile
                                                    ? 'bg-white/20 text-white border border-white/30 keep-white'
                                                    : 'bg-emerald-600 text-white keep-white'
                                            }`}
                                        >
                                            {(displayName || 'S').charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                    <span className="font-bold truncate hidden sm:inline sm:max-w-[100px] text-xs">
                                        {displayName}
                                    </span>
                                    <span
                                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border hidden xl:inline ${
                                            isProfile
                                                ? 'bg-white/20 border-white/30 text-white keep-white'
                                                : isAdmin
                                                ? isDark
                                                    ? 'text-amber-300 bg-amber-950/80 border-amber-700/60'
                                                    : 'text-amber-800 bg-amber-100 border-amber-300'
                                                : isDark
                                                ? 'text-emerald-400 bg-emerald-950/80 border-emerald-800/60'
                                                : 'text-emerald-800 bg-emerald-100 border-emerald-200'
                                        }`}
                                    >
                                        {isAdmin
                                            ? 'Admin'
                                            : effectiveUser?.hod_title
                                            ? effectiveUser.hod_title
                                            : effectiveUser?.is_hod
                                            ? `HOD ${formatDeptDisplay(displayDept)}`
                                            : effectiveUser?.subdivision
                                            ? effectiveUser.subdivision.toLowerCase() !== (displayDept || '').toLowerCase()
                                                ? `${effectiveUser.subdivision} (${formatDeptDisplay(displayDept)})`
                                                : effectiveUser.subdivision
                                            : formatDeptDisplay(displayDept)}
                                    </span>
                                </Link>

                                {/* Logout Button */}
                                <button
                                    type="button"
                                    onClick={() => router.post(route('logout'))}
                                    className={`h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg border transition-all shadow-xs cursor-pointer shrink-0 ${
                                        isDark
                                            ? 'bg-slate-800/90 hover:bg-rose-950/80 hover:text-rose-300 text-slate-300 border-slate-700 hover:border-rose-600/60'
                                            : 'bg-white hover:bg-rose-50 hover:text-rose-700 text-slate-700 border-slate-200 hover:border-rose-300'
                                    }`}
                                    title={isEn ? 'Sign Out (Logout)' : 'Keluar dari Akun (Logout)'}
                                    aria-label={isEn ? 'Sign Out' : 'Keluar dari Akun'}
                                >
                                    <LogOut className="w-3.5 h-3.5" />
                                </button>
                            </>
                        ) : (
                            <Link
                                href={route('login')}
                                className={`h-7 sm:h-8 flex items-center gap-1 px-2 rounded-lg border text-xs font-bold transition-all shadow-xs shrink-0 ${
                                    isDark
                                        ? 'bg-amber-950/60 hover:bg-amber-900/80 border-amber-500/50 text-amber-300'
                                        : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800'
                                }`}
                                title={isEn ? 'Sign in to Your Account' : 'Masuk ke Akun Anda'}
                            >
                                <LogIn className="w-3 h-3 text-amber-600" />
                                <span className="text-[10px] sm:text-xs">{isEn ? 'Sign In' : 'Masuk'}</span>
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            {/* BOT CONTROL MODAL (CONFIGURED FOR BOT V2 - ADMIN ONLY) */}
            {isAdmin && (
                <BotControlModal
                    open={botControlModalOpen}
                    onOpenChange={setBotControlModalOpen}
                    botStatus={botStatus}
                    onRefreshStatus={fetchBotStatus}
                    botVersion="v2"
                />
            )}
        </>
    );
}

export default LeanHeader;
