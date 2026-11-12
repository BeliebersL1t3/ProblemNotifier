import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    X, User, Mail, Shield, Building2, KeyRound, Phone,
    Sparkles, Check, AlertCircle, Eye, EyeOff, ShieldAlert,
    ShieldCheck, Lock, Sliders, RefreshCw
} from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { DEPARTMENTS, SUBDEPARTMENTS } from '@/constants/departments';
import { formatToLocalPhone } from '@/utils/phone';
import { useLeanTheme } from '@/hooks/useLeanTheme';

export function UserModal({ isOpen, onClose, user = null, onSaved }) {
    const { isDark } = useLeanTheme();
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
    const [isHod, setIsHod] = useState(false);
    const [hodTitle, setHodTitle] = useState('');

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
            if (user) {
                setName(user.name || '');
                setStaffName(user.staff_name || user.name || '');
                setEmail(user.email || '');
                setWhatsappNumber(user.whatsapp_number || '');
                setRole(user.role || 'department');
                setDepartment(user.department || '');
                setSubdivision(user.subdivision || '');
                setIsHod(Boolean(user.is_hod));
                setHodTitle(user.hod_title || '');
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
                setIsHod(false);
                setHodTitle('');
                setPassword('telunas123');
                setPermissions({
                    can_view_all_departments: false,
                    can_manage_issues: true,
                    can_export_reports: true,
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

    // Calculate restrictions count
    const restrictedKeys = Object.entries(permissions).filter(([, val]) => !val);
    const hasRestrictions = role !== 'admin' && restrictedKeys.length > 0;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage('');

        if (!isEdit && !whatsappNumber.trim()) {
            setErrorMessage('Nomor WhatsApp wajib diisi untuk setiap akun baru.');
            return;
        }

        if (role !== 'admin') {
            if (!department) {
                setErrorMessage('Departemen induk wajib dipilih.');
                setActiveTab('role');
                return;
            }
            if (!isHod && availableSubdivisions.length > 1 && !subdivision.trim()) {
                setErrorMessage(`Staf biasa wajib memilih salah satu unit kerja / subdivisi di bawah departemen ${department}.`);
                setActiveTab('role');
                return;
            }
        }

        setLoading(true);

        const effectiveSubdivision = role === 'admin'
            ? null
            : (availableSubdivisions.length === 1 ? availableSubdivisions[0] : (subdivision || null));

        const payload = {
            name,
            staff_name: staffName || name,
            email,
            role,
            department: role === 'admin' ? null : department,
            subdivision: effectiveSubdivision,
            whatsapp_number: whatsappNumber,
            is_hod: role === 'admin' ? false : isHod,
            hod_title: (role !== 'admin' && isHod) ? hodTitle : null,
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

    // Available subdivisions for current selected department
    const availableSubdivisions = department && SUBDEPARTMENTS[department] ? SUBDEPARTMENTS[department] : [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`relative w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${
                isDark
                    ? 'border-slate-700 bg-slate-900 text-slate-100'
                    : 'border-slate-200 bg-white text-slate-900'
            }`}>

                {/* Modal Header */}
                <div className={`flex items-center justify-between px-6 py-4 border-b ${
                    isDark ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-slate-50/90'
                }`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl border ${
                            isDark
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                        }`}>
                            <User className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {isEdit ? `Edit Akun: ${user.name}` : 'Tambah Akun Pengguna Baru'}
                            </h2>
                            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {isEdit ? 'Ubah kredensial, departemen & matriks izin akun' : 'Buat akun staf baru dengan hak akses yang terkonfigurasi'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isDark
                                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/70'
                        }`}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className={`flex border-b px-6 gap-2 text-xs font-bold overflow-x-auto ${
                    isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'
                }`}>
                    <button
                        type="button"
                        onClick={() => setActiveTab('general')}
                        className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                            activeTab === 'general' 
                                ? isDark ? 'border-emerald-500 text-emerald-400' : 'border-emerald-600 text-emerald-700'
                                : isDark ? 'border-transparent text-slate-400 hover:text-white' : 'border-transparent text-slate-500 hover:text-slate-900'
                        }`}
                    >
                        <User className="h-4 w-4" />
                        Profil & Kontak
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('role')}
                        className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                            activeTab === 'role' 
                                ? isDark ? 'border-emerald-500 text-emerald-400' : 'border-emerald-600 text-emerald-700'
                                : isDark ? 'border-transparent text-slate-400 hover:text-white' : 'border-transparent text-slate-500 hover:text-slate-900'
                        }`}
                    >
                        <Building2 className="h-4 w-4" />
                        Role & Departemen
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('permissions')}
                        className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                            activeTab === 'permissions' 
                                ? isDark ? 'border-emerald-500 text-emerald-400' : 'border-emerald-600 text-emerald-700'
                                : isDark ? 'border-transparent text-slate-400 hover:text-white' : 'border-transparent text-slate-500 hover:text-slate-900'
                        }`}
                    >
                        <Sliders className="h-4 w-4" />
                        Hak Akses & Barrier
                        {hasRestrictions && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] border ${
                                isDark
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-amber-100 text-amber-800 border-amber-300'
                            }`}>
                                🚧 {restrictedKeys.length}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('credentials')}
                        className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                            activeTab === 'credentials' 
                                ? isDark ? 'border-emerald-500 text-emerald-400' : 'border-emerald-600 text-emerald-700'
                                : isDark ? 'border-transparent text-slate-400 hover:text-white' : 'border-transparent text-slate-500 hover:text-slate-900'
                        }`}
                    >
                        <KeyRound className="h-4 w-4" />
                        Password
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                    {errorMessage && (
                        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                            isDark
                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                                : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}>
                            <AlertCircle className={`h-4 w-4 shrink-0 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* TAB 1: General Info */}
                    {activeTab === 'general' && (
                        <div className="space-y-4">
                            <div>
                                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    Nama Lengkap Akun *
                                </label>
                                <Input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Contoh: Ratna Dewi"
                                    className={isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}
                                />
                            </div>

                            <div>
                                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    Nama Tampilan Staf (Staff Display Name)
                                </label>
                                <Input
                                    type="text"
                                    value={staffName}
                                    onChange={e => setStaffName(e.target.value)}
                                    placeholder="Contoh: Ratna Procurement"
                                    className={isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}
                                />
                                <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Nama ini yang akan tercatat di log pengerjaan, laporan issue, dan pesan klaim bot WhatsApp.
                                </p>
                            </div>

                            <div>
                                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    Alamat Email Login *
                                </label>
                                <Input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="email@telunasresorts.com"
                                    className={isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}
                                />
                            </div>

                            <div>
                                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    Nomor WhatsApp (Untuk Notifikasi & Perintah Bot)
                                </label>
                                <div className="relative">
                                    <Phone className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                                    <Input
                                        type="text"
                                        value={whatsappNumber}
                                        onChange={e => setWhatsappNumber(formatToLocalPhone(e.target.value))}
                                        placeholder="081234567890"
                                        className={`pl-9 ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                                    />
                                </div>
                                <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Nomor ini otomatis terverifikasi untuk fitur klaim instan (!claim) dan permintaan password (!password).
                                </p>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: Role & Department */}
                    {activeTab === 'role' && (
                        <div className="space-y-4">
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

                            {role !== 'admin' && (
                                <>
                                    <div>
                                        <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
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
                                            className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
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

                                    {availableSubdivisions.length > 0 && (
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <label className={`block text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                                    Subdivisi / Unit Spesifik {availableSubdivisions.length > 1 && !isHod ? (
                                                        <span className={`font-extrabold ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>* (Wajib)</span>
                                                    ) : (isHod ? (
                                                        <span className={`font-normal normal-case ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>(Opsional untuk HOD)</span>
                                                    ) : (
                                                        <span className={`font-normal normal-case ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>(Otomatis)</span>
                                                    ))}
                                                </label>
                                                {availableSubdivisions.length > 1 && !isHod && (
                                                    <span className={`text-[10px] font-medium ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>Wajib pilih unit kerja</span>
                                                )}
                                            </div>

                                            {availableSubdivisions.length === 1 ? (
                                                <div className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs ${
                                                    isDark
                                                        ? 'bg-slate-800/80 border-slate-700 text-white'
                                                        : 'bg-slate-50 border-slate-200 text-slate-900'
                                                }`}>
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                                    <span className="font-semibold">{availableSubdivisions[0]}</span>
                                                    <span className={`text-[10px] italic ml-auto ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>(Unit Tunggal Departemen)</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <select
                                                        value={subdivision}
                                                        onChange={e => setSubdivision(e.target.value)}
                                                        className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-medium focus:outline-none transition-all ${
                                                            !isHod && !subdivision
                                                                ? 'border-amber-500/60 focus:border-amber-400 ring-1 ring-amber-500/30'
                                                                : isDark
                                                                ? 'border-slate-700 focus:border-emerald-500'
                                                                : 'border-slate-300 focus:border-emerald-600'
                                                        } ${isDark ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'}`}
                                                    >
                                                        {isHod ? (
                                                            <option value="">Semua Subdivisi (Seluruh {department})</option>
                                                        ) : (
                                                            <option value="">-- Pilih Unit Spesifik (Wajib) --</option>
                                                        )}
                                                        {availableSubdivisions.map(s => (
                                                            <option key={s} value={s}>{s}</option>
                                                        ))}
                                                    </select>
                                                    <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        {isHod
                                                            ? `Sebagai HOD, Anda dapat memilih "Semua Subdivisi" untuk memegang wewenang seluruh ${department}, atau pilih unit khusus jika diperlukan.`
                                                            : `Staf operasional ${department} wajib ditempatkan pada salah satu unit kerja spesifik.`}
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* HOD Hierarchy Assignment */}
                                    <div className={`p-3.5 rounded-xl border mt-3 space-y-3 ${
                                        isDark ? 'bg-slate-800/70 border-slate-700' : 'bg-slate-50 border-slate-200'
                                    }`}>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className={`text-xs font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                    👑 Head of Department (HOD)
                                                </div>
                                                <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                                    HOD berhak mereview & menyetujui tiket staf dan akun baru di {department || 'departemen ini'}.
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={isHod}
                                                    onChange={e => setIsHod(e.target.checked)}
                                                    className="sr-only peer"
                                                />
                                                <div className={`w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 ${
                                                    isDark ? 'bg-slate-700' : 'bg-slate-300'
                                                }`}></div>
                                            </label>
                                        </div>
                                        {isHod && (
                                            <div className={`pt-2 border-t ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                                                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                                    Gelar / Jabatan HOD (Opsional)
                                                </label>
                                                <Input
                                                    type="text"
                                                    value={hodTitle}
                                                    onChange={e => setHodTitle(e.target.value)}
                                                    placeholder="Contoh: Head of Engineering, HR Manager"
                                                    className={isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* TAB 3: Permissions Matrix & Barrier Control */}
                    {activeTab === 'permissions' && (
                        <div className="space-y-4">
                            <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
                                isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'
                            }`}>
                                <div className="flex items-center gap-2.5">
                                    {hasRestrictions ? (
                                        <div className={`p-2 rounded-lg border ${
                                            isDark ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-amber-100 text-amber-700 border-amber-300'
                                        }`}>
                                            <ShieldAlert className="h-5 w-5" />
                                        </div>
                                    ) : (
                                        <div className={`p-2 rounded-lg border ${
                                            isDark ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                        }`}>
                                            <ShieldCheck className="h-5 w-5" />
                                        </div>
                                    )}
                                    <div>
                                        <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {hasRestrictions ? 'Akun Memiliki Pembatasan Akses (Barrier Aktif)' : 'Akun Memiliki Akses Terbuka Penuh'}
                                        </div>
                                        <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
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
                                        desc: 'Jika dinonaktifkan, akun hanya melihat isu terkait departemennya (yang ditugaskan/assigned, dilaporkan, atau ditag). Isu departemen lain tidak muncul.',
                                    },
                                    {
                                        key: 'can_manage_issues',
                                        label: 'Penanganan Isu (Klaim, Pending, Selesai)',
                                        desc: 'Mengizinkan staf untuk klaim (In Progress), pending, dan menyelesaikan isu (khusus tugas departemennya sendiri).',
                                    },
                                    {
                                        key: 'can_export_reports',
                                        label: 'Bisa Ekspor & Unduh Laporan',
                                        desc: 'Mengizinkan unduh rekap data laporan dalam format PDF & Excel (.xlsx).',
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
                                                        ? 'bg-slate-800/30 border-slate-800 opacity-80 cursor-not-allowed'
                                                        : 'bg-slate-100 border-slate-200 opacity-80 cursor-not-allowed'
                                                    : isDark
                                                    ? 'bg-slate-800/70 border-slate-700 hover:border-slate-500 cursor-pointer'
                                                    : 'bg-white border-slate-200 hover:border-slate-300 cursor-pointer'
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
                                                <div className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{item.desc}</div>
                                            </div>

                                            <div className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
                                                isEnabled ? 'bg-emerald-600' : (isDark ? 'bg-slate-700' : 'bg-slate-300')
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
                                <p className={`text-[11px] italic text-center ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
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
                                    <label className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                        {isEdit ? 'Ubah Password (Kosongkan jika tidak diubah)' : 'Password Akun Baru *'}
                                    </label>
                                    <button
                                        type="button"
                                        onClick={generateRandomPassword}
                                        className={`text-[11px] font-bold hover:underline flex items-center gap-1 cursor-pointer ${
                                            isDark ? 'text-emerald-400' : 'text-emerald-700'
                                        }`}
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
                            </div>

                            <div className={`p-3.5 rounded-xl border space-y-2 ${
                                isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200'
                            }`}>
                                <div className={`flex items-center gap-2 text-xs font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                                    <Lock className="h-4 w-4" />
                                    Pengiriman Kredensial Otomatis (WhatsApp / Email)
                                </div>
                                <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                    Setiap kali akun dibuat atau password diperbarui di sini, sistem akan langsung mengirimkan kredensial login ke <strong>WhatsApp Pribadi (DM)</strong> staf. Apabila nomor WhatsApp belum terdaftar, kredensial otomatis dikirimkan ke <strong>Email</strong> akun tersebut.
                                </p>
                                <p className={`text-[11px] leading-relaxed pt-1 border-t ${
                                    isDark ? 'text-slate-400 border-slate-700' : 'text-slate-500 border-slate-200'
                                }`}>
                                    💡 <em>Staf juga dapat meminta kredensial mereka secara mandiri kapan saja dengan mengetik <strong>!password</strong> ke WhatsApp Bot Telunas.</em>
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Modal Footer */}
                    <div className={`flex items-center justify-between pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
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
                            className="bg-emerald-600 hover:bg-emerald-500 text-white keep-white font-bold px-6 text-xs rounded-xl shadow-md"
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
