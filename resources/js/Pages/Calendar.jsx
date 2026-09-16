import { Head } from '@inertiajs/react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    Calendar as CalendarIcon, Briefcase, RefreshCw, Plus,
    ClipboardList, Clock, CheckCircle2, Loader2, X, Building2,
    Trash2, ChevronLeft, ChevronRight, RotateCcw, CalendarCheck, Cloud,
    Search, ArrowRight, Check, FileText, ArrowDownToLine, ArrowUpToLine, AlertTriangle
} from 'lucide-react';
import { CampusFixHeader } from '@/Components/CampusFix/CampusFixHeader';
import { MobileBottomNav } from '@/Components/CampusFix/MobileBottomNav';
import { IssuesProvider } from '@/context/IssuesContext';
import { useLanguage } from '@/context/LanguageContext';
import { OperationsCalendarView, parseTaskRanges, formatDateShort } from '@/Components/CampusFix/OperationsCalendarView';
import { ImageLightboxModal } from '@/Components/CampusFix/ImageLightboxModal';
import { ImageDropzone } from '@/Components/CampusFix/ImageDropzone';
import { ExportCalendarPdfModal } from '@/Components/CampusFix/ExportCalendarPdfModal';
import { ALL_DEPARTMENTS, normalizeDepartment } from '@/constants/staff';
import { getDepartmentTheme } from '@/constants/departments';
import { useAuth } from '@/hooks/useAuth';

const MAIN_LOCATIONS = ['TPI', 'TBR', 'Kantor'];

// Distinct vibrant palette for multiple schedule blocks
const BLOCK_COLOR_PALETTE = [
    { bg: '#C9AA71', text: '#1C1B0E' }, // Block 1 (or Department theme)
    { bg: '#38BDF8', text: '#082F49' }, // Block 2: Sky Blue
    { bg: '#34D399', text: '#064E3B' }, // Block 3: Emerald Mint
    { bg: '#FB7185', text: '#4C0519' }, // Block 4: Rose Coral
    { bg: '#A78BFA', text: '#2E1065' }, // Block 5: Lavender Violet
    { bg: '#FBBF24', text: '#451A03' }, // Block 6: Amber Gold
    { bg: '#2DD4BF', text: '#042F2E' }, // Block 7: Cyan Teal
    { bg: '#F472B6', text: '#500724' }, // Block 8: Hot Pink
];

export function getBlockTheme(index, defaultTheme) {
    if (index === 0 && defaultTheme?.bg) {
        return defaultTheme;
    }
    return BLOCK_COLOR_PALETTE[index % BLOCK_COLOR_PALETTE.length];
}

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

export default function Calendar() {
    return (
        <IssuesProvider>
            <CalendarInner />
        </IssuesProvider>
    );
}

function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

async function parseResponseSafeJson(res) {
    const text = await res.text();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart) {
        try {
            return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
        } catch {
            return JSON.parse(text);
        }
    }
    return JSON.parse(text);
}

function useAllOpsTasks() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const abortRef = useRef(null);
    const clientCacheRef = useRef(null);
    const reqIdRef = useRef(0);

    const load = useCallback(async (force = false, silent = false) => {
        const currentReqId = ++reqIdRef.current;

        if (!silent) {
            if (!force && clientCacheRef.current) {
                setTasks(clientCacheRef.current.tasks || []);
                setLoading(false);
                setError(null);
            } else {
                setLoading(true);
                setError(null);
            }
        }

        if (abortRef.current) abortRef.current.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        try {
            const res = await fetch(`/api/operations?dept=all${force ? '&refresh=1' : ''}`, { signal: ctrl.signal });
            const json = await parseResponseSafeJson(res);

            if (currentReqId !== reqIdRef.current) return;

            if (json.success) {
                const newTasks = (json.manual || []).map(task => {
                    const ranges = parseTaskRanges(task);
                    return { ...task, ranges };
                });

                clientCacheRef.current = {
                    tasks: newTasks,
                };

                setTasks(prev => {
                    if (prev && JSON.stringify(prev) === JSON.stringify(newTasks)) return prev;
                    return newTasks;
                });
            } else if (!silent) {
                setError(json.message || 'Gagal memuat data');
            }
        } catch (e) {
            if (e.name !== 'AbortError' && currentReqId === reqIdRef.current && !silent) {
                setError(e.message);
            }
        } finally {
            if (currentReqId === reqIdRef.current && !silent) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Background Poll & Focus Sync (15s interval, cached read to respect Google API quotas)
    useEffect(() => {
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                load(false, true);
            }
        }, 15000);

        const handleFocus = () => {
            if (document.visibilityState === 'visible') {
                load(false, true);
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleFocus);

        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleFocus);
        };
    }, [load]);

    return { tasks, setTasks, loading, error, reload: (f = false) => load(f) };
}

