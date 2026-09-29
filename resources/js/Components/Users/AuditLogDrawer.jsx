import { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Shield, Clock, User, AlertCircle, RefreshCw, ChevronDown, ChevronRight, Activity, FileSpreadsheet, ExternalLink, CheckCircle2 } from 'lucide-react';
import { AuditDiffViewer, extractDifferences } from './AuditDiffViewer';

export function AuditLogDrawer({ isOpen, onClose }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [spreadsheetUrl, setSpreadsheetUrl] = useState('https://docs.google.com/spreadsheets/d/11FJllelJdd37tR9dUnCawgU1iycm6bQOLMgHM2t-z84/edit?usp=sharing');
    const [syncingSheet, setSyncingSheet] = useState(false);
    const [syncFeedback, setSyncFeedback] = useState(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/user-audit-logs');
            const data = res.data;
            if (data.success) {
                setLogs(data.data || []);
                if (data.spreadsheet_url) {
                    setSpreadsheetUrl(data.spreadsheet_url);
                }
            }
        } catch (e) {
            console.error('Failed to fetch audit logs:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncSheet = async () => {
        setSyncingSheet(true);
        setSyncFeedback(null);
        try {
            const res = await axios.post('/api/user-audit-logs/sync-sheet');
            if (res.data?.success) {
                setSyncFeedback({ success: true, message: res.data.message || 'Berhasil menyinkronkan data ke Google Spreadsheet.' });
                if (res.data.spreadsheet_url) {
                    setSpreadsheetUrl(res.data.spreadsheet_url);
                }
                fetchLogs();
            } else {
                setSyncFeedback({ success: false, message: res.data?.message || 'Gagal menyinkronkan data' });
            }
        } catch (e) {
            setSyncFeedback({ success: false, message: e.response?.data?.message || 'Terjadi kesalahan sistem saat sinkronisasi' });
        } finally {
            setSyncingSheet(false);
            setTimeout(() => setSyncFeedback(null), 5000);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchLogs();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const getActionBadge = (log) => {
        const action = log?.action;
        switch (action) {
            case 'USER_CREATED':
                return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">User Baru</span>;
            case 'PASSWORD_RESET':
                return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Reset Password</span>;
            case 'USER_ARCHIVED':
                return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">Di-Archive (Soft Delete)</span>;
            case 'USER_RESTORED':
                return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">Dipulihkan</span>;
            case 'BATCH_PERMISSIONS_UPDATED':
            case 'USER_PERMISSIONS_BATCH_UPDATED':
                return (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#C9AA71]/20 text-[#E3D1AA] border border-[#C9AA71]/40 flex items-center gap-1 shadow-xs">
                        <span>Izin Massal</span>
                        {log?.changes?.account_count && (
                            <span className="px-1.5 py-0.2 rounded bg-[#C9AA71] text-[#1C1B0E] font-black text-[9px]">
                                {log.changes.account_count} Akun
                            </span>
                        )}
                    </span>
                );
            case 'PERMISSIONS_UPDATED':
                return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">Izin Diubah</span>;
            case 'USER_UPDATED': {
                const diffs = extractDifferences(log?.changes);
                const hasPerms = diffs.some(d => d.type === 'permission');
                const hasFields = diffs.some(d => d.type === 'field');
                const hasPass = diffs.some(d => d.type === 'password');

                if (hasPerms && !hasFields && !hasPass) {
                    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">Izin Diubah</span>;
                }
                if (hasFields && !hasPerms && !hasPass) {
                    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">Profil Diperbarui</span>;
                }
                if (hasPass && !hasFields && !hasPerms) {
                    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Reset Password</span>;
                }
                if (hasPerms && hasFields) {
                    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Profil & Izin Diubah</span>;
                }
                return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">Data Diperbarui</span>;
            }
            default:
                return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/20 text-gray-300 border border-gray-500/30">{action}</span>;
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="w-full max-w-xl bg-[#1C1B0E] border-l border-[#3B3929] shadow-2xl h-full flex flex-col text-[#FAFAFA] animate-in slide-in-from-right duration-300">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#3B3929] bg-[#2A281E]/80">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-[#C9AA71]/20 text-[#C9AA71] border border-[#C9AA71]/30">
                            <Activity className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-extrabold text-[#FAFAFA]">
                                Riwayat Keamanan & Audit Trail
                            </h2>
                            <p className="text-xs text-[#A19F8D]">
                                Log transparan perubahan hak akses, role, & password akun
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={fetchLogs}
                            disabled={loading}
                            title="Refresh logs"
                            className="p-1.5 rounded-lg text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#3B3929] transition-all"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#3B3929] transition-all"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                    {/* Google Spreadsheet Sync Banner */}
                    <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-[#1C1B0E] to-[#2A281E] border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-md">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0 border border-emerald-500/30">
                                <FileSpreadsheet className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <div className="font-extrabold text-sm text-[#FAFAFA] flex items-center gap-2">
                                    <span>Google Spreadsheet Audit</span>
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/30 text-emerald-300 border border-emerald-500/40">
                                        LIVE SYNC
                                    </span>
                                </div>
                                <p className="text-[11px] text-[#A19F8D] mt-0.5">
                                    Log tersinkronisasi otomatis ke cloud spreadsheet
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <button
                                type="button"
                                onClick={handleSyncSheet}
                                disabled={syncingSheet}
                                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1C1B0E] hover:bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 transition-all cursor-pointer disabled:opacity-50"
                                title="Sinkronkan seluruh data log ke Spreadsheet sekarang"
                            >
                                <RefreshCw className={`h-3.5 w-3.5 ${syncingSheet ? 'animate-spin' : ''}`} />
                                <span>{syncingSheet ? 'Menyinkronkan...' : 'Sync ke Sheet'}</span>
                            </button>

                            <a
                                href={spreadsheetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md hover:shadow-lg transition-all"
                                title="Buka Spreadsheet di Tab Baru"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                                <span>Buka Sheet</span>
                            </a>
                        </div>
                    </div>

                    {/* Feedback Alert */}
                    {syncFeedback && (
                        <div className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200 ${
                            syncFeedback.success 
                                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200' 
                                : 'bg-red-500/20 border-red-500/40 text-red-200'
                        }`}>
                            {syncFeedback.success ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> : <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />}
                            <span>{syncFeedback.message}</span>
                        </div>
                    )}

                    {loading && logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-[#A19F8D]">
                            <RefreshCw className="h-6 w-6 animate-spin text-[#C9AA71] mb-2" />
                            <span className="text-xs">Memuat riwayat aktivitas...</span>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-20 text-[#A19F8D] space-y-2">
                            <Shield className="h-8 w-8 mx-auto text-[#3B3929]" />
                            <p className="text-xs">Belum ada catatan aktivitas keamanan.</p>
                        </div>
                    ) : (
                        logs.map(log => {
                            const isExpanded = expandedId === log.id;
                            return (
                                <div 
                                    key={log.id}
                                    className="rounded-xl border border-[#3B3929] bg-[#2A281E]/60 p-4 space-y-2 transition-all hover:border-[#C9AA71]/40"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {getActionBadge(log)}
                                                <span className="text-xs font-bold text-[#FAFAFA]">
                                                    {log.target_user_name}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-[#A19F8D]">
                                                Oleh Admin: <strong className="text-[#C9AA71]">{log.admin_name}</strong>
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-[11px] text-[#A19F8D] flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {formatDate(log.created_at)}
                                            </div>
                                            {log.ip_address && (
                                                <span className="text-[10px] text-[#A19F8D]/70 font-mono">
                                                    IP: {log.ip_address}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Diff expandable */}
                                    {log.changes && (
                                        <div className="pt-1">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedId(isExpanded ? null : log.id)}
                                                className="text-[11px] text-[#C9AA71] hover:text-[#E3D1AA] transition-colors flex items-center gap-1 font-semibold cursor-pointer"
                                            >
                                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                <span>{isExpanded ? 'Sembunyikan Rincian Perubahan' : 'Lihat Rincian Perubahan'}</span>
                                            </button>

                                            {isExpanded && (
                                                <div className="mt-2.5 animate-in fade-in duration-200">
                                                    <AuditDiffViewer log={log} />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[#3B3929] bg-[#2A281E]/40 text-center text-[11px] text-[#A19F8D]">
                    Log tersimpan secara permanen untuk audit kepatuhan & keamanan resort.
                </div>
            </div>
        </div>
    );
}
