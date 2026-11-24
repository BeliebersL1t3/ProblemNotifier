import React from 'react';
import { Link } from '@inertiajs/react';
import { LayoutGrid, MapPin, BarChart3 } from 'lucide-react';
import { useLeanTheme } from '@/hooks/useLeanTheme';
import { useLanguage } from '@/context/LanguageContext';

export default function LeanBottomNav({ activePage = 'dashboard' }) {
    const { isDark } = useLeanTheme();
    const { lang } = useLanguage();
    const isEn = lang === 'en';

    const navItems = [
        {
            id: 'dashboard',
            href: '/lapangan',
            label: 'Dashboard',
            icon: LayoutGrid,
            active: activePage === 'dashboard',
            title: isEn ? 'Dashboard (Issues Overview)' : 'Dashboard (Daftar Isu)',
        },
        {
            id: 'map',
            href: '/lapangan/peta',
            label: isEn ? 'Map' : 'Peta',
            icon: MapPin,
            active: activePage === 'map',
            title: isEn ? 'Resort Island Map' : 'Peta Denah Resort',
        },
        {
            id: 'analytics',
            href: '/lapangan/analisis',
            label: isEn ? 'Analytics' : 'Analisis',
            icon: BarChart3,
            active: activePage === 'analytics',
            title: isEn ? 'SLA & Operations Analytics' : 'Analisis SLA & Operasional',
        },
    ];

    return (
        <nav
            aria-label="Mobile Bottom Navigation"
            className={`md:hidden fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur-xl transition-colors duration-200 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 px-3 ${
                isDark
                    ? 'bg-slate-900/95 border-slate-800 text-slate-300 shadow-[0_-4px_20px_rgba(0,0,0,0.4)]'
                    : 'bg-white/95 border-slate-200 text-slate-600 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]'
            }`}
        >
            <div className="max-w-md mx-auto grid grid-cols-3 gap-1">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.id}
                            href={item.href}
                            prefetch
                            cacheFor="30s"
                            title={item.title}
                            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all select-none min-h-[48px] ${
                                item.active
                                    ? isDark
                                        ? 'bg-emerald-500/20 text-emerald-400 font-bold ring-1 ring-emerald-500/30'
                                        : 'bg-emerald-50 text-emerald-700 font-bold ring-1 ring-emerald-600/20 shadow-xs'
                                    : isDark
                                    ? 'text-slate-400 hover:text-slate-200 hover:bg-white/5 active:scale-95'
                                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/70 active:scale-95'
                            }`}
                        >
                            <Icon
                                className={`w-5 h-5 transition-transform ${
                                    item.active ? 'scale-110 text-emerald-600 dark:text-emerald-400' : ''
                                }`}
                            />
                            <span className="text-[10px] tracking-tight mt-0.5 leading-none">
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
