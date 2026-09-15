import { useState, useEffect, useRef } from 'react';
import { Bell, Check, Clock, Ticket, AlertCircle, ExternalLink, CheckCheck, Crown, X } from 'lucide-react';
import { Link } from '@inertiajs/react';
import { useLanguage } from '@/context/LanguageContext';

export default function NotificationDropdown({ isMobile = false }) {
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('tickets'); // 'tickets' | 'issues'
    const [data, setData] = useState({ tickets: [], issues: [], unread_count: 0 });
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef(null);

    const fetchNotifications = async () => {
        try {
            const res = await fetch('/notifications');
            if (res.ok) {
                const json = await res.json();
                setData(json);
            }
        } catch (e) {
            // Ignore offline/background polling errors
        }
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 20000); // 20s poll
        return () => clearInterval(interval);
    }, []);

    // Close on outside click or touch
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside, { passive: true });
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, []);

    const markAsRead = async (id) => {
        try {
            await fetch(`/notifications/${id}/read`, {
                method: 'POST',
                headers: {
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                    'Accept': 'application/json',
                }
            });
            fetchNotifications();
        } catch (e) {}
    };

    const markAllAsRead = async () => {
        try {
            await fetch('/notifications/read-all', {
                method: 'POST',
                headers: {
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                    'Accept': 'application/json',
                }
            });
            fetchNotifications();
        } catch (e) {}
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
                    isMobile
                        ? isOpen
                            ? 'p-1.5 rounded-lg bg-[#1C1B0E] text-[#E3D1AA] border border-[#1C1B0E] shadow-sm'
                            : 'p-1.5 rounded-lg border border-[#1C1B0E]/20 bg-[#1C1B0E]/10 text-[#1C1B0E] hover:bg-[#1C1B0E]/20'
                        : isOpen 
                            ? 'p-2 rounded-xl bg-[#1C1B0E] text-[#E3D1AA] shadow-sm' 
                            : 'p-2 rounded-xl text-[#1C1B0E]/75 hover:text-[#1C1B0E] hover:bg-[#1C1B0E]/10'
                }`}
                title="Pusat Notifikasi"
                aria-label="Pusat Notifikasi"
            >
                <Bell className={isMobile ? "w-4 h-4" : "w-5 h-5"} />
                {data.unread_count > 0 && (
                    <span className={`absolute flex items-center justify-center rounded-full bg-[#C9AA71] font-black text-[#1C1B0E] shadow-sm ring-1 ring-[#1C1B0E]/30 animate-pulse ${
                        isMobile 
                            ? '-top-1 -right-1 h-3.5 w-3.5 text-[9px]' 
                            : 'top-1 right-1 h-4 w-4 text-[10px]'
                    }`}>
                        {data.unread_count > 9 ? '9+' : data.unread_count}
                    </span>
                )}
            </button>

            {/* Dropdown Card */}
            {isOpen && (
                <>
                    {/* Mobile Backdrop to close when tapping outside */}
                    <div 
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 sm:hidden animate-in fade-in duration-150"
                        onClick={() => setIsOpen(false)}
                        aria-hidden="true"
                    />

                    <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-14 sm:top-full sm:mt-2.5 max-w-sm mx-auto sm:mx-0 sm:w-96 rounded-2xl bg-[#2A281E] text-[#FAFAFA] shadow-2xl border border-[#3B3929] z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[calc(100vh-140px)] flex flex-col">
                        {/* Ambient subtle glow */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-8 pointer-events-none blur-[24px] opacity-25 rounded-full bg-[#C9AA71]" />

                        {/* Header */}
                        <div className="relative flex items-center justify-between px-4 py-3 border-b border-[#3B3929] bg-[#1C1B0E]/90 backdrop-blur-md shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="font-extrabold text-sm text-[#FAFAFA] tracking-tight">Notifikasi</span>
                                {data.unread_count > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#C9AA71]/20 text-[#C9AA71] border border-[#C9AA71]/40">
                                        {data.unread_count} baru
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                {data.unread_count > 0 && (
                                    <button
                                        onClick={markAllAsRead}
                                        className="text-[11px] text-[#C9AA71] hover:text-[#E3D1AA] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                    >
                                        <CheckCheck className="w-3.5 h-3.5" /> Tandai semua
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="sm:hidden p-1 rounded-lg text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-white/10 transition-colors"
                                    title="Tutup Notifikasi"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-[#3B3929] bg-[#1C1B0E]/60 text-xs shrink-0">
                            <button
                                onClick={() => setActiveTab('tickets')}
                                className={`flex-1 py-2.5 px-3 text-center font-bold transition-all relative flex items-center justify-center gap-1.5 cursor-pointer ${
                                    activeTab === 'tickets'
                                        ? 'text-[#C9AA71] bg-[#2A281E] border-b-2 border-[#C9AA71] shadow-inner'
                                        : 'text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#1C1B0E]/40'
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
                                        ? 'text-[#C9AA71] bg-[#2A281E] border-b-2 border-[#C9AA71] shadow-inner'
                                        : 'text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#1C1B0E]/40'
                                }`}
                            >
                                <Clock className="w-3.5 h-3.5" />
                                <span>Isu & Tugas</span>
                                {unreadIssuesCount > 0 && (
                                    <span className="h-2 w-2 rounded-full bg-sky-400"></span>
                                )}
                            </button>
                        </div>

                        {/* Notification Items List - scrollable */}
                        <div className="overflow-y-auto flex-1 divide-y divide-[#3B3929]/50 text-xs overscroll-contain">
                        {activeTab === 'tickets' && (
                            data.tickets.length === 0 ? (
                                <div className="p-8 text-center text-[#A19F8D] space-y-2">
                                    <Ticket className="w-8 h-8 mx-auto text-[#3B3929]" />
                                    <p className="text-xs">Belum ada tiket permohonan.</p>
                                </div>
                            ) : (
                                data.tickets.map((item) => (
                                    <div
                                        key={item.id}
                                        onClick={() => !item.is_read && markAsRead(item.id)}
                                        className={`p-3.5 transition flex items-start gap-3 cursor-pointer ${
                                            !item.is_read 
                                                ? 'bg-[#C9AA71]/10 hover:bg-[#C9AA71]/15' 
                                                : 'hover:bg-[#1C1B0E]/40'
                                        }`}
                                    >
                                        <div className={`mt-0.5 p-1.5 rounded-lg flex-shrink-0 border ${
                                            item.type === 'ticket_approved'
                                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                                : item.type === 'ticket_rejected'
                                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                                : item.type === 'hod_status_change'
                                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                                : 'bg-[#C9AA71]/20 text-[#C9AA71] border-[#C9AA71]/40'
                                        }`}>
                                            {item.type === 'hod_status_change' ? (
                                                <Crown className="w-3.5 h-3.5 text-amber-300" />
                                            ) : (
                                                <Ticket className="w-3.5 h-3.5" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-xs text-[#FAFAFA] leading-tight">
                                                {item.title}
                                            </p>
                                            <p className="text-[#E3D1AA] text-[11px] mt-1 leading-snug">
                                                {item.message}
                                            </p>
                                            <div className="flex items-center justify-between mt-2 pt-1 border-t border-[#3B3929]/40">
                                                <span className="text-[10px] text-[#A19F8D]">
                                                    {new Date(item.created_at).toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                {item.link && (
                                                    <Link
                                                        href={item.link}
                                                        onClick={() => setIsOpen(false)}
                                                        className="text-[11px] text-[#C9AA71] hover:text-[#FAFAFA] font-bold flex items-center gap-0.5 hover:underline"
                                                    >
                                                        {item.link.includes('profile') ? 'Lihat Profil' : item.link.includes('users') ? 'Kelola Akun' : 'Lihat Tiket'} <ExternalLink className="w-2.5 h-2.5" />
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )
                        )}

                        {activeTab === 'issues' && (
                            data.issues.length === 0 ? (
                                <div className="p-8 text-center text-[#A19F8D] space-y-2">
                                    <Clock className="w-8 h-8 mx-auto text-[#3B3929]" />
                                    <p className="text-xs">Belum ada update progres isu.</p>
                                </div>
                            ) : (
                                data.issues.map((item) => (
                                    <div
                                        key={item.id}
                                        onClick={() => !item.is_read && markAsRead(item.id)}
                                        className={`p-3.5 transition flex items-start gap-3 cursor-pointer ${
                                            !item.is_read 
                                                ? 'bg-[#C9AA71]/10 hover:bg-[#C9AA71]/15' 
                                                : 'hover:bg-[#1C1B0E]/40'
                                        }`}
                                    >
                                        <div className="mt-0.5 p-1.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/40 flex-shrink-0">
                                            <Clock className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-xs text-[#FAFAFA] leading-tight">
                                                {item.title}
                                            </p>
                                            <p className="text-[#E3D1AA] text-[11px] mt-1 leading-snug">
                                                {item.message}
                                            </p>
                                            <div className="flex items-center justify-between mt-2 pt-1 border-t border-[#3B3929]/40">
                                                <span className="text-[10px] text-[#A19F8D]">
                                                    {new Date(item.created_at).toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                {item.link && (
                                                    <Link
                                                        href={item.link}
                                                        onClick={() => setIsOpen(false)}
                                                        className="text-[11px] text-[#C9AA71] hover:text-[#FAFAFA] font-bold flex items-center gap-0.5 hover:underline"
                                                    >
                                                        Lihat Isu <ExternalLink className="w-2.5 h-2.5" />
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-3 bg-[#1C1B0E]/90 text-center border-t border-[#3B3929] shrink-0">
                        <Link
                            href={route('tickets.index')}
                            onClick={() => setIsOpen(false)}
                            className="text-xs font-bold text-[#C9AA71] hover:text-[#E3D1AA] transition-colors inline-flex items-center gap-1"
                        >
                            <span>{t('view_all_tickets') || 'Buka Semua Persetujuan Tiket'}</span>
                            <span>→</span>
                        </Link>
                    </div>
                </div>
            </>
        )}
        </div>
    );
}
