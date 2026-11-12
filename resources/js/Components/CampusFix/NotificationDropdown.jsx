import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, Clock, Ticket, ExternalLink, CheckCheck, Crown, X, BellRing, Volume2, VolumeX } from 'lucide-react';
import { Link } from '@inertiajs/react';
import { useLanguage } from '@/context/LanguageContext';
import {
    isPushNotificationSupported,
    getCurrentPushSubscription,
    subscribeToPushNotifications
} from '@/services/webPushService';
import {
    isSoundEnabled,
    setSoundEnabled,
    playNotificationChime,
} from '@/services/soundService';
import { useNotificationFeed } from '@/hooks/useNotificationFeed';

export default function NotificationDropdown({ isMobile = false, themeVariant = 'default', isDark = false }) {
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('tickets'); // 'tickets' | 'issues'
    const { data, markAsRead, markAllAsRead } = useNotificationFeed();
    const [pushSupported, setPushSupported] = useState(false);
    const [pushSubscribed, setPushSubscribed] = useState(false);
    const [pushLoading, setPushLoading] = useState(false);
    const [soundActive, setSoundActive] = useState(isSoundEnabled());
    const dropdownRef = useRef(null);
    const panelRef = useRef(null);
    const [panelCoords, setPanelCoords] = useState({
        top: 64,
        right: 16,
        maxHeight: 480,
        isMobileViewport: false,
    });

    const updatePanelPosition = useCallback(() => {
        if (typeof window === 'undefined' || !dropdownRef.current) return;
        const rect = dropdownRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const isMobileViewport = viewportWidth < 640;
        const top = Math.max(isMobileViewport ? 56 : 52, Math.round(rect.bottom + 8));
        const right = Math.max(12, Math.round(viewportWidth - rect.right));
        const bottomReserve = isMobileViewport ? 88 : 20;
        const maxHeight = Math.max(240, Math.min(540, viewportHeight - top - bottomReserve));
        setPanelCoords({ top, right, maxHeight, isMobileViewport });
    }, []);

    useEffect(() => {
        const handleSoundPref = (e) => {
            setSoundActive(e.detail?.enabled ?? isSoundEnabled());
        };
        window.addEventListener('campusfix-sound-pref-changed', handleSoundPref);
        return () => window.removeEventListener('campusfix-sound-pref-changed', handleSoundPref);
    }, []);

    const toggleSound = (e) => {
        e.stopPropagation();
        const next = !soundActive;
        setSoundActive(next);
        setSoundEnabled(next);
        if (next) {
            playNotificationChime('normal');
        }
    };

    useEffect(() => {
        const checkPush = async () => {
            const supported = isPushNotificationSupported();
            setPushSupported(supported);
            if (supported) {
                const sub = await getCurrentPushSubscription();
                setPushSubscribed(!!sub);
            }
        };
        checkPush();
    }, []);

    const handleEnablePush = async () => {
        setPushLoading(true);
        try {
            await subscribeToPushNotifications();
            setPushSubscribed(true);
        } catch (e) {
            console.warn('Push registration error:', e);
        } finally {
            setPushLoading(false);
        }
    };

    // Close on outside click, touch, or Escape key; keep portal anchored cleanly to bell button
    useEffect(() => {
        if (!isOpen) return;

        updatePanelPosition();

        const handleClickOutside = (e) => {
            const clickedTrigger = dropdownRef.current && dropdownRef.current.contains(e.target);
            const clickedPanel = panelRef.current && panelRef.current.contains(e.target);
            if (!clickedTrigger && !clickedPanel) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside, { passive: true });
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', updatePanelPosition);
        window.addEventListener('scroll', updatePanelPosition, true);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', updatePanelPosition);
            window.removeEventListener('scroll', updatePanelPosition, true);
        };
    }, [isOpen, updatePanelPosition]);

    const extractIssueDetails = (url) => {
        if (!url) return null;
        try {
            const u = new URL(url, window.location.origin);
            const issueId = u.searchParams.get('issue') || u.searchParams.get('id') || u.searchParams.get('search');
            const sheet = u.searchParams.get('sheet');
            if (issueId) return { issueId, sheet };
        } catch (e) {
            console.warn('[NotificationDropdown] Invalid notification URL:', url, e);
        }
        return null;
    };

    const handleIssueLinkClick = (e, item) => {
        e.stopPropagation();
        if (!item.is_read) markAsRead(item.id);
        setIsOpen(false);

        const issueDetails = extractIssueDetails(item.link);
        if (issueDetails) {
            const isAlreadyOnDashboard = window.location.pathname === '/' || window.location.pathname === '/lapangan';
            if (isAlreadyOnDashboard) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('campusfix-open-issue', {
                    detail: issueDetails,
                }));
            }
        }
    };

    const unreadTicketsCount = data.tickets.filter(t => !t.is_read).length;
    const unreadIssuesCount = data.issues.filter(i => !i.is_read).length;

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`relative transition-all focus:outline-none cursor-pointer ${
                    themeVariant === 'lean'
                        ? `h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg border shadow-xs ${
                            isOpen
                                ? 'bg-emerald-600 text-white keep-white border-emerald-500'
                                : isDark
                                ? 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-slate-700'
                                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                        }`
                        : isMobile
                        ? isOpen
                            ? 'p-1.5 rounded-lg bg-[#1C1B0E] text-[#E3D1AA] border border-[#1C1B0E] shadow-sm'
                            : 'p-1.5 rounded-lg border border-[#1C1B0E]/20 bg-[#1C1B0E]/10 text-[#1C1B0E] hover:bg-[#1C1B0E]/20'
                        : isOpen 
                            ? 'p-2 rounded-xl bg-[#1C1B0E] text-[#E3D1AA] shadow-sm' 
                            : 'p-2 rounded-xl text-[#1C1B0E]/75 hover:text-[#1C1B0E] hover:bg-[#1C1B0E]/10'
                }`}
                title="Pusat Notifikasi"
                aria-label="Pusat Notifikasi"
                aria-expanded={isOpen}
            >
                <Bell className={themeVariant === 'lean' ? 'w-3.5 h-3.5 sm:w-4 sm:h-4' : (isMobile ? 'w-4 h-4' : 'w-5 h-5')} />
                {data.unread_count > 0 && (
                    <span className={`absolute flex items-center justify-center rounded-full font-black shadow-sm animate-pulse ${
                        themeVariant === 'lean'
                            ? 'bg-rose-600 text-white keep-white ring-1 ring-white/80 -top-1 -right-1 h-3.5 w-3.5 text-[9px]'
                            : `bg-[#C9AA71] text-[#1C1B0E] ring-1 ring-[#1C1B0E]/30 ${
                                isMobile ? '-top-1 -right-1 h-3.5 w-3.5 text-[9px]' : 'top-1 right-1 h-4 w-4 text-[10px]'
                            }`
                    }`}>
                        {data.unread_count > 9 ? '9+' : data.unread_count}
                    </span>
                )}
            </button>

            {/* Dropdown Card (Rendered via Portal to escape header stacking contexts) */}
            {isOpen && typeof document !== 'undefined' && createPortal(
                <>
                    {/* Mobile Backdrop to close when tapping outside */}
                    <div 
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[85] sm:hidden animate-in fade-in duration-150"
                        onClick={() => setIsOpen(false)}
                        aria-hidden="true"
                    />

                    <div
                        ref={panelRef}
                        style={
                            panelCoords.isMobileViewport
                                ? { top: `${panelCoords.top}px`, maxHeight: `${panelCoords.maxHeight}px` }
                                : { top: `${panelCoords.top}px`, right: `${panelCoords.right}px`, left: 'auto', maxHeight: `${panelCoords.maxHeight}px` }
                        }
                        className={`fixed left-3 right-3 sm:w-96 max-w-sm mx-auto sm:mx-0 rounded-2xl shadow-2xl border z-[90] overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col ${
                        isDark
                            ? 'bg-slate-900 text-slate-100 border-slate-700'
                            : 'bg-white text-slate-900 border-slate-200'
                    }`}>
                        {/* Ambient subtle glow */}
                        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-48 h-8 pointer-events-none blur-[24px] opacity-25 rounded-full ${
                            isDark ? 'bg-emerald-500' : 'bg-emerald-400'
                        }`} />

                        {/* Header */}
                        <div className={`relative flex items-center justify-between px-4 py-3 border-b backdrop-blur-md shrink-0 ${
                            isDark ? 'border-slate-800 bg-slate-950/90' : 'border-slate-200 bg-slate-50/95'
                        }`}>
                            <div className="flex items-center gap-2">
                                <span className={`font-extrabold text-sm tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Notifikasi</span>
                                {data.unread_count > 0 && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                                        isDark
                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    }`}>
                                        {data.unread_count} baru
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                {/* Sound alert toggle */}
                                <button
                                    type="button"
                                    onClick={toggleSound}
                                    className={`p-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                        soundActive
                                            ? isDark
                                                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                                                : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                            : isDark
                                            ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                                            : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
                                    }`}
                                    title={soundActive ? 'Suara Notifikasi: Aktif (Klik untuk heningkan)' : 'Suara Notifikasi: Hening (Klik untuk bunyikan)'}
                                    aria-label="Toggle Sound"
                                >
                                    {soundActive ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                                    <span className="hidden sm:inline text-[10px]">{soundActive ? 'Suara' : 'Hening'}</span>
                                </button>

                                {data.unread_count > 0 && (
                                    <button
                                        onClick={markAllAsRead}
                                        className={`text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                                            isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-700 hover:text-emerald-800'
                                        }`}
                                    >
                                        <CheckCheck className="w-3.5 h-3.5" /> Tandai semua
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className={`sm:hidden p-1 rounded-lg transition-colors ${
                                        isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/70'
                                    }`}
                                    title="Tutup Notifikasi"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className={`flex border-b text-xs shrink-0 ${
                            isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-100/80'
                        }`}>
                            <button
                                onClick={() => setActiveTab('tickets')}
                                className={`flex-1 py-2.5 px-3 text-center font-bold transition-all relative flex items-center justify-center gap-1.5 cursor-pointer ${
                                    activeTab === 'tickets'
                                        ? isDark
                                            ? 'text-emerald-400 bg-slate-900 border-b-2 border-emerald-500 shadow-inner'
                                            : 'text-emerald-700 bg-white border-b-2 border-emerald-600 shadow-xs'
                                        : isDark
                                        ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                                }`}
                            >
                                <Ticket className="w-3.5 h-3.5" />
                                <span>Tiket & Akun</span>
                                {unreadTicketsCount > 0 && (
                                    <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                                )}
                            </button>

                            <button
                                onClick={() => setActiveTab('issues')}
                                className={`flex-1 py-2.5 px-3 text-center font-bold transition-all relative flex items-center justify-center gap-1.5 cursor-pointer ${
                                    activeTab === 'issues'
                                        ? isDark
                                            ? 'text-emerald-400 bg-slate-900 border-b-2 border-emerald-500 shadow-inner'
                                            : 'text-emerald-700 bg-white border-b-2 border-emerald-600 shadow-xs'
                                        : isDark
                                        ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                                }`}
                            >
                                <Clock className="w-3.5 h-3.5" />
                                <span>Isu & Tugas</span>
                                {unreadIssuesCount > 0 && (
                                    <span className="h-2 w-2 rounded-full bg-sky-400"></span>
                                )}
                            </button>
                        </div>

                        {/* Push Notification Banner */}
                        {pushSupported && !pushSubscribed && (
                            <div className={`border-b px-3.5 py-2 flex items-center justify-between gap-2 text-[11px] animate-in fade-in duration-200 ${
                                isDark ? 'bg-slate-950 border-slate-800' : 'bg-emerald-50/70 border-emerald-200'
                            }`}>
                                <div className={`flex items-center gap-1.5 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                    <BellRing className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                    <span>Aktifkan pop-up di HP / PC</span>
                                </div>
                                <button
                                    onClick={handleEnablePush}
                                    disabled={pushLoading}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white keep-white font-bold hover:bg-emerald-500 transition cursor-pointer text-[10px] shadow-sm disabled:opacity-60"
                                >
                                    {pushLoading ? '...' : 'Aktifkan'}
                                </button>
                            </div>
                        )}

                        {/* Notification Items List - scrollable */}
                        <div className={`overflow-y-auto flex-1 divide-y text-xs overscroll-contain ${
                            isDark ? 'divide-slate-800/80' : 'divide-slate-200'
                        }`}>
                        {activeTab === 'tickets' && (
                            data.tickets.length === 0 ? (
                                <div className={`p-8 text-center space-y-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    <Ticket className={`w-8 h-8 mx-auto ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
                                    <p className="text-xs">Belum ada tiket permohonan.</p>
                                </div>
                            ) : (
                                data.tickets.map((item) => (
                                    <div
                                        key={item.id}
                                        onClick={() => !item.is_read && markAsRead(item.id)}
                                        className={`p-3.5 transition flex items-start gap-3 cursor-pointer ${
                                            !item.is_read 
                                                ? isDark ? 'bg-emerald-500/10 hover:bg-emerald-500/15' : 'bg-emerald-50/70 hover:bg-emerald-50'
                                                : isDark ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className={`mt-0.5 p-1.5 rounded-lg flex-shrink-0 border ${
                                            item.type === 'ticket_approved'
                                                ? isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                                : item.type === 'ticket_rejected'
                                                ? isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-rose-100 text-rose-700 border-rose-200'
                                                : item.type === 'hod_status_change'
                                                ? isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-amber-100 text-amber-700 border-amber-200'
                                                : isDark ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-sky-100 text-sky-700 border-sky-200'
                                        }`}>
                                            {item.type === 'hod_status_change' ? (
                                                <Crown className={`w-3.5 h-3.5 ${isDark ? 'text-amber-300' : 'text-amber-600'}`} />
                                            ) : (
                                                <Ticket className="w-3.5 h-3.5" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`font-bold text-xs leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                {item.title}
                                            </p>
                                            <p className={`text-[11px] mt-1 leading-snug ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                                {item.message}
                                            </p>
                                             <div className={`flex items-center justify-between mt-2 pt-1 border-t gap-2 ${isDark ? 'border-slate-800/80' : 'border-slate-200/80'}`}>
                                                 <span className={`text-[10px] shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                     {new Date(item.created_at).toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                                 </span>
                                                 <div className="flex items-center gap-2">
                                                     {!item.is_read ? (
                                                         <button
                                                             type="button"
                                                             onClick={(e) => {
                                                                 e.stopPropagation();
                                                                 markAsRead(item.id);
                                                             }}
                                                             className={`text-[10px] flex items-center gap-1 font-semibold py-0.5 px-1.5 rounded transition ${
                                                                 isDark
                                                                     ? 'text-emerald-300 hover:text-white bg-emerald-500/15 hover:bg-emerald-500/25'
                                                                     : 'text-emerald-700 hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200/70'
                                                             }`}
                                                             title="Tandai sudah dibaca"
                                                         >
                                                             <Check className="w-2.5 h-2.5" /> Tandai baca
                                                         </button>
                                                     ) : (
                                                         <span className={`text-[10px] flex items-center gap-0.5 font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                             <Check className="w-2.5 h-2.5 opacity-60" /> Dibaca
                                                         </span>
                                                     )}
                                                     {item.link && (
                                                         <Link
                                                             href={item.link}
                                                             onClick={(e) => {
                                                                 e.stopPropagation();
                                                                 if (!item.is_read) markAsRead(item.id);
                                                                 setIsOpen(false);
                                                             }}
                                                             className={`text-[11px] font-bold flex items-center gap-0.5 hover:underline ml-1 ${
                                                                 isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-700 hover:text-emerald-900'
                                                             }`}
                                                         >
                                                             {item.link.includes('profile') ? 'Lihat Profil' : item.link.includes('users') ? 'Kelola Akun' : 'Lihat Tiket'} <ExternalLink className="w-2.5 h-2.5" />
                                                         </Link>
                                                     )}
                                                 </div>
                                             </div>
                                        </div>
                                    </div>
                                ))
                            )
                        )}

                        {activeTab === 'issues' && (
                            data.issues.length === 0 ? (
                                <div className={`p-8 text-center space-y-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    <Clock className={`w-8 h-8 mx-auto ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
                                    <p className="text-xs">Belum ada update progres isu.</p>
                                </div>
                            ) : (
                                data.issues.map((item) => (
                                    <div
                                        key={item.id}
                                        onClick={() => !item.is_read && markAsRead(item.id)}
                                        className={`p-3.5 transition flex items-start gap-3 cursor-pointer ${
                                            !item.is_read 
                                                ? isDark ? 'bg-emerald-500/10 hover:bg-emerald-500/15' : 'bg-emerald-50/70 hover:bg-emerald-50'
                                                : isDark ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className={`mt-0.5 p-1.5 rounded-lg border flex-shrink-0 ${
                                            isDark ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-sky-100 text-sky-700 border-sky-200'
                                        }`}>
                                            <Clock className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`font-bold text-xs leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                {item.title}
                                            </p>
                                            <p className={`text-[11px] mt-1 leading-snug ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                                {item.message}
                                            </p>
                                            <div className={`flex items-center justify-between mt-2 pt-1 border-t gap-2 ${isDark ? 'border-slate-800/80' : 'border-slate-200/80'}`}>
                                                <span className={`text-[10px] shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                    {new Date(item.created_at).toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    {!item.is_read ? (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                markAsRead(item.id);
                                                            }}
                                                            className={`text-[10px] flex items-center gap-1 font-semibold py-0.5 px-1.5 rounded transition ${
                                                                isDark
                                                                    ? 'text-emerald-300 hover:text-white bg-emerald-500/15 hover:bg-emerald-500/25'
                                                                    : 'text-emerald-700 hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200/70'
                                                            }`}
                                                            title="Tandai sudah dibaca"
                                                        >
                                                            <Check className="w-2.5 h-2.5" /> Tandai baca
                                                        </button>
                                                    ) : (
                                                        <span className={`text-[10px] flex items-center gap-0.5 font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                            <Check className="w-2.5 h-2.5 opacity-60" /> Dibaca
                                                        </span>
                                                    )}
                                                    {item.link && (
                                                        <Link
                                                            href={item.link}
                                                            onClick={(e) => handleIssueLinkClick(e, item)}
                                                            className={`text-[11px] font-bold flex items-center gap-0.5 hover:underline ml-1 ${
                                                                isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-700 hover:text-emerald-900'
                                                            }`}
                                                        >
                                                            Lihat Isu <ExternalLink className="w-2.5 h-2.5" />
                                                        </Link>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )
                        )}
                    </div>

                    {/* Footer */}
                    <div className={`p-3 text-center border-t shrink-0 ${
                        isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}>
                        <Link
                            href={route('tickets.index')}
                            onClick={() => setIsOpen(false)}
                            className={`text-xs font-bold transition-colors inline-flex items-center gap-1 ${
                                isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-700 hover:text-emerald-800'
                            }`}
                        >
                            <span>{t('view_all_tickets') || 'Buka Semua Persetujuan Tiket'}</span>
                            <span>→</span>
                        </Link>
                    </div>
                </div>
            </>,
            document.body
        )}
        </div>
    );
}
