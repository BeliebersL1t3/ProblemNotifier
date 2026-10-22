import Checkbox from '@/Components/Checkbox';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';

export default function Login({ status, canResetPassword }) {
    const { data, setData, post, processing, errors, reset, transform } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    const submit = (e) => {
        e.preventDefault();

        const formEl = e.currentTarget;
        const emailVal = formEl.elements?.namedItem('email')?.value ?? data.email;
        const passwordVal = formEl.elements?.namedItem('password')?.value ?? data.password;

        transform((currentData) => ({
            ...currentData,
            email: (emailVal || '').trim(),
            password: passwordVal || '',
        }));

        post(route('login'), {
            onFinish: () => reset('password'),
        });
    };

    const isPendingOrRejected = errors.email && (errors.email.includes('ditolak') || errors.email.includes('belum aktif') || errors.email.includes('dinonaktifkan'));

    return (
        <GuestLayout>
            <Head title="Masuk — Telunas Issue Tracker" />

            <div className="mb-6">
                <h3 className="text-xl font-bold text-gray-900 tracking-tight">Masuk ke Akun</h3>
                <p className="text-xs text-gray-500 mt-1">
                    Silakan masukkan email dan password akun resort Anda.
                </p>
            </div>

            {status === 'registration-pending' && (
                <div className="mb-5 rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800">
                    <div className="flex items-start gap-2">
                        <span className="text-base">⏳</span>
                        <div>
                            <p className="font-semibold text-emerald-900">Pendaftaran Berhasil Dikirim!</p>
                            <p className="mt-0.5">
                                Permohonan akun Anda saat ini sedang menunggu tinjauan dari <strong>HOD Departemen</strong> dan <strong>Admin</strong>. Anda akan menerima pemberitahuan via WhatsApp dan dapat login setelah akun diaktifkan.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {status && status !== 'registration-pending' && (
                <div className="mb-4 text-xs font-medium text-emerald-600 bg-emerald-50 p-2.5 rounded border border-emerald-200">
                    {status}
                </div>
            )}

            {isPendingOrRejected && (
                <div className="mb-5 rounded-lg bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800">
                    <div className="flex items-start gap-2">
                        <span className="text-base">⚠️</span>
                        <div>
                            <p className="font-semibold text-rose-900">Perhatian Status Akun</p>
                            <p className="mt-0.5">{errors.email}</p>
                        </div>
                    </div>
                </div>
            )}

            <form onSubmit={submit} className="space-y-4">
                <div>
                    <InputLabel htmlFor="email" value="Email" />

                    <TextInput
                        id="email"
                        type="email"
                        name="email"
                        value={data.email}
                        className="mt-1 block w-full text-sm"
                        autoComplete="username"
                        isFocused={true}
                        placeholder="nama@telunasresorts.com"
                        onChange={(e) => setData('email', e.target.value)}
                        required
                    />

                    {!isPendingOrRejected && <InputError message={errors.email} className="mt-1.5" />}
                </div>

                <div>
                    <InputLabel htmlFor="password" value="Password" />

                    <TextInput
                        id="password"
                        type="password"
                        name="password"
                        value={data.password}
                        className="mt-1 block w-full text-sm"
                        autoComplete="current-password"
                        onChange={(e) => setData('password', e.target.value)}
                        required
                    />

                    <InputError message={errors.password} className="mt-1.5" />
                </div>

                <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center cursor-pointer">
                        <Checkbox
                            name="remember"
                            checked={data.remember}
                            onChange={(e) =>
                                setData('remember', e.target.checked)
                            }
                        />
                        <span className="ms-2 text-gray-600">
                            Ingat saya
                        </span>
                    </label>

                    {canResetPassword && (
                        <Link
                            href={route('password.request')}
                            className="text-gray-500 hover:text-indigo-600 underline"
                        >
                            Lupa password?
                        </Link>
                    )}
                </div>

                <div className="pt-2">
                    <PrimaryButton className="w-full justify-center py-2.5 bg-indigo-600 hover:bg-indigo-700 shadow-sm" disabled={processing}>
                        {processing ? 'Memverifikasi...' : 'Masuk ke Dashboard'}
                    </PrimaryButton>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100 text-center">
                    <p className="text-xs text-gray-500">
                        Belum memiliki akun staf?{' '}
                        <Link
                            href={route('register')}
                            className="font-semibold text-indigo-600 hover:text-indigo-800 underline ml-1"
                        >
                            Daftar di sini
                        </Link>
                    </p>
                </div>

                {/* Lean Mode Quick Access for Field Staff */}
                <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
                    <Link
                        href="/lapangan"
                        className="flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-50 border border-emerald-200/80 hover:border-emerald-300 hover:shadow-sm transition-all text-emerald-900 group"
                    >
                        <div className="flex items-center gap-3">
                            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-600 text-white shadow-sm text-base">
                                📱
                            </span>
                            <div className="text-left">
                                <div className="flex items-center gap-1.5">
                                    <p className="text-xs font-bold text-emerald-950">Mode Lapangan</p>
                                    <span className="text-[10px] bg-emerald-200/80 text-emerald-800 font-semibold px-1.5 py-0.2 rounded-full">Uji Coba Cepat</span>
                                </div>
                                <p className="text-[11px] text-emerald-700 mt-0.5">Lapor & monitor tugas kilat (tanpa password)</p>
                            </div>
                        </div>
                        <span className="text-xs font-bold text-emerald-700 group-hover:translate-x-1 transition-transform">
                            Buka &rarr;
                        </span>
                    </Link>
                </div>
            </form>
        </GuestLayout>
    );
}
