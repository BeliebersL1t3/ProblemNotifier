import React from 'react';
import { router, usePage } from '@inertiajs/react';
import { LayoutDashboard, Plus, Ticket, BarChart3, User, Users } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useLeanTheme } from '@/hooks/useLeanTheme';
import { useAuth } from '@/hooks/useAuth';

export function MobileBottomNav({
    currentTab = 'dashboard',
    onReport,
    onSelectDashboard = null,
    onSelectAnalytics = null,
}) {
    const { t, lang } = useLanguage();
    const { isDark } = useLeanTheme();
    const { props: pageProps } = usePage();
    const { isAdmin } = useAuth();
    const approvalTicketsEnabled = Boolean(pageProps?.features?.approval_tickets);

    const handleNav = (e, item) => {
        e.preventDefault();
        if (item.id === 'dashboard' && typeof onSelectDashboard === 'function') {
            onSelectDashboard();
            return;
        }
        if (item.id === 'analytics' && typeof onSelectAnalytics === 'function') {
            onSelectAnalytics();
            return;
        }
        router.visit(item.href);
    };

    const handleReportClick = (e) => {
        e.preventDefault();
        if (onReport) {
            onReport();
        } else {
            router.visit('/?report=1');
        }
    };

    const reportActionItem = {
        id: 'report',
        isAction: true,
        label: lang === 'id' ? 'Lapor' : 'Report',
        onClick: handleReportClick,
        icon: Plus,
    };

    const dashboardItem = {
        id: 'dashboard',
        label: t('dashboard') || 'Dashboard',
        href: '/',
        icon: LayoutDashboard,
    };

    const analyticsItem = {
        id: 'analytics',
        label: t('analytics') || (lang === 'id' ? 'Analisis' : 'Analytics'),
        href: '/?view=analytics',
        icon: BarChart3,
    };

    const profileItem = {
        id: 'profile',
        label: t('profile') || (lang === 'id' ? 'Profil' : 'Profile'),
        href: '/profile',
        icon: User,
    };

    // Keep mobile navigation balanced & symmetrical across roles and feature flags:
    // - When approval tickets are active: [Dashboard, Tickets, +, Analytics, Profile] (5 cols)
    // - When tickets are hidden & Admin:  [Dashboard, Users, +, Analytics, Profile] (5 cols)
    // - When tickets are hidden & Staff:  [Dashboard, Analytics, Profile, + Lapor] (4 cols, inline CTA)
    let navItems;
    let hasCenterFloatingAction = true;

    if (approvalTicketsEnabled) {
        navItems = [
            dashboardItem,
            {
                id: 'tickets',
                label: t('tickets') || 'Tiket',
                href: '/tickets',
                icon: Ticket,
            },
            reportActionItem,
            analyticsItem,
            profileItem,
        ];
    } else if (isAdmin) {
        navItems = [
            dashboardItem,
            {
                id: 'users',
                label: lang === 'id' ? 'Pengguna' : 'Users',
                href: '/users',
                icon: Users,
            },
            reportActionItem,
            analyticsItem,
            profileItem,
        ];
    } else {
        hasCenterFloatingAction = false;
        navItems = [
            dashboardItem,
            analyticsItem,
            profileItem,
            reportActionItem,
        ];
    }

    return (
        <nav
            aria-label="Mobile Bottom Navigation"
            className={`fixed bottom-0 inset-x-0 z-40 md:hidden backdrop-blur-xl border-t transition-colors duration-200 ${
                isDark
                    ? 'bg-slate-900/95 border-slate-800 shadow-[0_-8px_30px_rgba(0,0,0,0.45)]'
                    : 'bg-white/95 border-slate-200 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]'
            }`}
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.35rem)' }}
        >
            <div
                className={`grid ${
                    hasCenterFloatingAction ? 'grid-cols-5' : 'grid-cols-4'
                } items-end max-w-md mx-auto w-full px-1 pt-2 pb-1 relative`}
            >
                {navItems.map((item) => {
                    if (item.isAction) {
                        if (!hasCenterFloatingAction) {
                            return (
                                <button
                                    key="action-report"
                                    type="button"
                                    onClick={item.onClick}
                                    className="flex flex-col items-center justify-end w-full select-none group cursor-pointer"
                                    title={item.label}
                                    aria-label={item.label}
                                >
                                    <div className="relative flex items-center justify-center h-9 w-full">
                                        <div className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white keep-white flex items-center justify-center shadow-[0_4px_12px_rgba(16,185,129,0.35)] group-active:scale-90 transition-all">
                                            <Plus className="w-5 h-5 text-white keep-white stroke-[2.6] group-hover:rotate-90 transition-transform duration-300" />
                                        </div>
                                    </div>
                                    <span
                                        className={`h-4 flex items-center justify-center text-[10px] font-bold mt-1 tracking-tight text-center truncate max-w-full px-0.5 ${
                                            isDark ? 'text-emerald-400' : 'text-emerald-700'
                                        }`}
                                    >
                                        {item.label}
                                    </span>
                                </button>
                            );
                        }

                        return (
                            <div key="action-report" className="flex flex-col items-center justify-end w-full relative">
                                <div className="relative flex items-center justify-center h-9 w-full">
                                    <button
                                        type="button"
                                        onClick={item.onClick}
                                        className={`absolute -top-3.5 w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white keep-white flex items-center justify-center shadow-[0_4px_16px_rgba(16,185,129,0.45)] active:scale-90 hover:scale-105 transition-all border-2 cursor-pointer group ${
                                            isDark ? 'border-slate-900' : 'border-white'
                                        }`}
                                        title={item.label}
                                        aria-label={item.label}
                                    >
                                        <Plus className="w-6 h-6 text-white keep-white stroke-[2.8] group-hover:rotate-90 transition-transform duration-300" />
                                    </button>
                                </div>
                                <span
                                    className={`h-4 flex items-center justify-center text-[10px] font-bold mt-1 tracking-tight text-center truncate max-w-full px-0.5 ${
                                        isDark ? 'text-emerald-400' : 'text-emerald-700'
                                    }`}
                                >
                                    {item.label}
                                </span>
                            </div>
                        );
                    }

                    const Icon = item.icon;
                    const isActive = currentTab === item.id;

                    return (
                        <a
                            key={item.id}
                            href={item.href}
                            onClick={(e) => handleNav(e, item)}
                            className={`flex flex-col items-center justify-end w-full transition-colors duration-200 select-none group ${
                                isActive
                                    ? isDark
                                        ? 'text-emerald-400'
                                        : 'text-emerald-700'
                                    : isDark
                                    ? 'text-slate-400 hover:text-white'
                                    : 'text-slate-500 hover:text-slate-900'
                            }`}
                        >
                            <div className="relative flex items-center justify-center h-9 w-full">
                                <div
                                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                                        isActive
                                            ? isDark
                                                ? 'bg-emerald-500/20 shadow-inner scale-105'
                                                : 'bg-emerald-100 shadow-xs scale-105'
                                            : 'group-active:scale-90'
                                    }`}
                                >
                                    <Icon
                                        className={`w-5 h-5 transition-transform ${
                                            isActive ? 'stroke-[2.4]' : 'stroke-[1.8]'
                                        }`}
                                    />
                                </div>
                                {isActive && (
                                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                                )}
                            </div>
                            <span
                                className={`h-4 flex items-center justify-center text-[10px] mt-1 tracking-tight text-center truncate max-w-full px-0.5 ${
                                    isActive
                                        ? isDark
                                            ? 'font-extrabold text-emerald-400'
                                            : 'font-extrabold text-emerald-700'
                                        : isDark
                                        ? 'font-medium text-slate-400'
                                        : 'font-medium text-slate-500'
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
