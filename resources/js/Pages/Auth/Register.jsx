import { useState, useRef } from 'react';
import axios from 'axios';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import { DEPARTMENT_SUBDIVISIONS, normalizeDepartment } from '@/constants/departments';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const DEPARTMENT_OPTIONS = [
    { value: 'HR', label: 'HR (Human Resources)' },
    { value: 'GR', label: 'GR (Guest Relations)' },
    { value: 'Engineer', label: 'Engineering / Maintenance' },
    { value: 'Kitchen', label: 'Kitchen (Food & Beverage)' },
    { value: 'HK', label: 'HK (Housekeeping)' },
    { value: 'IT', label: 'IT & Technology' },
    { value: 'Fasilitas', label: 'Fasilitas & Security' },
    { value: 'Procurement', label: 'Procurement & Logistics' },
    { value: 'Finance', label: 'Finance & Accounting' },
    { value: 'Reservasi', label: 'Reservasi, Sales & Marketing' },
    { value: 'OE', label: 'OE (Operational Excellence)' },
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

    const [phoneStatus, setPhoneStatus] = useState('idle'); // 'idle' | 'checking' | 'available' | 'taken'
    const [phoneCheckError, setPhoneCheckError] = useState('');
    const [isCheckingPhone, setIsCheckingPhone] = useState(false);
    const checkTimeoutRef = useRef(null);

    const checkPhoneAvailability = async (phone) => {
        const clean = (phone || '').replace(/[^0-9]/g, '');
        if (clean.length < 9) {
            setPhoneStatus('idle');
            setPhoneCheckError('');
            return;
        }

        setIsCheckingPhone(true);
        try {
            const res = await axios.post('/register/check-phone', { phone });
            if (res.data.available === false) {
                setPhoneStatus('taken');
                setPhoneCheckError(res.data.message || 'Nomor WhatsApp ini sudah terdaftar.');
            } else {
                setPhoneStatus('available');
                setPhoneCheckError('');
            }
        } catch (err) {
            console.error('Failed to check phone availability:', err);
        } finally {
            setIsCheckingPhone(false);
        }
    };

    const handlePhoneChange = (val) => {
        setPhoneStatus('idle');
        setPhoneCheckError('');
        if (checkTimeoutRef.current) {
            clearTimeout(checkTimeoutRef.current);
        }
        const clean = (val || '').replace(/[^0-9]/g, '');
        if (clean.length >= 10) {
            checkTimeoutRef.current = setTimeout(() => {
                checkPhoneAvailability(val);
            }, 600);
        }
    };

    const normDept = normalizeDepartment(data.department);
    const rawSubs = data.department 
        ? (DEPARTMENT_SUBDIVISIONS[normDept] || DEPARTMENT_SUBDIVISIONS[data.department] || [])
        : [];
    const specificSubdivisions = rawSubs.filter(
        s => s.toLowerCase() !== (data.department || '').toLowerCase() && s.toLowerCase() !== normDept.toLowerCase()
    );

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

                <div>
                    <InputLabel htmlFor="department" value="Departemen" />
                    <select
                        id="department"
                        name="department"
                        value={data.department}
                        className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white text-gray-900 font-medium py-2 px-3"
                        onChange={(e) => {
                            const val = e.target.value;
                            setData(prev => ({
                                ...prev,
                                department: val,
                                subdivision: '',
                            }));
                        }}
                        required
                    >
                        <option value="" className="text-gray-500 bg-white">-- Pilih Departemen --</option>
                        {DEPARTMENT_OPTIONS.map((dept) => (
                            <option key={dept.value} value={dept.value} className="text-gray-900 bg-white">
                                {dept.label}
                            </option>
                        ))}
                    </select>
                    <InputError message={errors.department} className="mt-1" />
                </div>

                <div>
                    <InputLabel htmlFor="subdivision" value="Subdivisi (Opsional)" />
                    {specificSubdivisions.length > 0 ? (
                        <select
                            id="subdivision"
                            name="subdivision"
                            value={data.subdivision}
                            className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white text-gray-900 font-medium py-2 px-3"
                            onChange={(e) => setData('subdivision', e.target.value)}
                        >
                            <option value="" className="text-gray-500 bg-white">-- Tanpa Subdivisi Khusus ({data.department}) --</option>
                            {specificSubdivisions.map((sub) => (
                                <option key={sub} value={sub} className="text-gray-900 bg-white">
                                    {sub}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <select
                            id="subdivision"
                            name="subdivision"
                            disabled
                            className="mt-1 block w-full rounded-md border-gray-200 bg-gray-50 text-gray-500 text-sm shadow-sm cursor-not-allowed py-2 px-3"
                        >
                            <option value="" className="text-gray-500 bg-gray-50">
                                {!data.department 
                                    ? '-- Pilih Departemen Dahulu --' 
                                    : `Tidak ada subdivisi khusus (${data.department})`}
                            </option>
                        </select>
                    )}
                    <InputError message={errors.subdivision} className="mt-1" />
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
                            className={`block w-full pl-9 pr-10 text-sm font-mono transition-colors ${
                                phoneStatus === 'taken' || errors.whatsapp_number
                                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500 ring-1 ring-red-500'
                                    : phoneStatus === 'available'
                                    ? 'border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500 ring-1 ring-emerald-500/50'
                                    : ''
                            }`}
                            placeholder="08123456789 atau 628123456789"
                            onChange={(e) => {
                                setData('whatsapp_number', e.target.value);
                                handlePhoneChange(e.target.value);
                            }}
                            onBlur={() => checkPhoneAvailability(data.whatsapp_number)}
                            required
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                            {isCheckingPhone && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
                            {!isCheckingPhone && phoneStatus === 'available' && !errors.whatsapp_number && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            )}
                            {!isCheckingPhone && (phoneStatus === 'taken' || errors.whatsapp_number) && (
                                <AlertCircle className="w-4 h-4 text-red-500" />
                            )}
                        </div>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400">
                        Nomor ini digunakan untuk interaksi bot WhatsApp Telunas & penerimaan tiket.
                    </p>
                    {(phoneCheckError || errors.whatsapp_number) ? (
                        <p className="mt-1 text-xs text-red-600 font-medium flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{phoneCheckError || errors.whatsapp_number}</span>
                        </p>
                    ) : phoneStatus === 'available' ? (
                        <p className="mt-1 text-xs text-emerald-600 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Nomor WhatsApp tersedia.</span>
                        </p>
                    ) : null}
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
