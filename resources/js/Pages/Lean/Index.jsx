import React, { useState, useEffect, useMemo } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import { 
    AlertTriangle, 
    CheckCircle2, 
    Clock, 
    Plus, 
    Camera, 
    RefreshCw, 
    X, 
    ChevronRight, 
    User, 
    MapPin, 
    Building2, 
    ShieldCheck, 
    Trash2, 
    Filter,
    Check,
    ArrowLeft,
    ArrowUpDown,
    Image as ImageIcon,
    AlertCircle,
    ExternalLink,
    LogIn,
    Power,
    MessageSquare,
    Table,
    LayoutGrid,
    SlidersHorizontal,
    Search,
    Eye,
    EyeOff,
    RotateCcw,
    BarChart3,
    Sparkles,
    Sun,
    Moon,
    Compass,
    Wrench,
    LayoutDashboard,
    Wifi,
    WifiOff,
    CloudUpload,
    Send,
    HardDrive
} from 'lucide-react';
import axios from 'axios';
import { BotControlModal } from '@/Components/CampusFix/BotControlModal';
import { LeanAnalyticsView } from '@/Components/CampusFix/LeanAnalyticsView';
import { resolveIssueResortAndZone } from '@/constants/locations';
import { DEPARTMENT_STAFF } from '@/constants/staff';
import { compressImage } from '@/services/imageCompressor';
import {
    addToOutbox,
    getOutboxCount,
    getOutboxTickets,
    removeOutboxTicket,
    syncAllOutboxTickets,
    registerOutboxAutoSync
} from '@/services/offlineOutbox';



const URGENCY_COLORS = {
    'Darurat': '#f43f5e',
    'Tinggi': '#fb923c',
    'Sedang': '#facc15',
    'Rendah': '#10b981',
};

const COLUMN_DEFS = [
    { id: 'id', label: 'ID Isu', icon: '#' },
    { id: 'photo', label: 'Foto Bukti', icon: '📷' },
    { id: 'title', label: 'Judul Masalah', icon: '📝' },
    { id: 'location', label: 'Lokasi', icon: '📍' },
    { id: 'dept', label: 'Departemen Tujuan', icon: '🏢' },
    { id: 'reporter', label: 'Nama Pelapor', icon: '👤' },
    { id: 'desc', label: 'Deskripsi Detail', icon: '📄' },
    { id: 'status', label: 'Status', icon: '🏷️' },
    { id: 'time', label: 'Waktu Pelaporan', icon: '🕒' },
];

const DEFAULT_COLUMNS = {
    id: true,
    photo: true,
    title: true,
    location: true,
    dept: true,
    reporter: true,
    desc: true,
    status: true,
    time: true,
};

