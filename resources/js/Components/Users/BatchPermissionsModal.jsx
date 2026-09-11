import { useState } from 'react';
import { 
    X, Shield, ShieldCheck, ShieldAlert, Check, CheckSquare, 
    Loader2, Sparkles, RefreshCw, AlertTriangle, Users
} from 'lucide-react';
import { getDepartmentTheme } from '@/constants/departments';

const PERMISSION_CONFIGS = [
    {
        key: 'can_view_all_departments',
        label: 'Bisa Melihat Semua Departemen',
        desc: 'Jika dimatikan, akun hanya melihat isu terkait departemennya (yang ditugaskan, dilaporkan, atau ditag).',
    },
    {
        key: 'can_manage_issues',
        label: 'Bisa Mengedit & Mengklaim Isu',
        desc: 'Mengizinkan klaim, pending, dan penyelesaian isu (khusus tugas departemennya sendiri, bukan seperti admin).',
    },
    {
        key: 'can_delete_issues',
        label: 'Bisa Menghapus Isu (Delete)',
        desc: 'Mengizinkan penghapusan tiket laporan isu secara permanen (hanya tiket yang dibuat oleh departemennya sendiri).',
    },
    {
        key: 'can_access_analytics',
        label: 'Akses Halaman Analytics',
        desc: 'Menampilkan tab analitik visual grafik performa resolusi departemen.',
    },
    {
        key: 'can_access_calendar',
        label: 'Akses Kalender Operasional',
        desc: 'Menampilkan tab kalender jadwal dan timeline kegiatan operasional.',
    },
    {
        key: 'can_export_reports',
        label: 'Ekspor Laporan (CSV / PDF)',
        desc: 'Mengizinkan pengunduhan rekap data tiket isu ke format dokumen.',
    },
    {
        key: 'can_manage_categories',
        label: 'Kelola Kategori Isu (Master)',
        desc: 'Izin tingkat lanjut untuk menambah, mengedit, atau menghapus master kategori resort.',
    },
];

