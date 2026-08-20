import { useState } from 'react';
import { Plus, Search, Download, CalendarPlus, BarChart3, LayoutDashboard } from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { Link } from '@inertiajs/react';
import { Input } from '@/Components/UI/Input';
import { useIssues } from '@/context/IssuesContext';
import { NewPeriodModal } from '@/Components/CampusFix/NewPeriodModal';

import { useSlashTransition } from '@/Components/CampusFix/SlashTransition';
import { useLanguage } from '@/context/LanguageContext';

export function CampusFixHeader({ mode = 'dashboard', query, onQueryChange, onReport, onEmergency, onExport, onNewPeriod }) {
    const { currentSheet } = useIssues();
    const { lang, setLang, t } = useLanguage();
    const [searchFocused, setSearchFocused] = useState(false);
    const [periodModalOpen, setPeriodModalOpen] = useState(false);
    const { navigateWithSlash } = useSlashTransition();

    const handleNav = (e, href) => {
        e.preventDefault();
        navigateWithSlash(href);
    };

    const handlePeriodOpen = () => {
        if (onNewPeriod) {
            onNewPeriod();
        } else {
            setPeriodModalOpen(true);
        }
    };

    return (
        <header className="sticky top-0 z-30 border-b border-border bg-[#E3D1AA] shadow-sm relative overflow-hidden">
            {/* Transparent Header Texture Overlay */}
            <div 
                className="absolute inset-0 pointer-events-none bg-repeat opacity-30 z-0" 
                style={{ 
                    backgroundImage: "url('/header-bg-texture.png')",
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                }} 
            />

            <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:gap-6">
                <div className="flex items-center gap-2.5 justify-between sm:justify-start w-full sm:w-auto">
                    <div className="flex items-center gap-2.5">
                        <img
                            src="/logo.png"
                            alt="Telunas Resorts"
                            className="h-9 w-auto object-contain"
                        />
                        <div className="flex flex-col">
                            <p className="text-[11px] font-extrabold tracking-wider uppercase text-[#1C1B0E]/80 leading-tight">
                                {t('system_title')}
                            </p>
                        </div>
                    </div>

                    {/* ID | EN Switcher on Mobile (top right beside logo) */}
                    <div className="flex sm:hidden items-center rounded-lg border border-[#1C1B0E]/20 bg-[#1C1B0E]/10 p-0.5 text-xs font-bold shrink-0">
                        <button
                            type="button"
                            onClick={() => setLang('id')}
                            className={`px-2 py-0.5 rounded transition-all ${lang === 'id' ? 'bg-[#1C1B0E] text-[#E3D1AA] shadow-sm' : 'text-[#1C1B0E]/70 hover:text-[#1C1B0E]'}`}
                        >
                            ID
                        </button>
                        <button
                            type="button"
                            onClick={() => setLang('en')}
                            className={`px-2 py-0.5 rounded transition-all ${lang === 'en' ? 'bg-[#1C1B0E] text-[#E3D1AA] shadow-sm' : 'text-[#1C1B0E]/70 hover:text-[#1C1B0E]'}`}
                        >
                            EN
                        </button>
                    </div>
                </div>

                {/* Navigation Toggle */}
                <div className="hidden md:flex bg-[#1C1B0E]/5 p-1 rounded-lg border border-[#1C1B0E]/10 shrink-0 transition-all duration-300">
                    <Link
                        href="/dashboard"
                        onClick={(e) => handleNav(e, '/dashboard')}
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
                    <Link
                        href="/analytics"
                        onClick={(e) => handleNav(e, '/analytics')}
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
                </div>

                {onQueryChange ? (
                    <div className={`relative transition-all duration-300 md:mx-auto ${searchFocused ? 'flex-[2] max-w-full' : 'flex-1 max-w-xl'}`}>
                        <Search
                            className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors ${searchFocused ? 'text-primary' : 'text-muted-foreground'}`}
                            aria-hidden
                        />
                        <Input
                            value={query || ''}
                            onChange={(e) => onQueryChange(e.target.value)}
                            onFocus={() => setSearchFocused(true)}
                            onBlur={() => setSearchFocused(false)}
                            placeholder={mode === 'analytics' ? t('search_analytics_placeholder') : t('search_placeholder')}
                            aria-label="Search issues or locations"
                            className={`pl-9 transition-all duration-300 ${searchFocused ? 'ring-2 ring-primary border-primary' : ''}`}
                        />
                    </div>
                ) : (
                    <div className="flex-1"></div>
                )}

                {/* Action Buttons: Centered with generous spacing on mobile */}
                <div className="flex items-center justify-center sm:justify-end gap-3.5 sm:gap-2.5 shrink-0 flex-wrap w-full md:w-auto py-0.5">
                    {/* ID | EN Switcher on Desktop */}
                    <div className="hidden sm:flex items-center rounded-lg border border-[#1C1B0E]/20 bg-[#1C1B0E]/10 p-0.5 text-xs font-bold shrink-0 mr-1">
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
                    {/* Unified Period Button (Select, Create, Delete sheets) — Only on Dashboard */}
                    {mode === 'dashboard' && (
                        <Button
                            onClick={handlePeriodOpen}
                            variant="outline"
                            className="group gap-0 border-[#1C1B0E]/40 text-[#1C1B0E] hover:bg-[#1C1B0E] hover:text-[#E3D1AA] transition-all duration-300 px-3.5"
                            title={`${t('period')}: ${currentSheet === 'all' ? 'All Sheets' : (currentSheet || 'Default')}`}
                        >
                            <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="max-w-0 opacity-0 group-hover:max-w-[100px] group-hover:opacity-100 transition-all duration-300 ease-out overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
                                {t('period')}
                            </span>
                        </Button>
                    )}

                    {/* Export PDF Button — Only on Dashboard */}
                    {mode === 'dashboard' && onExport && (
                        <Button 
                            onClick={onExport} 
                            variant="outline" 
                            className="group gap-0 border-[#1C1B0E] text-[#1C1B0E] hover:bg-[#1C1B0E] hover:text-[#E3D1AA] transition-all duration-300 px-3.5"
                            title={t('export_pdf')}
                        >
                            <Download className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="max-w-0 opacity-0 group-hover:max-w-[100px] group-hover:opacity-100 transition-all duration-300 ease-out overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
                                {t('export_pdf')}
                            </span>
                        </Button>
                    )}

                    {/* Only show Report & Emergency buttons on Dashboard */}
                    {mode === 'dashboard' && (
                        <>
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
                        </>
                    )}
                </div>
            </div>

            {/* Mobile Nav Toggle */}
            <div className="flex md:hidden bg-[#E3D1AA] border-t border-[#1C1B0E]/10 px-4 py-2 gap-2">
                <Link
                    href="/dashboard"
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        mode === 'dashboard'
                            ? 'bg-[#1C1B0E] text-[#E3D1AA] shadow-sm'
                            : 'text-[#1C1B0E]/70 hover:text-[#1C1B0E] hover:bg-[#1C1B0E]/10 border border-[#1C1B0E]/20'
                    }`}
                >
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                </Link>
                <Link
                    href="/analytics"
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        mode === 'analytics'
                            ? 'bg-[#1C1B0E] text-[#E3D1AA] shadow-sm'
                            : 'text-[#1C1B0E]/70 hover:text-[#1C1B0E] hover:bg-[#1C1B0E]/10 border border-[#1C1B0E]/20'
                    }`}
                >
                    <BarChart3 className="h-4 w-4" />
                    Analytics
                </Link>
            </div>

            <NewPeriodModal open={periodModalOpen} onOpenChange={setPeriodModalOpen} mode={mode} />
        </header>
    );
}
