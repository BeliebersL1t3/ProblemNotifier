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

export function AuditTrailTab() {
    const { lang } = useLanguage();
    const [logs, setLogs] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [spreadsheetUrl, setSpreadsheetUrl] = useState('https://docs.google.com/spreadsheets/d/11FJllelJdd37tR9dUnCawgU1iycm6bQOLMgHM2t-z84/edit?usp=sharing');
    const [syncingSheet, setSyncingSheet] = useState(false);
    const [syncFeedback, setSyncFeedback] = useState(null);

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

    const handleSyncSheet = async () => {
        setSyncingSheet(true);
        setSyncFeedback(null);
        try {
            const res = await axios.post('/api/user-audit-logs/sync-sheet');
            if (res.data?.success) {
                setSyncFeedback({ 
                    success: true, 
                    message: res.data.message || 'Berhasil menyinkronkan seluruh riwayat ke Google Spreadsheet.' 
                });
                if (res.data.spreadsheet_url) {
                    setSpreadsheetUrl(res.data.spreadsheet_url);
                }
                fetchLogs();
            } else {
                setSyncFeedback({ success: false, message: res.data?.message || 'Gagal menyinkronkan data' });
            }
        } catch (e) {
            setSyncFeedback({ 
                success: false, 
                message: e.response?.data?.message || 'Terjadi kesalahan sistem saat sinkronisasi' 
            });
        } finally {
            setSyncingSheet(false);
            setTimeout(() => setSyncFeedback(null), 6000);
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
                if (actionFilter === 'password' && log.action !== 'PASSWORD_RESET') return false;
                if (actionFilter === 'profile_permission' && !['USER_UPDATED', 'PERMISSIONS_UPDATED', 'BATCH_PERMISSIONS_UPDATED', 'USER_PERMISSIONS_BATCH_UPDATED'].includes(log.action)) return false;
                if (actionFilter === 'created' && log.action !== 'USER_CREATED') return false;
                if (actionFilter === 'archive' && !['USER_ARCHIVED', 'BATCH_USERS_ARCHIVED'].includes(log.action)) return false;
                if (actionFilter === 'restore' && !['USER_RESTORED', 'BATCH_USERS_RESTORED'].includes(log.action)) return false;
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
            if (['USER_UPDATED', 'PERMISSIONS_UPDATED', 'BATCH_PERMISSIONS_UPDATED'].includes(log.action)) {
                countPerms++;
            }
            if (log.action === 'PASSWORD_RESET') {
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

    const getActionBadge = (log) => {
        const action = log?.action;
        switch (action) {
            case 'USER_CREATED':
                return <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">User Baru</span>;
            case 'PASSWORD_RESET':
                return <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Reset Password</span>;
            case 'USER_ARCHIVED':
                return <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">Di-Archive (Soft Delete)</span>;
            case 'BATCH_USERS_ARCHIVED':
                return (
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-1.5">
                        <span>Hapus Massal (Archive)</span>
                        {log?.changes?.account_count && (
                            <span className="px-1.5 py-0.2 rounded bg-red-600 text-white font-black text-[9px]">
                                {log.changes.account_count}
                            </span>
                        )}
                    </span>
                );
            case 'USER_RESTORED':
                return <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">Dipulihkan</span>;
            case 'BATCH_USERS_RESTORED':
                return (
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1.5">
                        <span>Pulihkan Massal</span>
                        {log?.changes?.account_count && (
                            <span className="px-1.5 py-0.2 rounded bg-purple-600 text-white font-black text-[9px]">
                                {log.changes.account_count}
                            </span>
                        )}
                    </span>
                );
            case 'BATCH_PERMISSIONS_UPDATED':
            case 'USER_PERMISSIONS_BATCH_UPDATED':
                return (
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#C9AA71]/20 text-[#E3D1AA] border border-[#C9AA71]/40 flex items-center gap-1.5">
                        <span>Izin Massal</span>
                        {log?.changes?.account_count && (
                            <span className="px-1.5 py-0.2 rounded bg-[#C9AA71] text-[#1C1B0E] font-black text-[9px]">
                                {log.changes.account_count} Akun
                            </span>
                        )}
                    </span>
                );
            case 'PERMISSIONS_UPDATED':
                return <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">Izin Diubah</span>;
            case 'USER_UPDATED': {
                const diffs = extractDifferences(log?.changes);
                const hasPerms = diffs.some(d => d.type === 'permission');
                const hasFields = diffs.some(d => d.type === 'field');
                const hasPass = diffs.some(d => d.type === 'password');

                if (hasPerms && !hasFields && !hasPass) {
                    return <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">Izin Diubah</span>;
                }
                if (hasFields && !hasPerms && !hasPass) {
                    return <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">Profil Diperbarui</span>;
                }
                if (hasPass && !hasFields && !hasPerms) {
                    return <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Reset Password</span>;
                }
                if (hasPerms && hasFields) {
                    return <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Profil & Izin Diubah</span>;
                }
                return <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">Data Diperbarui</span>;
            }
            default:
                return <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-gray-500/20 text-gray-300 border border-gray-500/30">{action}</span>;
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
            <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-[#1C1B0E] to-[#2A281E] p-4 sm:p-5 shadow-xl">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-inner shrink-0">
                            <FileSpreadsheet className="h-6 w-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h3 className="text-base sm:text-lg font-extrabold text-[#FAFAFA]">
                                    Google Spreadsheet Audit Trail
                                </h3>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                    LIVE AUTO-APPEND
                                </span>
                            </div>
                            <p className="text-xs text-[#A19F8D] mt-0.5">
                                Setiap perubahan profil staf, reset password, dan hak akses otomatis tercatat dan tersinkronisasi ke Google Cloud Spreadsheet.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 w-full lg:w-auto justify-end flex-wrap">
                        <button
                            type="button"
                            onClick={handleSyncSheet}
                            disabled={syncingSheet}
                            className="flex-1 lg:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#1C1B0E] hover:bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 transition-all cursor-pointer shadow-md disabled:opacity-50"
                            title="Sinkronkan seluruh basis data audit log ke spreadsheet"
                        >
                            <RefreshCw className={`h-4 w-4 ${syncingSheet ? 'animate-spin' : ''}`} />
                            <span>{syncingSheet ? 'Menyinkronkan...' : 'Sinkronkan Sheet Sekarang'}</span>
                        </button>

                        <a
                            href={spreadsheetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 lg:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg hover:shadow-emerald-900/40 transition-all cursor-pointer"
                            title="Buka Spreadsheet di Tab Baru"
                        >
                            <ExternalLink className="h-4 w-4" />
                            <span>Buka Google Sheet</span>
                        </a>
                    </div>
                </div>

                {/* Feedback Toast */}
                {syncFeedback && (
                    <div className={`mt-3.5 p-3 rounded-xl border text-xs font-bold flex items-center gap-2.5 animate-in fade-in duration-200 ${
                        syncFeedback.success 
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200' 
                            : 'bg-red-500/20 border-red-500/40 text-red-200'
                    }`}>
                        {syncFeedback.success ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> : <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />}
                        <span>{syncFeedback.message}</span>
                    </div>
                )}
            </div>

            {/* 2. Mini Audit Dashboard Metrik */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="rounded-xl border border-[#3B3929] bg-[#2A281E]/80 p-3.5 space-y-1">
                    <div className="text-[11px] font-bold text-[#A19F8D] uppercase tracking-wider flex items-center justify-between">
                        <span>Total Log</span>
                        <Database className="h-3.5 w-3.5 text-[#A19F8D]" />
                    </div>
                    <div className="text-xl font-extrabold text-[#FAFAFA]">{stats.total}</div>
                </div>

                <div className="rounded-xl border border-[#3B3929] bg-[#2A281E]/80 p-3.5 space-y-1">
                    <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
                        <span>24 Jam Terakhir</span>
                        <Clock className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div className="text-xl font-extrabold text-emerald-400">{stats.count24h}</div>
                </div>

                <div className="rounded-xl border border-[#3B3929] bg-[#2A281E]/80 p-3.5 space-y-1">
                    <div className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Perubahan Izin</span>
                        <Sliders className="h-3.5 w-3.5 text-sky-400" />
                    </div>
                    <div className="text-xl font-extrabold text-sky-400">{stats.countPerms}</div>
                </div>

                <div className="rounded-xl border border-[#3B3929] bg-[#2A281E]/80 p-3.5 space-y-1">
                    <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Reset Password</span>
                        <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                    </div>
                    <div className="text-xl font-extrabold text-amber-400">{stats.countPass}</div>
                </div>

                <div className="rounded-xl border border-[#3B3929] bg-[#2A281E]/80 p-3.5 space-y-1 col-span-2 sm:col-span-1">
                    <div className="text-[11px] font-bold text-[#C9AA71] uppercase tracking-wider flex items-center justify-between">
                        <span>Admin Teraktif</span>
                        <Sparkles className="h-3.5 w-3.5 text-[#C9AA71]" />
                    </div>
                    <div className="text-sm font-extrabold text-[#FAFAFA] truncate" title={stats.topAdmin}>
                        {stats.topAdmin}
                    </div>
                </div>
            </div>

            {/* 3. Search & Filter Bar */}
            <div className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/90 p-3.5 sm:p-4 shadow-xl space-y-3">
                <div className="flex flex-col md:flex-row items-center gap-3">
                    {/* Search Input */}
                    <div className="relative w-full md:flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A19F8D]" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Cari nama akun staf, admin pelaksana, IP address..."
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1C1B0E] border border-[#3B3929] text-xs text-[#FAFAFA] placeholder-[#A19F8D]/60 focus:outline-none focus:border-[#C9AA71] focus:ring-1 focus:ring-[#C9AA71] transition-all"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#A19F8D] hover:text-[#FAFAFA]"
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
                            className="w-full sm:w-44 px-3.5 py-2.5 rounded-xl bg-[#1C1B0E] border border-[#3B3929] text-xs font-semibold text-[#FAFAFA] focus:outline-none focus:border-[#C9AA71] cursor-pointer"
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
                            className="w-full sm:w-52 px-3.5 py-2.5 rounded-xl bg-[#1C1B0E] border border-[#3B3929] text-xs font-semibold text-[#FAFAFA] focus:outline-none focus:border-[#C9AA71] cursor-pointer"
                        >
                            <option value="all">Semua Tipe Aksi</option>
                            <option value="profile_permission">Perubahan Izin / Profil</option>
                            <option value="password">Reset Password</option>
                            <option value="created">User Baru Dibuat</option>
                            <option value="archive">Di-Archive (Soft Delete)</option>
                            <option value="restore">Dipulihkan</option>
                        </select>

                        <button
                            type="button"
                            onClick={() => fetchLogs(timeFilter)}
                            disabled={loading}
                            title="Segarkan Log Audit"
                            className="p-2.5 rounded-xl bg-[#1C1B0E] border border-[#3B3929] text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#3B3929] transition-all cursor-pointer shrink-0"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-[#C9AA71]' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* 4. Logs List: Desktop Table & Mobile Cards */}
            {loading && logs.length === 0 ? (
                <div className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/60 p-12 text-center">
                    <RefreshCw className="h-7 w-7 animate-spin text-[#C9AA71] mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[#FAFAFA]">Memuat riwayat keamanan audit...</p>
                    <p className="text-xs text-[#A19F8D] mt-1">Mengambil log dari database dan cloud spreadsheet</p>
                </div>
            ) : filteredLogs.length === 0 ? (
                <div className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/60 p-12 text-center space-y-2">
                    <Shield className="h-10 w-10 text-[#3B3929] mx-auto" />
                    <p className="text-sm font-bold text-[#FAFAFA]">Tidak ada log audit yang cocok</p>
                    <p className="text-xs text-[#A19F8D]">
                        {searchQuery || actionFilter !== 'all' 
                            ? 'Coba sesuaikan kata kunci pencarian atau reset filter aksi.' 
                            : 'Belum ada aktivitas keamanan yang tercatat di sistem.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {/* Desktop Table */}
                    <div className="hidden md:block rounded-2xl border border-[#3B3929] bg-[#2A281E]/80 shadow-xl overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[#3B3929] bg-[#1C1B0E]/60 text-[11px] font-extrabold uppercase tracking-wider text-[#A19F8D]">
                                    <th className="py-3.5 px-4 w-48">Waktu (WIB)</th>
                                    <th className="py-3.5 px-4 w-52">Tipe Aksi</th>
                                    <th className="py-3.5 px-4">Pengguna Target</th>
                                    <th className="py-3.5 px-4">Admin Pelaksana</th>
                                    <th className="py-3.5 px-4 w-32">Alamat IP</th>
                                    <th className="py-3.5 px-4 text-right w-44">Rincian Perubahan</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#3B3929]/50 text-xs">
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
                                                    <tr className="bg-[#1C1B0E] border-y border-[#C9AA71]/30">
                                                        <td colSpan={6} className="py-2.5 px-4">
                                                            <div className="flex items-center gap-2 text-xs font-extrabold text-[#C9AA71] tracking-wider uppercase">
                                                                <Calendar className="h-3.5 w-3.5 text-[#C9AA71]" />
                                                                <span>Periode: {logMonth}</span>
                                                                <div className="flex-1 h-px bg-[#3B3929]/80" />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                <tr className="hover:bg-[#1C1B0E]/40 transition-colors">
                                                    <td className="py-3.5 px-4 text-[#A19F8D] font-mono text-[11px] whitespace-nowrap">
                                                        <div className="flex items-center gap-1.5">
                                                            <Clock className="h-3.5 w-3.5 text-[#C9AA71]" />
                                                            <span>{formatDate(log.created_at)}</span>
                                                        </div>
                                                    </td>
                                                <td className="py-3.5 px-4">
                                                    {getActionBadge(log)}
                                                </td>
                                                <td className="py-3.5 px-4 font-bold text-[#FAFAFA]">
                                                    {log.target_user_name || '-'}
                                                </td>
                                                <td className="py-3.5 px-4 text-[#E3D1AA]">
                                                    <div className="flex items-center gap-1.5">
                                                        <User className="h-3.5 w-3.5 text-[#A19F8D]" />
                                                        <span className="font-semibold">{log.admin_name}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3.5 px-4 text-[#A19F8D] font-mono text-[11px]">
                                                    {log.ip_address || '-'}
                                                </td>
                                                <td className="py-3.5 px-4 text-right">
                                                    {log.changes ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedId(isExpanded ? null : log.id)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#1C1B0E] hover:bg-[#3B3929] text-[#C9AA71] border border-[#3B3929] transition-all cursor-pointer"
                                                        >
                                                            <span>{isExpanded ? 'Tutup' : 'Lihat Diff'}</span>
                                                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                        </button>
                                                    ) : (
                                                        <span className="text-[#A19F8D]/50 text-[11px]">-</span>
                                                    )}
                                                </td>
                                            </tr>

                                            {/* Expandable diff row */}
                                            {isExpanded && log.changes && (
                                                <tr className="bg-[#1C1B0E]/80 border-b border-[#3B3929]">
                                                    <td colSpan={6} className="p-4 sm:p-5">
                                                        <div className="rounded-xl border border-[#3B3929] bg-[#2A281E]/90 p-4 space-y-2">
                                                            <div className="flex items-center justify-between pb-2 border-b border-[#3B3929]">
                                                                <span className="text-xs font-bold text-[#FAFAFA]">
                                                                    Detail Komparasi Perubahan Akun: {log.target_user_name}
                                                                </span>
                                                                <span className="text-[11px] text-[#A19F8D]">
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
                                            <div className="flex items-center gap-2 py-2 px-1 text-xs font-extrabold text-[#C9AA71] tracking-wider uppercase">
                                                <Calendar className="h-3.5 w-3.5 text-[#C9AA71]" />
                                                <span>Periode: {logMonth}</span>
                                                <div className="flex-1 h-px bg-[#3B3929]/80" />
                                            </div>
                                        )}
                                        <div 
                                            className="rounded-2xl border border-[#3B3929] bg-[#2A281E]/90 p-4 space-y-2.5 shadow-md"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="space-y-1">
                                                    {getActionBadge(log)}
                                                    <div className="text-sm font-bold text-[#FAFAFA]">
                                                        {log.target_user_name}
                                                    </div>
                                                    <div className="text-xs text-[#A19F8D]">
                                                        Oleh: <strong className="text-[#E3D1AA]">{log.admin_name}</strong>
                                                    </div>
                                                </div>

                                                <div className="text-right shrink-0">
                                                    <div className="text-[11px] text-[#A19F8D] flex items-center justify-end gap-1">
                                                        <Clock className="h-3 w-3 text-[#C9AA71]" />
                                                        <span>{formatDate(log.created_at)}</span>
                                                    </div>
                                                    {log.ip_address && (
                                                        <span className="text-[10px] text-[#A19F8D]/60 font-mono">
                                                            IP: {log.ip_address}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Diff toggle */}
                                            {log.changes && (
                                                <div className="pt-1 border-t border-[#3B3929]/50">
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                                                        className="w-full flex items-center justify-between text-xs font-semibold text-[#C9AA71] hover:text-[#E3D1AA] py-1 cursor-pointer"
                                                    >
                                                        <span>{isExpanded ? 'Sembunyikan Rincian' : 'Lihat Rincian Perubahan'}</span>
                                                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                    </button>

                                                    {isExpanded && (
                                                        <div className="mt-2 pt-2 border-t border-[#3B3929] animate-in fade-in duration-200">
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
