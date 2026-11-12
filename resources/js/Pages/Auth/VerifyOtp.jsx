import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import GuestLayout from '@/Layouts/GuestLayout';
import { useLanguage } from '@/context/LanguageContext';
import { Head, router, useForm } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, ArrowLeft, Clock, AlertTriangle, MessageSquare } from 'lucide-react';

export default function VerifyOtp({
    maskedPhone = '08••••••••',
    expiresAt = 0,
    resendAvailableAt = 0,
    serverNow = 0,
    attemptsRemaining = 5,
    status = null,
}) {
    const { lang } = useLanguage();
    const isEn = lang === 'en';
    const { data, setData, post, processing, errors, reset } = useForm({
        otp: '',
    });

    const [resending, setResending] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [clockAnchor, setClockAnchor] = useState(() => ({
        clientTs: Math.floor(Date.now() / 1000),
        serverTs: Number(serverNow) || Math.floor(Date.now() / 1000),
    }));
    const [nowTick, setNowTick] = useState(() => Math.floor(Date.now() / 1000));

    useEffect(() => {
        const syncedServerTs = Number(serverNow) || Math.floor(Date.now() / 1000);
        const clientTs = Math.floor(Date.now() / 1000);
        setClockAnchor({ clientTs, serverTs: syncedServerTs });
        setNowTick(clientTs);
    }, [serverNow, expiresAt, resendAvailableAt]);

    useEffect(() => {
        const timer = setInterval(() => {
            setNowTick(Math.floor(Date.now() / 1000));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const estimatedServerNow = clockAnchor.serverTs + Math.max(0, nowTick - clockAnchor.clientTs);
    const secondsRemaining = Math.max(0, Number(expiresAt || 0) - estimatedServerNow);
    const resendSeconds = Math.max(0, Number(resendAvailableAt || 0) - estimatedServerNow);
    const isExpired = secondsRemaining <= 0;

    const formatTimer = (secs) => {
        const mins = Math.floor(secs / 60);
        const rem = secs % 60;
        return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
    };

    const submit = (e) => {
        e.preventDefault();
        if (isExpired || data.otp.length !== 6 || processing) {
            return;
        }

        post(route('login.otp.verify'), {
            onError: () => reset('otp'),
        });
    };

    const handleResend = () => {
        if (resending || resendSeconds > 0 || processing) {
            return;
        }

        router.post(
            route('login.otp.resend'),
            {},
            {
                preserveScroll: true,
                onStart: () => setResending(true),
                onFinish: () => setResending(false),
            }
        );
    };

    const handleCancel = () => {
        if (cancelling || processing) {
            return;
        }

        router.post(
            route('login.otp.cancel'),
            {},
            {
                onStart: () => setCancelling(true),
                onFinish: () => setCancelling(false),
            }
        );
    };

    return (
        <GuestLayout>
            <Head title={isEn ? 'WhatsApp OTP Verification — Telunas Issue Tracker' : 'Verifikasi OTP WhatsApp — Telunas Issue Tracker'} />

            <div className="mb-5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold mb-3">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Two-Factor Verification (2FA)' : 'Verifikasi Dua Langkah (2FA)'}</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 tracking-tight">
                    {isEn ? 'Enter WhatsApp OTP Code' : 'Masukkan Kode OTP WhatsApp'}
                </h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    {isEn ? 'We have sent a 6-digit verification code to your registered WhatsApp ' : 'Kami telah mengirimkan kode verifikasi 6 digit ke WhatsApp terdaftar '}
                    <span className="font-semibold text-gray-800 font-mono">{maskedPhone}</span>.
                </p>
            </div>

            {status && (
                <div className="mb-4 text-xs font-medium text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-200 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{status}</span>
                </div>
            )}

            {isExpired && (
                <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <div>
                        <p className="font-semibold text-amber-900">
                            {isEn ? 'OTP Code Expired' : 'Kode OTP Kedaluwarsa'}
                        </p>
                        <p className="mt-0.5">
                            {isEn ? (
                                <>This code has timed out. Click <strong>Resend OTP</strong> to request a new code.</>
                            ) : (
                                <>Batas waktu kode telah habis. Klik <strong>Kirim Ulang OTP</strong> untuk mendapatkan kode baru.</>
                            )}
                        </p>
                    </div>
                </div>
            )}

            <form onSubmit={submit} className="space-y-4">
                <div>
                    <div className="flex items-center justify-between">
                        <InputLabel htmlFor="otp" value={isEn ? 'OTP Code (6 Digits)' : 'Kode OTP (6 Digit)'} />
                        <span
                            className={`inline-flex items-center gap-1 text-[11px] font-mono font-semibold ${
                                isExpired ? 'text-rose-600' : 'text-gray-500'
                            }`}
                        >
                            <Clock className="w-3 h-3" />
                            {isExpired ? (isEn ? 'Expired' : 'Kedaluwarsa') : formatTimer(secondsRemaining)}
                        </span>
                    </div>

                    <TextInput
                        id="otp"
                        type="text"
                        name="otp"
                        value={data.otp}
                        className="mt-1.5 block w-full text-center text-2xl font-mono font-bold tracking-[0.45em] py-2.5"
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        isFocused={true}
                        placeholder="••••••"
                        onChange={(e) => setData('otp', e.target.value.replace(/\D/g, '').slice(0, 6))}
                        required
                    />

                    <InputError message={errors.otp || errors.email} className="mt-1.5" />

                    <p className="mt-1.5 text-[11px] text-gray-500">
                        {isEn ? 'Verification attempts left: ' : 'Sisa kesempatan verifikasi: '}
                        <span className="font-semibold text-gray-700">{attemptsRemaining}</span>
                        {isEn ? '' : ' kali.'}
                    </p>
                </div>

                <div className="pt-1">
                    <PrimaryButton
                        className="w-full justify-center py-2.5 bg-indigo-600 hover:bg-indigo-700 shadow-sm"
                        disabled={processing || data.otp.length !== 6 || isExpired}
                    >
                        {processing
                            ? (isEn ? 'Verifying OTP...' : 'Memverifikasi OTP...')
                            : (isEn ? 'Verify & Sign In' : 'Verifikasi & Masuk')}
                    </PrimaryButton>
                </div>
            </form>

            <div className="mt-5 pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending || resendSeconds > 0 || processing}
                    className="inline-flex items-center gap-1.5 font-semibold text-indigo-600 hover:text-indigo-800 disabled:text-gray-400 disabled:cursor-not-allowed transition"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
                    <span>
                        {resending
                            ? (isEn ? 'Resending...' : 'Mengirim Ulang...')
                            : resendSeconds > 0
                            ? (isEn ? `Resend (${resendSeconds}s)` : `Kirim Ulang (${resendSeconds}d)`)
                            : (isEn ? 'Resend OTP' : 'Kirim Ulang OTP')}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={handleCancel}
                    disabled={cancelling || processing}
                    className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800 underline transition"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Switch Account / Back' : 'Ganti Akun / Kembali'}</span>
                </button>
            </div>
        </GuestLayout>
    );
}

