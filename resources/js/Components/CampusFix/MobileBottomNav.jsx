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
        <>
            <div
                aria-hidden="true"
                className={`fixed inset-x-0 bottom-0 z-30 md:hidden pointer-events-none select-none liquid-glass-bottom-scrim ${
                    isDark ? 'liquid-glass-dark' : 'liquid-glass-light'
                }`}
                style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 5.75rem)' }}
            />
            <nav
                aria-label="Mobile Bottom Navigation"
                className={`fixed inset-x-3 z-40 md:hidden rounded-[26px] border transition-all duration-200 liquid-glass-dock ${
                    isDark ? 'liquid-glass-dark' : 'liquid-glass-light'
                }`}
                style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.65rem)' }}
            >
                <div
                    className={`grid ${
                        hasCenterFloatingAction ? 'grid-cols-5' : 'grid-cols-4'
                    } items-center gap-0.5 max-w-md mx-auto w-full px-1.5 py-1.5 relative`}
                >
                    {navItems.map((item) => {
                        if (item.isAction) {
                            return (
                                <button
                                    key="action-report"
                                    type="button"
                                    onClick={item.onClick}
                                    className="flex flex-col items-center justify-center w-full py-1 rounded-[20px] select-none group cursor-pointer"
                                    title={item.label}
                                    aria-label={item.label}
                                >
                                    <div className="w-9 h-9 rounded-full bg-emerald-600/95 hover:bg-emerald-500 text-white keep-white flex items-center justify-center ring-1 ring-white/45 shadow-[0_4px_16px_rgba(16,185,129,0.42),inset_0_1px_0_rgba(255,255,255,0.45)] group-active:scale-90 group-hover:scale-105 transition-all">
                                        <Plus className="w-5 h-5 text-white keep-white stroke-[2.7] group-hover:rotate-90 transition-transform duration-300" />
                                    </div>
                                    <span
                                        className={`text-[10px] font-bold mt-0.5 leading-tight tracking-tight text-center truncate max-w-full px-0.5 ${
                                            isDark ? 'text-emerald-300' : 'text-emerald-700'
                                        }`}
                                    >
                                        {item.label}
                                    </span>
                                </button>
                            );
                        }

                        const Icon = item.icon;
                        const isActive = currentTab === item.id;

                        return (
                            <a
                                key={item.id}
                                href={item.href}
                                onClick={(e) => handleNav(e, item)}
                                className={`flex flex-col items-center justify-center w-full py-1.5 px-1 rounded-[20px] transition-all duration-200 select-none group ${
                                    isActive
                                        ? `liquid-glass-active-pill ${
                                              isDark
                                                  ? 'liquid-glass-dark text-emerald-300'
                                                  : 'liquid-glass-light text-emerald-700'
                                          }`
                                        : isDark
                                        ? 'text-slate-200 hover:text-white hover:bg-white/10'
                                        : 'text-slate-700 hover:text-slate-900 hover:bg-white/55'
                                }`}
                            >
                                <div className="relative flex items-center justify-center h-6 w-full">
                                    <Icon
                                        className={`w-[19px] h-[19px] transition-transform duration-200 ${
                                            isActive ? 'stroke-[2.4] scale-105' : 'stroke-[2.0] group-active:scale-90'
                                        }`}
                                    />
                                </div>
                                <span
                                    className={`text-[10px] mt-0.5 leading-tight tracking-tight text-center truncate max-w-full px-0.5 ${
                                        isActive
                                            ? isDark
                                                ? 'font-extrabold text-emerald-300'
                                                : 'font-extrabold text-emerald-700'
                                            : isDark
                                            ? 'font-semibold text-slate-200'
                                            : 'font-semibold text-slate-700'
                                    }`}
                                >
                                    {item.label}
                                </span>
                            </a>
                        );
                    })}
                </div>
            </nav>
        </>
    );
}