export function BatchPermissionsModal({
    isOpen,
    onClose,
    selectedUsers = [],
    onBatchSuccess,
    showToast,
}) {
    if (!isOpen || selectedUsers.length === 0) return null;

    // Permissions state: mapping key -> true | false | 'keep'
    const [permValues, setPermValues] = useState(() => {
        const initial = {};
        PERMISSION_CONFIGS.forEach(p => {
            initial[p.key] = 'keep'; // 'keep' means do not modify
        });
        return initial;
    });

    const [processing, setProcessing] = useState(false);

    // Apply quick preset
    const handleApplyPreset = (presetName) => {
        const updated = { ...permValues };

        if (presetName === 'enable_all') {
            PERMISSION_CONFIGS.forEach(p => { updated[p.key] = true; });
        } else if (presetName === 'restrict_dept') {
            // Lock to own department & turn off delete
            updated.can_view_all_departments = false;
            updated.can_delete_issues = false;
            updated.can_manage_issues = true;
            updated.can_access_analytics = true;
            updated.can_access_calendar = true;
            updated.can_export_reports = true;
            updated.can_manage_categories = false;
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
            const res = await fetch('/api/users/batch-permissions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
                body: JSON.stringify({
                    user_ids: selectedUsers.map(u => u.id),
                    permissions: payloadPerms,
                }),
            });

            const data = await res.json();
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div 
                className="relative w-full max-w-2xl rounded-2xl border border-[#3B3929] bg-[#1C1B0E] p-6 sm:p-7 shadow-2xl text-[#FAFAFA] space-y-6 animate-in fade-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#3B3929]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#C9AA71]/20 text-[#C9AA71] flex items-center justify-center border border-[#C9AA71]/30 shrink-0">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-extrabold text-[#FAFAFA]">
                                Kelola Hak Akses Massal ({selectedUsers.length} Akun)
                            </h2>
                            <p className="text-xs text-[#A19F8D]">
                                Aktifkan atau nonaktifkan hak akses untuk seluruh akun yang sedang dipilih sekaligus.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-white/5 transition-colors cursor-pointer"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Selected Users Chips Preview */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#A19F8D]">
                        <span className="font-semibold flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-[#C9AA71]" />
                            Akun Target Terpilih:
                        </span>
                        <span className="text-[11px] font-bold text-[#E3D1AA]">
                            {selectedUsers.length} Staf
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl bg-[#2A281E]/60 border border-[#3B3929]/70 custom-scrollbar">
                        {selectedUsers.map(u => {
                            const deptTheme = u.department ? getDepartmentTheme(u.department) : { bg: '#C9AA71', text: '#1C1B0E' };
                            return (
                                <span 
                                    key={u.id}
                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs bg-[#1C1B0E] border border-[#3B3929] text-[#FAFAFA]"
                                >
                                    <span 
                                        className="w-2 h-2 rounded-full" 
                                        style={{ backgroundColor: deptTheme.bg }} 
                                    />
                                    <span className="font-medium truncate max-w-[140px]">{u.staff_name || u.name}</span>
                                    {u.department && (
                                        <span className="text-[10px] text-[#A19F8D]">({u.department})</span>
                                    )}
                                </span>
                            );
                        })}
                    </div>
                </div>

                {/* Quick Presets Bar */}
                <div className="space-y-2">
                    <span className="text-xs font-bold text-[#E3D1AA] uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-[#C9AA71]" />
                        Pilihan Cepat (Presets):
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button
                            type="button"
                            onClick={() => handleApplyPreset('close_dept_only')}
                            className="px-2.5 py-2 rounded-xl text-xs font-bold bg-[#2A281E] hover:bg-[#3B3929] border border-[#3B3929] text-amber-300 hover:text-amber-200 transition-all text-center cursor-pointer shadow-xs"
                        >
                            🔒 Batasi Departemen
                        </button>
                        <button
                            type="button"
                            onClick={() => handleApplyPreset('open_dept_only')}
                            className="px-2.5 py-2 rounded-xl text-xs font-bold bg-[#2A281E] hover:bg-[#3B3929] border border-[#3B3929] text-emerald-400 hover:text-emerald-300 transition-all text-center cursor-pointer shadow-xs"
                        >
                            🌐 Buka Semua Dept
                        </button>
                        <button
                            type="button"
                            onClick={() => handleApplyPreset('enable_all')}
                            className="px-2.5 py-2 rounded-xl text-xs font-bold bg-[#2A281E] hover:bg-[#3B3929] border border-[#3B3929] text-[#E3D1AA] hover:text-[#FAFAFA] transition-all text-center cursor-pointer shadow-xs"
                        >
                            ✅ Nyalakan Semua
                        </button>
                        <button
                            type="button"
                            onClick={() => handleApplyPreset('reset_all_keep')}
                            className="px-2.5 py-2 rounded-xl text-xs font-bold bg-[#2A281E] hover:bg-[#3B3929] border border-[#3B3929] text-[#A19F8D] hover:text-[#FAFAFA] transition-all text-center cursor-pointer shadow-xs"
                        >
                            🔄 Reset Pilihan
                        </button>
                    </div>
                </div>

                {/* Permissions Toggles List */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
                        {PERMISSION_CONFIGS.map(item => {
                            const val = permValues[item.key];

                            return (
                                <div 
                                    key={item.key}
                                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                                        val === true 
                                            ? 'bg-emerald-950/20 border-emerald-500/40' 
                                            : val === false
                                            ? 'bg-red-950/20 border-red-500/30'
                                            : 'bg-[#2A281E]/60 border-[#3B3929]'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-xs sm:text-sm text-[#FAFAFA]">
                                                {item.label}
                                            </span>
                                            {val === true && (
                                                <span className="px-2 py-0.2 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                                    AKAN DINYALAKAN (ON)
                                                </span>
                                            )}
                                            {val === false && (
                                                <span className="px-2 py-0.2 rounded text-[10px] font-extrabold bg-red-500/20 text-red-400 border border-red-500/40">
                                                    AKAN DIMATIKAN (OFF)
                                                </span>
                                            )}
                                            {val === 'keep' && (
                                                <span className="px-2 py-0.2 rounded text-[10px] font-medium bg-white/5 text-[#A19F8D] border border-white/10">
                                                    TIDAK BERUBAH (KEEP)
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-[#A19F8D] mt-0.5 leading-snug">
                                            {item.desc}
                                        </p>
                                    </div>

                                    {/* Action Toggle Button Group */}
                                    <div className="flex items-center rounded-xl bg-[#1C1B0E] p-1 border border-[#3B3929] shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setPermValues(prev => ({ ...prev, [item.key]: true }))}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                                val === true
                                                    ? 'bg-emerald-600 text-white shadow-xs'
                                                    : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                                            }`}
                                        >
                                            ON
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPermValues(prev => ({ ...prev, [item.key]: false }))}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                                val === false
                                                    ? 'bg-red-600 text-white shadow-xs'
                                                    : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                                            }`}
                                        >
                                            OFF
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPermValues(prev => ({ ...prev, [item.key]: 'keep' }))}
                                            className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                                val === 'keep'
                                                    ? 'bg-white/15 text-[#FAFAFA]'
                                                    : 'text-[#A19F8D] hover:text-[#FAFAFA]'
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
                    <div className="pt-4 border-t border-[#3B3929] flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="text-xs text-[#A19F8D]">
                            {activeChangesCount > 0 ? (
                                <span className="text-[#E3D1AA] font-bold">
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
                                className="w-1/2 sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-[#FAFAFA] transition-colors cursor-pointer"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={processing || activeChangesCount === 0}
                                className="w-1/2 sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-[#C9AA71] hover:bg-[#b89960] text-[#1C1B0E] transition-all shadow-md hover:shadow-lg cursor-pointer disabled:opacity-50 hover:scale-[1.02]"
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
