import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';

const DEPARTMENTS = [
    'Engineering',
    'Housekeeping',
    'Kitchen',
    'F&B',
    'Guest Relations',
    'Human Resources',
    'IT',
    'Procurement',
    'Finance',
    'Security',
    'Activities',
    'Marine',
    'Operational Excellence',
    'General',
];

export default function Register() {
    const { data, setData, post, processing, errors, reset } = useForm({
        name: '',
        email: '',
        password: '',
        password_confirmation: '',
        department: '',
        subdivision: '',
        whatsapp_number: '',
    });

    const submit = (e) => {
        e.preventDefault();

        post(route('register'), {
            onFinish: () => reset('password', 'password_confirmation'),
        });
    };

    return (
        <GuestLayout>
            <Head title="Pendaftaran Akun Baru" />

            <div className="mb-6">
                <h3 className="text-xl font-bold text-gray-900 tracking-tight">Daftar Akun Baru</h3>
                <p className="text-xs text-gray-500 mt-1">
                    Silakan isi data diri Anda. Akun memerlukan verifikasi HOD & Admin.
                </p>
            </div>

            <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
                <span className="text-base leading-none">ℹ️</span>
                <span>
                    <strong>Penting:</strong> Nomor WhatsApp wajib disertakan untuk keperluan otentikasi tiket & notifikasi dinas resort. Akun akan berstatus <em>menunggu persetujuan</em> setelah didaftarkan.
                </span>
            </div>

            <form onSubmit={submit} className="space-y-3">
                <div>
                    <InputLabel htmlFor="name" value="Nama Lengkap Staf" />
                    <TextInput
                        id="name"
                        name="name"
                        value={data.name}
                        className="mt-1 block w-full text-sm"
                        autoComplete="name"
                        isFocused={true}
                        placeholder="Contoh: Budi Santoso"
                        onChange={(e) => setData('name', e.target.value)}
                        required
                    />
                    <InputError message={errors.name} className="mt-1" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <InputLabel htmlFor="department" value="Departemen" />
                        <select
                            id="department"
                            name="department"
                            value={data.department}
                            className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                            onChange={(e) => setData('department', e.target.value)}
                            required
                        >
                            <option value="">-- Pilih Departemen --</option>
                            {DEPARTMENTS.map((dept) => (
                                <option key={dept} value={dept}>
                                    {dept}
                                </option>
                            ))}
                        </select>
                        <InputError message={errors.department} className="mt-1" />
                    </div>

                    <div>
                        <InputLabel htmlFor="subdivision" value="Subdivisi (Opsional)" />
                        <TextInput
                            id="subdivision"
                            name="subdivision"
                            value={data.subdivision}
                            className="mt-1 block w-full text-sm"
                            placeholder="Contoh: Tekong, Pest Control"
                            onChange={(e) => setData('subdivision', e.target.value)}
                        />
                        <InputError message={errors.subdivision} className="mt-1" />
                    </div>
                </div>

                <div>
                    <InputLabel htmlFor="whatsapp_number" value="Nomor WhatsApp Pribadi (Wajib)" />
                    <div className="relative mt-1">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-gray-500 font-mono">
                            📞
                        </span>
                        <TextInput
                            id="whatsapp_number"
                            name="whatsapp_number"
                            value={data.whatsapp_number}
                            className="block w-full pl-9 text-sm font-mono"
                            placeholder="08123456789 atau 628123456789"
                            onChange={(e) => setData('whatsapp_number', e.target.value)}
                            required
                        />
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400">
                        Nomor ini digunakan untuk interaksi bot WhatsApp Telunas & penerimaan tiket.
                    </p>
                    <InputError message={errors.whatsapp_number} className="mt-1" />
                </div>

                <div>
                    <InputLabel htmlFor="email" value="Email Perusahaan / Pribadi" />
                    <TextInput
                        id="email"
                        type="email"
                        name="email"
                        value={data.email}
                        className="mt-1 block w-full text-sm"
                        autoComplete="username"
                        placeholder="nama@telunasresorts.com"
                        onChange={(e) => setData('email', e.target.value)}
                        required
                    />
                    <InputError message={errors.email} className="mt-1" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <InputLabel htmlFor="password" value="Password" />
                        <TextInput
                            id="password"
                            type="password"
                            name="password"
                            value={data.password}
                            className="mt-1 block w-full text-sm"
                            autoComplete="new-password"
                            onChange={(e) => setData('password', e.target.value)}
                            required
                        />
                        <InputError message={errors.password} className="mt-1" />
                    </div>

                    <div>
                        <InputLabel htmlFor="password_confirmation" value="Konfirmasi Password" />
                        <TextInput
                            id="password_confirmation"
                            type="password"
                            name="password_confirmation"
                            value={data.password_confirmation}
                            className="mt-1 block w-full text-sm"
                            autoComplete="new-password"
                            onChange={(e) => setData('password_confirmation', e.target.value)}
                            required
                        />
                        <InputError message={errors.password_confirmation} className="mt-1" />
                    </div>
                </div>

                <div className="mt-5 flex items-center justify-between pt-2">
                    <Link
                        href={route('login')}
                        className="text-xs text-gray-600 underline hover:text-indigo-600"
                    >
                        Sudah punya akun? Masuk
                    </Link>

                    <PrimaryButton disabled={processing} className="bg-indigo-600 hover:bg-indigo-700">
                        {processing ? 'Mendaftarkan...' : 'Kirim Pendaftaran'}
                    </PrimaryButton>
                </div>
            </form>
        </GuestLayout>
    );
}
