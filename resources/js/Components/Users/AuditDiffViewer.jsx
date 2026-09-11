import React, { useState } from 'react';
import { 
    ArrowRight, User, Mail, Phone, Shield, Building2, Sliders, 
    KeyRound, CheckCircle2, XCircle, Code, Info, Sparkles, 
    RotateCcw, Trash2, Eye, EyeOff
} from 'lucide-react';

const FIELD_CONFIG = {
    name: { label: 'Nama Akun', icon: User },
    staff_name: { label: 'Nama Staf', icon: User },
    email: { label: 'Alamat Email', icon: Mail },
    role: { 
        label: 'Peran (Role)', 
        icon: Shield,
        format: (val) => {
            if (val === 'admin') return 'Administrator';
            if (val === 'department') return 'Departemen';
            if (val === 'viewer') return 'Peninjau (Viewer)';
            return val || '(Kosong)';
        }
    },
    department: { label: 'Departemen', icon: Building2 },
    subdivision: { label: 'Subdivisi', icon: Building2 },
    whatsapp_number: { label: 'Nomor WhatsApp', icon: Phone },
};

const PERMISSION_CONFIG = {
    can_view_all_departments: 'Lihat Semua Departemen',
    can_manage_issues: 'Kelola & Edit Isu',
    can_delete_issues: 'Hapus Isu',
    can_access_analytics: 'Akses Analytics',
    can_access_calendar: 'Akses Kalender Operasional',
    can_export_reports: 'Export Laporan Excel/PDF',
    can_manage_categories: 'Kelola Kategori Isu',
};

/**
 * Extract what specifically changed between before and after states
 */
export function extractDifferences(changes) {
    if (!changes || typeof changes !== 'object') return [];
    
    let before = changes.before;
    let after = changes.after;

    if (typeof before === 'string') {
        try { before = JSON.parse(before); } catch (e) { /* ignore */ }
    }
    if (typeof after === 'string') {
        try { after = JSON.parse(after); } catch (e) { /* ignore */ }
    }

    if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
        return [];
    }

    const diffs = [];

    // 1. Profile / Top-level fields
    Object.keys(FIELD_CONFIG).forEach(key => {
        const config = FIELD_CONFIG[key];
        const valBefore = before[key] ?? '';
        const valAfter = after[key] ?? '';

        if (String(valBefore).trim() !== String(valAfter).trim()) {
            diffs.push({
                key,
                type: 'field',
                label: config.label,
                icon: config.icon,
                beforeText: config.format ? config.format(valBefore) : (valBefore || '(Kosong)'),
                afterText: config.format ? config.format(valAfter) : (valAfter || '(Kosong)'),
            });
        }
    });

    // 2. Permissions comparison
    const permBefore = before.permissions || {};
    const permAfter = after.permissions || {};

    // Get all permission keys from config + any extra in before/after
    const allPermKeys = Array.from(new Set([
        ...Object.keys(PERMISSION_CONFIG),
        ...Object.keys(permBefore),
        ...Object.keys(permAfter),
    ]));

    allPermKeys.forEach(permKey => {
        const pBefore = Boolean(permBefore[permKey]);
        const pAfter = Boolean(permAfter[permKey]);

        if (pBefore !== pAfter) {
            diffs.push({
                key: permKey,
                type: 'permission',
                label: PERMISSION_CONFIG[permKey] || `Izin: ${permKey.replace(/_/g, ' ')}`,
                icon: Sliders,
                beforeBool: pBefore,
                afterBool: pAfter,
            });
        }
    });

    // 3. Password changed flag
    if (after.password_reset === true) {
        diffs.push({
            key: 'password_reset',
            type: 'password',
            label: 'Password Akun',
            icon: KeyRound,
            beforeText: '(Password sebelumnya)',
            afterText: 'Password baru telah disimpan',
        });
    }

    // 4. Any other custom fields that changed
    const handledKeys = new Set([...Object.keys(FIELD_CONFIG), 'permissions', 'password_reset', 'updated_at']);
    Object.keys(after).forEach(key => {
        if (!handledKeys.has(key)) {
            const rawBefore = JSON.stringify(before[key] ?? null);
            const rawAfter = JSON.stringify(after[key] ?? null);
            if (rawBefore !== rawAfter) {
                diffs.push({
                    key,
                    type: 'field',
                    label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    icon: Info,
                    beforeText: String(before[key] ?? '(Kosong)'),
                    afterText: String(after[key] ?? '(Kosong)'),
                });
            }
        }
    });

    return diffs;
}

