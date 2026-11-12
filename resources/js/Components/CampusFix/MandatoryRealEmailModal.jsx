import { useState, useEffect } from 'react';
import axios from 'axios';
import { router } from '@inertiajs/react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/Components/UI/Dialog';
import { Button } from '@/Components/UI/Button';
import { Mail, ShieldCheck, AlertCircle, Loader2, CheckCircle2, ArrowRight, Lock, LogOut } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useLeanTheme } from '@/hooks/useLeanTheme';

export function MandatoryRealEmailModal({ user }) {
    const { lang } = useLanguage?.() || { lang: 'id' };
    const { isDark } = useLeanTheme();
    const isDummy = Boolean(user?.is_dummy_email);
    const [isOpen, setIsOpen] = useState(isDummy);
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        setIsOpen(Boolean(user?.is_dummy_email));
    }, [user?.is_dummy_email]);

    if (!user || !isDummy) {
        return null;
    }

    const handleLogout = () => {
        setIsLoggingOut(true);
        const logoutUrl = typeof route === 'function' ? route('logout') : '/logout';
        router.post(logoutUrl, {}, {
            onSuccess: () => {
                window.location.href = '/login';
            },
            onError: () => {
                window.location.href = '/login';
            },
            onFinish: () => setIsLoggingOut(false),
        });
    };

    const handleSubmit = async (e) => {
        e?.preventDefault();
        const trimmed = email.trim().toLowerCase();

        if (!trimmed) {
            setErrorMessage(lang === 'id' ? 'Silakan masukkan alamat email asli Anda.' : 'Please enter your real email address.');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmed)) {
            setErrorMessage(lang === 'id' ? 'Format alamat email tidak valid.' : 'Invalid email address format.');
            return;
        }

        if (trimmed.endsWith('@telunas.com') || trimmed.endsWith('@example.com') || trimmed.endsWith('@test.com')) {
            setErrorMessage(
                lang === 'id'
                    ? 'Harap gunakan alamat email asli (seperti Gmail atau email aktif perusahaan), bukan domain dummy.'
                    : 'Please use an active real email address (e.g. Gmail), not a dummy domain.'
            );
            return;
        }

        setIsLoading(true);
        setErrorMessage('');

        try {
            const res = await axios.post('/api/user/update-real-email', {
                email: trimmed,
            });

            if (res.data?.success) {
                setIsSuccess(true);
                setTimeout(() => {
                    setIsOpen(false);
                    // Reload page to refresh Inertia auth user state
                    router.reload({ only: ['auth'] });
                }, 1200);
            }
        } catch (err) {
            const msg = err.response?.data?.errors?.email?.[0] || 
                        err.response?.data?.message || 
                        (lang === 'id' ? 'Gagal memperbarui email. Pastikan email belum digunakan akun lain.' : 'Failed to update email. Ensure it is not already used.');
            setErrorMessage(msg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={() => { /* Prevent closing on outside click */ }}>
            <DialogContent 
                showClose={false}
                className={`max-w-md border p-0 overflow-hidden rounded-2xl shadow-2xl ${
                    isDark
                        ? 'bg-slate-900 border-emerald-500/40 text-slate-100'
                        : 'bg-white border-slate-200 text-slate-900'
                }`}
                onPointerDownOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                {/* Header Banner with Lean Styling */}
                <div className={`px-6 pt-6 pb-4 border-b ${
                    isDark
                        ? 'bg-gradient-to-b from-slate-800/80 to-slate-900 border-slate-800'
                        : 'bg-gradient-to-b from-emerald-50/80 to-white border-slate-200'
                }`}>
                    <div className="flex items-center gap-3.5 mb-2">
                        <div className={`p-3 rounded-2xl border shadow-inner ${
                            isDark
                                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                : 'bg-emerald-100 border-emerald-200 text-emerald-700'
                        }`}>
                            <Mail className="h-6 w-6 animate-pulse" />
                        </div>
                        <div>
                            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border mb-1 ${
                                isDark
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                    : 'bg-amber-100 text-amber-800 border-amber-300'
                            }`}>
                                {lang === 'id' ? 'Tindakan Wajib Akun' : 'Mandatory Account Action'}
                            </div>
                            <DialogTitle className={`text-base font-bold tracking-wide ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {lang === 'id' ? 'Hubungkan Alamat Email Asli' : 'Connect Real Email Address'}
                            </DialogTitle>
                        </div>
                    </div>
                    <DialogDescription className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {lang === 'id' ? 'Akun Anda saat ini masih menggunakan email dummy: ' : 'Your account is currently using a placeholder email: '}
                        <strong className={`font-mono ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>{user.email}</strong>.
                    </DialogDescription>
                </div>

                {/* Form Body */}
                <div className="p-6 space-y-4">
                    {/* Informational Cards */}
                    <div className={`p-3.5 rounded-xl border space-y-2 text-xs ${
                        isDark
                            ? 'bg-slate-800/70 border-slate-700 text-slate-300'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}>
                        <div className="flex items-start gap-2.5">
                            <ShieldCheck className={`h-4 w-4 shrink-0 mt-0.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                            <span>
                                {lang === 'id' ? (
                                    <>Email asli digunakan untuk <strong>keamanan verifikasi akun</strong> dan <strong>notifikasi resmi resort</strong>.</>
                                ) : (
                                    <>Your real email will be used for <strong>account security verification</strong> and <strong>official notifications</strong>.</>
                                )}
                            </span>
                        </div>
                        <div className="flex items-start gap-2.5">
                            <Lock className={`h-4 w-4 shrink-0 mt-0.5 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
                            <span>
                                {lang === 'id' ? (
                                    <><strong>Password Anda tetap sama</strong> dan tidak akan berubah.</>
                                ) : (
                                    <><strong>Your password stays the same</strong> and will not change.</>
                                )}
                            </span>
                        </div>
                    </div>

                    {isSuccess ? (
                        <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs ${
                            isDark
                                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        }`}>
                            <CheckCircle2 className={`h-5 w-5 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                            <div>
                                <div className={`font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-900'}`}>
                                    {lang === 'id' ? 'Email Berhasil Dihubungkan!' : 'Email Successfully Connected!'}
                                </div>
                                <div className={`text-[11px] mt-0.5 ${isDark ? 'text-emerald-200/80' : 'text-emerald-700'}`}>
                                    {lang === 'id' ? 'Memuat ulang sesi dashboard Anda...' : 'Reloading dashboard session...'}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {errorMessage && (
                                <div className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs ${
                                    isDark
                                        ? 'bg-rose-950/50 border-rose-500/40 text-rose-200'
                                        : 'bg-rose-50 border-rose-200 text-rose-800'
                                }`}>
                                    <AlertCircle className={`h-4 w-4 shrink-0 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} />
                                    <span>{errorMessage}</span>
                                </div>
                            )}

                            <div>
                                <label className={`block text-xs font-semibold mb-1.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                    {lang === 'id' ? 'Masukkan Alamat Email Asli Anda:' : 'Enter Your Real Email Address:'}
                                </label>
                                <input
                                    type="email"
                                    required
                                    autoFocus
                                    placeholder={lang === 'id' ? 'contoh: nama.anda@gmail.com' : 'e.g. your.name@gmail.com'}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={isLoading || isLoggingOut}
                                    className={`w-full rounded-xl px-3.5 py-2.5 text-xs border focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all ${
                                        isDark
                                            ? 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500'
                                            : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600'
                                    }`}
                                />
                                <span className={`text-[10px] mt-1 block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {lang === 'id'
                                        ? 'Gunakan Gmail pribadi/kantor atau email resmi yang dapat menerima pesan masuk.'
                                        : 'Use active Gmail or work email that can receive inbox messages.'}
                                </span>
                            </div>

                            <Button
                                type="submit"
                                disabled={isLoading || isLoggingOut || !email.trim()}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white keep-white font-bold py-2.5 text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>{lang === 'id' ? 'Memverifikasi & Menyimpan...' : 'Verifying & Saving...'}</span>
                                    </>
                                ) : (
                                    <>
                                        <span>{lang === 'id' ? 'Hubungkan Email & Lanjutkan' : 'Connect Email & Continue'}</span>
                                        <ArrowRight className="h-4 w-4" />
                                    </>
                                )}
                            </Button>

                            <div className={`pt-2 border-t flex items-center justify-between text-xs ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {lang === 'id' ? 'Belum siap mengisi email?' : 'Not ready to enter email?'}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    disabled={isLoading || isLoggingOut}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer disabled:opacity-50 text-xs ${
                                        isDark
                                            ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10'
                                            : 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                                    }`}
                                >
                                    {isLoggingOut ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <LogOut className="h-3.5 w-3.5" />
                                    )}
                                    <span>{lang === 'id' ? 'Keluar Akun' : 'Log Out'}</span>
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
