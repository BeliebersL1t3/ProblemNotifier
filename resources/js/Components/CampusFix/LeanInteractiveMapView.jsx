import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    MapPin,
    Plus,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    Search,
    Calendar,
    CheckCircle2,
    Clock,
    AlertCircle,
    User,
    Layers,
    X,
    Link as LinkIcon,
    Unlink,
    Trash2,
    Compass,
    Check,
    PanelRightClose,
    PanelRightOpen,
    ArrowRight,
    HelpCircle,
    Filter,
    SlidersHorizontal,
    Lock,
} from 'lucide-react';
import axios from 'axios';
import { router } from '@inertiajs/react';

export default function LeanInteractiveMapView({
    issues = [],
    currentUser = null,
    onSelectIssue = () => {},
    onOpenCreateIssue = () => {},
    focusedIssueId = null,
    onClearFocusIssue = () => {},
    initialPendingPinIssue = null,
    onClearPendingPinIssue = () => {},
    isDark = true,
    isEn = false,
}) {
    // 1. Resort selection: TPI (default) or TBR
    const [activeResort, setActiveResort] = useState('TPI');

    // 2. Interaction mode: 'navigate' vs 'pin'
    const [interactionMode, setInteractionMode] = useState('navigate');

    // 3. Zoom & Pan State
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0, hasMoved: false });
    const canvasContainerRef = useRef(null);
    const mapImageRef = useRef(null);

    // 4. Filters: Time, Department, Status
    const [timeFilter, setTimeFilter] = useState('all_active'); // 'all_active', '24h', '7d', '30d', 'custom'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [selectedDeptFilter, setSelectedDeptFilter] = useState('all');
    const [selectedStatusFilter, setSelectedStatusFilter] = useState('all'); // 'all', 'open', 'in_progress', 'pending', 'resolved'
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    // 5. Sidebar Tray & Direct Pinning State
    const [showSidebar, setShowSidebar] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true));
    const [sidebarTab, setSidebarTab] = useState('unmapped'); // 'unmapped' | 'pinned'
    const [sidebarSearch, setSidebarSearch] = useState('');

    // Specific issue waiting to be placed onto the map via click
    const [pendingIssueToPin, setPendingIssueToPin] = useState(null);

    // Single-issue Isolation State (Focus on Map)
    const [isolatedIssueId, setIsolatedIssueId] = useState(() => focusedIssueId || null);

    useEffect(() => {
        if (focusedIssueId) {
            setIsolatedIssueId(focusedIssueId);
        }
    }, [focusedIssueId]);

    const handleClearIsolation = useCallback(() => {
        setIsolatedIssueId(null);
        onClearFocusIssue();
    }, [onClearFocusIssue]);

    const isolatedIssue = useMemo(() => {
        if (!isolatedIssueId) return null;
        return issues.find((i) => String(i.id) === String(isolatedIssueId)) || null;
    }, [issues, isolatedIssueId]);

    // Helper to check if an issue was resolved today (WIB timezone Asia/Jakarta)
    const isResolvedTodayWib = useCallback((iss) => {
        if (!iss || iss.status !== 'resolved') return false;
        const resolvedDateStr = iss.resolved_at || iss.updated_at;
        if (!resolvedDateStr) return false;
        const d = new Date(resolvedDateStr);
        if (isNaN(d.getTime())) return false;
        const resolvedDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
        const todayDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
        return resolvedDay === todayDay;
    }, []);

    // 6. Selected Pin / Coordinates Drawer State
    const [activeSelection, setActiveSelection] = useState(null);
    const [customPinLabel, setCustomPinLabel] = useState('');
    const [unmappedSearch, setUnmappedSearch] = useState('');
    const [isPinningLoading, setIsPinningLoading] = useState(false);

    // Auto-center, switch resort, and activate selection when focused/isolated issue changes
    useEffect(() => {
        if (!isolatedIssue) return;

        const targetResort = (isolatedIssue.map_resort || 'TPI').toUpperCase();
        if (targetResort !== activeResort.toUpperCase()) {
            setActiveResort(targetResort);
        }

        const ix = parseFloat(isolatedIssue.map_x);
        const iy = parseFloat(isolatedIssue.map_y);
        if (isNaN(ix) || isNaN(iy)) return;

        setActiveSelection({
            type: 'cluster',
            resort: targetResort,
            x: ix,
            y: iy,
            issues: [isolatedIssue],
            label: isolatedIssue.map_label || isolatedIssue.location || isolatedIssue.title,
        });
        setCustomPinLabel(isolatedIssue.map_label || '');

        const targetZoom = 1.8;
        setZoom(targetZoom);

        const timer = setTimeout(() => {
            if (mapImageRef.current) {
                const img = mapImageRef.current;
                const imgW = img.offsetWidth || 1000;
                const imgH = img.offsetHeight || 600;
                const targetPixelX = (ix / 100) * imgW;
                const targetPixelY = (iy / 100) * imgH;

                const newPanX = (imgW / 2 - targetPixelX) * targetZoom;
                const newPanY = (imgH / 2 - targetPixelY) * targetZoom;

                setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
            }
        }, 120);

        return () => clearTimeout(timer);
    }, [isolatedIssue, activeResort]);

    // 7. Toast Notification
    const [toastMessage, setToastMessage] = useState(null);
    const showToast = useCallback((msg, type = 'success') => {
        setToastMessage({ msg, type });
        setTimeout(() => setToastMessage(null), 4000);
    }, []);

    // Auto-activate pin placement when navigated from detail modal with an unpinned issue
    useEffect(() => {
        if (!initialPendingPinIssue) return;

        const locUpper = (initialPendingPinIssue.location || '').toUpperCase();
        let targetResort = (initialPendingPinIssue.map_resort || '').toUpperCase();
        if (targetResort !== 'TPI' && targetResort !== 'TBR') {
            if (locUpper.includes('TBR') || locUpper.includes('BEACH') || locUpper.includes('PRIVATE')) {
                targetResort = 'TBR';
            } else {
                targetResort = 'TPI';
            }
        }

        if (targetResort !== activeResort.toUpperCase()) {
            setActiveResort(targetResort);
        }

        setPendingIssueToPin(initialPendingPinIssue);
        setInteractionMode('pin');

        showToast(
            isEn
                ? `Click on the ${targetResort} map to place pin for #${initialPendingPinIssue.issue_code || initialPendingPinIssue.id}`
                : `Klik pada denah ${targetResort} untuk meletakkan pin #${initialPendingPinIssue.issue_code || initialPendingPinIssue.id}`,
            'info'
        );

        onClearPendingPinIssue();
    }, [initialPendingPinIssue, activeResort, isEn, onClearPendingPinIssue, showToast]);

    // Department & Admin helpers
    const userDept = currentUser?.department || '';
    const isAdmin = currentUser?.is_admin || (currentUser?.role && currentUser.role.toLowerCase() === 'admin');

    // Check if current user is authorized to place/update pin for this issue
    const canManageIssuePin = useCallback((iss) => {
        if (!iss) return false;
        if (isAdmin) return true;
        if (!userDept) return false;
        const targets = Array.isArray(iss.target_departments)
            ? iss.target_departments
            : (iss.department ? [iss.department] : []);
        const matchesTarget = targets.some((d) => d && d.toLowerCase() === userDept.toLowerCase());
        const matchesReporter = iss.reporter_dept && iss.reporter_dept.toLowerCase() === userDept.toLowerCase();
        return Boolean(matchesTarget || matchesReporter);
    }, [isAdmin, userDept]);

    // Unique departments
    const departmentsList = useMemo(() => {
        const depts = new Set();
        issues.forEach((iss) => {
            if (Array.isArray(iss.target_departments)) {
                iss.target_departments.forEach((d) => depts.add(d));
            } else if (iss.department) {
                depts.add(iss.department);
            }
        });
        return Array.from(depts).filter(Boolean).sort();
    }, [issues]);

    // Issues for current resort
    const resortIssues = useMemo(() => {
        return issues.filter((iss) => {
            const r = (iss.map_resort || 'TPI').toUpperCase();
            return r === activeResort.toUpperCase();
        });
    }, [issues, activeResort]);

    // Issues that have valid coordinates on current resort
    const pinnedIssues = useMemo(() => {
        const now = new Date().getTime();

        return resortIssues.filter((iss) => {
            if (iss.map_x === null || iss.map_x === undefined || iss.map_y === null || iss.map_y === undefined) {
                return false;
            }

            // Mode Isolasi: jika sedang memfokuskan 1 isu tertentu
            if (isolatedIssueId) {
                return String(iss.id) === String(isolatedIssueId);
            }

            if (selectedDeptFilter !== 'all') {
                const depts = Array.isArray(iss.target_departments) ? iss.target_departments : [iss.department];
                if (!depts.includes(selectedDeptFilter)) return false;
            }

            if (selectedStatusFilter !== 'all') {
                if (iss.status !== selectedStatusFilter) return false;
            }

            const createdAt = iss.created_at ? new Date(iss.created_at).getTime() : now;
            if (timeFilter === 'all_active') {
                // Jika user secara eksplisit memilih status resolved di dropdown filter
                if (selectedStatusFilter === 'resolved') {
                    return true;
                }
                // Default: Isu aktif selalu tampil. Isu resolved hanya tampil jika diselesaikan HARI INI (WIB).
                // Besoknya otomatis hilang dari peta.
                if (iss.status === 'resolved') {
                    return isResolvedTodayWib(iss);
                }
                return true;
            } else if (timeFilter === '24h') {
                return (now - createdAt) / (1000 * 60 * 60) <= 24;
            } else if (timeFilter === '7d') {
                return (now - createdAt) / (1000 * 60 * 60 * 24) <= 7;
            } else if (timeFilter === '30d') {
                return (now - createdAt) / (1000 * 60 * 60 * 24) <= 30;
            } else if (timeFilter === 'custom') {
                if (customStartDate && createdAt < new Date(customStartDate).getTime()) return false;
                if (customEndDate && createdAt > new Date(customEndDate).setHours(23, 59, 59, 999)) return false;
            }

            return true;
        });
    }, [resortIssues, isolatedIssueId, selectedDeptFilter, selectedStatusFilter, timeFilter, customStartDate, customEndDate, isResolvedTodayWib]);

    // Issues without coordinates (unmapped) for current resort
    const unmappedIssues = useMemo(() => {
        return resortIssues.filter((iss) => {
            const hasCoords = iss.map_x !== null && iss.map_x !== undefined && iss.map_y !== null && iss.map_y !== undefined;
            if (hasCoords) return false;
            if (iss.status === 'resolved') return false;

            if (sidebarSearch.trim()) {
                const q = sidebarSearch.toLowerCase();
                const code = (iss.issue_code || '').toLowerCase();
                const title = (iss.title || '').toLowerCase();
                const loc = (iss.location || '').toLowerCase();
                return code.includes(q) || title.includes(q) || loc.includes(q);
            }

            return true;
        });
    }, [resortIssues, sidebarSearch]);

    // Clustering pins within close proximity
    const clusters = useMemo(() => {
        const clusterRadius = Math.max(1.8, 3.8 / zoom);
        const clustersList = [];

        pinnedIssues.forEach((issue) => {
            const ix = parseFloat(issue.map_x);
            const iy = parseFloat(issue.map_y);
            if (isNaN(ix) || isNaN(iy)) return;

            let found = null;
            for (const c of clustersList) {
                const dist = Math.hypot(c.x - ix, c.y - iy);
                if (dist <= clusterRadius) {
                    found = c;
                    break;
                }
            }

            if (found) {
                found.issues.push(issue);
                const count = found.issues.length;
                found.x = (found.x * (count - 1) + ix) / count;
                found.y = (found.y * (count - 1) + iy) / count;
            } else {
                clustersList.push({
                    id: `cluster-${issue.id}`,
                    x: ix,
                    y: iy,
                    issues: [issue],
                    label: issue.map_label || issue.location || '',
                });
            }
        });

        return clustersList;
    }, [pinnedIssues, zoom]);

    // Handle Pan & Drag on canvas
    const handleMouseDown = (e) => {
        if (e.button !== 0) return;
        setIsDragging(true);
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            panX: pan.x,
            panY: pan.y,
            hasMoved: false,
        };
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;

        if (Math.hypot(dx, dy) > 4) {
            dragStartRef.current.hasMoved = true;
        }

        setPan({
            x: dragStartRef.current.panX + dx,
            y: dragStartRef.current.panY + dy,
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Touch support for mobile pan & pinch
    const touchStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0, dist: 0, hasMoved: false });
    const handleTouchStart = (e) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            touchStartRef.current = {
                x: touch.clientX,
                y: touch.clientY,
                panX: pan.x,
                panY: pan.y,
                dist: 0,
                hasMoved: false,
            };
        } else if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            touchStartRef.current.dist = dist;
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const dx = touch.clientX - touchStartRef.current.x;
            const dy = touch.clientY - touchStartRef.current.y;
            if (Math.hypot(dx, dy) > 6) {
                touchStartRef.current.hasMoved = true;
            }
            setPan({
                x: touchStartRef.current.panX + dx,
                y: touchStartRef.current.panY + dy,
            });
        } else if (e.touches.length === 2 && touchStartRef.current.dist > 0) {
            const newDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const scaleFactor = newDist / touchStartRef.current.dist;
            setZoom((prev) => Math.min(3, Math.max(0.75, prev * scaleFactor)));
            touchStartRef.current.dist = newDist;
        }
    };

    // Canvas click: drop pin, attach pending issue, or open point drawer
    const handleCanvasClick = async (e) => {
        if (dragStartRef.current.hasMoved || touchStartRef.current.hasMoved) {
            return;
        }

        if (!mapImageRef.current) return;
        const rect = mapImageRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        if (clickX < 0 || clickX > rect.width || clickY < 0 || clickY > rect.height) {
            return;
        }

        const pctX = Math.round(((clickX / rect.width) * 100) * 10) / 10;
        const pctY = Math.round(((clickY / rect.height) * 100) * 10) / 10;

        // If user was placing a specific issue from the sidebar:
        if (pendingIssueToPin) {
            await handleAttachIssue(pendingIssueToPin.id, pctX, pctY, pendingIssueToPin.location || '');
            setPendingIssueToPin(null);
            setInteractionMode('navigate');
            return;
        }

        // If not in 'pin' mode, clicking the empty map canvas dismisses active pin selection
        if (interactionMode !== 'pin') {
            if (activeSelection) {
                setActiveSelection(null);
                setCustomPinLabel('');
            }
            return;
        }

        const nearbyIssues = pinnedIssues.filter((iss) => {
            const dx = parseFloat(iss.map_x) - pctX;
            const dy = parseFloat(iss.map_y) - pctY;
            return Math.hypot(dx, dy) <= 3.5;
        });

        setActiveSelection({
            type: nearbyIssues.length > 0 ? 'cluster' : 'draft',
            resort: activeResort,
            x: pctX,
            y: pctY,
            issues: nearbyIssues,
            label: nearbyIssues[0]?.map_label || nearbyIssues[0]?.location || '',
        });
        setCustomPinLabel(nearbyIssues[0]?.map_label || nearbyIssues[0]?.location || '');
        setShowSidebar(true);
    };

    // Zoom Controls
    const handleZoomIn = () => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100));
    const handleZoomOut = () => setZoom((z) => Math.max(0.75, Math.round((z - 0.25) * 100) / 100));
    const handleResetView = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    // Attach unmapped issue to coordinate
    const handleAttachIssue = async (issueId, targetX, targetY, labelText = '') => {
        const x = targetX !== undefined ? targetX : activeSelection?.x;
        const y = targetY !== undefined ? targetY : activeSelection?.y;
        if (x === undefined || y === undefined) return;

        const targetIssue = issues.find((i) => i.id === issueId);
        if (targetIssue && !canManageIssuePin(targetIssue)) {
            showToast(
                isEn
                    ? 'You do not have permission to map issues from other departments.'
                    : 'Anda tidak memiliki hak akses untuk memetakan tiket departemen lain.',
                'error'
            );
            return;
        }

        setIsPinningLoading(true);

        try {
            const res = await axios.post(`/lapangan/issues/${issueId}/pin`, {
                map_resort: activeResort,
                map_x: x,
                map_y: y,
                map_label: labelText.trim() || customPinLabel.trim() || undefined,
            });

            if (res.data.success) {
                showToast(
                    isEn
                        ? `Issue #${issueId} mapped to coordinates (${x}%, ${y}%)!`
                        : `Isu #${issueId} berhasil dipetakan di titik (${x}%, ${y}%)!`
                );
                router.reload({
                    only: ['issues'],
                    preserveScroll: true,
                    onSuccess: () => {
                        setIsPinningLoading(false);
                    },
                });
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            showToast(msg, 'error');
            setIsPinningLoading(false);
        }
    };

    // Detach pin from an issue
    const handleDetachPin = async (issueId) => {
        if (!confirm(isEn ? 'Remove map pin from this issue?' : 'Lepas pin lokasi dari isu ini?')) return;
        setIsPinningLoading(true);

        try {
            const res = await axios.post(`/lapangan/issues/${issueId}/pin`, {
                clear: true,
            });

            if (res.data.success) {
                showToast(isEn ? `Pin removed from issue #${issueId}` : `Pin berhasil dilepas dari isu #${issueId}`);
                router.reload({
                    only: ['issues'],
                    preserveScroll: true,
                    onSuccess: () => {
                        setIsPinningLoading(false);
                        setActiveSelection((prev) => {
                            if (!prev) return null;
                            const remaining = prev.issues.filter((i) => i.id !== issueId);
                            if (remaining.length === 0) return null;
                            return { ...prev, issues: remaining };
                        });
                    },
                });
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            showToast(msg, 'error');
            setIsPinningLoading(false);
        }
    };

    // Helper: Pin Urgency Color
    const getClusterColor = (clusterIssues) => {
        const hasOpen = clusterIssues.some((i) => i.status === 'open');
        if (hasOpen) return 'bg-rose-500 text-white ring-rose-400 border-rose-300 shadow-rose-500/40';

        const hasInProgress = clusterIssues.some((i) => i.status === 'in_progress');
        if (hasInProgress) return 'bg-amber-500 text-slate-950 ring-amber-400 border-amber-300 shadow-amber-500/40';

        const hasPending = clusterIssues.some((i) => i.status === 'pending');
        if (hasPending) return 'bg-sky-500 text-white ring-sky-400 border-sky-300 shadow-sky-500/40';

        return 'bg-emerald-500 text-white ring-emerald-400 border-emerald-300 shadow-emerald-500/40';
    };

    return (
        <div className="relative w-full flex flex-col space-y-3 pb-8 select-none">
            {/* TOAST ALERT */}
            {toastMessage && (
                <div className="fixed top-16 right-4 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
                    <div
                        className={`px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold border ${
                            toastMessage.type === 'error'
                                ? 'bg-rose-950/95 text-rose-200 border-rose-500/50'
                                : 'bg-emerald-950/95 text-emerald-200 border-emerald-500/50'
                        }`}
                    >
                        {toastMessage.type === 'error' ? (
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        )}
                        <span>{toastMessage.msg}</span>
                    </div>
                </div>
            )}

            {/* TOP BAR: ROW 1 (RESORT + MODES + ZOOM + SIDEBAR TOGGLE) */}
            <div
                className={`p-2 sm:p-3 rounded-2xl border shadow-md flex items-center justify-between gap-2 ${
                    isDark ? 'bg-slate-900/90 border-slate-700/80 text-white' : 'bg-white border-slate-200 text-slate-800'
                }`}
            >
                {/* 1. Resort Switcher Pill */}
                <div
                    className={`flex items-center p-1 rounded-xl border ${
                        isDark ? 'bg-slate-950/80 border-slate-700/80' : 'bg-slate-100 border-slate-300/80'
                    }`}
                >
                    <button
                        type="button"
                        onClick={() => {
                            if (isolatedIssueId) handleClearIsolation();
                            setActiveResort('TPI');
                            setActiveSelection(null);
                            setPendingIssueToPin(null);
                        }}
                        className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            activeResort === 'TPI'
                                ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-white/20'
                                : isDark
                                ? 'text-slate-400 hover:text-white'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <span>🏝️ <span className="hidden sm:inline">Private Island (</span>TPI<span className="hidden sm:inline">)</span></span>
                        <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                                activeResort === 'TPI' ? 'bg-black/25 text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                        >
                            {issues.filter((i) => (i.map_resort || 'TPI').toUpperCase() === 'TPI' && i.status !== 'resolved').length}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (isolatedIssueId) handleClearIsolation();
                            setActiveResort('TBR');
                            setActiveSelection(null);
                            setPendingIssueToPin(null);
                        }}
                        className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            activeResort === 'TBR'
                                ? 'bg-sky-600 text-white shadow-sm ring-1 ring-white/20'
                                : isDark
                                ? 'text-slate-400 hover:text-white'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <span>🏖️ <span className="hidden sm:inline">Beach Resort (</span>TBR<span className="hidden sm:inline">)</span></span>
                        <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                                activeResort === 'TBR' ? 'bg-black/25 text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                        >
                            {issues.filter((i) => (i.map_resort || '').toUpperCase() === 'TBR' && i.status !== 'resolved').length}
                        </span>
                    </button>
                </div>

                {/* Right controls for Desktop (LG and UP) */}
                <div className="hidden lg:flex items-center gap-2 flex-wrap">
                    {/* Interaction Mode Toggle */}
                    <div
                        className={`flex items-center p-1 rounded-xl border ${
                            isDark ? 'bg-slate-950/80 border-slate-700/80' : 'bg-slate-100 border-slate-300/80'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                setInteractionMode('navigate');
                                setPendingIssueToPin(null);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                interactionMode === 'navigate' && !pendingIssueToPin
                                    ? isDark
                                        ? 'bg-slate-700 text-white shadow-xs'
                                        : 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-300'
                                    : isDark
                                    ? 'text-slate-400 hover:text-white'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                            title={isEn ? 'Pan & Inspect' : 'Navigasi & Geser'}
                        >
                            <Compass className="w-3.5 h-3.5 text-sky-500" />
                            <span>{isEn ? 'Explore' : 'Navigasi'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setInteractionMode('pin');
                                setPendingIssueToPin(null);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                interactionMode === 'pin' || pendingIssueToPin
                                    ? 'bg-amber-500 text-slate-950 font-black shadow-xs ring-1 ring-white/30 animate-pulse'
                                    : 'text-amber-500 hover:text-amber-600'
                            }`}
                            title={isEn ? 'Click map anywhere to drop pin' : 'Klik denah di mana saja untuk menaruh pin'}
                        >
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{isEn ? '+ Drop Pin' : '+ Taruh Pin'}</span>
                        </button>
                    </div>

                    {/* Zoom in/out/reset */}
                    <div
                        className={`flex items-center gap-1 rounded-xl border p-1 ${
                            isDark ? 'bg-slate-950/80 border-slate-700/80' : 'bg-slate-100 border-slate-300/80'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={handleZoomOut}
                            className={`p-1.5 rounded-lg transition-colors ${
                                isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-white'
                            }`}
                            title="Zoom Out (-25%)"
                        >
                            <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-1 text-xs font-mono font-bold min-w-[42px] text-center">
                            {Math.round(zoom * 100)}%
                        </span>
                        <button
                            type="button"
                            onClick={handleZoomIn}
                            className={`p-1.5 rounded-lg transition-colors ${
                                isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-white'
                            }`}
                            title="Zoom In (+25%)"
                        >
                            <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={handleResetView}
                            className={`p-1.5 rounded-lg transition-colors ml-0.5 ${
                                isDark ? 'text-slate-400 hover:text-amber-400 hover:bg-slate-800' : 'text-slate-500 hover:text-amber-600 hover:bg-white'
                            }`}
                            title="Reset Zoom (100%)"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Toggle Sidebar Tray Button */}
                    <button
                        type="button"
                        onClick={() => {
                            setShowSidebar((s) => {
                                const next = !s;
                                if (next && typeof window !== 'undefined' && window.innerWidth < 1024) {
                                    setActiveSelection(null);
                                }
                                return next;
                            });
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                            showSidebar
                                ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                                : isDark
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                        }`}
                    >
                        {showSidebar ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                        <span className="text-xs">{isEn ? 'Tickets' : 'Daftar Isu'}</span>
                        {unmappedIssues.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                                {unmappedIssues.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Right controls for Mobile (Icon-First Header Bar) */}
                <div className="flex lg:hidden items-center gap-1.5 shrink-0">
                    {/* Mobile Quick Mode Toggle Icon Button */}
                    <button
                        type="button"
                        onClick={() => {
                            const next = interactionMode === 'pin' ? 'navigate' : 'pin';
                            setInteractionMode(next);
                            setPendingIssueToPin(null);
                        }}
                        className={`h-8.5 px-2.5 rounded-xl border flex items-center gap-1 text-xs font-bold transition-all cursor-pointer ${
                            interactionMode === 'pin' || pendingIssueToPin
                                ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-xs ring-2 ring-amber-400/30 animate-pulse'
                                : isDark
                                ? 'bg-slate-800 text-slate-300 border-slate-700'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                        title={interactionMode === 'pin' ? 'Mode Pin Aktif' : 'Taruh Pin Baru'}
                    >
                        <MapPin className="w-3.5 h-3.5 text-inherit" />
                        <span className="text-[11px]">{interactionMode === 'pin' ? 'Pin Aktif' : 'Taruh Pin'}</span>
                    </button>

                    {/* Mobile Filter Toggle Icon Button */}
                    <button
                        type="button"
                        onClick={() => setShowMobileFilters((f) => !f)}
                        className={`w-8.5 h-8.5 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                            showMobileFilters
                                ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                                : isDark
                                ? 'bg-slate-800 text-slate-300 border-slate-700'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                        title="Filter Waktu & Status"
                    >
                        <SlidersHorizontal className="w-4 h-4" />
                    </button>

                    {/* Mobile Drawer Toggle Icon Button */}
                    <button
                        type="button"
                        onClick={() => {
                            setShowSidebar((s) => {
                                const next = !s;
                                if (next) setActiveSelection(null);
                                return next;
                            });
                        }}
                        className={`h-8.5 px-2 rounded-xl border flex items-center gap-1 transition-all cursor-pointer ${
                            showSidebar
                                ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                                : isDark
                                ? 'bg-slate-800 text-slate-300 border-slate-700'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                        title="Daftar Isu Denah"
                    >
                        <Layers className="w-4 h-4" />
                        {unmappedIssues.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                                {unmappedIssues.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* TOP BAR: ROW 2 (FILTERS & COUNTERS) - Always visible on desktop (lg:flex), Collapsible on mobile */}
            <div
                className={`p-2.5 sm:p-3 rounded-2xl border shadow-sm items-center justify-between gap-2.5 ${
                    showMobileFilters ? 'flex flex-wrap' : 'hidden lg:flex'
                } ${isDark ? 'bg-slate-900/80 border-slate-700/80' : 'bg-white border-slate-200'}`}
            >
                {/* Left: Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Time Filter */}
                    <div
                        className={`flex items-center rounded-xl border px-2.5 py-1.5 text-xs ${
                            isDark ? 'bg-slate-950/80 border-slate-700/80 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
                        }`}
                    >
                        <Clock className="w-3.5 h-3.5 text-emerald-500 mr-2 shrink-0" />
                        <select
                            value={timeFilter}
                            onChange={(e) => {
                                setTimeFilter(e.target.value);
                                if (isolatedIssueId) handleClearIsolation();
                            }}
                            className="bg-transparent font-bold text-xs border-none focus:outline-none cursor-pointer pr-4"
                        >
                            <option value="all_active" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                                {isEn ? '⚡ All Active (Unresolved)' : '⚡ Semua Isu Aktif'}
                            </option>
                            <option value="24h" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                                {isEn ? '🕒 Last 24 Hours' : '🕒 24 Jam Terakhir'}
                            </option>
                            <option value="7d" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                                {isEn ? '📅 Last 7 Days' : '📅 7 Hari Terakhir'}
                            </option>
                            <option value="30d" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                                {isEn ? '📆 Last 30 Days' : '📆 30 Hari Terakhir'}
                            </option>
                            <option value="custom" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                                {isEn ? '🎯 Custom Date Range...' : '🎯 Rentang Tanggal Khusus...'}
                            </option>
                        </select>
                    </div>

                    {/* Department Filter */}
                    <div
                        className={`flex items-center rounded-xl border px-2.5 py-1.5 text-xs ${
                            isDark ? 'bg-slate-950/80 border-slate-700/80 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
                        }`}
                    >
                        <select
                            value={selectedDeptFilter}
                            onChange={(e) => {
                                setSelectedDeptFilter(e.target.value);
                                if (isolatedIssueId) handleClearIsolation();
                            }}
                            className="bg-transparent font-semibold text-xs border-none focus:outline-none cursor-pointer pr-4"
                        >
                            <option value="all" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                                {isEn ? 'All Departments' : 'Semua Departemen'}
                            </option>
                            {departmentsList.map((d) => (
                                <option key={d} value={d} className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                                    {d}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div
                        className={`flex items-center rounded-xl border px-2.5 py-1.5 text-xs ${
                            isDark ? 'bg-slate-950/80 border-slate-700/80 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
                        }`}
                    >
                        <select
                            value={selectedStatusFilter}
                            onChange={(e) => {
                                setSelectedStatusFilter(e.target.value);
                                if (isolatedIssueId) handleClearIsolation();
                            }}
                            className="bg-transparent font-semibold text-xs border-none focus:outline-none cursor-pointer pr-4"
                        >
                            <option value="all" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                                {isEn ? 'All Status' : 'Semua Status'}
                            </option>
                            <option value="open" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                                Open
                            </option>
                            <option value="in_progress" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                                Dikerjakan
                            </option>
                            <option value="pending" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                                Pending
                            </option>
                            <option value="resolved" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                                Selesai
                            </option>
                        </select>
                    </div>
                </div>

                {/* Right: Counter Stats */}
                <div className="flex items-center gap-3 text-xs font-semibold">
                    <span className={`flex items-center gap-1.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        <MapPin className="w-3.5 h-3.5" />
                        <strong>{pinnedIssues.length}</strong> {isEn ? 'pinned on map' : 'di peta'}
                    </span>
                    <span className={isDark ? 'text-slate-700' : 'text-slate-300'}>•</span>
                    <span className={`flex items-center gap-1.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                        <AlertCircle className="w-3.5 h-3.5" />
                        <strong>{unmappedIssues.length}</strong> {isEn ? 'unmapped' : 'belum ada pin'}
                    </span>
                </div>
            </div>

            {/* CUSTOM DATE ROW */}
            {timeFilter === 'custom' && (
                <div
                    className={`p-3 rounded-xl border flex items-center gap-3 text-xs animate-in fade-in ${
                        isDark ? 'bg-slate-900/90 border-slate-700/80 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                >
                    <span className={`font-bold flex items-center gap-1.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        <Calendar className="w-3.5 h-3.5" />
                        {isEn ? 'Date Range:' : 'Rentang Tanggal:'}
                    </span>
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className={`rounded-lg px-2.5 py-1 text-xs border ${
                                isDark
                                    ? 'bg-slate-800 border-slate-700 text-white'
                                    : 'bg-slate-100 border-slate-300 text-slate-900'
                            }`}
                        />
                        <span className="text-slate-400">&rarr;</span>
                        <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className={`rounded-lg px-2.5 py-1 text-xs border ${
                                isDark
                                    ? 'bg-slate-800 border-slate-700 text-white'
                                    : 'bg-slate-100 border-slate-300 text-slate-900'
                            }`}
                        />
                    </div>
                    {(customStartDate || customEndDate) && (
                        <button
                            type="button"
                            onClick={() => {
                                setCustomStartDate('');
                                setCustomEndDate('');
                            }}
                            className={`underline text-[11px] ${
                                isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            Reset
                        </button>
                    )}
                </div>
            )}

            {/* MAIN WORKSPACE: CANVAS (LEFT) + SIDEBAR TRAY (RIGHT) */}
            <div className="flex flex-col lg:flex-row items-stretch gap-3 w-full">
                {/* 1. MAP CANVAS */}
                <div
                    ref={canvasContainerRef}
                    className={`relative flex-1 h-[580px] sm:h-[640px] lg:h-[680px] rounded-2xl overflow-hidden border shadow-lg flex items-center justify-center select-none transition-colors ${
                        isDark ? 'bg-[#0a192f] border-slate-700/80' : 'bg-[#e3f2fd] border-slate-300'
                    } ${
                        pendingIssueToPin || interactionMode === 'pin'
                            ? 'cursor-crosshair'
                            : isDragging
                            ? 'cursor-grabbing'
                            : 'cursor-grab'
                    }`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                >
                    {/* FLOATING ACTION BANNER */}
                    {isolatedIssue ? (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2.5 rounded-2xl bg-slate-900/95 text-white text-xs font-semibold shadow-2xl border border-emerald-500/60 flex items-center gap-3 backdrop-blur-md animate-in fade-in slide-in-from-top-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                            <div className="flex items-center gap-1.5">
                                <span className="text-emerald-400 font-bold">{isEn ? 'Focused Issue:' : 'Isu Terfokus:'}</span>
                                <span className="max-w-[200px] sm:max-w-[340px] truncate">
                                    #{isolatedIssue.issue_code || isolatedIssue.id} - {isolatedIssue.title}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={handleClearIsolation}
                                className="ml-1 px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95"
                                title={isEn ? 'Show all issues on the map' : 'Tampilkan seluruh isu di peta'}
                            >
                                <X className="w-3.5 h-3.5" />
                                <span>{isEn ? 'Show All Issues' : 'Tampilkan Semua Isu'}</span>
                            </button>
                        </div>
                    ) : pendingIssueToPin ? (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black shadow-2xl border-2 border-white flex items-center gap-2 animate-bounce">
                            <MapPin className="w-4 h-4 animate-pulse" />
                            <span>
                                {isEn ? 'Click map to place:' : 'Klik di peta untuk menaruh:'} #{pendingIssueToPin.issue_code || pendingIssueToPin.id} ({pendingIssueToPin.title})
                            </span>
                            <button
                                type="button"
                                onClick={() => setPendingIssueToPin(null)}
                                className="ml-2 px-2 py-0.5 rounded bg-black/20 hover:bg-black/40 text-[10px] text-white"
                            >
                                {isEn ? 'Cancel' : 'Batal'}
                            </button>
                        </div>
                    ) : interactionMode === 'pin' ? (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black shadow-2xl border-2 border-white flex items-center gap-2 animate-bounce pointer-events-none">
                            <MapPin className="w-4 h-4 animate-pulse" />
                            <span>{isEn ? 'CLICK MAP ANYWHERE TO DROP A PIN' : 'KLIK DI DENAH UNTUK MENARUH PIN BEBAS'}</span>
                        </div>
                    ) : null}

                    {/* Status Legend Pill */}
                    <div
                        className={`absolute bottom-3 left-3 z-30 hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl border text-[11px] font-semibold backdrop-blur-md shadow-md ${
                            isDark ? 'bg-slate-900/90 border-slate-700/80 text-slate-300' : 'bg-white/95 border-slate-300 text-slate-700'
                        }`}
                    >
                        <span className="text-slate-400">{isEn ? 'Status:' : 'Status:'}</span>
                        <span className="flex items-center gap-1 text-rose-500">
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Open
                        </span>
                        <span className="flex items-center gap-1 text-amber-500">
                            <span className="w-2 h-2 rounded-full bg-amber-500" /> Dikerjakan
                        </span>
                        <span className="flex items-center gap-1 text-sky-500">
                            <span className="w-2 h-2 rounded-full bg-sky-500" /> Pending
                        </span>
                        <span className="flex items-center gap-1 text-emerald-500">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Selesai
                        </span>
                    </div>

                    {/* FLOATING ZOOM DOCK FOR MOBILE (Google Maps Style) */}
                    <div
                        className={`absolute bottom-3 right-3 z-30 lg:hidden flex flex-col items-center gap-1 p-1 rounded-2xl shadow-xl border backdrop-blur-md ${
                            isDark ? 'bg-slate-900/90 border-slate-700/80 text-white' : 'bg-white/95 border-slate-300 text-slate-800'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={handleZoomIn}
                            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-black/10 active:scale-95 transition-all cursor-pointer"
                            title="Zoom In"
                        >
                            <ZoomIn className="w-4 h-4 text-emerald-500" />
                        </button>
                        <span className="text-[10px] font-mono font-bold select-none px-1">
                            {Math.round(zoom * 100)}%
                        </span>
                        <button
                            type="button"
                            onClick={handleZoomOut}
                            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-black/10 active:scale-95 transition-all cursor-pointer"
                            title="Zoom Out"
                        >
                            <ZoomOut className="w-4 h-4 text-emerald-500" />
                        </button>
                        <div className={`w-5 h-px my-0.5 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
                        <button
                            type="button"
                            onClick={handleResetView}
                            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-black/10 active:scale-95 transition-all cursor-pointer"
                            title="Reset Zoom"
                        >
                            <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                        </button>
                    </div>

                    {/* Transformable Canvas Layer */}
                    <div
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            transformOrigin: 'center center',
                            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                        }}
                        className="relative shrink-0 max-w-none inline-block p-4"
                        onClick={handleCanvasClick}
                    >
                        {/* Masterplan Image */}
                        <img
                            ref={mapImageRef}
                            src={
                                activeResort === 'TPI'
                                    ? '/images/maps/tpi_masterplan_v3.png?v=1'
                                    : '/images/maps/tbr_masterplan.png'
                            }
                            alt={`${activeResort} Masterplan`}
                            draggable={false}
                            className="max-w-none block select-none pointer-events-none filter contrast-[1.08] brightness-[0.98] shadow-2xl rounded-2xl border border-slate-300/60 bg-white"
                            style={{
                                width: activeResort === 'TPI' ? '1280px' : '1180px',
                                height: 'auto',
                            }}
                        />

                        {/* DRAFT PIN (If user dropped a pin but haven't linked it yet) */}
                        {activeSelection && activeSelection.type === 'draft' && (
                            <div
                                className="absolute -translate-x-1/2 -translate-y-full pointer-events-auto z-40 transition-all duration-200"
                                style={{ left: `${activeSelection.x}%`, top: `${activeSelection.y}%` }}
                            >
                                <div className="flex flex-col items-center animate-bounce">
                                    <div className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-black text-[11px] shadow-2xl border border-white flex items-center gap-1.5 whitespace-nowrap">
                                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                                        <span>
                                            {isEn ? 'New Pin' : 'Pin Baru'} ({activeSelection.x}%, {activeSelection.y}%)
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveSelection(null);
                                                setCustomPinLabel('');
                                            }}
                                            className="ml-0.5 p-0.5 rounded-full hover:bg-black/20 text-slate-950 transition-colors cursor-pointer"
                                            title={isEn ? 'Cancel / Remove pin' : 'Batal / Hilangkan pin baru'}
                                        >
                                            <X className="w-3.5 h-3.5 stroke-[2.5]" />
                                        </button>
                                    </div>
                                    <div className="w-2.5 h-2.5 rotate-45 bg-amber-500 -mt-1 shadow-md border-r border-b border-white" />
                                </div>
                            </div>
                        )}

                        {/* CLUSTERED PINS */}
                        {clusters.map((cluster) => {
                            const count = cluster.issues.length;
                            const isSelected =
                                activeSelection &&
                                Math.hypot(activeSelection.x - cluster.x, activeSelection.y - cluster.y) < 1.0;
                            const isIsolated =
                                isolatedIssueId && cluster.issues.some((i) => String(i.id) === String(isolatedIssueId));
                            const isFocusedPin = Boolean(isIsolated || isSelected);
                            const colorClass = getClusterColor(cluster.issues);
                            const hasOpen = cluster.issues.some((i) => i.status === 'open');

                            return (
                                <button
                                    key={cluster.id}
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveSelection({
                                            type: 'cluster',
                                            resort: activeResort,
                                            x: cluster.x,
                                            y: cluster.y,
                                            issues: cluster.issues,
                                            label: cluster.label,
                                        });
                                        setCustomPinLabel(cluster.label);
                                        setShowSidebar(true);
                                    }}
                                    className={`absolute -translate-x-1/2 -translate-y-1/2 z-30 transition-all duration-200 group cursor-pointer focus:outline-none ${
                                        isFocusedPin ? 'scale-125 z-40' : 'hover:scale-115'
                                    }`}
                                    style={{ left: `${cluster.x}%`, top: `${cluster.y}%` }}
                                    title={`${cluster.label || 'Titik Isu'}: ${count} issue(s)`}
                                >
                                    {/* ANIMASI PULSE / RADAR BEACON PADA PIN TERFOKUS */}
                                    {isFocusedPin && (
                                        <>
                                            {/* Layer 1: Expanding Radar Ping */}
                                            <div className="absolute -inset-4 rounded-full bg-emerald-400/35 animate-ping pointer-events-none" />
                                            {/* Layer 2: Glowing Aura Beacon with Neon Glow Shadow */}
                                            <div className="absolute -inset-2.5 rounded-full border-2 border-emerald-400 bg-emerald-500/20 animate-pulse pointer-events-none shadow-[0_0_22px_rgba(52,211,153,0.95)]" />
                                        </>
                                    )}

                                    {hasOpen && !isFocusedPin && (
                                        <div className="absolute -inset-2 rounded-full border-2 border-rose-500/80 animate-ping pointer-events-none" />
                                    )}

                                    <div
                                        className={`relative px-2 py-1 rounded-full text-xs font-black border shadow-lg flex items-center gap-1 ring-2 transition-all ${colorClass} ${
                                            isFocusedPin ? 'ring-white ring-offset-2 ring-offset-emerald-950 shadow-2xl scale-110' : ''
                                        }`}
                                    >
                                        <MapPin className="w-3 h-3 shrink-0" />
                                        <span className="font-mono text-[11px]">{count}</span>
                                    </div>

                                    {/* Hover tooltip label */}
                                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap">
                                        <div className="px-2 py-0.5 rounded-md bg-slate-950/90 text-white border border-slate-700 text-[10px] font-bold shadow-xl">
                                            {cluster.label || `#${cluster.issues[0]?.issue_code || 'Issue'}`}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 2. SIDEBAR TRAY: UNMAPPED ISSUES & PINNED ISSUES */}
                {showSidebar && (
                    <>
                        {/* Mobile Backdrop */}
                        <div
                            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 lg:hidden animate-in fade-in duration-200"
                            onClick={() => setShowSidebar(false)}
                        />

                        {/* Drawer Container: Responsive Bottom Sheet on Mobile, Static Side Tray on Desktop */}
                        <div
                            className={`fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t shadow-2xl max-h-[82vh] h-[540px] flex flex-col animate-in slide-in-from-bottom duration-300 lg:static lg:w-96 lg:h-[680px] lg:rounded-2xl lg:border lg:shadow-lg lg:z-auto lg:animate-none overflow-hidden pb-safe ${
                                isDark ? 'bg-slate-900 border-slate-700/80 text-white' : 'bg-white border-slate-200 text-slate-800'
                            }`}
                        >
                            {/* Drag Indicator Pill for Mobile */}
                            <div className={`w-12 h-1.5 rounded-full mx-auto my-2.5 lg:hidden shrink-0 ${
                                isDark ? 'bg-slate-700' : 'bg-slate-300'
                            }`} />

                            {activeSelection ? (
                                /* PIN ACTION VIEW (Directly in Sidebar) */
                                <div className="flex flex-col h-full overflow-hidden">
                                    {/* Header */}
                                    <div className={`p-3 border-b space-y-2.5 shrink-0 ${
                                        isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                                    }`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold shrink-0">
                                                    <MapPin className="w-4 h-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className={`font-bold text-xs truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                        {activeSelection.type === 'draft'
                                                            ? isEn ? 'New Pin Dropped' : 'Titik Pin Baru'
                                                            : isEn ? 'Selected Pin' : 'Titik Pin Terpilih'}
                                                    </h4>
                                                    <span className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        {activeSelection.resort} • X: {activeSelection.x.toFixed(1)}%, Y: {activeSelection.y.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setActiveSelection(null);
                                                    setCustomPinLabel('');
                                                }}
                                                className={`p-1 rounded-lg transition-colors shrink-0 ${
                                                    isDark
                                                        ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                                                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                                                }`}
                                                title={isEn ? 'Close & return to issue list' : 'Tutup & batalkan pin'}
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {/* Label input */}
                                        <input
                                            type="text"
                                            value={customPinLabel}
                                            onChange={(e) => setCustomPinLabel(e.target.value)}
                                            placeholder={isEn ? 'Location label (e.g. Villa 05)...' : 'Label lokasi (cth: Villa 05, Pool)...'}
                                            className={`w-full text-xs rounded-xl px-2.5 py-1.5 border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                                                isDark
                                                    ? 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-500'
                                                    : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                                            }`}
                                        />

                                        {/* Action Buttons: Create Issue & Cancel Pin */}
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onOpenCreateIssue({
                                                        resort: activeSelection.resort,
                                                        x: activeSelection.x,
                                                        y: activeSelection.y,
                                                        label: customPinLabel.trim() || activeSelection.label,
                                                    });
                                                    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                                        setShowSidebar(false);
                                                    }
                                                }}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm hover:shadow-emerald-600/30 transition-all cursor-pointer"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                <span>{isEn ? 'Report New Issue Here' : '+ Buat Isu Baru'}</span>
                                            </button>

                                            {activeSelection.type === 'draft' && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setActiveSelection(null);
                                                        setCustomPinLabel('');
                                                    }}
                                                    className={`px-2.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0 ${
                                                        isDark
                                                            ? 'border-slate-700 bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 hover:border-rose-500/30'
                                                            : 'border-slate-300 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 hover:border-rose-300'
                                                    }`}
                                                    title={isEn ? 'Cancel & remove this pin' : 'Batal & hilangkan pin ini'}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                                    <span>{isEn ? 'Cancel' : 'Batal Pin'}</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Scrollable Content: Issues at this point + Link Unmapped Issues */}
                                    <div className="flex-1 overflow-y-auto p-3 space-y-4">
                                        {/* Section 1: Issues already at this point */}
                                        <div className="space-y-2">
                                            <div className={`flex items-center justify-between text-xs font-bold ${
                                                isDark ? 'text-slate-300' : 'text-slate-700'
                                            }`}>
                                                <span className={`flex items-center gap-1.5 uppercase text-[11px] tracking-wider ${
                                                    isDark ? 'text-slate-400' : 'text-slate-500'
                                                }`}>
                                                    <Layers className="w-3.5 h-3.5 text-sky-500" />
                                                    {isEn ? 'Issues at this point' : 'Isu di Titik Ini'} ({activeSelection.issues.length})
                                                </span>
                                            </div>

                                            {activeSelection.issues.length === 0 ? (
                                                <div className={`p-3 rounded-xl border border-dashed text-center ${
                                                    isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                                                }`}>
                                                    <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        {isEn
                                                            ? 'No issues linked yet. Choose an unmapped ticket below to link it here.'
                                                            : 'Belum ada tiket tertaut. Pilih tiket tanpa pin di bawah untuk menautkannya ke titik ini.'}
                                                    </p>
                                                </div>
                                            ) : (
                                                activeSelection.issues.map((iss) => (
                                                    <div
                                                        key={iss.id}
                                                        className={`p-2.5 rounded-xl border space-y-1.5 ${
                                                            isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="font-mono text-xs font-bold text-amber-500">
                                                                #{iss.issue_code || iss.id}
                                                            </span>
                                                            <span
                                                                className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                                                    iss.status === 'open'
                                                                        ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30'
                                                                        : iss.status === 'in_progress'
                                                                        ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                                                                        : iss.status === 'pending'
                                                                        ? 'bg-sky-500/20 text-sky-500 border border-sky-500/30'
                                                                        : 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                                                                }`}
                                                            >
                                                                {iss.status}
                                                            </span>
                                                        </div>
                                                        <h5 className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                            {iss.title}
                                                        </h5>
                                                        <p className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                            📍 {iss.location}
                                                        </p>
                                                        <div className={`flex items-center justify-between pt-1 border-t text-[11px] ${
                                                            isDark ? 'border-slate-800/80' : 'border-slate-200'
                                                        }`}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    onSelectIssue(iss);
                                                                    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                                                        setShowSidebar(false);
                                                                    }
                                                                }}
                                                                className="text-emerald-500 font-semibold hover:underline"
                                                            >
                                                                {isEn ? 'View Detail' : 'Lihat Detail'}
                                                            </button>
                                                            {(isAdmin || (userDept && (Array.isArray(iss.target_departments) ? iss.target_departments.includes(userDept) : iss.department === userDept))) && (
                                                                <button
                                                                    type="button"
                                                                    disabled={isPinningLoading}
                                                                    onClick={() => handleDetachPin(iss.id)}
                                                                    className="text-rose-500 hover:text-rose-600 flex items-center gap-1"
                                                                >
                                                                    <Unlink className="w-3 h-3" />
                                                                    <span>{isEn ? 'Unpin' : 'Lepas Pin'}</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        {/* Section 2: Link unmapped tickets to this coordinate */}
                                        <div className={`space-y-2 pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                                                    isDark ? 'text-slate-300' : 'text-slate-600'
                                                }`}>
                                                    <LinkIcon className="w-3.5 h-3.5 text-amber-500" />
                                                    {isEn ? 'Link Ticket to Here' : 'Tautkan Tiket ke Sini'}
                                                </span>
                                                <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                    {unmappedIssues.length} {isEn ? 'available' : 'tersedia'}
                                                </span>
                                            </div>

                                            {/* Search unmapped */}
                                            <div className="relative">
                                                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                                <input
                                                    type="text"
                                                    value={unmappedSearch}
                                                    onChange={(e) => setUnmappedSearch(e.target.value)}
                                                    placeholder={isEn ? 'Search ticket to link...' : 'Cari tiket untuk ditautkan...'}
                                                    className={`w-full text-xs rounded-xl pl-8 pr-3 py-1.5 border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                                                        isDark
                                                            ? 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-500'
                                                            : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                                                    }`}
                                                />
                                            </div>

                                            {/* List unmapped issues */}
                                            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                                                {unmappedIssues.length === 0 ? (
                                                    <p className={`text-[11px] text-center py-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        {isEn ? 'No unmapped tickets found.' : 'Tidak ada tiket tanpa pin ditemukan.'}
                                                    </p>
                                                ) : (
                                                    unmappedIssues.map((iss) => (
                                                        <div
                                                            key={iss.id}
                                                            className={`p-2 rounded-xl border flex items-center justify-between gap-2 ${
                                                                isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
                                                            }`}
                                                        >
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="font-mono text-[10px] font-bold text-amber-500">
                                                                        #{iss.issue_code || iss.id}
                                                                    </span>
                                                                    <span className={`text-xs font-semibold truncate ${
                                                                        isDark ? 'text-white' : 'text-slate-900'
                                                                    }`}>
                                                                        {iss.title}
                                                                    </span>
                                                                </div>
                                                                <p className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                    📍 {iss.location}
                                                                </p>
                                                            </div>
                                                            {canManageIssuePin(iss) ? (
                                                                <button
                                                                    type="button"
                                                                    disabled={isPinningLoading}
                                                                    onClick={() => handleAttachIssue(iss.id)}
                                                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition-colors shrink-0 disabled:opacity-50 cursor-pointer shadow-2xs"
                                                                >
                                                                    <LinkIcon className="w-3 h-3" />
                                                                    <span>{isEn ? 'Link' : 'Tautkan'}</span>
                                                                </button>
                                                            ) : (
                                                                <div
                                                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] shrink-0 border cursor-not-allowed select-none ${
                                                                        isDark
                                                                            ? 'bg-slate-900 border-slate-800 text-slate-500'
                                                                            : 'bg-slate-200 border-slate-300 text-slate-500'
                                                                    }`}
                                                                    title={
                                                                        isEn
                                                                            ? `Only ${iss.target_departments?.join(', ') || iss.department || 'the assigned'} department or Admin can map this ticket.`
                                                                            : `Hanya departemen ${iss.target_departments?.join(', ') || iss.department || 'terkait'} atau Admin yang dapat memetakan tiket ini.`
                                                                    }
                                                                >
                                                                    <Lock className="w-3 h-3 text-slate-400" />
                                                                    <span>{isEn ? 'Locked' : 'Dept Lain'}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* NORMAL TICKET DRAWER VIEW */
                                <div className="flex flex-col h-full overflow-hidden">
                                    {/* Sidebar Header & Tab Switcher */}
                                    <div className={`p-3 border-b space-y-2.5 shrink-0 ${
                                        isDark ? 'border-slate-800' : 'border-slate-200'
                                    }`}>
                                        <div className="flex items-center justify-between">
                                            <h3 className={`font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 ${
                                                isDark ? 'text-slate-400' : 'text-slate-600'
                                            }`}>
                                                <Layers className="w-4 h-4 text-emerald-500" />
                                                <span>{isEn ? 'Resort Issues Drawer' : 'Daftar Isu Denah'}</span>
                                            </h3>
                                            <button
                                                type="button"
                                                onClick={() => setShowSidebar(false)}
                                                className={`p-1 rounded-lg transition-colors ${
                                                    isDark
                                                        ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                                                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                                                }`}
                                                title="Tutup Panel"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {/* Tab Switcher: Belum Ada Pin vs Sudah di Peta */}
                                        <div className={`flex items-center p-1 rounded-xl border ${
                                            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                                        }`}>
                                            <button
                                                type="button"
                                                onClick={() => setSidebarTab('unmapped')}
                                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                                    sidebarTab === 'unmapped'
                                                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                                                        : isDark
                                                        ? 'text-slate-400 hover:text-white'
                                                        : 'text-slate-600 hover:text-slate-900'
                                                }`}
                                            >
                                                <span>{isEn ? 'Unmapped' : 'Belum Ada Pin'}</span>
                                                <span className="px-1.5 py-0.2 rounded-full bg-black/20 text-[10px] font-mono">
                                                    {unmappedIssues.length}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSidebarTab('pinned')}
                                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                                    sidebarTab === 'pinned'
                                                        ? 'bg-emerald-600 text-white shadow-xs'
                                                        : isDark
                                                        ? 'text-slate-400 hover:text-white'
                                                        : 'text-slate-600 hover:text-slate-900'
                                                }`}
                                            >
                                                <span>{isEn ? 'On Map' : 'Sudah di Peta'}</span>
                                                <span className="px-1.5 py-0.2 rounded-full bg-black/20 text-[10px] font-mono">
                                                    {pinnedIssues.length}
                                                </span>
                                            </button>
                                        </div>

                                        {/* Search bar in sidebar */}
                                        <div className="relative">
                                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                            <input
                                                type="text"
                                                value={sidebarSearch}
                                                onChange={(e) => setSidebarSearch(e.target.value)}
                                                placeholder={
                                                    sidebarTab === 'unmapped'
                                                        ? isEn ? 'Search unmapped issues...' : 'Cari tiket tanpa pin...'
                                                        : isEn ? 'Search pinned issues...' : 'Cari isu di peta...'
                                                }
                                                className={`w-full text-xs rounded-xl pl-8 pr-3 py-1.5 border focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                                                    isDark
                                                        ? 'bg-slate-950 border-slate-800 text-white placeholder:text-slate-500'
                                                        : 'bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400'
                                                }`}
                                            />
                                        </div>
                                    </div>

                                    {/* List Content */}
                                    <div className="p-3 overflow-y-auto flex-1 space-y-2">
                                        {sidebarTab === 'unmapped' ? (
                                            unmappedIssues.length === 0 ? (
                                                <div className="py-12 text-center text-slate-400 space-y-1">
                                                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                                                    <p className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                                        {isEn ? 'All issues mapped!' : 'Semua isu sudah memiliki pin!'}
                                                    </p>
                                                    <p className="text-[11px] text-slate-500">
                                                        {isEn ? 'No active unmapped issues for this resort.' : 'Tidak ada tiket aktif yang belum dipetakan.'}
                                                    </p>
                                                </div>
                                            ) : (
                                                unmappedIssues.map((iss) => (
                                                    <div
                                                        key={iss.id}
                                                        className={`p-3 rounded-xl border transition-all ${
                                                            pendingIssueToPin?.id === iss.id
                                                                ? `border-amber-500 ring-2 ring-amber-400 ${isDark ? 'bg-amber-950/40' : 'bg-amber-50/70'}`
                                                                : isDark
                                                                ? 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                                                                : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between gap-2 mb-1.5">
                                                            <span className="font-mono text-xs font-bold text-amber-500">
                                                                #{iss.issue_code || iss.id}
                                                            </span>
                                                            <span
                                                                className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                                                    iss.status === 'open'
                                                                        ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30'
                                                                        : iss.status === 'in_progress'
                                                                        ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                                                                        : 'bg-sky-500/20 text-sky-500 border border-sky-500/30'
                                                                }`}
                                                            >
                                                                {iss.status}
                                                            </span>
                                                        </div>

                                                        <h4 className={`text-xs font-bold truncate mb-0.5 ${
                                                            isDark ? 'text-white' : 'text-slate-900'
                                                        }`}>
                                                            {iss.title}
                                                        </h4>
                                                        <p className={`text-[11px] truncate mb-2 ${
                                                            isDark ? 'text-slate-400' : 'text-slate-500'
                                                        }`}>
                                                            📍 {iss.location}
                                                        </p>

                                                        <div className={`flex items-center justify-between gap-2 pt-1 border-t ${
                                                            isDark ? 'border-slate-800/80' : 'border-slate-200'
                                                        }`}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    onSelectIssue(iss);
                                                                    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                                                        setShowSidebar(false);
                                                                    }
                                                                }}
                                                                className="text-[11px] text-slate-500 hover:text-emerald-500"
                                                            >
                                                                {isEn ? 'View Detail' : 'Lihat Detail'}
                                                            </button>

                                                            {canManageIssuePin(iss) ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (pendingIssueToPin?.id === iss.id) {
                                                                            setPendingIssueToPin(null);
                                                                        } else {
                                                                            setPendingIssueToPin(iss);
                                                                            setInteractionMode('pin');
                                                                            if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                                                                setShowSidebar(false);
                                                                            }
                                                                            showToast(
                                                                                isEn
                                                                                    ? `Now click anywhere on the map to place #${iss.issue_code || iss.id}!`
                                                                                    : `Klik di mana saja pada denah untuk menempatkan pin #${iss.issue_code || iss.id}!`
                                                                            );
                                                                        }
                                                                    }}
                                                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                                                        pendingIssueToPin?.id === iss.id
                                                                            ? 'bg-rose-500 text-white'
                                                                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs'
                                                                    }`}
                                                                >
                                                                    <MapPin className="w-3 h-3" />
                                                                    <span>
                                                                        {pendingIssueToPin?.id === iss.id
                                                                            ? isEn ? 'Cancel' : 'Batal'
                                                                            : isEn ? 'Drop Pin' : 'Taruh Pin'}
                                                                    </span>
                                                                </button>
                                                            ) : (
                                                                <div
                                                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border cursor-not-allowed select-none ${
                                                                        isDark
                                                                            ? 'bg-slate-900 border-slate-800 text-slate-500'
                                                                            : 'bg-slate-200 border-slate-300 text-slate-500'
                                                                    }`}
                                                                    title={
                                                                        isEn
                                                                            ? `Only ${iss.target_departments?.join(', ') || iss.department || 'the assigned'} department or Admin can place a pin for this ticket.`
                                                                            : `Hanya departemen ${iss.target_departments?.join(', ') || iss.department || 'terkait'} atau Admin yang dapat menaruh pin tiket ini.`
                                                                    }
                                                                >
                                                                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                                                                    <span>{isEn ? 'Locked' : 'Dept Lain'}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            )
                                        ) : (
                                            pinnedIssues.length === 0 ? (
                                                <div className="py-12 text-center text-slate-400 space-y-1">
                                                    <MapPin className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
                                                    <p className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                                        {isEn ? 'No pinned issues yet' : 'Belum ada isu yang dipetakan'}
                                                    </p>
                                                    <p className="text-[11px] text-slate-500">
                                                        {isEn ? 'Click "Drop Pin" on any unmapped issue.' : 'Pilih tab "Belum Ada Pin" lalu klik "Taruh Pin".'}
                                                    </p>
                                                </div>
                                            ) : (
                                                pinnedIssues.map((iss) => (
                                                    <div
                                                        key={iss.id}
                                                        className={`p-3 rounded-xl border transition-all ${
                                                            isDark
                                                                ? 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                                                                : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-mono text-xs font-bold text-emerald-500">
                                                                    #{iss.issue_code || iss.id}
                                                                </span>
                                                                <span className="text-[10px] font-mono text-slate-400">
                                                                    ({iss.map_x}%, {iss.map_y}%)
                                                                </span>
                                                            </div>
                                                            <span
                                                                className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                                                    iss.status === 'open'
                                                                        ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30'
                                                                        : iss.status === 'in_progress'
                                                                        ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                                                                        : 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                                                                }`}
                                                            >
                                                                {iss.status}
                                                            </span>
                                                        </div>

                                                        <h4 className={`text-xs font-bold truncate mb-0.5 ${
                                                            isDark ? 'text-white' : 'text-slate-900'
                                                        }`}>
                                                            {iss.title}
                                                        </h4>
                                                        <p className={`text-[11px] truncate mb-2 ${
                                                            isDark ? 'text-slate-400' : 'text-slate-500'
                                                        }`}>
                                                            📍 {iss.map_label || iss.location}
                                                        </p>

                                                        <div className={`flex items-center justify-between gap-2 pt-1 border-t ${
                                                            isDark ? 'border-slate-800/80' : 'border-slate-200'
                                                        }`}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    onSelectIssue(iss);
                                                                    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                                                        setShowSidebar(false);
                                                                    }
                                                                }}
                                                                className="text-[11px] text-emerald-500 font-semibold hover:underline"
                                                            >
                                                                {isEn ? 'View Detail' : 'Lihat Detail'}
                                                            </button>

                                                            {(isAdmin || (userDept && (Array.isArray(iss.target_departments) ? iss.target_departments.includes(userDept) : iss.department === userDept))) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDetachPin(iss.id)}
                                                                    className="text-[11px] text-rose-500 hover:text-rose-600 flex items-center gap-1"
                                                                >
                                                                    <Unlink className="w-3 h-3" />
                                                                    <span>{isEn ? 'Unpin' : 'Lepas Pin'}</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            )
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
