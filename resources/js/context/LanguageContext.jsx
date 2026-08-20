import { createContext, useContext, useState, useEffect } from 'react';

const translations = {
    en: {
        // Header & Nav
        system_title: 'Issue Tracking System',
        dashboard: 'Dashboard',
        analytics: 'Analytics',
        search_placeholder: 'Search issues or locations...',
        search_analytics_placeholder: 'Search recent issue activity...',
        period: 'Period',
        export_pdf: 'Export PDF',
        emergency: 'EMERGENCY',
        report_issue: 'Report Issue',
        
        // Dashboard Page
        facility_dashboard: 'Community facility dashboard',
        dashboard_desc: "Report what's broken, claim a job, and log the fix — connected directly to Google Sheets & Drive.",
        sync_sheets: 'Sync Sheets',
        total_reports: 'Total Reports',
        needs_fixing: 'Needs Fixing',
        in_progress: 'In Progress',
        resolved: 'Resolved',
        
        // Overdue Alert
        overdue_alert: 'OVERDUE CRITICAL ISSUES',
        unclaimed: 'Unclaimed',
        unmute_alarm: 'Unmute Alarm',
        sound_active: 'Sound Active (Click to Mute)',

        // Filters
        category: 'Category',
        department: 'Department',
        all: 'All',
        open: 'Open',
        pending: 'Pending',
        solved: 'Solved',
        all_categories: 'All Categories',
        all_departments: 'All Departments',
        filter_by_category: 'Filter by Category',
        filter_by_dept: 'Filter by Department',

        // Issue Card
        original_problem: 'Original Problem',
        reported_by: 'Reported by',
        currently_pending: 'Currently pending by',
        claim_job: 'Claim Job',
        resolve_issue: 'Resolve Issue',
        view_details: 'View Details',
        solved_details: 'Solved Details',

        // Modals
        report_new_issue: 'Report New Issue',
        report_emergency: 'Report EMERGENCY Issue',
        location: 'Location',
        title: 'Title / Description',
        priority: 'Priority',
        photo: 'Photo',
        submit: 'Submit Report',
        cancel: 'Cancel',

        // Analytics
        performance_analytics: 'Performance & Resolution Analytics',
        analytics_desc: 'Comprehensive breakdown of resort maintenance metrics, response times, and team performance.',
        response_time: 'Avg Response Time',
        resolution_rate: 'Resolution Rate',
        critical_issues: 'Critical Issues',
        department_breakdown: 'Department Breakdown',
        category_distribution: 'Category Distribution',

        // Analytics Page
        issues_by_category: 'Issues by Category',
        issues_by_department: 'Issues by Department',
        total_issues: 'Total Issues',
        no_data: 'No data available',
        recent_activity: 'Recent Issue Activity',
        no_recent_activity: 'No recent activity.',
        show: 'Show',
        items: 'Items',
        all_items: 'All',
        date_na: 'Date N/A',
        critical: 'Critical',
        by_reporter: 'by',
        photo_pending: '📷 Pending photo',
        photo_report: '📷 Report photo',
        select_sheets: 'Select Data Sheets',
        combine_sheets_desc: 'Select one or more sheets to view combined analytics across multiple periods.',
        all_sheets: 'All Sheets',
        combining_sheets: 'Combining',
        sheets_label: 'sheets',
        active_issues_count: 'issues loaded',
        time_range: 'Time Range',
        filter_time_range: 'Filter by Time Range',
        all_time: 'All Time',
        today: 'Today',
        days_3: '3 Days',
        days_7: '7 Days',
        week_1: '1 Week',
        weeks_2: '2 Weeks',
        weeks_3: '3 Weeks',
        weeks_4: '4 Weeks',
        month_1: '1 Month',
        months_3: '3 Months',
        months_6: '6 Months',
        year_1: '1 Year',
        showing_filtered_range: 'Showing data for',
    },
    id: {
        // Header & Nav
        system_title: 'Sistem Pelaporan Kerusakan',
        dashboard: 'Dashboard',
        analytics: 'Analistik',
        search_placeholder: 'Cari laporan atau lokasi...',
        search_analytics_placeholder: 'Cari aktivitas laporan terbaru...',
        period: 'Periode',
        export_pdf: 'Ekspor PDF',
        emergency: 'DARURAT',
        report_issue: 'Buat Laporan',

        // Dashboard Page
        facility_dashboard: 'Dashboard Fasilitas Komunitas',
        dashboard_desc: 'Laporkan kerusakan, klaim pekerjaan, dan catat perbaikan — terhubung langsung ke Google Sheets & Drive.',
        sync_sheets: 'Sinkronkan Sheets',
        total_reports: 'Total Laporan',
        needs_fixing: 'Perlu Perbaikan',
        in_progress: 'Dalam Proses',
        resolved: 'Selesai',

        // Overdue Alert
        overdue_alert: 'LAPORAN KRITIS TERLAMBAT',
        unclaimed: 'Belum Diklaim',
        unmute_alarm: 'Nyalakan Suara Alarm',
        sound_active: 'Suara Aktif (Klik untuk Matikan)',

        // Filters
        category: 'Kategori',
        department: 'Departemen',
        all: 'Semua',
        open: 'Terbuka',
        pending: 'Tertunda',
        solved: 'Selesai',
        all_categories: 'Semua Kategori',
        all_departments: 'Semua Departemen',
        filter_by_category: 'Filter Berdasarkan Kategori',
        filter_by_dept: 'Filter Berdasarkan Departemen',

        // Issue Card
        original_problem: 'Masalah Awal',
        reported_by: 'Dilaporkan oleh',
        currently_pending: 'Saat ini tertunda oleh',
        claim_job: 'Klaim Pekerjaan',
        resolve_issue: 'Selesaikan Laporan',
        view_details: 'Lihat Detail',
        solved_details: 'Detail Penyelesaian',

        // Modals
        report_new_issue: 'Buat Laporan Baru',
        report_emergency: 'Buat Laporan DARURAT',
        location: 'Lokasi',
        title: 'Judul / Deskripsi',
        priority: 'Prioritas',
        photo: 'Foto',
        submit: 'Kirim Laporan',
        cancel: 'Batal',

        // Analytics
        performance_analytics: 'Analistik Kinerja & Penyelesaian',
        analytics_desc: 'Rincian komprehensif metrik pemeliharaan resort, waktu respon, dan kinerja tim.',
        response_time: 'Rata-rata Waktu Respon',
        resolution_rate: 'Tingkat Penyelesaian',
        critical_issues: 'Laporan Kritis',
        department_breakdown: 'Rincian Per Departemen',
        category_distribution: 'Distribusi Kategori',

        // Analytics Page
        issues_by_category: 'Laporan per Kategori',
        issues_by_department: 'Laporan per Departemen',
        total_issues: 'Total Laporan',
        no_data: 'Tidak ada data',
        recent_activity: 'Aktivitas Laporan Terbaru',
        no_recent_activity: 'Belum ada aktivitas.',
        show: 'Tampilkan',
        items: 'Item',
        all_items: 'Semua',
        date_na: 'Tanggal N/A',
        critical: 'Kritis',
        by_reporter: 'oleh',
        photo_pending: '📷 Foto tertunda',
        photo_report: '📷 Foto laporan',
        select_sheets: 'Pilih Sheet Data',
        combine_sheets_desc: 'Pilih satu atau beberapa sheet untuk melihat analistik gabungan dari berbagai periode.',
        all_sheets: 'Semua Sheet',
        combining_sheets: 'Menggabungkan',
        sheets_label: 'sheet',
        active_issues_count: 'laporan dimuat',
        time_range: 'Rentang Waktu',
        filter_time_range: 'Filter Rentang Waktu',
        all_time: 'Semua Waktu',
        today: 'Hari Ini',
        days_3: '3 Hari',
        days_7: '7 Hari',
        week_1: '1 Minggu',
        weeks_2: '2 Minggu',
        weeks_3: '3 Minggu',
        weeks_4: '4 Minggu',
        month_1: '1 Bulan',
        months_3: '3 Bulan',
        months_6: '6 Bulan',
        year_1: '1 Tahun',
        showing_filtered_range: 'Menampilkan data untuk',
    }
};

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
    const [lang, setLangState] = useState(() => {
        return localStorage.getItem('app_lang') || 'en';
    });

    const setLang = (newLang) => {
        setLangState(newLang);
        localStorage.setItem('app_lang', newLang);
    };

    const t = (key) => {
        return translations[lang]?.[key] || translations.en?.[key] || key;
    };

    return (
        <LanguageContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
