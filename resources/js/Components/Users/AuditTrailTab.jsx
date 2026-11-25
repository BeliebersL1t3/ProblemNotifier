import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { 
    Shield, Clock, User, AlertCircle, RefreshCw, ChevronDown, ChevronRight, 
    Activity, FileSpreadsheet, ExternalLink, CheckCircle2, Search, Filter, 
    Calendar, KeyRound, ShieldAlert, Sliders, ArrowUpRight, ArrowDownRight,
    Sparkles, Database, Layers
} from 'lucide-react';
import { AuditDiffViewer, extractDifferences } from './AuditDiffViewer';
import { useLanguage } from '@/context/LanguageContext';
import { useLeanTheme } from '@/hooks/useLeanTheme';

export function AuditTrailTab() {
    const { lang } = useLanguage();
    const { isDark } = useLeanTheme();
    const [logs, setLogs] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [spreadsheetUrl, setSpreadsheetUrl] = useState('https://docs.google.com/spreadsheets/d/11FJllelJdd37tR9dUnCawgU1iycm6bQOLMgHM2t-z84/edit?usp=sharing');

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [actionFilter, setActionFilter] = useState('all');
    const [timeFilter, setTimeFilter] = useState('all'); // 'today' | 'week' | 'month' | '6months' | 'year' | 'all'

    const fetchLogs = async (period = timeFilter) => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/user-audit-logs?limit=300&period=${period}`);
            const data = res.data;
            if (data.success) {
                setLogs(data.data || []);
                setTotalCount(data.total_count || (data.data || []).length);
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

    useEffect(() => {
        fetchLogs(timeFilter);
    }, [timeFilter]);

    // Filtered logs
    const filteredLogs = useMemo(() => {
        const now = Date.now();
        const startOfToday = new Date().setHours(0, 0, 0, 0);

        return logs.filter(log => {
            // Time range filter (client-side fallback / local verification)
            if (timeFilter !== 'all' && log.created_at) {
                const logTime = new Date(log.created_at).getTime();
                if (timeFilter === 'today' && logTime < startOfToday) return false;
                if (timeFilter === 'week' && logTime < now - 7 * 24 * 60 * 60 * 1000) return false;
                if (timeFilter === 'month' && logTime < now - 30 * 24 * 60 * 60 * 1000) return false;
                if (timeFilter === '6months' && logTime < now - 182 * 24 * 60 * 60 * 1000) return false;
                if (timeFilter === 'year' && logTime < now - 365 * 24 * 60 * 60 * 1000) return false;
            }

            // Action filter
            if (actionFilter !== 'all') {
                if (actionFilter === 'password' && !['PASSWORD_RESET', 'PASSWORD_UPDATED_VIA_SHEET_SYNC'].includes(log.action)) return false;
                if (actionFilter === 'profile_permission' && !['USER_UPDATED', 'USER_UPDATED_VIA_SHEET_SYNC', 'PERMISSIONS_UPDATED', 'BATCH_PERMISSIONS_UPDATED', 'USER_PERMISSIONS_BATCH_UPDATED'].includes(log.action)) return false;
                if (actionFilter === 'created' && !['USER_CREATED', 'USER_CREATED_VIA_SHEET_SYNC'].includes(log.action)) return false;
                if (actionFilter === 'archive' && !['USER_ARCHIVED', 'BATCH_USERS_ARCHIVED'].includes(log.action)) return false;
                if (actionFilter === 'restore' && !['USER_RESTORED', 'BATCH_USERS_RESTORED'].includes(log.action)) return false;
                if (actionFilter === 'sheet_sync' && !['PASSWORD_UPDATED_VIA_SHEET_SYNC', 'USER_UPDATED_VIA_SHEET_SYNC', 'USER_CREATED_VIA_SHEET_SYNC', 'BATCH_USERS_SYNCED_FROM_SHEET', 'EMPLOYEES_EXPORTED_TO_SHEET'].includes(log.action)) return false;
            }

            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const target = (log.target_user_name || '').toLowerCase();
                const admin = (log.admin_name || '').toLowerCase();
                const ip = (log.ip_address || '').toLowerCase();
                const action = (log.action || '').toLowerCase();
                if (!target.includes(q) && !admin.includes(q) && !ip.includes(q) && !action.includes(q)) {
                    return false;
                }
            }

            return true;
        });
    }, [logs, actionFilter, searchQuery, timeFilter]);

    // Statistics computation
    const stats = useMemo(() => {
        const now = new Date();
        const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        let count24h = 0;
        let countPerms = 0;
        let countPass = 0;
        let countArchive = 0;
        const adminCounts = {};

        logs.forEach(log => {
            const createdAt = new Date(log.created_at);
            if (createdAt >= past24h) {
                count24h++;
            }
            if (['USER_UPDATED', 'USER_UPDATED_VIA_SHEET_SYNC', 'PERMISSIONS_UPDATED', 'BATCH_PERMISSIONS_UPDATED'].includes(log.action)) {
                countPerms++;
            }
            if (['PASSWORD_RESET', 'PASSWORD_UPDATED_VIA_SHEET_SYNC'].includes(log.action)) {
                countPass++;
            }
            if (['USER_ARCHIVED', 'BATCH_USERS_ARCHIVED'].includes(log.action)) {
                countArchive++;
            }
            if (log.admin_name) {
                adminCounts[log.admin_name] = (adminCounts[log.admin_name] || 0) + 1;
            }
        });

        // Find most active admin
        let topAdmin = '-';
        let maxAdminActs = 0;
        Object.entries(adminCounts).forEach(([name, count]) => {
            if (count > maxAdminActs) {
                maxAdminActs = count;
                topAdmin = name;
            }
        });

        return {
            total: totalCount || logs.length,
            count24h,
            countPerms,
            countPass,
            countArchive,
            topAdmin,
        };
    }, [logs, totalCount]);

    const getDisplayTargetName = (log) => {
        const raw = (log?.target_user_name || '').trim();
        if (raw && raw !== 'N/A' && raw !== '-') {
            return raw;
        }
        const c = log?.changes || {};
        if (log?.action === 'EMPLOYEES_EXPORTED_TO_SHEET') {
            return c.count !== undefined
                ? `Seluruh Karyawan (${c.count} akun)`
                : 'Seluruh Karyawan (Spreadsheet)';
        }
        if (log?.action === 'BATCH_USERS_SYNCED_FROM_SHEET') {
            return 'Seluruh Karyawan (Spreadsheet)';
        }
        if (c.account_count !== undefined) {
            return `${c.account_count} Akun Karyawan`;
        }
        return 'Operasi Sistem / Massal';
    };

    const renderInlineDiffSummary = (log) => {
        if (!log?.changes) return null;

        // Compact summary pills for batch Sheet Sync / Export logs
        if (log.action === 'BATCH_USERS_SYNCED_FROM_SHEET') {
            const c = log.changes || {};
            const created = c.created_count ?? 0;
            const updated = c.updated_count ?? 0;
            const skipped = c.skipped_count ?? 0;
            const hashed = c.hashed_passwords ?? 0;
            const errs = c.errors_count ?? 0;
            return (
                <div className="flex flex-wrap items-center gap-1 mt-1">
                    {created > 0 && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            Baru: {created}
                        </span>
                    )}
                    {updated > 0 && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${isDark ? 'bg-sky-500/15 text-sky-300 border-sky-500/30' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>
                            Diubah: {updated}
                        </span>
                    )}
                    {hashed > 0 && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${isDark ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                            Hash: {hashed}
                        </span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${isDark ? 'bg-slate-800/80 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {created === 0 && updated === 0 && hashed === 0
                            ? `${skipped} data sesuai (tanpa perubahan)`
                            : `Tetap: ${skipped}`}
                    </span>
                    {errs > 0 && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-rose-100 text-rose-700 border-rose-300'}`}>
                            Galat: {errs}
                        </span>
                    )}
                </div>
            );
        }

        if (log.action === 'EMPLOYEES_EXPORTED_TO_SHEET') {
            const count = log.changes?.count;
            return (
                <div className="flex flex-wrap items-center gap-1 mt-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${isDark ? 'bg-teal-500/15 text-teal-300 border-teal-500/30' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
                        {count !== undefined ? `${count} data dikirim ke Google Sheet` : 'Data dikirim ke Google Sheet'}
                    </span>
                </div>
            );
        }

        // Highlight newly created Admin accounts immediately
        if (['USER_CREATED', 'USER_CREATED_VIA_SHEET_SYNC'].includes(log.action) && log.changes?.created_user) {
            const createdRole = log.changes.created_user.role;
            const createdDept = log.changes.created_user.department;
            const isAdminNew = createdRole === 'admin';
            return (
                <div className="flex flex-wrap items-center gap-1 mt-1">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                        isAdminNew
                            ? (isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-rose-100 text-rose-700 border-rose-300')
                            : (isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                    }`}>
                        {isAdminNew && <ShieldAlert className="h-3 w-3 shrink-0" />}
                        <span>Role: {isAdminNew ? 'Administrator' : (createdRole || 'Staff')}</span>
                    </span>
                    {createdDept && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                            isDark ? 'bg-slate-800/80 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                            Dept: {createdDept}
                        </span>
                    )}
                </div>
            );
        }

        const diffs = extractDifferences(log.changes);
        if (!diffs || diffs.length === 0) return null;

        // Prioritize security-sensitive diffs (role, password, is_active) so they are always visible first
        const priority = (d) => {
            if (d.key === 'role' && d.afterText === 'Administrator') return 0;
            if (d.key === 'role') return 1;
            if (d.type === 'password') return 2;
            if (d.key === 'is_active') return 3;
            return 4;
        };
        const sortedDiffs = [...diffs].sort((a, b) => priority(a) - priority(b));
        const visible = sortedDiffs.slice(0, 3);
        const remaining = sortedDiffs.length - visible.length;

        return (
            <div className="flex flex-wrap items-center gap-1 mt-1">
                {visible.map((d, idx) => {
                    const isAdminPromotion = d.key === 'role' && d.afterText === 'Administrator';
                    const isRoleChange = d.key === 'role';
                    const isPass = d.type === 'password';
                    const isDeactivated = d.key === 'is_active' && d.afterText === 'Nonaktif';

                    let pillClass = isDark
                        ? 'bg-slate-800/80 text-slate-300 border-slate-700'
                        : 'bg-slate-100 text-slate-700 border-slate-200';
                    if (isAdminPromotion) {
                        pillClass = isDark
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold'
                            : 'bg-rose-100 text-rose-700 border-rose-300 font-bold';
                    } else if (isRoleChange || isPass || isDeactivated) {
                        pillClass = isDark
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold'
                            : 'bg-amber-100 text-amber-800 border-amber-300 font-semibold';
                    }

                    let text = '';
                    if (d.type === 'password') {
                        text = 'Password Diubah';
                    } else if (d.type === 'permission') {
                        text = `${d.label}: ${d.afterBool ? 'Aktif' : 'Nonaktif'}`;
                    } else {
                        text = `${d.label}: ${d.beforeText} → ${d.afterText}`;
                    }

                    return (
                        <span
                            key={`${d.key || idx}-${idx}`}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border max-w-full truncate ${pillClass}`}
                            title={text}
                        >
                            {isAdminPromotion && <ShieldAlert className="h-3 w-3 shrink-0" />}
                            {isPass && <KeyRound className="h-3 w-3 shrink-0" />}
                            <span className="truncate">{text}</span>
                        </span>
                    );
                })}
                {remaining > 0 && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                        isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                        +{remaining} lainnya
                    </span>
                )}
            </div>
        );
    };

    const getActionBadge = (log) => {
        const action = log?.action;
        switch (action) {
            case 'USER_CREATED':
                return <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}`}>User Baru</span>;
            case 'PASSWORD_RESET':
                return <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>Reset Password</span>;
            case 'USER_ARCHIVED':
                return <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-rose-100 text-rose-800 border-rose-200'}`}>Di-Archive (Soft Delete)</span>;
            case 'BATCH_USERS_ARCHIVED':
                return (
                    <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border inline-flex items-center gap-1.5 ${isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-rose-100 text-rose-800 border-rose-200'}`}>
                        <span>Hapus Massal (Archive)</span>
                        {log?.changes?.account_count && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white keep-white font-black text-[9px]">
                                {log.changes.account_count}
                            </span>
                        )}
                    </span>
                );
            case 'USER_RESTORED':
                return <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${isDark ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : 'bg-purple-100 text-purple-800 border-purple-200'}`}>Dipulihkan</span>;
            case 'BATCH_USERS_RESTORED':
                return (
                    <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border inline-flex items-center gap-1.5 ${isDark ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'bg-purple-100 text-purple-800 border-purple-200'}`}>
                        <span>Pulihkan Massal</span>
                        {log?.changes?.account_count && (
                            <span className="px-1.5 py-0.2 rounded bg-purple-600 text-white keep-white font-black text-[9px]">
                                {log.changes.account_count}
                            </span>
                        )}
                    </span>
                );
            case 'BATCH_PERMISSIONS_UPDATED':
            case 'USER_PERMISSIONS_BATCH_UPDATED':
                return (
                    <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border inline-flex items-center gap-1.5 ${isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}`}>
                        <span>Izin Massal</span>
                        {log?.changes?.account_count && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white keep-white font-black text-[9px]">
                                {log.changes.account_count} Akun
                            </span>
                        )}
                    </span>
                );
            case 'PERMISSIONS_UPDATED':
                return <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${isDark ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' : 'bg-sky-100 text-sky-800 border-sky-200'}`}>Izin Diubah</span>;
            case 'USER_UPDATED': {
                const diffs = extractDifferences(log?.changes);
                const hasPerms = diffs.some(d => d.type === 'permission');
                const hasFields = diffs.some(d => d.type === 'field');
                const hasPass = diffs.some(d => d.type === 'password');

                if (hasPerms && !hasFields && !hasPass) {
                    return <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${isDark ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' : 'bg-sky-100 text-sky-800 border-sky-200'}`}>Izin Diubah</span>;
                }
                if (hasFields && !hasPerms && !hasPass) {
                    return <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${isDark ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' : 'bg-sky-100 text-sky-800 border-sky-200'}`}>Profil Diperbarui</span>;
                }
                if (hasPass && !hasFields && !hasPerms) {
                    return <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>Reset Password</span>;
                }
                if (hasPerms && hasFields) {
                    return <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${isDark ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-indigo-100 text-indigo-800 border-indigo-200'}`}>Profil & Izin Diubah</span>;
                }
                return <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${isDark ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' : 'bg-sky-100 text-sky-800 border-sky-200'}`}>Data Diperbarui</span>;
            }
            case 'PASSWORD_UPDATED_VIA_SHEET_SYNC':
                return (
                    <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border inline-flex items-center gap-1.5 ${isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                        <FileSpreadsheet className="h-3 w-3 text-emerald-500" />
                        <span>Password (Sync Sheet)</span>
                    </span>
                );
            case 'USER_UPDATED_VIA_SHEET_SYNC':
                return (
                    <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border inline-flex items-center gap-1.5 ${isDark ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-sky-100 text-sky-800 border-sky-200'}`}>
                        <FileSpreadsheet className="h-3 w-3 text-emerald-500" />
                        <span>Data Diperbarui (Sheet)</span>
                    </span>
                );
            case 'USER_CREATED_VIA_SHEET_SYNC':
                return (
                    <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border inline-flex items-center gap-1.5 ${isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}`}>
                        <FileSpreadsheet className="h-3 w-3 text-emerald-500" />
                        <span>User Baru (Sheet)</span>
                    </span>
                );
            case 'BATCH_USERS_SYNCED_FROM_SHEET':
                return (
                    <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border inline-flex items-center gap-1.5 ${isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}`}>
                        <FileSpreadsheet className="h-3 w-3 text-emerald-500" />
                        <span>Sync Massal Sheet</span>
                        {log?.changes?.hashed_passwords > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-600 text-white keep-white font-black text-[9px]" title="Password Dihash">
                                {log.changes.hashed_passwords} Pass
                            </span>
                        )}
                    </span>
                );
            case 'EMPLOYEES_EXPORTED_TO_SHEET':
                return (
                    <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border inline-flex items-center gap-1.5 ${isDark ? 'bg-teal-500/20 text-teal-300 border-teal-500/40' : 'bg-teal-100 text-teal-800 border-teal-200'}`}>
                        <FileSpreadsheet className="h-3 w-3 text-teal-500" />
                        <span>Ekspor ke Sheet</span>
                        {log?.changes?.count && (
                            <span className="px-1.5 py-0.2 rounded bg-teal-600 text-white keep-white font-black text-[9px]">
                                {log.changes.count}
                            </span>
                        )}
                    </span>
                );
            default:
                return <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${isDark ? 'bg-slate-700/60 text-slate-300 border-slate-600' : 'bg-slate-100 text-slate-700 border-slate-300'}`}>{action}</span>;
        }
    };

    const getMonthLabel = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
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
        <div className="space-y-5 animate-in fade-in duration-200">
            {/* 1. Google Spreadsheet Connection & Live Sync Card */}
            <div className={`rounded-2xl border p-4 sm:p-5 shadow-md ${
                isDark
                    ? 'border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-800/80'
                    : 'border-emerald-200 bg-gradient-to-r from-emerald-50/90 via-white to-slate-50'
            }`}>
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className={`p-3 rounded-2xl border shadow-inner shrink-0 ${
                            isDark
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                        }`}>
                            <FileSpreadsheet className="h-6 w-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h3 className={`text-base sm:text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    Google Spreadsheet Audit Trail
                                </h3>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 ${
                                    isDark
                                        ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50'
                                        : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                }`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                                    LIVE AUTO-APPEND
                                </span>
                            </div>
                            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                Setiap perubahan profil staf, reset password, dan hak akses otomatis tercatat dan tersinkronisasi ke Google Cloud Spreadsheet.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 w-full lg:w-auto justify-end flex-wrap">
                        <a
                            href={spreadsheetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 lg:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white keep-white shadow-md transition-all cursor-pointer"
                            title="Buka Spreadsheet di Tab Baru"
                        >
                            <ExternalLink className="h-4 w-4" />
                            <span>Buka Google Sheet</span>
                        </a>
                    </div>
                </div>
            </div>

            {/* 2. Mini Audit Dashboard Metrik */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className={`rounded-xl border p-3.5 space-y-1 ${isDark ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white/90 shadow-xs'}`}>
                    <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center justify-between ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <span>Total Log</span>
                        <Database className={`h-3.5 w-3.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                    </div>
                    <div className={`text-xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{stats.total}</div>
                </div>

                <div className={`rounded-xl border p-3.5 space-y-1 ${isDark ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white/90 shadow-xs'}`}>
                    <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center justify-between ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        <span>24 Jam Terakhir</span>
                        <Clock className={`h-3.5 w-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                    </div>
                    <div className={`text-xl font-extrabold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{stats.count24h}</div>
                </div>

                <div className={`rounded-xl border p-3.5 space-y-1 ${isDark ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white/90 shadow-xs'}`}>
                    <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center justify-between ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                        <span>Perubahan Izin</span>
                        <Sliders className={`h-3.5 w-3.5 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
                    </div>
                    <div className={`text-xl font-extrabold ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>{stats.countPerms}</div>
                </div>

                <div className={`rounded-xl border p-3.5 space-y-1 ${isDark ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white/90 shadow-xs'}`}>
                    <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center justify-between ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                        <span>Reset Password</span>
                        <KeyRound className={`h-3.5 w-3.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                    </div>
                    <div className={`text-xl font-extrabold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>{stats.countPass}</div>
                </div>

                <div className={`rounded-xl border p-3.5 space-y-1 col-span-2 sm:col-span-1 ${isDark ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white/90 shadow-xs'}`}>
                    <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center justify-between ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                        <span>Admin Teraktif</span>
                        <Sparkles className={`h-3.5 w-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                    </div>
                    <div className={`text-sm font-extrabold truncate ${isDark ? 'text-white' : 'text-slate-900'}`} title={stats.topAdmin}>
                        {stats.topAdmin}
                    </div>
                </div>
            </div>

            {/* 3. Search & Filter Bar */}
            <div className={`rounded-2xl border p-3.5 sm:p-4 shadow-md space-y-3 ${
                isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white/90'
            }`}>
                <div className="flex flex-col md:flex-row items-center gap-3">
                    {/* Search Input */}
                    <div className="relative w-full md:flex-1">
                        <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Cari nama akun staf, admin pelaksana, IP address..."
                            className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all ${
                                isDark
                                    ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-500 focus:border-emerald-500'
                                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-emerald-600'
                            }`}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer ${
                                    isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {/* Time Range & Action Filters */}
                    <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
                        {/* Time Period Filter */}
                        <select
                            value={timeFilter}
                            onChange={(e) => setTimeFilter(e.target.value)}
                            aria-label="Rentang Waktu Audit"
                            className={`w-full sm:w-44 px-3.5 py-2.5 rounded-xl border text-xs font-semibold focus:outline-none cursor-pointer ${
                                isDark
                                    ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                            }`}
                        >
                            <option value="all">Semua Waktu</option>
                            <option value="today">Hari Ini</option>
                            <option value="week">1 Minggu Terakhir</option>
                            <option value="month">1 Bulan Terakhir</option>
                            <option value="6months">6 Bulan Terakhir</option>
                            <option value="year">1 Tahun Terakhir</option>
                        </select>

                        {/* Action Filter */}
                        <select
                            value={actionFilter}
                            onChange={(e) => setActionFilter(e.target.value)}
                            aria-label="Filter Tipe Aksi"
                            className={`w-full sm:w-52 px-3.5 py-2.5 rounded-xl border text-xs font-semibold focus:outline-none cursor-pointer ${
                                isDark
                                    ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                            }`}
                        >
                            <option value="all">Semua Tipe Aksi</option>
                            <option value="profile_permission">Perubahan Izin / Profil</option>
                            <option value="password">Reset Password</option>
                            <option value="created">User Baru Dibuat</option>
                            <option value="archive">Di-Archive (Soft Delete)</option>
                            <option value="restore">Dipulihkan</option>
                            <option value="sheet_sync">Sinkronisasi Spreadsheet</option>
                        </select>

                        <button
                            type="button"
                            onClick={() => fetchLogs(timeFilter)}
                            disabled={loading}
                            title="Segarkan Log Audit"
                            className={`p-2.5 rounded-xl border transition-all cursor-pointer shrink-0 ${
                                isDark
                                    ? 'bg-slate-950 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
                                    : 'bg-white border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                            }`}
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-emerald-500' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* 4. Logs List: Desktop Table & Mobile Cards */}
            {loading && logs.length === 0 ? (
                <div className={`rounded-2xl border p-12 text-center ${
                    isDark ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white/90'
                }`}>
                    <RefreshCw className={`h-7 w-7 animate-spin mx-auto mb-3 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                    <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Memuat riwayat keamanan audit...</p>
                    <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Mengambil log dari database dan cloud spreadsheet</p>
                </div>
            ) : filteredLogs.length === 0 ? (
                <div className={`rounded-2xl border p-12 text-center space-y-2 ${
                    isDark ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white/90'
                }`}>
                    <Shield className={`h-10 w-10 mx-auto ${isDark ? 'text-slate-600' : 'text-slate-300'}`} />
                    <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Tidak ada log audit yang cocok</p>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {searchQuery || actionFilter !== 'all' 
                            ? 'Coba sesuaikan kata kunci pencarian atau reset filter aksi.' 
                            : 'Belum ada aktivitas keamanan yang tercatat di sistem.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {/* Desktop Table */}
                    <div className={`hidden md:block rounded-2xl border shadow-md overflow-hidden ${
                        isDark ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white/90'
                    }`}>
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className={`border-b text-[11px] font-extrabold uppercase tracking-wider ${
                                    isDark
                                        ? 'border-slate-800 bg-slate-950/70 text-slate-400'
                                        : 'border-slate-200 bg-slate-50 text-slate-600'
                                }`}>
                                    <th className="py-3.5 px-4 w-48">Waktu (WIB)</th>
                                    <th className="py-3.5 px-4 w-52">Tipe Aksi</th>
                                    <th className="py-3.5 px-4">Pengguna Target</th>
                                    <th className="py-3.5 px-4">Admin Pelaksana</th>
                                    <th className="py-3.5 px-4 w-32">Alamat IP</th>
                                    <th className="py-3.5 px-4 text-right w-44">Rincian Perubahan</th>
                                </tr>
                            </thead>
                            <tbody className={`divide-y text-xs ${isDark ? 'divide-slate-800/70' : 'divide-slate-200'}`}>
                                {(() => {
                                    let currentMonth = null;
                                    return filteredLogs.map(log => {
                                        const logMonth = getMonthLabel(log.created_at);
                                        const showDivider = logMonth && logMonth !== currentMonth;
                                        if (showDivider) {
                                            currentMonth = logMonth;
                                        }
                                        const isExpanded = expandedId === log.id;
                                        return (
                                            <React.Fragment key={log.id}>
                                                {showDivider && (
                                                    <tr className={`border-y ${isDark ? 'bg-slate-950 border-emerald-500/30' : 'bg-emerald-50/70 border-emerald-200'}`}>
                                                        <td colSpan={6} className="py-2.5 px-4">
                                                            <div className={`flex items-center gap-2 text-xs font-extrabold tracking-wider uppercase ${
                                                                isDark ? 'text-emerald-400' : 'text-emerald-700'
                                                            }`}>
                                                                <Calendar className="h-3.5 w-3.5" />
                                                                <span>Periode: {logMonth}</span>
                                                                <div className={`flex-1 h-px ${isDark ? 'bg-slate-800' : 'bg-emerald-200'}`} />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                <tr className={`transition-colors ${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}>
                                                    <td className={`py-3.5 px-4 font-mono text-[11px] whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        <div className="flex items-center gap-1.5">
                                                            <Clock className={`h-3.5 w-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                                            <span>{formatDate(log.created_at)}</span>
                                                        </div>
                                                    </td>
                                                <td className="py-3.5 px-4">
                                                    {getActionBadge(log)}
                                                </td>
                                                <td className={`py-3.5 px-4 font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                    <div>{getDisplayTargetName(log)}</div>
                                                    {renderInlineDiffSummary(log)}
                                                </td>
                                                <td className={`py-3.5 px-4 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                                    <div className="flex items-center gap-1.5">
                                                        <User className={`h-3.5 w-3.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                                                        <span className="font-semibold">{log.admin_name}</span>
                                                    </div>
                                                </td>
                                                <td className={`py-3.5 px-4 font-mono text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                    {log.ip_address || '-'}
                                                </td>
                                                <td className="py-3.5 px-4 text-right">
                                                    {log.changes ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedId(isExpanded ? null : log.id)}
                                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                                                                isDark
                                                                    ? 'bg-slate-950 hover:bg-slate-800 text-emerald-300 border-slate-700'
                                                                    : 'bg-slate-50 hover:bg-emerald-50 text-emerald-700 border-slate-300 hover:border-emerald-300'
                                                            }`}
                                                        >
                                                            <span>{isExpanded ? 'Tutup' : 'Lihat Diff'}</span>
                                                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                        </button>
                                                    ) : (
                                                        <span className="text-slate-400 text-[11px]">-</span>
                                                    )}
                                                </td>
                                            </tr>

                                            {/* Expandable diff row */}
                                            {isExpanded && log.changes && (
                                                <tr className={`border-b ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                                    <td colSpan={6} className="p-4 sm:p-5">
                                                        <div className={`rounded-xl border p-4 space-y-2 ${
                                                            isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white'
                                                        }`}>
                                                            <div className={`flex items-center justify-between pb-2 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                                                <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                                    Detail Komparasi Perubahan Akun: {log.target_user_name}
                                                                </span>
                                                                <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                    Dicatat oleh {log.admin_name} ({formatDate(log.created_at)})
                                                                </span>
                                                            </div>
                                                            <AuditDiffViewer log={log} />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                });
                                })()}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards List */}
                    <div className="block md:hidden space-y-3">
                        {(() => {
                            let mobileCurrentMonth = null;
                            return filteredLogs.map(log => {
                                const isExpanded = expandedId === log.id;
                                const logMonth = getMonthLabel(log.created_at);
                                const showDivider = logMonth && logMonth !== mobileCurrentMonth;
                                if (showDivider) {
                                    mobileCurrentMonth = logMonth;
                                }

                                return (
                                    <React.Fragment key={log.id}>
                                        {showDivider && (
                                            <div className={`flex items-center gap-2 py-2 px-1 text-xs font-extrabold tracking-wider uppercase ${
                                                isDark ? 'text-emerald-400' : 'text-emerald-700'
                                            }`}>
                                                <Calendar className="h-3.5 w-3.5" />
                                                <span>Periode: {logMonth}</span>
                                                <div className={`flex-1 h-px ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                                            </div>
                                        )}
                                        <div 
                                            className={`rounded-2xl border p-4 space-y-2.5 shadow-sm ${
                                                isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white/95'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="space-y-1">
                                                    {getActionBadge(log)}
                                                    <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                        {getDisplayTargetName(log)}
                                                    </div>
                                                    {renderInlineDiffSummary(log)}
                                                    <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                                        Oleh: <strong className={isDark ? 'text-emerald-300' : 'text-emerald-700'}>{log.admin_name}</strong>
                                                    </div>
                                                </div>

                                                <div className="text-right shrink-0">
                                                    <div className={`text-[11px] flex items-center justify-end gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        <Clock className={`h-3 w-3 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                                        <span>{formatDate(log.created_at)}</span>
                                                    </div>
                                                    {log.ip_address && (
                                                        <span className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                            IP: {log.ip_address}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Diff toggle */}
                                            {log.changes && (
                                                <div className={`pt-1 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                                                        className={`w-full flex items-center justify-between text-xs font-semibold py-1 cursor-pointer ${
                                                            isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-700 hover:text-emerald-800'
                                                        }`}
                                                    >
                                                        <span>{isExpanded ? 'Sembunyikan Rincian' : 'Lihat Rincian Perubahan'}</span>
                                                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                    </button>

                                                    {isExpanded && (
                                                        <div className={`mt-2 pt-2 border-t animate-in fade-in duration-200 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                                            <AuditDiffViewer log={log} />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </React.Fragment>
                                );
                            });
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
}
export default AuditTrailTab;