// ─── Clickable Date Picker Input Component ────────────────────────────────────
function DatePickerInput({ label, value, min, onChange, onClear }) {
    const inputRef = useRef(null);

    const handleOpenPicker = () => {
        if (inputRef.current) {
            try {
                inputRef.current.showPicker();
            } catch {
                inputRef.current.focus();
            }
        }
    };

    return (
        <div>
            {label && <label className="block text-xs font-semibold text-[#FAFAFA] mb-1">{label}</label>}
            <div 
                onClick={handleOpenPicker}
                className="relative flex items-center rounded-lg border border-[#3B3929] bg-[#1C1B0E] px-3 py-2 hover:border-[#C9AA71]/70 focus-within:border-[#C9AA71] transition-all cursor-pointer group shadow-sm"
            >
                <input
                    ref={inputRef}
                    type="date"
                    min={min}
                    value={value || ''}
                    onChange={onChange}
                    onClick={(e) => {
                        try { e.target.showPicker(); } catch {}
                    }}
                    className="w-full bg-transparent text-sm text-[#FAFAFA] focus:outline-none cursor-pointer [color-scheme:dark]"
                />
                {value && onClear && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClear();
                        }}
                        className="p-1 rounded text-[#A19F8D] hover:text-white hover:bg-[#353326] transition-colors cursor-pointer"
                        title="Clear Date"
                    >
                        <X className="h-3 w-3" />
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Interactive Mini Month Calendar with Multi-Color Block Highlighting ──────
function ModalMiniCalendarPicker({ dateBlocks, onBlocksChange, onClearAll, theme, t, lang = 'id' }) {
    const todayStr = toDateString(new Date());
    const validFirst = dateBlocks.find(b => b.startDate);
    const initialDate = validFirst ? parseDateStr(validFirst.startDate) : new Date();
    const [currentMonth, setCurrentMonth] = useState(initialDate || new Date());

    // Drag state inside modal
    const [dragStart, setDragStart] = useState(null);
    const [dragHover, setDragHover] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const isMouseDownRef = useRef(false);

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const monthTitle = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
        month: 'long',
        year: 'numeric'
    }).format(currentMonth);

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const totalDaysInMonth = lastDayOfMonth.getDate();

    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const dayHeaders = lang === 'id'
        ? ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Drag range calculation
    const currentDragSpan = useMemo(() => {
        if (!isDragging || !dragStart || !dragHover) return null;
        const d1 = parseDateStr(dragStart);
        const d2 = parseDateStr(dragHover);
        if (!d1 || !d2) return null;
        return {
            start: d1 < d2 ? dragStart : dragHover,
            end: d1 < d2 ? dragHover : dragStart
        };
    }, [isDragging, dragStart, dragHover]);

    const handleMouseDown = (dateStr, e) => {
        if (e.button !== 0 || e.pointerType === 'touch') return;
        isMouseDownRef.current = true;
        setDragStart(dateStr);
        setDragHover(dateStr);
        setIsDragging(false);
    };

    const handleMouseEnter = (dateStr) => {
        if (!isMouseDownRef.current || !dragStart) return;
        setDragHover(dateStr);
        if (dateStr !== dragStart) {
            setIsDragging(true);
        }
    };

    const handleMouseUp = (dateStr) => {
        if (!isMouseDownRef.current) return;
        isMouseDownRef.current = false;

        const sDate = dragStart;
        const eDate = isDragging ? dragHover : dateStr;

        if (sDate && eDate) {
            const d1 = parseDateStr(sDate);
            const d2 = parseDateStr(eDate);
            const finalStart = d1 <= d2 ? sDate : eDate;
            const finalEnd = d1 <= d2 ? eDate : sDate;

            if (isDragging) {
                const alreadyExists = dateBlocks.some(b => b.startDate === finalStart && b.endDate === finalEnd);
                if (!alreadyExists) {
                    if (dateBlocks.length === 1 && !dateBlocks[0].startDate) {
                        onBlocksChange([{ id: dateBlocks[0].id, startDate: finalStart, endDate: finalEnd }]);
                    } else {
                        onBlocksChange([...dateBlocks.filter(b => b.startDate), { id: Date.now() + Math.random(), startDate: finalStart, endDate: finalEnd }]);
                    }
                }
            } else {
                // Single click toggle on a date
                const matchedIndex = dateBlocks.findIndex(b => {
                    if (b.startDate && b.endDate) {
                        return dateStr >= b.startDate && dateStr <= b.endDate;
                    }
                    return b.startDate === dateStr || b.endDate === dateStr;
                });

                if (matchedIndex !== -1) {
                    if (dateBlocks.length === 1) {
                        onBlocksChange([{ id: dateBlocks[0].id, startDate: '', endDate: '' }]);
                    } else {
                        onBlocksChange(dateBlocks.filter((_, idx) => idx !== matchedIndex));
                    }
                } else {
                    if (dateBlocks.length === 1 && !dateBlocks[0].startDate) {
                        onBlocksChange([{ id: dateBlocks[0].id, startDate: dateStr, endDate: dateStr }]);
                    } else {
                        onBlocksChange([...dateBlocks.filter(b => b.startDate), { id: Date.now() + Math.random(), startDate: dateStr, endDate: dateStr }]);
                    }
                }
            }
        }

        setDragStart(null);
        setDragHover(null);
        setIsDragging(false);
    };

    useEffect(() => {
        const handleGlobalUp = () => {
            if (isMouseDownRef.current) {
                isMouseDownRef.current = false;
                setDragStart(null);
                setDragHover(null);
                setIsDragging(false);
            }
        };
        window.addEventListener('mouseup', handleGlobalUp);
        return () => window.removeEventListener('mouseup', handleGlobalUp);
    }, []);

    const hasSelectedDates = dateBlocks.some(b => !!b.startDate);

    // Build mini calendar cells
    const cells = useMemo(() => {
        const list = [];
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const dayNum = prevMonthLastDay - i;
            const d = new Date(year, month - 1, dayNum);
            list.push({ key: `prev-${dayNum}`, dayNum, dateStr: toDateString(d), isCurrentMonth: false });
        }
        for (let d = 1; d <= totalDaysInMonth; d++) {
            const dateObj = new Date(year, month, d);
            const dateStr = toDateString(dateObj);
            list.push({ key: `curr-${d}`, dayNum: d, dateStr, isCurrentMonth: true, isToday: dateStr === todayStr });
        }
        const remainingCells = (7 - (list.length % 7)) % 7;
        for (let d = 1; d <= remainingCells; d++) {
            const nextDateObj = new Date(year, month + 1, d);
            list.push({ key: `next-${d}`, dayNum: d, dateStr: toDateString(nextDateObj), isCurrentMonth: false });
        }
        return list;
    }, [year, month, startDayOfWeek, totalDaysInMonth, todayStr]);

    return (
        <div className="rounded-xl border border-[#3B3929] bg-[#1C1B0E]/95 p-3 space-y-2.5 shadow-inner select-none">
            {/* Mini Calendar Header */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5" style={{ color: theme.bg }} />
                    <span className="text-xs font-bold text-[#FAFAFA] capitalize">{monthTitle}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
                        className="p-1 rounded-lg hover:bg-[#353326] text-[#A19F8D] hover:text-[#FAFAFA] transition-colors cursor-pointer"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setCurrentMonth(new Date())}
                        className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-[#E3D1AA] hover:bg-[#353326] transition-colors cursor-pointer"
                    >
                        {t('today_btn') || 'Hari Ini'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
                        className="p-1 rounded-lg hover:bg-[#353326] text-[#A19F8D] hover:text-[#FAFAFA] transition-colors cursor-pointer"
                    >
                        <ChevronRight className="h-3.5 w-3.5" />
                    </button>

                    {hasSelectedDates && (
                        <button
                            type="button"
                            onClick={onClearAll}
                            className="ml-1.5 flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold text-red-400 hover:text-red-200 bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 transition-colors cursor-pointer"
                            title={t('clear_dates') || 'Hapus Semua Tanggal'}
                        >
                            <RotateCcw className="h-2.5 w-2.5" />
                            <span>{t('clear') || 'Bersihkan'}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Day Header Row */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-[#A19F8D] uppercase tracking-wider">
                {dayHeaders.map((dh, idx) => (
                    <div key={idx} className={idx >= 5 ? 'text-amber-400/80' : ''}>
                        {dh}
                    </div>
                ))}
            </div>

            {/* Calendar Days Grid with Block-Specific Colors */}
            <div className="grid grid-cols-7 gap-1">
                {cells.map((cell) => {
                    // Check which block index this date belongs to
                    let matchedBlockIndex = -1;
                    const cellTime = parseDateStr(cell.dateStr)?.getTime();

                    if (cellTime) {
                        for (let i = 0; i < dateBlocks.length; i++) {
                            const b = dateBlocks[i];
                            if (!b.startDate) continue;
                            const sTime = parseDateStr(b.startDate)?.getTime();
                            const eTime = parseDateStr(b.endDate || b.startDate)?.getTime();
                            if (sTime) {
                                if (eTime ? (cellTime >= sTime && cellTime <= eTime) : (cellTime === sTime)) {
                                    matchedBlockIndex = i;
                                    break;
                                }
                            }
                        }
                    }

                    const isSelected = matchedBlockIndex !== -1;
                    const blockTheme = isSelected ? getBlockTheme(matchedBlockIndex, theme) : null;

                    const isInDrag = currentDragSpan && cell.dateStr >= currentDragSpan.start && cell.dateStr <= currentDragSpan.end;
                    const dragTheme = isInDrag ? getBlockTheme(dateBlocks.filter(b => !!b.startDate).length, theme) : null;

                    let bgStyle = {};
                    let textClass = cell.isCurrentMonth ? 'text-[#FAFAFA]' : 'text-[#A19F8D]/40';

                    if (isInDrag && dragTheme) {
                        bgStyle = {
                            backgroundColor: `${dragTheme.bg}45`,
                            borderColor: dragTheme.bg,
                            color: dragTheme.bg === '#212121' ? '#FFFFFF' : dragTheme.bg,
                        };
                    } else if (isSelected && blockTheme) {
                        bgStyle = {
                            backgroundColor: blockTheme.bg,
                            color: blockTheme.text,
                            fontWeight: '800'
                        };
                    }

                    return (
                        <div
                            key={cell.key}
                            onMouseDown={(e) => handleMouseDown(cell.dateStr, e)}
                            onMouseEnter={() => handleMouseEnter(cell.dateStr)}
                            onMouseUp={() => handleMouseUp(cell.dateStr)}
                            style={bgStyle}
                            title={isSelected ? `Rentang #${matchedBlockIndex + 1} (Klik untuk membatalkan)` : 'Klik atau seret untuk memilih'}
                            className={`h-7 rounded-lg flex items-center justify-center text-xs font-semibold border transition-all cursor-pointer ${
                                isSelected || isInDrag
                                    ? 'shadow-xs border-transparent'
                                    : cell.isToday
                                        ? 'border-[#C9AA71]/60 text-[#E3D1AA] bg-[#2A281E]'
                                        : 'border-transparent hover:bg-[#353326]/60 ' + textClass
                            }`}
                        >
                            {cell.dayNum}
                        </div>
                    );
                })}
            </div>

            <p className="text-[10px] text-[#A19F8D] text-center pt-1 border-t border-[#3B3929]/50">
                {t('drag_calendar_tip') || '💡 Klik untuk memilih/menghapus tanggal, atau seret mouse untuk rentang baru'}
            </p>
        </div>
    );
}

// ─── Modal Shell ──────────────────────────────────────────────────────────────
function ModalShell({ title, IconComponent, theme, onClose, children }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in"
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="bg-[#2A281E] border border-[#3B3929] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden relative"
                onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 flex items-center justify-between border-b border-black/20"
                    style={{ background: `linear-gradient(135deg, ${theme.bg}, ${theme.bg}CC)` }}>
                    <div className="flex items-center gap-2">
                        {IconComponent && <IconComponent className="h-5 w-5" style={{ color: theme.text }} />}
                        <span className="font-bold text-base tracking-wide" style={{ color: theme.text }}>{title}</span>
                    </div>
                    <button type="button" onClick={onClose}
                        className="rounded-full p-1.5 hover:bg-black/25 transition-colors cursor-pointer"
                        style={{ color: theme.text }}>
                        <X className="h-4 w-4" />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

// ─── Add Task from Calendar Modal with Multi-Color Block Support ──────────────
function CalendarAddWorkModal({ initialStartDate = '', initialEndDate = '', initialDept = ALL_DEPARTMENTS[0], lockedDept = null, prefillCreatedBy = '', onClose, onSuccess, t, lang = 'id' }) {
    const todayStr = new Date().toISOString().split('T')[0];
    // If lockedDept is set (dept user), force that department; otherwise use initialDept
    const [selectedDept, setSelectedDept] = useState(lockedDept || initialDept);
    const theme = getDepartmentTheme(selectedDept);

    // Support multiple disjoint date ranges / blocks
    const [dateBlocks, setDateBlocks] = useState(() => [
        {
            id: Date.now(),
            startDate: initialStartDate || todayStr,
            endDate: initialEndDate || initialStartDate || todayStr
        }
    ]);

    const [form, setForm] = useState({
        title: '',
        description: '',
        locMains: [],
        locMain: '',
        locDetail: '',
        location: '',
        photoFile: null,
        photoPreview: null,
        notes: '',
        createdBy: prefillCreatedBy || '',
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleLocMainClick = (loc) => {
        setForm(prev => {
            const currentMains = prev.locMains || (prev.locMain ? [prev.locMain] : []);
            const isSelected = currentMains.includes(loc);
            const newMains = isSelected 
                ? currentMains.filter(m => m !== loc) 
                : [...currentMains, loc];
            
            const mainText = newMains.join(', ');
            const detail = prev.locDetail?.trim() || '';
            const combined = mainText ? (detail ? `${mainText} - ${detail}` : mainText) : detail;

            return {
                ...prev,
                locMains: newMains,
                locMain: newMains.length > 0 ? newMains[0] : '',
                location: combined,
            };
        });
    };

    const handleLocDetailChange = (e) => {
        const detail = e.target.value;
        setForm(prev => {
            const currentMains = prev.locMains || (prev.locMain ? [prev.locMain] : []);
            const mainText = currentMains.join(', ');
            const combined = mainText ? (detail.trim() ? `${mainText} - ${detail.trim()}` : mainText) : detail.trim();
            return {
                ...prev,
                locDetail: detail,
                location: combined,
            };
        });
    };

    const handleAddDateBlock = () => {
        const lastBlock = dateBlocks[dateBlocks.length - 1];
        let nextStart = todayStr;
        let nextEnd = todayStr;
        if (lastBlock && lastBlock.endDate) {
            try {
                const d = new Date(lastBlock.endDate);
                d.setDate(d.getDate() + 2); // default to 2 days after (e.g. skip a day!)
                nextStart = toDateString(d);
                nextEnd = toDateString(d);
            } catch {}
        }
        setDateBlocks(prev => [...prev.filter(b => b.startDate), { id: Date.now() + Math.random(), startDate: nextStart, endDate: nextEnd }]);
    };

    const handleRemoveDateBlock = (id) => {
        if (dateBlocks.length <= 1) {
            setDateBlocks([{ id: dateBlocks[0].id, startDate: '', endDate: '' }]);
            return;
        }
        setDateBlocks(prev => prev.filter(b => b.id !== id));
    };

    const handleClearAllDates = () => {
        setDateBlocks([{ id: Date.now(), startDate: '', endDate: '' }]);
    };

    const handleBlockDateChange = (id, field, value) => {
        setDateBlocks(prev => prev.map(b => {
            if (b.id !== id) return b;
            const updated = { ...b, [field]: value };
            if (field === 'startDate' && updated.endDate && updated.endDate < value) {
                updated.endDate = value;
            }
            return updated;
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.title.trim()) { setErr((t('work_title') || 'Judul') + ' is required'); return; }
        
        const validBlocks = dateBlocks.filter(b => b.startDate).map(b => ({
            startDate: b.startDate,
            endDate: b.endDate || b.startDate
        }));

        if (validBlocks.length === 0) {
            setErr(t('date_range_required') || 'Pilih setidaknya 1 rentang tanggal pekerjaan');
            return;
        }
        setSaving(true); setErr('');

        validBlocks.sort((a, b) => a.startDate.localeCompare(b.startDate));
        const overallStart = validBlocks[0].startDate;
        const overallEnd = validBlocks.reduce((max, b) => b.endDate > max ? b.endDate : max, validBlocks[0].endDate);

        // Serialize multi-range schedule metadata into notes if more than 1 block
        let finalNotes = form.notes || '';
        if (validBlocks.length > 1) {
            finalNotes = (finalNotes ? `${finalNotes}\n` : '') + `[SCHEDULE_RANGES: ${JSON.stringify(validBlocks)}]`;
        }

        try {
            const fd = new FormData();
            fd.append('dept', selectedDept);
            fd.append('title', form.title);
            fd.append('description', form.description || '');
            fd.append('location', form.location || '');
            fd.append('startDate', overallStart);
            fd.append('endDate', overallEnd);
            fd.append('notes', finalNotes);
            if (form.photoFile) {
                fd.append('photo', form.photoFile);
            }

            const res = await fetch('/api/operations', {
                method: 'POST',
                headers: { 'X-CSRF-TOKEN': getCsrfToken() },
                body: fd,
            });
            const json = await parseResponseSafeJson(res);
            if (json.success) {
                onSuccess({
                    id: json.id,
                    rowIndex: 9999,
                    department: selectedDept,
                    dept: selectedDept,
                    title: form.title,
                    description: form.description,
                    location: form.location,
                    photoUrl: json.photoUrl || form.photoPreview || '',
                    startDate: overallStart,
                    endDate: overallEnd,
                    notes: finalNotes,
                    ranges: validBlocks,
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    completedAt: ''
                });
            } else { setErr(json.message || 'Error saving'); }
        } catch (e2) { setErr(e2.message); }
        finally { setSaving(false); }
    };

    return (
        <ModalShell title={t('add_work_on_date') || 'Tambah Tugas Jadwal'} IconComponent={Plus} theme={theme} onClose={onClose}>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
                {err && <p className="text-xs text-red-300 bg-red-950/40 border border-red-500/40 rounded-lg px-3 py-2">{err}</p>}

                {/* Department Selector — locked badge for dept users, full dropdown for admin */}
                <div>
                    <label className="block text-xs font-semibold text-[#FAFAFA] mb-1.5 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-[#C9AA71]" />
                        <span>{t('department') || 'Departemen'} <span className="text-red-400">*</span></span>
                    </label>
                    {lockedDept ? (
                        // Dept user: show a locked badge, no dropdown
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#C9AA71]/40 bg-[#1C1B0E]">
                            <span className="text-sm font-bold" style={{ color: theme.text, background: theme.bg, padding: '2px 10px', borderRadius: '9999px' }}>
                                {lockedDept}
                            </span>
                            <span className="text-xs text-[#A19F8D] ml-1">🔒 {t('locked_to_department') || 'Terkunci ke departemen Anda'}</span>
                        </div>
                    ) : (
                        <select
                            value={selectedDept}
                            onChange={(e) => setSelectedDept(e.target.value)}
                            className="w-full rounded-lg border border-[#3B3929] bg-[#1C1B0E] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#C9AA71] focus:outline-none cursor-pointer transition-colors"
                        >
                            {ALL_DEPARTMENTS.map(d => (
                                <option key={d} value={d}>{d}</option>
                        ))}
                        </select>
                    )}
                </div>

                {/* Title */}
                <div>
                    <label className="block text-xs font-semibold text-[#FAFAFA] mb-1">
                        {t('work_title') || 'Judul Pekerjaan'} <span className="text-red-400">*</span>
                    </label>
                    <input 
                        value={form.title} 
                        onChange={e => set('title', e.target.value)}
                        placeholder={t('work_title_placeholder') || 'Contoh: Perbaikan AC Villa 12'}
                        className="w-full rounded-lg border border-[#3B3929] bg-[#1C1B0E] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#A19F8D]/60 focus:border-[#C9AA71] focus:outline-none transition-colors" 
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="block text-xs font-semibold text-[#FAFAFA] mb-1">{t('work_desc') || 'Deskripsi'}</label>
                    <textarea 
                        value={form.description} 
                        onChange={e => set('description', e.target.value)} 
                        rows={3}
                        placeholder={t('work_desc_placeholder') || 'Detail pekerjaan...'}
                        className="w-full rounded-lg border border-[#3B3929] bg-[#1C1B0E] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#A19F8D]/60 resize-none focus:border-[#C9AA71] focus:outline-none transition-colors" 
                    />
                </div>

                {/* Location selector with TPI / TBR / Kantor (multi-selectable) + specific detail */}
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-[#FAFAFA]">{t('work_location') || 'Lokasi Area'}</label>
                        <span className="text-[10px] text-[#A19F8D]">({t('select_multiple_hint') || 'Bisa pilih lebih dari 1'})</span>
                    </div>
                    <div className="flex gap-2 mb-2">
                        {MAIN_LOCATIONS.map(loc => {
                            const currentMains = form.locMains || (form.locMain ? [form.locMain] : []);
                            const isSelected = currentMains.includes(loc);
                            return (
                                <button
                                    key={loc}
                                    type="button"
                                    onClick={() => handleLocMainClick(loc)}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                        isSelected
                                            ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] shadow-md scale-[1.02]'
                                            : 'bg-[#1C1B0E] text-[#A19F8D] border-[#3B3929] hover:text-[#FAFAFA] hover:border-[#C9AA71]/50'
                                    }`}
                                >
                                    {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                                    <span>{loc}</span>
                                </button>
                            );
                        })}
                    </div>
                    <input 
                        value={form.locDetail || ''} 
                        onChange={handleLocDetailChange}
                        placeholder={
                            (form.locMains && form.locMains.length > 0)
                                ? `${t('specific_location_in') || 'Detail lokasi di'} ${form.locMains.join(', ')}… (${t('work_location_placeholder') || 'contoh: Villa 101, Jetty'})`
                                : (t('work_location_placeholder') || 'Pilih area atau ketik lokasi…')
                        }
                        className="w-full rounded-lg border border-[#3B3929] bg-[#1C1B0E] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#A19F8D]/60 focus:border-[#C9AA71] focus:outline-none transition-colors" 
                    />
                </div>

                {/* Multi-Range / Skippable Days Schedule Section */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-[#FAFAFA] flex items-center gap-1.5">
                            <CalendarIcon className="h-3.5 w-3.5 text-[#C9AA71]" />
                            <span>{t('schedule_blocks') || 'Rentang Tanggal & Hari'} <span className="text-red-400">*</span></span>
                        </label>
                        <div className="flex items-center gap-2">
                            {dateBlocks.some(b => b.startDate) && (
                                <button
                                    type="button"
                                    onClick={handleClearAllDates}
                                    className="text-[11px] font-bold text-red-400 hover:text-red-200 underline cursor-pointer"
                                >
                                    {t('clear_dates') || 'Hapus Semua'}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleAddDateBlock}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#E3D1AA] hover:text-white bg-[#353326] px-2.5 py-1 rounded-lg border border-[#3B3929] hover:border-[#C9AA71]/60 transition-all cursor-pointer"
                            >
                                <Plus className="h-3 w-3 text-[#C9AA71]" />
                                <span>{t('add_date_range') || '+ Tambah Rentang'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Mini Visual Calendar Picker with Distinct Block Colors */}
                    <ModalMiniCalendarPicker
                        dateBlocks={dateBlocks}
                        onBlocksChange={setDateBlocks}
                        onClearAll={handleClearAllDates}
                        theme={theme}
                        t={t}
                        lang={lang}
                    />

                    {/* Date Blocks List: Styled in matching block color */}
                    <div className="space-y-2.5">
                        {dateBlocks.map((block, index) => {
                            const bTheme = getBlockTheme(index, theme);
                            const bColor = bTheme.bg === '#212121' ? '#FFFFFF' : bTheme.bg;

                            return (
                                <div 
                                    key={block.id} 
                                    className="p-3 rounded-xl border space-y-2 transition-all shadow-sm"
                                    style={{
                                        borderColor: `${bTheme.bg}60`,
                                        borderLeftWidth: '5px',
                                        borderLeftColor: bTheme.bg,
                                        background: `linear-gradient(135deg, ${bTheme.bg}14 0%, #1C1B0E 70%)`
                                    }}
                                >
                                    <div className="flex items-center justify-between text-[11px] font-bold text-[#A19F8D]">
                                        <span className="flex items-center gap-1.5">
                                            <span
                                                className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black shadow-xs"
                                                style={{ backgroundColor: bTheme.bg, color: bTheme.text }}
                                            >
                                                {index + 1}
                                            </span>
                                            <span style={{ color: bColor }} className="font-extrabold">
                                                {t('date_block') || 'Rentang'} #{index + 1}
                                            </span>
                                        </span>

                                        <button
                                            type="button"
                                            onClick={() => handleRemoveDateBlock(block.id)}
                                            className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-950/40 transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
                                            title="Hapus rentang ini"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                            <span>{dateBlocks.length > 1 ? 'Hapus' : 'Kosongkan'}</span>
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <DatePickerInput
                                            label={`${t('block_start') || 'Mulai'} (From)`}
                                            value={block.startDate}
                                            min={todayStr}
                                            onChange={(e) => handleBlockDateChange(block.id, 'startDate', e.target.value)}
                                            onClear={() => handleBlockDateChange(block.id, 'startDate', '')}
                                        />
                                        <DatePickerInput
                                            label={`${t('block_end') || 'Sampai'} (To)`}
                                            value={block.endDate}
                                            min={block.startDate || todayStr}
                                            onChange={(e) => handleBlockDateChange(block.id, 'endDate', e.target.value)}
                                            onClear={() => handleBlockDateChange(block.id, 'endDate', '')}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Image Dropzone Component */}
                <div>
                    <label className="block text-xs font-semibold text-[#FAFAFA] mb-1.5">{t('photo_optional') || 'Foto Dokumentasi (Opsional)'}</label>
                    <ImageDropzone 
                        previewUrl={form.photoPreview}
                        onChange={(file, preview) => {
                            set('photoFile', file);
                            set('photoPreview', preview);
                            if (!file && !preview) {
                                set('photoUrl', '');
                            }
                        }}
                        label={t('photo_optional') || 'Upload Foto'}
                        maxMb={10}
                    />
                </div>

                {/* Notes */}
                <div>
                    <label className="block text-xs font-semibold text-[#FAFAFA] mb-1">{t('notes') || 'Catatan'}</label>
                    <textarea 
                        value={form.notes} 
                        onChange={e => set('notes', e.target.value)} 
                        rows={2}
                        placeholder={t('notes_placeholder') || 'Catatan tambahan...'}
                        className="w-full rounded-lg border border-[#3B3929] bg-[#1C1B0E] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#A19F8D]/60 resize-none focus:border-[#C9AA71] focus:outline-none transition-colors" 
                    />
                </div>

                <div className="flex gap-3 pt-3">
                    <button type="button" onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-[#3B3929] text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#3B3929]/50 transition-all cursor-pointer">
                        {t('cancel')}
                    </button>
                    <button type="submit" disabled={saving}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                        style={{ background: theme.bg, color: theme.text }}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Plus className="h-4 w-4"/>}
                        {saving ? (t('saving') || 'Menyimpan...') : (t('save_work') || 'Simpan')}
                    </button>
                </div>
            </form>
        </ModalShell>
    );
}

// ─── Main Calendar Page ───────────────────────────────────────────────────────
function CalendarInner() {
    const { t, lang } = useLanguage();
    const { tasks, setTasks, loading, error, reload } = useAllOpsTasks();
    const { isDeptUser, department: userDept, staffName, canAccessCalendar, canExportReports, canSyncCalendar } = useAuth();

    // Multi-Department Selection: Defaults to ALL departments for everyone
    const [selectedDepartments, setSelectedDepartments] = useState(ALL_DEPARTMENTS);
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [modalDates, setModalDates] = useState({ start: '', end: '' });
    const [previewImage, setPreviewImage] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [targetDateStr, setTargetDateStr] = useState(null);
    const [highlightTaskId, setHighlightTaskId] = useState(null);

    // Helpers to get primary date & date summary for a task
    const getTaskPrimaryDate = useCallback((task) => {
        const ranges = parseTaskRanges(task);
        if (ranges.length > 0 && ranges[0].startDate) {
            return ranges[0].startDate;
        }
        if (task.startDate) return task.startDate;
        if (task.endDate) return task.endDate;
        if (task.createdAt) {
            const parsed = parseDateStr(task.createdAt);
            if (parsed) return toDateString(parsed);
        }
        return toDateString(new Date());
    }, []);

    const getTaskDateSummary = useCallback((task) => {
        const ranges = parseTaskRanges(task);
        if (ranges.length > 0) {
            return ranges.map(r => {
                if (r.startDate && r.endDate && r.startDate !== r.endDate) {
                    return `${formatDateShort(r.startDate, lang)} – ${formatDateShort(r.endDate, lang)}`;
                }
                return formatDateShort(r.startDate || r.endDate, lang);
            }).join(', ');
        }
        if (task.startDate || task.endDate) {
            if (task.startDate && task.endDate && task.startDate !== task.endDate) {
                return `${formatDateShort(task.startDate, lang)} – ${formatDateShort(task.endDate, lang)}`;
            }
            return formatDateShort(task.startDate || task.endDate, lang);
        }
        if (task.createdAt) {
            return formatDateShort(task.createdAt, lang);
        }
        return '';
    }, [lang]);

    // Live search results across ALL dates (matching title, description, department, date, location, reporter, status)
    const searchPreviewMatches = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return [];
        return tasks.filter(task => {
            const title = (task.title || '').toLowerCase();
            const desc = (task.description || '').toLowerCase();
            const dept = (task.department || task.dept || '').toLowerCase();
            const loc = (task.location || task.locDetail || '').toLowerCase();
            const reporter = (task.createdBy || task.reporter || '').toLowerCase();
            const status = (task.status || '').toLowerCase();
            const statusLabel = status === 'done' ? 'selesai finished done' : 'aktif active belum selesai in progress';

            const ranges = parseTaskRanges(task);
            const dateStrMatches = ranges.some(r =>
                (r.startDate && r.startDate.includes(q)) ||
                (r.endDate && r.endDate.includes(q))
            );

            return title.includes(q) ||
                desc.includes(q) ||
                dept.includes(q) ||
                loc.includes(q) ||
                reporter.includes(q) ||
                statusLabel.includes(q) ||
                dateStrMatches;
        });
    }, [tasks, searchQuery]);

    const [highlightedDates, setHighlightedDates] = useState([]);

    // Extract all dates in ranges or single dates for a task
    const getTaskDatesList = useCallback((task) => {
        const dates = new Set();
        const ranges = parseTaskRanges(task);
        if (ranges.length > 0) {
            ranges.forEach(r => {
                const sDate = parseDateStr(r.startDate);
                const eDate = parseDateStr(r.endDate || r.startDate);
                if (sDate && eDate) {
                    const start = sDate < eDate ? sDate : eDate;
                    const end = sDate < eDate ? eDate : sDate;
                    const curr = new Date(start);
                    let count = 0;
                    while (curr <= end && count < 60) {
                        dates.add(toDateString(curr));
                        curr.setDate(curr.getDate() + 1);
                        count++;
                    }
                } else if (r.startDate) {
                    dates.add(r.startDate);
                }
            });
        } else if (task.startDate || task.endDate) {
            const s = task.startDate || task.endDate;
            const e = task.endDate || task.startDate;
            const sDate = parseDateStr(s);
            const eDate = parseDateStr(e);
            if (sDate && eDate) {
                const start = sDate < eDate ? sDate : eDate;
                const end = sDate < eDate ? eDate : sDate;
                const curr = new Date(start);
                let count = 0;
                while (curr <= end && count < 60) {
                    dates.add(toDateString(curr));
                    curr.setDate(curr.getDate() + 1);
                    count++;
                }
            } else if (s) {
                dates.add(s);
            }
        } else if (task.createdAt) {
            const d = parseDateStr(task.createdAt);
            if (d) dates.add(toDateString(d));
        }
        return Array.from(dates);
    }, []);

    // Handle clicking a search result preview item
    const handleSelectSearchItem = (task, closeDropdown) => {
        const pDate = getTaskPrimaryDate(task);
        const taskDept = task.department || task.dept;
        const taskDates = getTaskDatesList(task);

        if (pDate) {
            setTargetDateStr(pDate);
            setHighlightTaskId(task.id);
            setHighlightedDates(taskDates);
            setTimeout(() => {
                const agendaEl = document.getElementById('day-agenda-inspector');
                if (agendaEl) {
                    agendaEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 150);
        }
        // Auto-include task's department if it's currently filtered out
        const normDept = normalizeDepartment(taskDept);
        if (normDept && !selectedDepartments.includes(normDept)) {
            setSelectedDepartments(prev => [...prev, normDept]);
        }

        // Close dropdown so calendar dates are immediately visible with slight highlight
        if (typeof closeDropdown === 'function') {
            closeDropdown();
        }
    };

    const renderSearchDropdown = (closeDropdown) => {
        if (!searchQuery.trim()) return null;

        return (
            <div 
                className="absolute left-0 right-0 top-full mt-2 bg-[#2A281E] border border-[#3B3929] rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-2xl animate-in fade-in slide-in-from-top-2"
                style={{
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(201, 170, 113, 0.15)',
                }}
            >
                {/* Header with summary count */}
                <div className="px-4 py-2.5 bg-[#1C1B0E]/90 border-b border-[#3B3929] flex items-center justify-between text-xs font-bold text-[#A19F8D]">
                    <div className="flex items-center gap-2">
                        <Search className="h-3.5 w-3.5 text-[#C9AA71]" />
                        <span>
                            <strong className="text-[#FAFAFA]">{searchPreviewMatches.length}</strong> {t('tasks_found_across_dates') || 'tugas ditemukan lintas tanggal'}
                        </span>
                    </div>
                    <span className="text-[10px] text-[#C9AA71]/80 uppercase tracking-wider font-extrabold hidden sm:inline">
                        {t('jump_to_date') || 'Klik untuk membuka'}
                    </span>
                </div>

                {/* List of preview items */}
                {searchPreviewMatches.length === 0 ? (
                    <div className="p-6 text-center text-[#A19F8D]">
                        <p className="text-sm font-semibold text-[#FAFAFA] mb-1">
                            {t('no_tasks_found') || 'Tidak ada tugas ditemukan'}
                        </p>
                        <p className="text-xs">
                            {lang === 'id' ? `Tidak ada tugas cocok dengan "${searchQuery}" di tanggal mana pun` : `No tasks matching "${searchQuery}" across any dates`}
                        </p>
                    </div>
                ) : (
                    <div className="max-h-[380px] overflow-y-auto divide-y divide-[#3B3929]/40 custom-scrollbar">
                        {searchPreviewMatches.map((task) => {
                            const isDone = task.status === 'done';
                            const taskDept = task.department || task.dept;
                            const dTheme = getDepartmentTheme(taskDept);
                            const deptTextColor = dTheme.bg === '#212121' ? '#FFFFFF' : dTheme.text;
                            const dateLabel = getTaskDateSummary(task);

                            return (
                                <div
                                    key={task.id}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => {
                                        // Prevent input blur before click triggers
                                        e.preventDefault();
                                    }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleSelectSearchItem(task, closeDropdown);
                                    }}
                                    className="p-3.5 hover:bg-[#353326]/80 active:bg-[#3B3929] transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none touch-manipulation"
                                >
                                    {/* Left: Department & Task Details (Prioritized!) */}
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        {/* Row 1: 1) Department Name (Prioritized!) & 4) Finished Status */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {/* Department Name Badge */}
                                            {taskDept ? (
                                                <span
                                                    className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-xs"
                                                    style={{
                                                        backgroundColor: dTheme.bg,
                                                        color: deptTextColor,
                                                    }}
                                                >
                                                    {taskDept}
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-[#3B3929] text-[#FAFAFA]">
                                                    General
                                                </span>
                                            )}

                                            {/* Finished or Not Status Indicator */}
                                            <span
                                                className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold flex items-center gap-1 shadow-2xs ${
                                                    isDone
                                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                                }`}
                                            >
                                                {isDone ? (
                                                    <>
                                                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                                        <span>{t('status_finished') || 'Selesai'}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Clock className="h-3 w-3 text-amber-400" />
                                                        <span>{t('status_unfinished') || 'Belum Selesai'}</span>
                                                    </>
                                                )}
                                            </span>

                                            {task.location && (
                                                <span className="text-[10px] text-[#A19F8D] flex items-center gap-1 font-semibold">
                                                    📍 {task.location}
                                                </span>
                                            )}
                                        </div>

                                        {/* Row 2: 2) The Task Title */}
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-bold text-[#FAFAFA] group-hover:text-[#C9AA71] transition-colors truncate">
                                                {task.title}
                                            </h4>
                                        </div>

                                        {/* Short description preview if available */}
                                        {task.description && (
                                            <p className="text-[11px] text-[#A19F8D] line-clamp-1">
                                                {task.description}
                                            </p>
                                        )}
                                    </div>

                                    {/* Right: 3) The Date & Jump Action */}
                                    <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
                                        <div className="flex flex-col sm:items-end">
                                            <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#E3D1AA]">
                                                <CalendarIcon className="h-3.5 w-3.5 text-[#C9AA71]" />
                                                <span>{dateLabel || (t('no_date') || 'Tanpa tanggal')}</span>
                                            </div>
                                            {task.createdBy && (
                                                <span className="text-[10px] text-[#A19F8D]">
                                                    {task.createdBy}
                                                </span>
                                            )}
                                        </div>

                                        <div className="w-7 h-7 rounded-xl bg-[#1C1B0E] border border-[#3B3929] group-hover:border-[#C9AA71] group-hover:bg-[#C9AA71] flex items-center justify-center transition-all shadow-xs">
                                            <ArrowRight className="h-3.5 w-3.5 text-[#A19F8D] group-hover:text-[#1C1B0E] transition-colors" />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Footer hint */}
                <div className="px-4 py-2 bg-[#1C1B0E]/60 border-t border-[#3B3929] text-[10px] text-[#A19F8D] text-center">
                    💡 {lang === 'id' ? 'Klik tugas di atas untuk otomatis membuka jadwal & tanggal terkait pada kalender' : 'Click a task above to jump directly to its scheduled date on the calendar'}
                </div>
            </div>
        );
    };

    const handleMarkDone = async (item) => {
        // Dept users can only mark done tasks from their own department
        if (isDeptUser && normalizeDepartment(item.department || item.dept) !== userDept) return;
        try {
            const dept = item.department || item.dept;
            await fetch(`/api/operations/${item.rowIndex}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': getCsrfToken() },
                body: JSON.stringify({ dept, status: 'done' }),
            });
            setTasks(prev => prev.map(m => m.id === item.id ? { ...m, status: 'done', completedAt: new Date().toISOString() } : m));
        } catch {}
    };

    const handleDelete = async (item) => {
        // Dept users can only delete their own department's tasks
        if (isDeptUser && normalizeDepartment(item.department || item.dept) !== userDept) {
            alert('You can only delete tasks from your own department.');
            return;
        }
        if (!confirm(t('confirm_delete_work') || 'Hapus pekerjaan ini?')) return;
        try {
            const dept = item.department || item.dept;
            await fetch(`/api/operations/${item.rowIndex}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': getCsrfToken() },
                body: JSON.stringify({ dept }),
            });
            setTasks(prev => prev.filter(m => m.id !== item.id));
        } catch {}
    };

    const handlePreview = (src, title, subtitle) => {
        setPreviewImage({ src, title, subtitle });
    };

    const [showDeletedGCal, setShowDeletedGCal] = useState(false);

    const deletedGCalCount = useMemo(() => {
        return tasks.filter(m => m.status === 'deleted_from_calendar').length;
    }, [tasks]);

    // Filter tasks based on selected departments (consolidated department mapping)
    const filteredTasks = useMemo(() => {
        return tasks.filter(m => {
            if (m.status === 'deleted_from_calendar' && !showDeletedGCal) {
                return false;
            }
            if (selectedDepartments.length === ALL_DEPARTMENTS.length) return true;
            const norm = normalizeDepartment(m.department || m.dept);
            return selectedDepartments.includes(norm);
        });
    }, [tasks, selectedDepartments, showDeletedGCal]);

    const totalTasks = filteredTasks.length;
    const activeTasks = filteredTasks.filter(m => m.status === 'active' || m.status === 'todo' || m.status === 'in_progress').length;
    const doneTasks = filteredTasks.filter(m => m.status === 'done').length;

    const [syncingCalendar, setSyncingCalendar] = useState(false);
    const [pullingCalendar, setPullingCalendar] = useState(false);
    const [syncMsg, setSyncMsg] = useState(null);

    const handleSyncGoogleCalendar = async () => {
        setSyncingCalendar(true);
        setSyncMsg(null);
        try {
            const res = await fetch('/api/operations/sync-calendar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': getCsrfToken() },
            });
            const json = await parseResponseSafeJson(res);
            if (json.success) {
                setSyncMsg({ type: 'success', text: json.data?.message || 'Sinkronisasi ke Google Calendar berhasil!' });
                reload(true, true);
            } else {
                setSyncMsg({ type: 'error', text: json.message || 'Gagal sinkronisasi Google Calendar' });
            }
        } catch (e) {
            setSyncMsg({ type: 'error', text: e.message || 'Gagal sinkronisasi Google Calendar' });
        } finally {
            setSyncingCalendar(false);
            setTimeout(() => setSyncMsg(null), 6000);
        }
    };

    const handlePullGoogleCalendar = async () => {
        setPullingCalendar(true);
        setSyncMsg(null);
        try {
            const res = await fetch('/api/operations/pull-calendar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': getCsrfToken() },
            });
            const json = await parseResponseSafeJson(res);
            if (json.success) {
                setSyncMsg({ type: 'success', text: json.data?.message || 'Berhasil menarik pembaruan dari Google Calendar!' });
                reload(true, true);
            } else {
                setSyncMsg({ type: 'error', text: json.message || 'Gagal menarik data dari Google Calendar' });
            }
        } catch (e) {
            setSyncMsg({ type: 'error', text: e.message || 'Gagal menarik data dari Google Calendar' });
        } finally {
            setPullingCalendar(false);
            setTimeout(() => setSyncMsg(null), 6000);
        }
    };

    if (!canAccessCalendar) {
        return (
            <div className="min-h-screen bg-[#1C1B0E] text-[#FAFAFA] flex flex-col justify-between relative overflow-hidden">
                <div 
                    className="fixed inset-0 pointer-events-none opacity-25 z-0 bg-repeat"
                    style={{
                        backgroundImage: "url('/bg-lineart.png')",
                        backgroundSize: '600px',
                    }}
                />
                <div className="relative z-10">
                    <CampusFixHeader mode="calendar" />
                    <main className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto my-20 space-y-5">
                        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                            <Clock className="h-12 w-12 mx-auto" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-xl font-extrabold text-[#FAFAFA]">
                                {lang === 'id' ? 'Akses Kalender Dibatasi' : 'Calendar Access Restricted'}
                            </h2>
                            <p className="text-xs text-[#A19F8D] leading-relaxed">
                                {lang === 'id' 
                                    ? 'Akun Anda dibatasi untuk mengakses jadwal kalender operasional departemen. Hubungi Administrator jika Anda membutuhkan izin ini.' 
                                    : 'Your account is restricted from accessing operational calendar schedules. Please contact an Administrator if you need access.'}
                            </p>
                        </div>
                        <a
                            href="/dashboard"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#C9AA71] text-[#1C1B0E] hover:bg-[#D4B883] transition-all shadow-md"
                        >
                            {lang === 'id' ? 'Kembali ke Dashboard' : 'Back to Dashboard'}
                        </a>
                    </main>
                </div>
                <MobileBottomNav currentTab="calendar" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#1C1B0E] text-[#FAFAFA] relative overflow-hidden antialiased selection:bg-[#C9AA71]/30">
            <Head title={`${t('calendar_view') || (lang === 'id' ? 'Kalender' : 'Calendar')} — Telunas Resort`} />

            {/* Background Motif Pattern Overlay */}
            <div 
                className="fixed inset-0 pointer-events-none opacity-25 z-0 bg-repeat"
                style={{
                    backgroundImage: "url('/bg-lineart.png')",
                    backgroundSize: '600px',
                }}
            />

            {/* Ambient Glow */}
            <div className="fixed top-12 left-1/2 -translate-x-1/2 w-[750px] h-[380px] pointer-events-none blur-[160px] opacity-15 rounded-full bg-[#C9AA71] z-0" />

            <div className="relative z-10">
                <CampusFixHeader
                    mode="calendar"
                    query={searchQuery}
                    onQueryChange={setSearchQuery}
                    searchDropdown={renderSearchDropdown}
                />

                <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 pb-28 md:pb-6">
                    {/* Sync Message Alert Banner */}
                    {syncMsg && (
                        <div className={`mb-4 px-4 py-3 rounded-xl border flex items-center justify-between text-xs font-bold transition-all shadow-lg animate-in fade-in slide-in-from-top-2 ${
                            syncMsg.type === 'success'
                                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                                : 'bg-rose-950/80 border-rose-500/40 text-rose-300'
                        }`}>
                            <div className="flex items-center gap-2">
                                <CalendarCheck className="h-4 w-4 shrink-0" />
                                <span>{syncMsg.text}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSyncMsg(null)}
                                className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}

                    {/* Header Banner */}
                    <div className="rounded-2xl p-5 sm:p-6 mb-6 flex flex-wrap items-center gap-4 justify-between shadow-xl border border-white/10 bg-gradient-to-br from-[#2A281E] to-[#1C1B0E]">
                        <div>
                            <div className="flex items-center gap-2.5 mb-1.5">
                                <CalendarIcon className="h-6 w-6 text-[#C9AA71]" />
                                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#FAFAFA]">
                                    {t('calendar_view') || (lang === 'id' ? 'Kalender' : 'Calendar')}
                                </h1>
                            </div>
                            <p className="text-sm font-medium text-[#A19F8D]">
                                {totalTasks} {t('work_summary_total') || 'tugas'} &middot; {activeTasks} {t('work_summary_active') || 'aktif'} &middot; {doneTasks} {t('work_summary_done') || 'selesai'}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                            <button
                                type="button"
                                onClick={() => reload(true)}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#1C1B0E] text-[#FAFAFA] border border-[#3B3929] hover:border-[#C9AA71]/60 transition-all hover:scale-105 cursor-pointer backdrop-blur-sm shadow-sm"
                            >
                                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#C9AA71]' : ''}`} />
                                {t('refresh') || 'Refresh'}
                            </button>

                            {canSyncCalendar && (
                                <>
                                    {/* Pull from Google Calendar */}
                                    <button
                                        type="button"
                                        onClick={handlePullGoogleCalendar}
                                        disabled={pullingCalendar || syncingCalendar}
                                        title={lang === 'id' ? 'Tarik perubahan jadwal dari Google Calendar' : 'Pull updates from Google Calendar'}
                                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#1C1B0E] text-sky-300 border border-sky-500/40 hover:border-sky-400 hover:bg-sky-950/30 transition-all hover:scale-105 cursor-pointer backdrop-blur-sm shadow-sm disabled:opacity-50"
                                    >
                                        {pullingCalendar ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
                                        ) : (
                                            <ArrowDownToLine className="h-3.5 w-3.5 text-sky-400" />
                                        )}
                                        <span>{pullingCalendar ? (lang === 'id' ? 'Menarik...' : 'Pulling...') : (lang === 'id' ? 'Tarik dari G-Cal' : 'Pull G-Cal')}</span>
                                    </button>

                                    {/* Push to Google Calendar */}
                                    <button
                                        type="button"
                                        onClick={handleSyncGoogleCalendar}
                                        disabled={syncingCalendar || pullingCalendar}
                                        title={lang === 'id' ? 'Kirim/perbarui seluruh jadwal ke Google Calendar' : 'Sync all schedules to Google Calendar'}
                                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#1C1B0E] text-[#E3D1AA] border border-[#C9AA71]/40 hover:border-[#C9AA71] hover:bg-[#C9AA71]/10 transition-all hover:scale-105 cursor-pointer backdrop-blur-sm shadow-sm disabled:opacity-50"
                                    >
                                        {syncingCalendar ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#C9AA71]" />
                                        ) : (
                                            <ArrowUpToLine className="h-3.5 w-3.5 text-[#C9AA71]" />
                                        )}
                                        <span>{syncingCalendar ? (lang === 'id' ? 'Mengirim...' : 'Pushing...') : (lang === 'id' ? 'Kirim ke G-Cal' : 'Push G-Cal')}</span>
                                    </button>

                                    {/* Toggle Deleted in G-Cal */}
                                    {deletedGCalCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowDeletedGCal(prev => !prev)}
                                            title={lang === 'id' ? 'Tampilkan atau sembunyikan tugas yang sempat dihapus di Google Calendar' : 'Toggle tasks deleted from Google Calendar'}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer backdrop-blur-sm shadow-sm ${
                                                showDeletedGCal
                                                    ? 'bg-red-950/60 text-red-300 border-red-500/80 ring-1 ring-red-500/50'
                                                    : 'bg-[#1C1B0E] text-muted-foreground border-[#3B3929] hover:border-red-500/40 hover:text-red-300'
                                            }`}
                                        >
                                            <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                                            <span>{lang === 'id' ? 'Dihapus di G-Cal' : 'G-Cal Deleted'} ({deletedGCalCount})</span>
                                        </button>
                                    )}
                                </>
                            )}

                            {canExportReports ? (
                                <button
                                    type="button"
                                    onClick={() => setExportModalOpen(true)}
                                    title={t('tooltip_export_calendar_pdf') || 'Export Calendar Schedule to PDF'}
                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#1C1B0E] text-[#FAFAFA] border border-[#C9AA71]/50 hover:bg-[#C9AA71]/15 hover:border-[#C9AA71] transition-all hover:scale-105 cursor-pointer backdrop-blur-sm shadow-sm"
                                >
                                    <FileText className="h-3.5 w-3.5 text-[#C9AA71]" />
                                    <span>{t('export_pdf') || 'Export PDF'}</span>
                                </button>
                            ) : (
                                <div 
                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#1C1B0E] text-[#A19F8D]/50 border border-[#3B3929] cursor-not-allowed select-none backdrop-blur-sm shadow-sm"
                                    title={lang === 'id' ? 'Izin export laporan dinonaktifkan oleh Administrator' : 'Report export disabled by Administrator'}
                                >
                                    <FileText className="h-3.5 w-3.5 opacity-40" />
                                    <span>{t('export_pdf') || 'Export PDF'} ({lang === 'id' ? 'Dibatasi' : 'Restricted'})</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Summary KPI Mini-cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-6">
                        {[
                            { label: t('total_work') || 'Total Tugas', value: totalTasks, Icon: ClipboardList, color: '#C9AA71' },
                            { label: t('active_work') || 'Tugas Aktif', value: activeTasks, Icon: Clock, color: '#F59E0B' },
                            { label: t('done_work') || 'Tugas Selesai', value: doneTasks, Icon: CheckCircle2, color: '#10B981' },
                        ].map(({ label, value, Icon, color }) => (
                            <div key={label} className="rounded-xl p-4 border border-[#3B3929] bg-[#2A281E]/80 backdrop-blur-md shadow-md"
                                style={{ borderTop: `3px solid ${color}` }}>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <Icon className="h-4 w-4" style={{ color }} />
                                    <span className="text-xs text-[#A19F8D] font-semibold">{label}</span>
                                </div>
                                <p className="text-2xl font-extrabold text-[#FAFAFA]">{value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Loading / Error */}
                    {loading && (
                        <div className="flex items-center justify-center py-20 gap-3 text-[#A19F8D]">
                            <Loader2 className="h-6 w-6 animate-spin text-[#C9AA71]" />
                            <span className="text-sm font-medium">{t('loading_dept_data') || 'Memuat jadwal resort...'}</span>
                        </div>
                    )}
                    {error && !loading && (
                        <div className="rounded-xl p-4 mb-4 text-sm bg-red-950/40 text-red-200 border border-red-500/40">
                            ⚠️ {error}
                        </div>
                    )}

                    {/* Calendar Component: Drag to Select & Multi-Range Rendering */}
                    {!loading && (
                        <OperationsCalendarView
                            tasks={filteredTasks}
                            allDepartments={ALL_DEPARTMENTS}
                            selectedDepartments={selectedDepartments}
                            onDepartmentFilterChange={setSelectedDepartments}
                            theme={{ bg: '#C9AA71', text: '#1C1B0E' }}
                            onMarkDone={handleMarkDone}
                            onDelete={handleDelete}
                            onPreviewImage={handlePreview}
                            onAddWorkWithDate={(dateStr) => {
                                setModalDates({ start: dateStr, end: dateStr });
                                setAddModalOpen(true);
                            }}
                            onAddWorkWithDateRange={(startDate, endDate) => {
                                setModalDates({ start: startDate, end: endDate });
                                setAddModalOpen(true);
                            }}
                            t={t}
                            lang={lang}
                            searchQuery={searchQuery}
                            onClearSearch={() => setSearchQuery('')}
                            targetDateStr={targetDateStr}
                            highlightTaskId={highlightTaskId}
                            highlightedDates={highlightedDates}
                            onClearHighlight={() => {
                                setHighlightedDates([]);
                                setHighlightTaskId(null);
                            }}
                        />
                    )}
                </div>
            </div>

            {addModalOpen && (
                <CalendarAddWorkModal
                    initialStartDate={modalDates.start}
                    initialEndDate={modalDates.end}
                    initialDept={isDeptUser && userDept ? userDept : ALL_DEPARTMENTS[0]}
                    lockedDept={isDeptUser && userDept ? userDept : null}
                    prefillCreatedBy={isDeptUser && staffName ? staffName : ''}
                    onClose={() => setAddModalOpen(false)}
                    onSuccess={(item) => {
                        setTasks(prev => [item, ...prev]);
                        setAddModalOpen(false);
                        reload(true);
                    }}
                    t={t}
                    lang={lang}
                />
            )}

            {/* Photo Lightbox */}
            <ImageLightboxModal
                open={!!previewImage}
                onClose={() => setPreviewImage(null)}
                src={previewImage?.src}
                title={previewImage?.title}
                subtitle={previewImage?.subtitle}
            />

            {/* Calendar Schedule PDF Export Modal */}
            <ExportCalendarPdfModal
                open={exportModalOpen}
                onOpenChange={setExportModalOpen}
                tasks={tasks}
            />

            <MobileBottomNav currentTab="calendar" />
        </div>
    );
}