export default function LeanIndex({ 
    issues = [], 
    departments = [], 
    locations = ['TBR', 'TPI', 'Kantor'], 
    currentUser = null,
    staffDirectory = [],
    spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/1hF2X6DrcWvOv4h77T_B4pmcNklO2-Zq2CzAiAR-UYIg/edit?usp=sharing',
    monthGids = {},
}) {
    // --- Supervisor / Department Account Info ---
    const myName = currentUser?.name || 'Supervisor';
    const myDept = currentUser?.department || 'Supervisor';

    // --- Unified staff suggestions for fast autocomplete (DB users + fallback static list) ---
    const staffSuggestions = useMemo(() => {
        const map = new Map();

        // 1. Database users first (has whatsapp_number and accurate dept)
        (staffDirectory || []).forEach(u => {
            if (u.name) {
                map.set(u.name.toLowerCase().trim(), {
                    name: u.name,
                    department: u.department || '',
                    subdivision: u.subdivision || '',
                    phone: u.whatsapp_number || '',
                });
            }
        });

        // 2. Fallback static roster from constants/staff.js
        if (DEPARTMENT_STAFF) {
            Object.entries(DEPARTMENT_STAFF).forEach(([dept, roster]) => {
                if (Array.isArray(roster)) {
                    roster.forEach(name => {
                        const key = name.toLowerCase().trim();
                        if (!map.has(key)) {
                            map.set(key, {
                                name,
                                department: dept,
                                subdivision: '',
                                phone: '',
                            });
                        }
                    });
                }
            });
        }

        return Array.from(map.values());
    }, [staffDirectory]);

    // --- UI Filters & View Modes ---
    // Department Filter: 'all' | specific department
    const [selectedDeptFilter, setSelectedDeptFilter] = useState('all');
    // Month Tab Switcher: 'all' | 1..12
    const [selectedMonthFilter, setSelectedMonthFilter] = useState('all');

    // --- ERP Customization States ---
    const [visibleColumns, setVisibleColumns] = useState(() => {
        try {
            const saved = localStorage.getItem('lean_erp_columns');
            if (saved) {
                const parsed = JSON.parse(saved);
                delete parsed.category;
                return { ...DEFAULT_COLUMNS, ...parsed };
            }
        } catch (e) {}
        return DEFAULT_COLUMNS;
    });

    const [viewMode, setViewMode] = useState(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            return 'cards';
        }
        return localStorage.getItem('lean_erp_view_mode') || 'cards';
    });

    // Multi-select status checklist
    const [selectedStatuses, setSelectedStatuses] = useState({
        open: true,
        in_progress: true,
        pending: true,
        resolved: true,
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [showColumnModal, setShowColumnModal] = useState(false);
    const [activeAnalyticsTab, setActiveAnalyticsTab] = useState('executive');
    const [focusMapRequest, setFocusMapRequest] = useState(null);
    const [returnTicket, setReturnTicket] = useState(null);

    const handleNavigateToMap = (issue) => {
        if (!issue) return;
        const res = resolveIssueResortAndZone(issue);
        if (res.isOffice || !res.resort) return;

        setReturnTicket({
            issue,
            previousViewMode: viewMode,
        });
        setSelectedDetailIssue(null);
        setViewMode('analytics');
        setActiveAnalyticsTab('executive');
        setFocusMapRequest({
            resort: res.resort,
            zoneId: res.zoneId,
            timestamp: Date.now(),
            issueTitle: issue.title,
            issueId: issue.id,
        });
    };

    // Quick Sort Mode: 'status' | 'newest' | 'oldest' | 'waiting_acc'
    const [sortBy, setSortBy] = useState(() => {
        try {
            return localStorage.getItem('telunas_field_sort_by') || 'status';
        } catch (e) {
            return 'status';
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem('telunas_field_sort_by', sortBy);
        } catch (e) {}
    }, [sortBy]);

    // Save preferences to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('lean_erp_columns', JSON.stringify(visibleColumns));
        } catch (e) {}
    }, [visibleColumns]);

    useEffect(() => {
        try {
            if (viewMode !== 'table' || (typeof window !== 'undefined' && window.innerWidth >= 768)) {
                localStorage.setItem('lean_erp_view_mode', viewMode);
            }
        } catch (e) {}
    }, [viewMode]);

    // Force fallback to 'cards' on mobile screens (< 768px)
    useEffect(() => {
        const handleResize = () => {
            if (typeof window !== 'undefined' && window.innerWidth < 768 && viewMode === 'table') {
                setViewMode('cards');
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [viewMode]);

    // Theme preference (dark / light) with LocalStorage persistence
    const [theme, setTheme] = useState(() => {
        try {
            return localStorage.getItem('telunas_field_theme') || 'dark';
        } catch (e) {
            return 'dark';
        }
    });

    const isDark = theme === 'dark';

    useEffect(() => {
        try {
            localStorage.setItem('telunas_field_theme', theme);
        } catch (e) {}
    }, [theme]);

    const toggleColumn = (colId) => {
        setVisibleColumns((prev) => ({ ...prev, [colId]: !prev[colId] }));
    };

    const setAllColumns = (val) => {
        const next = {};
        COLUMN_DEFS.forEach((c) => { next[c.id] = val; });
        setVisibleColumns(next);
    };

    const resetColumns = () => {
        setVisibleColumns(DEFAULT_COLUMNS);
    };

    const toggleStatus = (statusKey) => {
        setSelectedStatuses((prev) => {
            const next = { ...prev, [statusKey]: !prev[statusKey] };
            const hasAny = Object.values(next).some(Boolean);
            return hasAny ? next : prev;
        });
    };

    const setStatusPreset = (preset) => {
        if (preset === 'all') {
            setSelectedStatuses({ open: true, in_progress: true, pending: true, resolved: true });
        } else if (preset === 'active') {
            setSelectedStatuses({ open: true, in_progress: true, pending: true, resolved: false });
        } else if (preset === 'resolved') {
            setSelectedStatuses({ open: false, in_progress: false, pending: false, resolved: true });
        }
    };

    const activeColumnCount = useMemo(() => {
        return Object.values(visibleColumns).filter(Boolean).length;
    }, [visibleColumns]);

    // --- WhatsApp Bot V2 Control State ---
    const [botControlModalOpen, setBotControlModalOpen] = useState(false);
    const [botStatus, setBotStatus] = useState(null);

    const fetchBotStatus = async () => {
        try {
            const res = await axios.get('/api/bot/status');
            if (res.data) {
                setBotStatus(res.data);
            }
        } catch (e) {}
    };

    useEffect(() => {
        fetchBotStatus();
        const timer = setInterval(fetchBotStatus, 5000);
        return () => clearInterval(timer);
    }, []);

    // --- Real-time Auto-refresh Polling (Every 4 seconds for fresh issues sync) ---
    useEffect(() => {
        const pollTimer = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                router.reload({
                    only: ['issues'],
                    preserveScroll: true,
                    preserveState: true,
                });
            }
        }, 4000);

        return () => clearInterval(pollTimer);
    }, []);

    // --- Modal States ---
    const [selectedDetailIssue, setSelectedDetailIssue] = useState(null);
    const [showReportModal, setShowReportModal] = useState(false);
    const [showResolveModal, setShowResolveModal] = useState(null); // issue object
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [lightboxImage, setLightboxImage] = useState(null);
    const [issueToDelete, setIssueToDelete] = useState(null);
    const [deleteSupervisorName, setDeleteSupervisorName] = useState(myName || 'Supervisor');
    const [isDeleting, setIsDeleting] = useState(false);

    // Keep activeDetailIssue reactively in sync with fresh issues from polling
    const activeDetailIssue = useMemo(() => {
        if (!selectedDetailIssue) return null;
        return issues.find((i) => i.id === selectedDetailIssue.id) || selectedDetailIssue;
    }, [issues, selectedDetailIssue]);

    // --- Report Form State ---
    const [formMainLoc, setFormMainLoc] = useState('TBR');
    const [formDetailLoc, setFormDetailLoc] = useState('');
    const [formTitle, setFormTitle] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formTargetDepts, setFormTargetDepts] = useState(['Engineer']);
    const [formImage, setFormImage] = useState(null);
    const [formImagePreview, setFormImagePreview] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- Mobile & Offline Outbox State ---
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [outboxCount, setOutboxCount] = useState(0);
    const [outboxTickets, setOutboxTickets] = useState([]);
    const [showOutboxModal, setShowOutboxModal] = useState(false);
    const [isSyncingOutbox, setIsSyncingOutbox] = useState(false);
    const [startInProgress, setStartInProgress] = useState(false);
    const [staffReporterName, setStaffReporterName] = useState('');
    const [staffReporterDept, setStaffReporterDept] = useState('');
    const [staffReporterPhone, setStaffReporterPhone] = useState('');
    const [staffSearchQuery, setStaffSearchQuery] = useState('');
    const [showStaffDropdown, setShowStaffDropdown] = useState(false);
    const [assignedWorkers, setAssignedWorkers] = useState([]);
    const [customWorkerInput, setCustomWorkerInput] = useState('');

    // Coworkers in the recording leader's department for assigning
    const myDeptTeammates = useMemo(() => {
        const set = new Set();
        const list = [];

        // 1. Current user always included first
        if (myName && myName !== 'Supervisor') {
            set.add(myName.toLowerCase());
            list.push(myName);
        }

        // 2. Teammates from staffDirectory matching myDept
        (staffDirectory || []).forEach(u => {
            const name = u.name;
            if (name && u.department && myDept && u.department.toLowerCase() === myDept.toLowerCase()) {
                if (!set.has(name.toLowerCase())) {
                    set.add(name.toLowerCase());
                    list.push(name);
                }
            }
        });

        // 3. Fallback static roster for myDept from DEPARTMENT_STAFF
        if (DEPARTMENT_STAFF && myDept && DEPARTMENT_STAFF[myDept]) {
            DEPARTMENT_STAFF[myDept].forEach(name => {
                if (!set.has(name.toLowerCase())) {
                    set.add(name.toLowerCase());
                    list.push(name);
                }
            });
        }

        if (list.length === 0 && myName) {
            list.push(myName);
        }

        return list;
    }, [staffDirectory, myDept, myName]);

    // Toggle multi-select worker
    const toggleAssignedWorker = (name) => {
        setAssignedWorkers(prev => {
            if (prev.includes(name)) {
                return prev.filter(n => n !== name);
            }
            return [...prev, name];
        });
    };

    // Add custom worker name
    const handleAddCustomWorker = () => {
        const trimmed = customWorkerInput.trim();
        if (trimmed && !assignedWorkers.includes(trimmed)) {
            setAssignedWorkers(prev => [...prev, trimmed]);
            setCustomWorkerInput('');
        }
    };

    // Filter staff suggestions by name, department, or phone
    const filteredStaff = useMemo(() => {
        const query = staffSearchQuery.trim().toLowerCase();
        if (!query) return staffSuggestions.slice(0, 10);
        return staffSuggestions.filter(s =>
            s.name.toLowerCase().includes(query) ||
            (s.department && s.department.toLowerCase().includes(query)) ||
            (s.phone && s.phone.includes(query))
        ).slice(0, 15);
    }, [staffSuggestions, staffSearchQuery]);

    const handleSelectStaff = (staff) => {
        setStaffReporterName(staff.name);
        setStaffSearchQuery(staff.name);
        setStaffReporterDept(staff.department || '');
        if (staff.phone) {
            setStaffReporterPhone(staff.phone);
        }
        setShowStaffDropdown(false);
    };

    // Fetch outbox tickets & status
    const refreshOutbox = async () => {
        try {
            const count = await getOutboxCount();
            setOutboxCount(count);
            if (showOutboxModal) {
                const tickets = await getOutboxTickets();
                setOutboxTickets(tickets);
            }
        } catch (err) {
            console.error('[Index] Error fetching outbox count:', err);
        }
    };

    useEffect(() => {
        refreshOutbox();

        const cleanupAutoSync = registerOutboxAutoSync(({ isOnline: online, outboxCount: count }) => {
            setIsOnline(online);
            setOutboxCount(count);
        });

        const handleOutboxUpdate = (e) => {
            if (e.detail?.count !== undefined) {
                setOutboxCount(e.detail.count);
            } else {
                refreshOutbox();
            }
        };

        const handleOutboxSynced = (e) => {
            refreshOutbox();
            router.reload({ only: ['issues'], preserveScroll: true, preserveState: true });
        };

        window.addEventListener('telunas:outbox-updated', handleOutboxUpdate);
        window.addEventListener('telunas:outbox-synced', handleOutboxSynced);

        return () => {
            cleanupAutoSync();
            window.removeEventListener('telunas:outbox-updated', handleOutboxUpdate);
            window.removeEventListener('telunas:outbox-synced', handleOutboxSynced);
        };
    }, [showOutboxModal]);

    // Manual Outbox Sync
    const handleManualSync = async () => {
        if (!navigator.onLine) {
            alert('Perangkat Anda saat ini masih offline (belum terhubung ke internet/Wi-Fi). Silakan hubungkan internet terlebih dahulu.');
            return;
        }

        setIsSyncingOutbox(true);
        try {
            const result = await syncAllOutboxTickets();
            await refreshOutbox();
            const tickets = await getOutboxTickets();
            setOutboxTickets(tickets);

            if (result.synced > 0) {
                router.reload({ only: ['issues'], preserveScroll: true, preserveState: true });
                alert(`✅ Berhasil menyinkronkan ${result.synced} laporan ke server & Google Sheets!`);
            } else if (result.failed > 0) {
                alert(`⚠️ Ada ${result.failed} laporan yang gagal terkirim. Silakan periksa koneksi dan coba lagi.`);
            }
        } catch (err) {
            console.error('[Index] Manual sync error:', err);
            alert(`Gagal menyinkronkan antrean: ${err.message}`);
        } finally {
            setIsSyncingOutbox(false);
        }
    };

    // Delete single outbox item
    const handleDeleteOutboxItem = async (id) => {
        if (!confirm('Apakah Anda yakin ingin menghapus draf laporan ini dari antrean HP?')) {
            return;
        }
        try {
            await removeOutboxTicket(id);
            const tickets = await getOutboxTickets();
            setOutboxTickets(tickets);
            setOutboxCount(tickets.length);
        } catch (err) {
            console.error('[Index] Error deleting outbox item:', err);
            alert(`Gagal menghapus draf: ${err.message}`);
        }
    };

    // --- Resolve Form State ---
    const [resolveNote, setResolveNote] = useState('');
    const [resolveImage, setResolveImage] = useState(null);
    const [resolveImagePreview, setResolveImagePreview] = useState(null);

    // Toggle target department in form
    const toggleTargetDept = (dept) => {
        setFormTargetDepts((prev) => {
            if (prev.includes(dept)) {
                if (prev.length === 1) return prev; // Keep at least one
                return prev.filter((d) => d !== dept);
            }
            return [...prev, dept];
        });
    };

    // Handle Report Image selection
    const handleImageChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setFormImage(file);
            setFormImagePreview(URL.createObjectURL(file));
        }
    };

    // Handle Resolve Image selection
    const handleResolveImageChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setResolveImage(file);
            setResolveImagePreview(URL.createObjectURL(file));
        }
    };

    // Submit Report (Discussion-Verified Workflow with Client-Side Compression & Offline Support)
    const handleReportSubmit = async (e) => {
        e.preventDefault();
        if (!formTitle.trim()) {
            alert('Mohon isi judul / masalah yang ditemukan.');
            return;
        }

        const fullLocation = formDetailLoc.trim()
            ? `${formMainLoc} - ${formDetailLoc.trim()}`
            : formMainLoc;

        // Reporter is the staff who came to discuss; clean name without "(via ...)"
        const staffNameTrimmed = (staffReporterName || staffSearchQuery).trim();
        const actualReporter = staffNameTrimmed || myName;
        const actualReporterDept = staffReporterDept || null;

        // Responsible department: locked to the recording leader's department
        const resolvedDept = (myDept && myDept !== 'Supervisor') ? myDept : (formTargetDepts[0] || 'Engineer');
        const targetDepts = [resolvedDept];

        // Assigned workers string
        const workersStr = startInProgress
            ? (assignedWorkers.length > 0 ? assignedWorkers.join(', ') : myName)
            : null;

        setIsSubmitting(true);

        try {
            // Compress image client-side if attached
            let compressed = null;
            if (formImage) {
                try {
                    compressed = await compressImage(formImage);
                } catch (cErr) {
                    console.warn('[ReportSubmit] Compression fallback to raw file:', cErr);
                }
            }

            // Offline mode: store directly in IndexedDB outbox
            if (!navigator.onLine) {
                await addToOutbox({
                    title: formTitle.trim(),
                    description: formDescription,
                    location: fullLocation,
                    target_departments: targetDepts,
                    reporter_name: actualReporter,
                    reporter_dept: actualReporterDept,
                    reporter_phone: staffReporterPhone.trim(),
                    start_in_progress: startInProgress,
                    assigned_workers: workersStr,
                    imageBlob: compressed?.blob || formImage || null,
                    imageName: compressed?.file?.name || formImage?.name || 'offline_photo.jpg',
                    imagePreview: compressed?.dataUrl || formImagePreview,
                });

                alert('📱 Mode Offline: Laporan & foto telah tersimpan aman di HP Anda! Laporan akan otomatis terkirim begitu HP Anda kembali terhubung ke sinyal Wi-Fi / Starlink.');
                setShowReportModal(false);
                setFormDetailLoc('');
                setFormTitle('');
                setFormDescription('');
                setFormImage(null);
                setFormImagePreview(null);
                setStaffReporterName('');
                setStaffReporterDept('');
                setStaffReporterPhone('');
                setStaffSearchQuery('');
                setAssignedWorkers([]);
                setCustomWorkerInput('');
                setStartInProgress(false);
                setShowStaffDropdown(false);
                setIsSubmitting(false);
                await refreshOutbox();
                return;
            }

            // Online mode: submit to backend
            const data = new FormData();
            data.append('location', fullLocation);
            data.append('title', formTitle.trim());
            data.append('description', formDescription);
            targetDepts.forEach((d) => data.append('target_departments[]', d));
            data.append('reporter_name', actualReporter);
            if (actualReporterDept) {
                data.append('reporter_dept', actualReporterDept);
            }
            if (staffReporterPhone.trim()) {
                data.append('reporter_phone', staffReporterPhone.trim());
            }
            if (startInProgress) {
                data.append('start_in_progress', '1');
                if (workersStr) {
                    data.append('assigned_workers', workersStr);
                }
            }
            if (compressed?.file) {
                data.append('image', compressed.file);
            } else if (formImage) {
                data.append('image', formImage);
            }

            router.post('/lapangan/issues', data, {
                onSuccess: () => {
                    setShowReportModal(false);
                    setFormDetailLoc('');
                    setFormTitle('');
                    setFormDescription('');
                    setFormImage(null);
                    setFormImagePreview(null);
                    setStaffReporterName('');
                    setStaffReporterDept('');
                    setStaffReporterPhone('');
                    setStaffSearchQuery('');
                    setAssignedWorkers([]);
                    setCustomWorkerInput('');
                    setStartInProgress(false);
                    setShowStaffDropdown(false);
                    setIsSubmitting(false);
                },
                onError: async (err) => {
                    console.error('[ReportSubmit] Online submission error:', err);
                    if (!navigator.onLine) {
                        try {
                            await addToOutbox({
                                title: formTitle.trim(),
                                description: formDescription,
                                location: fullLocation,
                                target_departments: targetDepts,
                                reporter_name: actualReporter,
                                reporter_dept: actualReporterDept,
                                reporter_phone: staffReporterPhone.trim(),
                                start_in_progress: startInProgress,
                                assigned_workers: workersStr,
                                imageBlob: compressed?.blob || formImage || null,
                                imageName: compressed?.file?.name || formImage?.name || 'offline_photo.jpg',
                                imagePreview: compressed?.dataUrl || formImagePreview,
                            });
                            alert('⚠️ Koneksi terputus saat pengiriman. Laporan telah diamankan di antrean offline HP Anda.');
                            setShowReportModal(false);
                            await refreshOutbox();
                        } catch (saveErr) {
                            console.error('[ReportSubmit] Failed fallback to outbox:', saveErr);
                        }
                    }
                    setIsSubmitting(false);
                },
            });
        } catch (submitErr) {
            console.error('[ReportSubmit] Unexpected error:', submitErr);
            alert(`Gagal memproses laporan: ${submitErr.message || 'Kesalahan sistem'}`);
            setIsSubmitting(false);
        }
    };

    // Trigger ACC for a department
    const handleAcc = (issueId, dept) => {
        router.post(`/lapangan/issues/${issueId}/acc`, {
            dept: dept,
            staff_name: myName,
        }, { preserveScroll: true });
    };

    // Trigger Claim
    const handleClaim = (issueId) => {
        router.post(`/lapangan/issues/${issueId}/claim`, {
            dept: myDept,
            staff_name: myName,
        }, { preserveScroll: true });
    };

    // Trigger Resolve
    const handleResolveSubmit = (e) => {
        e.preventDefault();
        if (!showResolveModal) return;

        setIsSubmitting(true);
        const data = new FormData();
        data.append('dept', myDept);
        data.append('staff_name', myName);
        data.append('note', resolveNote);
        if (resolveImage) {
            data.append('proof_image', resolveImage);
        }

        router.post(`/lapangan/issues/${showResolveModal.id}/resolve`, data, {
            onSuccess: () => {
                setShowResolveModal(null);
                setResolveNote('');
                setResolveImage(null);
                setResolveImagePreview(null);
                setIsSubmitting(false);
            },
            onError: () => setIsSubmitting(false),
        });
    };

    // Trigger Reset Sandbox
    const handleResetSandbox = () => {
        router.post('/lapangan/reset', {}, {
            onSuccess: () => setShowResetConfirm(false),
        });
    };

    // Trigger Soft Delete Issue
    const handleDeleteConfirm = () => {
        if (!issueToDelete) return;
        setIsDeleting(true);
        router.delete(`/lapangan/issues/${issueToDelete.id}`, {
            data: {
                deleted_by: deleteSupervisorName.trim() || myName || 'Supervisor',
            },
            preserveScroll: true,
            onSuccess: () => {
                setIssueToDelete(null);
                setIsDeleting(false);
                if (selectedDetailIssue?.id === issueToDelete.id) {
                    setSelectedDetailIssue(null);
                }
            },
            onError: () => {
                setIsDeleting(false);
                alert('Gagal menghapus tiket. Silakan coba lagi.');
            },
        });
    };

    // --- Filter & Sort Issues based on Status Checklist, Department, Live Search & Sort Mode ---
    const filteredIssues = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const urgencyWeight = {
            'Darurat': 4,
            'Tinggi': 3,
            'Sedang': 2,
            'Rendah': 1,
        };

        const result = issues.filter((item) => {
            // Month tab switcher filter (12 tab bulanan Google Sheet)
            if (selectedMonthFilter !== 'all') {
                if (!item.created_at) return false;
                const d = new Date(item.created_at);
                if (isNaN(d.getTime())) return false;
                if (d.getMonth() + 1 !== parseInt(selectedMonthFilter, 10)) {
                    return false;
                }
            }

            // 1. Department filter (all vs 1 dept)
            if (selectedDeptFilter !== 'all') {
                const targets = item.target_departments || [];
                const matches = targets.some((d) => d.toLowerCase() === selectedDeptFilter.toLowerCase());
                if (!matches) return false;
            }

            // 2. Status checklist filtering
            if (!selectedStatuses[item.status]) {
                return false;
            }

            // 3. Live Search
            if (q) {
                const code = (item.issue_code || ('LEAN-' + item.id)).toLowerCase();
                const title = (item.title || '').toLowerCase();
                const desc = (item.description || '').toLowerCase();
                const loc = (item.location || '').toLowerCase();
                const rep = (item.reporter_name || '').toLowerCase();
                const dept = (item.reporter_dept || '').toLowerCase();
                const targetsStr = (item.target_departments || []).join(' ').toLowerCase();
                if (
                    !code.includes(q) &&
                    !title.includes(q) &&
                    !desc.includes(q) &&
                    !loc.includes(q) &&
                    !rep.includes(q) &&
                    !dept.includes(q) &&
                    !targetsStr.includes(q)
                ) {
                    return false;
                }
            }

            return true;
        });

        // 4. Sort Cepat Multi-Criteria
        return result.sort((a, b) => {
            if (sortBy === 'newest') {
                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            }

            if (sortBy === 'oldest') {
                return new Date(a.created_at || 0) - new Date(b.created_at || 0);
            }

            if (sortBy === 'waiting_acc') {
                // Priority: tiket yang belum ACC dari semua departemen atau belum resolved
                const aIsResolved = a.status === 'resolved';
                const bIsResolved = b.status === 'resolved';
                if (aIsResolved !== bIsResolved) {
                    return aIsResolved ? 1 : -1; // belum selesai di atas
                }

                const aAccs = a.department_accs || {};
                const bAccs = b.department_accs || {};
                const aTargets = a.target_departments || [];
                const bTargets = b.target_departments || [];

                const aPendingAcc = aTargets.some((d) => !aAccs[d]?.is_acc);
                const bPendingAcc = bTargets.some((d) => !bAccs[d]?.is_acc);

                if (aPendingAcc !== bPendingAcc) {
                    return aPendingAcc ? -1 : 1; // yang menunggu ACC di atas
                }

                // Tie-breaker: newest first
                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            }

            // Default: 'status' (Prioritas Status Terbuka / Sedang Dikerjakan)
            // Urutan: Open (4) > Pending (3) > In Progress (2) > Resolved (1)
            const statusWeight = { open: 4, pending: 3, in_progress: 2, resolved: 1 };
            const weightA = statusWeight[a.status] || 0;
            const weightB = statusWeight[b.status] || 0;

            if (weightB !== weightA) {
                return weightB - weightA;
            }

            // Secondary: Non-resolved issues before resolved issues
            const aIsResolved = a.status === 'resolved';
            const bIsResolved = b.status === 'resolved';
            if (aIsResolved !== bIsResolved) {
                return aIsResolved ? 1 : -1;
            }

            // Tie-breaker: newest first
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
    }, [issues, selectedStatuses, selectedDeptFilter, searchQuery, sortBy]);

    // Counters for status filters and totals
    const counts = useMemo(() => {
        const total = issues.length;

        // Base items for accurate status breakdown
        const baseItems = issues.filter((item) => {
            if (selectedDeptFilter !== 'all') {
                const targets = item.target_departments || [];
                if (!targets.some((d) => d.toLowerCase() === selectedDeptFilter.toLowerCase())) return false;
            }
            return true;
        });

        const open = baseItems.filter((i) => i.status === 'open').length;
        const inProgress = baseItems.filter((i) => i.status === 'in_progress').length;
        const pending = baseItems.filter((i) => i.status === 'pending').length;
        const resolved = baseItems.filter((i) => i.status === 'resolved').length;

        return { total, open, inProgress, pending, resolved };
    }, [issues, selectedDeptFilter]);

    return (
        <div className={`lean-root ${isDark ? 'lean-theme-dark text-slate-100' : 'lean-theme-light text-slate-800'} flex flex-col font-sans pb-24 md:pb-12 transition-colors duration-300 w-full max-w-full overflow-x-hidden min-h-screen`}>
            <Head title="Mode Lapangan (Sandbox) — Telunas Issue Tracker" />

            {/* TOP HEADER */}
            <header className={`sticky top-0 z-30 backdrop-blur-md border-b px-2.5 sm:px-6 lg:px-8 py-2 sm:py-2.5 shadow-xs transition-colors duration-200 w-full max-w-full overflow-hidden ${
                isDark
                    ? 'bg-slate-900/95 border-slate-800 shadow-slate-950/40'
                    : 'bg-white/95 border-slate-200 shadow-slate-200/50'
            }`}>
                <div className="w-full flex items-center justify-between gap-1.5 sm:gap-3">
                    {/* Brand & Sandbox Pill (Left) */}
                    <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink">
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm border shadow-xs shrink-0 ${
                            isDark ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                            📱
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1">
                                <h1 className={`text-xs sm:text-sm font-bold tracking-tight truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    <span className="sm:hidden">Telunas Fix</span>
                                    <span className="hidden sm:inline">Telunas Lean Tracker</span>
                                </h1>
                                <span className={`text-[8px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.2 rounded-full border shrink-0 hidden xs:inline ${
                                    isDark ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                }`}>
                                    Operasional
                                </span>
                            </div>
                            <p className={`text-[10px] sm:text-[11px] truncate hidden md:block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Telunas Resorts Tracker</p>
                        </div>
                    </div>

                    {/* View Mode Switcher (Tabel ERP / Kartu / Analisis) - Hidden on Mobile (Handled by Mobile Bottom Bar) */}
                    <div className={`hidden md:flex items-center p-0.5 sm:p-1 rounded-xl border shrink-0 ${
                        isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200 shadow-xs'
                    }`}>
                        <button
                            type="button"
                            onClick={() => setViewMode('table')}
                            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                viewMode === 'table'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : isDark
                                    ? 'text-slate-400 hover:text-slate-200'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                            }`}
                            title="Tampilan Tabel Spreadsheet ERP"
                        >
                            <Table className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Tabel ERP</span>
                            <span className="sm:hidden">Tabel</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('cards')}
                            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                viewMode === 'cards'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : isDark
                                    ? 'text-slate-400 hover:text-slate-200'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                            }`}
                            title="Tampilan Kartu Visual"
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            <span>Kartu</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('analytics')}
                            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                viewMode === 'analytics'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : isDark
                                    ? 'text-slate-400 hover:text-slate-200'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                            }`}
                            title="Analisa Statistik Operasional & Peta Resort"
                        >
                            <BarChart3 className="w-3.5 h-3.5" />
                            <span>Analisis</span>
                        </button>
                    </div>

                    {/* Profile & Navigation Switcher & Bot Controls (Right - Fixed 1-Line Sleek App Bar) */}
                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
                        {/* Offline / Outbox Status Pill */}
                        <button
                            type="button"
                            onClick={async () => {
                                const tickets = await getOutboxTickets();
                                setOutboxTickets(tickets);
                                setShowOutboxModal(true);
                            }}
                            className={`h-7.5 sm:h-8.5 flex items-center gap-1 px-1.5 sm:px-2.5 rounded-lg border text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0 ${
                                outboxCount > 0
                                    ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/60 animate-pulse'
                                    : isOnline
                                    ? (isDark ? 'bg-slate-800/90 text-emerald-400 border-slate-700' : 'bg-white text-emerald-700 border-slate-200')
                                    : 'bg-rose-950/70 text-rose-300 border-rose-600/50'
                            }`}
                            title={
                                outboxCount > 0
                                    ? `${outboxCount} tiket tersimpan di HP. Klik untuk melihat / sinkronkan.`
                                    : isOnline
                                    ? 'Online (Terhubung ke Internet)'
                                    : 'Offline (0 Bar / Tanpa Sinyal)'
                            }
                        >
                            {outboxCount > 0 ? (
                                <>
                                    <CloudUpload className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    <span className="text-[10px] sm:text-xs text-amber-300 font-extrabold">{outboxCount} di HP</span>
                                </>
                            ) : isOnline ? (
                                <>
                                    <Wifi className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                    <span className="text-[10px] sm:text-xs hidden sm:inline">Online</span>
                                </>
                            ) : (
                                <>
                                    <WifiOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                    <span className="text-[10px] sm:text-xs">Offline</span>
                                </>
                            )}
                        </button>

                        {/* Quick Theme Toggle (Icon Only) */}
                        <button
                            type="button"
                            onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                            className={`h-7.5 w-7.5 sm:h-8.5 sm:w-8.5 flex items-center justify-center rounded-lg border transition-all shadow-xs cursor-pointer shrink-0 ${
                                isDark
                                    ? 'bg-slate-800/90 hover:bg-slate-700 text-amber-300 border-slate-700'
                                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                            title={isDark ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
                            aria-label="Toggle Tema"
                        >
                            {isDark ? (
                                <Sun className="w-3.5 h-3.5 text-amber-400" />
                            ) : (
                                <Moon className="w-3.5 h-3.5 text-slate-600" />
                            )}
                        </button>

                        {/* WhatsApp Bot V2 Status & Control Button (Hidden on tiny mobile screens, visible on sm+) */}
                        <button
                            type="button"
                            onClick={() => setBotControlModalOpen(true)}
                            className={`h-7.5 sm:h-8.5 hidden sm:flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 rounded-lg border text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0 ${
                                botStatus?.connected
                                    ? (isDark ? 'bg-emerald-950/70 hover:bg-emerald-900/80 border-emerald-600/50 text-emerald-300' : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800')
                                    : (isDark ? 'bg-rose-950/70 hover:bg-rose-900/80 border-rose-600/50 text-rose-300' : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-800')
                            }`}
                            title="Klik untuk Kontrol Bot WA (Lihat Status / Matikan / Nyalakan)"
                        >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${botStatus?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                            <span className="hidden md:inline">Bot WA:</span>
                            <span className="text-[10px] sm:text-xs">{botStatus?.connected ? 'Online' : 'Offline'}</span>
                        </button>

                        {/* Supervisor Account Profile Pill */}
                        <div
                            className={`h-7.5 sm:h-8.5 flex items-center gap-1 px-1.5 sm:px-2.5 rounded-lg border text-xs shadow-xs shrink-0 ${
                                isDark ? 'bg-slate-800/90 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                            }`}
                            title={currentUser ? `Login sebagai ${myName} (${currentUser.department || 'Supervisor'})` : 'Mode Tamu / Belum Login'}
                        >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${currentUser ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            <span className="font-bold truncate max-w-[42px] sm:max-w-[120px] text-[10px] sm:text-xs">{myName}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border hidden lg:inline ${
                                isDark ? 'text-emerald-400 bg-emerald-950/80 border-emerald-800/60' : 'text-emerald-800 bg-emerald-100 border-emerald-200'
                            }`}>
                                {currentUser?.is_admin ? 'Admin' : 'Supervisor'}
                            </span>
                        </div>

                        {/* Back to Full Dashboard / Login */}
                        {currentUser ? (
                            <Link
                                href={route('dashboard')}
                                className={`h-7.5 w-7.5 sm:h-8.5 sm:w-8.5 flex items-center justify-center rounded-lg border transition-all shadow-xs shrink-0 ${
                                    isDark
                                        ? 'bg-slate-800/90 hover:bg-emerald-950 hover:text-emerald-300 text-slate-300 border-slate-700 hover:border-emerald-600/60'
                                        : 'bg-white hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 border-slate-200 hover:border-emerald-300'
                                }`}
                                title="Kembali ke Dashboard Utama (Mode Kantor)"
                                aria-label="Kembali ke Dashboard Utama"
                            >
                                <LayoutDashboard className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                            </Link>
                        ) : (
                            <Link
                                href={route('login')}
                                className={`h-7.5 sm:h-8.5 flex items-center gap-1 px-2 rounded-lg border text-xs font-bold transition-all shadow-xs shrink-0 ${
                                    isDark
                                        ? 'bg-amber-950/60 hover:bg-amber-900/80 border-amber-500/50 text-amber-300'
                                        : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800'
                                }`}
                                title="Masuk ke Akun Anda"
                            >
                                <LogIn className="w-3 h-3 text-amber-600" />
                                <span className="text-[10px] sm:text-xs">Masuk</span>
                            </Link>
                        )}
                    </div>
                </div>


            </header>

            {/* MAIN CONTENT CONTAINER */}
            <main className="w-full px-4 sm:px-6 lg:px-8 pt-4 flex-1">
                {/* NOTICE BANNER: ISOLATED TESTING */}
                <div className={`mb-4 p-3.5 rounded-xl border flex items-start justify-between gap-3 text-xs backdrop-blur-md transition-all ${
                    isDark
                        ? 'bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-slate-800/40 border-amber-500/30'
                        : 'bg-amber-50/95 border-amber-300/80 text-amber-950 shadow-sm'
                }`}>
                    <div className={`flex items-start gap-2.5 ${isDark ? 'text-amber-200' : 'text-amber-950'}`}>
                        <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                        <div>
                            <p className={`font-bold ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>Lingkungan Uji Coba Terisolasi (Sandbox)</p>
                            <p className={`text-[11px] mt-0.5 leading-relaxed ${isDark ? 'text-amber-200/80' : 'text-amber-800'}`}>
                                Laporan di sini tidak masuk ke dashboard resmi dan tidak mengirim notifikasi WhatsApp. Bebas dipakai untuk simulasi.
                            </p>
                        </div>
                    </div>
                    {issues.length > 0 && (
                        <button
                            onClick={() => setShowResetConfirm(true)}
                            className={`shrink-0 flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors ${
                                isDark
                                    ? 'text-rose-400 hover:text-rose-300 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/60'
                                    : 'text-rose-700 hover:text-rose-800 bg-rose-100 hover:bg-rose-200 border border-rose-300 font-semibold shadow-xs'
                            }`}
                        >
                            <Trash2 className="w-3 h-3" />
                            Reset Data
                        </button>
                    )}
                </div>

                {/* OUTBOX BANNER: TICKETS QUEUED IN PHONE STORAGE */}
                {outboxCount > 0 && (
                    <div className={`mb-4 p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-md transition-all ${
                        isDark
                            ? 'bg-gradient-to-r from-amber-950/70 via-slate-900/90 to-amber-950/50 border-amber-500/60 text-amber-200'
                            : 'bg-amber-50/95 border-amber-300 text-amber-950 shadow-sm'
                    }`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                                <CloudUpload className="w-4 h-4 animate-bounce" />
                            </div>
                            <div className="min-w-0">
                                <p className="font-bold text-xs truncate">
                                    Ada {outboxCount} Laporan Tersimpan di HP (Offline Outbox)
                                </p>
                                <p className={`text-[11px] mt-0.5 leading-relaxed truncate ${isDark ? 'text-amber-300/80' : 'text-amber-800'}`}>
                                    {isOnline
                                        ? 'Sinyal pulih! Tiket siap disinkronkan ke server Cloud & Google Sheets.'
                                        : 'Perangkat sedang offline (0 bar). Tiket tersimpan aman di memori HP.'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                            <button
                                type="button"
                                onClick={handleManualSync}
                                disabled={!isOnline || isSyncingOutbox}
                                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                                {isSyncingOutbox ? (
                                    <>
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        <span>Mengirim...</span>
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-3.5 h-3.5" />
                                        <span>Kirim Sekarang</span>
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    const tickets = await getOutboxTickets();
                                    setOutboxTickets(tickets);
                                    setShowOutboxModal(true);
                                }}
                                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors ${
                                    isDark
                                        ? 'border-amber-600/50 hover:bg-amber-900/40 text-amber-300'
                                        : 'border-amber-300 hover:bg-amber-100 text-amber-900'
                                }`}
                                title="Buka daftar antrean"
                            >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Detail</span>
                            </button>
                        </div>
                    </div>
                )}


                {/* ERP CONTROLS BAR: SEARCH, DEPT, SORT, VIEW MODE, STATUS CHECKLIST */}
                {viewMode !== 'analytics' && (
                    <>
                        <div className="space-y-2.5 mb-3">
                    {/* Row 1: Search Bar Full Width */}
                    <div className="relative w-full">
                        <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Cari ID, judul, pelapor, lokasi..."
                            className={`w-full text-xs rounded-xl pl-8 pr-7 py-2.5 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 shadow-sm transition-all border ${
                                isDark
                                    ? 'bg-slate-800/90 border-slate-700 text-slate-200 placeholder-slate-500'
                                    : 'bg-white/95 border-slate-300 text-slate-900 placeholder-slate-400 shadow-xs'
                            }`}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}
                                title="Hapus pencarian"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Row 2: Balanced Grid on Mobile for Month, Dept & Sort, Flex on Desktop */}
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                        {/* Month Tab Switcher (12 Tab Bulanan Google Sheet) */}
                        <div className="w-full sm:w-auto">
                            <select
                                value={selectedMonthFilter}
                                onChange={(e) => setSelectedMonthFilter(e.target.value)}
                                className={`w-full sm:w-auto text-xs font-semibold rounded-xl px-3 py-2 focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-sm border truncate ${
                                    isDark
                                        ? 'bg-slate-800/90 border-slate-700 text-slate-200'
                                        : 'bg-white/95 border-slate-300 text-slate-800 shadow-xs'
                                }`}
                                title="Pilih Tab Bulan (12 Tab Bulanan)"
                            >
                                <option value="all">📅 Semua Bulan (Semua Tab)</option>
                                <option value="1">Januari</option>
                                <option value="2">Februari</option>
                                <option value="3">Maret</option>
                                <option value="4">April</option>
                                <option value="5">Mei</option>
                                <option value="6">Juni</option>
                                <option value="7">Juli</option>
                                <option value="8">Agustus</option>
                                <option value="9">September</option>
                                <option value="10">Oktober</option>
                                <option value="11">November</option>
                                <option value="12">Desember</option>
                            </select>
                        </div>

                        {/* Department Filter */}
                        <div className="w-full sm:w-auto">
                            <select
                                value={selectedDeptFilter}
                                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                                className={`w-full sm:w-auto text-xs font-semibold rounded-xl px-3 py-2 focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-sm border truncate ${
                                    isDark
                                        ? 'bg-slate-800/90 border-slate-700 text-slate-200'
                                        : 'bg-white/95 border-slate-300 text-slate-800 shadow-xs'
                                }`}
                            >
                                <option value="all">Semua Dept (All)</option>
                                {departments.map((dept) => (
                                    <option key={dept} value={dept}>{dept}</option>
                                ))}
                            </select>
                        </div>

                        {/* Sort Cepat Control */}
                        <div className="w-full sm:w-auto relative flex items-center">
                            <ArrowUpDown className="w-3.5 h-3.5 text-emerald-500 absolute left-2.5 sm:left-3 pointer-events-none" />
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className={`w-full sm:w-auto text-xs font-semibold rounded-xl pl-7 sm:pl-8 pr-3 py-2 focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-sm border truncate ${
                                    isDark
                                        ? 'bg-slate-800/90 border-slate-700 text-slate-200 hover:border-slate-600'
                                        : 'bg-white/95 border-slate-300 text-slate-800 shadow-xs hover:border-slate-400'
                                }`}
                                title="Urutkan daftar tiket secara cepat"
                            >
                                <option value="newest">🕒 Terbaru</option>
                                <option value="oldest">⏳ Terlama</option>
                                <option value="status">📊 Status Progres</option>
                                <option value="waiting_acc">🚨 Menunggu ACC</option>
                            </select>
                        </div>

                        {/* Actions group: Column Customizer & New Report */}
                        <div className="col-span-2 sm:col-span-1 sm:ml-auto flex items-center justify-between sm:justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowReportModal(true)}
                                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md hover:shadow-emerald-600/30 transition-all cursor-pointer shrink-0"
                                title="Laporkan Masalah Baru"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>+ Lapor Baru</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowColumnModal(true)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm border ${
                                    isDark
                                        ? 'bg-slate-800/90 hover:bg-slate-700 border-slate-700 hover:border-emerald-500/50 text-slate-200'
                                        : 'bg-white/95 hover:bg-slate-50 border-slate-300 hover:border-slate-400 text-slate-800 shadow-xs'
                                }`}
                                title="Pilih data/kolom apa saja yang ingin ditampilkan"
                            >
                                <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-500" />
                                <span>Tampilan</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                                    isDark
                                        ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60'
                                        : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                }`}>
                                    {activeColumnCount}/{COLUMN_DEFS.length}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Row 3: MULTI-SELECT STATUS CHECKLIST PILLS & PRESETS */}
                <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4 p-2 sm:p-2.5 rounded-xl border backdrop-blur-md transition-all ${
                    isDark ? 'bg-slate-800/60 border-slate-800' : 'bg-white/80 border-slate-200/90 shadow-xs'
                }`}>
                    {/* Status Checklist Pills: 4-Column Grid on Mobile (Non-scrollable, fits 100% width), Flex on Desktop */}
                    <div className="grid grid-cols-4 gap-1 sm:flex sm:items-center sm:gap-1.5 w-full sm:w-auto">
                        {/* Open Checkbox Pill */}
                        <button
                            type="button"
                            onClick={() => toggleStatus('open')}
                            className={`flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-1 py-1.5 sm:px-2.5 sm:py-1 rounded-lg font-semibold text-[11px] sm:text-xs transition-all border ${
                                selectedStatuses.open
                                    ? isDark
                                        ? 'bg-rose-950/80 border-rose-500/60 text-rose-300 shadow-sm'
                                        : 'bg-rose-50 border-rose-300 text-rose-800 shadow-xs'
                                    : isDark
                                    ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400'
                                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
                            }`}
                        >
                            <span className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded flex items-center justify-center text-[9px] sm:text-[10px] border shrink-0 ${
                                selectedStatuses.open ? 'bg-rose-500 border-rose-400 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                            }`}>
                                {selectedStatuses.open && '✓'}
                            </span>
                            <span className="truncate">Open</span>
                            <span className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                                isDark ? 'bg-slate-900/80 text-white' : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}>
                                {counts.open}
                            </span>
                        </button>

                        {/* Progress Checkbox Pill */}
                        <button
                            type="button"
                            onClick={() => toggleStatus('in_progress')}
                            className={`flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-1 py-1.5 sm:px-2.5 sm:py-1 rounded-lg font-semibold text-[11px] sm:text-xs transition-all border ${
                                selectedStatuses.in_progress
                                    ? isDark
                                        ? 'bg-amber-950/80 border-amber-500/60 text-amber-300 shadow-sm'
                                        : 'bg-amber-50 border-amber-300 text-amber-800 shadow-xs'
                                    : isDark
                                    ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400'
                                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
                            }`}
                        >
                            <span className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded flex items-center justify-center text-[9px] sm:text-[10px] border shrink-0 ${
                                selectedStatuses.in_progress ? 'bg-amber-500 border-amber-400 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                            }`}>
                                {selectedStatuses.in_progress && '✓'}
                            </span>
                            <span className="truncate hidden xs:inline">Progress</span>
                            <span className="truncate xs:hidden">Prog</span>
                            <span className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                                isDark ? 'bg-slate-900/80 text-white' : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                                {counts.inProgress}
                            </span>
                        </button>

                        {/* Pending / Tertunda Checkbox Pill */}
                        <button
                            type="button"
                            onClick={() => toggleStatus('pending')}
                            className={`flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-1 py-1.5 sm:px-2.5 sm:py-1 rounded-lg font-semibold text-[11px] sm:text-xs transition-all border ${
                                selectedStatuses.pending
                                    ? isDark
                                        ? 'bg-orange-950/80 border-orange-500/60 text-orange-300 shadow-sm'
                                        : 'bg-orange-50 border-orange-300 text-orange-800 shadow-xs'
                                    : isDark
                                    ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400'
                                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
                            }`}
                        >
                            <span className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded flex items-center justify-center text-[9px] sm:text-[10px] border shrink-0 ${
                                selectedStatuses.pending ? 'bg-orange-500 border-orange-400 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                            }`}>
                                {selectedStatuses.pending && '✓'}
                            </span>
                            <span className="truncate hidden xs:inline">Tertunda</span>
                            <span className="truncate xs:hidden">Tunda</span>
                            <span className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                                isDark ? 'bg-slate-900/80 text-white' : 'bg-orange-100 text-orange-800 border border-orange-200'
                            }`}>
                                {counts.pending}
                            </span>
                        </button>

                        {/* Resolved / Selesai Checkbox Pill */}
                        <button
                            type="button"
                            onClick={() => toggleStatus('resolved')}
                            className={`flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-1 py-1.5 sm:px-2.5 sm:py-1 rounded-lg font-semibold text-[11px] sm:text-xs transition-all border ${
                                selectedStatuses.resolved
                                    ? isDark
                                        ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-sm'
                                        : 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs'
                                    : isDark
                                    ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400'
                                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
                            }`}
                        >
                            <span className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded flex items-center justify-center text-[9px] sm:text-[10px] border shrink-0 ${
                                selectedStatuses.resolved ? 'bg-emerald-500 border-emerald-400 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                            }`}>
                                {selectedStatuses.resolved && '✓'}
                            </span>
                            <span className="truncate">Selesai</span>
                            <span className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                                isDark ? 'bg-slate-900/80 text-white' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}>
                                {counts.resolved}
                            </span>
                        </button>
                    </div>

                    {/* Quick Presets: 3-column grid on mobile, inline on desktop */}
                    <div className="grid grid-cols-3 sm:flex items-center gap-1.5 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-slate-700/40 sm:border-transparent w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={() => setStatusPreset('all')}
                            className={`px-2 py-1 sm:py-0.5 rounded-md border text-center text-[11px] sm:text-xs font-medium transition-all ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                                    : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-300 shadow-xs'
                            }`}
                        >
                            Semua
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusPreset('active')}
                            className={`px-2 py-1 sm:py-0.5 rounded-md border text-center text-[11px] sm:text-xs font-semibold transition-all ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border-slate-700'
                                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 shadow-xs'
                            }`}
                        >
                            Isu Aktif
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusPreset('resolved')}
                            className={`px-2 py-1 sm:py-0.5 rounded-md border text-center text-[11px] sm:text-xs font-semibold transition-all ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-emerald-200 border-slate-700'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 shadow-xs'
                            }`}
                        >
                            Selesai Saja
                        </button>
                    </div>
                </div>
                    </>
                )}

                {/* DATA PRESENTATION: ANALYTICS VIEW OR EMPTY STATE OR ERP TABLE / CARDS */}
                {viewMode === 'analytics' ? (
                    <LeanAnalyticsView
                        issues={issues}
                        departments={departments}
                        theme={theme}
                        activeTab={activeAnalyticsTab}
                        onTabChange={setActiveAnalyticsTab}
                        onSelectIssue={setSelectedDetailIssue}
                        focusMapRequest={focusMapRequest}
                        spreadsheetUrl={spreadsheetUrl}
                        monthGids={monthGids}
                    />
                ) : filteredIssues.length === 0 ? (
                    <div className="py-16 text-center border-2 border-dashed border-slate-800 rounded-2xl p-6">
                        <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-3">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-300">Tidak ada masalah ditemukan</h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                            {searchQuery
                                ? `Tidak ditemukan isu yang cocok dengan kata kunci "${searchQuery}".`
                                : selectedDeptFilter !== 'all'
                                ? `Tidak ada masalah untuk departemen ${selectedDeptFilter}.`
                                : 'Belum ada masalah di dalam daftar.'}
                        </p>
                        <div className="mt-4 flex items-center justify-center gap-2">
                            {searchQuery ? (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                                >
                                    Reset Pencarian
                                </button>
                            ) : (
                                <p className="text-[11px] text-slate-500 italic">
                                    Pelaporan isu baru dilakukan secara terpusat melalui WhatsApp Bot.
                                </p>
                            )}
                        </div>
                    </div>
                ) : viewMode === 'table' ? (
                    /* --- VIEW 1: ERP SPREADSHEET TABLE --- */
                    <div className={`rounded-2xl overflow-hidden border shadow-xl transition-all ${
                        isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200 shadow-sm'
                    }`}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-[11px] border-collapse">
                                <thead>
                                    <tr className={`font-bold border-b uppercase tracking-wider text-[10px] ${
                                        isDark ? 'bg-slate-900/90 text-slate-300 border-slate-700/80' : 'bg-slate-100 text-slate-700 border-slate-200'
                                    }`}>
                                        {visibleColumns.id && <th className="py-2.5 px-2 whitespace-nowrap">ID Isu</th>}
                                        {visibleColumns.photo && <th className="py-2.5 px-1 text-center whitespace-nowrap">Foto</th>}
                                        {visibleColumns.title && <th className="py-2.5 px-2 min-w-[110px] max-w-[160px]">Judul Masalah</th>}
                                        {visibleColumns.location && <th className="py-2.5 px-2 whitespace-nowrap">Lokasi</th>}
                                        {visibleColumns.dept && <th className="py-2.5 px-2 whitespace-nowrap">Departemen</th>}
                                        {visibleColumns.reporter && <th className="py-2.5 px-2 whitespace-nowrap">Pelapor</th>}
                                        {visibleColumns.desc && <th className="py-2.5 px-2 min-w-[130px] max-w-[180px]">Deskripsi</th>}
                                        {visibleColumns.status && <th className="py-2.5 px-2 whitespace-nowrap">Status</th>}
                                        {visibleColumns.time && <th className="py-2.5 px-2 whitespace-nowrap">Waktu</th>}
                                        <th className="py-2.5 px-1.5 text-center whitespace-nowrap">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y font-medium ${
                                    isDark ? 'divide-slate-700/60' : 'divide-slate-200'
                                }`}>
                                    {filteredIssues.map((issue) => {
                                        const accs = issue.department_accs || {};

                                        return (
                                            <tr
                                                key={issue.id}
                                                onClick={() => setSelectedDetailIssue(issue)}
                                                className={`cursor-pointer transition-colors group ${
                                                    isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'
                                                }`}
                                                title="Klik baris untuk melihat rincian lengkap isu"
                                            >
                                                {/* ID ISU */}
                                                {visibleColumns.id && (
                                                    <td className={`py-2 px-2 font-mono font-bold whitespace-nowrap text-[11px] ${
                                                        isDark ? 'text-amber-300' : 'text-amber-700'
                                                    }`}>
                                                        #{issue.issue_code || ('LEAN-' + issue.id)}
                                                    </td>
                                                )}

                                                {/* FOTO BUKTI */}
                                                {visibleColumns.photo && (
                                                    <td className="py-2 px-1 text-center">
                                                        {issue.image_url ? (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setLightboxImage(issue.image_url);
                                                                }}
                                                                className={`w-8 h-8 rounded-md overflow-hidden border inline-block transition-all hover:scale-105 ${
                                                                    isDark ? 'border-slate-700 hover:border-emerald-500' : 'border-slate-300 hover:border-emerald-500'
                                                                }`}
                                                                title="Klik untuk lihat foto"
                                                            >
                                                                <img src={issue.image_url} alt="" className="w-full h-full object-cover" />
                                                            </button>
                                                        ) : (
                                                            <span className="text-slate-400 text-[10px] italic">-</span>
                                                        )}
                                                    </td>
                                                )}

                                                {/* JUDUL MASALAH */}
                                                {visibleColumns.title && (
                                                    <td className={`py-2 px-2 font-semibold leading-snug max-w-[160px] truncate ${
                                                        isDark ? 'text-white' : 'text-slate-900'
                                                    }`} title={issue.title}>
                                                        {issue.title}
                                                    </td>
                                                )}

                                                {/* LOKASI */}
                                                {visibleColumns.location && (
                                                    <td className="py-2 px-2 whitespace-nowrap">
                                                        <span
                                                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold text-[10px] max-w-[170px] truncate border ${
                                                                isDark
                                                                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                                                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                            }`}
                                                            title={issue.location}
                                                        >
                                                            <MapPin className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                                                            <span className="truncate">{issue.location}</span>
                                                        </span>
                                                    </td>
                                                )}

                                                {/* DEPARTEMEN TUJUAN */}
                                                {visibleColumns.dept && (
                                                    <td className="py-2 px-2 whitespace-nowrap">
                                                        <div className="flex flex-wrap gap-1">
                                                            {(issue.target_departments || []).map((dept) => {
                                                                const isThisDeptClaimed = issue.claimed_by_dept && (
                                                                    issue.claimed_by_dept.toLowerCase() === dept.toLowerCase()
                                                                );
                                                                const isThisAcc = accs[dept]?.is_acc || isThisDeptClaimed;
                                                                const isWorking = issue.status === 'in_progress' && isThisDeptClaimed;

                                                                return (
                                                                    <span
                                                                        key={dept}
                                                                        className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                                                                            isWorking
                                                                                ? isDark
                                                                                    ? 'bg-amber-950/80 border-amber-500 text-amber-200'
                                                                                    : 'bg-amber-100 border-amber-400 text-amber-900'
                                                                                : isThisAcc
                                                                                ? isDark
                                                                                    ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                                                                                    : 'bg-emerald-100 border-emerald-400 text-emerald-800'
                                                                                : isDark
                                                                                ? 'bg-slate-900 border-slate-700 text-slate-300'
                                                                                : 'bg-slate-100 border-slate-300 text-slate-700'
                                                                        }`}
                                                                    >
                                                                        {dept} {isWorking ? '🟡 Dikerjakan' : isThisAcc ? '✓' : ''}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>
                                                )}

                                                {/* NAMA PELAPOR */}
                                                {visibleColumns.reporter && (
                                                    <td className="py-2 px-2 whitespace-nowrap">
                                                        <div className={`font-semibold leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                            {issue.reporter_name}
                                                        </div>
                                                        <div className={`text-[9px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                            {issue.reporter_dept || 'Staf'}
                                                        </div>
                                                    </td>
                                                )}

                                                {/* DESKRIPSI */}
                                                {visibleColumns.desc && (
                                                    <td className={`py-2 px-2 text-[11px] max-w-[180px] truncate ${
                                                        isDark ? 'text-slate-300' : 'text-slate-600'
                                                    }`} title={issue.description}>
                                                        {issue.description || <span className="text-slate-400 italic">Tidak ada keterangan</span>}
                                                    </td>
                                                )}

                                                {/* STATUS BADGE */}
                                                {visibleColumns.status && (
                                                    <td className="py-2 px-2 whitespace-nowrap">
                                                        {issue.status === 'open' && (
                                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 border ${
                                                                isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-rose-100 text-rose-800 border-rose-300'
                                                            }`}>
                                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                                Open
                                                            </span>
                                                        )}
                                                        {issue.status === 'in_progress' && (
                                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 border ${
                                                                isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-amber-100 text-amber-800 border-amber-300'
                                                            }`}>
                                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                                Progress
                                                            </span>
                                                        )}
                                                        {issue.status === 'pending' && (
                                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 border ${
                                                                isDark ? 'bg-orange-500/20 text-orange-300 border-orange-500/40' : 'bg-orange-100 text-orange-800 border-orange-300'
                                                            }`}>
                                                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                                Tertunda
                                                            </span>
                                                        )}
                                                        {issue.status === 'resolved' && (
                                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 border ${
                                                                isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                            }`}>
                                                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                                                Selesai
                                                            </span>
                                                        )}
                                                    </td>
                                                )}

                                                {/* WAKTU PELAPORAN */}
                                                {visibleColumns.time && (
                                                    <td className={`py-2 px-2 whitespace-nowrap text-[10px] ${
                                                        isDark ? 'text-slate-400' : 'text-slate-500'
                                                    }`}>
                                                        {issue.created_at_human}
                                                    </td>
                                                )}

                                                {/* AKSI HAPUS */}
                                                <td className="py-2 px-1.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIssueToDelete(issue);
                                                            setDeleteSupervisorName(myName || 'Supervisor');
                                                        }}
                                                        className={`p-1 rounded-md border transition ${
                                                            isDark
                                                                ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30 hover:border-rose-500/60'
                                                                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                                                        }`}
                                                        title="Hapus / Sembunyikan Tiket"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    /* --- VIEW 2: VISUAL CARD VIEW (MODERN RESPONSIVE GRID - OPTION 1 & 2) --- */
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                        {filteredIssues.map((issue) => {
                            const accs = issue.department_accs || {};

                            // Status theme for Option 1 & 2 (Top Accent Bar, Left Stripe, and Subtly Tinted Plates)
                            const statusTheme = {
                                open: {
                                    borderLeft: 'border-l-rose-500 hover:border-l-rose-600',
                                    topBar: 'bg-rose-500',
                                    headerBg: isDark ? 'bg-rose-950/20' : 'bg-rose-50/60',
                                },
                                in_progress: {
                                    borderLeft: 'border-l-sky-500 hover:border-l-sky-600',
                                    topBar: 'bg-sky-500',
                                    headerBg: isDark ? 'bg-sky-950/20' : 'bg-sky-50/60',
                                },
                                pending: {
                                    borderLeft: 'border-l-amber-500 hover:border-l-amber-600',
                                    topBar: 'bg-amber-500',
                                    headerBg: isDark ? 'bg-amber-950/20' : 'bg-amber-50/60',
                                },
                                resolved: {
                                    borderLeft: 'border-l-emerald-500 hover:border-l-emerald-600',
                                    topBar: 'bg-emerald-500',
                                    headerBg: isDark ? 'bg-emerald-950/20' : 'bg-emerald-50/60',
                                },
                            }[issue.status] || {
                                borderLeft: 'border-l-slate-400 hover:border-l-slate-500',
                                topBar: 'bg-slate-400',
                                headerBg: isDark ? 'bg-slate-900/30' : 'bg-slate-50/60',
                            };

                            const isResolved = issue.status === 'resolved';

                            return (
                                <div
                                    key={issue.id}
                                    onClick={() => setSelectedDetailIssue(issue)}
                                    className={`relative rounded-2xl border-2 border-l-[6px] transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden group hover:-translate-y-1.5 ${statusTheme.borderLeft} ${
                                        isDark
                                            ? 'bg-slate-800/95 border-slate-700/90 hover:border-slate-600 shadow-lg hover:shadow-2xl ring-1 ring-white/5'
                                            : 'bg-white border-slate-300/90 hover:border-slate-400 shadow-md hover:shadow-xl ring-1 ring-slate-900/5'
                                    }`}
                                    title="Klik kartu untuk melihat rincian lengkap isu"
                                >
                                    {/* Option 2: Top Status Accent Bar */}
                                    <div className={`h-1.5 w-full shrink-0 ${statusTheme.topBar}`} />

                                    <div>
                                        {/* Option 2: Card Header Plate with Divider */}
                                        <div className={`p-3.5 sm:p-4 border-b transition-colors ${statusTheme.headerBg} ${
                                            isDark ? 'border-slate-700/70' : 'border-slate-200/90'
                                        }`}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {/* ID Isu */}
                                                    {visibleColumns.id && (
                                                        <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-xs border shadow-2xs ${
                                                            isDark ? 'bg-slate-900 border-slate-700 text-amber-300' : 'bg-white border-slate-300 text-slate-800 font-extrabold'
                                                        }`}>
                                                            #{issue.issue_code || ('LEAN-' + issue.id)}
                                                        </span>
                                                    )}

                                                    {/* Status Badge */}
                                                    {visibleColumns.status && (
                                                        <>
                                                            {issue.status === 'open' && (
                                                                <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30 text-[10px] font-bold flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                                    Open
                                                                </span>
                                                            )}
                                                            {issue.status === 'in_progress' && (
                                                                <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30 text-[10px] font-bold flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                                                                    Progress
                                                                </span>
                                                            )}
                                                            {issue.status === 'pending' && (
                                                                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                                    Tertunda
                                                                </span>
                                                            )}
                                                            {issue.status === 'resolved' && (
                                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                                                                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                                                    Selesai
                                                                </span>
                                                            )}
                                                        </>
                                                    )}

                                                    {/* Transfer Badge */}
                                                    {issue.transfer_history && issue.transfer_history.length > 0 && (
                                                        <span
                                                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1"
                                                            title={`Dialihkan ${issue.transfer_history.length} kali`}
                                                        >
                                                            <RotateCcw className="w-2.5 h-2.5 text-amber-500" />
                                                            <span>{issue.transfer_history.length}x Dialihkan</span>
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Time & Delete Action */}
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {visibleColumns.time && (
                                                        <span className={`text-[10px] font-semibold flex items-center gap-1 ${
                                                            isDark ? 'text-slate-400' : 'text-slate-500'
                                                        }`}>
                                                            <Clock className="w-3 h-3" />
                                                            {issue.created_at_human}
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setIssueToDelete(issue);
                                                            setDeleteSupervisorName(myName || 'Supervisor');
                                                        }}
                                                        className={`opacity-0 group-hover:opacity-100 p-1 rounded-md transition-opacity ${
                                                            isDark
                                                                ? 'hover:bg-rose-950/80 text-slate-500 hover:text-rose-400 border border-transparent hover:border-rose-800'
                                                                : 'hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-transparent hover:border-rose-200'
                                                        }`}
                                                        title="Hapus / Sembunyikan Tiket"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card Body Content */}
                                        <div className="p-3.5 sm:p-4 space-y-3">
                                            {/* Title & Location Meta */}
                                            <div className="space-y-1.5">
                                                {visibleColumns.title && (
                                                    <h4 className={`font-bold text-sm leading-snug line-clamp-2 group-hover:text-emerald-500 transition-colors ${
                                                        isDark ? 'text-white' : 'text-slate-900'
                                                    }`}>
                                                        {issue.title}
                                                    </h4>
                                                )}

                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {/* Lokasi */}
                                                    {visibleColumns.location && (
                                                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] flex items-center gap-1 border shadow-2xs ${
                                                            isDark
                                                                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
                                                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                        }`}>
                                                            <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                                                            <span className="truncate max-w-[150px]">{issue.location}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Description Snippet */}
                                            {visibleColumns.desc && issue.description && (
                                                <p className={`text-xs leading-relaxed line-clamp-2 p-2.5 rounded-lg border text-ellipsis ${
                                                    isDark
                                                        ? 'bg-slate-900/60 text-slate-300 border-slate-700/60'
                                                        : 'bg-slate-50/80 text-slate-600 border-slate-200'
                                                }`}>
                                                    {issue.description}
                                                </p>
                                            )}

                                            {/* Photo Thumbnail Preview (Landscape with View Badge) */}
                                            {visibleColumns.photo && issue.image_url && (
                                                <div className="pt-0.5">
                                                    <div
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setLightboxImage(issue.image_url);
                                                        }}
                                                        className="group/img relative rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700/60 w-full h-32 bg-slate-950/50 block shadow-xs"
                                                    >
                                                        <img
                                                            src={issue.image_url}
                                                            alt="Bukti Masalah"
                                                            className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex items-end justify-between p-2">
                                                            <span className="text-[10px] text-white font-medium bg-black/60 px-2 py-0.5 rounded-md backdrop-blur-xs flex items-center gap-1">
                                                                <Eye className="w-3 h-3" /> Foto Bukti
                                                            </span>
                                                            <span className="text-[9px] text-slate-300 font-medium">Klik perbesar</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Target Departments & ACC Badges */}
                                            {visibleColumns.dept && (
                                                <div className={`pt-2 border-t flex flex-wrap items-center gap-1.5 ${
                                                    isDark ? 'border-slate-700/60' : 'border-slate-200'
                                                }`}>
                                                    <span className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Tujuan:</span>
                                                    {(issue.target_departments || []).map((dept) => {
                                                        const isThisDeptClaimed = issue.claimed_by_dept && (
                                                            issue.claimed_by_dept.toLowerCase() === dept.toLowerCase()
                                                        );
                                                        const isThisAcc = accs[dept]?.is_acc || isThisDeptClaimed;
                                                        const isWorking = issue.status === 'in_progress' && isThisDeptClaimed;

                                                        return (
                                                            <div
                                                                key={dept}
                                                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border transition-colors shadow-2xs ${
                                                                    isWorking
                                                                        ? (isDark ? 'bg-amber-950/80 border-amber-500/70 text-amber-200 font-semibold' : 'bg-amber-50 border-amber-300 text-amber-900 font-semibold')
                                                                        : isThisAcc
                                                                        ? (isDark ? 'bg-emerald-950/80 border-emerald-600/70 text-emerald-300 font-semibold' : 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold')
                                                                        : (isDark ? 'bg-slate-900 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600')
                                                                }`}
                                                            >
                                                                {isWorking ? (
                                                                    <>
                                                                        <Clock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                                                                        <span>{dept}: Dikerjakan</span>
                                                                    </>
                                                                ) : isThisAcc ? (
                                                                    <>
                                                                        <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                                                        <span>{dept}: ACC</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Clock className="w-2.5 h-2.5 opacity-50 shrink-0" />
                                                                        <span>{dept}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Card Footer: Pelapor & Assignee Info with Subtle Tint */}
                                    <div className={`p-3.5 sm:p-4 pt-2.5 border-t flex items-center justify-between gap-2 text-xs transition-colors ${
                                        isDark ? 'bg-slate-900/40 border-slate-700/70' : 'bg-slate-50/70 border-slate-200/90'
                                    }`}>
                                        {/* Pelapor */}
                                        {visibleColumns.reporter ? (
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                                                    isDark ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/60' : 'bg-emerald-100 text-emerald-800'
                                                }`}>
                                                    {(issue.reporter_name || 'U').substring(0, 1).toUpperCase()}
                                                </div>
                                                <span className={`text-[11px] truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                                    <strong className={isDark ? 'text-white' : 'text-slate-900'}>{issue.reporter_name}</strong>
                                                    {issue.reporter_dept && (
                                                        <span className={`text-[10px] ml-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>({issue.reporter_dept})</span>
                                                    )}
                                                </span>
                                            </div>
                                        ) : <div />}

                                        {/* Status / Worker Badge */}
                                        <div className="shrink-0">
                                            {issue.claimed_by_name && (
                                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border flex items-center gap-1 ${
                                                    isDark ? 'bg-amber-950/60 text-amber-300 border-amber-800/40' : 'bg-amber-50 text-amber-800 border-amber-200'
                                                }`} title={`Dikerjakan oleh: ${issue.claimed_by_name}`}>
                                                    <User className="w-2.5 h-2.5" /> Dikerjakan: {issue.claimed_by_name}
                                                </span>
                                            )}
                                            {isResolved && (
                                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border flex items-center gap-1 ${
                                                    isDark ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                }`}>
                                                    <CheckCircle2 className="w-2.5 h-2.5" /> Selesai
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* MODAL 1: REPORT ISSUE MODAL (DISCUSSION-VERIFIED WORKFLOW) */}
            {showReportModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                        {/* Header */}
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
                            <div>
                                <h3 className="font-bold text-base text-white flex items-center gap-1.5">
                                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                                    Catat Hasil Diskusi Lapangan
                                </h3>
                                <p className="text-xs text-slate-400">Verifikasi verbal langsung &rarr; Input sistem otomatis</p>
                            </div>
                            <button
                                onClick={() => {
                                    setShowReportModal(false);
                                    setShowStaffDropdown(false);
                                }}
                                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Form Body */}
                        <form onSubmit={handleReportSubmit} className="p-4 overflow-y-auto space-y-4 flex-1">
                            {/* IDENTITAS PENCATAT (READONLY BADGE) */}
                            <div className="p-3 rounded-xl bg-slate-800/80 border border-emerald-500/30 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                                        <ShieldCheck className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                                            Departemen Penanggung Jawab
                                        </div>
                                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                            <span>{myDept}</span>
                                            <span className="text-slate-500">&bull;</span>
                                            <span className="text-slate-300 font-normal">{myName}</span>
                                        </div>
                                    </div>
                                </div>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                                    Pencatat Resmi
                                </span>
                            </div>

                            {/* 1. STAF PELAPOR (YANG DATANG BERDISKUSI) DENGAN AUTOCOMPLETE */}
                            <div className="relative">
                                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                                    <span className="flex items-center gap-1">
                                        <User className="w-3.5 h-3.5 text-indigo-400" />
                                        1. Staf yang Datang Melapor *
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-normal">Cari / ketik nama staf</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={staffSearchQuery}
                                        onChange={(e) => {
                                            setStaffSearchQuery(e.target.value);
                                            setStaffReporterName(e.target.value);
                                            setShowStaffDropdown(true);
                                        }}
                                        onFocus={() => setShowStaffDropdown(true)}
                                        placeholder="Ketik nama staf (contoh: Budi / Siti / Hendra)..."
                                        className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                                        required
                                    />
                                    {staffSearchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setStaffSearchQuery('');
                                                setStaffReporterName('');
                                                setStaffReporterPhone('');
                                                setShowStaffDropdown(false);
                                            }}
                                            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                {/* Autocomplete dropdown */}
                                {showStaffDropdown && filteredStaff.length > 0 && (
                                    <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-30 max-h-48 overflow-y-auto divide-y divide-slate-700/60">
                                        {filteredStaff.map((staff, idx) => (
                                            <button
                                                type="button"
                                                key={idx}
                                                onClick={() => handleSelectStaff(staff)}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-700 flex items-center justify-between transition-colors"
                                            >
                                                <div>
                                                    <p className="font-semibold text-white">{staff.name}</p>
                                                    <p className="text-[10px] text-slate-400">
                                                        {staff.department ? `${staff.department} ` : ''}
                                                        {staff.subdivision ? `(${staff.subdivision})` : ''}
                                                    </p>
                                                </div>
                                                {staff.phone && (
                                                    <span className="text-[10px] text-emerald-400 font-mono">
                                                        {staff.phone}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* WhatsApp Phone input */}
                                <div className="mt-2">
                                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                                        No. WhatsApp Staf Pelapor (Untuk notifikasi status otomatis):
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="tel"
                                            value={staffReporterPhone}
                                            onChange={(e) => setStaffReporterPhone(e.target.value)}
                                            placeholder="Contoh: 08123456789 atau 628..."
                                            className="w-full text-xs bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                        Bot WA akan mengirimkan konfirmasi pendaftaran tiket dan info saat selesai ke nomor ini.
                                    </p>
                                </div>
                            </div>

                            {/* 2. LOKASI (TBR, TPI, Kantor + Detail) */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                                    2. Lokasi Masalah *
                                </label>
                                <div className="grid grid-cols-3 gap-2 mb-2">
                                    {['TBR', 'TPI', 'Kantor'].map((loc) => (
                                        <button
                                            type="button"
                                            key={loc}
                                            onClick={() => setFormMainLoc(loc)}
                                            className={`py-2 px-3 rounded-lg text-xs font-bold border text-center transition-all ${
                                                formMainLoc === loc
                                                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-2 ring-emerald-500/30'
                                                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'
                                            }`}
                                        >
                                            {loc}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    value={formDetailLoc}
                                    onChange={(e) => setFormDetailLoc(e.target.value)}
                                    placeholder="Detail spesifik (contoh: Villa 05 / Jetty / Kamar 12)"
                                    className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            {/* 3. ISU / JUDUL */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                    3. Isu / Masalah *
                                </label>
                                <input
                                    type="text"
                                    value={formTitle}
                                    onChange={(e) => setFormTitle(e.target.value)}
                                    placeholder="Contoh: Pipa wastafel bocor / AC tidak dingin"
                                    className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                    required
                                />
                            </div>

                            {/* 4. DESKRIPSI ISU */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1">
                                    4. Deskripsi Isu (Rincian Hasil Diskusi)
                                </label>
                                <textarea
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    placeholder="Jelaskan detail yang dibahas (contoh: Air menetes deras ke lantai kolong wastafel)"
                                    rows={2}
                                    className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            {/* 5. FOTO BUKTI */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                                    <Camera className="w-3.5 h-3.5 text-emerald-400" />
                                    5. Foto Bukti (Kamera HP / Galeri)
                                </label>
                                {formImagePreview ? (
                                    <div className="relative rounded-lg overflow-hidden border border-slate-700 max-h-48 bg-black/40 flex items-center justify-center">
                                        <img src={formImagePreview} alt="Preview" className="max-h-48 object-contain" />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFormImage(null);
                                                setFormImagePreview(null);
                                            }}
                                            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-black text-white"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-700 hover:border-slate-600 rounded-xl cursor-pointer bg-slate-800/40 hover:bg-slate-800/70 transition-colors">
                                        <Camera className="w-6 h-6 text-slate-400 mb-1" />
                                        <span className="text-xs font-semibold text-slate-300">Ambil Foto / Pilih File</span>
                                        <span className="text-[10px] text-slate-500 mt-0.5">Bisa langsung pakai kamera HP</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={handleImageChange}
                                            className="hidden"
                                        />
                                    </label>
                                )}
                            </div>

                            {/* 6. TOGGLE LANGSUNG DIKERJAKAN (IN PROGRESS) & PENUGASAN MULTI-TEKNISI */}
                            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 hover:border-slate-600 transition-colors space-y-3">
                                <label className="flex items-start gap-3 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={startInProgress}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            setStartInProgress(checked);
                                            if (checked && assignedWorkers.length === 0 && myName) {
                                                setAssignedWorkers([myName]);
                                            }
                                        }}
                                        className="w-4 h-4 mt-0.5 rounded text-amber-500 bg-slate-700 border-slate-600 focus:ring-amber-500 cursor-pointer"
                                    />
                                    <div>
                                        <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                                            ⚡ Langsung Dikerjakan Sekarang (In Progress)
                                        </span>
                                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                                            Centang jika departemen Anda langsung mengeksekusi perbaikan tanpa menunggu antrean Open.
                                        </p>
                                    </div>
                                </label>

                                {startInProgress && (
                                    <div className="pt-2 border-t border-slate-700/80 space-y-2">
                                        <label className="block text-[11px] font-bold text-slate-300">
                                            Ditugaskan / Dikerjakan oleh siapa? (Pilih satu atau lebih):
                                        </label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {myDeptTeammates.map((workerName) => {
                                                const isAssigned = assignedWorkers.includes(workerName);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={workerName}
                                                        onClick={() => toggleAssignedWorker(workerName)}
                                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer ${
                                                            isAssigned
                                                                ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                                                                : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:text-slate-200'
                                                        }`}
                                                    >
                                                        <span>{workerName}</span>
                                                        {isAssigned && <Check className="w-3 h-3 text-white shrink-0" />}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Input nama teknisi tambahan jika belum ada di list */}
                                        <div className="flex items-center gap-2 pt-1">
                                            <input
                                                type="text"
                                                value={customWorkerInput}
                                                onChange={(e) => setCustomWorkerInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleAddCustomWorker();
                                                    }
                                                }}
                                                placeholder="Tambah nama teknisi lain..."
                                                className="flex-1 text-xs bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddCustomWorker}
                                                className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                                            >
                                                + Tambah
                                            </button>
                                        </div>

                                        {assignedWorkers.length > 0 && (
                                            <p className="text-[10px] text-amber-300/90 font-medium">
                                                Ditugaskan: <span className="font-bold text-white">{assignedWorkers.join(', ')}</span>
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Offline Notice if connection dropped */}
                            {!isOnline && (
                                <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs flex items-center gap-2">
                                    <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
                                    <span className="text-[11px] leading-tight">
                                        Perangkat sedang offline (0 bar). Laporan & foto akan disimpan di memori HP dan otomatis di-upload saat mendapatkan sinyal.
                                    </span>
                                </div>
                            )}

                            {/* Submit Button */}
                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className={`w-full py-3 rounded-xl font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer ${
                                        !isOnline
                                            ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/40'
                                            : startInProgress
                                            ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white shadow-amber-900/40'
                                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
                                    }`}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            <span>Menyimpan Laporan...</span>
                                        </>
                                    ) : !isOnline ? (
                                        <>
                                            <HardDrive className="w-4 h-4" />
                                            <span>Simpan di Antrean HP (Offline)</span>
                                        </>
                                    ) : startInProgress ? (
                                        <>
                                            <Send className="w-4 h-4" />
                                            <span>Simpan & Mulai Kerjakan (In Progress)</span>
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-4 h-4" />
                                            <span>Simpan & Kirim Laporan</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: RESOLVE / TANDAI SELESAI */}
            {showResolveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="font-bold text-base text-white">Tandai Masalah Selesai</h3>
                                <p className="text-xs text-slate-400">
                                    {showResolveModal.location} — {showResolveModal.title}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowResolveModal(null)}
                                className="text-slate-400 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleResolveSubmit} className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1">
                                    Catatan Penyelesaian (Opsional)
                                </label>
                                <textarea
                                    value={resolveNote}
                                    onChange={(e) => setResolveNote(e.target.value)}
                                    placeholder="Contoh: Pipa telah diganti seal baru, sudah dites tidak bocor lagi"
                                    rows={2}
                                    className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                                    <Camera className="w-3.5 h-3.5 text-emerald-400" />
                                    Foto Bukti Selesai (Opsional)
                                </label>
                                {resolveImagePreview ? (
                                    <div className="relative rounded-lg overflow-hidden border border-slate-700 max-h-36 bg-black/40 flex items-center justify-center">
                                        <img src={resolveImagePreview} alt="Preview" className="max-h-36 object-contain" />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setResolveImage(null);
                                                setResolveImagePreview(null);
                                            }}
                                            className="absolute top-2 right-2 p-1 rounded-full bg-black/70 text-white"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <label className="flex items-center justify-center gap-2 p-3 border border-dashed border-slate-700 hover:border-slate-600 rounded-lg cursor-pointer bg-slate-800/40 text-xs text-slate-300">
                                        <Camera className="w-4 h-4 text-slate-400" />
                                        <span>Ambil Foto Hasil Perbaikan</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={handleResolveImageChange}
                                            className="hidden"
                                        />
                                    </label>
                                )}
                            </div>

                            <div className="pt-2 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowResolveModal(null)}
                                    className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md"
                                >
                                    {isSubmitting ? 'Menyimpan...' : 'Konfirmasi Selesai'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}



            {/* MODAL 4: RESET CONFIRMATION */}
            {showResetConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4">
                        <div className="flex items-center gap-2 text-rose-400">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <h3 className="font-bold text-sm text-white">Reset Seluruh Data Simulasi?</h3>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                            Tindakan ini akan mengosongkan seluruh tiket uji coba di Sandbox. Cocok dilakukan jika sesi latihan telah selesai.
                        </p>
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                onClick={() => setShowResetConfirm(false)}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleResetSandbox}
                                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md"
                            >
                                Ya, Kosongkan Data
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: DETAIL ISU LENGKAP (SESUAI PREFERENSI KOLOM ERP) */}
            {activeDetailIssue && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
                    }`}>
                        {/* Header Modal */}
                        <div className={`p-4 border-b flex items-start justify-between gap-3 ${
                            isDark ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-slate-50'
                        }`}>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {visibleColumns.id && (
                                        <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${
                                            isDark ? 'text-amber-300 bg-slate-800 border-slate-700' : 'text-amber-800 bg-amber-50 border-amber-300'
                                        }`}>
                                            #{activeDetailIssue.issue_code || ('LEAN-' + activeDetailIssue.id)}
                                        </span>
                                    )}
                                    {visibleColumns.status && (
                                        <span className="text-[11px] font-bold">
                                            {activeDetailIssue.status === 'open' && (
                                                <span className={`px-2 py-0.5 rounded-full inline-flex items-center gap-1 border ${
                                                    isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-rose-100 text-rose-800 border-rose-300'
                                                }`}>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Open
                                                </span>
                                            )}
                                            {activeDetailIssue.status === 'in_progress' && (
                                                <span className={`px-2 py-0.5 rounded-full inline-flex items-center gap-1 border ${
                                                    isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-amber-100 text-amber-800 border-amber-300'
                                                }`}>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Progress
                                                </span>
                                            )}
                                            {activeDetailIssue.status === 'pending' && (
                                                <span className={`px-2 py-0.5 rounded-full inline-flex items-center gap-1 border ${
                                                    isDark ? 'bg-orange-500/20 text-orange-300 border-orange-500/40' : 'bg-orange-100 text-orange-800 border-orange-300'
                                                }`}>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> Tertunda
                                                </span>
                                            )}
                                            {activeDetailIssue.status === 'resolved' && (
                                                <span className={`px-2 py-0.5 rounded-full inline-flex items-center gap-1 border ${
                                                    isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                }`}>
                                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Selesai
                                                </span>
                                            )}
                                        </span>
                                    )}
                                </div>
                                {visibleColumns.title ? (
                                    <h3 className={`font-bold text-base leading-snug ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {activeDetailIssue.title}
                                    </h3>
                                ) : (
                                    <h3 className={`font-bold text-sm italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        Detail Isu Lapangan
                                    </h3>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedDetailIssue(null)}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                                    isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body Modal (Scrollable) */}
                        <div className="p-4 overflow-y-auto space-y-4 flex-1">
                            {/* Grid Informasi Utama */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {visibleColumns.location && (() => {
                                    const locInfo = resolveIssueResortAndZone(activeDetailIssue);
                                    const canNavigate = !locInfo.isOffice && (locInfo.resort === 'TBR' || locInfo.resort === 'TPI');

                                    return (
                                        <div
                                            onClick={canNavigate ? () => handleNavigateToMap(activeDetailIssue) : undefined}
                                            className={`p-2.5 rounded-xl border transition-all ${
                                                canNavigate
                                                    ? isDark
                                                        ? 'bg-slate-800/90 border-slate-700/80 hover:bg-slate-750 hover:border-emerald-500/60 cursor-pointer group shadow-sm'
                                                        : 'bg-slate-50 border-slate-200 hover:bg-emerald-50/50 hover:border-emerald-300 cursor-pointer group shadow-2xs'
                                                    : isDark
                                                    ? 'bg-slate-800/80 border-slate-700/80'
                                                    : 'bg-slate-50 border-slate-200'
                                            }`}
                                            title={
                                                canNavigate
                                                    ? `Klik untuk melihat titik lokasi pada Denah ${locInfo.resort}`
                                                    : 'Lokasi Kantor / Office (Denah pulau tidak tersedia)'
                                            }
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[10px] font-medium block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Lokasi Masalah</span>
                                                {canNavigate ? (
                                                    <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 transition-colors ${
                                                        isDark
                                                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 group-hover:bg-emerald-500 group-hover:text-slate-950'
                                                            : 'bg-emerald-100 text-emerald-800 border-emerald-200 group-hover:bg-emerald-600 group-hover:text-white'
                                                    }`}>
                                                        <span>Peta {locInfo.resort}</span>
                                                        <ExternalLink className="w-2.5 h-2.5" />
                                                    </span>
                                                ) : (
                                                    <span className={`text-[9.5px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Kantor</span>
                                                )}
                                            </div>
                                            <span className={`text-xs font-bold flex items-center gap-1 mt-0.5 ${
                                                isDark ? 'text-emerald-300 group-hover:text-emerald-200' : 'text-emerald-700 group-hover:text-emerald-800'
                                            }`}>
                                                <MapPin className={`w-3.5 h-3.5 ${canNavigate ? (isDark ? 'text-emerald-400 group-hover:scale-110' : 'text-emerald-600 group-hover:scale-110') : 'text-slate-400'} transition-transform`} />
                                                {activeDetailIssue.location}
                                            </span>
                                            {(() => {
                                                const gmapMatch = activeDetailIssue.location?.match(/https:\/\/maps\.google\.com\S+/);
                                                if (!gmapMatch) return null;
                                                return (
                                                    <a
                                                        href={gmapMatch[0]}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className={`inline-flex items-center gap-1 text-[10px] font-bold mt-1 underline ${
                                                            isDark ? 'text-sky-400 hover:text-sky-300' : 'text-sky-600 hover:text-sky-700'
                                                        }`}
                                                        title="Buka titik koordinat di Google Maps"
                                                    >
                                                        <span>Buka Pin Google Maps</span>
                                                        <ExternalLink className="w-2.5 h-2.5" />
                                                    </a>
                                                );
                                            })()}
                                        </div>
                                    );
                                })()}

                                {visibleColumns.time && (
                                    <div className={`p-2.5 rounded-xl border ${
                                        isDark ? 'bg-slate-800/80 border-slate-700/80' : 'bg-slate-50 border-slate-200'
                                    }`}>
                                        <span className={`text-[10px] font-medium block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Waktu Pelaporan</span>
                                        <span className={`text-xs font-semibold flex items-center gap-1 mt-0.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                                            {activeDetailIssue.created_at_human || activeDetailIssue.created_at}
                                        </span>
                                    </div>
                                )}

                                {visibleColumns.reporter && (
                                    <div className={`p-2.5 rounded-xl border ${
                                        isDark ? 'bg-slate-800/80 border-slate-700/80' : 'bg-slate-50 border-slate-200'
                                    }`}>
                                        <span className={`text-[10px] font-medium block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Pelapor</span>
                                        <span className={`text-xs font-semibold flex items-center gap-1 mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            <User className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                            {activeDetailIssue.reporter_name}
                                            {activeDetailIssue.reporter_dept && (
                                                <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                    ({activeDetailIssue.reporter_dept})
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Departemen Dituju & Penerima */}
                            {visibleColumns.dept && (
                                <div className={`p-3 rounded-xl border space-y-1.5 ${
                                    isDark ? 'bg-slate-800/60 border-slate-700/80' : 'bg-slate-50 border-slate-200'
                                }`}>
                                    <span className={`text-[10px] font-semibold block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Departemen Dituju & Penerima Isu:</span>
                                    <div className="flex flex-wrap gap-1.5 items-center">
                                        {(activeDetailIssue.target_departments || []).map((dept) => {
                                            const isThisDeptClaimed = activeDetailIssue.claimed_by_dept && (
                                                activeDetailIssue.claimed_by_dept.toLowerCase() === dept.toLowerCase()
                                            );
                                            const isThisAcc = activeDetailIssue.department_accs?.[dept]?.is_acc || isThisDeptClaimed;
                                            const accBy = activeDetailIssue.department_accs?.[dept]?.acc_by || (isThisDeptClaimed ? activeDetailIssue.claimed_by_name : null);
                                            const isWorking = activeDetailIssue.status === 'in_progress' && isThisDeptClaimed;

                                            return (
                                                <span
                                                    key={dept}
                                                    className={`px-2 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 ${
                                                        isWorking
                                                            ? isDark
                                                                ? 'bg-amber-950/80 border-amber-500 text-amber-200'
                                                                : 'bg-amber-100 border-amber-400 text-amber-900'
                                                            : isThisAcc
                                                            ? isDark
                                                                ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                                                                : 'bg-emerald-100 border-emerald-400 text-emerald-800'
                                                            : activeDetailIssue.status === 'in_progress'
                                                            ? isDark
                                                                ? 'bg-slate-900 border-amber-800/40 text-slate-300'
                                                                : 'bg-white border-amber-300 text-amber-900'
                                                            : isDark
                                                            ? 'bg-slate-900 border-slate-700 text-slate-300'
                                                            : 'bg-white border-slate-300 text-slate-700'
                                                    }`}
                                                >
                                                    <span>{dept}</span>
                                                    {isWorking ? (
                                                        <span className={`text-[10px] font-bold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>🟡 Dikerjakan ({activeDetailIssue.claimed_by_name})</span>
                                                    ) : isThisAcc ? (
                                                        <span className={`text-[10px] font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>✓ Diterima {accBy && `(${accBy})`}</span>
                                                    ) : activeDetailIssue.status === 'in_progress' ? (
                                                        <span className={`text-[10px] ${isDark ? 'text-amber-400/80' : 'text-amber-700'}`}>Diproses ({activeDetailIssue.claimed_by_name || 'Tim'})</span>
                                                    ) : (
                                                        <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Menunggu</span>
                                                    )}
                                                </span>
                                            );
                                        })}
                                        {/* Jika diambil oleh staf dari departemen lain (misal cross-department) */}
                                        {activeDetailIssue.claimed_by_dept && !(activeDetailIssue.target_departments || []).map(d => d.toLowerCase()).includes(activeDetailIssue.claimed_by_dept.toLowerCase()) && (
                                            <span className={`px-2 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 ${
                                                isDark ? 'bg-amber-950/80 border-amber-500 text-amber-200' : 'bg-amber-100 border-amber-400 text-amber-900'
                                            }`}>
                                                <span>{activeDetailIssue.claimed_by_dept}</span>
                                                <span className={`text-[10px] font-bold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>🟡 Dikerjakan ({activeDetailIssue.claimed_by_name})</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Deskripsi Lengkap */}
                            {visibleColumns.desc && (
                                <div className="space-y-1">
                                    <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Deskripsi Lengkap Masalah:</span>
                                    <div className={`p-3 rounded-xl border text-xs leading-relaxed whitespace-pre-line ${
                                        isDark ? 'bg-slate-950/70 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                                    }`}>
                                        {activeDetailIssue.description || <span className={`italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Tidak ada deskripsi tambahan yang dilampirkan.</span>}
                                    </div>
                                </div>
                            )}

                            {/* Foto Bukti */}
                            {visibleColumns.photo && activeDetailIssue.image_url && (
                                <div className="space-y-1.5">
                                    <span className={`text-xs font-bold flex items-center gap-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                        <Camera className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                        Lampiran Foto Masalah:
                                    </span>
                                    <div
                                        onClick={() => setLightboxImage(activeDetailIssue.image_url)}
                                        className={`relative rounded-xl overflow-hidden border cursor-pointer group max-h-56 flex items-center justify-center ${
                                            isDark ? 'border-slate-700 bg-black/40' : 'border-slate-300 bg-slate-100'
                                        }`}
                                        title="Klik untuk perbesar foto"
                                    >
                                        <img
                                            src={activeDetailIssue.image_url}
                                            alt="Bukti"
                                            className="max-h-56 w-full object-cover group-hover:scale-105 transition-transform"
                                        />
                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="text-xs font-bold text-white bg-black/70 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                                                <Eye className="w-4 h-4" /> Klik untuk Perbesar
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Status Penugasan & Penyelesaian */}
                            {visibleColumns.status && (activeDetailIssue.claimed_by_name || activeDetailIssue.resolved_by_name) && (
                                <div className={`p-3 rounded-xl border space-y-1 text-xs ${
                                    isDark ? 'bg-slate-800/50 border-slate-700/80' : 'bg-slate-50 border-slate-200'
                                }`}>
                                    {activeDetailIssue.claimed_by_name && (
                                        <p className={isDark ? 'text-amber-300' : 'text-amber-800 font-medium'}>
                                            Dikerjakan oleh: <strong>{activeDetailIssue.claimed_by_name}</strong> ({activeDetailIssue.claimed_by_dept})
                                        </p>
                                    )}
                                    {activeDetailIssue.resolved_by_name && (
                                        <p className={isDark ? 'text-emerald-300' : 'text-emerald-800 font-medium'}>
                                            Diselesaikan oleh: <strong>{activeDetailIssue.resolved_by_name}</strong> ({activeDetailIssue.resolved_by_dept})
                                            {activeDetailIssue.resolution_note && ` — "${activeDetailIssue.resolution_note}"`}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Riwayat Pengalihan Departemen (Transfer History) */}
                            {activeDetailIssue.transfer_history && activeDetailIssue.transfer_history.length > 0 && (
                                <div className={`p-3 rounded-xl border space-y-2 text-xs ${
                                    isDark ? 'bg-slate-900/90 border-amber-900/50' : 'bg-amber-50/70 border-amber-300'
                                }`}>
                                    <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        <span>Riwayat Pengalihan Departemen ({activeDetailIssue.transfer_history.length}x)</span>
                                    </div>
                                    <div className="space-y-1.5 pl-2 border-l-2 border-amber-500/40">
                                        {activeDetailIssue.transfer_history.map((hist, idx) => (
                                            <div key={idx} className={`p-2 rounded-lg border space-y-0.5 ${
                                                isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white border-amber-200 shadow-2xs'
                                            }`}>
                                                <div className={`flex items-center justify-between text-[11px] font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                                    <span>
                                                        <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>{hist.from_department}</span>
                                                        <span className="text-amber-500 mx-1.5">➔</span>
                                                        <span className={isDark ? 'text-emerald-400' : 'text-emerald-700'}>{hist.to_department}</span>
                                                    </span>
                                                    <span className={`text-[10px] font-normal ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                        {hist.transferred_at ? new Date(hist.transferred_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                                                    </span>
                                                </div>
                                                <p className={`text-[11px] italic ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                                    "{hist.reason}"
                                                </p>
                                                <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                    Oleh: <strong className={isDark ? 'text-slate-400' : 'text-slate-600'}>{hist.transferred_by}</strong>
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer Modal */}
                        <div className={`p-3 border-t flex items-center justify-between gap-2 flex-wrap ${
                            isDark ? 'border-slate-800 bg-slate-950/80' : 'border-slate-200 bg-slate-50'
                        }`}>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowColumnModal(true)}
                                    className={`text-[11px] flex items-center gap-1.5 transition-colors ${
                                        isDark ? 'text-slate-400 hover:text-emerald-400' : 'text-slate-600 hover:text-emerald-700'
                                    }`}
                                    title="Ubah kolom yang ditampilkan di modal & tabel"
                                >
                                    <SlidersHorizontal className="w-3.5 h-3.5" />
                                    <span>Sesuaikan Tampilan Data ({activeColumnCount}/{COLUMN_DEFS.length})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIssueToDelete(activeDetailIssue);
                                        setDeleteSupervisorName(myName || 'Supervisor');
                                    }}
                                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition ${
                                        isDark
                                            ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/30'
                                            : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                                    }`}
                                >
                                    <Trash2 className="w-3 h-3 text-rose-500" />
                                    <span>Hapus Tiket</span>
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedDetailIssue(null)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                                }`}
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* LIGHTBOX MODAL */}
            {lightboxImage && (
                <div
                    onClick={() => setLightboxImage(null)}
                    className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 cursor-pointer animate-in fade-in"
                >
                    <div className="relative max-w-3xl max-h-[90vh]">
                        <img
                            src={lightboxImage}
                            alt="Bukti Besar"
                            className="max-w-full max-h-[90vh] object-contain rounded-lg"
                        />
                        <button
                            onClick={() => setLightboxImage(null)}
                            className="absolute -top-10 right-0 text-white text-xs font-semibold bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full"
                        >
                            Tutup [X]
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL 5: ERP COLUMN CUSTOMIZER */}
            {showColumnModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
                    }`}>
                        {/* Header */}
                        <div className={`p-4 border-b flex items-center justify-between ${
                            isDark ? 'border-slate-800' : 'border-slate-200'
                        }`}>
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                                    <SlidersHorizontal className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>Kustomisasi Tampilan Data</h3>
                                    <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Pilih data yang ingin dimunculkan ({activeColumnCount} dari {COLUMN_DEFS.length} aktif)</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowColumnModal(false)}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                    isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Column Toggles List */}
                        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
                            {COLUMN_DEFS.map((col) => {
                                const isVisible = !!visibleColumns[col.id];
                                return (
                                    <button
                                        key={col.id}
                                        type="button"
                                        onClick={() => toggleColumn(col.id)}
                                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                                            isVisible
                                                ? isDark
                                                    ? 'bg-slate-800/90 border-emerald-500/50 text-white'
                                                    : 'bg-emerald-50/70 border-emerald-300 text-slate-900'
                                                : isDark
                                                ? 'bg-slate-900/60 border-slate-800 text-slate-500 hover:border-slate-700'
                                                : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-base">{col.icon}</span>
                                            <span className={isVisible ? (isDark ? 'text-white font-bold' : 'text-slate-900 font-bold') : (isDark ? 'text-slate-400' : 'text-slate-500')}>{col.label}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {isVisible ? (
                                                <span className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${
                                                    isDark ? 'text-emerald-400 bg-emerald-950/80 border-emerald-800/60' : 'text-emerald-800 bg-emerald-100 border-emerald-300'
                                                }`}>
                                                    <Eye className="w-3 h-3" />
                                                    Tampil
                                                </span>
                                            ) : (
                                                <span className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${
                                                    isDark ? 'text-slate-500 bg-slate-800/60 border-slate-800' : 'text-slate-500 bg-slate-200 border-slate-300'
                                                }`}>
                                                    <EyeOff className="w-3 h-3" />
                                                    Disembunyikan
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Actions Footer */}
                        <div className={`p-3 border-t flex items-center justify-between gap-2 ${
                            isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
                        }`}>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setAllColumns(true)}
                                    className={`px-2.5 py-1.5 text-[11px] rounded-lg transition-colors ${
                                        isDark ? 'text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700' : 'text-slate-700 hover:text-slate-900 bg-slate-200 hover:bg-slate-300'
                                    }`}
                                >
                                    Pilih Semua
                                </button>
                                <button
                                    type="button"
                                    onClick={resetColumns}
                                    className={`px-2.5 py-1.5 text-[11px] rounded-lg transition-colors flex items-center gap-1 ${
                                        isDark ? 'text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800' : 'text-slate-600 hover:text-slate-800 bg-slate-200 hover:bg-slate-300'
                                    }`}
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    Reset
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowColumnModal(false)}
                                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all"
                            >
                                Selesai
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* BOT CONTROL MODAL (CONFIGURED FOR BOT V2) */}
            <BotControlModal
                open={botControlModalOpen}
                onOpenChange={setBotControlModalOpen}
                botStatus={botStatus}
                onRefreshStatus={fetchBotStatus}
                botVersion="v2"
            />

            {/* MODAL: DELETE / SOFT DELETE ISSUE */}
            {issueToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-800 bg-rose-950/30 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
                                    <Trash2 className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-white">Hapus Tiket #{issueToDelete.issue_code || ('LEAN-' + issueToDelete.id)}</h3>
                                    <p className="text-[11px] text-slate-400">Soft Delete & Sinkronisasi Spreadsheet</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIssueToDelete(null)}
                                disabled={isDeleting}
                                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl space-y-1">
                                <div className="text-xs font-bold text-white line-clamp-2">{issueToDelete.title}</div>
                                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                    <span>Lokasi: <strong className="text-slate-300">{issueToDelete.location}</strong></span>
                                    <span>•</span>
                                    <span>Pelapor: <strong className="text-slate-300">{issueToDelete.reporter_name}</strong></span>
                                </div>
                            </div>

                            <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-xl text-xs space-y-1 text-amber-200/90 leading-relaxed">
                                <p className="font-semibold text-amber-300 flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    Kebijakan Integritas Data:
                                </p>
                                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-200/80">
                                    <li>Tiket ini akan <strong>disembunyikan dari dashboard & grafik</strong>.</li>
                                    <li>Data di <strong>Google Spreadsheet TIDAK DIHAPUS</strong>, melainkan ditandai non-aktif (<strong>Aktif di Dashboard = 0</strong>).</li>
                                    <li>Nama dan waktu penghapusan akan diaudit secara otomatis.</li>
                                </ul>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                    Nama Supervisor yang Menghapus:
                                </label>
                                <input
                                    type="text"
                                    value={deleteSupervisorName}
                                    onChange={(e) => setDeleteSupervisorName(e.target.value)}
                                    placeholder="Contoh: Pak Budi (Supervisor)"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-rose-500"
                                    disabled={isDeleting}
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end gap-2.5">
                            <button
                                type="button"
                                onClick={() => setIssueToDelete(null)}
                                disabled={isDeleting}
                                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteConfirm}
                                disabled={isDeleting}
                                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-600/30 flex items-center gap-1.5 transition disabled:opacity-50"
                            >
                                <Trash2 className={`w-3.5 h-3.5 ${isDeleting ? 'animate-spin' : ''}`} />
                                <span>{isDeleting ? 'Menghapus...' : 'Hapus Tiket'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MOBILE BOTTOM NAVIGATION DOCK (KARTU & PETA) */}
            <nav
                aria-label="Navigasi Bawah Mobile Lapangan"
                className={`fixed bottom-0 inset-x-0 z-40 md:hidden backdrop-blur-xl border-t shadow-[0_-8px_30px_rgba(0,0,0,0.4)] transition-colors duration-200 ${
                    isDark
                        ? 'bg-slate-900/95 border-slate-800 text-slate-300'
                        : 'bg-white/95 border-slate-200 text-slate-700 shadow-slate-200/50'
                }`}
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.35rem)' }}
            >
                <div className="grid grid-cols-3 max-w-sm mx-auto w-full px-2 py-1.5 gap-1.5">
                    {/* Tab 1: Tabel ERP */}
                    <button
                        type="button"
                        onClick={() => setViewMode('table')}
                        className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            viewMode === 'table'
                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                                : isDark
                                ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                                : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Table className="w-3.5 h-3.5 shrink-0" />
                        <span>Tabel</span>
                    </button>

                    {/* Tab 2: Kartu */}
                    <button
                        type="button"
                        onClick={() => setViewMode('cards')}
                        className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            viewMode === 'cards'
                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                                : isDark
                                ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                                : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                        <span>Kartu</span>
                        <span className={`text-[9px] px-1 py-0.2 rounded-full font-bold ${
                            viewMode === 'cards'
                                ? 'bg-white/20 text-white'
                                : isDark
                                ? 'bg-slate-800 text-slate-400'
                                : 'bg-slate-200 text-slate-700'
                        }`}>
                            {filteredIssues.length}
                        </span>
                    </button>

                    {/* Tab 3: Analisis */}
                    <button
                        type="button"
                        onClick={() => setViewMode('analytics')}
                        className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            viewMode === 'analytics'
                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                                : isDark
                                ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                                : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                        <span>Analisis</span>
                    </button>
                </div>
            </nav>

            {/* FLOATING ACTION BUTTON (+ Lapor Baru) FOR FAST FIELD REPORTING */}
            {viewMode !== 'analytics' && (
                <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-3 sm:px-5 sm:py-3.5 rounded-full shadow-2xl hover:shadow-emerald-500/40 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all border border-emerald-400/40 cursor-pointer"
                    title="Laporkan Masalah Baru"
                >
                    <Plus className="w-5 h-5 text-white" />
                    <span className="text-xs sm:text-sm tracking-wide">Lapor Masalah</span>
                </button>
            )}

            {/* MODAL 6: OFFLINE OUTBOX MODAL (HP LOCAL STORAGE QUEUE) */}
            {showOutboxModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className={`w-full max-w-lg border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col ${
                        isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
                    }`}>
                        {/* Header */}
                        <div className={`p-4 border-b flex items-center justify-between ${
                            isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
                        }`}>
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center">
                                    <CloudUpload className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        Antrean Offline HP (Outbox)
                                    </h3>
                                    <p className="text-[11px] text-slate-400">
                                        {outboxTickets.length} tiket tersimpan di memori perangkat
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowOutboxModal(false)}
                                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Outbox Content List */}
                        <div className="p-4 overflow-y-auto space-y-3 flex-1">
                            {outboxTickets.length === 0 ? (
                                <div className="text-center py-8 text-slate-400">
                                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2 opacity-80" />
                                    <p className="font-bold text-xs">Antrean Bersih / Kosong</p>
                                    <p className="text-[11px] mt-0.5 max-w-xs mx-auto">
                                        Semua laporan dari HP ini telah berhasil dikirim ke server Cloud dan disinkronkan ke Google Sheets.
                                    </p>
                                </div>
                            ) : (
                                outboxTickets.map((item) => (
                                    <div
                                        key={item.id}
                                        className={`p-3 rounded-xl border flex gap-3 items-start justify-between transition-all ${
                                            isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200 shadow-xs'
                                        }`}
                                    >
                                        {/* Photo thumbnail */}
                                        <div className="w-14 h-14 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                                            {item.imagePreview ? (
                                                <img src={item.imagePreview} alt="Foto" className="w-full h-full object-cover" />
                                            ) : (
                                                <ImageIcon className="w-5 h-5 text-slate-500" />
                                            )}
                                        </div>

                                        {/* Ticket Details */}
                                        <div className="min-w-0 flex-1">
                                            <h4 className={`font-bold text-xs truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                {item.title}
                                            </h4>
                                            <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400 mt-0.5">
                                                <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                                                <span className="truncate">{item.location}</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                                {item.target_departments?.map((d) => (
                                                    <span key={d} className="text-[9.5px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                                                        {d}
                                                    </span>
                                                ))}
                                                <span className="text-[9.5px] text-slate-500 ml-auto">
                                                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            {item.errorMessage && (
                                                <p className="text-[10px] text-rose-400 mt-1 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/40 truncate">
                                                    Gagal: {item.errorMessage}
                                                </p>
                                            )}
                                        </div>

                                        {/* Delete Action */}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteOutboxItem(item.id)}
                                            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors shrink-0 cursor-pointer"
                                            title="Batalkan dan hapus draf ini"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Footer */}
                        <div className={`p-3.5 border-t flex items-center justify-between gap-3 ${
                            isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
                        }`}>
                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                <span className={`text-[11px] font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                    {isOnline ? 'Online (Siap Kirim)' : 'Offline (Menunggu Sinyal)'}
                                </span>
                            </div>
                            {outboxTickets.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleManualSync}
                                    disabled={!isOnline || isSyncingOutbox}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                                >
                                    {isSyncingOutbox ? (
                                        <>
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                            <span>Mengirim...</span>
                                        </>
                                    ) : (
                                        <>
                                            <CloudUpload className="w-3.5 h-3.5" />
                                            <span>Kirim Semua ({outboxTickets.length})</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* FLOATING QUICK-RETURN TO TICKET BUTTON */}
            {returnTicket && viewMode === 'analytics' && (
                <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 flex items-center gap-2 bg-slate-900/95 border border-sky-500/60 shadow-2xl shadow-sky-950/50 rounded-2xl p-2 pl-3.5 backdrop-blur-md animate-in slide-in-from-bottom-4 duration-200">
                    <button
                        type="button"
                        onClick={() => {
                            setViewMode(returnTicket.previousViewMode || 'cards');
                            setSelectedDetailIssue(returnTicket.issue);
                            setReturnTicket(null);
                        }}
                        className="flex items-center gap-2 text-xs font-bold text-sky-300 hover:text-white transition-colors cursor-pointer"
                    >
                        <ArrowLeft className="w-4 h-4 text-sky-400 animate-pulse" />
                        <span>Kembali ke Tiket #{returnTicket.issue.issue_code || returnTicket.issue.id}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setReturnTicket(null)}
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs ml-1 transition-colors cursor-pointer"
                        title="Tutup tombol kembali"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
}
