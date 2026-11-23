import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
    MapPin,
    Plus,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    Maximize2,
    SlidersHorizontal,
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
    ChevronRight,
    Compass,
    Navigation,
    Info,
    Check,
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

    // 2. Interaction mode: 'navigate' (pan/zoom & click pins) vs 'pin' (click to drop/reposition pin)
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
    const [showFiltersModal, setShowFiltersModal] = useState(false);

    // 5. Selected Pin / Coordinates / Drawer State
    // activeSelection: { type: 'cluster' | 'draft', x: number, y: number, resort: string, issues: Array, label?: string }
    const [activeSelection, setActiveSelection] = useState(null);
    const [customPinLabel, setCustomPinLabel] = useState('');
    const [unmappedSearch, setUnmappedSearch] = useState('');
    const [isPinningLoading, setIsPinningLoading] = useState(false);

    // 6. Toast Notification
    const [toastMessage, setToastMessage] = useState(null);
    const showToast = useCallback((msg, type = 'success') => {
        setToastMessage({ msg, type });
        setTimeout(() => setToastMessage(null), 4000);
    }, []);

    // Department helper
    const userDept = currentUser?.department || '';
    const isAdmin = currentUser?.is_admin || (currentUser?.role && currentUser.role.toLowerCase() === 'admin');

    // Unique departments from issues
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

    // Filter issues by active resort & time/status/dept filters
    const filteredIssues = useMemo(() => {
        const now = new Date().getTime();

        return issues.filter((iss) => {
            // Must match resort
            const resortMatch = (iss.map_resort || 'TPI').toUpperCase() === activeResort.toUpperCase();
            if (!resortMatch) return false;

            // Must have coordinates
            if (iss.map_x === null || iss.map_x === undefined || iss.map_y === null || iss.map_y === undefined) {
                return false;
            }

            // Department filter
            if (selectedDeptFilter !== 'all') {
                const depts = Array.isArray(iss.target_departments) ? iss.target_departments : [iss.department];
                if (!depts.includes(selectedDeptFilter)) return false;
            }

            // Status filter
            if (selectedStatusFilter !== 'all') {
                if (iss.status !== selectedStatusFilter) return false;
            }

            // Time filter
            const createdAt = iss.created_at ? new Date(iss.created_at).getTime() : now;
            if (timeFilter === 'all_active') {
                // All active issues that are not resolved
                return iss.status !== 'resolved';
            } else if (timeFilter === '24h') {
                const diffHours = (now - createdAt) / (1000 * 60 * 60);
                return diffHours <= 24;
            } else if (timeFilter === '7d') {
                const diffDays = (now - createdAt) / (1000 * 60 * 60 * 24);
                return diffDays <= 7;
            } else if (timeFilter === '30d') {
                const diffDays = (now - createdAt) / (1000 * 60 * 60 * 24);
                return diffDays <= 30;
            } else if (timeFilter === 'custom') {
                if (customStartDate) {
                    const start = new Date(customStartDate).getTime();
                    if (createdAt < start) return false;
                }
                if (customEndDate) {
                    const end = new Date(customEndDate).setHours(23, 59, 59, 999);
                    if (createdAt > end) return false;
                }
                return true;
            }

            return true;
        });
    }, [issues, activeResort, selectedDeptFilter, selectedStatusFilter, timeFilter, customStartDate, customEndDate]);

    // Unmapped active issues for current user's department (or all if admin)
    const unmappedIssues = useMemo(() => {
        return issues.filter((iss) => {
            // Is it unmapped?
            const isUnmapped = iss.map_x === null || iss.map_x === undefined || iss.map_y === null || iss.map_y === undefined;
            if (!isUnmapped) return false;

            // Is it active?
            if (iss.status === 'resolved') return false;

            // Department check: Admin can map anything, department staff can map issues targeting their department or reported by them
            if (!isAdmin && userDept) {
                const depts = Array.isArray(iss.target_departments) ? iss.target_departments : [iss.department];
                const isTarget = depts.includes(userDept);
                const isReporter = iss.reporter_dept === userDept;
                if (!isTarget && !isReporter) return false;
            }

            // Keyword filter
            if (unmappedSearch.trim()) {
                const q = unmappedSearch.toLowerCase();
                const code = (iss.issue_code || '').toLowerCase();
                const title = (iss.title || '').toLowerCase();
                const loc = (iss.location || '').toLowerCase();
                return code.includes(q) || title.includes(q) || loc.includes(q);
            }

            return true;
        });
    }, [issues, isAdmin, userDept, unmappedSearch]);

    // Clustering pins within close proximity
    const clusters = useMemo(() => {
        // Dynamic cluster threshold in percent (decreases as zoom increases)
        const clusterRadius = Math.max(1.8, 3.8 / zoom);
        const clustersList = [];

        filteredIssues.forEach((issue) => {
            const ix = parseFloat(issue.map_x);
            const iy = parseFloat(issue.map_y);
            if (isNaN(ix) || isNaN(iy)) return;

            // Find existing cluster within clusterRadius
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
                // Weighted average coordinates
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
    }, [filteredIssues, zoom]);

    // Handle Pan & Drag on canvas
    const handleMouseDown = (e) => {
        if (e.button !== 0) return; // only left click
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

    const handleMouseUp = (e) => {
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

    // Canvas click: drop pin or select location
    const handleCanvasClick = (e) => {
        // Ignore if user was dragging/panning
        if (dragStartRef.current.hasMoved || touchStartRef.current.hasMoved) {
            return;
        }

        // Only drop pin if in 'pin' mode OR if user clicked directly
        if (interactionMode !== 'pin') {
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

        // Check if there are existing issues near this point
        const nearbyIssues = filteredIssues.filter((iss) => {
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

    // Attach unmapped issue to active coordinate
    const handleAttachIssue = async (issueId) => {
        if (!activeSelection) return;
        setIsPinningLoading(true);

        try {
            const res = await axios.post(`/lapangan/issues/${issueId}/pin`, {
                map_resort: activeSelection.resort,
                map_x: activeSelection.x,
                map_y: activeSelection.y,
                map_label: customPinLabel.trim() || undefined,
            });

            if (res.data.success) {
                showToast(isEn ? `Location pin attached to issue #${issueId}!` : `Pin lokasi berhasil ditautkan ke isu #${issueId}!`);
                // Refresh Inertia props in background
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
                        // Update active selection issues list
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

            {/* TOP BAR CONTROLS: RESORT SELECTOR, INTERACTION MODE, TIME FILTER, ZOOM */}
            <div
                className={`p-2 sm:p-3 rounded-2xl border shadow-lg flex flex-wrap items-center justify-between gap-2.5 liquid-glass-card ${
                    isDark ? 'border-white/10' : 'border-slate-200'
                }`}
            >
                {/* 1. Resort Switcher Pill */}
                <div className="flex items-center p-1 rounded-xl bg-slate-900/60 border border-slate-700/60 shadow-inner">
                    <button
                        type="button"
                        onClick={() => {
                            setActiveResort('TPI');
                            setActiveSelection(null);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            activeResort === 'TPI'
                                ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-white/20'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <span>🏝️ Private Island (TPI)</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
                            {issues.filter((i) => (i.map_resort || 'TPI').toUpperCase() === 'TPI' && i.status !== 'resolved').length}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setActiveResort('TBR');
                            setActiveSelection(null);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            activeResort === 'TBR'
                                ? 'bg-sky-600 text-white shadow-sm ring-1 ring-white/20'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <span>🏖️ Beach Resort (TBR)</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
                            {issues.filter((i) => (i.map_resort || '').toUpperCase() === 'TBR' && i.status !== 'resolved').length}
                        </span>
                    </button>
                </div>

                {/* 2. Interaction Mode Toggle */}
                <div className="flex items-center p-1 rounded-xl bg-slate-900/60 border border-slate-700/60">
                    <button
                        type="button"
                        onClick={() => setInteractionMode('navigate')}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            interactionMode === 'navigate'
                                ? 'bg-slate-700 text-white shadow-xs'
                                : 'text-slate-400 hover:text-white'
                        }`}
                        title={isEn ? 'Pan & Inspect Pins' : 'Geser Denah & Periksa Pin'}
                    >
                        <Compass className="w-3.5 h-3.5 text-sky-400" />
                        <span className="hidden sm:inline">{isEn ? 'Explore' : 'Navigasi'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setInteractionMode('pin')}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            interactionMode === 'pin'
                                ? 'bg-amber-600 text-slate-950 font-black shadow-xs ring-1 ring-white/30 animate-pulse'
                                : 'text-amber-400 hover:text-amber-300'
                        }`}
                        title={isEn ? 'Click map to place a pin' : 'Klik denah di mana saja untuk menaruh pin'}
                    >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{isEn ? '+ Drop Pin' : '+ Taruh Pin'}</span>
                    </button>
                </div>

                {/* 3. Time Filter & Quick Filters */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Time filter select */}
                    <div className="flex items-center rounded-xl border border-slate-700/60 bg-slate-900/60 px-2 py-1 text-xs">
                        <Clock className="w-3.5 h-3.5 text-emerald-400 mr-1.5" />
                        <select
                            value={timeFilter}
                            onChange={(e) => setTimeFilter(e.target.value)}
                            className="bg-transparent text-white font-semibold text-xs border-none focus:outline-none cursor-pointer pr-4"
                        >
                            <option value="all_active" className="bg-slate-900 text-white">
                                {isEn ? '⚡ All Active (Unresolved)' : '⚡ Semua Isu Aktif'}
                            </option>
                            <option value="24h" className="bg-slate-900 text-white">
                                {isEn ? '🕒 Last 24 Hours' : '🕒 24 Jam Terakhir'}
                            </option>
                            <option value="7d" className="bg-slate-900 text-white">
                                {isEn ? '📅 Last 7 Days' : '📅 7 Hari Terakhir'}
                            </option>
                            <option value="30d" className="bg-slate-900 text-white">
                                {isEn ? '📆 Last 30 Days' : '📆 30 Hari Terakhir'}
                            </option>
                            <option value="custom" className="bg-slate-900 text-white">
                                {isEn ? '🎯 Custom Date Range' : '🎯 Tanggal Khusus...'}
                            </option>
                        </select>
                    </div>

                    {/* Department Quick Filter */}
                    <div className="hidden md:flex items-center rounded-xl border border-slate-700/60 bg-slate-900/60 px-2 py-1 text-xs">
                        <select
                            value={selectedDeptFilter}
                            onChange={(e) => setSelectedDeptFilter(e.target.value)}
                            className="bg-transparent text-slate-300 font-semibold text-xs border-none focus:outline-none cursor-pointer pr-4"
                        >
                            <option value="all" className="bg-slate-900 text-white">
                                {isEn ? 'All Departments' : 'Semua Departemen'}
                            </option>
                            {departmentsList.map((d) => (
                                <option key={d} value={d} className="bg-slate-900 text-white">
                                    {d}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Zoom in/out/reset pill */}
                    <div className="flex items-center gap-0.5 rounded-xl border border-slate-700/60 bg-slate-900/60 p-0.5">
                        <button
                            type="button"
                            onClick={handleZoomOut}
                            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Zoom Out"
                        >
                            <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-1 text-[11px] font-mono text-slate-400 font-bold min-w-[36px] text-center">
                            {Math.round(zoom * 100)}%
                        </span>
                        <button
                            type="button"
                            onClick={handleZoomIn}
                            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Zoom In"
                        >
                            <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={handleResetView}
                            className="p-1 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors ml-0.5"
                            title="Reset View (100%)"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* CUSTOM DATE PICKER ROW (if timeFilter === 'custom') */}
            {timeFilter === 'custom' && (
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/80 flex items-center gap-3 text-xs animate-in fade-in">
                    <span className="font-bold text-slate-300 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                        {isEn ? 'Filter Date Range:' : 'Rentang Tanggal:'}
                    </span>
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-white text-xs focus:ring-1 focus:ring-emerald-500"
                        />
                        <span className="text-slate-500">&rarr;</span>
                        <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-white text-xs focus:ring-1 focus:ring-emerald-500"
                        />
                    </div>
                    {(customStartDate || customEndDate) && (
                        <button
                            type="button"
                            onClick={() => {
                                setCustomStartDate('');
                                setCustomEndDate('');
                            }}
                            className="text-slate-400 hover:text-white underline text-[11px]"
                        >
                            {isEn ? 'Clear' : 'Reset'}
                        </button>
                    )}
                </div>
            )}

            {/* INTERACTIVE MAP CANVAS CONTAINER */}
            <div
                ref={canvasContainerRef}
                className={`relative w-full h-[620px] sm:h-[680px] rounded-2xl overflow-hidden border shadow-2xl bg-slate-950 flex items-center justify-center select-none ${
                    interactionMode === 'pin' ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
            >
                {/* Visual Pin Mode Indicator Banner */}
                {interactionMode === 'pin' && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-amber-500/95 text-slate-950 text-xs font-black shadow-2xl border border-white/50 flex items-center gap-2 animate-bounce pointer-events-none">
                        <MapPin className="w-3.5 h-3.5 animate-pulse" />
                        <span>{isEn ? 'CLICK ANYWHERE ON MAP TO DROP PIN' : 'KLIK DI MANA SAJA DI PETA UNTUK MENARUH PIN'}</span>
                    </div>
                )}

                {/* Status Legend Pill */}
                <div className="absolute bottom-3 left-3 z-30 hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 shadow-lg text-[11px] font-semibold backdrop-blur-md">
                    <span className="text-slate-400 mr-1">{isEn ? 'Legend:' : 'Status:'}</span>
                    <span className="flex items-center gap-1 text-rose-400">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Open
                    </span>
                    <span className="flex items-center gap-1 text-amber-400">
                        <span className="w-2 h-2 rounded-full bg-amber-500" /> Dikerjakan
                    </span>
                    <span className="flex items-center gap-1 text-sky-400">
                        <span className="w-2 h-2 rounded-full bg-sky-500" /> Pending
                    </span>
                    <span className="flex items-center gap-1 text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> Selesai
                    </span>
                </div>

                {/* Active Filter Count Badge */}
                <div className="absolute top-3 right-3 z-30 px-2.5 py-1 rounded-xl bg-slate-900/90 border border-slate-700/80 text-[11px] font-bold text-slate-300 shadow-lg backdrop-blur-md">
                    <span>{clusters.reduce((acc, c) => acc + c.issues.length, 0)} {isEn ? 'active issues on map' : 'isu di peta'}</span>
                </div>

                {/* Transformable Canvas Layer */}
                <div
                    style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: 'center center',
                        transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                    }}
                    className="relative shrink-0 max-w-none inline-block"
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
                        className="max-w-none block select-none pointer-events-none filter contrast-[1.08] brightness-[0.98] shadow-2xl rounded-xl"
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
                                    <span>{isEn ? 'New Pin' : 'Pin Baru'} ({activeSelection.x}%, {activeSelection.y}%)</span>
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
                                {/* Expanding radar wave if open/urgent */}
                                {hasOpen && (
                                    <div className="absolute -inset-2 rounded-full border-2 border-rose-500/80 animate-ping pointer-events-none" />
                                )}

                                {/* Main Pin Badge */}
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

            {/* PIN DETAIL & ACTION DRAWER (Sliding up from bottom or floating card) */}
            {activeSelection && (
                <div className="w-full rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl overflow-hidden p-4 sm:p-5 animate-in slide-in-from-bottom-4 duration-200">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                                <MapPin className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                                    <span>{activeSelection.label || (isEn ? 'Pinned Location' : 'Titik Lokasi')}</span>
                                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-normal">
                                        {activeSelection.resort} • X: {activeSelection.x.toFixed(1)}%, Y: {activeSelection.y.toFixed(1)}%
                                    </span>
                                </h3>
                                <p className="text-xs text-slate-400">
                                    {activeSelection.issues.length > 0
                                        ? `${activeSelection.issues.length} ${isEn ? 'issue(s) at this location' : 'isu aktif di lokasi ini'}`
                                        : isEn
                                        ? 'No issues attached yet. Choose an action below.'
                                        : 'Belum ada isu yang ditautkan ke titik ini.'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Create issue at this pin */}
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
                                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Content Grid: Left Column = Active Issues at this Pin; Right Column = Link Unmapped Issues */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4">
                        {/* COLUMN 1: ISSUES AT THIS POINT */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                                    {isEn ? 'Active Issues at This Point' : 'Daftar Isu di Titik Ini'} ({activeSelection.issues.length})
                                </span>
                            </h4>

                            {activeSelection.issues.length === 0 ? (
                                <div className="p-6 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center">
                                    <p className="text-xs text-slate-500">
                                        {isEn
                                            ? 'No active issues at this coordinate. You can link an existing issue on the right or report a new one.'
                                            : 'Belum ada tiket aktif di titik ini. Anda dapat menautkan tiket di sebelah kanan atau membuat laporan baru.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                                    {activeSelection.issues.map((iss) => (
                                        <div
                                            key={iss.id}
                                            className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-all flex items-start justify-between gap-3"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <span className="font-mono text-xs font-black text-amber-400">
                                                        #{iss.issue_code || iss.id}
                                                    </span>
                                                    <span
                                                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                                            iss.status === 'open'
                                                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                                                : iss.status === 'in_progress'
                                                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                                                : iss.status === 'pending'
                                                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                                                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                                        }`}
                                                    >
                                                        {iss.status}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400">
                                                        {Array.isArray(iss.target_departments)
                                                            ? iss.target_departments.join(', ')
                                                            : iss.department}
                                                    </span>
                                                </div>
                                                <h5 className="text-xs font-bold text-white truncate">{iss.title}</h5>
                                                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                                    📍 {iss.location}
                                                </p>
                                                {iss.claimed_by_name && (
                                                    <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                                                        <User className="w-3 h-3" />
                                                        <span>{iss.claimed_by_name}</span>
                                                    </p>
                                                )}
                                            </div>

                                            <div className="flex flex-col gap-1.5 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectIssue(iss)}
                                                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                                                >
                                                    {isEn ? 'Details' : 'Lihat'}
                                                </button>
                                                {(isAdmin || (userDept && (Array.isArray(iss.target_departments) ? iss.target_departments.includes(userDept) : iss.department === userDept))) && (
                                                    <button
                                                        type="button"
                                                        disabled={isPinningLoading}
                                                        onClick={() => handleDetachPin(iss.id)}
                                                        className="px-2 py-0.5 rounded text-[10px] text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-colors"
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

                        {/* COLUMN 2: LINK UNMAPPED ISSUES TO THIS PIN */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                    <LinkIcon className="w-3.5 h-3.5 text-amber-400" />
                                    {isEn ? 'Link Unmapped Issues' : 'Tautkan Isu Tanpa Pin ke Titik Ini'}
                                </span>
                                <span className="text-[10px] font-normal text-slate-500">
                                    {isAdmin
                                        ? isEn ? 'Admin (All Depts)' : 'Admin (Semua Dept)'
                                        : `${isEn ? 'Dept:' : 'Dept:'} ${userDept || 'Umum'}`}
                                </span>
                            </h4>

                            {/* Search unmapped issues */}
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={unmappedSearch}
                                    onChange={(e) => setUnmappedSearch(e.target.value)}
                                    placeholder={
                                        isEn
                                            ? 'Search unmapped tickets by code, title, or location...'
                                            : 'Cari tiket tanpa pin (kode, judul, lokasi)...'
                                    }
                                    className="w-full text-xs bg-slate-950/80 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                />
                            </div>

                            {/* Optional label input */}
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={customPinLabel}
                                    onChange={(e) => setCustomPinLabel(e.target.value)}
                                    placeholder={isEn ? 'Optional custom label (e.g., Villa 05)...' : 'Label lokasi (opsional, cth: Villa 05)...'}
                                    className="w-full text-xs bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                />
                            </div>

                            {/* Unmapped issues list */}
                            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                                {unmappedIssues.length === 0 ? (
                                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center">
                                        <Check className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                                        <p className="text-xs text-slate-400">
                                            {isEn
                                                ? 'No unmapped active issues for your department.'
                                                : 'Tidak ada tiket tanpa pin untuk departemen Anda.'}
                                        </p>
                                    </div>
                                ) : (
                                    unmappedIssues.map((iss) => (
                                        <div
                                            key={iss.id}
                                            className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-2 hover:border-slate-700 transition-all"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-mono text-[11px] font-bold text-amber-400">
                                                        #{iss.issue_code || iss.id}
                                                    </span>
                                                    <span className="text-xs font-semibold text-white truncate">
                                                        {iss.title}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                                    📍 {iss.location} • {iss.reporter_name}
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                disabled={isPinningLoading}
                                                onClick={() => handleAttachIssue(iss.id)}
                                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition-colors shrink-0 disabled:opacity-50"
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
