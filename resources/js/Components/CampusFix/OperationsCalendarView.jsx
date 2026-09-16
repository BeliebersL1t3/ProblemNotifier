import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
    ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock,
    CheckCircle2, Plus, MapPin, ZoomIn, CheckCheck,
    Edit2, Trash2, Building2, Check, ChevronDown, Search, X,
    MousePointerClick, Sparkles, User, StickyNote, Layers, AlertTriangle,
    RotateCcw, Loader2
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

// ─── Extract Clean Notes (Strip multi-range JSON metadata) ───────────────────
export function getCleanTaskNotes(notes) {
    if (!notes || typeof notes !== 'string') return '';
    let clean = notes.replace(/\[SCHEDULE_RANGES:\s*\[.*?\]\s*\]/gis, '').trim();
    clean = clean.replace(/^\]+|\s*\]+$/g, '').trim();
    return clean;
}

// ─── Helper: Get all dates covered by a task ───────────────────────────────
export function getAllDatesInRange(startDateStr, endDateStr) {
    const dates = [];
    const s = parseDateStr(startDateStr);
    const e = parseDateStr(endDateStr || startDateStr);
    if (!s || !e) return dates;
    const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const end = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    while (cur <= end) {
        dates.push(toDateString(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}

export function getTaskAllDates(task) {
    if (!task) return [];
    const ranges = parseTaskRanges(task);
    const set = new Set();
    ranges.forEach(r => {
        if (r.startDate) {
            getAllDatesInRange(r.startDate, r.endDate || r.startDate).forEach(d => set.add(d));
        }
    });
    if (set.size === 0 && (task.startDate || task.endDate)) {
        getAllDatesInRange(task.startDate || task.endDate, task.endDate || task.startDate).forEach(d => set.add(d));
    }
    return Array.from(set);
}

export function hexToHsl(hex) {
    if (!hex || typeof hex !== 'string') return { h: 42, s: 50, l: 60 };
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    if (c.length !== 6) return { h: 42, s: 50, l: 60 };
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// Generates varying shades (brighter, deeper, lighter, etc.) of the EXACT SAME department hue
export function getBlockColorVariation(baseHex, blockIndex, totalBlocks = 1) {
    if (!baseHex || baseHex === '#212121') baseHex = '#C9AA71';
    if (totalBlocks <= 1) return baseHex;
    const { h, s, l } = hexToHsl(baseHex);
    // Distinct lightness/saturation variations for blocks:
    // Block 0: base
    // Block 1: lighter/brighter (+16%)
    // Block 2: deeper/richer (-14%)
    // Block 3: pastel/vibrant (+26%)
    // Block 4: intense dark tone (-22%)
    // Block 5: punchy cyan/sky tone (+34%)
    const lightnessOffsets = [0, 16, -14, 26, -22, 34, -28];
    const offset = lightnessOffsets[blockIndex % lightnessOffsets.length];
    const newL = Math.max(26, Math.min(84, l + offset));
    const newS = Math.max(45, Math.min(100, s + (blockIndex % 2 === 1 ? 8 : -4)));
    return `hsl(${h}, ${newS}%, ${newL}%)`;
}

export function getTaskDateBlockMap(task, baseDeptColor) {
    const map = {};
    if (!task) return map;
    const ranges = parseTaskRanges(task);
    if (ranges.length === 0 && (task.startDate || task.endDate)) {
        ranges.push({ startDate: task.startDate, endDate: task.endDate || task.startDate });
    }
    const totalBlocks = ranges.length;

    ranges.forEach((range, idx) => {
        const blockColor = getBlockColorVariation(baseDeptColor, idx, totalBlocks);
        getAllDatesInRange(range.startDate, range.endDate).forEach(dateStr => {
            map[dateStr] = {
                blockIndex: idx,
                blockNum: idx + 1,
                totalBlocks,
                range,
                blockColor,
            };
        });
    });
    return map;
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
    onRestoreTask,
    restoringTaskId = null,
    canSyncCalendar = false,
}) {
    const { isAdmin, isDeptUser, department: userDept } = useAuth();
    const todayStr = toDateString(new Date());
    const [currentMonth, setCurrentMonth] = useState(() => new Date());
    const [selectedDateStr, setSelectedDateStr] = useState(todayStr);
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'done'
    const [hoveredTask, setHoveredTask] = useState(null);
    const [hoveredMore, setHoveredMore] = useState(null);
    const [activeCardHighlightId, setActiveCardHighlightId] = useState(null);
    const [selectedBlockFilter, setSelectedBlockFilter] = useState(null); // null = all blocks, or block index number (0, 1, 2, ...)
    const [agendaViewMode, setAgendaViewMode] = useState('date'); // 'date' | 'all'
    const [allTasksRange, setAllTasksRange] = useState(1); // 1 | 3 | 6 | 'all'

    // Sync highlightTaskId if provided from outside (e.g. search)
    useEffect(() => {
        if (highlightTaskId) {
            setActiveCardHighlightId(highlightTaskId);
            setSelectedBlockFilter(null);
        }
    }, [highlightTaskId]);

    // Reset block filter when card highlight is cleared
    useEffect(() => {
        if (!activeCardHighlightId) {
            setSelectedBlockFilter(null);
        }
    }, [activeCardHighlightId]);

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

    // Compute all active dates for the highlighted task (after allTasks is declared)
    const activeHighlightedTask = useMemo(() => {
        if (!activeCardHighlightId) return null;
        return allTasks.find(t => String(t.id) === String(activeCardHighlightId)) || null;
    }, [activeCardHighlightId, allTasks]);

    const activeDeptTheme = useMemo(() => {
        if (!activeHighlightedTask) return null;
        const dept = activeHighlightedTask.department || activeHighlightedTask.dept;
        return getDepartmentTheme(dept);
    }, [activeHighlightedTask]);

    const activeDeptColor = activeDeptTheme 
        ? (activeDeptTheme.bg === '#212121' ? '#FFFFFF' : activeDeptTheme.bg) 
        : '#C9AA71';

    // Compute date-to-block map with varying department color shades for each block
    const activeTaskDateBlockMap = useMemo(() => {
        if (!activeHighlightedTask) return {};
        return getTaskDateBlockMap(activeHighlightedTask, activeDeptColor);
    }, [activeHighlightedTask, activeDeptColor]);

    // Compute active dates for the highlighted task (or specific selected block)
    const activeTaskDates = useMemo(() => {
        if (!activeHighlightedTask) return [];
        if (selectedBlockFilter !== null) {
            const ranges = parseTaskRanges(activeHighlightedTask);
            const targetRange = ranges[selectedBlockFilter];
            if (targetRange) {
                return getAllDatesInRange(targetRange.startDate, targetRange.endDate || targetRange.startDate);
            }
        }
        return getTaskAllDates(activeHighlightedTask);
    }, [activeHighlightedTask, selectedBlockFilter]);

    // Card click toggles highlighting of all dates belonging to that task on the calendar grid
    // Card click toggles highlighting of the task, focusing on the current date's block if active
    const handleTaskCardClick = (item, e) => {
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) {
            return;
        }

        if (String(activeCardHighlightId) === String(item.id)) {
            setActiveCardHighlightId(null);
            setSelectedBlockFilter(null);
            onClearHighlight?.();
        } else {
            setActiveCardHighlightId(item.id);
            
            // Check if this task is active on the currently selected date (selectedDateStr)
            const ranges = parseTaskRanges(item);
            const activeBlockIdx = ranges.findIndex(r => 
                selectedDateStr && r.startDate && (selectedDateStr >= r.startDate && selectedDateStr <= (r.endDate || r.startDate))
            );

            if (activeBlockIdx !== -1) {
                // Immediately isolate the specific block that matches the date in the day agenda!
                setSelectedBlockFilter(activeBlockIdx);
                const sDate = parseDateStr(selectedDateStr);
                if (sDate && (sDate.getFullYear() !== year || sDate.getMonth() !== month)) {
                    setCurrentMonth(new Date(sDate.getFullYear(), sDate.getMonth(), 1));
                }
            } else {
                setSelectedBlockFilter(null);
                const taskDates = getTaskAllDates(item);
                if (taskDates.length > 0) {
                    const firstDate = parseDateStr(taskDates[0]);
                    if (firstDate && (firstDate.getFullYear() !== year || firstDate.getMonth() !== month)) {
                        setCurrentMonth(new Date(firstDate.getFullYear(), firstDate.getMonth(), 1));
                    }
                }
            }
        }
    };

    // Clicking a specific block chip in the schedule breakdown
    const handleBlockClick = (bIdx, range, item, e) => {
        e.stopPropagation();
        setActiveCardHighlightId(item.id);

        if (selectedBlockFilter === bIdx) {
            // Toggle off back to all blocks
            setSelectedBlockFilter(null);
        } else {
            setSelectedBlockFilter(bIdx);
            if (range.startDate) {
                setSelectedDateStr(range.startDate);
                const sDate = parseDateStr(range.startDate);
                if (sDate) {
                    setCurrentMonth(new Date(sDate.getFullYear(), sDate.getMonth(), 1));
                }
            }
        }
    };

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
            setAgendaViewMode('date');
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

        // When a task is focused, only show that specific task (or specific block) in the month calendar grid
        const filterVisibleTasks = (tasksList, dateStr) => {
            if (!activeCardHighlightId) return tasksList;
            if (selectedBlockFilter !== null) {
                const blockInfo = activeTaskDateBlockMap[dateStr];
                if (!blockInfo || blockInfo.blockIndex !== selectedBlockFilter) {
                    return [];
                }
            }
            return tasksList.filter(item => String(item.id) === String(activeCardHighlightId));
        };

        // Previous month padding
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const dayNum = prevMonthLastDay - i;
            const d = new Date(year, month - 1, dayNum);
            const dateStr = toDateString(d);
            const rawTasks = allTasks.filter(item => isTaskActiveOnDate(item, dateStr));
            const tasksForDay = filterVisibleTasks(rawTasks, dateStr);
            days.push({
                key: `prev-${dayNum}`,
                dayNum,
                dateStr,
                isCurrentMonth: false,
                isToday: dateStr === todayStr,
                tasks: tasksForDay,
            });
        }

        // Current month days
        for (let d = 1; d <= totalDaysInMonth; d++) {
            const dateObj = new Date(year, month, d);
            const dateStr = toDateString(dateObj);
            const rawTasks = allTasks.filter(item => isTaskActiveOnDate(item, dateStr));
            const tasksForDay = filterVisibleTasks(rawTasks, dateStr);
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
            const rawTasks = allTasks.filter(item => isTaskActiveOnDate(item, dateStr));
            const tasksForDay = filterVisibleTasks(rawTasks, dateStr);
            days.push({
                key: `next-${d}`,
                dayNum: d,
                dateStr,
                isCurrentMonth: false,
                isToday: dateStr === todayStr,
                tasks: tasksForDay,
            });
        }

        return days;
    }, [year, month, startDayOfWeek, totalDaysInMonth, todayStr, allTasks, searchQuery, activeCardHighlightId, selectedBlockFilter, activeTaskDateBlockMap]);

    // Compute date range info for "All Tasks" mode (1, 3, 6 months forward or all)
    const allTasksRangeInfo = useMemo(() => {
        if (allTasksRange === 'all') {
            return {
                startStr: null,
                endStr: null,
                title: lang === 'id' ? 'Semua Tugas (Seluruh Waktu)' : 'All Tasks (All Time)',
                subtitle: lang === 'id' ? 'Semua tugas tanpa batasan tanggal' : 'All scheduled tasks without date limit'
            };
        }
        const numMonths = Number(allTasksRange) || 1;
        const sDate = new Date(year, month, 1);
        const eDate = new Date(year, month + numMonths, 0);
        const startStr = toDateString(sDate);
        const endStr = toDateString(eDate);

        const sTitle = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { month: 'short', year: 'numeric' }).format(sDate);
        const eTitle = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { month: 'short', year: 'numeric' }).format(eDate);

        let title = sTitle;
        if (numMonths > 1) {
            title = `${sTitle} – ${eTitle}`;
        }

        return {
            startStr,
            endStr,
            title,
            numMonths,
            subtitle: lang === 'id' 
                ? `Tugas dalam ${numMonths} bulan (${title})` 
                : `Tasks within ${numMonths} months (${title})`
        };
    }, [year, month, allTasksRange, lang]);

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

    // Displayed tasks in inspector panel (either single date or all tasks within month range)
    const displayedAgendaTasks = useMemo(() => {
        let list = [];
        if (agendaViewMode === 'date') {
            list = tasksForSelectedDate;
        } else {
            // 'all' mode
            if (allTasksRange === 'all') {
                list = allTasks;
            } else {
                const { startStr, endStr } = allTasksRangeInfo;
                list = allTasks.filter(item => {
                    const dates = getTaskAllDates(item);
                    if (dates.length === 0) return true;
                    return dates.some(d => d >= startStr && d <= endStr);
                });
            }
        }

        if (!searchQuery) return list;
        return [...list].sort((a, b) => {
            const aMatch = matchesTaskQuery(a, searchQuery);
            const bMatch = matchesTaskQuery(b, searchQuery);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0;
        });
    }, [agendaViewMode, tasksForSelectedDate, allTasks, allTasksRange, allTasksRangeInfo, searchQuery]);

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
                    {/* Active Task Focus Banner */}
                    {activeHighlightedTask && (
                        <div 
                            className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border mb-3 text-xs font-bold shadow-lg animate-in fade-in"
                            style={{
                                backgroundColor: `${activeDeptColor}18`,
                                borderColor: `${activeDeptColor}60`,
                                color: activeDeptColor === '#212121' ? '#FFFFFF' : activeDeptColor
                            }}
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <Sparkles className="h-4 w-4 shrink-0" style={{ color: activeDeptColor }} />
                                <span className="truncate">
                                    {t('focusing_on_task') || 'Fokus Pada Tugas'}: <strong className="text-[#FAFAFA]">[{activeHighlightedTask.department || activeHighlightedTask.dept}] {activeHighlightedTask.title}</strong>
                                    {selectedBlockFilter !== null && (
                                        <span 
                                            className="ml-2 px-2 py-0.5 rounded text-[10px] font-black uppercase text-[#1C1B0E]"
                                            style={{ backgroundColor: activeTaskDateBlockMap[activeTaskDates[0]]?.blockColor || activeDeptColor }}
                                        >
                                            {t('date_block') || 'Blok'} #{selectedBlockFilter + 1}
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {selectedBlockFilter !== null && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedBlockFilter(null)}
                                        className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg border hover:bg-white/10 transition-all cursor-pointer flex items-center gap-1 text-[#FAFAFA]"
                                        style={{ borderColor: `${activeDeptColor}50` }}
                                    >
                                        <span>{t('all_blocks') || 'Semua Blok'}</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveCardHighlightId(null);
                                        setSelectedBlockFilter(null);
                                        onClearHighlight?.();
                                    }}
                                    className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg border hover:bg-white/10 transition-all cursor-pointer shrink-0 flex items-center gap-1 text-[#FAFAFA]"
                                    style={{ borderColor: `${activeDeptColor}60` }}
                                >
                                    <X className="h-3 w-3" />
                                    <span>{t('show_all_tasks') || 'Tampilkan Semua Tugas'}</span>
                                </button>
                            </div>
                        </div>
                    )}

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

                            // Check if cell is within active drag range or task highlight
                            const isInDragRange = dragRange && cell.dateStr >= dragRange.start && cell.dateStr <= dragRange.end;
                            const isTaskDateHighlighted = activeTaskDates.length > 0 && activeTaskDates.includes(cell.dateStr);
                            const isSearchDateHighlighted = (highlightedDates && highlightedDates.includes(cell.dateStr)) || isTaskDateHighlighted;

                            const cellBlockInfo = activeTaskDateBlockMap[cell.dateStr];
                            const cellDeptColor = cellBlockInfo?.blockColor || activeDeptColor;
                            const cellBlockNum = cellBlockInfo?.blockNum;

                            let borderClass = 'border-[#3B3929]/70';
                            let bgClass = cell.isCurrentMonth ? 'bg-[#1C1B0E]/80 hover:bg-[#353326]/60' : 'bg-[#14140B]/40 opacity-40';
                            let cellHighlightStyle = {};

                            if (isInDragRange) {
                                borderClass = 'border-[#C9AA71] ring-2 ring-[#C9AA71]/70 shadow-xl';
                                bgClass = 'bg-[#C9AA71]/25 scale-[1.02]';
                            } else if (isTaskDateHighlighted && activeDeptTheme) {
                                borderClass = 'ring-2 shadow-2xl';
                                bgClass = cell.isCurrentMonth ? 'scale-[1.03] z-10' : 'opacity-85';
                                cellHighlightStyle = {
                                    borderColor: cellDeptColor,
                                    outline: `2px solid ${cellDeptColor}`,
                                    boxShadow: `0 0 24px ${cellDeptColor}60, inset 0 0 12px ${cellDeptColor}20`,
                                    backgroundColor: cell.isCurrentMonth ? `${cellDeptColor}2c` : `${cellDeptColor}18`,
                                };
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
                                            setAgendaViewMode('date');
                                            if (!cell.isCurrentMonth) {
                                                const cellDate = parseDateStr(cell.dateStr);
                                                if (cellDate && (cellDate.getFullYear() !== year || cellDate.getMonth() !== month)) {
                                                    setCurrentMonth(new Date(cellDate.getFullYear(), cellDate.getMonth(), 1));
                                                }
                                            }
                                            onClearHighlight?.();
                                        }
                                    }}
                                    onMouseDown={(e) => handleCellMouseDown(cell.dateStr, e)}
                                    onMouseEnter={() => handleCellMouseEnter(cell.dateStr)}
                                    onMouseUp={() => handleCellMouseUp(cell.dateStr)}
                                    style={cellHighlightStyle}
                                    className={`min-h-[85px] sm:min-h-[105px] p-1.5 sm:p-2 rounded-xl border flex flex-col justify-between transition-all cursor-pointer group ${bgClass} ${borderClass}`}
                                >
                                    {/* Top Row: Date Number & Department Badge Indicator */}
                                    <div className="flex items-center justify-between mb-1 pointer-events-none">
                                        <div className="flex items-center gap-1">
                                            <span
                                                className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-lg transition-colors ${
                                                    cell.isToday
                                                        ? 'bg-[#C9AA71] text-[#1C1B0E] font-black shadow-sm'
                                                        : isTaskDateHighlighted
                                                            ? 'font-black'
                                                            : isSearchDateHighlighted || isSelected || isInDragRange
                                                                ? 'text-[#E3D1AA] font-black'
                                                                : cell.isCurrentMonth
                                                                    ? 'text-[#FAFAFA] group-hover:text-[#C9AA71]'
                                                                    : 'text-[#A19F8D]/60'
                                                }`}
                                                style={isTaskDateHighlighted ? {
                                                    backgroundColor: `${cellDeptColor}35`,
                                                    color: cellDeptColor === '#212121' ? '#FFFFFF' : cellDeptColor,
                                                    border: `1px solid ${cellDeptColor}80`
                                                } : {}}
                                            >
                                                {cell.dayNum}
                                            </span>
                                            {isTaskDateHighlighted ? (
                                                <div className="flex items-center gap-1">
                                                    {cellBlockInfo?.totalBlocks > 1 && (
                                                        <span 
                                                            className="px-1.5 py-0.2 rounded text-[9px] font-black shadow-xs tracking-wider font-mono text-[#1C1B0E]"
                                                            style={{ backgroundColor: cellDeptColor }}
                                                            title={`Rentang / Blok #${cellBlockNum}`}
                                                        >
                                                            #{cellBlockNum}
                                                        </span>
                                                    )}
                                                    <span 
                                                        className="text-[10px] shrink-0 font-black animate-pulse" 
                                                        style={{ color: cellDeptColor }}
                                                        title={t('task_date_selected') || 'Tanggal tugas terpilih'}
                                                    >
                                                        ✨
                                                    </span>
                                                </div>
                                            ) : isSearchDateHighlighted ? (
                                                <span className="text-[10px] shrink-0 animate-pulse">
                                                    📍
                                                </span>
                                            ) : null}
                                        </div>

                                        {!activeCardHighlightId && taskCount > 0 && (
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
                                            const isDeletedGCal = item.status === 'deleted_from_calendar';
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
                                                        setAgendaViewMode('date');
                                                        if (!cell.isCurrentMonth) {
                                                            const cellDate = parseDateStr(cell.dateStr);
                                                            if (cellDate && (cellDate.getFullYear() !== year || cellDate.getMonth() !== month)) {
                                                                setCurrentMonth(new Date(cellDate.getFullYear(), cellDate.getMonth(), 1));
                                                            }
                                                        }
                                                        setActiveCardHighlightId(item.id);
                                                        const ranges = parseTaskRanges(item);
                                                        const activeBlockIdx = ranges.findIndex(r => 
                                                            cell.dateStr >= r.startDate && cell.dateStr <= (r.endDate || r.startDate)
                                                        );
                                                        if (activeBlockIdx !== -1) {
                                                            setSelectedBlockFilter(activeBlockIdx);
                                                        } else {
                                                            setSelectedBlockFilter(null);
                                                        }
                                                        const el = document.getElementById(`task-card-${item.id}`);
                                                        if (el) {
                                                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                        }
                                                    }}
                                                    className={`truncate px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all shadow-xs cursor-pointer hover:scale-[1.02] hover:brightness-125 ${isDeletedGCal ? 'opacity-70 border-dashed border-red-500/80 bg-red-950/30' : ''}`}
                                                    style={{
                                                        backgroundColor: isDeletedGCal ? 'rgba(239, 68, 68, 0.15)' : (cellBlockInfo ? `${cellDeptColor}30` : `${itemTheme.bg}25`),
                                                        color: isDeletedGCal ? '#FCA5A5' : (cellBlockInfo ? '#FFFFFF' : deptColor),
                                                        borderLeft: `3px ${isDeletedGCal ? 'dashed' : 'solid'} ${isDeletedGCal ? '#EF4444' : (cellDeptColor || itemTheme.bg)}`,
                                                        borderTop: `1px ${isDeletedGCal ? 'dashed' : 'solid'} ${isDeletedGCal ? '#EF4444' : (cellDeptColor || itemTheme.bg)}35`,
                                                        borderRight: `1px ${isDeletedGCal ? 'dashed' : 'solid'} ${isDeletedGCal ? '#EF4444' : (cellDeptColor || itemTheme.bg)}35`,
                                                        borderBottom: `1px ${isDeletedGCal ? 'dashed' : 'solid'} ${isDeletedGCal ? '#EF4444' : (cellDeptColor || itemTheme.bg)}35`,
                                                    }}
                                                >
                                                    {isDeletedGCal ? (
                                                        <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-red-400" />
                                                    ) : isDone ? (
                                                        <CheckCircle2 className="h-2.5 w-2.5 shrink-0" style={{ color: cellDeptColor || deptColor }} />
                                                    ) : (
                                                        <Clock className="h-2.5 w-2.5 shrink-0 opacity-80" style={{ color: cellDeptColor || deptColor }} />
                                                    )}
                                                    {cellBlockInfo?.totalBlocks > 1 && (
                                                        <span className="font-mono text-[9px] font-black opacity-90">#{cellBlockNum}</span>
                                                    )}
                                                    {isDeletedGCal && (
                                                        <span className="font-mono text-[8px] font-bold px-1 rounded bg-red-950/80 text-red-300 border border-red-800/80">
                                                            Dihapus G-Cal
                                                        </span>
                                                    )}
                                                    {item.location && (
                                                        <span className="font-mono text-[8px] font-bold opacity-90 shrink-0 px-1 rounded bg-black/40 text-[#FAFAFA] border border-white/10">
                                                            {item.location}
                                                        </span>
                                                    )}
                                                    <span className={`truncate ${isDeletedGCal ? 'line-through opacity-75' : ''}`}>{item.title}</span>
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

                {/* ─── Day Agenda / All Tasks Inspector (4 Cols on Desktop) ─── */}
                <div id="day-agenda-inspector" className="lg:col-span-4 bg-[#2A281E]/95 border border-[#3B3929] rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-xl flex flex-col h-full">
                    {/* Mode Switcher: Date vs All Tasks */}
                    <div className="flex items-center gap-1 p-1 bg-[#14140B] rounded-xl border border-[#3B3929] mb-3">
                        <button
                            type="button"
                            onClick={() => setAgendaViewMode('date')}
                            className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                agendaViewMode === 'date'
                                    ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-md font-black'
                                    : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                            }`}
                        >
                            <Clock className="h-3.5 w-3.5" />
                            <span className="truncate">{t('view_by_date') || (lang === 'id' ? 'Tanggal' : 'Date')} ({formatDateShort(selectedDateStr, lang)})</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setAgendaViewMode('all')}
                            className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                agendaViewMode === 'all'
                                    ? 'bg-[#C9AA71] text-[#1C1B0E] shadow-md font-black'
                                    : 'text-[#A19F8D] hover:text-[#FAFAFA]'
                            }`}
                        >
                            <Layers className="h-3.5 w-3.5" />
                            <span>{t('all_tasks_scope') || (lang === 'id' ? 'Semua Tugas' : 'All Tasks')}</span>
                        </button>
                    </div>

                    {/* Range Filter Buttons if in 'all' mode: 1, 3, 6 forward or all */}
                    {agendaViewMode === 'all' && (
                        <div className="flex items-center gap-1.5 mb-3.5 overflow-x-auto pb-0.5">
                            {[
                                { id: 1, label: `1 ${t('month_label') || (lang === 'id' ? 'Bulan' : 'Month')}` },
                                { id: 3, label: `3 ${t('months_label') || (lang === 'id' ? 'Bulan' : 'Months')}` },
                                { id: 6, label: `6 ${t('months_label') || (lang === 'id' ? 'Bulan' : 'Months')}` },
                                { id: 'all', label: t('all_time') || (lang === 'id' ? 'Semua' : 'All') },
                            ].map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => setAllTasksRange(r.id)}
                                    className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                                        allTasksRange === r.id
                                            ? 'bg-[#C9AA71]/25 border-[#C9AA71] text-[#E3D1AA] font-black shadow-sm'
                                            : 'bg-[#1C1B0E]/70 border-[#3B3929] text-[#A19F8D] hover:text-[#FAFAFA]'
                                    }`}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Header */}
                    <div className="pb-3.5 mb-3.5 border-b border-[#3B3929] flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#C9AA71] flex items-center gap-1 mb-1">
                                {agendaViewMode === 'date' ? (
                                    <>
                                        <Clock className="h-3.5 w-3.5" />
                                        <span>{t('selected_day_agenda') || 'Agenda Harian'}</span>
                                    </>
                                ) : (
                                    <>
                                        <Layers className="h-3.5 w-3.5" />
                                        <span>
                                            {t('all_tasks_scope') || 'Semua Tugas'} • {allTasksRange === 'all' ? (t('all_time') || (lang === 'id' ? 'Semua' : 'All')) : `${allTasksRange} ${t('months_label') || (lang === 'id' ? 'Bulan' : 'Months')}`}
                                        </span>
                                    </>
                                )}
                            </span>
                            <h3 className="text-base sm:text-lg font-extrabold text-[#FAFAFA] leading-snug truncate">
                                {agendaViewMode === 'date'
                                    ? formatDateFull(selectedDateObj, lang)
                                    : allTasksRangeInfo.title}
                            </h3>
                            {agendaViewMode === 'all' && (
                                <p className="text-[11px] text-[#A19F8D] mt-0.5">
                                    {allTasksRangeInfo.subtitle}
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                            <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-[#1C1B0E] border border-[#3B3929] text-[#E3D1AA]">
                                {displayedAgendaTasks.length} {displayedAgendaTasks.length === 1 ? (t('task_unit_singular') || (lang === 'id' ? 'Tugas' : 'Task')) : (t('task_unit') || (lang === 'id' ? 'Tugas' : 'Tasks'))}
                            </span>
                            {agendaViewMode === 'all' && (
                                <button
                                    type="button"
                                    onClick={() => setAgendaViewMode('date')}
                                    className="p-1 rounded-lg hover:bg-white/10 text-[#A19F8D] hover:text-[#FAFAFA] transition-colors cursor-pointer"
                                    title={t('back_to_date') || 'Kembali ke Tanggal'}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Task List on Selected Date or Range */}
                    <div className="space-y-3.5 flex-1 overflow-y-auto max-h-[560px] pr-1 custom-scrollbar">
                        {displayedAgendaTasks.length === 0 ? (
                            <div className="text-center py-12 px-4 rounded-xl border border-dashed border-[#3B3929] bg-[#1C1B0E]/50">
                                <CalendarIcon className="h-10 w-10 mx-auto mb-2 text-[#A19F8D]/40" />
                                <p className="text-xs font-bold text-[#FAFAFA] mb-1">
                                    {agendaViewMode === 'date' 
                                        ? (t('no_tasks_on_date') || 'Tidak ada tugas pada tanggal ini')
                                        : (t('no_tasks_found') || 'Tidak ada tugas ditemukan dalam rentang ini')}
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
                            displayedAgendaTasks.map((item) => {
                                const isDone = item.status === 'done';
                                const displayImg = item.photoUrl || item.imageUrl || item.photo;
                                const itemDept = item.department || item.dept;
                                const itemTheme = getDepartmentTheme(itemDept);
                                const deptColor = itemTheme.bg === '#212121' ? '#FFFFFF' : itemTheme.bg;
                                const canManageTask = isAdmin || (userDept && normalizeDepartment(itemDept) === userDept);

                                const ranges = parseTaskRanges(item);
                                const isMultiRange = ranges.length > 1;
                                const cleanNotes = getCleanTaskNotes(item.notes);

                                // Build timeline progress string
                                let progressLabel = '';
                                if (ranges.length === 1) {
                                    const sDate = parseDateStr(ranges[0].startDate);
                                    const eDate = parseDateStr(ranges[0].endDate);
                                    if (sDate && eDate) {
                                        const totalDays = Math.round(Math.abs(eDate - sDate) / (1000 * 60 * 60 * 24)) + 1;
                                        if (agendaViewMode === 'date') {
                                            const currDay = Math.round((selectedDateObj - sDate) / (1000 * 60 * 60 * 24)) + 1;
                                            const boundedDay = Math.max(1, Math.min(totalDays, currDay));
                                            const tpl = t('day_progress');
                                            const label = (tpl && tpl.includes('{x}'))
                                                ? tpl.replace('{x}', boundedDay).replace('{y}', totalDays)
                                                : (lang === 'id' ? `Hari ke-${boundedDay} dari ${totalDays}` : `Day ${boundedDay} of ${totalDays}`);
                                            progressLabel = `${label} (${formatDateShort(ranges[0].startDate, lang)} – ${formatDateShort(ranges[0].endDate, lang)})`;
                                        } else {
                                            progressLabel = `${totalDays} ${lang === 'id' ? 'hari' : 'days'} (${formatDateShort(ranges[0].startDate, lang)} – ${formatDateShort(ranges[0].endDate, lang)})`;
                                        }
                                    } else if (sDate) {
                                        progressLabel = `${t('single_day_task') || 'Tugas 1 hari'} (${formatDateShort(ranges[0].startDate, lang)})`;
                                    }
                                } else if (ranges.length > 1) {
                                    const rangeLabels = ranges.map(r => `${formatDateShort(r.startDate, lang)}–${formatDateShort(r.endDate, lang)}`).join(', ');
                                    progressLabel = `${t('schedule_blocks') || 'Jadwal'}: ${rangeLabels}`;
                                }

                                const isCardSelected = String(activeCardHighlightId) === String(item.id);
                                const isHighlighted = isCardSelected || (highlightTaskId && String(highlightTaskId) === String(item.id));
                                const isSearchMatch = searchQuery && matchesTaskQuery(item, searchQuery);

                                return (
                                    <div
                                        key={item.id}
                                        id={`task-card-${item.id}`}
                                        onClick={(e) => handleTaskCardClick(item, e)}
                                        className={`rounded-2xl border p-4 space-y-3 transition-all hover:scale-[1.01] shadow-lg group relative overflow-hidden cursor-pointer ${
                                            isHighlighted 
                                                ? 'ring-2 scale-[1.02]' 
                                                : isSearchMatch 
                                                    ? 'ring-1 ring-[#C9AA71]/60 shadow-[0_0_12px_rgba(201,170,113,0.25)]' 
                                                    : 'hover:border-[#C9AA71]/60'
                                        }`}
                                        style={{
                                            backgroundColor: '#1C1B0E',
                                            borderColor: isHighlighted ? deptColor : `${itemTheme.bg}50`,
                                            borderLeftWidth: '5px',
                                            borderLeftColor: itemTheme.bg,
                                            boxShadow: isHighlighted ? `0 0 24px ${itemTheme.bg}55` : undefined,
                                            background: isHighlighted 
                                                ? `linear-gradient(135deg, ${itemTheme.bg}22 0%, #1C1B0E 70%)`
                                                : `linear-gradient(135deg, ${itemTheme.bg}14 0%, #1C1B0E 60%)`
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
                                                {item.status === 'deleted_from_calendar' ? (
                                                    <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold flex items-center gap-1 bg-red-950/80 text-red-300 border border-red-700">
                                                        <AlertTriangle className="h-2.5 w-2.5 text-red-400" />
                                                        <span>{lang === 'id' ? 'Dihapus di Google Calendar' : 'Deleted in Google Calendar'}</span>
                                                    </span>
                                                ) : (
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
                                                )}
                                                {isCardSelected && (
                                                    <span 
                                                        className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm animate-pulse"
                                                        style={{
                                                            backgroundColor: itemTheme.bg,
                                                            color: itemTheme.text
                                                        }}
                                                    >
                                                        <Sparkles className="h-2.5 w-2.5" />
                                                        <span>{t('task_focused_grid') || 'Disorot di Kalender'}</span>
                                                    </span>
                                                )}
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

                                        {/* Schedule & Date Blocks (Full details without truncating) */}
                                        {ranges.length > 1 ? (
                                            <div
                                                className="p-3 rounded-xl border text-xs font-semibold space-y-2 shadow-inner"
                                                style={{
                                                    backgroundColor: `${itemTheme.bg}12`,
                                                    borderColor: `${itemTheme.bg}35`,
                                                    color: deptColor
                                                }}
                                            >
                                                <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider pb-1.5 border-b" style={{ borderColor: `${itemTheme.bg}25` }}>
                                                    <span className="flex items-center gap-1.5">
                                                        <CalendarIcon className="h-3.5 w-3.5" style={{ color: itemTheme.bg }} />
                                                        <span>{t('schedule_blocks') || 'Jadwal & Rentang Tanggal'} ({ranges.length} {t('blocks') || 'Rentang'})</span>
                                                    </span>
                                                    {isCardSelected && selectedBlockFilter !== null ? (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedBlockFilter(null);
                                                            }}
                                                            className="text-[9px] font-black px-2 py-0.5 rounded border border-white/20 hover:bg-white/10 text-[#C9AA71] transition-colors cursor-pointer flex items-center gap-1"
                                                        >
                                                            <X className="h-2.5 w-2.5" />
                                                            <span>{t('all_blocks') || 'Semua Blok'}</span>
                                                        </button>
                                                    ) : (
                                                        <span className="text-[9px] font-normal text-[#A19F8D]">
                                                            {t('click_block_to_filter') || 'Klik blok untuk filter tanggal'}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                                    {ranges.map((r, bIdx) => {
                                                        const sDate = parseDateStr(r.startDate);
                                                        const eDate = parseDateStr(r.endDate);
                                                        const days = (sDate && eDate) 
                                                            ? Math.round(Math.abs(eDate - sDate) / (1000 * 60 * 60 * 24)) + 1 
                                                            : 1;
                                                        const isBlockFiltered = isCardSelected && selectedBlockFilter === bIdx;
                                                        const isBlockCurrentDate = selectedDateStr && r.startDate && r.endDate && 
                                                            (selectedDateStr >= r.startDate && selectedDateStr <= r.endDate);
                                                        const blockColor = getBlockColorVariation(deptColor, bIdx, ranges.length);

                                                        return (
                                                            <button
                                                                key={bIdx}
                                                                type="button"
                                                                onClick={(e) => handleBlockClick(bIdx, r, item, e)}
                                                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95 text-left ${
                                                                    isBlockFiltered
                                                                        ? 'ring-2 shadow-lg font-black'
                                                                        : isBlockCurrentDate
                                                                            ? 'ring-1 shadow-sm font-black'
                                                                            : 'hover:border-white/30 text-[#FAFAFA]'
                                                                }`}
                                                                style={{
                                                                    backgroundColor: isBlockFiltered 
                                                                        ? `${blockColor}40`
                                                                        : isBlockCurrentDate
                                                                            ? `${blockColor}25`
                                                                            : '#1C1B0E',
                                                                    borderColor: isBlockFiltered || isBlockCurrentDate ? blockColor : `${blockColor}50`,
                                                                    color: '#FFFFFF',
                                                                    boxShadow: isBlockFiltered ? `0 0 14px ${blockColor}55` : undefined,
                                                                }}
                                                            >
                                                                <span 
                                                                    className="text-[9px] px-1.5 py-0.2 rounded font-black font-mono shadow-xs"
                                                                    style={{
                                                                        backgroundColor: blockColor,
                                                                        color: '#1C1B0E'
                                                                    }}
                                                                >
                                                                    #{bIdx + 1}
                                                                </span>
                                                                <span>{formatDateShort(r.startDate, lang)} – {formatDateShort(r.endDate || r.startDate, lang)}</span>
                                                                <span className="text-[10px] opacity-75 font-normal">({days} {lang === 'id' ? 'hari' : 'd'})</span>
                                                                {isBlockFiltered ? (
                                                                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-300 border border-emerald-500/50">
                                                                        ✓
                                                                    </span>
                                                                ) : isBlockCurrentDate ? (
                                                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title={t('current_selected_date') || 'Tanggal saat ini'} />
                                                                ) : null}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : (ranges.length === 1 && progressLabel) ? (
                                            <div
                                                className="p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 shadow-inner"
                                                style={{
                                                    backgroundColor: `${itemTheme.bg}15`,
                                                    borderColor: `${itemTheme.bg}35`,
                                                    color: deptColor
                                                }}
                                            >
                                                <CalendarIcon className="h-3.5 w-3.5 shrink-0" style={{ color: itemTheme.bg }} />
                                                <span className="leading-relaxed">{progressLabel}</span>
                                            </div>
                                        ) : null}

                                        {/* Notes / Catatan Tambahan */}
                                        {cleanNotes && (
                                            <div className="p-2.5 rounded-xl border border-[#3B3929] bg-[#14130A]/70 text-xs text-[#E3D1AA] flex items-start gap-2 shadow-inner">
                                                <StickyNote className="h-3.5 w-3.5 text-[#C9AA71] shrink-0 mt-0.5" />
                                                <div className="min-w-0 flex-1 space-y-0.5">
                                                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#A19F8D] block">
                                                        {t('notes') || 'Catatan'}:
                                                    </span>
                                                    <p className="text-xs text-[#E3D1AA] leading-relaxed whitespace-pre-wrap">
                                                        {cleanNotes}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Deleted in Google Calendar Warning Banner */}
                                        {item.status === 'deleted_from_calendar' && (
                                            <div className="p-2.5 rounded-xl border border-red-500/50 bg-red-950/40 text-xs text-red-200 flex items-start gap-2 shadow-inner">
                                                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-bold text-red-300 block">
                                                        {lang === 'id' ? 'Jadwal Dihapus di Google Calendar' : 'Deleted from Google Calendar'}
                                                    </span>
                                                    <span className="text-[11px] text-red-300/80 block mt-0.5">
                                                        {lang === 'id' 
                                                            ? 'Data ini disembunyikan secara default. Anda dapat memulihkannya kembali ke Google Calendar.'
                                                            : 'This task is hidden by default. You can restore it back to Google Calendar.'}
                                                    </span>
                                                </div>
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
                                                {/* Restore Deleted G-Cal Task Button */}
                                                {item.status === 'deleted_from_calendar' && canSyncCalendar && onRestoreTask && (
                                                    <button
                                                        type="button"
                                                        disabled={restoringTaskId === item.id}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (window.confirm(lang === 'id' ? `Pulihkan tugas "${item.title}" kembali ke Google Calendar?` : `Restore "${item.title}" to Google Calendar?`)) {
                                                                onRestoreTask(item);
                                                            }
                                                        }}
                                                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-950/70 text-amber-300 hover:bg-amber-900 border border-amber-500/50 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                                                    >
                                                        {restoringTaskId === item.id ? (
                                                            <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                                                        ) : (
                                                            <RotateCcw className="h-3 w-3 text-amber-400" />
                                                        )}
                                                        <span>{restoringTaskId === item.id ? (lang === 'id' ? 'Memulihkan...' : 'Restoring...') : (lang === 'id' ? 'Pulihkan ke G-Cal' : 'Restore to G-Cal')}</span>
                                                    </button>
                                                )}

                                                {canManageTask && !isDone && item.status !== 'deleted_from_calendar' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onMarkDone?.(item)}
                                                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-950/70 text-emerald-300 hover:bg-emerald-900 border border-emerald-500/40 transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                                                    >
                                                        <CheckCheck className="h-3 w-3" />
                                                        {t('done_work') || 'Selesai'}
                                                    </button>
                                                )}
                                                {canManageTask && onEdit && !isDone && item.status !== 'deleted_from_calendar' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onEdit?.(item)}
                                                        className="p-1.5 rounded-lg bg-[#2A281E] text-[#FAFAFA] hover:bg-[#3B3929] border border-[#3B3929] transition-colors cursor-pointer"
                                                        title={t('edit')}
                                                    >
                                                        <Edit2 className="h-3 w-3" style={{ color: deptColor }} />
                                                    </button>
                                                )}
                                                {canManageTask && !isDone && item.status !== 'deleted_from_calendar' && (
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

                            {getCleanTaskNotes(hoveredTask.item.notes) && (
                                <div className="pt-1.5 border-t border-[#3B3929]/70 text-[9px]">
                                    <span className="font-black uppercase text-[#C9AA71] tracking-wider block mb-0.5 flex items-center gap-1">
                                        <StickyNote className="h-2.5 w-2.5" />
                                        {t('notes') || 'Catatan'}
                                    </span>
                                    <p className="text-[10px] text-[#E3D1AA] line-clamp-3 leading-relaxed whitespace-pre-wrap">
                                        {getCleanTaskNotes(hoveredTask.item.notes)}
                                    </p>
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
                                <div key={tItem.id} className="text-[11px] flex items-center justify-between gap-1.5">
                                    <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tTheme.bg }} />
                                        <span className="truncate font-bold text-[#FAFAFA]">{tItem.title}</span>
                                    </div>
                                    {tItem.location && (
                                        <span className="text-[9px] text-[#C9AA71] font-medium shrink-0 max-w-[80px] truncate">
                                            📍 {tItem.location}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
