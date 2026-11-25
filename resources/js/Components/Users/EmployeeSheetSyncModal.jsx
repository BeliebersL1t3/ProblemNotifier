import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    FileSpreadsheet, ExternalLink, RefreshCw, CheckCircle2, 
    AlertTriangle, ShieldAlert, KeyRound, X, Save, Info, Upload,
    ArrowRight, UserPlus, UserCog, Eye
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
    const [applying, setApplying] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [securityConfirmed, setSecurityConfirmed] = useState(false);
    const [result, setResult] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [errorDetails, setErrorDetails] = useState([]);

    const extractErrorDetails = (rawErrors) => {
        if (Array.isArray(rawErrors)) {
            return rawErrors.filter(Boolean).map(String);
        }
        if (rawErrors && typeof rawErrors === 'object') {
            return Object.values(rawErrors).flat().filter(Boolean).map(String);
        }
        return [];
    };

    // Fetch existing employee spreadsheet config
    useEffect(() => {
        if (!isOpen) return;
        setResult(null);
        setPreviewData(null);
        setSecurityConfirmed(false);
        setErrorMessage(null);
        setErrorDetails([]);
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
        setErrorDetails([]);
        try {
            const res = await axios.post('/users/employee-sheet-config', { url: trimmed });
            if (res.data?.success) {
                setSpreadsheetId(res.data.spreadsheet_id);
                setSpreadsheetUrl(res.data.spreadsheet_url);
                setUrlInput(res.data.spreadsheet_url);
            } else {
                setErrorMessage(res.data?.message || 'Gagal menyimpan URL spreadsheet.');
                setErrorDetails(extractErrorDetails(res.data?.errors));
            }
        } catch (err) {
            setErrorMessage(err.response?.data?.message || err.message || 'Gagal menyimpan URL spreadsheet.');
            setErrorDetails(extractErrorDetails(err.response?.data?.errors));
        } finally {
            setSavingConfig(false);
        }
    };

    // Step 1: Dry-run scan to preview exact per-account diffs & security alerts before saving
    const handleStartSync = async () => {
        setSyncing(true);
        setErrorMessage(null);
        setErrorDetails([]);
        setResult(null);
        setPreviewData(null);
        setSecurityConfirmed(false);

        try {
            const payload = { dry_run: true };
            if (urlInput.trim()) {
                payload.spreadsheet_url = urlInput.trim();
            }

            const res = await axios.post('/users/sync-sheet', payload);
            if (res.data?.success) {
                if (res.data.spreadsheet_url) {
                    setSpreadsheetUrl(res.data.spreadsheet_url);
                }
                const plannedChanges = Array.isArray(res.data.changes) ? res.data.changes : [];
                const plannedErrors = Array.isArray(res.data.errors) ? res.data.errors : [];

                // If nothing changed and no row errors, show final up-to-date state immediately
                if (plannedChanges.length === 0 && plannedErrors.length === 0) {
                    setResult(res.data);
                } else {
                    setPreviewData(res.data);
                }
            } else {
                setErrorMessage(res.data?.message || (isEn ? 'Preview scan failed.' : 'Gagal memindai perubahan dari spreadsheet.'));
                setErrorDetails(extractErrorDetails(res.data?.errors));
            }
        } catch (err) {
            setErrorMessage(err.response?.data?.message || err.message || (isEn ? 'Sync error occurred.' : 'Terjadi kesalahan sistem saat memindai spreadsheet.'));
            setErrorDetails(extractErrorDetails(err.response?.data?.errors));
        } finally {
            setSyncing(false);
        }
    };

    // Step 2: Apply the previewed changes (with anti-tamper preview hash check)
    const handleConfirmApply = async () => {
        if (!previewData) return;
        const hasAlerts = (previewData.security_alerts?.length || 0) > 0;
        if (hasAlerts && !securityConfirmed) {
            setErrorMessage(isEn
                ? 'Please check the security confirmation box before applying sensitive changes.'
                : 'Harap centang konfirmasi keamanan terlebih dahulu sebelum menerapkan perubahan sensitif.');
            return;
        }

        setApplying(true);
        setErrorMessage(null);
        setErrorDetails([]);

        try {
            const payload = {
                dry_run: false,
                expected_preview_hash: previewData.preview_hash || null,
            };
            if (urlInput.trim()) {
                payload.spreadsheet_url = urlInput.trim();
            }

            const res = await axios.post('/users/sync-sheet', payload);
            if (res.data?.success) {
                setPreviewData(null);
                setSecurityConfirmed(false);
                setResult(res.data);
                if (res.data.spreadsheet_url) {
                    setSpreadsheetUrl(res.data.spreadsheet_url);
                }
                if (typeof onSyncSuccess === 'function') {
                    onSyncSuccess(res.data);
                }
            } else {
                setErrorMessage(res.data?.message || (isEn ? 'Sync failed.' : 'Gagal menyinkronkan data.'));
                setErrorDetails(extractErrorDetails(res.data?.errors));
            }
        } catch (err) {
            if (err.response?.status === 409 && err.response?.data?.stale_preview) {
                // Sheet changed between preview and confirm -> refresh preview & require re-verification
                setErrorMessage(err.response.data.message || 'Isi Spreadsheet berubah sejak pratinjau. Harap periksa ulang perubahan terbaru.');
                setPreviewData(err.response.data);
                setSecurityConfirmed(false);
            } else {
                setErrorMessage(err.response?.data?.message || err.message || (isEn ? 'Sync error occurred.' : 'Terjadi kesalahan sistem saat sinkronisasi.'));
                setErrorDetails(extractErrorDetails(err.response?.data?.errors));
            }
        } finally {
            setApplying(false);
        }
    };

    const handleExportAll = async () => {
        const confirmMsg = isEn 
            ? 'Update all employee rows in this Google Spreadsheet from current Web data? (Existing sheet rows will be refreshed).'
            : 'Perbarui seluruh data karyawan di Google Spreadsheet ini dari data Web saat ini? (Baris data di spreadsheet akan diperbarui).';
        if (!confirm(confirmMsg)) return;

        setExporting(true);
        setErrorMessage(null);
        setErrorDetails([]);
        setPreviewData(null);
        setSecurityConfirmed(false);
        setResult(null);

        try {
            const payload = {};
            if (urlInput.trim()) {
                payload.spreadsheet_url = urlInput.trim();
            }

            const res = await axios.post('/users/export-sheet', payload);
            if (res.data?.success) {
                setResult({
                    message: res.data.message,
                    created: 0,
                    updated: res.data.count,
                    hashed_passwords: 0,
                    errors: [],
                    changes: [],
                    security_alerts: [],
                });
            } else {
                setErrorMessage(res.data?.message || 'Gagal meletakkan data karyawan.');
                setErrorDetails(extractErrorDetails(res.data?.errors));
            }
        } catch (err) {
            setErrorMessage(err.response?.data?.message || err.message || 'Gagal meletakkan data ke spreadsheet.');
            setErrorDetails(extractErrorDetails(err.response?.data?.errors));
        } finally {
            setExporting(false);
        }
    };

    const renderChangeItems = (items, isPreviewMode = false) => {
        if (!Array.isArray(items) || items.length === 0) return null;

        return (
            <div className="space-y-2">
                <div className={`text-[11px] font-bold flex items-center justify-between ${
                    isDark ? 'text-slate-200' : 'text-slate-800'
                }`}>
                    <span>
                        {isPreviewMode
                            ? (isEn ? `Planned Account Changes (${items.length})` : `Rincian Perubahan Akun yang Akan Diterapkan (${items.length})`)
                            : (isEn ? `Applied Account Changes (${items.length})` : `Rincian Perubahan Akun yang Diterapkan (${items.length})`)}
                    </span>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {items.map((item, idx) => {
                        const isCritical = Array.isArray(item.sensitive_tags) && (
                            item.sensitive_tags.includes('PROMOTED_TO_ADMIN') || item.sensitive_tags.includes('NEW_ADMIN')
                        );
                        const isSensitive = Boolean(item.sensitive);
                        const isCreated = item.action === 'created';

                        const cardStyle = isCritical
                            ? (isDark ? 'bg-rose-950/50 border-rose-500/60' : 'bg-rose-50 border-rose-300')
                            : isSensitive
                                ? (isDark ? 'bg-amber-950/35 border-amber-500/50' : 'bg-amber-50 border-amber-300')
                                : (isDark ? 'bg-slate-900/70 border-slate-700/70' : 'bg-white border-slate-200');

                        return (
                            <div key={`${item.row}-${item.email}-${idx}`} className={`p-2.5 rounded-xl border space-y-1.5 ${cardStyle}`}>
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                            isCreated
                                                ? (isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-emerald-100 text-emerald-800 border-emerald-300')
                                                : (isDark ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-sky-100 text-sky-800 border-sky-300')
                                        }`}>
                                            {isCreated ? <UserPlus className="w-3 h-3" /> : <UserCog className="w-3 h-3" />}
                                            <span>{isCreated ? (isEn ? 'New' : 'Akun Baru') : (isEn ? 'Updated' : 'Diperbarui')}</span>
                                        </span>
                                        {isCritical && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white">
                                                <ShieldAlert className="w-3 h-3" />
                                                <span>{isEn ? 'ADMIN ACCESS' : 'AKSES ADMIN'}</span>
                                            </span>
                                        )}
                                        <span className={`font-bold text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {item.name}
                                        </span>
                                    </div>
                                    <span className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        Baris #{item.row}
                                    </span>
                                </div>
                                {item.email && (
                                    <div className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {item.email}
                                    </div>
                                )}
                                {Array.isArray(item.diffs) && item.diffs.length > 0 && (
                                    <div className="space-y-1 pt-1 border-t border-slate-700/30">
                                        {item.diffs.map((d, dIdx) => (
                                            <div key={`${d.field}-${dIdx}`} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                                <span className={`font-semibold ${
                                                    d.sensitive
                                                        ? (isDark ? 'text-rose-300' : 'text-rose-700')
                                                        : (isDark ? 'text-slate-300' : 'text-slate-600')
                                                }`}>
                                                    {d.label}:
                                                </span>
                                                {d.before !== null && d.before !== undefined ? (
                                                    <>
                                                        <span className={`line-through px-1.5 py-0.5 rounded text-[10px] ${
                                                            isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'
                                                        }`}>
                                                            {d.before}
                                                        </span>
                                                        <ArrowRight className={`w-3 h-3 shrink-0 ${d.sensitive ? 'text-rose-400' : 'text-emerald-400'}`} />
                                                        <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                                                            d.sensitive
                                                                ? (isDark ? 'bg-rose-500/25 text-rose-200 border border-rose-500/40' : 'bg-rose-100 text-rose-800 border border-rose-300')
                                                                : (isDark ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30' : 'bg-emerald-100 text-emerald-800 border border-emerald-200')
                                                        }`}>
                                                            {d.after}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                                                        d.sensitive
                                                            ? (isDark ? 'bg-rose-500/25 text-rose-200 border border-rose-500/40' : 'bg-rose-100 text-rose-800 border border-rose-300')
                                                            : (isDark ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30' : 'bg-emerald-100 text-emerald-800 border border-emerald-200')
                                                    }`}>
                                                        {d.after}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
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
                        <div className={`p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 flex items-start gap-2.5 ${
                            isDark ? 'text-rose-300' : 'text-rose-700'
                        }`}>
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div className="flex-1 space-y-1.5">
                                <div className="font-semibold">{errorMessage}</div>
                                {errorDetails.length > 0 && (
                                    <div className={`p-2 rounded-lg border text-[11px] space-y-1 ${
                                        isDark
                                            ? 'bg-rose-950/50 border-rose-800/50 text-rose-200'
                                            : 'bg-rose-50 border-rose-200 text-rose-800'
                                    }`}>
                                        <div className="font-bold">
                                            {isEn
                                                ? `Row error details (${errorDetails.length}):`
                                                : `Detail galat per baris (${errorDetails.length}):`}
                                        </div>
                                        <ul className="list-disc pl-4 space-y-0.5 max-h-40 overflow-y-auto">
                                            {errorDetails.map((detail, idx) => (
                                                <li key={idx}>{detail}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
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

                    {/* Dry-Run Preview Panel (Before Saving) */}
                    {previewData && (
                        <div className={`space-y-3 p-4 rounded-xl border animate-in fade-in ${
                            (previewData.security_alerts?.length || 0) > 0
                                ? (isDark ? 'border-rose-500/50 bg-rose-950/20' : 'border-rose-300 bg-rose-50/70')
                                : (isDark ? 'border-sky-500/40 bg-sky-950/20' : 'border-sky-300 bg-sky-50/70')
                        }`}>
                            <div className="flex items-start justify-between gap-2">
                                <div className={`flex items-center gap-2 font-bold text-sm ${
                                    (previewData.security_alerts?.length || 0) > 0
                                        ? (isDark ? 'text-rose-300' : 'text-rose-700')
                                        : (isDark ? 'text-sky-300' : 'text-sky-800')
                                }`}>
                                    <Eye className="w-4 h-4 shrink-0" />
                                    <span>{isEn ? 'Preview Changes (Not Saved Yet)' : 'Pratinjau Perubahan (Belum Disimpan)'}</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    isDark ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-white border-slate-300 text-slate-700'
                                }`}>
                                    Dry-Run
                                </span>
                            </div>

                            <p className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                {previewData.message}
                            </p>

                            {/* Counters */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                                <div className={`p-2 rounded-lg border ${isDark ? 'bg-emerald-950/60 border-emerald-800/40' : 'bg-emerald-50 border-emerald-200'}`}>
                                    <div className="text-lg font-black text-emerald-500">{previewData.created}</div>
                                    <div className={`text-[10px] ${isDark ? 'text-emerald-300/80' : 'text-emerald-700'}`}>{isEn ? 'New Accounts' : 'Akun Baru'}</div>
                                </div>
                                <div className={`p-2 rounded-lg border ${isDark ? 'bg-teal-950/60 border-teal-800/40' : 'bg-teal-50 border-teal-200'}`}>
                                    <div className="text-lg font-black text-teal-500">{previewData.updated}</div>
                                    <div className={`text-[10px] ${isDark ? 'text-teal-300/80' : 'text-teal-700'}`}>{isEn ? 'Updated' : 'Diperbarui'}</div>
                                </div>
                                <div className={`p-2 rounded-lg border ${isDark ? 'bg-sky-950/60 border-sky-800/40' : 'bg-sky-50 border-sky-200'}`}>
                                    <div className="text-lg font-black text-sky-500">{previewData.hashed_passwords}</div>
                                    <div className={`text-[10px] ${isDark ? 'text-sky-300/80' : 'text-sky-700'}`}>{isEn ? 'Passwords to Hash' : 'Password Di-Hash'}</div>
                                </div>
                                <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-700/60' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="text-lg font-black text-amber-500">{previewData.errors?.length || 0}</div>
                                    <div className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{isEn ? 'Errors / Warnings' : 'Galat / Peringatan'}</div>
                                </div>
                            </div>

                            {/* Prominent Security Alert Banner for Sensitive Changes */}
                            {Array.isArray(previewData.security_alerts) && previewData.security_alerts.length > 0 && (
                                <div className={`p-3 rounded-xl border space-y-2 ${
                                    isDark
                                        ? 'bg-rose-950/70 border-rose-500/70 text-rose-200'
                                        : 'bg-rose-100 border-rose-400 text-rose-900'
                                }`}>
                                    <div className="flex items-center gap-2 font-extrabold text-xs">
                                        <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                                        <span>
                                            {isEn
                                                ? `SECURITY ALERT: ${previewData.security_alerts.length} sensitive account change(s) detected!`
                                                : `PERINGATAN KEAMANAN: Terdeteksi ${previewData.security_alerts.length} perubahan sensitif / hak akses!`}
                                        </span>
                                    </div>
                                    <ul className="list-disc pl-5 space-y-1 text-[11px] font-medium">
                                        {previewData.security_alerts.map((alert, aIdx) => (
                                            <li key={aIdx}>{alert.message}</li>
                                        ))}
                                    </ul>
                                    <label className={`flex items-start gap-2 pt-2 border-t cursor-pointer select-none text-[11px] font-semibold ${
                                        isDark ? 'border-rose-500/40 text-rose-100' : 'border-rose-300 text-rose-950'
                                    }`}>
                                        <input
                                            type="checkbox"
                                            checked={securityConfirmed}
                                            onChange={(e) => setSecurityConfirmed(e.target.checked)}
                                            className="mt-0.5 rounded border-rose-400 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                        />
                                        <span>
                                            {isEn
                                                ? 'I have reviewed all sensitive / Administrator access changes above and approve applying them to Web.'
                                                : 'Saya telah memeriksa seluruh perubahan hak akses / sensitif di atas dan menyetujui penerapannya ke Web.'}
                                        </span>
                                    </label>
                                </div>
                            )}

                            {/* Detailed Per-Account Diff List */}
                            {renderChangeItems(previewData.changes, true)}

                            {/* Preview Row Errors */}
                            {previewData.errors && previewData.errors.length > 0 && (
                                <div className={`p-2.5 rounded-lg border text-[11px] space-y-1 ${
                                    isDark
                                        ? 'bg-rose-950/40 border-rose-800/40 text-rose-300'
                                        : 'bg-rose-50 border-rose-200 text-rose-800'
                                }`}>
                                    <div className="font-bold flex items-center gap-1">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        <span>
                                            {isEn
                                                ? `Row errors detected (${previewData.errors.length}):`
                                                : `Baris bermasalah ditemukan (${previewData.errors.length}):`}
                                        </span>
                                    </div>
                                    <ul className="list-disc pl-4 space-y-0.5 max-h-40 overflow-y-auto">
                                        {previewData.errors.map((err, i) => (
                                            <li key={i}>{err}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Result Summary (if sync executed) */}
                    {result && (
                        <div className={`space-y-3 p-4 rounded-xl border animate-in fade-in ${
                            isDark
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                : 'border-emerald-300 bg-emerald-50/80 text-emerald-900'
                        }`}>
                            <div className={`flex items-center gap-2 font-bold text-sm ${
                                isDark ? 'text-emerald-300' : 'text-emerald-800'
                            }`}>
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                <span>{result.message}</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                                <div className={`p-2 rounded-lg border ${isDark ? 'bg-emerald-950/60 border-emerald-800/40' : 'bg-white border-emerald-200'}`}>
                                    <div className="text-lg font-black text-emerald-500">{result.created}</div>
                                    <div className={`text-[10px] ${isDark ? 'text-emerald-300/80' : 'text-emerald-700'}`}>{isEn ? 'New Accounts' : 'Akun Baru'}</div>
                                </div>
                                <div className={`p-2 rounded-lg border ${isDark ? 'bg-teal-950/60 border-teal-800/40' : 'bg-white border-teal-200'}`}>
                                    <div className="text-lg font-black text-teal-500">{result.updated}</div>
                                    <div className={`text-[10px] ${isDark ? 'text-teal-300/80' : 'text-teal-700'}`}>{isEn ? 'Updated' : 'Diperbarui'}</div>
                                </div>
                                <div className={`p-2 rounded-lg border ${isDark ? 'bg-sky-950/60 border-sky-800/40' : 'bg-white border-sky-200'}`}>
                                    <div className="text-lg font-black text-sky-500">{result.hashed_passwords}</div>
                                    <div className={`text-[10px] ${isDark ? 'text-sky-300/80' : 'text-sky-700'}`}>{isEn ? 'Passwords Hashed' : 'Password Di-Hash'}</div>
                                </div>
                                <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-700/60' : 'bg-white border-slate-200'}`}>
                                    <div className="text-lg font-black text-amber-500">{result.errors?.length || 0}</div>
                                    <div className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{isEn ? 'Errors / Warnings' : 'Galat / Peringatan'}</div>
                                </div>
                            </div>
                            {/* Applied Account Changes List */}
                            {renderChangeItems(result.changes, false)}
                            {result.errors && result.errors.length > 0 && (
                                <div className={`p-2.5 rounded-lg border text-[11px] space-y-1 ${
                                    isDark
                                        ? 'bg-rose-950/40 border-rose-800/40 text-rose-300'
                                        : 'bg-rose-50 border-rose-200 text-rose-800'
                                }`}>
                                    <div className="font-bold flex items-center gap-1">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        <span>
                                            {isEn
                                                ? `Warnings / Errors details (${result.errors.length}):`
                                                : `Detail galat per baris (${result.errors.length}):`}
                                        </span>
                                    </div>
                                    <ul className="list-disc pl-4 space-y-0.5 max-h-40 overflow-y-auto">
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
                    {previewData ? (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    setPreviewData(null);
                                    setSecurityConfirmed(false);
                                    setErrorMessage(null);
                                }}
                                disabled={applying || syncing}
                                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
                            >
                                {isEn ? 'Cancel Preview' : 'Batal'}
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleStartSync}
                                    disabled={syncing || applying}
                                    className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                                    <span>{isEn ? 'Re-scan' : 'Pindai Ulang'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmApply}
                                    disabled={
                                        applying
                                        || syncing
                                        || (previewData.changes?.length || 0) === 0
                                        || ((previewData.security_alerts?.length || 0) > 0 && !securityConfirmed)
                                    }
                                    className={`px-4 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                                        (previewData.security_alerts?.length || 0) > 0
                                            ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
                                            : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                                    }`}
                                >
                                    <CheckCircle2 className={`w-4 h-4 ${applying ? 'animate-pulse' : ''}`} />
                                    <span>
                                        {applying
                                            ? (isEn ? 'Applying Changes...' : 'Menerapkan Perubahan...')
                                            : (isEn
                                                ? `Apply ${previewData.changes?.length || 0} Changes to Web`
                                                : `Terapkan ${previewData.changes?.length || 0} Perubahan ke Web`)}
                                    </span>
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={syncing || exporting || applying}
                                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                            >
                                {isEn ? 'Close' : 'Tutup'}
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleExportAll}
                                    disabled={exporting || syncing || applying || !urlInput.trim()}
                                    className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                    title={isEn ? 'Send and update all employee records in Google Sheet from Web' : 'Kirim dan perbarui seluruh data karyawan di Google Sheet dari Web'}
                                >
                                    <Upload className={`w-3.5 h-3.5 ${exporting ? 'animate-bounce' : ''}`} />
                                    <span>
                                        {exporting
                                            ? (isEn ? 'Updating Sheet...' : 'Memperbarui Sheet...')
                                            : (isEn ? 'Update Sheet (from Web)' : 'Perbarui Sheet (dari Web)')}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleStartSync}
                                    disabled={syncing || exporting || applying || !urlInput.trim()}
                                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95"
                                    title={isEn ? 'Preview and update Web accounts from Google Sheet (auto-hashes new passwords)' : 'Pratinjau lalu perbarui akun karyawan di Web dari Google Sheet (otomatis hash password baru)'}
                                >
                                    <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                                    <span>
                                        {syncing 
                                            ? (isEn ? 'Scanning Sheet...' : 'Memindai Sheet...') 
                                            : (isEn ? 'Update Web (from Sheet)' : 'Perbarui Web (dari Sheet)')}
                                    </span>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
