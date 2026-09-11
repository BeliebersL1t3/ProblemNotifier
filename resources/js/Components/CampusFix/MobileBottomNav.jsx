import React from 'react';
import { LayoutDashboard, Plus, Calendar, BarChart3, User, Lock } from 'lucide-react';
import { useSlashTransition } from '@/Components/CampusFix/SlashTransition';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/hooks/useAuth';

export function MobileBottomNav({ currentTab = 'dashboard', onReport }) {
    const { t, lang } = useLanguage();
    const { navigateWithSlash } = useSlashTransition();
    const { canAccessAnalytics, canAccessCalendar } = useAuth();

    const handleNav = (e, href, title) => {
        e.preventDefault();
        navigateWithSlash(href, title);
    };

    const handleReportClick = (e) => {
        if (onReport) {
            e.preventDefault();
            onReport();
        } else {
            handleNav(e, '/dashboard?report=1', t('report_issue') || 'Report Issue');
        }
    };

    const navItems = [
        {
            id: 'dashboard',
            label: t('dashboard') || 'Dashboard',
            href: '/dashboard',
            icon: LayoutDashboard,
        },
        {
            id: 'calendar',
            label: lang === 'id' ? 'Kalender' : 'Calendar',
            href: '/calendar',
            icon: Calendar,
            isLocked: !canAccessCalendar,
        },
        // Center item is the elevated + action button
        {
            id: 'report',
            isAction: true,
            label: lang === 'id' ? 'Lapor' : 'Report',
            onClick: handleReportClick,
            icon: Plus,
        },
        {
            id: 'analytics',
            label: t('analytics') || 'Analitik',
            href: '/analytics',
            icon: BarChart3,
            isLocked: !canAccessAnalytics,
        },
        {
            id: 'profile',
            label: t('profile') || (lang === 'id' ? 'Profil' : 'Profile'),
            href: '/profile',
            icon: User,
        },
    ];

    return (
        <nav 
            aria-label="Mobile Bottom Navigation" 
            className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-[#1C1B0E]/95 backdrop-blur-xl border-t border-[#3B3929]/80 shadow-[0_-8px_30px_rgba(0,0,0,0.6)]"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.35rem)' }}
        >
            <div className="grid grid-cols-5 items-end max-w-md mx-auto w-full px-1 pt-2 pb-1 relative">
                {navItems.map((item) => {
                    if (item.isAction) {
                        return (
                            <div key="action-report" className="flex flex-col items-center justify-end w-full relative">
                                <div className="relative flex items-center justify-center h-9 w-full">
                                    <button
                                        type="button"
                                        onClick={item.onClick}
                                        className="absolute -top-3.5 w-12 h-12 rounded-full bg-gradient-to-tr from-[#C9AA71] via-[#E3D1AA] to-[#C9AA71] text-[#1C1B0E] flex items-center justify-center shadow-[0_4px_16px_rgba(201,170,113,0.45)] active:scale-90 hover:scale-105 transition-transform border-2 border-[#1C1B0E] cursor-pointer group"
                                        title={item.label}
                                        aria-label={item.label}
                                    >
                                        <Plus className="w-6 h-6 stroke-[2.8] group-hover:rotate-90 transition-transform duration-300" />
                                    </button>
                                </div>
                                <span className="h-4 flex items-center justify-center text-[10px] font-bold text-[#C9AA71] mt-1 tracking-tight text-center truncate max-w-full px-0.5">
                                    {item.label}
                                </span>
                            </div>
                        );
                    }

                    const Icon = item.icon;
                    const isActive = currentTab === item.id;

                    if (item.isLocked) {
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => alert(lang === 'id' ? `Akses fitur ${item.label} dibatasi oleh Administrator.` : `${item.label} access restricted by Administrator.`)}
                                className="flex flex-col items-center justify-end w-full opacity-40 select-none cursor-not-allowed group"
                                title={`${item.label} (${lang === 'id' ? 'Dibatasi' : 'Restricted'})`}
                            >
                                <div className="relative flex items-center justify-center h-9 w-full">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#1C1B0E]/60 border border-[#3B3929]/50 relative">
                                        <Icon className="w-4 h-4 text-[#A19F8D]" />
                                        <Lock className="w-2.5 h-2.5 text-amber-400 absolute -bottom-0.5 -right-0.5" />
                                    </div>
                                </div>
                                <span className="h-4 flex items-center justify-center text-[10px] mt-1 tracking-tight text-center truncate max-w-full px-0.5 font-medium text-[#A19F8D]">
                                    {item.label}
                                </span>
                            </button>
                        );
                    }

                    return (
                        <a
                            key={item.id}
                            href={item.href}
                            onClick={(e) => handleNav(e, item.href, item.label)}
                            className={`flex flex-col items-center justify-end w-full transition-colors duration-200 select-none group ${
                                isActive ? 'text-[#C9AA71]' : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                            }`}
                        >
                            <div className="relative flex items-center justify-center h-9 w-full">
                                <div 
                                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                                        isActive 
                                            ? 'bg-[#C9AA71]/15 shadow-inner scale-105' 
                                            : 'group-active:scale-90'
                                    }`}
                                >
                                    <Icon className={`w-5 h-5 transition-transform ${isActive ? 'stroke-[2.4]' : 'stroke-[1.8]'}`} />
                                </div>
                                {isActive && (
                                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#C9AA71] shadow-[0_0_6px_#C9AA71]" />
                                )}
                            </div>
                            <span 
                                className={`h-4 flex items-center justify-center text-[10px] mt-1 tracking-tight text-center truncate max-w-full px-0.5 ${
                                    isActive ? 'font-extrabold text-[#C9AA71]' : 'font-medium text-[#A19F8D]'
                                }`}
                            >
                                {item.label}
                            </span>
                        </a>
                    );
                })}
            </div>
        </nav>
    );
}
