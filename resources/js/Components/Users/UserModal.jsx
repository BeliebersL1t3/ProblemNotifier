import { useState, useEffect } from 'react';
import { 
    X, User, Mail, Shield, Building2, KeyRound, Phone, 
    Sparkles, Check, AlertCircle, Eye, EyeOff, ShieldAlert,
    ShieldCheck, Lock, Sliders, RefreshCw
} from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { DEPARTMENTS, SUBDEPARTMENTS } from '@/constants/departments';

export function UserModal({ isOpen, onClose, user = null, onSaved }) {
    const isEdit = Boolean(user && user.id);

    const [activeTab, setActiveTab] = useState('general'); // 'general' | 'role' | 'permissions' | 'credentials'
    const [name, setName] = useState('');
    const [staffName, setStaffName] = useState('');
    const [email, setEmail] = useState('');
    const [whatsappNumber, setWhatsappNumber] = useState('');
    const [role, setRole] = useState('department');
    const [department, setDepartment] = useState('');
    const [subdivision, setSubdivision] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Granular permissions
    const [permissions, setPermissions] = useState({
        can_view_all_departments: true,
        can_manage_issues: true,
        can_delete_issues: false,
        can_access_analytics: true,
        can_access_calendar: true,
        can_export_reports: true,
        can_manage_categories: false,
    });

    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (isOpen) {
            setErrorMessage('');
            if (user) {
                setName(user.name || '');
                setStaffName(user.staff_name || user.name || '');
                setEmail(user.email || '');
                setWhatsappNumber(user.whatsapp_number || '');
                setRole(user.role || 'department');
                setDepartment(user.department || '');
                setSubdivision(user.subdivision || '');
                setPassword('');
                setPermissions({
                    can_view_all_departments: user.permissions?.can_view_all_departments ?? true,
                    can_manage_issues:        user.permissions?.can_manage_issues ?? true,
                    can_delete_issues:        user.permissions?.can_delete_issues ?? false,
                    can_access_analytics:     user.permissions?.can_access_analytics ?? true,
                    can_access_calendar:      user.permissions?.can_access_calendar ?? true,
                    can_export_reports:       user.permissions?.can_export_reports ?? true,
                    can_manage_categories:    user.permissions?.can_manage_categories ?? false,
                });
            } else {
                setName('');
                setStaffName('');
                setEmail('');
                setWhatsappNumber('');
                setRole('department');
                setDepartment('HR');
                setSubdivision('');
                setPassword('telunas123');
                setPermissions({
                    can_view_all_departments: true,
                    can_manage_issues: true,
                    can_delete_issues: false,
                    can_access_analytics: true,
                    can_access_calendar: true,
                    can_export_reports: true,
                    can_manage_categories: false,
                });
            }
            setActiveTab('general');
        }
    }, [isOpen, user]);

    // Update permission defaults on role change
    const handleRoleChange = (newRole) => {
        setRole(newRole);
        if (newRole === 'admin') {
            setPermissions({
                can_view_all_departments: true,
                can_manage_issues: true,
                can_delete_issues: true,
                can_access_analytics: true,
                can_access_calendar: true,
                can_export_reports: true,
                can_manage_categories: true,
            });
        } else if (newRole === 'viewer') {
            setPermissions({
                can_view_all_departments: true,
                can_manage_issues: false,
                can_delete_issues: false,
                can_access_analytics: true,
                can_access_calendar: true,
                can_export_reports: false,
                can_manage_categories: false,
            });
        } else {
            setPermissions({
                can_view_all_departments: true,
                can_manage_issues: true,
                can_delete_issues: false,
                can_access_analytics: true,
                can_access_calendar: true,
                can_export_reports: true,
                can_manage_categories: false,
            });
        }
    };

    const togglePermission = (key) => {
        setPermissions(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const generateRandomPassword = () => {
        const randNum = Math.floor(100 + Math.random() * 900);
        setPassword(`telunas${randNum}`);
    };

    // Calculate restrictions count
    const restrictedKeys = Object.entries(permissions).filter(([key, val]) => !val && key !== 'can_manage_categories');
    const hasRestrictions = role !== 'admin' && restrictedKeys.length > 0;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage('');
        setLoading(true);

        const payload = {
            name,
            staff_name: staffName || name,
            email,
            role,
            department: role === 'admin' ? null : department,
            subdivision: role === 'admin' ? null : subdivision,
            whatsapp_number: whatsappNumber,
            permissions,
            ...(password ? { password } : {}),
        };

        try {
            const url = isEdit ? `/api/users/${user.id}` : '/api/users';
            const method = isEdit ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || 'Gagal menyimpan akun');
            }

            onSaved?.(data.data);
            onClose();
        } catch (err) {
            setErrorMessage(err.message || 'Terjadi kesalahan sistem');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    // Available subdivisions for current selected department
    const availableSubdivisions = department && SUBDEPARTMENTS[department] ? SUBDEPARTMENTS[department] : [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-2xl rounded-2xl border border-[#3B3929] bg-[#2A281E] shadow-2xl text-[#FAFAFA] flex flex-col max-h-[90vh] overflow-hidden">
                
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#3B3929] bg-[#1C1B0E]/60">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-[#C9AA71]/20 text-[#C9AA71] border border-[#C9AA71]/30">
                            <User className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-extrabold text-[#FAFAFA]">
                                {isEdit ? `Edit Akun: ${user.name}` : 'Tambah Akun Pengguna Baru'}
                            </h2>
                            <p className="text-xs text-[#A19F8D]">
                                {isEdit ? 'Ubah kredensial, departemen & matriks izin akun' : 'Buat akun staf baru dengan hak akses yang terkonfigurasi'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#3B3929] transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b border-[#3B3929] bg-[#1C1B0E]/40 px-6 gap-2 text-xs font-bold overflow-x-auto">
                    <button
                        type="button"
                        onClick={() => setActiveTab('general')}
                        className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                            activeTab === 'general' 
                                ? 'border-[#C9AA71] text-[#C9AA71]' 
                                : 'border-transparent text-[#A19F8D] hover:text-[#FAFAFA]'
                        }`}
                    >
                        <User className="h-4 w-4" />
                        Profil & Kontak
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('role')}
                        className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                            activeTab === 'role' 
                                ? 'border-[#C9AA71] text-[#C9AA71]' 
                                : 'border-transparent text-[#A19F8D] hover:text-[#FAFAFA]'
                        }`}
                    >
                        <Building2 className="h-4 w-4" />
                        Role & Departemen
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('permissions')}
                        className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                            activeTab === 'permissions' 
                                ? 'border-[#C9AA71] text-[#C9AA71]' 
                                : 'border-transparent text-[#A19F8D] hover:text-[#FAFAFA]'
                        }`}
                    >
                        <Sliders className="h-4 w-4" />
                        Hak Akses & Barrier
                        {hasRestrictions && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                🚧 {restrictedKeys.length}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('credentials')}
                        className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                            activeTab === 'credentials' 
                                ? 'border-[#C9AA71] text-[#C9AA71]' 
                                : 'border-transparent text-[#A19F8D] hover:text-[#FAFAFA]'
                        }`}
                    >
                        <KeyRound className="h-4 w-4" />
                        Password
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                    {errorMessage && (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* TAB 1: General Info */}
                    {activeTab === 'general' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-[#A19F8D] uppercase tracking-wider mb-1">
                                    Nama Lengkap Akun *
                                </label>
                                <Input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Contoh: Ratna Dewi"
                                    className="bg-[#1C1B0E] border-[#3B3929] text-[#FAFAFA]"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-[#A19F8D] uppercase tracking-wider mb-1">
                                    Nama Tampilan Staf (Staff Display Name)
                                </label>
                                <Input
                                    type="text"
                                    value={staffName}
                                    onChange={e => setStaffName(e.target.value)}
                                    placeholder="Contoh: Ratna Procurement"
                                    className="bg-[#1C1B0E] border-[#3B3929] text-[#FAFAFA]"
                                />
                                <p className="text-[11px] text-[#A19F8D] mt-1">
                                    Nama ini yang akan tercatat di log pengerjaan, laporan issue, dan pesan klaim bot WhatsApp.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-[#A19F8D] uppercase tracking-wider mb-1">
                                    Alamat Email Login *
                                </label>
                                <Input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="email@telunasresorts.com"
                                    className="bg-[#1C1B0E] border-[#3B3929] text-[#FAFAFA]"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-[#A19F8D] uppercase tracking-wider mb-1">
                                    Nomor WhatsApp (Untuk Notifikasi & Perintah Bot)
                                </label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A19F8D]" />
                                    <Input
                                        type="text"
                                        value={whatsappNumber}
                                        onChange={e => setWhatsappNumber(e.target.value)}
                                        placeholder="08123456789 atau 628123456789"
                                        className="pl-9 bg-[#1C1B0E] border-[#3B3929] text-[#FAFAFA]"
                                    />
                                </div>
                                <p className="text-[11px] text-[#A19F8D] mt-1">
                                    Nomor ini otomatis terverifikasi untuk fitur klaim instan (!claim) dan permintaan password (!password).
                                </p>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: Role & Department */}
                    {activeTab === 'role' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-[#A19F8D] uppercase tracking-wider mb-2">
                                    Peran Akun (Role) *
                                </label>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { id: 'department', title: 'Department', desc: 'Staf operasional departemen', icon: Building2 },
                                        { id: 'admin', title: 'Administrator', desc: 'Akses penuh kelola semua data', icon: ShieldCheck },
                                        { id: 'viewer', title: 'Viewer', desc: 'Hanya melihat tanpa edit/hapus', icon: Eye },
                                    ].map(r => {
                                        const Icon = r.icon;
                                        const isSelected = role === r.id;
                                        return (
                                            <button
                                                key={r.id}
                                                type="button"
                                                onClick={() => handleRoleChange(r.id)}
                                                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                                                    isSelected
                                                        ? 'bg-[#C9AA71]/15 border-[#C9AA71] text-[#FAFAFA] shadow-md ring-1 ring-[#C9AA71]'
                                                        : 'bg-[#1C1B0E]/60 border-[#3B3929] text-[#A19F8D] hover:border-white/20'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <Icon className={`h-4 w-4 ${isSelected ? 'text-[#C9AA71]' : 'text-[#A19F8D]'}`} />
                                                    {isSelected && <Check className="h-3.5 w-3.5 text-[#C9AA71]" />}
                                                </div>
                                                <div className="font-bold text-xs text-[#FAFAFA]">{r.title}</div>
                                                <div className="text-[10px] text-[#A19F8D] mt-0.5 leading-tight">{r.desc}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {role !== 'admin' && (
                                <>
                                    <div>
                                        <label className="block text-xs font-bold text-[#A19F8D] uppercase tracking-wider mb-1">
                                            Departemen Induk *
                                        </label>
                                        <select
                                            value={department}
                                            onChange={e => {
                                                setDepartment(e.target.value);
                                                setSubdivision('');
                                            }}
                                            className="w-full rounded-xl bg-[#1C1B0E] border border-[#3B3929] px-3.5 py-2.5 text-xs font-medium text-[#FAFAFA] focus:border-[#C9AA71] focus:outline-none"
                                        >
                                            <option value="">-- Pilih Departemen --</option>
                                            {DEPARTMENTS.map(d => (
                                                <option key={d} value={d}>{d}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {availableSubdivisions.length > 0 && (
                                        <div>
                                            <label className="block text-xs font-bold text-[#A19F8D] uppercase tracking-wider mb-1">
                                                Subdivisi / Unit Spesifik (Opsional)
                                            </label>
                                            <select
                                                value={subdivision}
                                                onChange={e => setSubdivision(e.target.value)}
                                                className="w-full rounded-xl bg-[#1C1B0E] border border-[#3B3929] px-3.5 py-2.5 text-xs font-medium text-[#FAFAFA] focus:border-[#C9AA71] focus:outline-none"
                                            >
                                                <option value="">Semua Subdivisi ({department})</option>
                                                {availableSubdivisions.map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                            </select>
                                            <p className="text-[11px] text-[#A19F8D] mt-1">
                                                Contoh: Legal / Transportasi di bawah HR, atau Bar / Spa di bawah GR.
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* TAB 3: Permissions Matrix & Barrier Control */}
                    {activeTab === 'permissions' && (
                        <div className="space-y-4">
                            <div className="p-3.5 rounded-xl bg-[#1C1B0E]/60 border border-[#3B3929] flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    {hasRestrictions ? (
                                        <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                            <ShieldAlert className="h-5 w-5" />
                                        </div>
                                    ) : (
                                        <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                            <ShieldCheck className="h-5 w-5" />
                                        </div>
                                    )}
                                    <div>
                                        <div className="text-xs font-bold text-[#FAFAFA]">
                                            {hasRestrictions ? 'Akun Memiliki Pembatasan Akses (Barrier Aktif)' : 'Akun Memiliki Akses Terbuka Penuh'}
                                        </div>
                                        <div className="text-[11px] text-[#A19F8D]">
                                            {hasRestrictions 
                                                ? `${restrictedKeys.length} tindakan dibatasi. Logo barrier 🚧 akan muncul pada akun ini.`
                                                : 'Tidak ada batasan hak akses untuk fitur operasional.'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2.5">
                                {[
                                    {
                                        key: 'can_view_all_departments',
                                        label: 'Bisa Melihat Semua Departemen',
                                        desc: 'Jika dinonaktifkan, akun hanya dapat melihat isu milik departemennya sendiri.',
                                    },
                                    {
                                        key: 'can_manage_issues',
                                        label: 'Bisa Mengedit & Mengklaim Isu',
                                        desc: 'Mengizinkan staf untuk klaim (In Progress), pending, dan menyelesaikan isu.',
                                    },
                                    {
                                        key: 'can_delete_issues',
                                        label: 'Bisa Menghapus Isu (Delete)',
                                        desc: 'Mengizinkan penghapusan tiket laporan isu secara permanen.',
                                    },
                                    {
                                        key: 'can_access_analytics',
                                        label: 'Akses Halaman Analytics',
                                        desc: 'Menampilkan tab analitik visual grafik performa resolusi departemen.',
                                    },
                                    {
                                        key: 'can_access_calendar',
                                        label: 'Akses Kalender Operasional',
                                        desc: 'Menampilkan tab kalender jadwal penugasan resort.',
                                    },
                                    {
                                        key: 'can_export_reports',
                                        label: 'Bisa Ekspor & Unduh Laporan',
                                        desc: 'Mengizinkan unduh data dalam format CSV/Excel untuk rekap bulanan.',
                                    },
                                    {
                                        key: 'can_manage_categories',
                                        label: 'Bisa Kelola Kategori',
                                        desc: 'Mengizinkan menambah atau mengubah kategori masalah resort.',
                                    },
                                ].map(item => {
                                    const isEnabled = Boolean(permissions[item.key]);
                                    return (
                                        <div 
                                            key={item.key}
                                            onClick={() => role !== 'admin' && togglePermission(item.key)}
                                            className={`p-3 rounded-xl border flex items-center justify-between transition-all select-none ${
                                                role === 'admin' 
                                                    ? 'bg-[#1C1B0E]/30 border-[#3B3929]/50 opacity-80 cursor-not-allowed'
                                                    : 'bg-[#1C1B0E]/70 border-[#3B3929] hover:border-white/20 cursor-pointer'
                                            }`}
                                        >
                                            <div className="pr-4">
                                                <div className="text-xs font-bold text-[#FAFAFA] flex items-center gap-1.5">
                                                    {item.label}
                                                    {!isEnabled && role !== 'admin' && (
                                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-normal">
                                                            🚧 Dibatasi
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[11px] text-[#A19F8D] mt-0.5">{item.desc}</div>
                                            </div>

                                            <div className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
                                                isEnabled ? 'bg-[#C9AA71]' : 'bg-[#3B3929]'
                                            }`}>
                                                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                                                    isEnabled ? 'translate-x-5' : 'translate-x-0'
                                                }`} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {role === 'admin' && (
                                <p className="text-[11px] text-[#C9AA71] italic text-center">
                                    * Role Administrator selalu memiliki hak akses penuh untuk seluruh fitur resort.
                                </p>
                            )}
                        </div>
                    )}

                    {/* TAB 4: Credentials */}
                    {activeTab === 'credentials' && (
                        <div className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-bold text-[#A19F8D] uppercase tracking-wider">
                                        {isEdit ? 'Ubah Password (Kosongkan jika tidak diubah)' : 'Password Akun Baru *'}
                                    </label>
                                    <button
                                        type="button"
                                        onClick={generateRandomPassword}
                                        className="text-[11px] font-bold text-[#C9AA71] hover:underline flex items-center gap-1"
                                    >
                                        <Sparkles className="h-3 w-3" />
                                        Generate Password
                                    </button>
                                </div>
                                <div className="relative">
                                    <Input
                                        type={showPassword ? 'text' : 'password'}
                                        required={!isEdit}
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder={isEdit ? 'Masukkan password baru...' : 'Minimal 6 karakter'}
                                        className="pr-10 bg-[#1C1B0E] border-[#3B3929] text-[#FAFAFA]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A19F8D] hover:text-[#FAFAFA]"
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="p-3.5 rounded-xl bg-[#1C1B0E]/80 border border-[#3B3929] space-y-2">
                                <div className="flex items-center gap-2 text-xs font-bold text-[#C9AA71]">
                                    <Lock className="h-4 w-4" />
                                    Integrasi Password WhatsApp Otomatis
                                </div>
                                <p className="text-[11px] text-[#A19F8D] leading-relaxed">
                                    Setiap kali password diatur atau diubah oleh Administrator di sini, sistem secara aman memperbarui database. Jika staf lupa password login Web mereka, mereka cukup mengirim pesan <strong>!password</strong> ke WhatsApp Bot Telunas untuk menerima kredensial mereka kembali via DM rahasia.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Modal Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-[#3B3929]">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#3B3929] transition-all"
                        >
                            Batal
                        </button>
                        <Button
                            type="submit"
                            disabled={loading}
                            className="bg-[#C9AA71] hover:bg-[#b89960] text-[#1C1B0E] font-bold px-6 text-xs rounded-xl shadow-md"
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    Menyimpan...
                                </span>
                            ) : (
                                isEdit ? 'Simpan Perubahan' : 'Buat Akun Sekarang'
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