export function AuditDiffViewer({ log }) {
    const [showRaw, setShowRaw] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const changes = log?.changes;
    if (!changes) {
        return (
            <div className="p-3 text-xs text-[#A19F8D] italic">
                Tidak ada data rincian untuk aktivitas ini.
            </div>
        );
    }

    // Special cases: Created, Reset Password, Archived, Restored
    if (changes.created_user) {
        const u = changes.created_user;
        const perms = u.permissions || {};
        const activePerms = Object.entries(perms)
            .filter(([_, enabled]) => Boolean(enabled))
            .map(([k]) => PERMISSION_CONFIG[k] || k);

        return (
            <div className="space-y-3 pt-1">
                <div className="p-3 rounded-xl bg-[#232218] border border-emerald-500/20 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                        <Sparkles className="h-4 w-4" />
                        <span>Pengguna Baru Berhasil Didaftarkan</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                        <div className="p-2 rounded-lg bg-[#1C1B0E] border border-[#3B3929]">
                            <span className="text-[#A19F8D] block text-[10px]">Email:</span>
                            <span className="font-mono text-[#FAFAFA] font-medium">{u.email}</span>
                        </div>
                        <div className="p-2 rounded-lg bg-[#1C1B0E] border border-[#3B3929]">
                            <span className="text-[#A19F8D] block text-[10px]">Role & Departemen:</span>
                            <span className="text-[#E3D1AA] font-semibold">{u.role} — {u.department || 'Resort'}</span>
                        </div>
                    </div>
                    {activePerms.length > 0 && (
                        <div className="pt-1">
                            <span className="text-[10px] text-[#A19F8D] block mb-1">Hak Akses Aktif:</span>
                            <div className="flex flex-wrap gap-1">
                                {activePerms.map((permName, idx) => (
                                    <span key={idx} className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                        ✓ {permName}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (changes.reset_to || log.action === 'PASSWORD_RESET') {
        const newPass = changes.reset_to;
        return (
            <div className="space-y-3 pt-1">
                <div className="p-3 rounded-xl bg-[#232218] border border-amber-500/20 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                        <KeyRound className="h-4 w-4" />
                        <span>Reset Password Akun</span>
                    </div>
                    <p className="text-[11px] text-[#A19F8D]">
                        Password akun berhasil direset oleh Administrator.
                    </p>
                    {newPass && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-[#1C1B0E] border border-[#3B3929]">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[#A19F8D]">Sandi Baru:</span>
                                <span className="font-mono text-xs text-[#E3D1AA] font-bold">
                                    {showPassword ? newPass : '••••••••••••'}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="p-1 rounded text-[#A19F8D] hover:text-[#FAFAFA]"
                                title={showPassword ? 'Sembunyikan' : 'Tampilkan'}
                            >
                                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (changes.archived_user || log.action === 'USER_ARCHIVED') {
        return (
            <div className="p-3 rounded-xl bg-[#232218] border border-red-500/20 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-red-400 font-bold">
                    <Trash2 className="h-4 w-4" />
                    <span>Akun Dinonaktifkan (Soft Delete)</span>
                </div>
                <p className="text-[11px] text-[#A19F8D] leading-relaxed">
                    Pengguna dinonaktifkan sementara dan tidak dapat login ke sistem. Seluruh data pelaporan, relasi, dan riwayat tugas tetap terjaga aman.
                </p>
            </div>
        );
    }

    if (changes.restored_user || log.action === 'USER_RESTORED') {
        return (
            <div className="p-3 rounded-xl bg-[#232218] border border-purple-500/20 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-purple-300 font-bold">
                    <RotateCcw className="h-4 w-4" />
                    <span>Akun Berhasil Dipulihkan</span>
                </div>
                <p className="text-[11px] text-[#A19F8D] leading-relaxed">
                    Pengguna telah dikembalikan ke daftar staf aktif dan dapat kembali login serta mengakses sistem sesuai izinnya.
                </p>
            </div>
        );
    }

    // Standard Diff comparison (before & after)
    const diffs = extractDifferences(changes);

    return (
        <div className="space-y-2 pt-1">
            {diffs.length === 0 ? (
                <div className="p-3 rounded-xl bg-[#1C1B0E] border border-[#3B3929] text-center text-xs text-[#A19F8D] space-y-1">
                    <Info className="h-4 w-4 mx-auto text-[#C9AA71]/70" />
                    <p className="text-[#E3D1AA] font-medium">Disimpan Tanpa Perubahan Nilai</p>
                    <p className="text-[10px]">Data profil dan seluruh hak akses akun tetap persis sama.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-[#A19F8D] px-1 font-medium">
                        <span>{diffs.length} Perubahan Terdeteksi:</span>
                        <span className="hidden sm:inline">Perbandingan Sebelum & Sesudah</span>
                    </div>

                    <div className="space-y-2">
                        {diffs.map((diff, index) => {
                            const IconComponent = diff.icon || Info;
                            return (
                                <div
                                    key={diff.key || index}
                                    className="p-3 rounded-xl bg-[#1C1B0E] border border-[#3B3929] hover:border-[#C9AA71]/40 transition-all space-y-2 shadow-sm"
                                >
                                    {/* Header: Field label */}
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#E3D1AA]">
                                        <div className="p-1 rounded-md bg-[#C9AA71]/15 text-[#C9AA71]">
                                            <IconComponent className="h-3 w-3" />
                                        </div>
                                        <span>{diff.label}</span>
                                    </div>

                                    {/* Before & After comparison row */}
                                    {diff.type === 'permission' ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 pt-0.5">
                                            {/* Before */}
                                            <div className="p-2 rounded-lg bg-red-950/20 border border-red-500/20 flex flex-col gap-1">
                                                <span className="text-[9px] font-bold text-red-400/80 uppercase tracking-wider">
                                                    Sebelum
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    {diff.beforeBool ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                                            <CheckCircle2 className="h-3 w-3" /> Diizinkan (Aktif)
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                                                            <XCircle className="h-3 w-3" /> Dibatasi (Nonaktif)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Arrow */}
                                            <div className="flex justify-center items-center text-[#C9AA71]">
                                                <ArrowRight className="h-4 w-4 rotate-90 sm:rotate-0" />
                                            </div>

                                            {/* After */}
                                            <div className="p-2 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex flex-col gap-1">
                                                <span className="text-[9px] font-bold text-emerald-400/80 uppercase tracking-wider">
                                                    Sesudah
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    {diff.afterBool ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                                            <CheckCircle2 className="h-3 w-3" /> Diizinkan (Aktif)
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                                                            <XCircle className="h-3 w-3" /> Dibatasi (Nonaktif)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 pt-0.5">
                                            {/* Before */}
                                            <div className="p-2 rounded-lg bg-red-950/20 border border-red-500/20 flex flex-col gap-0.5 overflow-hidden">
                                                <span className="text-[9px] font-bold text-red-400/80 uppercase tracking-wider">
                                                    Sebelum
                                                </span>
                                                <span className="text-[11px] font-mono text-red-200 line-through truncate" title={diff.beforeText}>
                                                    {diff.beforeText}
                                                </span>
                                            </div>

                                            {/* Arrow */}
                                            <div className="flex justify-center items-center text-[#C9AA71]">
                                                <ArrowRight className="h-4 w-4 rotate-90 sm:rotate-0" />
                                            </div>

                                            {/* After */}
                                            <div className="p-2 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex flex-col gap-0.5 overflow-hidden">
                                                <span className="text-[9px] font-bold text-emerald-400/80 uppercase tracking-wider">
                                                    Sesudah
                                                </span>
                                                <span className="text-[11px] font-mono text-emerald-200 font-semibold truncate" title={diff.afterText}>
                                                    {diff.afterText}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Optional Raw JSON view toggle for advanced debugging */}
            <div className="pt-1 text-right">
                <button
                    type="button"
                    onClick={() => setShowRaw(!showRaw)}
                    className="inline-flex items-center gap-1 text-[10px] text-[#A19F8D] hover:text-[#C9AA71] transition-colors cursor-pointer"
                >
                    <Code className="h-3 w-3" />
                    <span>{showRaw ? 'Sembunyikan JSON Teknis' : 'Lihat Data JSON Mentah'}</span>
                </button>
            </div>

            {showRaw && (
                <div className="mt-1 p-2.5 rounded-lg bg-black/60 border border-[#3B3929] text-[10px] font-mono text-[#E3D1AA] overflow-x-auto">
                    <pre className="whitespace-pre-wrap leading-relaxed">
                        {JSON.stringify(changes, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
