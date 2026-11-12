import { Head, useForm, router, Link, usePage } from '@inertiajs/react';
import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
    User, Lock, KeyRound, LogOut, Shield, Building2, CheckCircle2, 
    AlertCircle, Loader2, Sparkles, Mail, Tag, ShieldCheck, RefreshCw,
    Phone, MessageSquare, Check, Smartphone, Unlink, Trash2,
    Users as UsersIcon, ChevronRight, ShieldAlert, Camera, UploadCloud,
    Image as ImageIcon, X, Ticket, Clock, ArrowRightLeft, Globe, Crown,
    ExternalLink, Bell, BellRing, Volume2, VolumeX, Wifi, WifiOff
} from 'lucide-react';
import {
    isPushNotificationSupported,
    getCurrentPushSubscription,
    subscribeToPushNotifications,
    unsubscribeFromPushNotifications,
    sendTestPushNotification
} from '@/services/webPushService';
import {
    isSoundEnabled,
    setSoundEnabled,
    playNotificationChime
} from '@/services/soundService';

import { useLanguage } from '@/context/LanguageContext';
import { LeanHeader } from '@/Components/CampusFix/LeanHeader';
import { MobileBottomNav } from '@/Components/CampusFix/MobileBottomNav';
import { BotControlModal } from '@/Components/CampusFix/BotControlModal';
import { useLeanTheme } from '@/hooks/useLeanTheme';
import { useAuth } from '@/hooks/useAuth';
import { getDepartmentTheme, ALL_DEPARTMENTS, DEPARTMENT_SUBDIVISIONS } from '@/constants/departments';
import { getStaffForDepartment } from '@/constants/staff';
import SubdivisionTag from '@/Components/CampusFix/SubdivisionTag';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/Components/UI/Dialog';
import { formatToLocalPhone } from '@/utils/phone';

export default function ProfilePage(props) {
    return <ProfileInner {...props} />;
}

