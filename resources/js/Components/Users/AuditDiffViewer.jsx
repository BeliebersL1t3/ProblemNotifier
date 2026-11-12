import React, { useState } from 'react';
import { 
    ArrowRight, User, Mail, Phone, Shield, Building2, Sliders, 
    KeyRound, CheckCircle2, XCircle, Code, Info, Sparkles, 
    RotateCcw, Trash2, Eye, EyeOff
} from 'lucide-react';
import { useLeanTheme } from '@/hooks/useLeanTheme';

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
            return val || '(Kosong)';
        }
    },
    department: { label: 'Departemen', icon: Building2 },
    subdivision: { label: 'Subdivisi', icon: Building2 },
    whatsapp_number: { label: 'Nomor WhatsApp', icon: Phone },
};

const PERMISSION_CONFIG = {
    can_view_all_departments: 'Lihat Semua Departemen',
    can_manage_issues: 'Penanganan Isu (Klaim, Pending, Selesai)',
    can_delete_issues: 'Hapus Isu',
    can_access_analytics: 'Akses Analytics',
    can_access_calendar: 'Akses Kalender Operasional',
    can_sync_google_calendar: 'Sinkronisasi Google Calendar',
    can_export_reports: 'Export Laporan (PDF & Excel)',
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
        try {
            before = JSON.parse(before);
        } catch (e) {
            console.warn('[AuditDiffViewer] Failed parsing before JSON:', e);
        }
    }
    if (typeof after === 'string') {
        try {
            after = JSON.parse(after);
        } catch (e) {
            console.warn('[AuditDiffViewer] Failed parsing after JSON:', e);
        }
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
            // Ignore case-only difference in email addresses (e.g. AntoService@ vs antoservice@)
            if (key === 'email' && String(valBefore).trim().toLowerCase() === String(valAfter).trim().toLowerCase()) {
                return;
            }

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
    const { isDark } = useLeanTheme();
    const [showRaw, setShowRaw] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const changes = log?.changes;
    if (!changes) {
        return (
            <div className={`p-3 text-xs italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
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
                <div className={`p-3 rounded-xl border text-xs space-y-2 ${
                    isDark ? 'bg-slate-900/90 border-emerald-500/30' : 'bg-emerald-50/70 border-emerald-200'
                }`}>
                    <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        <Sparkles className="h-4 w-4" />
                        <span>Pengguna Baru Berhasil Didaftarkan</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                        <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                            <span className={`block text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Email:</span>
                            <span className={`font-mono font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{u.email}</span>
                        </div>
                        <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                            <span className={`block text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Role & Departemen:</span>
                            <span className={`font-semibold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>{u.role} — {u.department || 'Resort'}</span>
                        </div>
                    </div>
                    {activePerms.length > 0 && (
                        <div className="pt-1">
                            <span className={`text-[10px] block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Hak Akses Aktif:</span>
                            <div className="flex flex-wrap gap-1">
                                {activePerms.map((permName, idx) => (
                                    <span key={idx} className={`px-2 py-0.5 rounded text-[10px] border ${
                                        isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    }`}>
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
                <div className={`p-3 rounded-xl border text-xs space-y-2 ${
                    isDark ? 'bg-slate-900/90 border-amber-500/30' : 'bg-amber-50/70 border-amber-200'
                }`}>
                    <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                        <KeyRound className="h-4 w-4" />
                        <span>Reset Password Akun</span>
                    </div>
                    <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Password akun berhasil direset oleh Administrator.
                    </p>
                    {newPass && (
                        <div className={`flex items-center justify-between p-2 rounded-lg border ${
                            isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
                        }`}>
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Sandi Baru:</span>
                                <span className={`font-mono text-xs font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                    {showPassword ? newPass : '••••••••••••'}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className={`p-1 rounded cursor-pointer ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
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

    if (changes.batch || log.action === 'BATCH_PERMISSIONS_UPDATED' || log.action === 'USER_PERMISSIONS_BATCH_UPDATED') {
        const accountCount = changes.account_count || changes.accounts?.length || 0;
        const accounts = changes.accounts || [];
        const permChanges = changes.permission_changes || {};
        const actionApplied = changes.action_applied || 'set';

        return (
            <div className="space-y-3 pt-1">
                <div className={`p-3.5 rounded-xl border text-xs space-y-3 shadow-md ${
                    isDark ? 'bg-slate-900/90 border-emerald-500/30' : 'bg-slate-50 border-emerald-200'
                }`}>
                    <div className={`flex items-center justify-between gap-2 flex-wrap pb-2 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 ${
                                isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                            }`}>
                                <Sliders className="h-4 w-4" />
                            </div>
                            <div>
                                <span className={`font-extrabold text-xs sm:text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    Laporan Perubahan Izin Massal
                                </span>
                                <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Diterapkan serentak untuk {accountCount} akun
                                </p>
                            </div>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white keep-white">
                            {accountCount} AKUN
                        </span>
                    </div>

                    <div className="space-y-1.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                            Izin yang Diubah:
                        </span>
                        {actionApplied === 'reset_default' ? (
                            <div className={`p-2 rounded-lg border text-xs ${
                                isDark ? 'bg-sky-950/30 border-sky-500/30 text-sky-300' : 'bg-sky-50 border-sky-200 text-sky-800'
                            }`}>
                                🔄 Seluruh izin direset kembali ke standar default role akun masing-masing.
                            </div>
                        ) : Object.keys(permChanges).length > 0 ? (
                            <div className="space-y-1.5">
                                {Object.entries(permChanges).map(([permKey, permVal]) => {
                                    const label = PERMISSION_CONFIG[permKey] || permKey;
                                    const isEnabled = Boolean(permVal);
                                    return (
                                        <div 
                                            key={permKey}
                                            className={`p-2 rounded-lg border flex items-center justify-between gap-2 ${
                                                isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
                                            }`}
                                        >
                                            <span className={`text-xs font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{label}</span>
                                            {isEnabled ? (
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                                    isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                                }`}>
                                                    <CheckCircle2 className="h-3 w-3" /> DIAKTIFKAN (ON)
                                                </span>
                                            ) : (
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                                    isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-rose-100 text-rose-800 border-rose-200'
                                                }`}>
                                                    <XCircle className="h-3 w-3" /> DINONAKTIFKAN (OFF)
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                Izin diperbarui secara serentak.
                            </div>
                        )}
                    </div>

                    {accounts.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                Daftar Akun yang Diperbarui ({accounts.length}):
                            </span>
                            <div className={`flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-lg border ${
                                isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-200'
                            }`}>
                                {accounts.map((acc, idx) => (
                                    <span 
                                        key={acc.id || idx}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border ${
                                            isDark ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                                        }`}
                                    >
                                        <span className="font-semibold">{acc.name}</span>
                                        {acc.department && (
                                            <span className={`text-[9px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>({acc.department})</span>
                                        )}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (changes.archived_user || log.action === 'USER_ARCHIVED') {
        return (
            <div className={`p-3 rounded-xl border text-xs space-y-1 ${
                isDark ? 'bg-rose-950/25 border-rose-500/30' : 'bg-rose-50 border-rose-200'
            }`}>
                <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-rose-400' : 'text-rose-700'}`}>
                    <Trash2 className="h-4 w-4" />
                    <span>Akun Dinonaktifkan (Soft Delete)</span>
                </div>
                <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-rose-900/80'}`}>
                    Pengguna dinonaktifkan sementara dan tidak dapat login ke sistem. Seluruh data pelaporan, relasi, dan riwayat tugas tetap terjaga aman.
                </p>
            </div>
        );
    }

    if (changes.restored_user || log.action === 'USER_RESTORED') {
        return (
            <div className={`p-3 rounded-xl border text-xs space-y-1 ${
                isDark ? 'bg-purple-950/25 border-purple-500/30' : 'bg-purple-50 border-purple-200'
            }`}>
                <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-purple-300' : 'text-purple-800'}`}>
                    <RotateCcw className="h-4 w-4" />
                    <span>Akun Berhasil Dipulihkan</span>
                </div>
                <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-purple-900/80'}`}>
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
                <div className={`p-3 rounded-xl border text-center text-xs space-y-1 ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}>
                    <Info className={`h-4 w-4 mx-auto ${isDark ? 'text-emerald-400/70' : 'text-emerald-600'}`} />
                    <p className={`font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Disimpan Tanpa Perubahan Nilai</p>
                    <p className="text-[10px]">Data profil dan seluruh hak akses akun tetap persis sama.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className={`flex items-center justify-between text-[10px] px-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <span>{diffs.length} Perubahan Terdeteksi:</span>
                        <span className="hidden sm:inline">Perbandingan Sebelum & Sesudah</span>
                    </div>

                    <div className="space-y-2">
                        {diffs.map((diff, index) => {
                            const IconComponent = diff.icon || Info;
                            return (
                                <div
                                    key={diff.key || index}
                                    className={`p-3 rounded-xl border transition-all space-y-2 shadow-xs ${
                                        isDark
                                            ? 'bg-slate-950 border-slate-800 hover:border-emerald-500/40'
                                            : 'bg-white border-slate-200 hover:border-emerald-300'
                                    }`}
                                >
                                    {/* Header: Field label */}
                                    <div className={`flex items-center gap-1.5 text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                        <div className={`p-1 rounded-md ${isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
                                            <IconComponent className="h-3 w-3" />
                                        </div>
                                        <span>{diff.label}</span>
                                    </div>

                                    {/* Before & After comparison row */}
                                    {diff.type === 'permission' ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 pt-0.5">
                                            {/* Before */}
                                            <div className={`p-2 rounded-lg border flex flex-col gap-1 ${
                                                isDark ? 'bg-rose-950/20 border-rose-500/20' : 'bg-rose-50 border-rose-200'
                                            }`}>
                                                <span className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-rose-400/80' : 'text-rose-700'}`}>
                                                    Sebelum
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    {diff.beforeBool ? (
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                                            isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                                        }`}>
                                                            <CheckCircle2 className="h-3 w-3" /> Diizinkan (Aktif)
                                                        </span>
                                                    ) : (
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                                            isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-rose-100 text-rose-800 border-rose-200'
                                                        }`}>
                                                            <XCircle className="h-3 w-3" /> Dibatasi (Nonaktif)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Arrow */}
                                            <div className={`flex justify-center items-center ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                                <ArrowRight className="h-4 w-4 rotate-90 sm:rotate-0" />
                                            </div>

                                            {/* After */}
                                            <div className={`p-2 rounded-lg border flex flex-col gap-1 ${
                                                isDark ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'
                                            }`}>
                                                <span className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-emerald-400/80' : 'text-emerald-700'}`}>
                                                    Sesudah
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    {diff.afterBool ? (
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                                            isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                                        }`}>
                                                            <CheckCircle2 className="h-3 w-3" /> Diizinkan (Aktif)
                                                        </span>
                                                    ) : (
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                                            isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-rose-100 text-rose-800 border-rose-200'
                                                        }`}>
                                                            <XCircle className="h-3 w-3" /> Dibatasi (Nonaktif)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 pt-0.5">
                                            {/* Before */}
                                            <div className={`p-2 rounded-lg border flex flex-col gap-0.5 overflow-hidden ${
                                                isDark ? 'bg-rose-950/20 border-rose-500/20' : 'bg-rose-50 border-rose-200'
                                            }`}>
                                                <span className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-rose-400/80' : 'text-rose-700'}`}>
                                                    Sebelum
                                                </span>
                                                <span className={`text-[11px] font-mono line-through truncate ${isDark ? 'text-rose-200' : 'text-rose-800'}`} title={diff.beforeText}>
                                                    {diff.beforeText}
                                                </span>
                                            </div>

                                            {/* Arrow */}
                                            <div className={`flex justify-center items-center ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                                <ArrowRight className="h-4 w-4 rotate-90 sm:rotate-0" />
                                            </div>

                                            {/* After */}
                                            <div className={`p-2 rounded-lg border flex flex-col gap-0.5 overflow-hidden ${
                                                isDark ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'
                                            }`}>
                                                <span className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-emerald-400/80' : 'text-emerald-700'}`}>
                                                    Sesudah
                                                </span>
                                                <span className={`text-[11px] font-mono font-semibold truncate ${isDark ? 'text-emerald-200' : 'text-emerald-800'}`} title={diff.afterText}>
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
                    className={`inline-flex items-center gap-1 text-[10px] transition-colors cursor-pointer ${
                        isDark ? 'text-slate-400 hover:text-emerald-300' : 'text-slate-500 hover:text-emerald-700'
                    }`}
                >
                    <Code className="h-3 w-3" />
                    <span>{showRaw ? 'Sembunyikan JSON Teknis' : 'Lihat Data JSON Mentah'}</span>
                </button>
            </div>

            {showRaw && (
                <div className={`mt-1 p-2.5 rounded-lg border text-[10px] font-mono overflow-x-auto ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-900 border-slate-700 text-slate-100'
                }`}>
                    <pre className="whitespace-pre-wrap leading-relaxed">
                        {JSON.stringify(changes, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
