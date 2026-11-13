import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    X, User, Mail, Building2, Phone, Sparkles,
    Check, AlertCircle, Eye, EyeOff, ShieldAlert,
    ShieldCheck, Lock, RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { DEPARTMENTS, SUBDEPARTMENTS } from '@/constants/departments';
import { formatToLocalPhone } from '@/utils/phone';
import { useLeanTheme } from '@/hooks/useLeanTheme';

export function UserModal({ isOpen, onClose, user = null, onSaved }) {
    const { isDark } = useLeanTheme();
    const isEdit = Boolean(user && user.id);

    const [name, setName] = useState('');
    const [staffName, setStaffName] = useState('');
    const [email, setEmail] = useState('');
    const [whatsappNumber, setWhatsappNumber] = useState('');
    const [role, setRole] = useState('department');
    const [department, setDepartment] = useState('');
    const [subdivision, setSubdivision] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showAdvancedPermissions, setShowAdvancedPermissions] = useState(false);

    // Granular permissions
    const [permissions, setPermissions] = useState({
        can_view_all_departments: false,
        can_manage_issues: true,
        can_export_reports: true,
    });

    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (isOpen) {
            setErrorMessage('');
            setShowAdvancedPermissions(false);
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
                    can_view_all_departments: user.permissions?.can_view_all_departments ?? (user.role === 'admin'),
                    can_manage_issues: user.permissions?.can_manage_issues ?? true,
                    can_export_reports: user.permissions?.can_export_reports ?? true,
                });
            } else {
                setName('');
                setStaffName('');
                setEmail('');
                setWhatsappNumber('');
                setRole('department');
                setDepartment('HR');
                setSubdivision('');
                const randNum = Math.floor(100 + Math.random() * 900);
                setPassword(`telunas${randNum}`);
                setPermissions({
                    can_view_all_departments: false,
                    can_manage_issues: true,
                    can_export_reports: true,
                });
            }
        }
    }, [isOpen, user]);

    // Update permission defaults on role change
    const handleRoleChange = (newRole) => {
        setRole(newRole);
        if (newRole === 'admin') {
            setPermissions({
                can_view_all_departments: true,
                can_manage_issues: true,
                can_export_reports: true,
            });
        } else {
            setPermissions({
                can_view_all_departments: false,
                can_manage_issues: true,
                can_export_reports: true,
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

    // Quick helper to auto-fill system email from name
    const handleAutoGenerateEmail = () => {
        const baseName = (name || staffName || 'staf').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const autoEmail = baseName ? `${baseName}@telunas.com` : `staf${Math.floor(100 + Math.random() * 900)}@telunas.com`;
        setEmail(autoEmail);
    };

    // Calculate restrictions count
    const restrictedKeys = Object.entries(permissions).filter(([, val]) => !val);
    const hasRestrictions = role !== 'admin' && restrictedKeys.length > 0;

    const availableSubdivisions = department && SUBDEPARTMENTS[department] ? SUBDEPARTMENTS[department] : [];

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage('');

        if (!name.trim()) {
            setErrorMessage('Nama staf wajib diisi.');
            return;
        }

        if (!isEdit && !whatsappNumber.trim()) {
            setErrorMessage('Nomor WhatsApp wajib diisi untuk setiap akun baru.');
            return;
        }

        if (role !== 'admin') {
            if (!department) {
                setErrorMessage('Departemen induk wajib dipilih.');
                return;
            }
            if (availableSubdivisions.length > 1 && !subdivision.trim()) {
                setErrorMessage(`Staf operasional wajib memilih salah satu unit kerja / subdivisi di bawah departemen ${department}.`);
                return;
            }
        }

        setLoading(true);

        const effectiveSubdivision = role === 'admin'
            ? null
            : (availableSubdivisions.length === 1 ? availableSubdivisions[0] : (subdivision || null));

        const payload = {
            name: name.trim(),
            staff_name: (staffName || name).trim(),
            email: email.trim() || undefined,
            role,
            department: role === 'admin' ? null : department,
            subdivision: effectiveSubdivision,
            whatsapp_number: whatsappNumber,
            is_hod: false,
            hod_title: null,
            permissions: isEdit ? { ...(user?.permissions || {}), ...permissions } : permissions,
            ...(password ? { password } : {}),
        };

        try {
            const url = isEdit ? `/api/users/${user.id}` : '/api/users';
            const method = isEdit ? 'put' : 'post';
            const res = await axios[method](url, payload);

            if (!res.data?.success) {
                throw new Error(res.data?.message || 'Gagal menyimpan akun');
            }

            onSaved?.(res.data.data);
            onClose();
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Terjadi kesalahan sistem';
            setErrorMessage(msg);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`relative w-full max-w-xl rounded-2xl border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden liquid-glass-modal ${
                isDark
                    ? 'liquid-glass-dark text-slate-100'
                    : 'liquid-glass-light text-slate-900'
            }`}>
                {/* Modal Header */}
                <div className={`flex items-center justify-between px-6 py-4 border-b ${
                    isDark ? 'border-slate-800' : 'border-slate-200'
                }`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl border ${
                            isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        }`}>
                            <User className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {isEdit ? 'Edit Akun Pengguna' : 'Tambah Akun Pengguna Baru'}
                            </h3>
                            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {isEdit ? 'Perbarui data profil, peran, atau kredensial akun staf.' : 'Buat akun staf baru dengan penempatan kerja & kredensial cepat.'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`p-2 rounded-xl transition-all cursor-pointer ${
                            isDark
                                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Form Body - Single Scrollable Page */}
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">

                        {/* Error Alert */}
                        {errorMessage && (
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 flex items-start gap-2.5 text-xs animate-in fade-in">
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                <div className="font-medium leading-relaxed">{errorMessage}</div>
                            </div>
                        )}

                        {/* 1. SELEKSI ROLE */}
                        <div>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                Peran Akun (Role) *
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { id: 'department', title: 'Department', desc: 'Staf operasional departemen', icon: Building2 },
                                    { id: 'admin', title: 'Administrator', desc: 'Akses penuh kelola semua data', icon: ShieldCheck },
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
                                                    ? isDark
                                                        ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-md ring-1 ring-emerald-500'
                                                        : 'bg-emerald-50 border-emerald-600 text-slate-900 shadow-sm ring-1 ring-emerald-600'
                                                    : isDark
                                                    ? 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-500'
                                                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <Icon className={`h-4 w-4 ${isSelected ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-slate-400' : 'text-slate-500')}`} />
                                                {isSelected && <Check className={`h-3.5 w-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />}
                                            </div>
                                            <div className={`font-bold text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>{r.title}</div>
                                            <div className={`text-[10px] mt-0.5 leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{r.desc}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 2. IDENTITAS & KONTAK */}
                        <div className="space-y-3.5">
                            {/* Nama Lengkap */}
                            <div>
                                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    Nama Lengkap Staf *
                                </label>
                                <div className="relative">
                                    <User className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                                    <Input
                                        type="text"
                                        required
                                        value={name}
                                        onChange={e => {
                                            setName(e.target.value);
                                            setStaffName(e.target.value);
                                        }}
                                        placeholder="cth. Rudi Santoso"
                                        className={`pl-9 ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                                    />
                                </div>
                            </div>

                            {/* Nomor WhatsApp */}
                            <div>
                                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    Nomor WhatsApp {!isEdit && <span className="text-rose-500">*</span>}
                                </label>
                                <div className="relative">
                                    <Phone className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                                    <Input
                                        type="text"
                                        required={!isEdit}
                                        value={whatsappNumber}
                                        onChange={e => setWhatsappNumber(formatToLocalPhone(e.target.value))}
                                        placeholder="081234567890"
                                        className={`pl-9 ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                                    />
                                </div>
                                <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Digunakan untuk notifikasi tugas & verifikasi perintah bot WhatsApp (!claim, !password).
                                </p>
                            </div>

                            {/* Email dengan Tombol Cepat */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className={`block text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                        Email Akun (Login)
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleAutoGenerateEmail}
                                        className={`text-[10px] font-bold hover:underline flex items-center gap-1 cursor-pointer transition-colors ${
                                            isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-700 hover:text-emerald-800'
                                        }`}
                                    >
                                        <Sparkles className="h-3 w-3" />
                                        Gunakan Email Sistem (@telunas.com)
                                    </button>
                                </div>
                                <div className="relative">
                                    <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                                    <Input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="nama@telunas.com atau email pribadi"
                                        className={`pl-9 ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 3. PENEMPATAN DEPARTEMEN & SUBDIVISI (Hanya jika bukan Admin) */}
                        {role !== 'admin' && (
                            <div className={`p-4 rounded-xl border space-y-3.5 ${
                                isDark ? 'bg-slate-800/40 border-slate-700/80' : 'bg-slate-50/80 border-slate-200'
                            }`}>
                                <div className="flex items-center gap-2">
                                    <Building2 className={`h-4 w-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                    <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                        Penempatan Kerja Departemen
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* Departemen */}
                                    <div>
                                        <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                            Departemen Induk *
                                        </label>
                                        <select
                                            value={department}
                                            onChange={e => {
                                                const newDept = e.target.value;
                                                setDepartment(newDept);
                                                const subs = newDept && SUBDEPARTMENTS[newDept] ? SUBDEPARTMENTS[newDept] : [];
                                                if (subs.length === 1) {
                                                    setSubdivision(subs[0]);
                                                } else {
                                                    setSubdivision('');
                                                }
                                            }}
                                            className={`w-full rounded-xl border px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                                                isDark
                                                    ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                                                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                                            }`}
                                        >
                                            <option value="">-- Pilih Departemen --</option>
                                            {DEPARTMENTS.map(d => (
                                                <option key={d} value={d}>{d}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Subdivisi */}
                                    <div>
                                        <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                            Subdivisi / Unit Kerja {availableSubdivisions.length > 1 && <span className="text-rose-500">*</span>}
                                        </label>
                                        {availableSubdivisions.length === 1 ? (
                                            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${
                                                isDark
                                                    ? 'bg-slate-900 border-slate-700 text-white'
                                                    : 'bg-white border-slate-200 text-slate-900'
                                            }`}>
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                                <span className="font-semibold truncate">{availableSubdivisions[0]}</span>
                                                <span className={`text-[10px] italic ml-auto shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                    (Otomatis)
                                                </span>
                                            </div>
                                        ) : (
                                            <select
                                                value={subdivision}
                                                onChange={e => setSubdivision(e.target.value)}
                                                className={`w-full rounded-xl border px-3 py-2 text-xs font-medium focus:outline-none transition-all ${
                                                    !subdivision
                                                        ? 'border-amber-500/60 focus:border-amber-400 ring-1 ring-amber-500/30'
                                                        : isDark
                                                        ? 'border-slate-700 focus:border-emerald-500'
                                                        : 'border-slate-300 focus:border-emerald-600'
                                                } ${isDark ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'}`}
                                            >
                                                <option value="">-- Pilih Unit Kerja --</option>
                                                {availableSubdivisions.map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 4. PASSWORD & KREDENSIAL */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    {isEdit ? 'Ubah Password (Opsional)' : 'Password Akun *'}
                                </label>
                                <button
                                    type="button"
                                    onClick={generateRandomPassword}
                                    className={`text-[10px] font-bold hover:underline flex items-center gap-1 cursor-pointer transition-colors ${
                                        isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-700 hover:text-emerald-800'
                                    }`}
                                >
                                    <Sparkles className="h-3 w-3" />
                                    Acak Password Baru
                                </button>
                            </div>
                            <div className="relative">
                                <Input
                                    type={showPassword ? 'text' : 'password'}
                                    required={!isEdit}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder={isEdit ? 'Kosongkan jika tidak ingin mengubah password...' : 'Minimal 6 karakter'}
                                    className={`pr-10 ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer ${
                                        isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <p className={`text-[11px] mt-1 flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                <Lock className="h-3 w-3 shrink-0" />
                                Kredensial akan langsung dikirimkan ke WhatsApp staf secara otomatis saat akun disimpan.
                            </p>
                        </div>

                        {/* 5. OPSI LANJUTAN: HAK AKSES & BARRIER (COLLAPSIBLE ACCORDION) */}
                        <div className={`rounded-xl border overflow-hidden transition-all ${
                            isDark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-50/50'
                        }`}>
                            <button
                                type="button"
                                onClick={() => setShowAdvancedPermissions(!showAdvancedPermissions)}
                                className={`w-full p-3.5 flex items-center justify-between text-left cursor-pointer transition-colors ${
                                    isDark ? 'hover:bg-slate-800/60' : 'hover:bg-slate-100/80'
                                }`}
                            >
                                <div className="flex items-center gap-2.5">
                                    {hasRestrictions ? (
                                        <div className={`p-1.5 rounded-lg border ${
                                            isDark ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-amber-100 text-amber-700 border-amber-300'
                                        }`}>
                                            <ShieldAlert className="h-4 w-4" />
                                        </div>
                                    ) : (
                                        <div className={`p-1.5 rounded-lg border ${
                                            isDark ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                        }`}>
                                            <ShieldCheck className="h-4 w-4" />
                                        </div>
                                    )}
                                    <div>
                                        <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            Pengaturan Hak Akses Lanjutan
                                        </div>
                                        <div className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {role === 'admin'
                                                ? 'Administrator memiliki hak akses penuh ke seluruh fitur.'
                                                : hasRestrictions
                                                ? `${restrictedKeys.length} tindakan dibatasi (Barrier 🚧 aktif)`
                                                : 'Standar Operasional (Semua izin aktif normal)'}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 text-slate-400">
                                    <span className="text-[10px] font-medium hidden sm:inline">
                                        {showAdvancedPermissions ? 'Sembunyikan' : 'Buka Opsi'}
                                    </span>
                                    {showAdvancedPermissions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </div>
                            </button>

                            {showAdvancedPermissions && (
                                <div className={`p-3.5 border-t space-y-2.5 ${
                                    isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-white'
                                }`}>
                                    {[
                                        {
                                            key: 'can_view_all_departments',
                                            label: 'Bisa Melihat Semua Departemen',
                                            desc: 'Jika dinonaktifkan, akun hanya melihat isu terkait departemennya sendiri. Isu departemen lain tersembunyi.',
                                        },
                                        {
                                            key: 'can_manage_issues',
                                            label: 'Penanganan Isu (Klaim, Pending, Selesai)',
                                            desc: 'Mengizinkan staf untuk klaim (In Progress), pending, dan menyelesaikan isu pada unit kerjanya.',
                                        },
                                        {
                                            key: 'can_export_reports',
                                            label: 'Bisa Ekspor & Unduh Laporan',
                                            desc: 'Mengizinkan unduh rekap data laporan operasional dalam format PDF & Excel (.xlsx).',
                                        },
                                    ].map(item => {
                                        const isEnabled = Boolean(permissions[item.key]);
                                        return (
                                            <div
                                                key={item.key}
                                                onClick={() => role !== 'admin' && togglePermission(item.key)}
                                                className={`p-3 rounded-xl border flex items-center justify-between transition-all select-none ${
                                                    role === 'admin' 
                                                        ? isDark
                                                            ? 'bg-slate-800/30 border-slate-800 opacity-70 cursor-not-allowed'
                                                            : 'bg-slate-100 border-slate-200 opacity-70 cursor-not-allowed'
                                                        : isDark
                                                        ? 'bg-slate-800/70 border-slate-700 hover:border-slate-500 cursor-pointer'
                                                        : 'bg-slate-50 border-slate-200 hover:border-slate-300 cursor-pointer'
                                                }`}
                                            >
                                                <div className="pr-4">
                                                    <div className={`text-xs font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                        {item.label}
                                                        {!isEnabled && role !== 'admin' && (
                                                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${
                                                                isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-800'
                                                            }`}>
                                                                🚧 Dibatasi
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{item.desc}</div>
                                                </div>

                                                <div className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
                                                    isEnabled ? 'bg-emerald-600' : (isDark ? 'bg-slate-700' : 'bg-slate-300')
                                                }`}>
                                                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                                                        isEnabled ? 'translate-x-5' : 'translate-x-0'
                                                    }`} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                    </div>

                    {/* Modal Footer */}
                    <div className={`flex items-center justify-between px-6 py-4 border-t ${
                        isDark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-slate-50/60'
                    }`}>
                        <button
                            type="button"
                            onClick={onClose}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                isDark
                                    ? 'text-slate-300 hover:text-white hover:bg-slate-800'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                        >
                            Batal
                        </button>
                        <Button
                            type="submit"
                            disabled={loading}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white keep-white font-bold px-6 text-xs rounded-xl shadow-md cursor-pointer"
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
