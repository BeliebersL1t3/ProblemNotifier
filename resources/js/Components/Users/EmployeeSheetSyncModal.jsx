import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    FileSpreadsheet, ExternalLink, RefreshCw, CheckCircle2, 
    AlertTriangle, ShieldCheck, KeyRound, X, Save, Users, Info, Upload
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useLeanTheme } from '@/hooks/useLeanTheme';

export function EmployeeSheetSyncModal({ isOpen, onClose, onSyncSuccess }) {
    const { lang } = useLanguage();
    const { isDark } = useLeanTheme();
    const isEn = lang === 'en';

    const [spreadsheetUrl, setSpreadsheetUrl] = useState('');
    const [spreadsheetId, setSpreadsheetId] = useState('');
    const [urlInput, setUrlInput] = useState('');
    const [loadingConfig, setLoadingConfig] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [result, setResult] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);

    // Fetch existing employee spreadsheet config
    useEffect(() => {
        if (!isOpen) return;
        setResult(null);
        setErrorMessage(null);
        setLoadingConfig(true);
        axios.get('/users/employee-sheet-config')
            .then((res) => {
                if (res.data?.success) {
                    setSpreadsheetId(res.data.spreadsheet_id || '');
                    setSpreadsheetUrl(res.data.spreadsheet_url || '');
                    setUrlInput(res.data.spreadsheet_url || res.data.spreadsheet_id || '');
                }
            })
            .catch((err) => {
                console.error('Failed to fetch employee spreadsheet config', err);
            })
            .finally(() => {
                setLoadingConfig(false);
            });
    }, [isOpen]);

    const handleSaveConfig = async (e) => {
        e?.preventDefault();
        const trimmed = urlInput.trim();
        if (!trimmed) {
            setErrorMessage(isEn ? 'Please enter a valid Google Spreadsheet URL or ID.' : 'Harap masukkan URL atau ID Google Spreadsheet yang valid.');
            return;
        }

        setSavingConfig(true);
        setErrorMessage(null);
        try {
            const res = await axios.post('/users/employee-sheet-config', { url: trimmed });
            if (res.data?.success) {
                setSpreadsheetId(res.data.spreadsheet_id);
                setSpreadsheetUrl(res.data.spreadsheet_url);
                setUrlInput(res.data.spreadsheet_url);
            } else {
                setErrorMessage(res.data?.message || 'Gagal menyimpan URL spreadsheet.');
            }
        } catch (err) {
            setErrorMessage(err.response?.data?.message || err.message || 'Gagal menyimpan URL spreadsheet.');
        } finally {
            setSavingConfig(false);
        }
    };

    const handleStartSync = async () => {
        setSyncing(true);
        setErrorMessage(null);
        setResult(null);

        try {
            const payload = {};
            if (urlInput.trim()) {
                payload.spreadsheet_url = urlInput.trim();
            }

            const res = await axios.post('/users/sync-sheet', payload);
            if (res.data?.success) {
                setResult(res.data);
                if (res.data.spreadsheet_url) {
                    setSpreadsheetUrl(res.data.spreadsheet_url);
                }
                if (typeof onSyncSuccess === 'function') {
                    onSyncSuccess(res.data);
                }
            } else {
                setErrorMessage(res.data?.message || (isEn ? 'Sync failed.' : 'Gagal menyinkronkan data.'));
            }
        } catch (err) {
            setErrorMessage(err.response?.data?.message || err.message || (isEn ? 'Sync error occurred.' : 'Terjadi kesalahan sistem saat sinkronisasi.'));
        } finally {
            setSyncing(false);
        }
    };

    const handleExportAll = async () => {
        const confirmMsg = isEn 
            ? 'Place all existing staff accounts into this Google Spreadsheet? (Existing sheet rows will be refreshed).'
            : 'Letakkan seluruh data karyawan saat ini ke dalam Google Spreadsheet ini? (Data baris spreadsheet akan diperbarui).';
        if (!confirm(confirmMsg)) return;

        setExporting(true);
        setErrorMessage(null);
        setResult(null);

        try {
            const payload = {};
            if (urlInput.trim()) {
                payload.spreadsheet_url = urlInput.trim();
            }

            const res = await axios.post('/api/users/export-sheet', payload);
            if (res.data?.success) {
                setResult({
                    message: res.data.message,
                    created: 0,
                    updated: res.data.count,
                    hashed_passwords: 0,
                    errors: [],
                });
            } else {
                setErrorMessage(res.data?.message || 'Gagal meletakkan data karyawan.');
            }
        } catch (err) {
            setErrorMessage(err.response?.data?.message || err.message || 'Gagal meletakkan data ke spreadsheet.');
        } finally {
            setExporting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div 
                className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
                    isDark ? 'bg-slate-900 border-slate-700/80 text-white' : 'bg-white border-slate-200 text-slate-900'
                }`}
            >
                {/* Header */}
                <div className={`px-5 py-4 border-b flex items-center justify-between ${
                    isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-100 bg-slate-50'
                }`}>
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <FileSpreadsheet className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-sm sm:text-base leading-tight">
                                {isEn ? 'Sync Employees from Google Spreadsheet' : 'Sinkronisasi Spreadsheet Karyawan'}
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                                {isEn ? 'Option B: Auto-hash plain text passwords to Bcrypt ($2y$) in sheet' : 'Opsi B: Auto-hash password teks biasa ke Bcrypt ($2y$) di spreadsheet'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-5 overflow-y-auto space-y-4 text-xs">
                    {/* Error Notice */}
                    {errorMessage && (
                        <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 flex items-start gap-2.5">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div className="flex-1 font-medium">{errorMessage}</div>
                        </div>
                    )}

                    {/* Spreadsheet URL Form */}
                    <div className="space-y-1.5">
                        <label className={`block font-bold text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            {isEn ? 'Google Spreadsheet URL or ID' : 'URL atau ID Google Spreadsheet Karyawan'}
                        </label>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={urlInput}
                                    onChange={(e) => setUrlInput(e.target.value)}
                                    placeholder="https://docs.google.com/spreadsheets/d/1.../edit"
                                    disabled={loadingConfig || savingConfig || syncing}
                                    className={`w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono ${
                                        isDark 
                                            ? 'bg-slate-950/80 border-slate-700 text-white placeholder-slate-500 focus:border-emerald-500' 
                                            : 'bg-slate-50 border-slate-300 text-slate-800 placeholder-slate-400 focus:border-emerald-500'
                                    }`}
                                />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={handleSaveConfig}
                                    disabled={savingConfig || syncing}
                                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                    title={isEn ? 'Save configuration' : 'Simpan link spreadsheet'}
                                >
                                    <Save className="w-3.5 h-3.5" />
                                    <span>{savingConfig ? (isEn ? 'Saving...' : 'Menyimpan...') : (isEn ? 'Save' : 'Simpan')}</span>
                                </button>
                                {spreadsheetUrl && (
                                    <a
                                        href={spreadsheetUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        <span>{isEn ? 'Open Sheet' : 'Buka Sheet'}</span>
                                    </a>
                                )}
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400">
                            {isEn 
                                ? 'Ensure the service account bot has Editor access to this spreadsheet.' 
                                : 'Pastikan email bot service account memiliki akses Editor pada spreadsheet ini.'}
                        </p>
                    </div>

                    {/* Column Guide & Security Highlight */}
                    <div className={`p-3.5 rounded-xl border space-y-2 ${
                        isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}>
                        <div className="flex items-center gap-1.5 font-bold text-slate-300">
                            <Info className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{isEn ? 'Column Structure in Tab: "Data Karyawan"' : 'Struktur Kolom Tab: "Data Karyawan"'}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                            <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
                                <span className="font-mono text-emerald-400 font-bold">Kolom A:</span> Nama Lengkap *
                            </div>
                            <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
                                <span className="font-mono text-emerald-400 font-bold">Kolom B:</span> Departemen *
                            </div>
                            <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
                                <span className="font-mono text-emerald-400 font-bold">Kolom C:</span> Nomor WhatsApp
                            </div>
                            <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
                                <span className="font-mono text-emerald-400 font-bold">Kolom D:</span> Email
                            </div>
                            <div className="p-1.5 rounded-lg bg-slate-900/60 border border-emerald-500/40 text-emerald-300">
                                <span className="font-mono font-bold">Kolom E:</span> Password (Auto-Hash)
                            </div>
                            <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
                                <span className="font-mono text-emerald-400 font-bold">Kolom F:</span> Role (Staff / Admin)
                            </div>
                            <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
                                <span className="font-mono text-emerald-400 font-bold">Kolom G:</span> Subdivisi
                            </div>
                            <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
                                <span className="font-mono text-emerald-400 font-bold">Kolom H:</span> Status (Aktif/Nonaktif)
                            </div>
                            <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
                                <span className="font-mono text-emerald-400 font-bold">Kolom I:</span> Status Sinkronisasi
                            </div>
                        </div>
                        <div className="pt-1.5 border-t border-slate-800 text-[10.5px] text-emerald-300/90 flex items-start gap-1.5">
                            <KeyRound className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span>
                                {isEn
                                    ? 'Passwords entered in plain text will be automatically hashed with Bcrypt ($2y$) and overwritten in the spreadsheet for security.'
                                    : 'Password teks biasa yang diketik di spreadsheet akan otomatis di-hash Bcrypt ($2y$) dan ditimpa kembali ke spreadsheet agar aman.'}
                            </span>
                        </div>
                    </div>

                    {/* Result Summary (if sync executed) */}
                    {result && (
                        <div className="space-y-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 animate-in fade-in">
                            <div className="flex items-center gap-2 font-bold text-sm text-emerald-300">
                                <CheckCircle2 className="w-4 h-4" />
                                <span>{result.message}</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                                <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-800/40">
                                    <div className="text-lg font-black text-emerald-400">{result.created}</div>
                                    <div className="text-[10px] text-emerald-300/80">{isEn ? 'New Accounts' : 'Akun Baru'}</div>
                                </div>
                                <div className="p-2 rounded-lg bg-teal-950/60 border border-teal-800/40">
                                    <div className="text-lg font-black text-teal-400">{result.updated}</div>
                                    <div className="text-[10px] text-teal-300/80">{isEn ? 'Updated' : 'Diperbarui'}</div>
                                </div>
                                <div className="p-2 rounded-lg bg-sky-950/60 border border-sky-800/40">
                                    <div className="text-lg font-black text-sky-400">{result.hashed_passwords}</div>
                                    <div className="text-[10px] text-sky-300/80">{isEn ? 'Passwords Hashed' : 'Password Di-Hash'}</div>
                                </div>
                                <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-700/60">
                                    <div className="text-lg font-black text-amber-400">{result.errors?.length || 0}</div>
                                    <div className="text-[10px] text-slate-400">{isEn ? 'Errors / Warnings' : 'Galat / Peringatan'}</div>
                                </div>
                            </div>
                            {result.errors && result.errors.length > 0 && (
                                <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-800/40 text-rose-300 text-[11px] space-y-1">
                                    <div className="font-bold flex items-center gap-1">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        <span>{isEn ? 'Warnings / Errors details:' : 'Catatan galat:'}</span>
                                    </div>
                                    <ul className="list-disc pl-4 space-y-0.5">
                                        {result.errors.map((err, i) => (
                                            <li key={i}>{err}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className={`px-5 py-3.5 border-t flex flex-wrap items-center justify-between gap-2.5 ${
                    isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-100 bg-slate-50'
                }`}>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={syncing || exporting}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                    >
                        {isEn ? 'Close' : 'Tutup'}
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleExportAll}
                            disabled={exporting || syncing || !urlInput.trim()}
                            className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title={isEn ? 'Export all existing employees from app to this spreadsheet' : 'Letakkan seluruh data karyawan saat ini ke spreadsheet ini'}
                        >
                            <Upload className={`w-3.5 h-3.5 ${exporting ? 'animate-bounce' : ''}`} />
                            <span>{exporting ? (isEn ? 'Exporting...' : 'Mengekspor...') : (isEn ? 'Export to Sheet' : 'Letakkan Data ke Sheet')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleStartSync}
                            disabled={syncing || exporting || !urlInput.trim()}
                            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95"
                        >
                            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                            <span>
                                {syncing 
                                    ? (isEn ? 'Syncing...' : 'Menyinkronkan...') 
                                    : (isEn ? 'Sync from Sheet' : 'Sync dari Sheet')}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
