import React, { useState, useRef, useMemo, useCallback } from 'react';
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
    Compass,
    Check,
    PanelRightClose,
    PanelRightOpen,
    ArrowRight,
    HelpCircle,
} from 'lucide-react';
import axios from 'axios';
import { router } from '@inertiajs/react';

export default function LeanInteractiveMapView({
    issues = [],
    currentUser = null,
    onSelectIssue = () => {},
    onOpenCreateIssue = () => {},
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

    // 5. Sidebar Tray & Direct Pinning State
    const [showSidebar, setShowSidebar] = useState(true);
    const [sidebarTab, setSidebarTab] = useState('unmapped'); // 'unmapped' | 'pinned'
    const [sidebarSearch, setSidebarSearch] = useState('');

    // Specific issue waiting to be placed onto the map via click
    const [pendingIssueToPin, setPendingIssueToPin] = useState(null);

    // 6. Selected Pin / Coordinates Drawer State
    const [activeSelection, setActiveSelection] = useState(null);
    const [customPinLabel, setCustomPinLabel] = useState('');
    const [unmappedSearch, setUnmappedSearch] = useState('');
    const [isPinningLoading, setIsPinningLoading] = useState(false);

    // 7. Toast Notification
    const [toastMessage, setToastMessage] = useState(null);
    const showToast = useCallback((msg, type = 'success') => {
        setToastMessage({ msg, type });
        setTimeout(() => setToastMessage(null), 4000);
    }, []);

    // Department & Admin helpers
    const userDept = currentUser?.department || '';
    const isAdmin = currentUser?.is_admin || (currentUser?.role && currentUser.role.toLowerCase() === 'admin');

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

            if (selectedDeptFilter !== 'all') {
                const depts = Array.isArray(iss.target_departments) ? iss.target_departments : [iss.department];
                if (!depts.includes(selectedDeptFilter)) return false;
            }

            if (selectedStatusFilter !== 'all') {
                if (iss.status !== selectedStatusFilter) return false;
            }

            const createdAt = iss.created_at ? new Date(iss.created_at).getTime() : now;
            if (timeFilter === 'all_active') {
                return iss.status !== 'resolved';
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
    }, [resortIssues, selectedDeptFilter, selectedStatusFilter, timeFilter, customStartDate, customEndDate]);

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

        // Only drop draft pin if in 'pin' mode
        if (interactionMode !== 'pin') {
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
                className={`p-3 rounded-2xl border shadow-md flex flex-wrap items-center justify-between gap-3 ${
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
                            setActiveResort('TPI');
                            setActiveSelection(null);
                            setPendingIssueToPin(null);
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            activeResort === 'TPI'
                                ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-white/20'
                                : isDark
                                ? 'text-slate-400 hover:text-white'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <span>🏝️ Private Island (TPI)</span>
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
                            setActiveResort('TBR');
                            setActiveSelection(null);
                            setPendingIssueToPin(null);
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            activeResort === 'TBR'
                                ? 'bg-sky-600 text-white shadow-sm ring-1 ring-white/20'
                                : isDark
                                ? 'text-slate-400 hover:text-white'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <span>🏖️ Beach Resort (TBR)</span>
                        <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                                activeResort === 'TBR' ? 'bg-black/25 text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                        >
                            {issues.filter((i) => (i.map_resort || '').toUpperCase() === 'TBR' && i.status !== 'resolved').length}
                        </span>
                    </button>
                </div>

                {/* Right controls: Mode Toggle, Zoom, Sidebar Switcher */}
                <div className="flex items-center gap-2 flex-wrap">
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
                        onClick={() => setShowSidebar((s) => !s)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                            showSidebar
                                ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                                : isDark
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                        }`}
                    >
                        {showSidebar ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                        <span className="hidden sm:inline">{isEn ? 'Ticket Drawer' : 'Daftar Isu'}</span>
                        {unmappedIssues.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                                {unmappedIssues.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* TOP BAR: ROW 2 (FILTERS & COUNTERS) */}
            <div
                className={`p-2.5 sm:p-3 rounded-2xl border shadow-sm flex flex-wrap items-center justify-between gap-2.5 ${
                    isDark ? 'bg-slate-900/80 border-slate-700/80' : 'bg-white border-slate-200'
                }`}
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
                            onChange={(e) => setTimeFilter(e.target.value)}
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
                            onChange={(e) => setSelectedDeptFilter(e.target.value)}
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
                            onChange={(e) => setSelectedStatusFilter(e.target.value)}
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
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <MapPin className="w-3.5 h-3.5" />
                        <strong>{pinnedIssues.length}</strong> {isEn ? 'pinned on map' : 'di peta'}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
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
                    <span className="font-bold flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <Calendar className="w-3.5 h-3.5" />
                        {isEn ? 'Date Range:' : 'Rentang Tanggal:'}
                    </span>
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs"
                        />
                        <span className="text-slate-400">&rarr;</span>
                        <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs"
                        />
                    </div>
                    {(customStartDate || customEndDate) && (
                        <button
                            type="button"
                            onClick={() => {
                                setCustomStartDate('');
                                setCustomEndDate('');
                            }}
                            className="text-slate-500 hover:text-slate-800 dark:hover:text-white underline text-[11px]"
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
                    {pendingIssueToPin ? (
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
                                className="absolute -translate-x-1/2 -translate-y-full pointer-events-none z-40 transition-all duration-200"
                                style={{ left: `${activeSelection.x}%`, top: `${activeSelection.y}%` }}
                            >
                                <div className="flex flex-col items-center animate-bounce">
                                    <div className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-black text-[11px] shadow-2xl border border-white flex items-center gap-1 whitespace-nowrap">
                                        <MapPin className="w-3.5 h-3.5" />
                                        <span>
                                            {isEn ? 'New Pin' : 'Pin Baru'} ({activeSelection.x}%, {activeSelection.y}%)
                                        </span>
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
                                    }}
                                    className={`absolute -translate-x-1/2 -translate-y-1/2 z-30 transition-all duration-200 group cursor-pointer focus:outline-none ${
                                        isSelected ? 'scale-125 z-40' : 'hover:scale-115'
                                    }`}
                                    style={{ left: `${cluster.x}%`, top: `${cluster.y}%` }}
                                    title={`${cluster.label || 'Titik Isu'}: ${count} issue(s)`}
                                >
                                    {hasOpen && (
                                        <div className="absolute -inset-2 rounded-full border-2 border-rose-500/80 animate-ping pointer-events-none" />
                                    )}

                                    <div
                                        className={`relative px-2 py-1 rounded-full text-xs font-black border shadow-lg flex items-center gap-1 ring-2 transition-all ${colorClass} ${
                                            isSelected ? 'ring-white ring-offset-2 ring-offset-slate-950 shadow-2xl' : ''
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
                    <div
                        className={`w-full lg:w-96 rounded-2xl border shadow-lg flex flex-col h-[480px] lg:h-[680px] overflow-hidden ${
                            isDark ? 'bg-slate-900/90 border-slate-700/80 text-white' : 'bg-white border-slate-200 text-slate-800'
                        }`}
                    >
                        {/* Sidebar Header & Tab Switcher */}
                        <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5 shrink-0">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                    <Layers className="w-4 h-4 text-emerald-500" />
                                    <span>{isEn ? 'Resort Issues Drawer' : 'Daftar Isu Denah'}</span>
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setShowSidebar(false)}
                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
                                    title="Tutup Panel"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Tab Switcher: Belum Ada Pin vs Sudah di Peta */}
                            <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setSidebarTab('unmapped')}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                        sidebarTab === 'unmapped'
                                            ? 'bg-amber-500 text-slate-950 shadow-xs'
                                            : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
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
                                            : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
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
                                    className="w-full text-xs rounded-xl pl-8 pr-3 py-1.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                            </div>
                        </div>

                        {/* List Content */}
                        <div className="p-3 overflow-y-auto flex-1 space-y-2">
                            {sidebarTab === 'unmapped' ? (
                                unmappedIssues.length === 0 ? (
                                    <div className="py-12 text-center text-slate-400 space-y-1">
                                        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
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
                                                    ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 ring-2 ring-amber-400'
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
                                                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                                            : 'bg-sky-500/20 text-sky-500 border border-sky-500/30'
                                                    }`}
                                                >
                                                    {iss.status}
                                                </span>
                                            </div>

                                            <h4 className="text-xs font-bold truncate text-slate-900 dark:text-white mb-0.5">
                                                {iss.title}
                                            </h4>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mb-2">
                                                📍 {iss.location}
                                            </p>

                                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-800/80">
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectIssue(iss)}
                                                    className="text-[11px] text-slate-500 hover:text-emerald-500"
                                                >
                                                    {isEn ? 'View Detail' : 'Lihat Detail'}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (pendingIssueToPin?.id === iss.id) {
                                                            setPendingIssueToPin(null);
                                                        } else {
                                                            setPendingIssueToPin(iss);
                                                            setInteractionMode('pin');
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
                                            </div>
                                        </div>
                                    ))
                                )
                            ) : (
                                pinnedIssues.length === 0 ? (
                                    <div className="py-12 text-center text-slate-400 space-y-1">
                                        <MapPin className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
                                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
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

                                            <h4 className="text-xs font-bold truncate text-slate-900 dark:text-white mb-0.5">
                                                {iss.title}
                                            </h4>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mb-2">
                                                📍 {iss.map_label || iss.location}
                                            </p>

                                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-800/80">
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectIssue(iss)}
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

            {/* PIN POPUP / DRAWER (WHEN A PIN OR DRAFT POINT IS CLICKED) */}
            {activeSelection && (
                <div
                    className={`w-full rounded-2xl border shadow-2xl p-4 sm:p-5 animate-in slide-in-from-bottom-4 duration-200 ${
                        isDark ? 'bg-slate-900/95 border-slate-700/80 text-white' : 'bg-white border-slate-300 text-slate-800'
                    }`}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold">
                                <MapPin className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                                    <span>{activeSelection.label || (isEn ? 'Pinned Location' : 'Titik Lokasi Denah')}</span>
                                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-normal">
                                        {activeSelection.resort} • X: {activeSelection.x.toFixed(1)}%, Y: {activeSelection.y.toFixed(1)}%
                                    </span>
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {activeSelection.issues.length > 0
                                        ? `${activeSelection.issues.length} ${isEn ? 'issue(s) at this location' : 'isu aktif di titik ini'}`
                                        : isEn
                                        ? 'No issues attached yet. Choose an action below.'
                                        : 'Belum ada isu yang ditautkan ke titik ini.'}
                                </p>
                            </div>
                        </div>

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
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>{isEn ? 'Report Here' : 'Buat Isu di Titik Ini'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveSelection(null)}
                                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Content Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4">
                        {/* COLUMN 1: ISSUES AT THIS POINT */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                    <Layers className="w-3.5 h-3.5 text-sky-500" />
                                    {isEn ? 'Active Issues at This Point' : 'Daftar Isu di Titik Ini'} ({activeSelection.issues.length})
                                </span>
                            </h4>

                            {activeSelection.issues.length === 0 ? (
                                <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 text-center">
                                    <p className="text-xs text-slate-500">
                                        {isEn
                                            ? 'No active issues at this coordinate. You can link an existing issue on the right or report a new one.'
                                            : 'Belum ada tiket aktif di titik ini. Anda dapat menautkan tiket di sebelah kanan atau membuat laporan baru.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                    {activeSelection.issues.map((iss) => (
                                        <div
                                            key={iss.id}
                                            className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex items-start justify-between gap-3"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <span className="font-mono text-xs font-black text-amber-500">
                                                        #{iss.issue_code || iss.id}
                                                    </span>
                                                    <span
                                                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                                            iss.status === 'open'
                                                                ? 'bg-rose-500/20 text-rose-500 border border-rose-500/40'
                                                                : iss.status === 'in_progress'
                                                                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40'
                                                                : iss.status === 'pending'
                                                                ? 'bg-sky-500/20 text-sky-500 border border-sky-500/40'
                                                                : 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/40'
                                                        }`}
                                                    >
                                                        {iss.status}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                                        {Array.isArray(iss.target_departments)
                                                            ? iss.target_departments.join(', ')
                                                            : iss.department}
                                                    </span>
                                                </div>
                                                <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate">{iss.title}</h5>
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                    📍 {iss.location}
                                                </p>
                                                {iss.claimed_by_name && (
                                                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                                                        <User className="w-3 h-3" />
                                                        <span>{iss.claimed_by_name}</span>
                                                    </p>
                                                )}
                                            </div>

                                            <div className="flex flex-col gap-1.5 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectIssue(iss)}
                                                    className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-semibold transition-colors"
                                                >
                                                    {isEn ? 'Details' : 'Lihat'}
                                                </button>
                                                {(isAdmin || (userDept && (Array.isArray(iss.target_departments) ? iss.target_departments.includes(userDept) : iss.department === userDept))) && (
                                                    <button
                                                        type="button"
                                                        disabled={isPinningLoading}
                                                        onClick={() => handleDetachPin(iss.id)}
                                                        className="px-2 py-0.5 rounded text-[10px] text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                                        title="Lepas pin dari isu ini"
                                                    >
                                                        <Unlink className="w-3 h-3 inline mr-0.5" />
                                                        {isEn ? 'Unpin' : 'Lepas'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* COLUMN 2: LINK UNMAPPED ISSUES TO THIS POINT */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                    <LinkIcon className="w-3.5 h-3.5 text-amber-500" />
                                    {isEn ? 'Link Unmapped Issues' : 'Tautkan Isu Tanpa Pin ke Titik Ini'}
                                </span>
                                <span className="text-[10px] font-normal text-slate-400">
                                    {isAdmin
                                        ? isEn ? 'Admin (All Depts)' : 'Admin (Semua Dept)'
                                        : `${isEn ? 'Dept:' : 'Dept:'} ${userDept || 'Umum'}`}
                                </span>
                            </h4>

                            {/* Search unmapped issues */}
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={unmappedSearch}
                                    onChange={(e) => setUnmappedSearch(e.target.value)}
                                    placeholder={
                                        isEn
                                            ? 'Search unmapped tickets by code, title, or location...'
                                            : 'Cari tiket tanpa pin (kode, judul, lokasi)...'
                                    }
                                    className="w-full text-xs rounded-xl pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-amber-500"
                                />
                            </div>

                            {/* Optional label input */}
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={customPinLabel}
                                    onChange={(e) => setCustomPinLabel(e.target.value)}
                                    placeholder={isEn ? 'Optional custom label (e.g., Villa 05)...' : 'Label lokasi (opsional, cth: Villa 05)...'}
                                    className="w-full text-xs rounded-xl px-3 py-1 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-amber-500"
                                />
                            </div>

                            {/* Unmapped list */}
                            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                                {unmappedIssues.length === 0 ? (
                                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 text-center">
                                        <Check className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                                        <p className="text-xs text-slate-500">
                                            {isEn
                                                ? 'No unmapped active issues for your department.'
                                                : 'Tidak ada tiket tanpa pin untuk departemen Anda.'}
                                        </p>
                                    </div>
                                ) : (
                                    unmappedIssues.map((iss) => (
                                        <div
                                            key={iss.id}
                                            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-mono text-[11px] font-bold text-amber-500">
                                                        #{iss.issue_code || iss.id}
                                                    </span>
                                                    <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                                        {iss.title}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                    📍 {iss.location} • {iss.reporter_name}
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                disabled={isPinningLoading}
                                                onClick={() => handleAttachIssue(iss.id)}
                                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                                            >
                                                <LinkIcon className="w-3 h-3" />
                                                <span>{isEn ? 'Attach' : 'Tautkan'}</span>
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
