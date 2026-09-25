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

export function MandatoryRealEmailModal({ user }) {
    const { lang } = useLanguage?.() || { lang: 'id' };
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
        router.post(logoutUrl);
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
                className="max-w-md bg-[#1C1B0E] border-2 border-[#C9AA71]/60 text-[#E2DFD2] p-0 overflow-hidden rounded-2xl shadow-[0_0_50px_rgba(201,170,113,0.2)]"
                onPointerDownOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                {/* Header Banner with Resort Styling */}
                <div className="px-6 pt-6 pb-4 bg-gradient-to-b from-[#282516] to-[#1C1B0E] border-b border-[#3B3929]">
                    <div className="flex items-center gap-3.5 mb-2">
                        <div className="p-3 rounded-2xl bg-[#C9AA71]/20 border border-[#C9AA71]/50 text-[#C9AA71] shadow-inner">
                            <Mail className="h-6 w-6 animate-pulse" />
                        </div>
                        <div>
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-1">
                                {lang === 'id' ? 'Tindakan Wajib Akun' : 'Mandatory Account Action'}
                            </div>
                            <DialogTitle className="text-base font-bold text-white tracking-wide">
                                {lang === 'id' ? 'Hubungkan Alamat Email Asli' : 'Connect Real Email Address'}
                            </DialogTitle>
                        </div>
                    </div>
                    <DialogDescription className="text-xs text-[#A19F8D] leading-relaxed">
                        {lang === 'id' ? 'Akun Anda saat ini masih menggunakan email dummy: ' : 'Your account is currently using a placeholder email: '}
                        <strong className="text-rose-300 font-mono">{user.email}</strong>.
                    </DialogDescription>
                </div>

                {/* Form Body */}
                <div className="p-6 space-y-4">
                    {/* Informational Cards */}
                    <div className="p-3.5 rounded-xl bg-[#242217] border border-[#3B3929] space-y-2 text-xs text-[#A19F8D]">
                        <div className="flex items-start gap-2.5">
                            <ShieldCheck className="h-4 w-4 text-[#C9AA71] shrink-0 mt-0.5" />
                            <span>
                                {lang === 'id' ? (
                                    <>Email asli digunakan untuk <strong>laporan bulanan otomatis</strong> dan <strong>notifikasi resmi resort</strong>.</>
                                ) : (
                                    <>Your real email will be used for <strong>automated reports</strong> and <strong>official notifications</strong>.</>
                                )}
                            </span>
                        </div>
                        <div className="flex items-start gap-2.5">
                            <Lock className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
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
                        <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 flex items-center gap-3 text-xs">
                            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                            <div>
                                <div className="font-bold text-emerald-300">
                                    {lang === 'id' ? 'Email Berhasil Dihubungkan!' : 'Email Successfully Connected!'}
                                </div>
                                <div className="text-[11px] text-emerald-200/80 mt-0.5">
                                    {lang === 'id' ? 'Memuat ulang sesi dashboard Anda...' : 'Reloading dashboard session...'}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {errorMessage && (
                                <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 flex items-center gap-2.5 text-xs">
                                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                                    <span>{errorMessage}</span>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-[#FAFAFA] mb-1.5">
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
                                    className="w-full bg-[#16150B] border border-[#3B3929] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-[#615F52] focus:outline-none focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71] transition-all"
                                />
                                <span className="text-[10px] text-[#A19F8D] mt-1 block">
                                    {lang === 'id'
                                        ? 'Gunakan Gmail pribadi/kantor atau email resmi yang dapat menerima pesan masuk.'
                                        : 'Use active Gmail or work email that can receive inbox messages.'}
                                </span>
                            </div>

                            <Button
                                type="submit"
                                disabled={isLoading || isLoggingOut || !email.trim()}
                                className="w-full bg-[#C9AA71] hover:bg-[#B8985E] text-[#1C1B0E] font-bold py-2.5 text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
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

                            <div className="pt-2 border-t border-[#3B3929]/50 flex items-center justify-between text-xs">
                                <span className="text-[11px] text-[#A19F8D]">
                                    {lang === 'id' ? 'Belum siap mengisi email?' : 'Not ready to enter email?'}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    disabled={isLoading || isLoggingOut}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 font-semibold transition-colors cursor-pointer disabled:opacity-50 text-xs"
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