function ProfileInner({ pendingTicket, pendingTransferTicket, pendingNameTicket, notifyWhatsAppTickets, status }) {
    const { props: pageProps } = usePage();
    const webNotificationsEnabled = Boolean(pageProps?.features?.web_notifications);
    const approvalTicketsEnabled = Boolean(pageProps?.features?.approval_tickets);
    const { t, lang } = useLanguage();
    const { isDark } = useLeanTheme();
    const {
        user, isAdmin, isHOD, isDeptUser, department, subdivision, staffName, whatsappNumber, avatarUrl, activeStaffRoster,
        canViewAllDepartments, canManageIssues, canDeleteIssues, canExportReports
    } = useAuth();
    const canDirectUpdateWa = isAdmin || isHOD;
    const currentDeptTheme = department ? getDepartmentTheme(department) : { bg: '#059669', text: '#FFFFFF' };

    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const passwordInput = useRef(null);
    const currentPasswordInput = useRef(null);

    // Device Online / Offline Status
    const [isDeviceOnline, setIsDeviceOnline] = useState(() =>
        typeof navigator !== 'undefined' ? navigator.onLine : true
    );

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const updateOnlineStatus = () => {
            setIsDeviceOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
        };
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        return () => {
            window.removeEventListener('online', updateOnlineStatus);
            window.removeEventListener('offline', updateOnlineStatus);
        };
    }, []);

    // Admin WhatsApp Bot Control State
    const [botModalOpen, setBotModalOpen] = useState(false);
    const [botModalTab, setBotModalTab] = useState('pair');
    const [adminBotStatus, setAdminBotStatus] = useState(null);

    const fetchAdminBotStatus = useCallback(async () => {
        if (!isAdmin) return;
        try {
            const res = await axios.get('/api/bot/status');
            setAdminBotStatus(res.data);
        } catch (err) {
            console.warn('[Profile] Failed to load WhatsApp bot status:', err?.message || err);
            setAdminBotStatus({ connected: false });
        }
    }, [isAdmin]);

    useEffect(() => {
        if (isAdmin) {
            fetchAdminBotStatus();
        }
    }, [isAdmin, fetchAdminBotStatus]);

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

    // Name Change Ticket Form
    const [isNameModalOpen, setIsNameModalOpen] = useState(false);
    const {
        data: nameData,
        setData: setNameData,
        errors: nameErrors,
        post: postNameTicket,
        processing: nameProcessing,
        reset: resetName,
    } = useForm({
        new_name: '',
        reason: '',
    });

    const handleNameSubmit = (e) => {
        e.preventDefault();
        postNameTicket(route('tickets.nameChange'), {
            preserveScroll: true,
            onSuccess: () => {
                resetName();
                setIsNameModalOpen(false);
            },
        });
    };

    // Web Push State
    const [pushSupported, setPushSupported] = useState(false);
    const [pushSubscribed, setPushSubscribed] = useState(false);
    const [pushLoading, setPushLoading] = useState(false);
    const [pushTestLoading, setPushTestLoading] = useState(false);
    const [pushSuccessMsg, setPushSuccessMsg] = useState(null);
    const [pushErrorMsg, setPushErrorMsg] = useState(null);
    const [soundAlertEnabled, setSoundAlertEnabled] = useState(isSoundEnabled());

    useEffect(() => {
        if (!webNotificationsEnabled) return;
        const handleSoundPref = (e) => {
            setSoundAlertEnabled(e.detail?.enabled ?? isSoundEnabled());
        };
        window.addEventListener('campusfix-sound-pref-changed', handleSoundPref);
        return () => window.removeEventListener('campusfix-sound-pref-changed', handleSoundPref);
    }, [webNotificationsEnabled]);

    const handleToggleSound = () => {
        const next = !soundAlertEnabled;
        setSoundAlertEnabled(next);
        setSoundEnabled(next);
        if (next) {
            playNotificationChime('normal');
        }
    };

    useEffect(() => {
        if (!webNotificationsEnabled) return;
        const checkPush = async () => {
            const supported = isPushNotificationSupported();
            setPushSupported(supported);
            if (supported) {
                const sub = await getCurrentPushSubscription();
                setPushSubscribed(!!sub);
            }
        };
        checkPush();
    }, [webNotificationsEnabled]);

    const handleTogglePush = async () => {
        setPushLoading(true);
        setPushErrorMsg(null);
        setPushSuccessMsg(null);
        try {
            if (pushSubscribed) {
                await unsubscribeFromPushNotifications();
                setPushSubscribed(false);
                setPushSuccessMsg(lang === 'id' ? 'Notifikasi pop-up pada perangkat ini berhasil dimatikan.' : 'Push notifications disabled on this device.');
            } else {
                await subscribeToPushNotifications();
                setPushSubscribed(true);
                setPushSuccessMsg(lang === 'id' ? 'Notifikasi pop-up berhasil diaktifkan! Anda akan menerima pop-up saat ada tiket baru.' : 'Push notifications enabled successfully!');
            }
        } catch (err) {
            console.warn('[Profile] Push notification toggle error:', err);
            setPushErrorMsg(err.message || (lang === 'id' ? 'Gagal mengubah pengaturan notifikasi.' : 'Failed to update notification settings.'));
        } finally {
            setPushLoading(false);
        }
    };

    const handleTestPush = async () => {
        setPushTestLoading(true);
        setPushErrorMsg(null);
        setPushSuccessMsg(null);
        try {
            const res = await sendTestPushNotification();
            setPushSuccessMsg(res.message || (lang === 'id' ? 'Tes notifikasi pop-up berhasil dikirim ke perangkat Anda!' : 'Test notification sent!'));
        } catch (err) {
            console.warn('[Profile] Test push error:', err);
            setPushErrorMsg(err.response?.data?.message || err.message || (lang === 'id' ? 'Gagal mengirim tes notifikasi.' : 'Failed to send test push.'));
        } finally {
            setPushTestLoading(false);
        }
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
            onSuccess: () => {
                window.location.href = '/login';
            },
            onError: () => {
                window.location.href = '/login';
            },
            onFinish: () => setIsLoggingOut(false),
        });
    };

    const deptStaffRoster = department ? getStaffForDepartment(department, activeStaffRoster) : [];

    return (
        <div
            className={`lean-root ${
                isDark ? 'lean-theme-dark text-slate-100' : 'lean-theme-light text-slate-800'
            } min-h-screen flex flex-col font-sans pb-28 md:pb-12 transition-colors duration-300 w-full max-w-full overflow-x-clip selection:bg-emerald-500 selection:text-white`}
        >
            <Head title={`${t('profile') || 'Profil'} — Telunas Resort`} />

            <LeanHeader activePage="profile" onBotStatusChange={setAdminBotStatus} />

            <main className="mx-auto max-w-6xl w-full flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
                {/* Hidden Avatar File Input */}
                <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/jpg,image/webp"
                    onChange={handleAvatarSelect}
                    className="hidden"
                />

                {/* Header Banner */}
                <div
                    className="rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 border shadow-lg transition-colors liquid-glass-card"
                >
                    <div className="flex items-start sm:items-center gap-5">
                        {/* Interactive Avatar in Banner */}
                        <div className="relative group shrink-0">
                            <div
                                className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center font-extrabold text-2xl sm:text-3xl shadow-lg border-2 overflow-hidden relative ${
                                    isDark ? 'border-slate-700' : 'border-slate-200'
                                }`}
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
                                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white keep-white transition-opacity duration-200 cursor-pointer backdrop-blur-[2px]"
                                    title={lang === 'id' ? 'Ubah Foto Profil' : 'Change Profile Photo'}
                                >
                                    <Camera className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-300 mb-0.5" />
                                    <span className="text-[10px] font-bold text-emerald-300">{lang === 'id' ? 'Ubah' : 'Change'}</span>
                                </button>
                            </div>

                            {/* Quick Camera Badge Icon */}
                            <button
                                type="button"
                                onClick={() => avatarInputRef.current?.click()}
                                disabled={isUploadingAvatar || isDeletingAvatar}
                                className={`absolute -bottom-1 -right-1 sm:-bottom-1.5 sm:-right-1.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white keep-white flex items-center justify-center shadow-lg border-2 transition-transform hover:scale-110 cursor-pointer ${
                                    isDark ? 'border-slate-900' : 'border-white'
                                }`}
                                title={lang === 'id' ? 'Pilih Foto Baru' : 'Choose New Photo'}
                            >
                                <Camera className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            </button>
                        </div>

                        <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {staffName || user?.name || 'Account'}
                                </h1>
                                {isAdmin && (
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-600 text-white keep-white flex items-center gap-1 shadow-sm">
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
                            <p className={`text-xs sm:text-sm mt-1 flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                <Mail className="h-3.5 w-3.5" />
                                {user?.email}
                            </p>

                            {/* Live Connectivity & Admin Bot Status Pills */}
                            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                                <span
                                    role="status"
                                    aria-live="polite"
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border shadow-xs ${
                                        isDeviceOnline
                                            ? isDark
                                                ? 'bg-emerald-950/60 border-emerald-500/45 text-emerald-300'
                                                : 'bg-emerald-50/90 border-emerald-300 text-emerald-700'
                                            : isDark
                                            ? 'bg-rose-950/60 border-rose-500/45 text-rose-300'
                                            : 'bg-rose-50/90 border-rose-300 text-rose-700'
                                    }`}
                                    title={
                                        isDeviceOnline
                                            ? (lang === 'id' ? 'Perangkat terhubung ke internet' : 'Device connected to internet')
                                            : (lang === 'id' ? 'Tidak ada koneksi internet' : 'No internet connection')
                                    }
                                >
                                    <span
                                        className={`w-2 h-2 rounded-full ${
                                            isDeviceOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                                        }`}
                                    />
                                    {isDeviceOnline ? (
                                        <Wifi className={`h-3 w-3 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                    ) : (
                                        <WifiOff className={`h-3 w-3 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} />
                                    )}
                                    <span>{isDeviceOnline ? 'Online' : 'Offline'}</span>
                                </span>

                                {isAdmin && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setBotModalTab(adminBotStatus?.connected ? 'status' : 'pair');
                                            setBotModalOpen(true);
                                        }}
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all shadow-xs cursor-pointer hover:scale-[1.02] ${
                                            adminBotStatus === null
                                                ? isDark
                                                    ? 'bg-slate-800/70 border-slate-700 text-slate-300'
                                                    : 'bg-slate-100/80 border-slate-300 text-slate-600'
                                                : adminBotStatus?.connected
                                                ? isDark
                                                    ? 'bg-emerald-950/60 hover:bg-emerald-900/70 border-emerald-500/45 text-emerald-300'
                                                    : 'bg-emerald-50/90 hover:bg-emerald-100 border-emerald-300 text-emerald-700'
                                                : isDark
                                                ? 'bg-rose-950/60 hover:bg-rose-900/70 border-rose-500/45 text-rose-300'
                                                : 'bg-rose-50/90 hover:bg-rose-100 border-rose-300 text-rose-700'
                                        }`}
                                        title={
                                            lang === 'id'
                                                ? 'Klik untuk membuka kontrol & status Bot WhatsApp'
                                                : 'Click to open WhatsApp Bot status & controls'
                                        }
                                    >
                                        <span
                                            className={`w-2 h-2 rounded-full ${
                                                adminBotStatus === null
                                                    ? 'bg-slate-400 animate-pulse'
                                                    : adminBotStatus?.connected
                                                    ? 'bg-emerald-500 animate-pulse'
                                                    : 'bg-rose-500'
                                            }`}
                                        />
                                        <MessageSquare className="h-3 w-3" />
                                        <span>
                                            {adminBotStatus === null
                                                ? (lang === 'id' ? 'Bot WA: Mengecek...' : 'Bot WA: Checking...')
                                                : adminBotStatus?.connected
                                                ? 'Bot WA: Online'
                                                : 'Bot WA: Offline'}
                                        </span>
                                    </button>
                                )}
                            </div>

                            {/* Banner Quick Preview Action Bar */}
                            {avatarPreview && (
                                <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                                    <span className={`text-[11px] font-semibold flex items-center gap-1 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                        <Sparkles className={`h-3 w-3 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                        {lang === 'id' ? 'Foto siap disimpan:' : 'Ready to save:'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleAvatarUpload}
                                        disabled={isUploadingAvatar}
                                        className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white transition-all cursor-pointer shadow-md disabled:opacity-60"
                                    >
                                        {isUploadingAvatar ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                        <span>{isUploadingAvatar ? (lang === 'id' ? 'Menyimpan...' : 'Saving...') : (lang === 'id' ? 'Simpan' : 'Save')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleAvatarCancel}
                                        disabled={isUploadingAvatar}
                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                            isDark
                                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                        }`}
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
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition-all duration-200 cursor-pointer shadow-sm hover:scale-105 disabled:opacity-60 shrink-0 ${
                            isDark
                                ? 'bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border-rose-500/40 hover:border-rose-500'
                                : 'bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border-rose-200 hover:border-rose-600'
                        }`}
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
                    <div
                        className="rounded-2xl border p-6 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden liquid-glass-card liquid-glass-tint-emerald"
                    >
                        <div className="flex items-center gap-4">
                            <div
                                className={`p-3 rounded-2xl border shadow-xs shrink-0 ${
                                    isDark
                                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                        : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                }`}
                            >
                                <UsersIcon className="h-7 w-7" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className={`text-base sm:text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {lang === 'id' ? 'Manajemen Pengguna & Hak Akses' : 'User Management & Permissions'}
                                    </h2>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-600 text-white keep-white">
                                        ADMIN
                                    </span>
                                </div>
                                <p className={`text-xs mt-0.5 max-w-xl leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                    {lang === 'id'
                                        ? 'Atur akun staf, reset password, konfigurasi departemen, matriks izin akses (Barrier), serta pantau audit log keamanan resort.'
                                        : 'Manage staff credentials, reset passwords, configure department scopes, access barriers, and review security audit logs.'}
                                </p>
                            </div>
                        </div>
                        <Link
                            href="/users"
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white transition-all shadow-md hover:shadow-lg cursor-pointer shrink-0 hover:scale-[1.02]"
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
                        <div
                            className="rounded-2xl border p-6 shadow-lg space-y-4 liquid-glass-card"
                        >
                            <div className={`flex items-center gap-2 pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <Shield className={`h-5 w-5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {t('account_info') || 'Informasi Akun'}
                                </h2>
                            </div>

                            <div className="space-y-3.5 text-xs">
                                <div>
                                    <p className={`font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('email_label') || 'Alamat Email'}</p>
                                    <p className={`text-sm font-semibold break-all ${isDark ? 'text-white' : 'text-slate-900'}`}>{user?.email}</p>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <p className={`font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('staff_name_label') || 'Nama Tampilan'}</p>
                                        {approvalTicketsEnabled && !pendingNameTicket && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setNameData('new_name', '');
                                                    setNameData('reason', '');
                                                    setIsNameModalOpen(true);
                                                }}
                                                className={`inline-flex items-center gap-1 text-[11px] font-bold transition-colors cursor-pointer ${
                                                    isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-700'
                                                }`}
                                                title={lang === 'id' ? 'Ajukan perubahan nama akun resmi' : 'Request official name change'}
                                            >
                                                <User className="w-3 h-3" />
                                                <span>{lang === 'id' ? 'Ubah Nama' : 'Change Name'}</span>
                                            </button>
                                        )}
                                    </div>
                                    <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{staffName || user?.name || '-'}</p>

                                    {/* Pending Name Change Ticket Alert */}
                                    {approvalTicketsEnabled && pendingNameTicket && (
                                        <div
                                            className={`mt-2.5 p-2.5 rounded-xl border text-xs space-y-1 ${
                                                isDark
                                                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200'
                                                    : 'bg-indigo-50 border-indigo-200 text-indigo-900'
                                            }`}
                                        >
                                            <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-indigo-300' : 'text-indigo-700'}`}>
                                                <Clock className={`w-3.5 h-3.5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                                                <span>Permohonan Nama (#{pendingNameTicket.ticket_number})</span>
                                            </div>
                                            <p className={`text-[11px] ${isDark ? 'text-indigo-200/80' : 'text-indigo-800'}`}>
                                                Nama Baru: <strong>{pendingNameTicket.requested_value}</strong>
                                            </p>
                                            <div className={`text-[10px] flex items-center gap-1 pt-0.5 ${isDark ? 'text-indigo-300/70' : 'text-indigo-700'}`}>
                                                <span>⏳</span>
                                                <span>
                                                    {pendingNameTicket.status === 'pending_hod'
                                                        ? (lang === 'id' ? 'Menunggu persetujuan HOD' : 'Pending HOD review')
                                                        : (lang === 'id' ? 'Menunggu persetujuan ACC Admin' : 'Pending Admin final approval')}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <p className={`font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('role_label') || 'Peran Akun'}</p>
                                    <p className={`text-sm font-semibold capitalize ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {isAdmin ? 'Administrator (Full Access)' : 'Department User'}
                                    </p>
                                </div>

                                {department && (
                                    <div>
                                        <p className={`font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('department_label') || 'Cakupan Departemen'}</p>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <SubdivisionTag
                                                department={department}
                                                subdivision={subdivision}
                                                size="md"
                                            />
                                            {approvalTicketsEnabled && !isAdmin && !pendingTransferTicket && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsTransferModalOpen(true)}
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                                                        isDark
                                                            ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border-emerald-500/30'
                                                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                                                    }`}
                                                >
                                                    <ArrowRightLeft className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                                    <span>{lang === 'id' ? 'Ajukan Pindah Departemen' : 'Request Transfer'}</span>
                                                </button>
                                            )}
                                        </div>

                                        {/* Pending Transfer Alert */}
                                        {approvalTicketsEnabled && pendingTransferTicket && (
                                            <div
                                                className={`mt-3 p-3 rounded-xl border text-xs space-y-1 ${
                                                    isDark
                                                        ? 'bg-teal-500/10 border-teal-500/30 text-teal-200'
                                                        : 'bg-teal-50 border-teal-200 text-teal-900'
                                                }`}
                                            >
                                                <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>
                                                    <Clock className={`w-4 h-4 ${isDark ? 'text-teal-400' : 'text-teal-600'}`} />
                                                    <span>Permohonan Pindah (#{pendingTransferTicket.ticket_number})</span>
                                                </div>
                                                <p className={`text-[11px] ${isDark ? 'text-teal-200/80' : 'text-teal-800'}`}>
                                                    Tujuan: <strong>{pendingTransferTicket.requested_value?.replace('::', ' — Subdivisi: ')}</strong>
                                                </p>
                                                <p className={`text-[10px] ${isDark ? 'text-teal-300/70' : 'text-teal-700'}`}>
                                                    Status: Menunggu ACC <strong>{pendingTransferTicket.status === 'pending_hod' ? 'HOD Departemen Asal' : 'Admin'}</strong>
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!approvalTicketsEnabled && (
                                    <div
                                        className={`p-2.5 rounded-xl border text-[11px] leading-relaxed ${
                                            isDark
                                                ? 'bg-slate-950/70 border-slate-800 text-slate-400'
                                                : 'bg-slate-50 border-slate-200 text-slate-600'
                                        }`}
                                    >
                                        {lang === 'id'
                                            ? 'Perubahan nama tampilan maupun mutasi departemen saat ini dikelola langsung oleh Administrator.'
                                            : 'Display name updates and department transfers are currently managed directly by the Administrator.'}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Active Account Permissions Card */}
                        <div
                            className="rounded-2xl border p-5 shadow-lg space-y-3 liquid-glass-card"
                        >
                            <div className="flex items-center gap-2">
                                <ShieldCheck className={`h-4 w-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                    {lang === 'id' ? 'Wewenang & Hak Akses Akun' : 'Account Special Permissions'}
                                </h3>
                            </div>
                            <div className="space-y-2 pt-1 text-xs">
                                {isAdmin && (
                                    <div
                                        className={`p-2.5 rounded-xl border flex items-start gap-2.5 ${
                                            isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'
                                        }`}
                                    >
                                        <ShieldCheck className={`w-4 h-4 shrink-0 mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                                        <div>
                                            <p className={`font-bold ${isDark ? 'text-amber-200' : 'text-amber-900'}`}>Full Administrator Access</p>
                                            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Wewenang penuh untuk mengatur seluruh sistem, staf, tiket, dan isu.</p>
                                        </div>
                                    </div>
                                )}

                                {isHOD && (
                                    <div
                                        className={`p-2.5 rounded-xl border flex items-start gap-2.5 ${
                                            isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'
                                        }`}
                                    >
                                        <Crown className={`w-4 h-4 shrink-0 mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                                        <div>
                                            <p className={`font-bold ${isDark ? 'text-amber-200' : 'text-amber-900'}`}>Head of Department (HOD)</p>
                                            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Pimpinan departemen dengan wewenang persetujuan tiket dan manajemen tim.</p>
                                        </div>
                                    </div>
                                )}

                                {canViewAllDepartments && !isAdmin && (
                                    <div
                                        className={`p-2.5 rounded-xl border flex items-start gap-2.5 ${
                                            isDark ? 'bg-sky-500/10 border-sky-500/30' : 'bg-sky-50 border-sky-200'
                                        }`}
                                    >
                                        <Globe className={`w-4 h-4 shrink-0 mt-0.5 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
                                        <div>
                                            <p className={`font-bold ${isDark ? 'text-sky-300' : 'text-sky-800'}`}>Akses Lintas Seluruh Departemen</p>
                                            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Anda memiliki izin istimewa untuk memantau dan memfilter isu dari semua divisi resort Telunas di dashboard.</p>
                                        </div>
                                    </div>
                                )}

                                {canManageIssues && !isAdmin && (
                                    <div
                                        className={`p-2 rounded-lg border flex items-center justify-between text-[11px] ${
                                            isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                                        }`}
                                    >
                                        <span className={`font-medium flex items-center gap-1.5 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                                            <Check className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} /> Penanganan Isu (Klaim, Pending, Selesai)
                                        </span>
                                        <span
                                            className={`font-bold text-[10px] px-1.5 py-0.5 rounded border ${
                                                isDark
                                                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                                    : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                            }`}
                                        >
                                            Aktif
                                        </span>
                                    </div>
                                )}

                                {canExportReports && !isAdmin && (
                                    <div
                                        className={`p-2 rounded-lg border flex items-center justify-between text-[11px] ${
                                            isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                                        }`}
                                    >
                                        <span className={`font-medium flex items-center gap-1.5 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                                            <Check className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} /> Ekspor Laporan (PDF & Excel)
                                        </span>
                                        <span
                                            className={`font-bold text-[10px] px-1.5 py-0.5 rounded border ${
                                                isDark
                                                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                                    : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                            }`}
                                        >
                                            Aktif
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Scope Roster Card (if department user) */}
                        {department && deptStaffRoster.length > 0 && (
                            <div
                                className="rounded-2xl border p-5 shadow-lg space-y-3 liquid-glass-card"
                            >
                                <div className="flex items-center gap-2">
                                    <Building2 className={`h-4 w-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                    <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                        {department} Team Scope
                                    </h3>
                                </div>
                                <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Your account is scoped to manage and claim tasks assigned to the <strong>{department}</strong> unit:
                                </p>
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {deptStaffRoster.map(s => (
                                        <span
                                            key={s}
                                            className={`text-[11px] px-2 py-0.5 rounded-md border ${
                                                s === staffName || s === user?.name
                                                    ? 'bg-emerald-600 text-white keep-white font-bold border-emerald-500'
                                                    : (isDark
                                                        ? 'bg-slate-950 text-slate-300 border-slate-800'
                                                        : 'bg-slate-100 text-slate-700 border-slate-200')
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
                        <div
                            className="rounded-2xl border p-6 sm:p-8 shadow-lg space-y-6 liquid-glass-card"
                        >
                            <div className={`flex items-center justify-between gap-4 pb-4 border-b flex-wrap ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <div className="flex items-center gap-2.5">
                                    <div
                                        className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                                            isDark
                                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        }`}
                                    >
                                        <Camera className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h2 className={`text-base sm:text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {lang === 'id' ? 'Foto Profil Akun' : 'Account Profile Photo'}
                                        </h2>
                                        <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {lang === 'id'
                                                ? 'Personalisasi avatar akun Anda agar mudah dikenali oleh seluruh rekan tim dan resort.'
                                                : 'Personalize your avatar for easy recognition across team activities and operations.'}
                                        </p>
                                    </div>
                                </div>

                                {avatarUrl ? (
                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-xs ${
                                            isDark
                                                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                                                : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                        }`}
                                    >
                                        <CheckCircle2 className={`h-3.5 w-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                        <span>{lang === 'id' ? 'Foto Kustom Aktif' : 'Custom Photo Active'}</span>
                                    </span>
                                ) : (
                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
                                            isDark
                                                ? 'bg-slate-800 border-slate-700 text-slate-300'
                                                : 'bg-slate-100 border-slate-200 text-slate-600'
                                        }`}
                                    >
                                        <User className="h-3.5 w-3.5" />
                                        <span>{lang === 'id' ? 'Inisial Default' : 'Default Initials'}</span>
                                    </span>
                                )}
                            </div>

                            {/* Status Alerts */}
                            {avatarSuccess && (
                                <div
                                    className={`flex items-center gap-2 p-3.5 rounded-xl border text-xs font-medium animate-in fade-in duration-200 ${
                                        isDark
                                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    }`}
                                >
                                    <CheckCircle2 className={`h-4 w-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                    <span>{avatarSuccess}</span>
                                </div>
                            )}

                            {avatarError && (
                                <div
                                    className={`flex items-center gap-2 p-3.5 rounded-xl border text-xs font-medium animate-in fade-in duration-200 ${
                                        isDark
                                            ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                                            : 'bg-rose-50 border-rose-200 text-rose-700'
                                    }`}
                                >
                                    <AlertCircle className={`h-4 w-4 shrink-0 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} />
                                    <span>{avatarError}</span>
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                                {/* Large Avatar Preview with frame */}
                                <div className="relative group shrink-0">
                                    <div
                                        className={`w-24 h-24 sm:w-28 sm:h-28 rounded-2xl flex items-center justify-center font-extrabold text-3xl sm:text-4xl shadow-xl border-2 overflow-hidden relative ring-4 ${
                                            isDark
                                                ? 'border-emerald-500/40 ring-slate-950/60'
                                                : 'border-emerald-300 ring-emerald-500/10'
                                        }`}
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
                                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white keep-white transition-opacity duration-200 cursor-pointer backdrop-blur-[2px]"
                                        >
                                            <UploadCloud className="h-7 w-7 text-emerald-300 mb-1" />
                                            <span className="text-[11px] font-bold text-emerald-300">{lang === 'id' ? 'Ganti Foto' : 'Change'}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Action Controls & Instructions */}
                                <div className="flex-1 space-y-3.5 text-center sm:text-left">
                                    <div className="space-y-1">
                                        <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {lang === 'id' ? 'Pengaturan Avatar' : 'Avatar Settings'}
                                        </h3>
                                        <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
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
                                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white transition-all shadow-lg hover:shadow-xl cursor-pointer disabled:opacity-60 hover:scale-[1.02]"
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
                                                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                                                    isDark
                                                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                                }`}
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
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white transition-all shadow-md hover:shadow-lg cursor-pointer hover:scale-[1.02] disabled:opacity-60"
                                            >
                                                <Camera className="h-4 w-4" />
                                                <span>{avatarUrl ? (lang === 'id' ? 'Ganti Foto' : 'Change Photo') : (lang === 'id' ? 'Pilih Foto' : 'Choose Photo')}</span>
                                            </button>

                                            {avatarUrl && (
                                                <button
                                                    type="button"
                                                    onClick={handleAvatarDelete}
                                                    disabled={isUploadingAvatar || isDeletingAvatar}
                                                    className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer disabled:opacity-60 ${
                                                        isDark
                                                            ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border-rose-500/20'
                                                            : 'text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200'
                                                    }`}
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
                        <div
                            className="rounded-2xl border p-6 sm:p-8 shadow-lg space-y-6 liquid-glass-card"
                        >
                            <div className={`flex items-center justify-between gap-4 pb-4 border-b flex-wrap ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <div className="flex items-center gap-2.5">
                                    <div
                                        className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                                            isDark
                                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        }`}
                                    >
                                        <Smartphone className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h2 className={`text-base sm:text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {t('whatsapp_linking_title') || 'Integrasi WhatsApp & Pengenalan Otomatis'}
                                        </h2>
                                        <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {lang === 'id'
                                                ? 'Nomor WhatsApp terverifikasi digunakan oleh bot resort saat bertugas.'
                                                : 'Verified WhatsApp number used by the resort bot for task assignments.'}
                                        </p>
                                    </div>
                                </div>

                                {user?.whatsapp_number ? (
                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-xs ${
                                            isDark
                                                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                                                : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                        }`}
                                    >
                                        <Check className="h-3.5 w-3.5" />
                                        <span>{user.whatsapp_number}</span>
                                    </span>
                                ) : (
                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
                                            isDark
                                                ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                                                : 'bg-amber-50 border-amber-300 text-amber-800'
                                        }`}
                                    >
                                        <span>⚠️ Belum Ditautkan</span>
                                    </span>
                                )}
                            </div>

                            {/* Pending Ticket Notice Banner */}
                            {approvalTicketsEnabled && pendingTicket && (pendingTicket.type === 'whatsapp_change' || pendingTicket.type === 'whatsapp_unlink') && (
                                <div
                                    className={`p-4 rounded-xl border text-xs space-y-1.5 animate-in fade-in duration-200 ${
                                        isDark
                                            ? 'bg-amber-950/50 border-amber-500/40 text-amber-200'
                                            : 'bg-amber-50 border-amber-200 text-amber-900'
                                    }`}
                                >
                                    <div className={`flex items-center gap-2 font-bold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                                        <Clock className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                                        <span>Permohonan Perubahan WhatsApp (#{pendingTicket.ticket_number})</span>
                                    </div>
                                    <p>
                                        Permohonan nomor baru <strong>{pendingTicket.requested_value || 'Pelepasan Nomor'}</strong> sedang menunggu persetujuan <strong>{pendingTicket.status === 'pending_hod' ? 'HOD Departemen' : 'Admin'}</strong>.
                                    </p>
                                    <p className={`text-[11px] pt-1 border-t ${isDark ? 'text-amber-300/90 border-amber-500/30' : 'text-amber-800 border-amber-200'}`}>
                                        ℹ️ Nomor WhatsApp Anda saat ini <strong>({user?.whatsapp_number || '-'})</strong> tetap aktif digunakan sistem hingga permohonan disetujui.
                                    </p>
                                </div>
                            )}

                            {!canDirectUpdateWa && !approvalTicketsEnabled ? (
                                <div
                                    className={`p-4 rounded-xl border text-xs space-y-1.5 ${
                                        isDark
                                            ? 'bg-slate-950/80 border-slate-800 text-slate-300'
                                            : 'bg-slate-50 border-slate-200 text-slate-700'
                                    }`}
                                >
                                    <div className={`flex items-center gap-2 font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                        <ShieldAlert className={`w-4 h-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                        <span>
                                            {lang === 'id'
                                                ? 'Perubahan Nomor WhatsApp Dikelola Administrator'
                                                : 'WhatsApp Number Changes Managed by Administrator'}
                                        </span>
                                    </div>
                                    <p className={`leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                        {lang === 'id'
                                            ? 'Pengajuan perubahan atau pelepasan nomor WhatsApp melalui tiket persetujuan sedang dinonaktifkan sementara. Silakan hubungi Administrator untuk mendaftarkan, mengganti, atau melepas nomor WhatsApp akun Anda.'
                                            : 'Self-service WhatsApp update and unlink requests via approval tickets are currently disabled. Please contact an Administrator to register, update, or unlink your account WhatsApp number.'}
                                    </p>
                                </div>
                            ) : (
                            <form onSubmit={handleWhatsAppUpdate} className="space-y-4">
                                {(waSuccessful || status === 'whatsapp-ticket-submitted' || status === 'whatsapp-updated') && (
                                    <div
                                        className={`flex items-center gap-2 p-3.5 rounded-xl border text-xs font-semibold animate-fade-in ${
                                            isDark
                                                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                                                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                        }`}
                                    >
                                        <CheckCircle2 className={`h-4 w-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
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
                                        className={`block text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}
                                    >
                                        {canDirectUpdateWa ? (lang === 'id' ? 'Nomor WhatsApp Anda' : 'Your WhatsApp Number') : (lang === 'id' ? 'Nomor WhatsApp Baru yang Diajukan' : 'Requested New WhatsApp Number')}
                                    </label>
                                    <div className="relative">
                                        <Phone className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                                        <input
                                            id="whatsapp_number"
                                            type="text"
                                            value={waData.whatsapp_number}
                                            onChange={(e) => setWaData('whatsapp_number', formatToLocalPhone(e.target.value))}
                                            placeholder="e.g. 081234567890"
                                            className={`w-full rounded-xl border pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-1 transition-colors font-mono ${
                                                isDark
                                                    ? 'border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500'
                                                    : 'border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500'
                                            }`}
                                        />
                                    </div>
                                    {waErrors.whatsapp_number && (
                                        <p className={`text-xs flex items-center gap-1 mt-1 ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>
                                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                            {waErrors.whatsapp_number}
                                        </p>
                                    )}
                                </div>

                                {!canDirectUpdateWa && (
                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="wa_reason"
                                            className={`block text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}
                                        >
                                            Alasan Perubahan Nomor
                                        </label>
                                        <input
                                            id="wa_reason"
                                            type="text"
                                            value={waData.reason}
                                            onChange={(e) => setWaData('reason', e.target.value)}
                                            placeholder="Contoh: Mengganti ke nomor WhatsApp dinas baru..."
                                            className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none focus:ring-1 transition-colors ${
                                                isDark
                                                    ? 'border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500'
                                                    : 'border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500'
                                            }`}
                                        />
                                    </div>
                                )}

                                <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
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
                                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-sm disabled:opacity-50 ${
                                                isDark
                                                    ? 'text-rose-400 hover:text-white bg-rose-950/40 hover:bg-rose-600/80 border-rose-900/60 hover:border-rose-500'
                                                    : 'text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border-rose-200 hover:border-rose-600'
                                            }`}
                                        >
                                            <Unlink className="h-4 w-4" />
                                            <span>{lang === 'id' ? 'Lepas Tautan Nomor' : 'Unlink WhatsApp Number'}</span>
                                        </button>
                                    ) : <div />}

                                    <button
                                        type="submit"
                                        disabled={waProcessing}
                                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white hover:scale-105 active:scale-95 transition-all shadow-lg cursor-pointer disabled:opacity-60 ml-auto"
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
                            )}
                        </div>

                        {/* Web Push Pop-up Notifications Card (HP & PC) — gated by WEB_NOTIFICATIONS_ENABLED */}
                        {webNotificationsEnabled && (
                        <div
                            className="rounded-2xl border p-6 sm:p-8 shadow-lg space-y-6 liquid-glass-card"
                        >
                            <div className={`flex items-center justify-between gap-4 pb-4 border-b flex-wrap ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <div className="flex items-center gap-2.5">
                                    <div
                                        className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                                            isDark
                                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        }`}
                                    >
                                        <BellRing className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h2 className={`text-base sm:text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {lang === 'id' ? 'Notifikasi Pop-up Perangkat (HP & PC)' : 'Device Pop-up Notifications (Mobile & PC)'}
                                        </h2>
                                        <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {lang === 'id'
                                                ? 'Terima notifikasi pop-up sistem saat ada tiket baru, penanganan darurat (SOS), atau update isu.'
                                                : 'Receive native system pop-ups for new issues, emergency alerts (SOS), and task updates.'}
                                        </p>
                                    </div>
                                </div>

                                {pushSubscribed ? (
                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-xs ${
                                            isDark
                                                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                                                : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                        }`}
                                    >
                                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span>{lang === 'id' ? 'Aktif di Perangkat Ini' : 'Active on This Device'}</span>
                                    </span>
                                ) : pushSupported ? (
                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
                                            isDark
                                                ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                                                : 'bg-amber-50 border-amber-300 text-amber-800'
                                        }`}
                                    >
                                        <span>⚠️ {lang === 'id' ? 'Belum Diaktifkan' : 'Not Activated'}</span>
                                    </span>
                                ) : (
                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                                            isDark
                                                ? 'bg-slate-800 border-slate-700 text-slate-300'
                                                : 'bg-slate-100 border-slate-200 text-slate-600'
                                        }`}
                                    >
                                        {lang === 'id' ? 'Tidak Didukung Browser Ini' : 'Not Supported'}
                                    </span>
                                )}
                            </div>

                            {/* Status Alerts */}
                            {pushSuccessMsg && (
                                <div
                                    className={`flex items-center gap-2 p-3.5 rounded-xl border text-xs font-semibold animate-in fade-in duration-200 ${
                                        isDark
                                            ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    }`}
                                >
                                    <CheckCircle2 className={`h-4 w-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                    <span>{pushSuccessMsg}</span>
                                </div>
                            )}

                            {pushErrorMsg && (
                                <div
                                    className={`flex items-center gap-2 p-3.5 rounded-xl border text-xs font-semibold animate-in fade-in duration-200 ${
                                        isDark
                                            ? 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                                            : 'bg-rose-50 border-rose-200 text-rose-700'
                                    }`}
                                >
                                    <AlertCircle className={`h-4 w-4 shrink-0 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} />
                                    <span>{pushErrorMsg}</span>
                                </div>
                            )}

                            <div className="space-y-4">
                                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                    {lang === 'id'
                                        ? 'Dengan mengaktifkan fitur ini, ponsel atau laptop Anda akan memunculkan banner notifikasi pop-up (disertai suara dan getar) begitu ada tiket baru yang dilaporkan atau ditugaskan ke departemen Anda, bahkan ketika layar sedang terkunci atau aplikasi tidak dibuka.'
                                        : 'With this feature enabled, your phone or computer will display native pop-up alert banners with sound and vibration whenever issues are assigned or reported to your unit.'}
                                </p>

                                {/* iPhone iOS Note */}
                                <div
                                    className={`p-3.5 rounded-xl border text-[11px] space-y-1 ${
                                        isDark
                                            ? 'bg-slate-950 border-slate-800 text-slate-400'
                                            : 'bg-slate-50 border-slate-200 text-slate-600'
                                    }`}
                                >
                                    <p className={`font-bold flex items-center gap-1.5 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                        <span>📱 {lang === 'id' ? 'Petunjuk untuk Pengguna iPhone (iOS):' : 'Guide for iPhone (iOS) Users:'}</span>
                                    </p>
                                    <p>
                                        {lang === 'id'
                                            ? 'Buka website Telunas Fix di browser Safari, ketuk tombol Bagikan (Share ⎋) di bawah, lalu pilih "Tambahkan ke Layar Utama" (Add to Home Screen). Buka aplikasi dari layar utama Anda untuk mengaktifkan notifikasi pop-up sistem Apple.'
                                            : 'Open Telunas Fix in Safari, tap Share (⎋), then choose "Add to Home Screen". Launch from your home screen to enable Apple web push notifications.'}
                                    </p>
                                </div>

                                {!pushSupported && (
                                    <div
                                        className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                                            isDark
                                                ? 'bg-amber-950/30 border-amber-500/30 text-amber-200/90'
                                                : 'bg-amber-50 border-amber-200 text-amber-900'
                                        }`}
                                    >
                                        <p className={`font-bold flex items-center gap-1.5 ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                                            <span>🌐 {lang === 'id' ? 'Status Akses: HTTP / Jaringan Wi-Fi Lokal' : 'Access Status: Local HTTP / Wi-Fi'}</span>
                                        </p>
                                        <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-amber-800'}`}>
                                            {lang === 'id'
                                                ? 'Browser membatasi banner pop-up sistem saat web diakses melalui HTTP IP lokal. Namun, notifikasi suara denting & banner pop-up di dalam web ini TETAP AKTIF setiap kali ada tiket baru untuk departemen Anda.'
                                                : 'Browsers restrict native system push on local HTTP IP. However, in-app chime audio and visual alerts remain fully active whenever new tickets are reported.'}
                                        </p>
                                    </div>
                                )}

                                {/* In-App Sound Alert Toggle (Works on HTTP & HTTPS) */}
                                <div
                                    className={`p-4 rounded-xl border flex items-center justify-between gap-4 flex-wrap ${
                                        isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${
                                                isDark
                                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            }`}
                                        >
                                            {soundAlertEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className={`h-4 w-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />}
                                        </div>
                                        <div>
                                            <h3 className={`text-xs sm:text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                {lang === 'id' ? 'Suara Peringatan & Getar di Web (HTTP / Wi-Fi)' : 'In-App Chime & Vibration (HTTP / Wi-Fi)'}
                                            </h3>
                                            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                {lang === 'id'
                                                    ? 'Memutar audio denting lonceng saat tiket/isu baru masuk (100% aktif di jaringan lokal).'
                                                    : 'Plays audio chime when new issues arrive (works on local network).'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => playNotificationChime('normal')}
                                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                                                isDark
                                                    ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100'
                                                    : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
                                            }`}
                                            title={lang === 'id' ? 'Putar tes bunyi lonceng' : 'Play test chime'}
                                        >
                                            🔔 {lang === 'id' ? 'Tes Suara' : 'Test Sound'}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleToggleSound}
                                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                                                soundAlertEnabled
                                                    ? (isDark
                                                        ? 'bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/60'
                                                        : 'bg-emerald-50 border border-emerald-300 text-emerald-700 hover:bg-emerald-100')
                                                    : (isDark
                                                        ? 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-white'
                                                        : 'bg-white border border-slate-300 text-slate-500 hover:text-slate-900')
                                            }`}
                                        >
                                            {soundAlertEnabled ? (
                                                <>
                                                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                                    <span>{lang === 'id' ? 'Suara Aktif' : 'Enabled'}</span>
                                                </>
                                            ) : (
                                                <span>{lang === 'id' ? 'Hening (Mute)' : 'Muted'}</span>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-2 flex items-center justify-between gap-3 flex-wrap">
                                    {pushSubscribed ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={handleTogglePush}
                                                disabled={pushLoading}
                                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-sm disabled:opacity-50 ${
                                                    isDark
                                                        ? 'text-rose-400 hover:text-white bg-rose-950/40 hover:bg-rose-600/80 border-rose-900/60 hover:border-rose-500'
                                                        : 'text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border-rose-200 hover:border-rose-600'
                                                }`}
                                            >
                                                {pushLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                                                <span>{lang === 'id' ? 'Matikan Notifikasi di Perangkat Ini' : 'Turn Off On This Device'}</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={handleTestPush}
                                                disabled={pushTestLoading}
                                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white transition-all cursor-pointer shadow-lg disabled:opacity-60 ml-auto"
                                            >
                                                {pushTestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                                                <span>{lang === 'id' ? 'Kirim Tes Pop-up ke HP / PC' : 'Send Test Pop-up Notification'}</span>
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleTogglePush}
                                            disabled={pushLoading || !pushSupported}
                                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white transition-all cursor-pointer shadow-lg disabled:opacity-50 ml-auto hover:scale-105 active:scale-95"
                                        >
                                            {pushLoading ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    <span>{lang === 'id' ? 'Menghubungkan...' : 'Connecting...'}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <BellRing className="h-4 w-4" />
                                                    <span>{lang === 'id' ? 'Aktifkan Notifikasi Pop-up (HP / PC)' : 'Enable Pop-up Notifications'}</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                        )}

                        {/* WhatsApp Bot System Management Card (Admin Only) */}
                        {isAdmin && (
                            <div
                                className="rounded-2xl border-2 p-6 sm:p-8 shadow-lg space-y-5 relative overflow-hidden liquid-glass-card liquid-glass-tint-emerald"
                            >
                                <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

                                <div className={`flex items-center justify-between gap-4 pb-4 border-b flex-wrap relative z-10 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-xs shrink-0 ${
                                                isDark
                                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            }`}
                                        >
                                            <MessageSquare className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h2 className={`text-base sm:text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                    {lang === 'id' ? 'Pengelolaan Nomor WhatsApp Bot Resmi' : 'Official WhatsApp Bot Number & System'}
                                                </h2>
                                                <span
                                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                        isDark
                                                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                                            : 'bg-amber-100 text-amber-800 border-amber-300'
                                                    }`}
                                                >
                                                    ADMIN ONLY
                                                </span>
                                            </div>
                                            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                {lang === 'id'
                                                    ? 'Kendali penuh untuk mengganti nomor bot, reset sesi yang bermasalah, atau scan QR langsung dari profil Anda.'
                                                    : 'Full control to change the bot number, re-link problematic sessions, or scan QR directly from your profile.'}
                                            </p>
                                        </div>
                                    </div>

                                    <div
                                        className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-xs ${
                                            adminBotStatus?.connected
                                                ? (isDark
                                                    ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                                                    : 'bg-emerald-50 border-emerald-300 text-emerald-700')
                                                : (isDark
                                                    ? 'bg-rose-950/60 border-rose-500/50 text-rose-300 animate-pulse'
                                                    : 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse')
                                        }`}
                                    >
                                        <span className={`w-2 h-2 rounded-full ${adminBotStatus?.connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                        <span>{adminBotStatus?.connected ? `Online (+${adminBotStatus.phone || 'Active'})` : 'Bot Terputus / Perlu Ditautkan'}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
                                    <div
                                        className="p-3.5 rounded-xl border space-y-1 liquid-glass-subtle"
                                    >
                                        <span className={`text-[11px] font-semibold flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            <Phone className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                            <span>{lang === 'id' ? 'Nomor Bot Saat Ini' : 'Current Bot Number'}</span>
                                        </span>
                                        <span className={`text-base font-mono font-extrabold block ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {adminBotStatus?.phone ? `+${adminBotStatus.phone}` : (lang === 'id' ? 'Belum Ada / Nonaktif' : 'None / Inactive')}
                                        </span>
                                        <span className={`text-[10px] block pt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {lang === 'id' ? 'Nomor ini yang mengirim laporan tiket & broadcast ke grup WhatsApp staf.' : 'Used to send ticket alerts & broadcast to staff WhatsApp groups.'}
                                        </span>
                                    </div>

                                    <div
                                        className="p-3.5 rounded-xl border flex flex-col justify-center space-y-2 liquid-glass-subtle"
                                    >
                                        <span className={`text-[11px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {lang === 'id' ? 'Aksi Pengelolaan Admin' : 'Admin Actions'}
                                        </span>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {adminBotStatus?.connected && adminBotStatus?.phone && (
                                                <a
                                                    href={`https://wa.me/${String(adminBotStatus.phone).replace(/[^0-9]/g, '')}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all shadow-xs ${
                                                        isDark
                                                            ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/40'
                                                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300'
                                                    }`}
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                    <span>{lang === 'id' ? 'Tes Chat Bot' : 'Test Chat'}</span>
                                                </a>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setBotModalTab('pair');
                                                    setBotModalOpen(true);
                                                }}
                                                className="flex-1 min-w-[130px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white transition-all shadow-md cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                                            >
                                                <KeyRound className="w-3.5 h-3.5" />
                                                <span>{lang === 'id' ? 'Ganti Nomor Bot' : 'Change Number'}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setBotModalTab('status');
                                                    setBotModalOpen(true);
                                                }}
                                                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                                    isDark
                                                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                                                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                                                }`}
                                                title="Buka Menu Kontrol Lengkap"
                                            >
                                                <span>{lang === 'id' ? 'Kontrol Layanan' : 'Control Panel'}</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <p className={`text-[11px] leading-relaxed border-t pt-3 relative z-10 ${isDark ? 'text-slate-400 border-slate-800' : 'text-slate-500 border-slate-200'}`}>
                                    📢 <strong>{lang === 'id' ? 'Pemberitahuan Otomatis ke Grup:' : 'Automatic Group Broadcast:'}</strong>{' '}
                                    {lang === 'id'
                                        ? 'Setiap kali nomor bot berhasil diganti, bot akan langsung mengirimkan pesan siaran resmi nomor baru ke seluruh grup WhatsApp departemen dan channel.'
                                        : 'Whenever the bot number is changed, it automatically broadcasts an official announcement with the new number to all staff department groups and channel.'}
                                </p>
                            </div>
                        )}

                        {/* Notification Preferences Card (WhatsApp ticket alerts — gated by APPROVAL_TICKETS_ENABLED) */}
                        {approvalTicketsEnabled && (
                        <div
                            className={`rounded-2xl border p-6 sm:p-8 shadow-lg space-y-4 liquid-glass-card ${!hasWhatsapp ? 'opacity-90' : ''}`}
                        >
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                                <div className="flex items-center gap-2.5">
                                    <div
                                        className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                                            hasWhatsapp
                                                ? (isDark ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-indigo-50 text-indigo-700 border-indigo-200')
                                                : (isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200')
                                        }`}
                                    >
                                        <MessageSquare className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h2 className={`text-base sm:text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                Notifikasi Tiket via WhatsApp
                                            </h2>
                                            {!hasWhatsapp && (
                                                <span
                                                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                                        isDark
                                                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                                            : 'bg-amber-100 text-amber-800 border-amber-300'
                                                    }`}
                                                >
                                                    Nomor Tidak Terdaftar
                                                </span>
                                            )}
                                        </div>
                                        <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
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
                                                ? (isDark ? 'bg-slate-800 cursor-not-allowed opacity-40' : 'bg-slate-200 cursor-not-allowed opacity-50')
                                                : (notifyPref
                                                    ? 'bg-emerald-600 cursor-pointer'
                                                    : (isDark ? 'bg-slate-700 cursor-pointer' : 'bg-slate-300 cursor-pointer'))
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
                                <div
                                    className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                                        isDark
                                            ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
                                            : 'bg-amber-50 border-amber-200 text-amber-900'
                                    }`}
                                >
                                    <AlertCircle className={`h-4 w-4 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                                    <span>
                                        Opsi ini <strong>tidak dapat diaktifkan</strong> karena akun Anda tidak memiliki nomor WhatsApp yang terdaftar (atau nomor telah dihapus/di-unlink dan di-ACC Admin). Hubungkan nomor WhatsApp terlebih dahulu untuk mengaktifkan notifikasi via WhatsApp pribadi.
                                    </span>
                                </div>
                            ) : (
                                <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    <em>Catatan:</em> Bot tidak akan mengirimkan spam progres isu ke chat pribadi Anda. Progres isu antar-departemen dapat dipantau melalui lonceng notifikasi di dashboard.
                                </p>
                            )}
                        </div>
                        )}

                        {/* Password Form Card */}
                        <div
                            className="rounded-2xl border p-6 sm:p-8 shadow-lg space-y-6 liquid-glass-card"
                        >
                            <div className={`flex items-center gap-2.5 pb-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <KeyRound className={`h-5 w-5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                <div>
                                    <h2 className={`text-base sm:text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {isAdmin
                                            ? (lang === 'id' ? 'Ganti Kata Sandi (Langsung)' : 'Change Password (Direct)')
                                            : approvalTicketsEnabled
                                                ? (lang === 'id' ? 'Permohonan Reset Kata Sandi' : 'Password Reset Request')
                                                : (lang === 'id' ? 'Reset Kata Sandi' : 'Password Reset')}
                                    </h2>
                                    <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {isAdmin
                                            ? (lang === 'id' ? 'Sebagai Admin, Anda dapat mengganti kata sandi Anda secara langsung.' : 'As Admin, you can update your password directly.')
                                            : approvalTicketsEnabled
                                                ? (lang === 'id' ? 'Sesuai SOP Telunas, permohonan reset password staf akan ditinjau oleh HOD sebelum disetujui Admin.' : 'Per Telunas SOP, staff password reset requests are reviewed by HOD before Admin approval.')
                                                : (lang === 'id' ? 'Penggantian atau reset kata sandi akun staf dikelola langsung oleh Administrator.' : 'Staff password resets or changes are handled directly by the Administrator.')}
                                    </p>
                                </div>
                            </div>

                            {isAdmin ? (
                                /* Admin Direct Password Change Form */
                                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                                    {recentlySuccessful && (
                                        <div
                                            className={`flex items-center gap-2 p-3.5 rounded-xl border text-xs font-semibold animate-fade-in ${
                                                isDark
                                                    ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                                                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                            }`}
                                        >
                                            <CheckCircle2 className={`h-4 w-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                            <span>Kata sandi berhasil diperbarui.</span>
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <label htmlFor="current_password" className={`block text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                            Kata Sandi Saat Ini <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <Lock className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                                            <input
                                                id="current_password"
                                                ref={currentPasswordInput}
                                                type="password"
                                                value={data.current_password}
                                                onChange={(e) => setData('current_password', e.target.value)}
                                                autoComplete="current-password"
                                                placeholder="••••••••"
                                                className={`w-full rounded-xl border pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-1 transition-colors ${
                                                    isDark
                                                        ? 'border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500'
                                                        : 'border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500'
                                                }`}
                                            />
                                        </div>
                                        {errors.current_password && (
                                            <p className={`text-xs flex items-center gap-1 mt-1 ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>
                                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                {errors.current_password}
                                            </p>
                                        )}
                                    </div>

                                    <div className="space-y-1.5">
                                        <label htmlFor="password" className={`block text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                            Kata Sandi Baru <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <KeyRound className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                                            <input
                                                id="password"
                                                ref={passwordInput}
                                                type="password"
                                                value={data.password}
                                                onChange={(e) => setData('password', e.target.value)}
                                                autoComplete="new-password"
                                                placeholder="••••••••"
                                                className={`w-full rounded-xl border pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-1 transition-colors ${
                                                    isDark
                                                        ? 'border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500'
                                                        : 'border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500'
                                                }`}
                                            />
                                        </div>
                                        {errors.password && (
                                            <p className={`text-xs flex items-center gap-1 mt-1 ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>
                                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                {errors.password}
                                            </p>
                                        )}
                                    </div>

                                    <div className="space-y-1.5">
                                        <label htmlFor="password_confirmation" className={`block text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                            Konfirmasi Kata Sandi Baru <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <KeyRound className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                                            <input
                                                id="password_confirmation"
                                                type="password"
                                                value={data.password_confirmation}
                                                onChange={(e) => setData('password_confirmation', e.target.value)}
                                                autoComplete="new-password"
                                                placeholder="••••••••"
                                                className={`w-full rounded-xl border pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-1 transition-colors ${
                                                    isDark
                                                        ? 'border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500'
                                                        : 'border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500'
                                                }`}
                                            />
                                        </div>
                                        {errors.password_confirmation && (
                                            <p className={`text-xs flex items-center gap-1 mt-1 ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>
                                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                {errors.password_confirmation}
                                            </p>
                                        )}
                                    </div>

                                    <div className="pt-3 flex justify-end">
                                        <button
                                            type="submit"
                                            disabled={processing}
                                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white hover:scale-105 active:scale-95 transition-all shadow-lg cursor-pointer disabled:opacity-60"
                                        >
                                            {processing ? 'Menyimpan...' : 'Simpan Kata Sandi Baru'}
                                        </button>
                                    </div>
                                </form>
                            ) : !approvalTicketsEnabled ? (
                                <div
                                    className={`p-4 rounded-xl border text-xs space-y-2 ${
                                        isDark
                                            ? 'bg-slate-950/80 border-slate-800 text-slate-300'
                                            : 'bg-slate-50 border-slate-200 text-slate-700'
                                    }`}
                                >
                                    <div className={`flex items-center gap-2 font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                        <ShieldAlert className={`w-4 h-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                        <span>
                                            {lang === 'id'
                                                ? 'Reset Kata Sandi Dikelola Administrator'
                                                : 'Password Resets Managed by Administrator'}
                                        </span>
                                    </div>
                                    <p className={`leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                        {lang === 'id'
                                            ? 'Pengajuan reset kata sandi melalui sistem tiket persetujuan sedang dinonaktifkan sementara. Hubungi Administrator untuk reset kata sandi 1-klik, atau gunakan fitur reset password melalui WhatsApp Bot jika nomor WhatsApp Anda sudah terhubung.'
                                            : 'Password reset requests via approval tickets are currently disabled. Please contact an Administrator for a direct reset, or use the WhatsApp Bot password reset feature if your WhatsApp number is linked.'}
                                    </p>
                                </div>
                            ) : (
                                /* Non-Admin 2-Tier Password Reset Ticketing Flow */
                                <div className="space-y-4">
                                    {pendingTicket && pendingTicket.type === 'password_reset' ? (
                                        <div
                                            className={`p-4 rounded-xl border text-xs space-y-1.5 animate-in fade-in duration-200 ${
                                                isDark
                                                    ? 'bg-amber-950/50 border-amber-500/40 text-amber-200'
                                                    : 'bg-amber-50 border-amber-200 text-amber-900'
                                            }`}
                                        >
                                            <div className={`flex items-center gap-2 font-bold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                                                <Clock className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                                                <span>Tiket Reset Password Sedang Diproses (#{pendingTicket.ticket_number})</span>
                                            </div>
                                            <p>
                                                Permohonan reset kata sandi Anda saat ini sedang dalam tahap peninjauan <strong>{pendingTicket.status === 'pending_hod' ? 'HOD Departemen' : 'Admin'}</strong>.
                                            </p>
                                            <p className={`text-[11px] pt-1 border-t ${isDark ? 'text-amber-300/90 border-amber-500/30' : 'text-amber-800 border-amber-200'}`}>
                                                Anda akan menerima kata sandi baru atau konfirmasi setelah tiket disetujui.
                                            </p>
                                        </div>
                                    ) : (
                                        <form onSubmit={handlePasswordTicketSubmit} className="space-y-4">
                                            {(pwdTicketSuccessful || status === 'password-ticket-submitted') && (
                                                <div
                                                    className={`flex items-center gap-2 p-3.5 rounded-xl border text-xs font-semibold animate-fade-in ${
                                                        isDark
                                                            ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                                                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                                    }`}
                                                >
                                                    <CheckCircle2 className={`h-4 w-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                                    <span>Permohonan tiket reset password telah berhasil diajukan ke HOD!</span>
                                                </div>
                                            )}

                                            <div className="space-y-1.5">
                                                <label htmlFor="pwd_reason" className={`block text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                    Alasan Reset Kata Sandi <span className="text-rose-500">*</span>
                                                </label>
                                                <textarea
                                                    id="pwd_reason"
                                                    rows={2}
                                                    value={pwdTicketData.reason}
                                                    onChange={(e) => setPwdTicketData('reason', e.target.value)}
                                                    placeholder="Contoh: Lupa kata sandi lama / Pergantian berkala..."
                                                    className={`w-full rounded-xl border p-3 text-xs focus:outline-none focus:ring-1 transition-colors ${
                                                        isDark
                                                            ? 'border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500'
                                                            : 'border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500'
                                                    }`}
                                                    required
                                                />
                                                {pwdTicketErrors.reason && (
                                                    <p className={`text-xs flex items-center gap-1 mt-1 ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>
                                                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                        {pwdTicketErrors.reason}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="space-y-1.5">
                                                <label htmlFor="new_password_req" className={`block text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                    Kata Sandi Baru yang Diinginkan (Opsional)
                                                </label>
                                                <input
                                                    id="new_password_req"
                                                    type="password"
                                                    value={pwdTicketData.new_password}
                                                    onChange={(e) => setPwdTicketData('new_password', e.target.value)}
                                                    placeholder="Minimal 8 karakter (biarkan kosong jika ingin digenerate oleh Admin)"
                                                    className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none focus:ring-1 transition-colors ${
                                                        isDark
                                                            ? 'border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500'
                                                            : 'border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500'
                                                    }`}
                                                />
                                            </div>

                                            <div className="pt-2 flex justify-end">
                                                <button
                                                    type="submit"
                                                    disabled={pwdTicketProcessing}
                                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white hover:scale-105 active:scale-95 transition-all shadow-lg cursor-pointer disabled:opacity-60"
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

            {approvalTicketsEnabled && (
                <>
            {/* Modal: Ajukan Pindah Departemen */}
            <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
                <DialogContent
                    className={`max-w-md p-6 rounded-2xl shadow-2xl border liquid-glass-modal ${
                        isDark
                            ? 'liquid-glass-dark text-slate-100'
                            : 'liquid-glass-light text-slate-900'
                    }`}
                >
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <div
                                className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                                    isDark
                                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                            >
                                <Building2 className="w-5 h-5" />
                            </div>
                            <div>
                                <DialogTitle className={`text-base sm:text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {lang === 'id' ? 'Ajukan Pindah Departemen' : 'Request Department Transfer'}
                                </DialogTitle>
                                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Departemen saat ini: <strong className={isDark ? 'text-white' : 'text-slate-900'}>{department}</strong> {subdivision ? `(${subdivision})` : ''}
                                </p>
                            </div>
                        </div>
                    </DialogHeader>

                    <form onSubmit={handleTransferSubmit} className="space-y-4 pt-2 text-xs">
                        {/* Target Department Select */}
                        <div className="space-y-1.5">
                            <label className={`text-xs font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                Departemen Tujuan <span className="text-rose-500">*</span>
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
                                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs focus:outline-none focus:ring-1 ${
                                    isDark
                                        ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-emerald-500 focus:ring-emerald-500'
                                        : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500 focus:ring-emerald-500'
                                }`}
                            >
                                <option value="">-- Pilih Departemen Tujuan --</option>
                                {ALL_DEPARTMENTS.filter(d => d.toLowerCase() !== (department || '').toLowerCase()).map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                            {transferErrors.target_department && (
                                <p className={`text-[11px] ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{transferErrors.target_department}</p>
                            )}
                        </div>

                        {/* Optional Subdivision Select */}
                        {transferData.target_department && (DEPARTMENT_SUBDIVISIONS[transferData.target_department] || []).length > 1 && (
                            <div className="space-y-1.5">
                                <label className={`text-xs font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                    Subdivisi / Sub-Unit (Opsional)
                                </label>
                                <select
                                    value={transferData.target_subdivision}
                                    onChange={(e) => setTransferData('target_subdivision', e.target.value)}
                                    className={`w-full rounded-xl border px-3.5 py-2.5 text-xs focus:outline-none focus:ring-1 ${
                                        isDark
                                            ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-emerald-500 focus:ring-emerald-500'
                                            : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500 focus:ring-emerald-500'
                                    }`}
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
                            <label className={`text-xs font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                Alasan Pemindahan / Rotasi <span className="text-rose-500">*</span>
                            </label>
                            <textarea
                                rows={3}
                                value={transferData.reason}
                                onChange={(e) => setTransferData('reason', e.target.value)}
                                placeholder="Jelaskan alasan pengajuan mutasi tugas atau rotasi divisi ini..."
                                required
                                className={`w-full rounded-xl border p-3 text-xs leading-relaxed focus:outline-none focus:ring-1 ${
                                    isDark
                                        ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-emerald-500'
                                        : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:ring-emerald-500'
                                }`}
                            />
                            {transferErrors.reason && (
                                <p className={`text-[11px] ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{transferErrors.reason}</p>
                            )}
                        </div>

                        {/* Workflow info */}
                        <div
                            className={`p-3 rounded-xl border text-[11px] space-y-1 leading-relaxed ${
                                isDark
                                    ? 'bg-slate-950/80 border-slate-800 text-slate-400'
                                    : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                        >
                            <p className={`font-bold flex items-center gap-1.5 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                                <ShieldAlert className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                {isHOD ? 'Alur Persetujuan Mutasi Pimpinan:' : 'Alur Persetujuan Bertingkat:'}
                            </p>
                            {isHOD ? (
                                <>
                                    <p>1. Sebagai <strong>Head of Department (HOD)</strong>, tiket Anda otomatis langsung diteruskan ke <strong>Admin Resort</strong> untuk ACC final.</p>
                                    <p>2. Admin Resort akan menentukan penetapan status pimpinan Anda di departemen baru.</p>
                                    <p>3. Riwayat isu yang pernah Anda tangani sebelumnya tetap dapat dilihat (Read-Only).</p>
                                </>
                            ) : (
                                <>
                                    <p>1. Permohonan akan ditinjau & diverifikasi oleh <strong>HOD Departemen {department}</strong>.</p>
                                    <p>2. Setelah disetujui HOD, <strong>Admin Resort</strong> akan memberikan ACC final.</p>
                                    <p>3. Riwayat isu yang pernah Anda tangani sebelumnya tetap dapat dilihat (Read-Only).</p>
                                </>
                            )}
                        </div>

                        {/* Footer Buttons */}
                        <div className="pt-2 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsTransferModalOpen(false);
                                    resetTransfer();
                                }}
                                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                    isDark
                                        ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                            >
                                Batal
                            </button>

                            <button
                                type="submit"
                                disabled={transferProcessing || !transferData.target_department || !transferData.reason.trim()}
                                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white active:scale-95 transition-all shadow-lg cursor-pointer disabled:opacity-50"
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

            {/* Name Change Request Modal */}
            <Dialog open={isNameModalOpen} onOpenChange={setIsNameModalOpen}>
                <DialogContent
                    className={`sm:max-w-md p-6 shadow-2xl rounded-2xl border liquid-glass-modal ${
                        isDark
                            ? 'liquid-glass-dark text-slate-100'
                            : 'liquid-glass-light text-slate-900'
                    }`}
                >
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <div
                                className={`p-2.5 rounded-xl border ${
                                    isDark
                                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                            >
                                <User className={`w-5 h-5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                            </div>
                            <div>
                                <DialogTitle className={`text-base sm:text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {lang === 'id' ? 'Permohonan Perubahan Nama Akun' : 'Name Change Request'}
                                </DialogTitle>
                                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {lang === 'id' ? 'Ajukan pembaruan nama resmi untuk identitas tugas & profil.' : 'Submit official name update for work identity.'}
                                </p>
                            </div>
                        </div>
                    </DialogHeader>

                    <form onSubmit={handleNameSubmit} className="space-y-4 pt-2 text-xs">
                        {/* Current Name Summary */}
                        <div
                            className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                                isDark
                                    ? 'bg-slate-950 border-slate-800'
                                    : 'bg-slate-50 border-slate-200'
                            }`}
                        >
                            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Nama Saat Ini:</span>
                            <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{user?.name}</span>
                        </div>

                        {/* New Name Input */}
                        <div className="space-y-1.5">
                            <label className={`text-xs font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                Nama Baru Resmi <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={nameData.new_name}
                                onChange={(e) => setNameData('new_name', e.target.value)}
                                placeholder="Masukkan nama lengkap / resmi baru..."
                                required
                                minLength={2}
                                maxLength={100}
                                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs focus:outline-none focus:ring-1 ${
                                    isDark
                                        ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-emerald-500'
                                        : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:ring-emerald-500'
                                }`}
                            />
                            {nameErrors.new_name && (
                                <p className={`text-[11px] ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{nameErrors.new_name}</p>
                            )}
                        </div>

                        {/* Reason Textarea */}
                        <div className="space-y-1.5">
                            <label className={`text-xs font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                Alasan Perubahan Nama <span className="text-rose-500">*</span>
                            </label>
                            <textarea
                                rows={3}
                                value={nameData.reason}
                                onChange={(e) => setNameData('reason', e.target.value)}
                                placeholder="Jelaskan alasan pengajuan nama baru (misal: koreksi ejaan resmi HR, penyesuaian nama panggilan dinas, dll)..."
                                required
                                minLength={3}
                                maxLength={500}
                                className={`w-full rounded-xl border p-3 text-xs leading-relaxed focus:outline-none focus:ring-1 ${
                                    isDark
                                        ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-emerald-500'
                                        : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:ring-emerald-500'
                                }`}
                            />
                            {nameErrors.reason && (
                                <p className={`text-[11px] ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{nameErrors.reason}</p>
                            )}
                        </div>

                        {/* Workflow info */}
                        <div
                            className={`p-3 rounded-xl border text-[11px] space-y-1 leading-relaxed ${
                                isDark
                                    ? 'bg-slate-950/80 border-slate-800 text-slate-400'
                                    : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                        >
                            <p className={`font-bold flex items-center gap-1.5 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                                <ShieldCheck className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                {lang === 'id' ? 'Alur Verifikasi & Sinkronisasi Data:' : 'Verification & Synchronization:'}
                            </p>
                            <p>1. Permohonan nama baru akan diverifikasi oleh <strong>{isHOD ? 'Admin Resort' : `HOD Departemen ${department || ''} & Admin Resort`}</strong>.</p>
                            <p>2. Begitu disetujui, nama akun dan daftar staf untuk klaim <strong>WhatsApp Bot</strong> otomatis diperbarui.</p>
                        </div>

                        {/* Footer Buttons */}
                        <div className="pt-2 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsNameModalOpen(false);
                                    resetName();
                                }}
                                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                    isDark
                                        ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                            >
                                Batal
                            </button>

                            <button
                                type="submit"
                                disabled={nameProcessing || !nameData.new_name.trim() || !nameData.reason.trim()}
                                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white active:scale-95 transition-all shadow-lg cursor-pointer disabled:opacity-50"
                            >
                                {nameProcessing ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        <span>Mengajukan...</span>
                                    </>
                                ) : (
                                    <>
                                        <Check className="h-3.5 w-3.5" />
                                        <span>Kirim Permohonan</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
                </>
            )}

            {/* Admin Bot Control & Number Management Modal */}
            {isAdmin && (
                <BotControlModal
                    open={botModalOpen}
                    onOpenChange={setBotModalOpen}
                    botStatus={adminBotStatus}
                    onRefreshStatus={fetchAdminBotStatus}
                    initialTab={botModalTab}
                />
            )}
        </div>
    );
}
