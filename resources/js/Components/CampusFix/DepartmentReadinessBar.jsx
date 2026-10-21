import React, { useState } from 'react';
import axios from 'axios';
import { 
    CheckCircle2, 
    Clock, 
    AlertTriangle, 
    CheckSquare, 
    Loader2, 
    ShieldCheck, 
    Camera, 
    ChevronDown, 
    ChevronUp 
} from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';

export function DepartmentReadinessBar({ 
    issueId, 
    departmentReadiness = [], 
    targetDepartments = [], 
    isLocked = false, 
    onRefresh 
}) {
    const { user, isAdmin } = useAuth();
    const { lang } = useLanguage();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [actionModalType, setActionModalType] = useState(null); // 'solve' | 'pending' | null
    const [actionNote, setActionNote] = useState('');
    const [actionFile, setActionFile] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    const userDept = user?.department || '';
    const userDeptNorm = userDept.toLowerCase().trim();

    // Check if the current user belongs to one of the target departments (or is Admin)
    const isTargetDeptUser = isAdmin || targetDepartments.some(d => d.toLowerCase().trim() === userDeptNorm);

    // Current user's department status
    const myDeptStatus = departmentReadiness.find(d => d.department.toLowerCase().trim() === userDeptNorm) || 
                         (isAdmin && departmentReadiness.length > 0 ? departmentReadiness[0] : null);

    const isMyDeptReady = Boolean(myDeptStatus?.is_ready);
    const isMyDeptSolved = Boolean(myDeptStatus?.is_solved);
    const isMyDeptPending = Boolean(myDeptStatus?.is_pending);

    const handleReady = async () => {
        if (!issueId || isSubmitting) return;
        setIsSubmitting(true);
        setErrorMsg('');
        try {
            await axios.post(`/api/issues/${issueId}/dept-ready`);
            onRefresh?.();
        } catch (err) {
            setErrorMsg(err.response?.data?.message || 'Gagal menandai siap.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleActionSubmit = async (e) => {
        e.preventDefault();
        if (!issueId || isSubmitting) return;

        setIsSubmitting(true);
        setErrorMsg('');

        try {
            const formData = new FormData();
            if (actionModalType === 'pending') {
                if (!actionNote.trim()) {
                    setErrorMsg('Alasan pending wajib diisi.');
                    setIsSubmitting(false);
                    return;
                }
                formData.append('reason', actionNote.trim());
                if (actionFile) formData.append('pendingImage', actionFile);
                await axios.post(`/api/issues/${issueId}/dept-pending`, formData);
            } else if (actionModalType === 'solve') {
                if (actionNote.trim()) formData.append('action_note', actionNote.trim());
                if (actionFile) formData.append('proofImage', actionFile);
                await axios.post(`/api/issues/${issueId}/dept-solve`, formData);
            }

            setActionModalType(null);
            setActionNote('');
            setActionFile(null);
            onRefresh?.();
        } catch (err) {
            setErrorMsg(err.response?.data?.message || 'Gagal memproses aksi.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-[#211F17] border border-[#3B3929] rounded-xl p-4 mb-4 text-[#FAFAFA] shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#3B3929]/70">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#C9AA71]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#C9AA71]">
                        {lang === 'id' ? 'Kesiapan & ACC Antar-Departemen' : 'Multi-Dept Readiness & ACC'}
                    </span>
                </div>
                <span className="text-[11px] text-[#A8A29E]">
                    {lang === 'id' ? 'Progressive Ready: Departemen siap bisa langsung kerja' : 'Progressive Ready: Ready depts can start working'}
                </span>
            </div>

            {/* Department Status Badges */}
            <div className="flex flex-wrap items-center gap-2 pt-3">
                {departmentReadiness.map((deptItem, idx) => {
                    const { department, is_ready, ready_by, is_solved, solved_by, is_pending, pending_by, pending_reason } = deptItem;
                    
                    let badgeStyle = "bg-stone-800/80 border-stone-600/50 text-stone-300";
                    let icon = <Clock className="w-3.5 h-3.5 text-stone-400" />;
                    let label = `${department}: Menunggu Respon`;

                    if (is_solved) {
                        badgeStyle = "bg-emerald-950/60 border-emerald-500/60 text-emerald-300";
                        icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
                        label = `${department}: Selesai ✓ (${solved_by || 'Staff'})`;
                    } else if (is_pending) {
                        badgeStyle = "bg-amber-950/60 border-amber-500/60 text-amber-300";
                        icon = <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
                        label = `${department}: Pending (${pending_by || 'Staff'})`;
                    } else if (is_ready) {
                        badgeStyle = "bg-blue-950/60 border-blue-500/60 text-blue-300";
                        icon = <CheckSquare className="w-3.5 h-3.5 text-blue-400" />;
                        label = `${department}: Siap Kerja ✓ (${ready_by || 'Staff'})`;
                    }

                    return (
                        <div 
                            key={idx} 
                            title={is_pending ? `Alasan: ${pending_reason || '-'}` : label}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium shadow-xs transition-colors ${badgeStyle}`}
                        >
                            {icon}
                            <span>{label}</span>
                        </div>
                    );
                })}
            </div>

            {/* Department Action Controls */}
            {!isLocked && isTargetDeptUser && (
                <div className="mt-3 pt-3 border-t border-[#3B3929]/50 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-stone-300">
                        {lang === 'id' ? `Departemen Anda (${userDept || 'Admin'}):` : `Your Department (${userDept || 'Admin'}):`}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {!isMyDeptReady && !isMyDeptSolved && (
                            <Button
                                size="sm"
                                disabled={isSubmitting}
                                onClick={handleReady}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-8 px-3 gap-1.5"
                            >
                                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5" />}
                                {lang === 'id' ? 'Tandai Dept Siap Dikerjakan' : 'Mark Dept Ready to Work'}
                            </Button>
                        )}

                        {isMyDeptReady && !isMyDeptSolved && (
                            <>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={isSubmitting}
                                    onClick={() => { setActionModalType('pending'); setErrorMsg(''); }}
                                    className="border-amber-600/70 hover:bg-amber-950/40 text-amber-300 text-xs h-8 px-3 gap-1.5"
                                >
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                    {lang === 'id' ? 'Pending Tiket' : 'Mark Pending'}
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={isSubmitting}
                                    onClick={() => { setActionModalType('solve'); setErrorMsg(''); }}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 px-3 gap-1.5"
                                >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    {lang === 'id' ? 'ACC Selesai (Dept)' : 'Confirm Solved (Dept)'}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {errorMsg && (
                <div className="mt-2 text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-md p-2">
                    {errorMsg}
                </div>
            )}

            {/* Action Popup Modal Form for Pending / ACC Selesai */}
            {actionModalType && (
                <div className="mt-3 p-3 bg-[#181711] border border-[#3B3929] rounded-lg">
                    <form onSubmit={handleActionSubmit} className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[#C9AA71]">
                                {actionModalType === 'pending' 
                                    ? (lang === 'id' ? 'Alasan Menunda Tiket (Pending)' : 'Reason for Pending')
                                    : (lang === 'id' ? 'Catatan ACC Penyelesaian Departemen' : 'Resolution Confirmation Notes')}
                            </span>
                            <button 
                                type="button" 
                                onClick={() => setActionModalType(null)} 
                                className="text-xs text-stone-400 hover:text-white"
                            >
                                ✕ {lang === 'id' ? 'Batal' : 'Cancel'}
                            </button>
                        </div>

                        <textarea
                            value={actionNote}
                            onChange={(e) => setActionNote(e.target.value)}
                            rows={2}
                            placeholder={actionModalType === 'pending' ? 'Tuliskan alasan penundaan...' : 'Tuliskan tindakan perbaikan yang telah dilakukan...'}
                            className="w-full bg-[#211F17] border border-[#3B3929] rounded-md p-2 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-[#C9AA71]"
                            required={actionModalType === 'pending'}
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="flex items-center gap-1.5 text-xs text-stone-300 cursor-pointer bg-stone-800/80 hover:bg-stone-700/80 px-2.5 py-1.5 rounded-md border border-stone-600/60">
                                <Camera className="w-3.5 h-3.5 text-[#C9AA71]" />
                                <span>{actionFile ? actionFile.name : (lang === 'id' ? 'Lampirkan Foto' : 'Attach Photo')}</span>
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={(e) => setActionFile(e.target.files?.[0] || null)} 
                                />
                            </label>

                            <Button
                                type="submit"
                                size="sm"
                                disabled={isSubmitting}
                                className={`text-xs h-8 px-4 font-semibold text-white ${
                                    actionModalType === 'pending' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
                                }`}
                            >
                                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                {actionModalType === 'pending' 
                                    ? (lang === 'id' ? 'Konfirmasi Pending' : 'Submit Pending') 
                                    : (lang === 'id' ? 'Konfirmasi ACC Selesai' : 'Submit Solved ACC')}
                            </Button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
