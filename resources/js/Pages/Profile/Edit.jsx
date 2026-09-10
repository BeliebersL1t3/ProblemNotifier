import { Head, useForm, router, Link } from '@inertiajs/react';
import { useState, useRef } from 'react';
import { 
    User, Lock, KeyRound, LogOut, Shield, Building2, CheckCircle2, 
    AlertCircle, Loader2, Sparkles, Mail, Tag, ShieldCheck, RefreshCw,
    Phone, MessageSquare, Check, Smartphone, Unlink, Trash2,
    Users as UsersIcon, ChevronRight, ShieldAlert
} from 'lucide-react';

import { IssuesProvider } from '@/context/IssuesContext';
import { useLanguage } from '@/context/LanguageContext';
import { CampusFixHeader } from '@/Components/CampusFix/CampusFixHeader';
import { MobileBottomNav } from '@/Components/CampusFix/MobileBottomNav';
import { useAuth } from '@/hooks/useAuth';
import { getDepartmentTheme } from '@/constants/departments';
import { getStaffForDepartment } from '@/constants/staff';
import SubdivisionTag from '@/Components/CampusFix/SubdivisionTag';

export default function ProfilePage() {
    return (
        <IssuesProvider>
            <ProfileInner />
        </IssuesProvider>
    );
}

