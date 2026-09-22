import { Head, useForm, router, Link } from '@inertiajs/react';
import { useState, useRef } from 'react';
import { 
    User, Lock, KeyRound, LogOut, Shield, Building2, CheckCircle2, 
    AlertCircle, Loader2, Sparkles, Mail, Tag, ShieldCheck, RefreshCw,
    Phone, MessageSquare, Check, Smartphone, Unlink, Trash2,
    Users as UsersIcon, ChevronRight, ShieldAlert, Camera, UploadCloud,
    Image as ImageIcon, X, Ticket, Clock, ArrowRightLeft, Globe, Crown
} from 'lucide-react';

import { IssuesProvider } from '@/context/IssuesContext';
import { useLanguage } from '@/context/LanguageContext';
import { CampusFixHeader } from '@/Components/CampusFix/CampusFixHeader';
import { MobileBottomNav } from '@/Components/CampusFix/MobileBottomNav';
import { useAuth } from '@/hooks/useAuth';
import { getDepartmentTheme, ALL_DEPARTMENTS, DEPARTMENT_SUBDIVISIONS } from '@/constants/departments';
import { getStaffForDepartment } from '@/constants/staff';
import SubdivisionTag from '@/Components/CampusFix/SubdivisionTag';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/Components/UI/Dialog';

export default function ProfilePage(props) {
    return (
        <IssuesProvider>
            <ProfileInner {...props} />
        </IssuesProvider>
    );
}

