import { useState } from 'react';
import axios from 'axios';
import { 
    X, Shield, ShieldCheck, ShieldAlert, Check, CheckSquare, 
    Loader2, Sparkles, RefreshCw, AlertTriangle, Users
} from 'lucide-react';
import { getDepartmentTheme } from '@/constants/departments';
import { useLeanTheme } from '@/hooks/useLeanTheme';

const PERMISSION_CONFIGS = [
    {
        key: 'can_view_all_departments',
        label: 'Bisa Melihat Semua Departemen',
        desc: 'Jika dimatikan, akun hanya melihat isu terkait departemennya (yang ditugaskan, dilaporkan, atau ditag).',
    },
    {
        key: 'can_manage_issues',
        label: 'Penanganan Isu (Klaim, Pending, Selesai)',
        desc: 'Mengizinkan klaim, pending, dan penyelesaian isu (khusus tugas departemennya sendiri).',
    },
    {
        key: 'can_export_reports',
        label: 'Ekspor Laporan (PDF & Excel)',
        desc: 'Mengizinkan pengunduhan rekap data tiket isu ke format dokumen PDF atau spreadsheet Excel (.xlsx).',
    },
];

export function BatchPermissionsModal({
    isOpen,
    onClose,
    selectedUsers = [],
    onBatchSuccess,
    showToast,
}) {
    const { isDark } = useLeanTheme();
    // Permissions state: mapping key -> true | false | 'keep'
    const [permValues, setPermValues] = useState(() => {
        const initial = {};
        PERMISSION_CONFIGS.forEach(p => {
            initial[p.key] = 'keep'; // 'keep' means do not modify
        });
        return initial;
    });

    const [processing, setProcessing] = useState(false);

    if (!isOpen || selectedUsers.length === 0) return null;

    // Apply quick preset
    const handleApplyPreset = (presetName) => {
        const updated = { ...permValues };

        if (presetName === 'enable_all') {
            PERMISSION_CONFIGS.forEach(p => { updated[p.key] = true; });
        } else if (presetName === 'restrict_dept') {
            // Lock to own department
            updated.can_view_all_departments = false;
            updated.can_manage_issues = true;
            updated.can_export_reports = true;
        } else if (presetName === 'open_dept_only') {
            // Only turn on can_view_all_departments, keep others
            PERMISSION_CONFIGS.forEach(p => { updated[p.key] = 'keep'; });
            updated.can_view_all_departments = true;
        } else if (presetName === 'close_dept_only') {
            // Only turn off can_view_all_departments, keep others
            PERMISSION_CONFIGS.forEach(p => { updated[p.key] = 'keep'; });
            updated.can_view_all_departments = false;
        } else if (presetName === 'reset_all_keep') {
            PERMISSION_CONFIGS.forEach(p => { updated[p.key] = 'keep'; });
        }

        setPermValues(updated);
    };

    const handleTogglePerm = (key) => {
        setPermValues(prev => {
            const current = prev[key];
            let next;
            if (current === 'keep') next = true;
            else if (current === true) next = false;
            else next = 'keep';
            return { ...prev, [key]: next };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Build payload of only modified permissions
        const payloadPerms = {};
        let changeCount = 0;

        PERMISSION_CONFIGS.forEach(p => {
            if (permValues[p.key] !== 'keep') {
                payloadPerms[p.key] = permValues[p.key];
                changeCount++;
            }
        });

        if (changeCount === 0) {
            alert('Silakan pilih minimal satu izin yang ingin diubah (ON atau OFF), atau gunakan Preset Cepat.');
            return;
        }

        setProcessing(true);
        try {
            const res = await axios.post('/api/users/batch-permissions', {
                user_ids: selectedUsers.map(u => u.id),
                permissions: payloadPerms,
            });

            const data = res.data;
            if (data.success) {
                showToast(data.message || `Izin untuk ${data.updated_count} akun berhasil diperbarui.`);
                onBatchSuccess(data.updated_users || []);
                onClose();
            } else {
                showToast(data.message || 'Gagal memperbarui izin massal.', true);
            }
        } catch (err) {
            console.error('Batch permission error:', err);
            showToast('Terjadi kesalahan saat memproses izin akun.', true);
        } finally {
            setProcessing(false);
        }
    };

    const activeChangesCount = Object.values(permValues).filter(v => v !== 'keep').length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
            <div 
                className={`relative w-full max-w-2xl rounded-2xl border p-6 sm:p-7 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200 ${
                    isDark
                        ? 'border-slate-700 bg-slate-900 text-slate-100'
                        : 'border-slate-200 bg-white text-slate-900'
                }`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`flex items-start justify-between gap-4 pb-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
                            isDark
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                        }`}>
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                Kelola Hak Akses Massal ({selectedUsers.length} Akun)
                            </h2>
                            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                Aktifkan atau nonaktifkan hak akses untuk seluruh akun yang sedang dipilih sekaligus.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isDark
                                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Selected Users Chips Preview */}
                <div className="space-y-2">
                    <div className={`flex items-center justify-between text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <span className="font-semibold flex items-center gap-1.5">
                            <Users className={`h-3.5 w-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                            Akun Target Terpilih:
                        </span>
                        <span className={`text-[11px] font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                            {selectedUsers.length} Staf
                        </span>
                    </div>
                    <div className={`flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl border ${
                        isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}>
                        {selectedUsers.map(u => {
                            const deptTheme = u.department ? getDepartmentTheme(u.department) : { bg: '#10b981', text: '#ffffff' };
                            return (
                                <span 
                                    key={u.id}
                                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs border ${
                                        isDark
                                            ? 'bg-slate-800 border-slate-700 text-slate-100'
                                            : 'bg-white border-slate-200 text-slate-800'
                                    }`}
                                >
                                    <span 
                                        className="w-2 h-2 rounded-full" 
                                        style={{ backgroundColor: deptTheme.bg }} 
                                    />
                                    <span className="font-medium truncate max-w-[140px]">{u.staff_name || u.name}</span>
                                    {u.department && (
                                        <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>({u.department})</span>
                                    )}
                                </span>
                            );
                        })}
                    </div>
                </div>

                {/* Quick Presets Bar */}
                <div className="space-y-2">
                    <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        <Sparkles className={`h-3.5 w-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                        Pilihan Cepat (Presets):
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button
                            type="button"
                            onClick={() => handleApplyPreset('close_dept_only')}
                            className={`px-2.5 py-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer shadow-xs ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-300'
                                    : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800'
                            }`}
                        >
                            🔒 Batasi Departemen
                        </button>
                        <button
                            type="button"
                            onClick={() => handleApplyPreset('open_dept_only')}
                            className={`px-2.5 py-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer shadow-xs ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-emerald-400'
                                    : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800'
                            }`}
                        >
                            🌐 Buka Semua Dept
                        </button>
                        <button
                            type="button"
                            onClick={() => handleApplyPreset('enable_all')}
                            className={`px-2.5 py-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer shadow-xs ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-sky-300'
                                    : 'bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-800'
                            }`}
                        >
                            ✅ Nyalakan Semua
                        </button>
                        <button
                            type="button"
                            onClick={() => handleApplyPreset('reset_all_keep')}
                            className={`px-2.5 py-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer shadow-xs ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                                    : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                            }`}
                        >
                            🔄 Reset Pilihan
                        </button>
                    </div>
                </div>

                {/* Permissions Toggles List */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                        {PERMISSION_CONFIGS.map(item => {
                            const val = permValues[item.key];

                            return (
                                <div 
                                    key={item.key}
                                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                                        val === true 
                                            ? isDark ? 'bg-emerald-950/30 border-emerald-500/40' : 'bg-emerald-50 border-emerald-300'
                                            : val === false
                                            ? isDark ? 'bg-rose-950/30 border-rose-500/30' : 'bg-rose-50 border-rose-200'
                                            : isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`font-bold text-xs sm:text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                {item.label}
                                            </span>
                                            {val === true && (
                                                <span className={`px-2 py-0.2 rounded text-[10px] font-extrabold border ${
                                                    isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                }`}>
                                                    AKAN DINYALAKAN (ON)
                                                </span>
                                            )}
                                            {val === false && (
                                                <span className={`px-2 py-0.2 rounded text-[10px] font-extrabold border ${
                                                    isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-rose-100 text-rose-800 border-rose-300'
                                                }`}>
                                                    AKAN DIMATIKAN (OFF)
                                                </span>
                                            )}
                                            {val === 'keep' && (
                                                <span className={`px-2 py-0.2 rounded text-[10px] font-medium border ${
                                                    isDark ? 'bg-white/5 text-slate-400 border-white/10' : 'bg-white text-slate-500 border-slate-200'
                                                }`}>
                                                    TIDAK BERUBAH (KEEP)
                                                </span>
                                            )}
                                        </div>
                                        <p className={`text-[11px] mt-0.5 leading-snug ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                            {item.desc}
                                        </p>
                                    </div>

                                    {/* Action Toggle Button Group */}
                                    <div className={`flex items-center rounded-xl p-1 border shrink-0 ${
                                        isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
                                    }`}>
                                        <button
                                            type="button"
                                            onClick={() => setPermValues(prev => ({ ...prev, [item.key]: true }))}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                                val === true
                                                    ? 'bg-emerald-600 text-white keep-white shadow-xs'
                                                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                                            }`}
                                        >
                                            ON
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPermValues(prev => ({ ...prev, [item.key]: false }))}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                                val === false
                                                    ? 'bg-rose-600 text-white keep-white shadow-xs'
                                                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                                            }`}
                                        >
                                            OFF
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPermValues(prev => ({ ...prev, [item.key]: 'keep' }))}
                                            className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                                val === 'keep'
                                                    ? isDark ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-900'
                                                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                                            }`}
                                            title="Biarkan izin akun tetap seperti sekarang"
                                        >
                                            —
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Bottom Action Footer */}
                    <div className={`pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            {activeChangesCount > 0 ? (
                                <span className={`font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                    {activeChangesCount} jenis izin akan diubah untuk {selectedUsers.length} akun.
                                </span>
                            ) : (
                                <span>Pilih ON atau OFF pada izin yang ingin diubah.</span>
                            )}
                        </div>

                        <div className="flex items-center gap-2.5 w-full sm:w-auto">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={processing}
                                className={`w-1/2 sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                                    isDark
                                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={processing || activeChangesCount === 0}
                                className="w-1/2 sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white keep-white transition-all shadow-md hover:shadow-lg cursor-pointer disabled:opacity-50"
                            >
                                {processing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Check className="h-4 w-4" />
                                )}
                                <span>{processing ? 'Menyimpan...' : `Terapkan ke ${selectedUsers.length} Akun`}</span>
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