function ProfileInner() {
    const { t, lang } = useLanguage();
    const { user, isAdmin, isDeptUser, department, subdivision, staffName, whatsappNumber } = useAuth();
    const currentDeptTheme = department ? getDepartmentTheme(department) : { bg: '#C9AA71', text: '#1C1B0E' };

    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const passwordInput = useRef(null);
    const currentPasswordInput = useRef(null);

    // WhatsApp form
    const {
        data: waData,
        setData: setWaData,
        errors: waErrors,
        patch: patchWa,
        processing: waProcessing,
        recentlySuccessful: waSuccessful,
    } = useForm({
        whatsapp_number: user?.whatsapp_number || '',
    });

    const handleWhatsAppUpdate = (e) => {
        e.preventDefault();
        patchWa(route('profile.whatsapp'), {
            preserveScroll: true,
        });
    };

    const handleUnlinkWhatsApp = () => {
        if (!confirm(lang === 'id' ? 'Apakah Anda yakin ingin melepas tautan nomor WhatsApp ini dari akun Anda?' : 'Are you sure you want to unlink this WhatsApp number from your account?')) {
            return;
        }
        setWaData('whatsapp_number', '');
        router.patch(route('profile.whatsapp'), { whatsapp_number: '' }, {
            preserveScroll: true,
            onSuccess: () => {
                setWaData('whatsapp_number', '');
            }
        });
    };

    const {
        data,
        setData,
        errors,
        put,
        reset,
        processing,
        recentlySuccessful,
    } = useForm({
        current_password: '',
        password: '',
        password_confirmation: '',
    });

    const handlePasswordUpdate = (e) => {
        e.preventDefault();

        put(route('password.update'), {
            preserveScroll: true,
            onSuccess: () => {
                reset();
            },
            onError: (errs) => {
                if (errs.password) {
                    reset('password', 'password_confirmation');
                    passwordInput.current?.focus();
                }
                if (errs.current_password) {
                    reset('current_password');
                    currentPasswordInput.current?.focus();
                }
            },
        });
    };

    const handleLogout = () => {
        if (!confirm(t('confirm_logout_msg') || 'Are you sure you want to log out?')) {
            return;
        }
        setIsLoggingOut(true);
        router.post(route('logout'), {}, {
            onFinish: () => setIsLoggingOut(false),
        });
    };

    const deptStaffRoster = department ? getStaffForDepartment(department) : [];

    return (
        <div className="min-h-screen bg-[#1C1B0E] text-[#FAFAFA] relative overflow-hidden antialiased selection:bg-[#C9AA71]/30">
            <Head title={`${t('profile') || 'Profil'} — Telunas Resort`} />

            {/* Background Motif Pattern Overlay */}
            <div 
                className="fixed inset-0 pointer-events-none opacity-25 z-0 bg-repeat"
                style={{
                    backgroundImage: "url('/bg-lineart.png')",
                    backgroundSize: '600px',
                }}
            />

            {/* Ambient Glow */}
            <div className="fixed top-12 left-1/2 -translate-x-1/2 w-[750px] h-[380px] pointer-events-none blur-[160px] opacity-15 rounded-full bg-[#C9AA71] z-0" />

            <div className="relative z-10">
                <CampusFixHeader mode="profile" />

                <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-10 pb-28 md:pb-10">
                    {/* Header Banner */}
                    <div className="rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl border border-white/10 bg-gradient-to-br from-[#2A281E] to-[#1C1B0E]">
                        <div className="flex items-center gap-4">
                            <div 
                                className="w-16 h-16 rounded-2xl flex items-center justify-center font-extrabold text-2xl shadow-xl border border-white/20 shrink-0"
                                style={{ background: currentDeptTheme.bg, color: currentDeptTheme.text }}
                            >
                                {user?.name ? user.name.charAt(0).toUpperCase() : <User className="h-8 w-8" />}
                            </div>
                            <div>
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#FAFAFA]">
                                        {staffName || user?.name || 'Account'}
                                    </h1>
                                    {isAdmin && (
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#C9AA71] text-[#1C1B0E] flex items-center gap-1 shadow-sm">
                                            <ShieldCheck className="h-3.5 w-3.5" />
                                            Admin
                                        </span>
                                    )}
                                    {department && (
                                        <SubdivisionTag 
                                            department={department} 
                                            subdivision={subdivision} 
                                            size="sm" 
                                        />
                                    )}
                                </div>
                                <p className="text-xs sm:text-sm text-[#A19F8D] mt-1 flex items-center gap-1.5">
                                    <Mail className="h-3.5 w-3.5" />
                                    {user?.email}
                                </p>
                            </div>
                        </div>

                        {/* Logout Button */}
                        <button
                            type="button"
                            onClick={handleLogout}
                            disabled={isLoggingOut}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 hover:border-red-500 transition-all duration-200 cursor-pointer shadow-lg hover:scale-105 disabled:opacity-60 shrink-0"
                        >
                            {isLoggingOut ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <LogOut className="h-4 w-4" />
                            )}
                            <span>{isLoggingOut ? (t('logging_out') || 'Logging out...') : (t('logout') || 'Log Out')}</span>
                        </button>
                    </div>

                    {/* Admin Control Hub Banner (Visible only for Administrator) */}
                    {isAdmin && (
                        <div className="rounded-2xl border border-[#C9AA71]/40 bg-gradient-to-r from-[#2A281E] via-[#332E1C] to-[#1C1B0E] p-6 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden group">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-[#C9AA71]/20 text-[#C9AA71] border border-[#C9AA71]/40 shadow-inner shrink-0">
                                    <UsersIcon className="h-7 w-7" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-base sm:text-lg font-extrabold text-[#FAFAFA]">
                                            {lang === 'id' ? 'Manajemen Pengguna & Hak Akses' : 'User Management & Permissions'}
                                        </h2>
                                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-[#C9AA71] text-[#1C1B0E]">
                                            ADMIN
                                        </span>
                                    </div>
                                    <p className="text-xs text-[#A19F8D] mt-0.5 max-w-xl leading-relaxed">
                                        {lang === 'id'
                                            ? 'Atur akun staf, reset password, konfigurasi departemen, matriks izin akses (Barrier), serta pantau audit log keamanan resort.'
                                            : 'Manage staff credentials, reset passwords, configure department scopes, access barriers, and review security audit logs.'}
                                    </p>
                                </div>
                            </div>
                            <Link
                                href="/users"
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-bold bg-[#C9AA71] hover:bg-[#b89960] text-[#1C1B0E] transition-all shadow-md hover:shadow-lg cursor-pointer shrink-0 hover:scale-[1.02]"
                            >
                                <ShieldAlert className="h-4 w-4" />
                                <span>{lang === 'id' ? 'Buka Kelola Semua Akun' : 'Open User Management'}</span>
                                <ChevronRight className="h-4 w-4" />
                            </Link>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Account Details Card */}
                        <div className="lg:col-span-1 space-y-6">
                            <div className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/90 p-6 shadow-xl space-y-4">
                                <div className="flex items-center gap-2 pb-3 border-b border-[#3B3929]">
                                    <Shield className="h-5 w-5 text-[#C9AA71]" />
                                    <h2 className="text-base font-bold text-[#FAFAFA]">
                                        {t('account_info') || 'Informasi Akun'}
                                    </h2>
                                </div>

                                <div className="space-y-3.5 text-xs">
                                    <div>
                                        <p className="text-[#A19F8D] font-medium">{t('email_label') || 'Alamat Email'}</p>
                                        <p className="text-sm font-semibold text-[#FAFAFA] break-all">{user?.email}</p>
                                    </div>

                                    <div>
                                        <p className="text-[#A19F8D] font-medium">{t('staff_name_label') || 'Nama Tampilan'}</p>
                                        <p className="text-sm font-semibold text-[#FAFAFA]">{staffName || user?.name || '-'}</p>
                                    </div>

                                    <div>
                                        <p className="text-[#A19F8D] font-medium">{t('role_label') || 'Peran Akun'}</p>
                                        <p className="text-sm font-semibold text-[#FAFAFA] capitalize">
                                            {isAdmin ? 'Administrator (Full Access)' : 'Department User'}
                                        </p>
                                    </div>

                                    {department && (
                                        <div>
                                            <p className="text-[#A19F8D] font-medium mb-1.5">{t('department_label') || 'Cakupan Departemen'}</p>
                                            <SubdivisionTag 
                                                department={department} 
                                                subdivision={subdivision} 
                                                size="md" 
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Scope Roster Card (if department user) */}
                            {department && deptStaffRoster.length > 0 && (
                                <div className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/60 p-5 shadow-xl space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Building2 className="h-4 w-4 text-[#C9AA71]" />
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#E3D1AA]">
                                            {department} Team Scope
                                        </h3>
                                    </div>
                                    <p className="text-[11px] text-[#A19F8D]">
                                        Your account is scoped to manage and claim tasks assigned to the <strong>{department}</strong> unit:
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {deptStaffRoster.map(s => (
                                            <span 
                                                key={s} 
                                                className={`text-[11px] px-2 py-0.5 rounded-md border ${
                                                    s === staffName || s === user?.name 
                                                        ? 'bg-[#C9AA71] text-[#1C1B0E] font-bold border-[#C9AA71]' 
                                                        : 'bg-[#1C1B0E] text-[#A19F8D] border-[#3B3929]'
                                                }`}
                                            >
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Column: WhatsApp Linking & Password Change */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* WhatsApp Linking Card */}
                            <div className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/90 p-6 sm:p-8 shadow-xl space-y-6">
                                <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#3B3929] flex-wrap">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
                                            <Smartphone className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h2 className="text-base sm:text-lg font-bold text-[#FAFAFA]">
                                                {t('whatsapp_linking_title') || 'Integrasi WhatsApp & Pengenalan Otomatis'}
                                            </h2>
                                            <p className="text-xs text-[#A19F8D] mt-0.5">
                                                {lang === 'id'
                                                    ? 'Tautkan nomor WhatsApp Anda agar Bot dapat mengenali Anda saat klaim/lapor issue.'
                                                    : 'Link your WhatsApp number so the Bot recognizes you automatically when claiming issues.'}
                                            </p>
                                        </div>
                                    </div>

                                    {user?.whatsapp_number ? (
                                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 flex items-center gap-1.5 shadow-sm">
                                            <Check className="h-3.5 w-3.5" />
                                            <span>+{user.whatsapp_number}</span>
                                        </span>
                                    ) : (
                                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/40 border border-amber-500/40 text-amber-300 flex items-center gap-1.5">
                                            <span>⚠️ Belum Ditautkan</span>
                                        </span>
                                    )}
                                </div>

                                <form onSubmit={handleWhatsAppUpdate} className="space-y-4">
                                    {waSuccessful && (
                                        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs font-semibold animate-fade-in">
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                            <span>{lang === 'id' ? 'Nomor WhatsApp berhasil disimpan dan ditautkan!' : 'WhatsApp number successfully linked!'}</span>
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <label 
                                            htmlFor="whatsapp_number" 
                                            className="block text-xs font-semibold text-[#FAFAFA]"
                                        >
                                            {t('whatsapp_number_label') || 'Nomor WhatsApp Anda'}
                                        </label>
                                        <div className="relative">
                                            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A19F8D]" />
                                            <input
                                                id="whatsapp_number"
                                                type="text"
                                                value={waData.whatsapp_number}
                                                onChange={(e) => setWaData('whatsapp_number', e.target.value)}
                                                placeholder="e.g. 08123456789 atau +628123456789"
                                                className="w-full rounded-xl border border-[#3B3929] bg-[#1C1B0E] pl-9 pr-3 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#A19F8D]/40 focus:border-[#C9AA71] focus:outline-none transition-colors font-mono"
                                            />
                                        </div>
                                        {waErrors.whatsapp_number && (
                                            <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
                                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                {waErrors.whatsapp_number}
                                            </p>
                                        )}
                                        <p className="text-[11px] text-[#A19F8D] leading-relaxed pt-1">
                                            💡 {lang === 'id' 
                                                ? `Dengan menautkan nomor ini, Anda cukup mengetik "!claim" di grup WhatsApp dan bot akan otomatis mencatatnya atas nama ${staffName || user?.name}. Nomor ini juga mencegah orang lain mengklaim nama Anda.`
                                                : `By linking this number, simply typing "!claim" in WhatsApp groups will automatically claim tasks as ${staffName || user?.name}. It also protects your name from being claimed by others.`}
                                        </p>
                                    </div>

                                    <div className="pt-2 flex items-center justify-between gap-3 flex-wrap">
                                        {user?.whatsapp_number ? (
                                            <button
                                                type="button"
                                                onClick={handleUnlinkWhatsApp}
                                                disabled={waProcessing}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-red-400 hover:text-white bg-red-950/40 hover:bg-red-600/80 border border-red-900/60 hover:border-red-500 transition-all cursor-pointer shadow-md disabled:opacity-50"
                                            >
                                                <Unlink className="h-4 w-4" />
                                                <span>{lang === 'id' ? 'Lepas Tautan Nomor' : 'Unlink WhatsApp Number'}</span>
                                            </button>
                                        ) : <div />}

                                        <button
                                            type="submit"
                                            disabled={waProcessing}
                                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-105 active:scale-95 transition-all shadow-xl cursor-pointer disabled:opacity-60 ml-auto"
                                        >
                                            {waProcessing ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    <span>{t('saving') || 'Menyimpan...'}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Smartphone className="h-4 w-4" />
                                                    <span>
                                                        {user?.whatsapp_number 
                                                            ? (lang === 'id' ? 'Perbarui Nomor WhatsApp' : 'Update WhatsApp Number')
                                                            : (lang === 'id' ? 'Simpan & Tautkan Nomor' : 'Save & Link Number')}
                                                    </span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Password Change Form Card */}
                            <div className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/90 p-6 sm:p-8 shadow-xl space-y-6">
                                <div className="flex items-center gap-2.5 pb-4 border-b border-[#3B3929]">
                                    <KeyRound className="h-5 w-5 text-[#C9AA71]" />
                                    <div>
                                        <h2 className="text-base sm:text-lg font-bold text-[#FAFAFA]">
                                            {t('change_password') || 'Ganti Kata Sandi'}
                                        </h2>
                                        <p className="text-xs text-[#A19F8D] mt-0.5">
                                            {lang === 'id' 
                                                ? 'Pastikan akun Anda menggunakan kata sandi yang aman untuk mencegah akses tidak sah.' 
                                                : 'Ensure your account is using a secure password to prevent unauthorized access.'}
                                        </p>
                                    </div>
                                </div>

                                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                                    {/* Success Message Alert */}
                                    {recentlySuccessful && (
                                        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs font-semibold animate-fade-in">
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                            <span>{t('password_changed_success') || 'Kata sandi berhasil diperbarui.'}</span>
                                        </div>
                                    )}

                                    {/* Current Password */}
                                    <div className="space-y-1.5">
                                        <label 
                                            htmlFor="current_password" 
                                            className="block text-xs font-semibold text-[#FAFAFA]"
                                        >
                                            {t('current_password') || 'Kata Sandi Saat Ini'} <span className="text-red-400">*</span>
                                        </label>
                                        <div className="relative">
                                            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A19F8D]" />
                                            <input
                                                id="current_password"
                                                ref={currentPasswordInput}
                                                type="password"
                                                value={data.current_password}
                                                onChange={(e) => setData('current_password', e.target.value)}
                                                autoComplete="current-password"
                                                placeholder="••••••••"
                                                className="w-full rounded-xl border border-[#3B3929] bg-[#1C1B0E] pl-9 pr-3 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#A19F8D]/40 focus:border-[#C9AA71] focus:outline-none transition-colors"
                                            />
                                        </div>
                                        {errors.current_password && (
                                            <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
                                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                {errors.current_password}
                                            </p>
                                        )}
                                    </div>

                                    {/* New Password */}
                                    <div className="space-y-1.5">
                                        <label 
                                            htmlFor="password" 
                                            className="block text-xs font-semibold text-[#FAFAFA]"
                                        >
                                            {t('new_password') || 'Kata Sandi Baru'} <span className="text-red-400">*</span>
                                        </label>
                                        <div className="relative">
                                            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A19F8D]" />
                                            <input
                                                id="password"
                                                ref={passwordInput}
                                                type="password"
                                                value={data.password}
                                                onChange={(e) => setData('password', e.target.value)}
                                                autoComplete="new-password"
                                                placeholder="••••••••"
                                                className="w-full rounded-xl border border-[#3B3929] bg-[#1C1B0E] pl-9 pr-3 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#A19F8D]/40 focus:border-[#C9AA71] focus:outline-none transition-colors"
                                            />
                                        </div>
                                        {errors.password && (
                                            <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
                                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                {errors.password}
                                            </p>
                                        )}
                                    </div>

                                    {/* Confirm New Password */}
                                    <div className="space-y-1.5">
                                        <label 
                                            htmlFor="password_confirmation" 
                                            className="block text-xs font-semibold text-[#FAFAFA]"
                                        >
                                            {t('confirm_password') || 'Konfirmasi Kata Sandi Baru'} <span className="text-red-400">*</span>
                                        </label>
                                        <div className="relative">
                                            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A19F8D]" />
                                            <input
                                                id="password_confirmation"
                                                type="password"
                                                value={data.password_confirmation}
                                                onChange={(e) => setData('password_confirmation', e.target.value)}
                                                autoComplete="new-password"
                                                placeholder="••••••••"
                                                className="w-full rounded-xl border border-[#3B3929] bg-[#1C1B0E] pl-9 pr-3 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#A19F8D]/40 focus:border-[#C9AA71] focus:outline-none transition-colors"
                                            />
                                        </div>
                                        {errors.password_confirmation && (
                                            <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
                                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                {errors.password_confirmation}
                                            </p>
                                        )}
                                    </div>

                                    <div className="pt-3 flex justify-end">
                                        <button
                                            type="submit"
                                            disabled={processing}
                                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-[#C9AA71] text-[#1C1B0E] hover:bg-[#D8BE8A] hover:scale-105 active:scale-95 transition-all shadow-xl cursor-pointer disabled:opacity-60"
                                        >
                                            {processing ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    <span>{t('saving') || 'Menyimpan...'}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <KeyRound className="h-4 w-4" />
                                                    <span>{t('save_password') || 'Simpan Kata Sandi Baru'}</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </main>

                <MobileBottomNav currentTab="profile" />
            </div>
        </div>
    );
}