function ProfileInner({ pendingTicket, pendingTransferTicket, notifyWhatsAppTickets, status }) {
    const { t, lang } = useLanguage();
    const { 
        user, isAdmin, isHOD, isDeptUser, department, subdivision, staffName, whatsappNumber, avatarUrl,
        canViewAllDepartments, canManageIssues, canDeleteIssues, canExportReports, canAccessCalendar, canAccessAnalytics
    } = useAuth();
    const canDirectUpdateWa = isAdmin || isHOD;
    const currentDeptTheme = department ? getDepartmentTheme(department) : { bg: '#C9AA71', text: '#1C1B0E' };

    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const passwordInput = useRef(null);
    const currentPasswordInput = useRef(null);

    // Profile Photo / Avatar management state
    const avatarInputRef = useRef(null);
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [isDeletingAvatar, setIsDeletingAvatar] = useState(false);
    const [avatarError, setAvatarError] = useState('');
    const [avatarSuccess, setAvatarSuccess] = useState('');

    const handleAvatarSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.match(/^image\/(jpeg|png|jpg|webp)$/i)) {
            setAvatarError(lang === 'id' ? 'Format gambar tidak didukung. Harap gunakan file JPG, PNG, atau WEBP.' : 'Unsupported image format. Please select JPG, PNG, or WEBP.');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setAvatarError(lang === 'id' ? 'Ukuran file terlalu besar (maksimal 5MB).' : 'File size too large (maximum 5MB).');
            return;
        }

        setAvatarError('');
        setAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
    };

    const handleAvatarUpload = (e) => {
        if (e) e.preventDefault();
        if (!avatarFile) return;

        setIsUploadingAvatar(true);
        setAvatarError('');

        const formData = new FormData();
        formData.append('avatar', avatarFile);

        router.post('/profile/avatar', formData, {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                setIsUploadingAvatar(false);
                setAvatarFile(null);
                setAvatarPreview(null);
                if (avatarInputRef.current) avatarInputRef.current.value = '';
                setAvatarSuccess(lang === 'id' ? 'Foto profil berhasil diperbarui!' : 'Profile photo updated successfully!');
                setTimeout(() => setAvatarSuccess(''), 4000);
            },
            onError: (errs) => {
                setIsUploadingAvatar(false);
                setAvatarError(errs?.avatar || (lang === 'id' ? 'Gagal mengunggah foto profil.' : 'Failed to upload profile photo.'));
            },
        });
    };

    const handleAvatarCancel = () => {
        setAvatarFile(null);
        setAvatarPreview(null);
        setAvatarError('');
        if (avatarInputRef.current) {
            avatarInputRef.current.value = '';
        }
    };

    const handleAvatarDelete = () => {
        if (!confirm(lang === 'id' ? 'Apakah Anda yakin ingin menghapus foto profil dan kembali menggunakan inisial akun?' : 'Are you sure you want to remove your profile photo and restore default initials?')) {
            return;
        }

        setIsDeletingAvatar(true);
        setAvatarError('');

        router.delete('/profile/avatar', {
            preserveScroll: true,
            onSuccess: () => {
                setIsDeletingAvatar(false);
                handleAvatarCancel();
                setAvatarSuccess(lang === 'id' ? 'Foto profil berhasil dihapus.' : 'Profile photo removed.');
                setTimeout(() => setAvatarSuccess(''), 4000);
            },
            onError: () => {
                setIsDeletingAvatar(false);
                setAvatarError(lang === 'id' ? 'Gagal menghapus foto profil.' : 'Failed to remove profile photo.');
            },
        });
    };

    // Notification preference state
    const hasWhatsapp = Boolean(user?.whatsapp_number);
    const [notifyPref, setNotifyPref] = useState(hasWhatsapp ? (notifyWhatsAppTickets ?? true) : false);
    const [isUpdatingNotifyPref, setIsUpdatingNotifyPref] = useState(false);

    const handleToggleNotifyPref = () => {
        if (!hasWhatsapp) {
            return;
        }
        const nextVal = !notifyPref;
        setIsUpdatingNotifyPref(true);
        router.patch(route('profile.notificationPreferences'), {
            notify_whatsapp_tickets: nextVal,
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setNotifyPref(nextVal);
                setIsUpdatingNotifyPref(false);
            },
            onError: () => {
                setIsUpdatingNotifyPref(false);
            }
        });
    };

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
        reason: '',
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
        router.patch(route('profile.whatsapp'), { 
            whatsapp_number: '',
            reason: 'Permintaan pelepasan nomor WhatsApp mandiri via Profile'
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setWaData('whatsapp_number', '');
            }
        });
    };

    // Password Reset Ticket Form (for non-admins)
    const {
        data: pwdTicketData,
        setData: setPwdTicketData,
        errors: pwdTicketErrors,
        post: postPwdTicket,
        processing: pwdTicketProcessing,
        reset: resetPwdTicket,
        recentlySuccessful: pwdTicketSuccessful,
    } = useForm({
        reason: '',
        new_password: '',
        new_password_confirmation: '',
    });

    const handlePasswordTicketSubmit = (e) => {
        e.preventDefault();
        postPwdTicket(route('tickets.password'), {
            preserveScroll: true,
            onSuccess: () => resetPwdTicket(),
        });
    };

    // Department Transfer Ticket Form
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const {
        data: transferData,
        setData: setTransferData,
        errors: transferErrors,
        post: postTransferTicket,
        processing: transferProcessing,
        reset: resetTransfer,
    } = useForm({
        target_department: '',
        target_subdivision: '',
        reason: '',
    });

    const handleTransferSubmit = (e) => {
        e.preventDefault();
        postTransferTicket(route('tickets.departmentTransfer'), {
            preserveScroll: true,
            onSuccess: () => {
                resetTransfer();
                setIsTransferModalOpen(false);
            },
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
                    {/* Hidden Avatar File Input */}
                    <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/jpg,image/webp"
                        onChange={handleAvatarSelect}
                        className="hidden"
                    />

                    {/* Header Banner */}
                    <div className="rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 shadow-xl border border-white/10 bg-gradient-to-br from-[#2A281E] to-[#1C1B0E]">
                        <div className="flex items-start sm:items-center gap-5">
                            {/* Interactive Avatar in Banner */}
                            <div className="relative group shrink-0">
                                <div 
                                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center font-extrabold text-2xl sm:text-3xl shadow-xl border-2 border-white/20 overflow-hidden relative"
                                    style={{ background: currentDeptTheme.bg, color: currentDeptTheme.text }}
                                >
                                    {avatarPreview ? (
                                        <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                                    ) : avatarUrl ? (
                                        <img src={avatarUrl} alt={user?.name || 'Avatar'} className="w-full h-full object-cover" />
                                    ) : (
                                        user?.name ? user.name.charAt(0).toUpperCase() : <User className="h-8 w-8" />
                                    )}

                                    {/* Hover overlay button */}
                                    <button
                                        type="button"
                                        onClick={() => avatarInputRef.current?.click()}
                                        disabled={isUploadingAvatar || isDeletingAvatar}
                                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity duration-200 cursor-pointer backdrop-blur-[2px]"
                                        title={lang === 'id' ? 'Ubah Foto Profil' : 'Change Profile Photo'}
                                    >
                                        <Camera className="h-5 w-5 sm:h-6 sm:w-6 text-[#E3D1AA] mb-0.5" />
                                        <span className="text-[10px] font-bold text-[#E3D1AA]">{lang === 'id' ? 'Ubah' : 'Change'}</span>
                                    </button>
                                </div>

                                {/* Quick Camera Badge Icon */}
                                <button
                                    type="button"
                                    onClick={() => avatarInputRef.current?.click()}
                                    disabled={isUploadingAvatar || isDeletingAvatar}
                                    className="absolute -bottom-1 -right-1 sm:-bottom-1.5 sm:-right-1.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#C9AA71] hover:bg-[#E3D1AA] text-[#1C1B0E] flex items-center justify-center shadow-lg border-2 border-[#1C1B0E] transition-transform hover:scale-110 cursor-pointer"
                                    title={lang === 'id' ? 'Pilih Foto Baru' : 'Choose New Photo'}
                                >
                                    <Camera className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                </button>
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

                                {/* Banner Quick Preview Action Bar */}
                                {avatarPreview && (
                                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                                        <span className="text-[11px] text-[#E3D1AA] font-semibold flex items-center gap-1">
                                            <Sparkles className="h-3 w-3 text-[#C9AA71]" />
                                            {lang === 'id' ? 'Foto siap disimpan:' : 'Ready to save:'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleAvatarUpload}
                                            disabled={isUploadingAvatar}
                                            className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-[#C9AA71] hover:bg-[#b89960] text-[#1C1B0E] transition-all cursor-pointer shadow-md disabled:opacity-60"
                                        >
                                            {isUploadingAvatar ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                            <span>{isUploadingAvatar ? (lang === 'id' ? 'Menyimpan...' : 'Saving...') : (lang === 'id' ? 'Simpan' : 'Save')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleAvatarCancel}
                                            disabled={isUploadingAvatar}
                                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-[#FAFAFA] transition-all cursor-pointer"
                                        >
                                            <X className="h-3 w-3" />
                                            <span>{lang === 'id' ? 'Batal' : 'Cancel'}</span>
                                        </button>
                                    </div>
                                )}
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
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <SubdivisionTag 
                                                    department={department} 
                                                    subdivision={subdivision} 
                                                    size="md" 
                                                />
                                                {!isAdmin && !pendingTransferTicket && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsTransferModalOpen(true)}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#C9AA71]/15 text-[#E3D1AA] hover:bg-[#C9AA71]/25 border border-[#C9AA71]/30 transition-all cursor-pointer"
                                                    >
                                                        <ArrowRightLeft className="w-3.5 h-3.5 text-[#C9AA71]" />
                                                        <span>{lang === 'id' ? 'Ajukan Pindah Departemen' : 'Request Transfer'}</span>
                                                    </button>
                                                )}
                                            </div>

                                            {/* Pending Transfer Alert */}
                                            {pendingTransferTicket && (
                                                <div className="mt-3 p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-xs text-teal-200 space-y-1">
                                                    <div className="flex items-center gap-1.5 font-bold text-teal-300">
                                                        <Clock className="w-4 h-4 text-teal-400" />
                                                        <span>Permohonan Pindah (#{pendingTransferTicket.ticket_number})</span>
                                                    </div>
                                                    <p className="text-[11px] text-teal-200/80">
                                                        Tujuan: <strong>{pendingTransferTicket.requested_value?.replace('::', ' — Subdivisi: ')}</strong>
                                                    </p>
                                                    <p className="text-[10px] text-teal-300/70">
                                                        Status: Menunggu ACC <strong>{pendingTransferTicket.status === 'pending_hod' ? 'HOD Departemen Asal' : 'Admin'}</strong>
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Active Account Permissions Card */}
                            <div className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/60 p-5 shadow-xl space-y-3">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4 text-[#C9AA71]" />
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#E3D1AA]">
                                        {lang === 'id' ? 'Wewenang & Hak Akses Akun' : 'Account Special Permissions'}
                                    </h3>
                                </div>
                                <div className="space-y-2 pt-1 text-xs">
                                    {isAdmin && (
                                        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
                                            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-bold text-amber-200">Full Administrator Access</p>
                                                <p className="text-[11px] text-[#A19F8D]">Wewenang penuh untuk mengatur seluruh sistem, staf, tiket, dan isu.</p>
                                            </div>
                                        </div>
                                    )}

                                    {isHOD && (
                                        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
                                            <Crown className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-bold text-amber-200">Head of Department (HOD)</p>
                                                <p className="text-[11px] text-[#A19F8D]">Pimpinan departemen dengan wewenang persetujuan tiket dan manajemen tim.</p>
                                            </div>
                                        </div>
                                    )}

                                    {canViewAllDepartments && !isAdmin && (
                                        <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-start gap-2.5">
                                            <Globe className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-bold text-sky-300">Akses Lintas Seluruh Departemen</p>
                                                <p className="text-[11px] text-[#A19F8D]">Anda memiliki izin istimewa untuk memantau dan memfilter isu dari semua divisi resort Telunas di dashboard.</p>
                                            </div>
                                        </div>
                                    )}

                                    {canManageIssues && !isAdmin && (
                                        <div className="p-2 rounded-lg bg-[#1C1B0E] border border-[#3B3929] flex items-center justify-between text-[11px]">
                                            <span className="text-[#FAFAFA] font-medium flex items-center gap-1.5">
                                                <Check className="w-3.5 h-3.5 text-emerald-400" /> Kelola & Edit Isu
                                            </span>
                                            <span className="text-emerald-400 font-bold text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Aktif</span>
                                        </div>
                                    )}

                                    {canExportReports && !isAdmin && (
                                        <div className="p-2 rounded-lg bg-[#1C1B0E] border border-[#3B3929] flex items-center justify-between text-[11px]">
                                            <span className="text-[#FAFAFA] font-medium flex items-center gap-1.5">
                                                <Check className="w-3.5 h-3.5 text-emerald-400" /> Ekspor Laporan (PDF & Excel)
                                            </span>
                                            <span className="text-emerald-400 font-bold text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Aktif</span>
                                        </div>
                                    )}

                                    {canAccessCalendar && !isAdmin && (
                                        <div className="p-2 rounded-lg bg-[#1C1B0E] border border-[#3B3929] flex items-center justify-between text-[11px]">
                                            <span className="text-[#FAFAFA] font-medium flex items-center gap-1.5">
                                                <Check className="w-3.5 h-3.5 text-emerald-400" /> Akses Kalender Operasional
                                            </span>
                                            <span className="text-emerald-400 font-bold text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Aktif</span>
                                        </div>
                                    )}

                                    {canAccessAnalytics && !isAdmin && (
                                        <div className="p-2 rounded-lg bg-[#1C1B0E] border border-[#3B3929] flex items-center justify-between text-[11px]">
                                            <span className="text-[#FAFAFA] font-medium flex items-center gap-1.5">
                                                <Check className="w-3.5 h-3.5 text-emerald-400" /> Akses Halaman Grafik Analitik
                                            </span>
                                            <span className="text-emerald-400 font-bold text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Aktif</span>
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

                        {/* Right Column: Profile Photo, WhatsApp Linking & Password Change */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Profile Photo Card */}
                            <div className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/90 p-6 sm:p-8 shadow-xl space-y-6">
                                <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#3B3929] flex-wrap">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-xl bg-[#C9AA71]/20 text-[#C9AA71] flex items-center justify-center border border-[#C9AA71]/30 shrink-0">
                                            <Camera className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h2 className="text-base sm:text-lg font-bold text-[#FAFAFA]">
                                                {lang === 'id' ? 'Foto Profil Akun' : 'Account Profile Photo'}
                                            </h2>
                                            <p className="text-xs text-[#A19F8D] mt-0.5">
                                                {lang === 'id'
                                                    ? 'Personalisasi avatar akun Anda agar mudah dikenali oleh seluruh rekan tim dan resort.'
                                                    : 'Personalize your avatar for easy recognition across team activities and operations.'}
                                            </p>
                                        </div>
                                    </div>

                                    {avatarUrl ? (
                                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 flex items-center gap-1.5 shadow-sm">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                            <span>{lang === 'id' ? 'Foto Kustom Aktif' : 'Custom Photo Active'}</span>
                                        </span>
                                    ) : (
                                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-[#A19F8D] flex items-center gap-1.5">
                                            <User className="h-3.5 w-3.5" />
                                            <span>{lang === 'id' ? 'Inisial Default' : 'Default Initials'}</span>
                                        </span>
                                    )}
                                </div>

                                {/* Status Alerts */}
                                {avatarSuccess && (
                                    <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium animate-in fade-in duration-200">
                                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                        <span>{avatarSuccess}</span>
                                    </div>
                                )}

                                {avatarError && (
                                    <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-medium animate-in fade-in duration-200">
                                        <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                                        <span>{avatarError}</span>
                                    </div>
                                )}

                                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                                    {/* Large Avatar Preview with frame */}
                                    <div className="relative group shrink-0">
                                        <div 
                                            className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl flex items-center justify-center font-extrabold text-3xl sm:text-4xl shadow-2xl border-2 border-[#C9AA71]/40 overflow-hidden relative ring-4 ring-black/30"
                                            style={{ background: currentDeptTheme.bg, color: currentDeptTheme.text }}
                                        >
                                            {avatarPreview ? (
                                                <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                                            ) : avatarUrl ? (
                                                <img src={avatarUrl} alt={user?.name || 'Avatar'} className="w-full h-full object-cover" />
                                            ) : (
                                                user?.name ? user.name.charAt(0).toUpperCase() : <User className="h-12 w-12" />
                                            )}

                                            {/* Hover overlay to change */}
                                            <button
                                                type="button"
                                                onClick={() => avatarInputRef.current?.click()}
                                                disabled={isUploadingAvatar || isDeletingAvatar}
                                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity duration-200 cursor-pointer backdrop-blur-[2px]"
                                            >
                                                <UploadCloud className="h-7 w-7 text-[#E3D1AA] mb-1" />
                                                <span className="text-[11px] font-bold text-[#E3D1AA]">{lang === 'id' ? 'Ganti Foto' : 'Change'}</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Action Controls & Instructions */}
                                    <div className="flex-1 space-y-3.5 text-center sm:text-left">
                                        <div className="space-y-1">
                                            <h3 className="text-sm font-bold text-[#FAFAFA]">
                                                {lang === 'id' ? 'Pengaturan Avatar' : 'Avatar Settings'}
                                            </h3>
                                            <p className="text-xs text-[#A19F8D] leading-relaxed">
                                                {lang === 'id'
                                                    ? 'Unggah foto profil Anda (JPG, PNG, atau WEBP, maks. 5MB). Foto akan ditampilkan pada header, kartu profil, serta daftar aktivitas sistem.'
                                                    : 'Upload your avatar photo (JPG, PNG, or WEBP, max 5MB). Your photo appears on the header, profile badges, and system activity logs.'}
                                            </p>
                                        </div>

                                        {avatarPreview ? (
                                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={handleAvatarUpload}
                                                    disabled={isUploadingAvatar}
                                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[#C9AA71] hover:bg-[#b89960] text-[#1C1B0E] transition-all shadow-lg hover:shadow-xl cursor-pointer disabled:opacity-60 hover:scale-[1.02]"
                                                >
                                                    {isUploadingAvatar ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Check className="h-4 w-4" />
                                                    )}
                                                    <span>{isUploadingAvatar ? (lang === 'id' ? 'Menyimpan...' : 'Saving...') : (lang === 'id' ? 'Simpan Foto Ini' : 'Save This Photo')}</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleAvatarCancel}
                                                    disabled={isUploadingAvatar}
                                                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-white/10 hover:bg-white/15 text-[#FAFAFA] transition-all cursor-pointer"
                                                >
                                                    <X className="h-4 w-4" />
                                                    <span>{lang === 'id' ? 'Batal' : 'Cancel'}</span>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => avatarInputRef.current?.click()}
                                                    disabled={isUploadingAvatar || isDeletingAvatar}
                                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[#C9AA71] hover:bg-[#b89960] text-[#1C1B0E] transition-all shadow-md hover:shadow-lg cursor-pointer hover:scale-[1.02] disabled:opacity-60"
                                                >
                                                    <Camera className="h-4 w-4" />
                                                    <span>{avatarUrl ? (lang === 'id' ? 'Ganti Foto' : 'Change Photo') : (lang === 'id' ? 'Pilih Foto' : 'Choose Photo')}</span>
                                                </button>

                                                {avatarUrl && (
                                                    <button
                                                        type="button"
                                                        onClick={handleAvatarDelete}
                                                        disabled={isUploadingAvatar || isDeletingAvatar}
                                                        className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-all cursor-pointer disabled:opacity-60"
                                                    >
                                                        {isDeletingAvatar ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-4 w-4" />
                                                        )}
                                                        <span>{lang === 'id' ? 'Hapus Foto' : 'Remove Photo'}</span>
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

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
                                                    ? 'Nomor WhatsApp terverifikasi digunakan oleh bot resort saat bertugas.'
                                                    : 'Verified WhatsApp number used by the resort bot for task assignments.'}
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

                                {/* Pending Ticket Notice Banner */}
                                {pendingTicket && (pendingTicket.type === 'whatsapp_change' || pendingTicket.type === 'whatsapp_unlink') && (
                                    <div className="p-4 rounded-xl bg-amber-950/60 border border-amber-500/50 text-amber-200 text-xs space-y-1.5 animate-in fade-in duration-200">
                                        <div className="flex items-center gap-2 font-bold text-amber-300">
                                            <Clock className="w-4 h-4 text-amber-400" />
                                            <span>Permohonan Perubahan WhatsApp (#{pendingTicket.ticket_number})</span>
                                        </div>
                                        <p>
                                            Permohonan nomor baru <strong>{pendingTicket.requested_value ? `+${pendingTicket.requested_value}` : 'Pelepasan Nomor'}</strong> sedang menunggu persetujuan <strong>{pendingTicket.status === 'pending_hod' ? 'HOD Departemen' : 'Admin'}</strong>.
                                        </p>
                                        <p className="text-amber-400/90 text-[11px] pt-1 border-t border-amber-500/30">
                                            ℹ️ Nomor WhatsApp Anda saat ini <strong>(+{user?.whatsapp_number || '-'})</strong> tetap aktif digunakan sistem hingga permohonan disetujui.
                                        </p>
                                    </div>
                                )}

                                <form onSubmit={handleWhatsAppUpdate} className="space-y-4">
                                    {(waSuccessful || status === 'whatsapp-ticket-submitted' || status === 'whatsapp-updated') && (
                                        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs font-semibold animate-fade-in">
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                            <span>
                                                {canDirectUpdateWa 
                                                    ? (lang === 'id' ? 'Nomor WhatsApp berhasil diperbarui secara langsung!' : 'WhatsApp number updated directly!')
                                                    : (lang === 'id' ? 'Tiket permohonan perubahan nomor WhatsApp telah dikirim ke HOD!' : 'WhatsApp update ticket submitted to HOD!')}
                                            </span>
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <label 
                                            htmlFor="whatsapp_number" 
                                            className="block text-xs font-semibold text-[#FAFAFA]"
                                        >
                                            {canDirectUpdateWa ? (lang === 'id' ? 'Nomor WhatsApp Anda' : 'Your WhatsApp Number') : (lang === 'id' ? 'Nomor WhatsApp Baru yang Diajukan' : 'Requested New WhatsApp Number')}
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
                                    </div>

                                    {!canDirectUpdateWa && (
                                        <div className="space-y-1.5">
                                            <label 
                                                htmlFor="wa_reason" 
                                                className="block text-xs font-semibold text-[#FAFAFA]"
                                            >
                                                Alasan Perubahan Nomor
                                            </label>
                                            <input
                                                id="wa_reason"
                                                type="text"
                                                value={waData.reason}
                                                onChange={(e) => setWaData('reason', e.target.value)}
                                                placeholder="Contoh: Mengganti ke nomor WhatsApp dinas baru..."
                                                className="w-full rounded-xl border border-[#3B3929] bg-[#1C1B0E] px-3 py-2 text-xs text-[#FAFAFA] placeholder:text-[#A19F8D]/40 focus:border-[#C9AA71] focus:outline-none transition-colors"
                                            />
                                        </div>
                                    )}

                                    <p className="text-[11px] text-[#A19F8D] leading-relaxed">
                                        💡 {canDirectUpdateWa 
                                            ? (lang === 'id'
                                                ? `Sebagai ${isAdmin ? 'Administrator' : 'Head of Department (HOD)'}, nomor WhatsApp Anda langsung aktif dan disinkronkan ke sistem & bot tanpa tiket permohonan.`
                                                : `As ${isAdmin ? 'Administrator' : 'Head of Department (HOD)'}, your WhatsApp number is directly updated and synced to the system and bot without approval tickets.`)
                                            : (lang === 'id'
                                                ? 'Perubahan nomor WhatsApp memerlukan persetujuan HOD Departemen dan Admin. Nomor lama Anda tetap aktif selama masa verifikasi.'
                                                : 'WhatsApp number change requires approval from your Department HOD and Admin. Your current number remains active during verification.')}
                                    </p>

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
                                                    <span>{t('saving') || 'Memproses...'}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Smartphone className="h-4 w-4" />
                                                    <span>
                                                        {canDirectUpdateWa
                                                            ? (user?.whatsapp_number ? (lang === 'id' ? 'Perbarui Nomor' : 'Update Number') : (lang === 'id' ? 'Simpan Nomor' : 'Save Number'))
                                                            : (lang === 'id' ? 'Ajukan Perubahan ke HOD' : 'Submit Request to HOD')}
                                                    </span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Notification Preferences Card */}
                            <div className={`rounded-2xl border border-[#3B3929] bg-[#2A281E]/90 p-6 sm:p-8 shadow-xl space-y-4 ${!hasWhatsapp ? 'opacity-85' : ''}`}>
                                <div className="flex items-center justify-between gap-4 flex-wrap">
                                    <div className="flex items-center gap-2.5">
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                                            hasWhatsapp 
                                                ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' 
                                                : 'bg-stone-800 text-stone-400 border-stone-700'
                                        }`}>
                                            <MessageSquare className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h2 className="text-base sm:text-lg font-bold text-[#FAFAFA]">
                                                    Notifikasi Tiket via WhatsApp
                                                </h2>
                                                {!hasWhatsapp && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                        Nomor Tidak Terdaftar
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-[#A19F8D] mt-0.5">
                                                Kirimkan pemberitahuan tiket permohonan dan persetujuan akun ke WhatsApp pribadi Anda.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleToggleNotifyPref}
                                            disabled={isUpdatingNotifyPref || !hasWhatsapp}
                                            title={!hasWhatsapp ? 'Nomor WhatsApp belum terdaftar atau telah dihapus' : (notifyPref ? 'Matikan Notifikasi WhatsApp' : 'Nyalakan Notifikasi WhatsApp')}
                                            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                !hasWhatsapp
                                                    ? 'bg-[#3B3929]/70 cursor-not-allowed opacity-40'
                                                    : (notifyPref ? 'bg-emerald-600 cursor-pointer' : 'bg-slate-700 cursor-pointer')
                                            }`}
                                        >
                                            <span 
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                    (hasWhatsapp && notifyPref) ? 'translate-x-5' : 'translate-x-0'
                                                }`} 
                                            />
                                        </button>
                                    </div>
                                </div>

                                {!hasWhatsapp ? (
                                    <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2.5">
                                        <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                                        <span>
                                            Opsi ini <strong>tidak dapat diaktifkan</strong> karena akun Anda tidak memiliki nomor WhatsApp yang terdaftar (atau nomor telah dihapus/di-unlink dan di-ACC Admin). Hubungkan nomor WhatsApp terlebih dahulu untuk mengaktifkan notifikasi via WhatsApp pribadi.
                                        </span>
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-[#A19F8D]">
                                        <em>Catatan:</em> Bot tidak akan mengirimkan spam progres isu ke chat pribadi Anda. Progres isu antar-departemen dapat dipantau melalui lonceng notifikasi di dashboard.
                                    </p>
                                )}
                            </div>

                            {/* Password Form Card */}
                            <div className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/90 p-6 sm:p-8 shadow-xl space-y-6">
                                <div className="flex items-center gap-2.5 pb-4 border-b border-[#3B3929]">
                                    <KeyRound className="h-5 w-5 text-[#C9AA71]" />
                                    <div>
                                        <h2 className="text-base sm:text-lg font-bold text-[#FAFAFA]">
                                            {isAdmin ? 'Ganti Kata Sandi (Langsung)' : 'Permohonan Reset Kata Sandi'}
                                        </h2>
                                        <p className="text-xs text-[#A19F8D] mt-0.5">
                                            {isAdmin 
                                                ? 'Sebagai Admin, Anda dapat mengganti kata sandi Anda secara langsung.'
                                                : 'Sesuai SOP Telunas, permohonan reset password staf akan ditinjau oleh HOD sebelum disetujui Admin.'}
                                        </p>
                                    </div>
                                </div>

                                {isAdmin ? (
                                    /* Admin Direct Password Change Form */
                                    <form onSubmit={handlePasswordUpdate} className="space-y-4">
                                        {recentlySuccessful && (
                                            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs font-semibold animate-fade-in">
                                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                                <span>Kata sandi berhasil diperbarui.</span>
                                            </div>
                                        )}

                                        <div className="space-y-1.5">
                                            <label htmlFor="current_password" className="block text-xs font-semibold text-[#FAFAFA]">
                                                Kata Sandi Saat Ini <span className="text-red-400">*</span>
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
                                                    className="w-full rounded-xl border border-[#3B3929] bg-[#1C1B0E] pl-9 pr-3 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#A19F8D]/40 focus:border-[#C9AA71] focus:outline-none"
                                                />
                                            </div>
                                            {errors.current_password && (
                                                <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
                                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                    {errors.current_password}
                                                </p>
                                            )}
                                        </div>

                                        <div className="space-y-1.5">
                                            <label htmlFor="password" className="block text-xs font-semibold text-[#FAFAFA]">
                                                Kata Sandi Baru <span className="text-red-400">*</span>
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
                                                    className="w-full rounded-xl border border-[#3B3929] bg-[#1C1B0E] pl-9 pr-3 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#A19F8D]/40 focus:border-[#C9AA71] focus:outline-none"
                                                />
                                            </div>
                                            {errors.password && (
                                                <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
                                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                    {errors.password}
                                                </p>
                                            )}
                                        </div>

                                        <div className="space-y-1.5">
                                            <label htmlFor="password_confirmation" className="block text-xs font-semibold text-[#FAFAFA]">
                                                Konfirmasi Kata Sandi Baru <span className="text-red-400">*</span>
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
                                                    className="w-full rounded-xl border border-[#3B3929] bg-[#1C1B0E] pl-9 pr-3 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#A19F8D]/40 focus:border-[#C9AA71] focus:outline-none"
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
                                                {processing ? 'Menyimpan...' : 'Simpan Kata Sandi Baru'}
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    /* Non-Admin 2-Tier Password Reset Ticketing Flow */
                                    <div className="space-y-4">
                                        {pendingTicket && pendingTicket.type === 'password_reset' ? (
                                            <div className="p-4 rounded-xl bg-amber-950/60 border border-amber-500/50 text-amber-200 text-xs space-y-1.5 animate-in fade-in duration-200">
                                                <div className="flex items-center gap-2 font-bold text-amber-300">
                                                    <Clock className="w-4 h-4 text-amber-400" />
                                                    <span>Tiket Reset Password Sedang Diproses (#{pendingTicket.ticket_number})</span>
                                                </div>
                                                <p>
                                                    Permohonan reset kata sandi Anda saat ini sedang dalam tahap peninjauan <strong>{pendingTicket.status === 'pending_hod' ? 'HOD Departemen' : 'Admin'}</strong>.
                                                </p>
                                                <p className="text-amber-400/90 text-[11px] pt-1 border-t border-amber-500/30">
                                                    Anda akan menerima kata sandi baru atau konfirmasi setelah tiket disetujui.
                                                </p>
                                            </div>
                                        ) : (
                                            <form onSubmit={handlePasswordTicketSubmit} className="space-y-4">
                                                {(pwdTicketSuccessful || status === 'password-ticket-submitted') && (
                                                    <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs font-semibold animate-fade-in">
                                                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                                        <span>Permohonan tiket reset password telah berhasil diajukan ke HOD!</span>
                                                    </div>
                                                )}

                                                <div className="space-y-1.5">
                                                    <label htmlFor="pwd_reason" className="block text-xs font-semibold text-[#FAFAFA]">
                                                        Alasan Reset Kata Sandi <span className="text-red-400">*</span>
                                                    </label>
                                                    <textarea
                                                        id="pwd_reason"
                                                        rows={2}
                                                        value={pwdTicketData.reason}
                                                        onChange={(e) => setPwdTicketData('reason', e.target.value)}
                                                        placeholder="Contoh: Lupa kata sandi lama / Pergantian berkala..."
                                                        className="w-full rounded-xl border border-[#3B3929] bg-[#1C1B0E] p-3 text-xs text-[#FAFAFA] placeholder:text-[#A19F8D]/40 focus:border-[#C9AA71] focus:outline-none"
                                                        required
                                                    />
                                                    {pwdTicketErrors.reason && (
                                                        <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
                                                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                            {pwdTicketErrors.reason}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label htmlFor="new_password_req" className="block text-xs font-semibold text-[#FAFAFA]">
                                                        Kata Sandi Baru yang Diinginkan (Opsional)
                                                    </label>
                                                    <input
                                                        id="new_password_req"
                                                        type="password"
                                                        value={pwdTicketData.new_password}
                                                        onChange={(e) => setPwdTicketData('new_password', e.target.value)}
                                                        placeholder="Minimal 8 karakter (biarkan kosong jika ingin digenerate oleh Admin)"
                                                        className="w-full rounded-xl border border-[#3B3929] bg-[#1C1B0E] px-3 py-2 text-xs text-[#FAFAFA] placeholder:text-[#A19F8D]/40 focus:border-[#C9AA71] focus:outline-none"
                                                    />
                                                </div>

                                                <div className="pt-2 flex justify-end">
                                                    <button
                                                        type="submit"
                                                        disabled={pwdTicketProcessing}
                                                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-[#C9AA71] text-[#1C1B0E] hover:bg-[#D8BE8A] hover:scale-105 active:scale-95 transition-all shadow-xl cursor-pointer disabled:opacity-60"
                                                    >
                                                        {pwdTicketProcessing ? (
                                                            <>
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                                <span>Mengajukan...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <KeyRound className="h-4 w-4" />
                                                                <span>Ajukan Reset Password ke HOD</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </form>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </main>

                <MobileBottomNav currentTab="profile" />
            </div>

            {/* Modal: Ajukan Pindah Departemen */}
            <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
                <DialogContent className="bg-[#2A281E] border border-[#3B3929] text-[#FAFAFA] max-w-md p-6 rounded-2xl shadow-2xl">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-400 border border-teal-500/30 flex items-center justify-center">
                                <Building2 className="w-5 h-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-base sm:text-lg font-bold text-[#FAFAFA]">
                                    {lang === 'id' ? 'Ajukan Pindah Departemen' : 'Request Department Transfer'}
                                </DialogTitle>
                                <p className="text-xs text-[#A19F8D]">
                                    Departemen saat ini: <strong className="text-[#FAFAFA]">{department}</strong> {subdivision ? `(${subdivision})` : ''}
                                </p>
                            </div>
                        </div>
                    </DialogHeader>

                    <form onSubmit={handleTransferSubmit} className="space-y-4 pt-2 text-xs">
                        {/* Target Department Select */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[#E3D1AA]">
                                Departemen Tujuan <span className="text-red-400">*</span>
                            </label>
                            <select
                                value={transferData.target_department}
                                onChange={(e) => {
                                    setTransferData(prev => ({
                                        ...prev,
                                        target_department: e.target.value,
                                        target_subdivision: '',
                                    }));
                                }}
                                required
                                className="w-full bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] rounded-xl px-3.5 py-2.5 text-xs focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71]"
                            >
                                <option value="">-- Pilih Departemen Tujuan --</option>
                                {ALL_DEPARTMENTS.filter(d => d.toLowerCase() !== (department || '').toLowerCase()).map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                            {transferErrors.target_department && (
                                <p className="text-[11px] text-red-400">{transferErrors.target_department}</p>
                            )}
                        </div>

                        {/* Optional Subdivision Select */}
                        {transferData.target_department && (DEPARTMENT_SUBDIVISIONS[transferData.target_department] || []).length > 1 && (
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-[#E3D1AA]">
                                    Subdivisi / Sub-Unit (Opsional)
                                </label>
                                <select
                                    value={transferData.target_subdivision}
                                    onChange={(e) => setTransferData('target_subdivision', e.target.value)}
                                    className="w-full bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] rounded-xl px-3.5 py-2.5 text-xs focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71]"
                                >
                                    <option value="">-- Tanpa Subdivisi Khusus --</option>
                                    {DEPARTMENT_SUBDIVISIONS[transferData.target_department].map(sub => (
                                        <option key={sub} value={sub}>{sub}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Reason Textarea */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[#E3D1AA]">
                                Alasan Pemindahan / Rotasi <span className="text-red-400">*</span>
                            </label>
                            <textarea
                                rows={3}
                                value={transferData.reason}
                                onChange={(e) => setTransferData('reason', e.target.value)}
                                placeholder="Jelaskan alasan pengajuan mutasi tugas atau rotasi divisi ini..."
                                required
                                className="w-full bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA] rounded-xl p-3 text-xs focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71] placeholder-[#A19F8D]/60 leading-relaxed"
                            />
                            {transferErrors.reason && (
                                <p className="text-[11px] text-red-400">{transferErrors.reason}</p>
                            )}
                        </div>

                        {/* Workflow info */}
                        <div className="p-3 rounded-xl bg-[#1C1B0E]/80 border border-[#3B3929] text-[11px] text-[#A19F8D] space-y-1 leading-relaxed">
                            <p className="font-bold text-[#C9AA71] flex items-center gap-1.5">
                                <ShieldAlert className="w-3.5 h-3.5 text-[#C9AA71]" />
                                Alur Persetujuan Bertingkat:
                            </p>
                            <p>1. Permohonan akan ditinjau & diverifikasi oleh <strong>HOD Departemen {department}</strong>.</p>
                            <p>2. Setelah disetujui HOD, <strong>Admin Resort</strong> akan memberikan ACC final.</p>
                            <p>3. Riwayat isu yang pernah Anda tangani sebelumnya tetap dapat dilihat (Read-Only).</p>
                        </div>

                        {/* Footer Buttons */}
                        <div className="pt-2 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsTransferModalOpen(false);
                                    resetTransfer();
                                }}
                                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#1C1B0E] transition-all cursor-pointer"
                            >
                                Batal
                            </button>

                            <button
                                type="submit"
                                disabled={transferProcessing || !transferData.target_department || !transferData.reason.trim()}
                                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-[#C9AA71] text-[#1C1B0E] hover:bg-[#D8BE8A] active:scale-95 transition-all shadow-lg cursor-pointer disabled:opacity-50"
                            >
                                {transferProcessing ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        <span>Mengajukan...</span>
                                    </>
                                ) : (
                                    <>
                                        <ArrowRightLeft className="h-3.5 w-3.5" />
                                        <span>Kirim Permohonan ke HOD</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
