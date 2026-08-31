import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
    ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock,
    CheckCircle2, Plus, MapPin, ZoomIn, CheckCheck,
    Edit2, Trash2, Building2, Check, ChevronDown, Search, X,
    MousePointerClick, Sparkles, User
} from 'lucide-react';
import { getDepartmentTheme } from '@/constants/departments';
import { ALL_DEPARTMENTS, normalizeDepartment } from '@/constants/staff';
import { Tooltip } from '@/Components/UI/Tooltip';
import { useAuth } from '@/hooks/useAuth';

// Format YYYY-MM-DD locally to avoid timezone offsets
function toDateString(d) {
    if (!d) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDateStr(str) {
    if (!str) return null;
    try {
        const clean = str.split('T')[0];
        const parts = clean.split('-');
        if (parts.length === 3) {
            return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        }
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
    } catch {
        return null;
    }
}

export function formatDateShort(str, lang = 'id') {
    if (!str) return '';
    try {
        return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' }).format(new Date(str));
    } catch { return str; }
}

export function formatDateFull(dateObj, lang = 'id') {
    if (!dateObj) return '';
    try {
        return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(dateObj);
    } catch { return String(dateObj); }
}

// ─── Multi-Range Parser ───────────────────────────────────────────────────────
export function parseTaskRanges(task) {
    if (!task) return [];
    if (Array.isArray(task.ranges) && task.ranges.length > 0) {
        return task.ranges;
    }
    if (task.notes && task.notes.includes('[SCHEDULE_RANGES:')) {
        try {
            const match = task.notes.match(/\[SCHEDULE_RANGES:\s*(\[.*?\])\s*\]/);
            if (match && match[1]) {
                const parsed = JSON.parse(match[1]);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            }
        } catch {}
    }
    if (task.startDate || task.endDate) {
        return [{ startDate: task.startDate || task.endDate, endDate: task.endDate || task.startDate }];
    }
    return [];
}

function isTaskActiveOnDate(task, targetDateStr) {
    const targetDate = parseDateStr(targetDateStr);
    if (!targetDate) return false;
    const targetTime = targetDate.getTime();

    const ranges = parseTaskRanges(task);
    if (ranges.length > 0) {
        return ranges.some(range => {
            const sDate = parseDateStr(range.startDate);
            const eDate = parseDateStr(range.endDate);
            if (sDate && eDate) {
                return targetTime >= sDate.getTime() && targetTime <= eDate.getTime();
            }
            if (sDate) return targetTime === sDate.getTime();
            if (eDate) return targetTime === eDate.getTime();
            return false;
        });
    }

    if (task.createdAt) {
        const cDate = parseDateStr(task.createdAt);
        return cDate && targetTime === cDate.getTime();
    }
    return false;
}

// ─── Multi-Department Filter Dropdown ─────────────────────────────────────────
function DepartmentMultiDropdown({
    departments = ALL_DEPARTMENTS,
    selectedDepartments = [],
    onChange,
    t,
    lang = 'id'
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const isAllSelected = selectedDepartments.length === departments.length;
    const isNoneSelected = selectedDepartments.length === 0;

    const filteredList = departments.filter(d =>
        d.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelectAll = () => {
        onChange(departments);
    };

    const handleClearAll = () => {
        onChange([]);
    };

    const handleToggle = (dept) => {
        if (selectedDepartments.includes(dept)) {
            onChange(selectedDepartments.filter(d => d !== dept));
        } else {
            onChange([...selectedDepartments, dept]);
        }
    };

    let triggerLabel = `${t('all_departments') || 'Semua Departemen'} (${departments.length})`;
    if (!isAllSelected && !isNoneSelected) {
        if (selectedDepartments.length === 1) {
            triggerLabel = selectedDepartments[0];
        } else {
            triggerLabel = `${selectedDepartments.length} ${t('department') || 'Departemen'} Dipilih`;
        }
    } else if (isNoneSelected) {
        triggerLabel = t('no_departments_selected') || '0 Departemen';
    }

    return (
        <div className="relative inline-block" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-sm ${
                    open || !isAllSelected
                        ? 'bg-[#353326] border-[#C9AA71] text-[#FAFAFA]'
                        : 'bg-[#1C1B0E] border-[#3B3929] text-[#A19F8D] hover:text-[#FAFAFA] hover:border-[#C9AA71]/60'
                }`}
            >
                <Building2 className="h-3.5 w-3.5 text-[#C9AA71]" />
                <span className="max-w-[160px] truncate">{triggerLabel}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-[#A19F8D] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute right-0 sm:left-0 top-full mt-2 z-[100] w-64 rounded-2xl border border-[#3B3929] bg-[#2A281E] p-3 shadow-2xl backdrop-blur-2xl animate-fade-in text-[#FAFAFA]">
                    {/* Header Controls */}
                    <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-[#3B3929]">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#C9AA71]">
                            {t('filter_by_dept') || 'Filter Departemen'}
                        </span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleSelectAll}
                                className="text-[10px] font-bold text-[#E3D1AA] hover:underline cursor-pointer"
                            >
                                {t('all') || 'Semua'}
                            </button>
                            <span className="text-[#3B3929]">&middot;</span>
                            <button
                                type="button"
                                onClick={handleClearAll}
                                className="text-[10px] font-bold text-[#A19F8D] hover:text-red-400 hover:underline cursor-pointer"
                            >
                                {t('cancel') || 'Reset'}
                            </button>
                        </div>
                    </div>

                    {/* Search Input */}
                    <div className="relative mb-2">
                        <Search className="h-3 w-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A19F8D]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('search_placeholder') || 'Cari departemen...'}
                            className="w-full pl-7 pr-3 py-1 rounded-lg bg-[#1C1B0E] border border-[#3B3929] text-xs text-[#FAFAFA] placeholder-[#A19F8D]/50 focus:border-[#C9AA71] focus:outline-none"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#A19F8D] hover:text-white"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>

                    {/* Department Checkbox List */}
                    <div className="max-h-56 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                        {filteredList.map((dept) => {
                            const isChecked = selectedDepartments.includes(dept);
                            const dTheme = getDepartmentTheme(dept);

                            return (
                                <button
                                    key={dept}
                                    type="button"
                                    onClick={() => handleToggle(dept)}
                                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                                        isChecked ? 'bg-[#353326]/70 text-[#FAFAFA]' : 'hover:bg-[#353326]/40 text-[#A19F8D]'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div
                                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                                            style={{ backgroundColor: dTheme.bg }}
                                        />
                                        <span className="truncate font-medium">{dept}</span>
                                    </div>
                                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                                        isChecked ? 'bg-[#C9AA71] border-[#C9AA71] text-[#1C1B0E]' : 'border-[#3B3929] bg-[#1C1B0E]'
                                    }`}>
                                        {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export function matchesTaskQuery(item, query) {
    if (!query) return true;
    const q = query.trim().toLowerCase();
    const title = (item.title || '').toLowerCase();
    const desc = (item.description || '').toLowerCase();
    const dept = (item.department || item.dept || '').toLowerCase();
    const loc = (item.location || item.locDetail || '').toLowerCase();
    const reporter = (item.createdBy || item.reporter || '').toLowerCase();
    const status = (item.status || '').toLowerCase();
    const statusLabel = status === 'done' ? 'selesai finished done' : 'aktif active belum selesai in progress';
    const ranges = parseTaskRanges(item);
    const dateMatches = ranges.some(r =>
        (r.startDate && r.startDate.includes(q)) ||
        (r.endDate && r.endDate.includes(q))
    );
    return title.includes(q) || desc.includes(q) || dept.includes(q) || loc.includes(q) || reporter.includes(q) || statusLabel.includes(q) || dateMatches;
}

export function getTaskPreviewDate(item, lang = 'id') {
    if (!item) return '';
    const ranges = parseTaskRanges(item);
    if (ranges.length > 0) {
        return ranges.map(r => {
            if (r.startDate && r.endDate && r.startDate !== r.endDate) {
                return `${formatDateShort(r.startDate, lang)} – ${formatDateShort(r.endDate, lang)}`;
            }
            return formatDateShort(r.startDate || r.endDate, lang);
        }).join(', ');
    }
    if (item.startDate || item.endDate) {
        if (item.startDate && item.endDate && item.startDate !== item.endDate) {
            return `${formatDateShort(item.startDate, lang)} – ${formatDateShort(item.endDate, lang)}`;
        }
        return formatDateShort(item.startDate || item.endDate, lang);
    }
    if (item.createdAt) {
        return formatDateShort(item.createdAt, lang);
    }
    return '';
}

export function OperationsCalendarView({
    manual = [],
    tasks = [],
    allDepartments,
    selectedDepartments,
    lockedDept = null,
    onDepartmentFilterChange,
    selectedDept,
    theme = { bg: '#C9AA71', text: '#1C1B0E' },
    onMarkDone,
    onDelete,
    onEdit,
    onPreviewImage,
    onAddWorkWithDate,
    onAddWorkWithDateRange,
    t,
    lang = 'id',
    searchQuery = '',
    onClearSearch,
    targetDateStr = null,
    highlightTaskId = null,
    highlightedDates = [],
    onClearHighlight,
}) {
    const { isAdmin, isDeptUser, department: userDept } = useAuth();
    const todayStr = toDateString(new Date());
    const [currentMonth, setCurrentMonth] = useState(() => new Date());
    const [selectedDateStr, setSelectedDateStr] = useState(todayStr);
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'done'
    const [hoveredTask, setHoveredTask] = useState(null);
    const [hoveredMore, setHoveredMore] = useState(null);

    // Dismiss hover previews on window scroll
    useEffect(() => {
        const handleScroll = () => {
            setHoveredTask(null);
            setHoveredMore(null);
        };
        window.addEventListener('scroll', handleScroll, true);
        return () => window.removeEventListener('scroll', handleScroll, true);
    }, []);

    // When targetDateStr changes (e.g. from search selection jump), jump calendar month and date
    useEffect(() => {
        if (targetDateStr) {
            const d = parseDateStr(targetDateStr);
            if (d) {
                setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                setSelectedDateStr(targetDateStr);
            }
        }
    }, [targetDateStr]);

    // When highlightTaskId changes, scroll and highlight in the day inspector
    useEffect(() => {
        if (highlightTaskId) {
            const el = document.getElementById(`task-card-${highlightTaskId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [highlightTaskId, selectedDateStr]);

    // Clear search date highlight when clicked anywhere else
    useEffect(() => {
        if (!highlightedDates || highlightedDates.length === 0) return;

        const handleWindowClick = () => {
            onClearHighlight?.();
        };

        // Delay attaching slightly so the click event from search selection doesn't dismiss it immediately
        const timer = setTimeout(() => {
            window.addEventListener('click', handleWindowClick);
        }, 150);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('click', handleWindowClick);
        };
    }, [highlightedDates, onClearHighlight]);

    // ─── Desktop Mouse Drag State ───────────────────────────────────────────────
    const [dragStart, setDragStart] = useState(null);
    const [dragHover, setDragHover] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const isMouseDownRef = useRef(false);

    const rawTaskList = tasks.length > 0 ? tasks : manual;

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const monthTitle = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
        month: 'long',
        year: 'numeric'
    }).format(currentMonth);

    // Filter strictly manual department tasks
    const allTasks = useMemo(() => {
        if (statusFilter === 'active') {
            return rawTaskList.filter(item => item.status === 'active');
        }
        if (statusFilter === 'done') {
            return rawTaskList.filter(item => item.status === 'done');
        }
        return rawTaskList;
    }, [rawTaskList, statusFilter]);

    // Calendar grid calculations
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const totalDaysInMonth = lastDayOfMonth.getDate();

    // Monday as start of week (0=Mon ... 6=Sun)
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const dayHeaders = lang === 'id'
        ? ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const handlePrevMonth = () => {
        setCurrentMonth(new Date(year, month - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentMonth(new Date(year, month + 1, 1));
    };

    const handleGoToday = () => {
        const now = new Date();
        setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
        setSelectedDateStr(todayStr);
    };

    // Calculate active drag range
    const dragRange = useMemo(() => {
        if (!isDragging || !dragStart || !dragHover) return null;
        const d1 = parseDateStr(dragStart);
        const d2 = parseDateStr(dragHover);
        if (!d1 || !d2) return null;
        const start = d1 < d2 ? dragStart : dragHover;
        const end = d1 < d2 ? dragHover : dragStart;
        return { start, end };
    }, [isDragging, dragStart, dragHover]);

    // Desktop Mouse Drag Handlers
    const handleCellMouseDown = (dateStr, e) => {
        // Only trigger on desktop left mouse button (e.button === 0)
        if (e.button !== 0 || e.pointerType === 'touch') return;
        isMouseDownRef.current = true;
        setDragStart(dateStr);
        setDragHover(dateStr);
        setIsDragging(false);
    };

    const handleCellMouseEnter = (dateStr) => {
        if (!isMouseDownRef.current || !dragStart) return;
        setDragHover(dateStr);
        if (dateStr !== dragStart) {
            setIsDragging(true);
        }
    };

    const handleCellMouseUp = (dateStr) => {
        if (!isMouseDownRef.current) return;
        isMouseDownRef.current = false;

        if (isDragging && dragStart && dragHover) {
            const d1 = parseDateStr(dragStart);
            const d2 = parseDateStr(dragHover);
            if (d1 && d2) {
                const sDate = d1 < d2 ? dragStart : dragHover;
                const eDate = d1 < d2 ? dragHover : dragStart;
                onAddWorkWithDateRange?.(sDate, eDate);
            }
        } else {
            setSelectedDateStr(dateStr);
        }

        setDragStart(null);
        setDragHover(null);
        setIsDragging(false);
    };

    // Global listener to safely cancel drag on outside release
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isMouseDownRef.current) {
                isMouseDownRef.current = false;
                setDragStart(null);
                setDragHover(null);
                setIsDragging(false);
            }
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    // Build day cells
    const calendarDays = useMemo(() => {
        const days = [];

        // Previous month padding
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const dayNum = prevMonthLastDay - i;
            const d = new Date(year, month - 1, dayNum);
            const dateStr = toDateString(d);
            days.push({
                key: `prev-${dayNum}`,
                dayNum,
                dateStr,
                isCurrentMonth: false,
                isToday: dateStr === todayStr,
            });
        }

        // Current month days
        for (let d = 1; d <= totalDaysInMonth; d++) {
            const dateObj = new Date(year, month, d);
            const dateStr = toDateString(dateObj);
            const tasksForDay = allTasks.filter(item => isTaskActiveOnDate(item, dateStr));
            const hasQueryMatch = searchQuery ? tasksForDay.some(item => matchesTaskQuery(item, searchQuery)) : false;

            days.push({
                key: `curr-${d}`,
                dayNum: d,
                dateStr,
                isCurrentMonth: true,
                isToday: dateStr === todayStr,
                tasks: tasksForDay,
                hasQueryMatch,
            });
        }

        // Next month padding to complete 35 or 42 cells
        const remainingCells = (7 - (days.length % 7)) % 7;
        for (let d = 1; d <= remainingCells; d++) {
            const nextDateObj = new Date(year, month + 1, d);
            const dateStr = toDateString(nextDateObj);
            days.push({
                key: `next-${d}`,
                dayNum: d,
                dateStr,
                isCurrentMonth: false,
                isToday: dateStr === todayStr,
            });
        }

        return days;
    }, [year, month, startDayOfWeek, totalDaysInMonth, todayStr, allTasks, searchQuery]);

    // Tasks for the selected date
    const selectedDateObj = parseDateStr(selectedDateStr) || new Date();
    const tasksForSelectedDate = useMemo(() => {
        const list = allTasks.filter(item => isTaskActiveOnDate(item, selectedDateStr));
        if (!searchQuery) return list;
        return [...list].sort((a, b) => {
            const aMatch = matchesTaskQuery(a, searchQuery);
            const bMatch = matchesTaskQuery(b, searchQuery);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0;
        });
    }, [allTasks, selectedDateStr, searchQuery]);

    return (
        <div className="space-y-6 select-none">
            {/* ─── Calendar Navigation & Filters Toolbar ─── */}
            <div className="relative z-20 flex flex-wrap items-center justify-between gap-4 bg-[#2A281E]/95 border border-[#3B3929] rounded-2xl p-4 sm:p-5 backdrop-blur-md shadow-xl">
                {/* Month Navigator */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-[#1C1B0E] border border-[#3B3929] rounded-xl p-1 shadow-inner">
                        <Tooltip content={t('tooltip_prev_month')} position="top">
                            <button
                                type="button"
                                onClick={handlePrevMonth}
                                className="p-2 rounded-lg hover:bg-[#3B3929]/70 text-[#A19F8D] hover:text-[#FAFAFA] transition-colors cursor-pointer"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                        </Tooltip>
                        <Tooltip content={t('tooltip_today_btn')} position="top">
                            <button
                                type="button"
                                onClick={handleGoToday}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#E3D1AA] hover:bg-[#3B3929]/70 transition-colors cursor-pointer"
                            >
                                {t('today_btn') || 'Hari Ini'}
                            </button>
                        </Tooltip>
                        <Tooltip content={t('tooltip_next_month')} position="top">
                            <button
                                type="button"
                                onClick={handleNextMonth}
                                className="p-2 rounded-lg hover:bg-[#3B3929]/70 text-[#A19F8D] hover:text-[#FAFAFA] transition-colors cursor-pointer"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </Tooltip>
                    </div>

                    <div>
                        <h2 className="text-lg sm:text-xl font-extrabold text-[#FAFAFA] capitalize tracking-tight flex items-center gap-2">
                            <CalendarIcon className="h-5 w-5 text-[#C9AA71]" />
                            {monthTitle}
                        </h2>
                        <p className="text-[11px] text-[#A19F8D] hidden sm:flex items-center gap-1">
                            <span>{allTasks.length} {t('total_work') || 'Total Tugas'}</span>
                            <span className="text-[#3B3929]">&middot;</span>
                            <span className="text-[#C9AA71]/90">{t('drag_hint_desktop') || '💡 Klik & seret mouse pada kalender untuk memilih rentang tanggal'}</span>
                        </p>
                    </div>
                </div>

                {/* Filters & Dropdowns */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Department Multi-Select Dropdown Filter for Admin, or Locked Badge for Dept Users */}
                    {!lockedDept && allDepartments && onDepartmentFilterChange ? (
                        <DepartmentMultiDropdown
                            departments={allDepartments}
                            selectedDepartments={selectedDepartments}
                            onChange={onDepartmentFilterChange}
                            t={t}
                            lang={lang}
                        />
                    ) : lockedDept ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#3B3929] bg-[#1C1B0E] text-xs font-bold shadow-xs">
                            <Building2 className="h-3.5 w-3.5 text-[#C9AA71]" />
                            <span 
                                className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded"
                                style={{ 
                                    color: getDepartmentTheme(lockedDept).text, 
                                    background: getDepartmentTheme(lockedDept).bg 
                                }}
                            >
                                {lockedDept}
                            </span>
                            <span className="text-[10px] text-[#A19F8D]">🔒 {t('locked_to_department') || 'Cakupan Departemen'}</span>
                        </div>
                    ) : null}

                    {/* Status Filter Chips */}
                    <div className="flex items-center gap-1 bg-[#1C1B0E] border border-[#3B3929] rounded-xl p-1 shadow-xs">
                        <button
                            type="button"
                            onClick={() => setStatusFilter('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                statusFilter === 'all'
                                    ? 'bg-[#C9AA71] text-[#1C1B0E] font-bold shadow-md'
                                    : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                            }`}
                        >
                            {t('all')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusFilter('active')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                statusFilter === 'active'
                                    ? 'bg-amber-500 text-[#1C1B0E] font-bold shadow-md'
                                    : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                            }`}
                        >
                            {t('status_active')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusFilter('done')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                statusFilter === 'done'
                                    ? 'bg-emerald-500 text-[#1C1B0E] font-bold shadow-md'
                                    : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                            }`}
                        >
                            {t('done_work')}
                        </button>
                    </div>


                    <button
                        type="button"
                        onClick={() => onAddWorkWithDate?.(selectedDateStr)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all hover:scale-105 shadow-md cursor-pointer bg-[#C9AA71] text-[#1C1B0E]"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{t('add_work_on_date') || 'Tambah Tugas'}</span>
                    </button>
                </div>
            </div>

            {/* ─── Main Content Split: Calendar Grid + Day Agenda Inspector ─── */}
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* ─── Calendar Month Grid (8 Cols on Desktop) ─── */}
                <div className="lg:col-span-8 bg-[#2A281E]/95 border border-[#3B3929] rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-xl">
                    {/* Day-of-week Header */}
                    <div className="grid grid-cols-7 gap-1.5 text-center mb-2 text-xs font-bold text-[#A19F8D] uppercase tracking-wider">
                        {dayHeaders.map((dh, idx) => (
                            <div key={idx} className={`py-2 rounded-lg ${idx >= 5 ? 'text-amber-400/90' : ''}`}>
                                {dh}
                            </div>
                        ))}
                    </div>

                    {/* Day Cells Grid */}
                    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                        {calendarDays.map((cell) => {
                            const isSelected = cell.dateStr === selectedDateStr;
                            const taskCount = cell.tasks?.length || 0;
                            const primaryDept = cell.tasks?.[0]?.department || cell.tasks?.[0]?.dept;
                            const primaryTheme = primaryDept ? getDepartmentTheme(primaryDept) : null;

                            // Check if cell is within active drag range
                            const isInDragRange = dragRange && cell.dateStr >= dragRange.start && cell.dateStr <= dragRange.end;
                            const isSearchDateHighlighted = highlightedDates && highlightedDates.includes(cell.dateStr);

                            let borderClass = 'border-[#3B3929]/70';
                            let bgClass = cell.isCurrentMonth ? 'bg-[#1C1B0E]/80 hover:bg-[#353326]/60' : 'bg-[#14140B]/40 opacity-40';

                            if (isInDragRange) {
                                borderClass = 'border-[#C9AA71] ring-2 ring-[#C9AA71]/70 shadow-xl';
                                bgClass = 'bg-[#C9AA71]/25 scale-[1.02]';
                            } else if (isSearchDateHighlighted) {
                                borderClass = 'border-[#C9AA71] ring-2 ring-[#C9AA71]/90 shadow-[0_0_18px_rgba(201,170,113,0.5)]';
                                bgClass = cell.isCurrentMonth ? 'bg-[#C9AA71]/25 hover:bg-[#C9AA71]/35 scale-[1.02]' : 'bg-[#C9AA71]/15 opacity-75';
                            } else if (isSelected) {
                                borderClass = 'border-[#C9AA71] ring-2 ring-[#C9AA71]/40 shadow-lg';
                                bgClass = 'bg-[#353326]';
                            } else if (cell.hasQueryMatch) {
                                borderClass = 'border-[#C9AA71] ring-2 ring-[#C9AA71]/60 shadow-[0_0_12px_rgba(201,170,113,0.3)]';
                                bgClass = cell.isCurrentMonth ? 'bg-[#C9AA71]/15 hover:bg-[#C9AA71]/25' : 'bg-[#C9AA71]/10 opacity-70';
                            } else if (cell.isToday) {
                                borderClass = 'border-[#C9AA71]/60';
                            }

                            return (
                                <div
                                    key={cell.key}
                                    onClick={() => {
                                        if (!isDragging) {
                                            setSelectedDateStr(cell.dateStr);
                                            onClearHighlight?.();
                                        }
                                    }}
                                    onMouseDown={(e) => handleCellMouseDown(cell.dateStr, e)}
                                    onMouseEnter={() => handleCellMouseEnter(cell.dateStr)}
                                    onMouseUp={() => handleCellMouseUp(cell.dateStr)}
                                    className={`min-h-[85px] sm:min-h-[105px] p-1.5 sm:p-2 rounded-xl border flex flex-col justify-between transition-all cursor-pointer group ${bgClass} ${borderClass}`}
                                >
                                    {/* Top Row: Date Number & Department Badge Indicator */}
                                    <div className="flex items-center justify-between mb-1 pointer-events-none">
                                        <div className="flex items-center gap-1">
                                            <span
                                                className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-lg transition-colors ${
                                                    cell.isToday
                                                        ? 'bg-[#C9AA71] text-[#1C1B0E] font-black shadow-sm'
                                                        : isSearchDateHighlighted || isSelected || isInDragRange
                                                            ? 'text-[#E3D1AA] font-black'
                                                            : cell.isCurrentMonth
                                                                ? 'text-[#FAFAFA] group-hover:text-[#C9AA71]'
                                                                : 'text-[#A19F8D]/60'
                                                }`}
                                            >
                                                {cell.dayNum}
                                            </span>
                                            {isSearchDateHighlighted && (
                                                <span className="text-[10px] shrink-0 animate-pulse">
                                                    📍
                                                </span>
                                            )}
                                        </div>

                                        {taskCount > 0 && (
                                            <span
                                                className="px-1.5 py-0.2 text-[10px] font-extrabold rounded-md flex items-center gap-1 shadow-xs"
                                                style={{
                                                    backgroundColor: primaryTheme?.bg ? `${primaryTheme.bg}30` : 'rgba(201, 170, 113, 0.2)',
                                                    color: primaryTheme?.bg === '#212121' ? '#FFFFFF' : (primaryTheme?.bg || '#E3D1AA'),
                                                    border: `1px solid ${primaryTheme?.bg || '#C9AA71'}60`
                                                }}
                                            >
                                                {taskCount}
                                            </span>
                                        )}
                                    </div>

                                    {/* Task Snippets / Pills Styled with Department Color */}
                                    <div className="space-y-1 overflow-hidden flex-1 flex flex-col justify-start">
                                        {cell.tasks?.slice(0, 2).map((item) => {
                                            const isDone = item.status === 'done';
                                            const itemDept = item.department || item.dept;
                                            const itemTheme = getDepartmentTheme(itemDept);
                                            const deptColor = itemTheme.bg === '#212121' ? '#FFFFFF' : itemTheme.bg;

                                            return (
                                                <div
                                                    key={item.id}
                                                    onMouseEnter={(e) => {
                                                        e.stopPropagation();
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setHoveredTask({ item, rect, dateStr: cell.dateStr });
                                                    }}
                                                    onMouseLeave={() => setHoveredTask(null)}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedDateStr(cell.dateStr);
                                                        const el = document.getElementById(`task-card-${item.id}`);
                                                        if (el) {
                                                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                        }
                                                    }}
                                                    className="truncate px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all shadow-xs cursor-pointer hover:scale-[1.02] hover:brightness-125"
                                                    style={{
                                                        backgroundColor: `${itemTheme.bg}25`,
                                                        color: deptColor,
                                                        borderLeft: `3px solid ${itemTheme.bg}`,
                                                        borderTop: `1px solid ${itemTheme.bg}30`,
                                                        borderRight: `1px solid ${itemTheme.bg}30`,
                                                        borderBottom: `1px solid ${itemTheme.bg}30`,
                                                    }}
                                                >
                                                    {isDone ? (
                                                        <CheckCircle2 className="h-2.5 w-2.5 shrink-0" style={{ color: deptColor }} />
                                                    ) : (
                                                        <Clock className="h-2.5 w-2.5 shrink-0 opacity-80" style={{ color: deptColor }} />
                                                    )}
                                                    <span className="truncate">{item.title}</span>
                                                </div>
                                            );
                                        })}

                                        {taskCount > 2 && (
                                            <div
                                                onMouseEnter={(e) => {
                                                    e.stopPropagation();
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    setHoveredMore({ tasks: cell.tasks.slice(2), rect, dateStr: cell.dateStr });
                                                }}
                                                onMouseLeave={() => setHoveredMore(null)}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedDateStr(cell.dateStr);
                                                }}
                                                className="text-[9px] font-bold text-[#A19F8D] hover:text-[#C9AA71] px-1 block opacity-80 cursor-pointer transition-colors"
                                            >
                                                +{taskCount - 2} {t('more') || 'lainnya'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ─── Day Agenda Inspector (4 Cols on Desktop) ─── */}
                <div id="day-agenda-inspector" className="lg:col-span-4 bg-[#2A281E]/95 border border-[#3B3929] rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-xl flex flex-col h-full">
                    {/* Header */}
                    <div className="pb-4 mb-4 border-b border-[#3B3929] flex items-start justify-between gap-2">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#C9AA71] flex items-center gap-1 mb-1">
                                <Clock className="h-3.5 w-3.5" />
                                {t('selected_day_agenda') || 'Agenda Harian'}
                            </span>
                            <h3 className="text-base sm:text-lg font-extrabold text-[#FAFAFA]">
                                {formatDateFull(selectedDateObj, lang)}
                            </h3>
                        </div>

                        <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-[#1C1B0E] border border-[#3B3929] text-[#E3D1AA]">
                            {tasksForSelectedDate.length} {tasksForSelectedDate.length === 1 ? (t('task_unit_singular') || (lang === 'id' ? 'Tugas' : 'Task')) : (t('task_unit') || (lang === 'id' ? 'Tugas' : 'Tasks'))}
                        </span>
                    </div>

                    {/* Task List on Selected Date */}
                    <div className="space-y-3.5 flex-1 overflow-y-auto max-h-[560px] pr-1 custom-scrollbar">
                        {tasksForSelectedDate.length === 0 ? (
                            <div className="text-center py-12 px-4 rounded-xl border border-dashed border-[#3B3929] bg-[#1C1B0E]/50">
                                <CalendarIcon className="h-10 w-10 mx-auto mb-2 text-[#A19F8D]/40" />
                                <p className="text-xs font-bold text-[#FAFAFA] mb-1">
                                    {t('no_tasks_on_date') || 'Tidak ada tugas pada tanggal ini'}
                                </p>
                                <p className="text-[11px] text-[#A19F8D] mb-4">
                                    {t('click_date_to_view') || 'Klik tombol di bawah atau seret mouse untuk menambah tugas baru.'}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => onAddWorkWithDate?.(selectedDateStr)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-105 shadow-md cursor-pointer bg-[#C9AA71] text-[#1C1B0E]"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    {t('add_work_on_date') || 'Tambah Tugas'}
                                </button>
                            </div>
                        ) : (
                            tasksForSelectedDate.map((item) => {
                                const isDone = item.status === 'done';
                                const displayImg = item.photoUrl || item.imageUrl || item.photo;
                                const itemDept = item.department || item.dept;
                                const itemTheme = getDepartmentTheme(itemDept);
                                const deptColor = itemTheme.bg === '#212121' ? '#FFFFFF' : itemTheme.bg;
                                const canManageTask = isAdmin || (userDept && normalizeDepartment(itemDept) === userDept);

                                const ranges = parseTaskRanges(item);
                                const isMultiRange = ranges.length > 1;

                                // Build timeline progress string
                                let progressLabel = '';
                                if (ranges.length === 1) {
                                    const sDate = parseDateStr(ranges[0].startDate);
                                    const eDate = parseDateStr(ranges[0].endDate);
                                    if (sDate && eDate) {
                                        const totalDays = Math.round(Math.abs(eDate - sDate) / (1000 * 60 * 60 * 24)) + 1;
                                        const currDay = Math.round((selectedDateObj - sDate) / (1000 * 60 * 60 * 24)) + 1;
                                        const boundedDay = Math.max(1, Math.min(totalDays, currDay));
                                        const tpl = t('day_progress');
                                        const label = (tpl && tpl.includes('{x}'))
                                            ? tpl.replace('{x}', boundedDay).replace('{y}', totalDays)
                                            : (lang === 'id' ? `Hari ke-${boundedDay} dari ${totalDays}` : `Day ${boundedDay} of ${totalDays}`);
                                        progressLabel = `${label} (${formatDateShort(ranges[0].startDate, lang)} – ${formatDateShort(ranges[0].endDate, lang)})`;
                                    } else if (sDate) {
                                        progressLabel = `${t('single_day_task') || 'Tugas 1 hari'} (${formatDateShort(ranges[0].startDate, lang)})`;
                                    }
                                } else if (ranges.length > 1) {
                                    const rangeLabels = ranges.map(r => `${formatDateShort(r.startDate, lang)}–${formatDateShort(r.endDate, lang)}`).join(', ');
                                    progressLabel = `${t('schedule_blocks') || 'Jadwal'}: ${rangeLabels}`;
                                }

                                const isHighlighted = highlightTaskId && String(highlightTaskId) === String(item.id);
                                const isSearchMatch = searchQuery && matchesTaskQuery(item, searchQuery);

                                return (
                                    <div
                                        key={item.id}
                                        id={`task-card-${item.id}`}
                                        className={`rounded-2xl border p-4 space-y-3 transition-all hover:scale-[1.01] shadow-lg group relative overflow-hidden ${
                                            isHighlighted 
                                                ? 'ring-2 ring-[#C9AA71] shadow-[0_0_24px_rgba(201,170,113,0.6)] scale-[1.02]' 
                                                : isSearchMatch 
                                                    ? 'ring-1 ring-[#C9AA71]/60 shadow-[0_0_12px_rgba(201,170,113,0.25)]' 
                                                    : ''
                                        }`}
                                        style={{
                                            backgroundColor: '#1C1B0E',
                                            borderColor: isHighlighted ? '#C9AA71' : `${itemTheme.bg}50`,
                                            borderLeftWidth: '5px',
                                            borderLeftColor: itemTheme.bg,
                                            background: `linear-gradient(135deg, ${itemTheme.bg}14 0%, #1C1B0E 60%)`
                                        }}
                                    >
                                        {/* Status & Department Badges */}
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {itemDept && (
                                                    <span
                                                        className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm"
                                                        style={{
                                                            backgroundColor: itemTheme.bg,
                                                            color: itemTheme.text
                                                        }}
                                                    >
                                                        {itemDept}
                                                    </span>
                                                )}
                                                <span className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-[#2A281E] text-[#FAFAFA] border border-white/10">
                                                    📋 {t('manual_badge') || 'TASK'}
                                                </span>
                                                {isMultiRange && (
                                                    <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold bg-[#C9AA71]/20 text-[#E3D1AA] border border-[#C9AA71]/40">
                                                        ✨ {ranges.length} {t('date_block') || 'Rentang'}
                                                    </span>
                                                )}
                                                <span
                                                    className={`px-2 py-0.5 rounded-lg text-[9px] font-bold flex items-center gap-1 ${
                                                        isDone
                                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                                    }`}
                                                >
                                                    {isDone ? (
                                                        <>
                                                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                                                            <span>{t('done_work') || 'Selesai'}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Clock className="h-2.5 w-2.5" />
                                                            <span>{t('status_active') || 'Aktif'}</span>
                                                        </>
                                                    )}
                                                </span>
                                            </div>

                                            {item.location && (
                                                <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: deptColor }}>
                                                    <MapPin className="h-3.5 w-3.5" style={{ color: itemTheme.bg }} />
                                                    {item.location}
                                                </span>
                                            )}
                                        </div>

                                        {/* Title & Description adapting to Department Color */}
                                        <div>
                                            <h4 
                                                className="text-sm sm:text-base font-extrabold text-[#FAFAFA] leading-snug transition-colors"
                                            >
                                                {item.title}
                                            </h4>
                                            {item.description && (
                                                <p className="text-xs text-[#A19F8D] mt-1 line-clamp-2 leading-relaxed">
                                                    {item.description}
                                                </p>
                                            )}
                                        </div>

                                        {/* Timeline Badge */}
                                        {progressLabel && (
                                            <div
                                                className="p-2.5 rounded-xl border text-[10px] font-bold flex items-center gap-2 shadow-inner"
                                                style={{
                                                    backgroundColor: `${itemTheme.bg}15`,
                                                    borderColor: `${itemTheme.bg}35`,
                                                    color: deptColor
                                                }}
                                            >
                                                <CalendarIcon className="h-3.5 w-3.5 shrink-0" style={{ color: itemTheme.bg }} />
                                                <span className="truncate">{progressLabel}</span>
                                            </div>
                                        )}

                                        {/* Photo & Actions Bar */}
                                        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#3B3929]/60">
                                            {displayImg ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onPreviewImage?.(displayImg, item.title, `${itemDept || ''} — ${item.location || ''}`)}
                                                    className="flex items-center gap-1 text-[10px] font-bold hover:underline cursor-pointer transition-colors"
                                                    style={{ color: deptColor }}
                                                >
                                                    <ZoomIn className="h-3 w-3" />
                                                    {t('photo') || 'Foto'}
                                                </button>
                                            ) : <div />}

                                            <div className="flex items-center gap-1.5">
                                                {canManageTask && !isDone && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onMarkDone?.(item)}
                                                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-950/70 text-emerald-300 hover:bg-emerald-900 border border-emerald-500/40 transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                                                    >
                                                        <CheckCheck className="h-3 w-3" />
                                                        {t('done_work') || 'Selesai'}
                                                    </button>
                                                )}
                                                {canManageTask && onEdit && !isDone && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onEdit?.(item)}
                                                        className="p-1.5 rounded-lg bg-[#2A281E] text-[#FAFAFA] hover:bg-[#3B3929] border border-[#3B3929] transition-colors cursor-pointer"
                                                        title={t('edit')}
                                                    >
                                                        <Edit2 className="h-3 w-3" style={{ color: deptColor }} />
                                                    </button>
                                                )}
                                                {canManageTask && !isDone && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onDelete?.(item)}
                                                        className="p-1.5 rounded-lg bg-red-950/40 text-red-300 hover:bg-red-900/60 border border-red-500/40 transition-colors cursor-pointer"
                                                        title={t('delete')}
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* ─── Floating Task Preview Popover on Hover ─── */}
            {hoveredTask && (
                <div 
                    className="fixed z-[9999] pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95"
                    style={{
                        left: Math.min(Math.max(16, hoveredTask.rect.left + hoveredTask.rect.width / 2 - 140), window.innerWidth - 296),
                        top: hoveredTask.rect.top < 220 
                            ? hoveredTask.rect.bottom + 8 
                            : hoveredTask.rect.top - 8,
                        transform: hoveredTask.rect.top < 220 ? 'none' : 'translateY(-100%)',
                        width: '280px',
                    }}
                >
                    <div 
                        className="p-3.5 rounded-2xl bg-[#2A281E] border border-[#3B3929] shadow-2xl backdrop-blur-2xl text-[#FAFAFA] space-y-2.5"
                        style={{
                            boxShadow: '0 20px 40px -5px rgba(0, 0, 0, 0.85), 0 0 20px rgba(201, 170, 113, 0.25)',
                            borderLeft: `4px solid ${getDepartmentTheme(hoveredTask.item.department || hoveredTask.item.dept).bg}`,
                        }}
                    >
                        {/* Top Row: Department Badge & Status Badge */}
                        <div className="flex items-center justify-between gap-2">
                            <span
                                className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shadow-xs"
                                style={{
                                    backgroundColor: getDepartmentTheme(hoveredTask.item.department || hoveredTask.item.dept).bg,
                                    color: getDepartmentTheme(hoveredTask.item.department || hoveredTask.item.dept).bg === '#212121' 
                                        ? '#FFFFFF' 
                                        : getDepartmentTheme(hoveredTask.item.department || hoveredTask.item.dept).text,
                                }}
                            >
                                {hoveredTask.item.department || hoveredTask.item.dept || 'General'}
                            </span>

                            <span
                                className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold flex items-center gap-1 shadow-2xs ${
                                    hoveredTask.item.status === 'done'
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                }`}
                            >
                                {hoveredTask.item.status === 'done' ? (
                                    <>
                                        <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                                        <span>{t('status_finished') || 'Selesai'}</span>
                                    </>
                                ) : (
                                    <>
                                        <Clock className="h-2.5 w-2.5 text-amber-400" />
                                        <span>{t('status_unfinished') || 'Belum Selesai'}</span>
                                    </>
                                )}
                            </span>
                        </div>

                        {/* Task Title */}
                        <div>
                            <h4 className="text-xs font-black text-[#FAFAFA] leading-snug">
                                {hoveredTask.item.title}
                            </h4>
                            {hoveredTask.item.description && (
                                <p className="text-[10px] text-[#A19F8D] mt-1 line-clamp-2 leading-relaxed">
                                    {hoveredTask.item.description}
                                </p>
                            )}
                        </div>

                        {/* Meta: Date & Location & Reporter */}
                        <div className="pt-2 border-t border-[#3B3929]/70 space-y-1 text-[10px]">
                            <div className="flex items-center gap-1.5 text-[#E3D1AA] font-bold">
                                <CalendarIcon className="h-3 w-3 text-[#C9AA71] shrink-0" />
                                <span>{getTaskPreviewDate(hoveredTask.item, lang) || formatDateShort(hoveredTask.dateStr, lang)}</span>
                            </div>

                            {hoveredTask.item.location && (
                                <div className="flex items-center gap-1.5 text-[#A19F8D] font-medium">
                                    <MapPin className="h-3 w-3 text-[#A19F8D] shrink-0" />
                                    <span className="truncate">{hoveredTask.item.location}</span>
                                </div>
                            )}

                            {hoveredTask.item.createdBy && (
                                <div className="flex items-center gap-1.5 text-[#A19F8D]/80 text-[9px]">
                                    <User className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">{hoveredTask.item.createdBy}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Floating More Tasks Preview Popover ─── */}
            {hoveredMore && (
                <div 
                    className="fixed z-[9999] pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95"
                    style={{
                        left: Math.min(Math.max(16, hoveredMore.rect.left + hoveredMore.rect.width / 2 - 120), window.innerWidth - 260),
                        top: hoveredMore.rect.top < 180 
                            ? hoveredMore.rect.bottom + 8 
                            : hoveredMore.rect.top - 8,
                        transform: hoveredMore.rect.top < 180 ? 'none' : 'translateY(-100%)',
                        width: '240px',
                    }}
                >
                    <div className="p-3 rounded-xl bg-[#2A281E] border border-[#3B3929] shadow-2xl backdrop-blur-2xl text-[#FAFAFA] space-y-1.5">
                        <p className="text-[10px] font-black uppercase text-[#C9AA71] tracking-wider mb-1">
                            {t('other_tasks') || 'Tugas Lainnya'} ({formatDateShort(hoveredMore.dateStr, lang)}):
                        </p>
                        {hoveredMore.tasks.map((tItem) => {
                            const tTheme = getDepartmentTheme(tItem.department || tItem.dept);
                            return (
                                <div key={tItem.id} className="text-[11px] flex items-center gap-1.5 truncate">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tTheme.bg }} />
                                    <span className="truncate font-bold text-[#FAFAFA]">{tItem.title}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
