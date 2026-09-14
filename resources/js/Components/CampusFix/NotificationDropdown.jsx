import { useState, useEffect, useRef } from 'react';
import { Bell, Check, Clock, Ticket, AlertCircle, ExternalLink, CheckCheck, Crown } from 'lucide-react';
import { Link } from '@inertiajs/react';

export default function NotificationDropdown() {
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

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
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
                className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors focus:outline-none"
                title="Pusat Notifikasi"
            >
                <Bell className="w-5 h-5" />
                {data.unread_count > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white animate-pulse">
                        {data.unread_count > 9 ? '9+' : data.unread_count}
                    </span>
                )}
            </button>

            {/* Dropdown Card */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900">Notifikasi</span>
                            {data.unread_count > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                                    {data.unread_count} baru
                                </span>
                            )}
                        </div>

                        {data.unread_count > 0 && (
                            <button
                                onClick={markAllAsRead}
                                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                            >
                                <CheckCheck className="w-3.5 h-3.5" /> Tandai semua dibaca
                            </button>
                        )}
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-slate-100 bg-slate-50/40 text-xs">
                        <button
                            onClick={() => setActiveTab('tickets')}
                            className={`flex-1 py-2.5 px-3 text-center font-semibold transition-colors relative flex items-center justify-center gap-1.5 ${
                                activeTab === 'tickets'
                                    ? 'text-indigo-600 bg-white border-b-2 border-indigo-600'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <Ticket className="w-3.5 h-3.5" />
                            <span>Persetujuan / Tiket</span>
                            {unreadTicketsCount > 0 && (
                                <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                            )}
                        </button>

                        <button
                            onClick={() => setActiveTab('issues')}
                            className={`flex-1 py-2.5 px-3 text-center font-semibold transition-colors relative flex items-center justify-center gap-1.5 ${
                                activeTab === 'issues'
                                    ? 'text-indigo-600 bg-white border-b-2 border-indigo-600'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <Clock className="w-3.5 h-3.5" />
                            <span>Aktivitas Isu</span>
                            {unreadIssuesCount > 0 && (
                                <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                            )}
                        </button>
                    </div>

                    {/* Notification Items List */}
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs">
                        {activeTab === 'tickets' && (
                            data.tickets.length === 0 ? (
                                <div className="p-8 text-center text-slate-400">
                                    <Ticket className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                    <p>Belum ada tiket permohonan.</p>
                                </div>
                            ) : (
                                data.tickets.map((item) => (
                                    <div
                                        key={item.id}
                                        onClick={() => !item.is_read && markAsRead(item.id)}
                                        className={`p-3.5 transition hover:bg-slate-50 flex items-start gap-3 cursor-pointer ${
                                            !item.is_read ? 'bg-indigo-50/40' : ''
                                        }`}
                                    >
                                        <div className={`mt-0.5 p-1.5 rounded-lg flex-shrink-0 ${
                                            item.type === 'ticket_approved'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : item.type === 'ticket_rejected'
                                                ? 'bg-rose-100 text-rose-700'
                                                : item.type === 'hod_status_change'
                                                ? 'bg-amber-100 text-amber-800'
                                                : 'bg-indigo-100 text-indigo-700'
                                        }`}>
                                            {item.type === 'hod_status_change' ? (
                                                <Crown className="w-3.5 h-3.5 text-amber-700" />
                                            ) : (
                                                <Ticket className="w-3.5 h-3.5" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-slate-900 leading-tight">
                                                {item.title}
                                            </p>
                                            <p className="text-slate-600 text-[11px] mt-1 leading-snug">
                                                {item.message}
                                            </p>
                                            <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100/60">
                                                <span className="text-[10px] text-slate-400">
                                                    {new Date(item.created_at).toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                {item.link && (
                                                    <Link
                                                        href={item.link}
                                                        onClick={() => setIsOpen(false)}
                                                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5"
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
                                <div className="p-8 text-center text-slate-400">
                                    <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                    <p>Belum ada update progres isu.</p>
                                </div>
                            ) : (
                                data.issues.map((item) => (
                                    <div
                                        key={item.id}
                                        onClick={() => !item.is_read && markAsRead(item.id)}
                                        className={`p-3.5 transition hover:bg-slate-50 flex items-start gap-3 cursor-pointer ${
                                            !item.is_read ? 'bg-amber-50/40' : ''
                                        }`}
                                    >
                                        <div className="mt-0.5 p-1.5 rounded-lg bg-amber-100 text-amber-700 flex-shrink-0">
                                            <Clock className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-slate-900 leading-tight">
                                                {item.title}
                                            </p>
                                            <p className="text-slate-600 text-[11px] mt-1 leading-snug">
                                                {item.message}
                                            </p>
                                            <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100/60">
                                                <span className="text-[10px] text-slate-400">
                                                    {new Date(item.created_at).toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                {item.link && (
                                                    <Link
                                                        href={item.link}
                                                        onClick={() => setIsOpen(false)}
                                                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5"
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
                    <div className="p-2.5 bg-slate-50 text-center border-t border-slate-100">
                        <Link
                            href={route('tickets.index')}
                            onClick={() => setIsOpen(false)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                            Buka Semua Persetujuan Tiket →
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
