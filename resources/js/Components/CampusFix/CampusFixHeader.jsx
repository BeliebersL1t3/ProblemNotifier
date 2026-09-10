import { useState, useRef, useEffect } from 'react';
import { Plus, Search, CalendarPlus, BarChart3, LayoutDashboard, Calendar, User, X } from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { Link } from '@inertiajs/react';
import { Input } from '@/Components/UI/Input';
import { useIssues } from '@/context/IssuesContext';
import { NewPeriodModal } from '@/Components/CampusFix/NewPeriodModal';
import { useSlashTransition } from '@/Components/CampusFix/SlashTransition';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { Tooltip } from '@/Components/UI/Tooltip';
import { getDepartmentTheme, getShortDepartmentName } from '@/constants/departments';

export function CampusFixHeader({ mode = 'dashboard', query, onQueryChange, onReport, onEmergency, onNewPeriod, searchDropdown }) {
    const { currentSheet } = useIssues();
    const { lang, setLang, t } = useLanguage();
    const { user, isAdmin, department, staffName, canAccessAnalytics, canAccessCalendar } = useAuth();
    const userDept = user?.department || department;
    const deptTheme = userDept ? getDepartmentTheme(userDept) : (isAdmin ? { bg: '#C9AA71', text: '#1C1B0E' } : { bg: '#607D8B', text: '#FFFFFF' });
    const [searchFocused, setSearchFocused] = useState(false);
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
    const [periodModalOpen, setPeriodModalOpen] = useState(false);
    const { navigateWithSlash } = useSlashTransition();
    const searchContainerRef = useRef(null);
    const mobileSearchContainerRef = useRef(null);
    const mobileInputRef = useRef(null);

    const openMobileSearch = () => {
        setMobileSearchOpen(true);
        setSearchFocused(true);
        setTimeout(() => {
            mobileInputRef.current?.focus();
        }, 60);
    };

    const closeMobileSearch = () => {
        setMobileSearchOpen(false);
        setSearchFocused(false);
        onQueryChange?.('');
    };

    const closeAllSearch = () => {
        setSearchFocused(false);
        setMobileSearchOpen(false);
        if (mobileInputRef.current) {
            mobileInputRef.current.blur();
        }
    };

    useEffect(() => {
        const handleClickOutside = (e) => {
            const inDesktop = searchContainerRef.current && searchContainerRef.current.contains(e.target);
            const inMobile = mobileSearchContainerRef.current && mobileSearchContainerRef.current.contains(e.target);
            if (!inDesktop && !inMobile) {
                setSearchFocused(false);
                if (!query) {
                    setMobileSearchOpen(false);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside, { passive: true });
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [query]);

    // Close search on Escape key
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && (searchFocused || mobileSearchOpen)) {
                closeAllSearch();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [searchFocused, mobileSearchOpen]);

    const handleNav = (e, href, title) => {
        e.preventDefault();
        navigateWithSlash(href, title);
    };

    const handlePeriodOpen = () => {
        if (onNewPeriod) {
            onNewPeriod();
        } else {
            setPeriodModalOpen(true);
        }
    };

    return (
        <>
            {/* Cinematic Background Dimming Overlay when search is focused */}
            {searchFocused && (
                <div 
                    onClick={closeAllSearch}
                    className="fixed inset-0 bg-black/65 backdrop-blur-[3px] z-40 animate-in fade-in duration-200 cursor-pointer"
                    aria-label="Close search overlay"
                />
            )}

            <header className="sticky top-0 z-50 border-b border-border bg-[#E3D1AA] shadow-sm relative">
            {/* Transparent Header Texture Overlay */}
            <div 
                className="absolute inset-0 pointer-events-none bg-repeat opacity-30 z-0 overflow-hidden" 
                style={{ 
                    backgroundImage: "url('/header-bg-texture.png')",
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                }} 
            />

            <div className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-3.5 py-2 sm:px-6 sm:py-3 md:gap-6">
                {/* Mobile Expanded Search Bar (Takes over row when active) */}
                {(mobileSearchOpen || !!query) && onQueryChange ? (
                    <div className="flex md:hidden items-center w-full animate-in fade-in zoom-in-95 duration-150">
                        <div ref={mobileSearchContainerRef} className="relative w-full">
                            <Search
                                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary"
                                aria-hidden
                            />
                            <Input
                                ref={mobileInputRef}
                                value={query || ''}
                                onChange={(e) => onQueryChange(e.target.value)}
                                onFocus={() => setSearchFocused(true)}
                                placeholder={
                                    mode === 'analytics'
                                        ? t('search_analytics_placeholder')
                                        : mode === 'calendar'
                                            ? (t('search_calendar_placeholder') || 'Search tasks, dates, departments...')
                                            : t('search_placeholder')
                                }
                                aria-label="Search issues or locations"
                                className="pl-9 pr-9 h-9 text-xs w-full bg-white/95 border-[#1C1B0E]/30 ring-2 ring-primary/40 text-[#1C1B0E] font-medium shadow-inner"
                            />
                            <button
                                type="button"
                                onClick={closeMobileSearch}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#1C1B0E]/60 hover:text-[#1C1B0E] hover:bg-[#1C1B0E]/10 cursor-pointer transition-colors"
                                title={lang === 'id' ? 'Tutup pencarian' : 'Close search'}
                            >
                                <X className="h-4 w-4" />
                            </button>

                            {/* Live preview dropdown slot on mobile */}
                            {searchFocused && (typeof searchDropdown === 'function' ? searchDropdown(closeAllSearch) : searchDropdown)}
                        </div>
                    </div>
                ) : (
                    /* Default Top Bar (Logo on left, Search icon + Actions + Profile on right in 1 single clean line) */
                    <div className="flex items-center gap-2 justify-between w-full md:w-auto">
                        <div className="flex items-center gap-2">
                            <img
                                src="/logo.png"
                                alt="Telunas Resorts"
                                className="h-7 sm:h-9 w-auto object-contain shrink-0"
                            />
                            <div className="flex flex-col">
                                <p className="text-[11px] sm:text-xs font-extrabold tracking-wider uppercase text-[#1C1B0E]/90 leading-tight">
                                    {t('system_title')}
                                </p>
                            </div>
                        </div>

                        {/* Mobile Right Controls: Search Icon, Language Toggle, SOS & Profile */}
                        <div className="flex md:hidden items-center gap-1.5 shrink-0">
                            {/* Search Expand Trigger Button */}
                            {onQueryChange && (
                                <button
                                    type="button"
                                    onClick={openMobileSearch}
                                    className="p-1.5 rounded-lg border border-[#1C1B0E]/20 bg-[#1C1B0E]/10 text-[#1C1B0E] hover:bg-[#1C1B0E]/20 transition-all cursor-pointer"
                                    title="Search"
                                >
                                    <Search className="h-4 w-4" />
                                </button>
                            )}

                            {/* ID | EN Switcher */}
                            <div className="flex items-center rounded-lg border border-[#1C1B0E]/20 bg-[#1C1B0E]/10 p-0.5 text-xs font-bold shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setLang('id')}
                                    className={`px-1.5 py-0.5 rounded transition-all ${lang === 'id' ? 'bg-[#1C1B0E] text-[#E3D1AA] shadow-sm' : 'text-[#1C1B0E]/70 hover:text-[#1C1B0E]'}`}
                                >
                                    ID
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setLang('en')}
                                    className={`px-1.5 py-0.5 rounded transition-all ${lang === 'en' ? 'bg-[#1C1B0E] text-[#E3D1AA] shadow-sm' : 'text-[#1C1B0E]/70 hover:text-[#1C1B0E]'}`}
                                >
                                    EN
                                </button>
                            </div>

                            {/* Quick Emergency Button on Dashboard */}
                            {mode === 'dashboard' && onEmergency && (
                                <button
                                    type="button"
                                    onClick={onEmergency}
                                    className="p-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.4)] transition-all animate-pulse cursor-pointer"
                                    title={t('emergency')}
                                >
                                    <span className="text-xs leading-none">🚨</span>
                                </button>
                            )}

                            {/* Mobile Profile Chip: Avatar only */}
                            <Link
                                href="/profile"
                                onClick={(e) => handleNav(e, '/profile', t('profile') || 'Profile')}
                                className="flex items-center justify-center p-0.5 rounded-full border border-[#1C1B0E]/20 bg-[#1C1B0E]/10 transition-all shadow-xs shrink-0"
                                style={userDept ? {
                                    borderColor: `${deptTheme.bg}80`,
                                    backgroundColor: `${deptTheme.bg}22`,
                                } : {}}
                                title={`${user?.name || 'Account'} (${user?.department || (isAdmin ? 'Admin' : '')})`}
                            >
                                <div 
                                    className="w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shrink-0 shadow-xs ring-1 ring-black/20"
                                    style={{
                                        backgroundColor: deptTheme.bg,
                                        color: deptTheme.text,
                                    }}
                                >
                                    {user?.name ? user.name.charAt(0).toUpperCase() : <User className="h-3 w-3" />}
                                </div>
                            </Link>
                        </div>
                    </div>
                )}

                {/* Navigation Toggle (Desktop) */}
                <div className="hidden md:flex bg-[#1C1B0E]/5 p-1 rounded-lg border border-[#1C1B0E]/10 shrink-0 transition-all duration-300">
                    <Link
                        href="/dashboard"
                        onClick={(e) => handleNav(e, '/dashboard', t('dashboard'))}
                        className={`group flex items-center justify-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            mode === 'dashboard'
                                ? 'bg-[#1C1B0E] text-[#E3D1AA] shadow-sm'
                                : 'text-[#1C1B0E]/70 hover:text-[#1C1B0E] hover:bg-[#1C1B0E]/10'
                        }`}
                        title={t('dashboard')}
                    >
                        <LayoutDashboard className="h-4 w-4 shrink-0" />
                        <span className={`transition-all duration-300 ease-out overflow-hidden whitespace-nowrap ${
                            searchFocused 
                                ? 'max-w-0 opacity-0 ml-0 group-hover:max-w-[100px] group-hover:opacity-100 group-hover:ml-1.5' 
                                : 'max-w-[100px] opacity-100 ml-1.5'
                        }`}>
                            {t('dashboard')}
                        </span>
                    </Link>
                    {canAccessAnalytics ? (
                        <Link
                            href="/analytics"
                            onClick={(e) => handleNav(e, '/analytics', t('analytics'))}
                            className={`group flex items-center justify-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                mode === 'analytics'
                                    ? 'bg-[#1C1B0E] text-[#E3D1AA] shadow-sm'
                                    : 'text-[#1C1B0E]/70 hover:text-[#1C1B0E] hover:bg-[#1C1B0E]/10'
                            }`}
                            title={t('analytics')}
                        >
                            <BarChart3 className="h-4 w-4 shrink-0" />
                            <span className={`transition-all duration-300 ease-out overflow-hidden whitespace-nowrap ${
                                searchFocused 
                                    ? 'max-w-0 opacity-0 ml-0 group-hover:max-w-[100px] group-hover:opacity-100 group-hover:ml-1.5' 
                                    : 'max-w-[100px] opacity-100 ml-1.5'
                            }`}>
                                {t('analytics')}
                            </span>
                        </Link>
                    ) : (
                        <div 
                            className="flex items-center justify-center px-2.5 py-1.5 rounded-md text-sm font-medium text-[#1C1B0E]/40 cursor-not-allowed select-none gap-1 bg-[#1C1B0E]/5"
                            title="Akses Analytics dibatasi oleh Administrator (Barrier Aktif)"
                        >
                            <BarChart3 className="h-4 w-4 shrink-0 opacity-40" />
                            <span className="text-[10px] font-bold text-amber-600">🚧</span>
                        </div>
                    )}

                    {canAccessCalendar ? (
                        <Link
                            href="/calendar"
                            onClick={(e) => handleNav(e, '/calendar', t('calendar_view') || 'Calendar')}
                            className={`group flex items-center justify-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                mode === 'calendar'
                                    ? 'bg-[#1C1B0E] text-[#E3D1AA] shadow-sm'
                                    : 'text-[#1C1B0E]/70 hover:text-[#1C1B0E] hover:bg-[#1C1B0E]/10'
                            }`}
                            title={t('calendar_view') || 'Calendar'}
                        >
                            <Calendar className="h-4 w-4 shrink-0" />
                            <span className={`transition-all duration-300 ease-out overflow-hidden whitespace-nowrap ${
                                searchFocused 
                                    ? 'max-w-0 opacity-0 ml-0 group-hover:max-w-[100px] group-hover:opacity-100 group-hover:ml-1.5' 
                                    : 'max-w-[100px] opacity-100 ml-1.5'
                            }`}>
                                {t('calendar_view') || 'Calendar'}
                            </span>
                        </Link>
                    ) : (
                        <div 
                            className="flex items-center justify-center px-2.5 py-1.5 rounded-md text-sm font-medium text-[#1C1B0E]/40 cursor-not-allowed select-none gap-1 bg-[#1C1B0E]/5"
                            title="Akses Kalender dibatasi oleh Administrator (Barrier Aktif)"
                        >
                            <Calendar className="h-4 w-4 shrink-0 opacity-40" />
                            <span className="text-[10px] font-bold text-amber-600">🚧</span>
                        </div>
                    )}
                </div>

                {/* Desktop Search Bar (Hidden on mobile, mobile uses expandable top row) */}
                {onQueryChange ? (
                    <div className="hidden md:flex items-center gap-2 md:flex-1">
                        <div 
                            ref={searchContainerRef}
                            className={`relative transition-all duration-300 md:mx-auto flex-1 ${searchFocused ? 'flex-[2] max-w-full' : 'max-w-xl'}`}
                        >
                            <Search
                                className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors ${searchFocused ? 'text-primary' : 'text-muted-foreground'}`}
                                aria-hidden
                            />
                            <Input
                                value={query || ''}
                                onChange={(e) => onQueryChange(e.target.value)}
                                onFocus={() => setSearchFocused(true)}
                                placeholder={
                                    mode === 'analytics'
                                        ? t('search_analytics_placeholder')
                                        : mode === 'calendar'
                                            ? (t('search_calendar_placeholder') || 'Search tasks, dates, departments...')
                                            : t('search_placeholder')
                                }
                                aria-label="Search issues or locations"
                                className={`pl-9 pr-9 transition-all duration-300 ${searchFocused ? 'ring-2 ring-primary border-primary' : ''}`}
                            />
                            {query && (
                                <button
                                    type="button"
                                    onClick={() => onQueryChange('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#1C1B0E]/60 hover:text-[#1C1B0E] hover:bg-[#1C1B0E]/10 transition-colors cursor-pointer"
                                    title="Clear search"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}

                            {/* Search Dropdown / Live Preview Slot */}
                            {searchFocused && (typeof searchDropdown === 'function' ? searchDropdown(closeAllSearch) : searchDropdown)}
                        </div>
                    </div>
                ) : (
                    <div className="hidden md:block flex-1"></div>
                )}

                {/* Desktop Action Area: Hidden on mobile */}
                <div className="hidden md:flex items-center justify-end gap-2.5 shrink-0 py-0.5">
                    {/* ID | EN Switcher on Desktop */}
                    <div className="flex items-center rounded-lg border border-[#1C1B0E]/20 bg-[#1C1B0E]/10 p-0.5 text-xs font-bold shrink-0 mr-1">
                        <button
                            type="button"
                            onClick={() => setLang('id')}
                            className={`px-2 py-1 rounded transition-all ${lang === 'id' ? 'bg-[#1C1B0E] text-[#E3D1AA] shadow-sm' : 'text-[#1C1B0E]/70 hover:text-[#1C1B0E]'}`}
                        >
                            ID
                        </button>
                        <button
                            type="button"
                            onClick={() => setLang('en')}
                            className={`px-2 py-1 rounded transition-all ${lang === 'en' ? 'bg-[#1C1B0E] text-[#E3D1AA] shadow-sm' : 'text-[#1C1B0E]/70 hover:text-[#1C1B0E]'}`}
                        >
                            EN
                        </button>
                    </div>

                    {/* Only show Report & Emergency buttons on Dashboard */}
                    {mode === 'dashboard' && (
                        <>
                            <Tooltip content={t('tooltip_emergency_btn')} position="bottom">
                                <Button 
                                    onClick={onEmergency} 
                                    className="group gap-0 bg-red-600 hover:bg-red-500 text-white animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)] transition-all duration-300 px-3.5"
                                    title={t('emergency')}
                                >
                                    <span className="shrink-0 text-sm leading-none">🚨</span>
                                    <span className="max-w-0 opacity-0 group-hover:max-w-[120px] group-hover:opacity-100 transition-all duration-300 ease-out overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2 font-bold tracking-wider">
                                        {t('emergency')}
                                    </span>
                                </Button>
                            </Tooltip>

                            <Tooltip content={t('tooltip_report_btn')} position="bottom">
                                <Button 
                                    onClick={onReport} 
                                    className="group gap-0 transition-all duration-300 px-3.5"
                                    title={t('report_issue')}
                                >
                                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                                    <span className="max-w-0 opacity-0 group-hover:max-w-[110px] group-hover:opacity-100 transition-all duration-300 ease-out overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
                                        {t('report_issue')}
                                    </span>
                                </Button>
                            </Tooltip>
                        </>
                    )}

                    {/* Profile Quick Chip / Avatar in Action Area — Positioned on the MOST RIGHT */}
                    <Tooltip content={`${user?.name || 'User'} (${user?.department || (isAdmin ? 'Admin' : '')})`} position="bottom">
                        <Link
                            href="/profile"
                            onClick={(e) => handleNav(e, '/profile', t('profile') || 'Profile')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md ${
                                mode === 'profile'
                                    ? 'bg-[#1C1B0E] text-[#E3D1AA] border-[#1C1B0E] ring-2 ring-[#1C1B0E]/30'
                                    : 'bg-[#1C1B0E]/8 hover:bg-[#1C1B0E]/15 text-[#1C1B0E] border-[#1C1B0E]/20 hover:border-[#1C1B0E]/40'
                            }`}
                            style={mode === 'profile' && userDept ? {
                                borderColor: `${deptTheme.bg}90`,
                                boxShadow: `0 0 12px ${deptTheme.bg}40`,
                            } : (mode !== 'profile' && userDept ? {
                                borderColor: `${deptTheme.bg}70`,
                                backgroundColor: `${deptTheme.bg}22`,
                            } : {})}
                            title={`${user?.name || 'Account'} (${user?.department || (isAdmin ? 'Admin' : '')})`}
                        >
                            {/* Unique Department-Themed Avatar */}
                            <div 
                                className="w-5 h-5 rounded-full flex items-center justify-center font-extrabold text-[10px] shrink-0 shadow-xs ring-1 ring-black/20"
                                style={{
                                    backgroundColor: deptTheme.bg,
                                    color: deptTheme.text,
                                }}
                            >
                                {user?.name ? user.name.charAt(0).toUpperCase() : <User className="h-3 w-3" />}
                            </div>
                            <span className={`hidden sm:inline max-w-[110px] truncate text-[11px] font-bold ${
                                mode === 'profile' ? 'text-[#E3D1AA]' : 'text-[#1C1B0E]'
                            }`}>
                                {staffName || user?.name || t('profile')}
                            </span>
                            {department && (
                                <span 
                                    className="text-[9px] uppercase px-1.5 py-0.5 rounded font-black tracking-wider shrink-0 shadow-xs border border-black/10"
                                    style={{
                                        backgroundColor: deptTheme.bg,
                                        color: deptTheme.text,
                                    }}
                                    title={department}
                                >
                                    {getShortDepartmentName(department)}
                                </span>
                            )}
                        </Link>
                    </Tooltip>
                </div>
            </div>

            <NewPeriodModal open={periodModalOpen} onOpenChange={setPeriodModalOpen} mode={mode} />
        </header>
    </>
    );
}
