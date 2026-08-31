import { Head } from '@inertiajs/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Briefcase, Plus, RefreshCw, X, CheckCircle2, Clock,
    PauseCircle, Filter, CalendarRange, MapPin, User,
    ClipboardList, Loader2, Trash2, Edit2,
    CheckCheck, Building2, Tag, ArrowRight, ZoomIn,
    Layers, Check, ChevronDown, ChevronLeft, ChevronRight, Calendar, Sparkles
} from 'lucide-react';
import { CampusFixHeader } from '@/Components/CampusFix/CampusFixHeader';
import { IssuesProvider } from '@/context/IssuesContext';
import { useLanguage } from '@/context/LanguageContext';
import { ImageDropzone } from '@/Components/CampusFix/ImageDropzone';
import { ImageLightboxModal } from '@/Components/CampusFix/ImageLightboxModal';
import { ALL_DEPARTMENTS } from '@/constants/staff';
import { getDepartmentTheme } from '@/constants/departments';

const MAIN_LOCATIONS = ['TPI', 'TBR', 'Kantor'];

export default function Operations() {
    return (
        <IssuesProvider>
            <OperationsInner />
        </IssuesProvider>
    );
}

function parseDateOnly(str) {
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

function formatDate(str, lang = 'id') {
    if (!str) return '';
    try { 
        return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { day:'2-digit', month:'short', year:'numeric' }).format(new Date(str)); 
    } catch { return str; }
}

function formatDateTime(str, lang = 'id') {
    if (!str) return '';
    try { 
        return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(str)); 
    } catch { return str; }
}

function getStatusLabel(s, t) {
    const map = {
        active: t('status_active') || 'Aktif',
        done: t('done_work') || 'Selesai',
        open: t('needs_fixing') || 'Perlu Perbaikan',
        progress: t('in_progress') || 'Dalam Proses',
        pending: t('pending') || 'Tertunda',
        solved: t('resolved') || 'Selesai',
    };
    return map[s] || s;
}

function useDeptTheme(dept) {
    const theme = getDepartmentTheme(dept);
    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--ops-accent', theme.bg);
        root.style.setProperty('--ops-accent-text', theme.text);
        return () => {
            root.style.removeProperty('--ops-accent');
            root.style.removeProperty('--ops-accent-text');
        };
    }, [theme.bg, theme.text]);
    return theme;
}

function useOpsData(dept, selectedSheets = []) {
    const [manual, setManual] = useState([]);
    const [issues, setIssues] = useState([]);
    const [availableSheets, setAvailableSheets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const abortRef = useRef(null);
    const clientCacheRef = useRef({});
    const reqIdRef = useRef(0);

    const sheetsParam = selectedSheets.length > 0 ? selectedSheets.join(',') : 'all';
    const cacheKey = `${dept}__${sheetsParam}`;

    const load = useCallback(async (force = false, silent = false) => {
        if (!dept) return;

        const currentReqId = ++reqIdRef.current;

        if (!silent) {
            // 1. Instant Cache Check: If already loaded before, show in 0ms immediately!
            if (!force && clientCacheRef.current[cacheKey]) {
                const cached = clientCacheRef.current[cacheKey];
                setManual(cached.manual || []);
                setIssues(cached.issues || []);
                if (cached.availableSheets) setAvailableSheets(cached.availableSheets);
                setLoading(false);
                setError(null);
            } else {
                // Instantly clear items from old department so they NEVER leak/ghost into the new one!
                setManual([]);
                setIssues([]);
                setLoading(true);
                setError(null);
            }
        }

        if (abortRef.current) abortRef.current.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        try {
            const res = await fetch(`/api/operations?dept=${encodeURIComponent(dept)}&sheets=${encodeURIComponent(sheetsParam)}${force ? '&refresh=1' : ''}`, { signal: ctrl.signal });
            const json = await parseResponseSafeJson(res);

            // Ignore stale response if user already clicked another department rapidly
            if (currentReqId !== reqIdRef.current) return;

            if (json.success) {
                const newManual = json.manual || [];
                const newIssues = json.issues || [];
                const newSheets = json.availableSheets || [];

                // Store in fast client memory cache
                clientCacheRef.current[cacheKey] = {
                    manual: newManual,
                    issues: newIssues,
                    availableSheets: newSheets
                };

                // Seamless delta update: Only trigger state update if data actually changed
                setManual(prev => {
                    if (prev && JSON.stringify(prev) === JSON.stringify(newManual)) return prev;
                    return newManual;
                });
                setIssues(prev => {
                    if (prev && JSON.stringify(prev) === JSON.stringify(newIssues)) return prev;
                    return newIssues;
                });
                if (newSheets.length > 0) {
                    setAvailableSheets(prev => {
                        if (prev && JSON.stringify(prev) === JSON.stringify(newSheets)) return prev;
                        return newSheets;
                    });
                }
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
    }, [dept, sheetsParam, cacheKey]);

    // Initial load
    useEffect(() => { load(); }, [load]);

    // ─── Real-Time Multi-Device Sync ──────────────────────────────────────────
    useEffect(() => {
        // 1. Background poll every 5 seconds silently (forces fresh data from server)
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                load(true, true);
            }
        }, 5000);

        // 2. Auto-sync immediately when switching window / tab back into focus
        const handleFocus = () => {
            if (document.visibilityState === 'visible') {
                load(true, true);
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

    return { manual, setManual, issues, availableSheets, loading, error, reload: (f = false) => load(f) };
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

// ─── Multi-Sheet Dropdown Selector ────────────────────────────────────────────
function MultiSheetSelector({ availableSheets, selectedSheets, onChange, theme, t }) {
    const [open, setOpen] = useState(false);
    const popoverRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const isAllSelected = selectedSheets.length === 0 || selectedSheets.length === availableSheets.length;

    const handleToggleAll = () => {
        onChange([]);
    };

    const handleToggleSheet = (sheet) => {
        if (isAllSelected) {
            onChange([sheet]);
        } else {
            if (selectedSheets.includes(sheet)) {
                const next = selectedSheets.filter(s => s !== sheet);
                onChange(next);
            } else {
                const next = [...selectedSheets, sheet];
                if (next.length === availableSheets.length) {
                    onChange([]);
                } else {
                    onChange(next);
                }
            }
        }
    };

    let label = `${t('all_sheets')} (${availableSheets.length})`;
    if (!isAllSelected && selectedSheets.length > 0) {
        if (selectedSheets.length === 1) {
            label = selectedSheets[0];
        } else {
            label = `${selectedSheets.join(', ')} (${selectedSheets.length} ${t('combined_sheets')})`;
        }
    }

    return (
        <div className="relative inline-block" ref={popoverRef}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#2A281E] border border-[#3B3929] text-[#FAFAFA] hover:border-[#C9AA71]/60 transition-all cursor-pointer shadow-xs"
            >
                <Layers className="h-3.5 w-3.5 text-[#C9AA71]" />
                <span className="max-w-[200px] truncate">{label}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-[#A19F8D] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-56 rounded-xl border border-[#3B3929] bg-[#2A281E] p-2 shadow-2xl backdrop-blur-xl animate-fade-in">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#A19F8D] px-2 py-1 mb-1">
                        {t('select_sheets')}
                    </div>

                    <button
                        type="button"
                        onClick={handleToggleAll}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left transition-colors hover:bg-[#3B3929]/60 cursor-pointer"
                        style={{ color: isAllSelected ? '#C9AA71' : '#FAFAFA' }}
                    >
                        <span>{t('all_sheets')}</span>
                        {isAllSelected && <Check className="h-3.5 w-3.5 text-[#C9AA71]" />}
                    </button>

                    <div className="h-px bg-[#3B3929] my-1" />

                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                        {availableSheets.map(sheet => {
                            const isChecked = isAllSelected || selectedSheets.includes(sheet);
                            return (
                                <button
                                    key={sheet}
                                    type="button"
                                    onClick={() => handleToggleSheet(sheet)}
                                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors hover:bg-[#3B3929]/60 cursor-pointer"
                                    style={{ color: isChecked ? '#FAFAFA' : '#A19F8D' }}
                                >
                                    <span className="truncate">{sheet}</span>
                                    {isChecked && (
                                        <Check className="h-3.5 w-3.5 text-[#C9AA71]" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Clickable Date Picker Input Component ────────────────────────────────────
function DatePickerInput({ label, value, min, onChange }) {
    const inputRef = useRef(null);

    const handleOpenPicker = (e) => {
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
            <label className="block text-xs font-semibold text-[#FAFAFA] mb-1">{label}</label>
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
            </div>
        </div>
    );
}

// ─── Shared Form Fields ───────────────────────────────────────────────────────
function WorkFormFields({ form, set, t }) {
    const todayStr = new Date().toISOString().split('T')[0];

    const handleLocMainClick = (loc) => {
        const isSelected = form.locMain === loc;
        const newMain = isSelected ? '' : loc;
        set('locMain', newMain);
        
        const detail = form.locDetail?.trim() || '';
        const combined = newMain ? (detail ? `${newMain} - ${detail}` : newMain) : detail;
        set('location', combined);
    };

    const handleLocDetailChange = (e) => {
        const detail = e.target.value;
        set('locDetail', detail);

        const main = form.locMain || '';
        const combined = main ? (detail.trim() ? `${main} - ${detail.trim()}` : main) : detail.trim();
        set('location', combined);
    };

    const handleStartDateChange = (e) => {
        const newStart = e.target.value;
        set('startDate', newStart);
        if (form.endDate && newStart && form.endDate < newStart) {
            set('endDate', newStart);
        }
    };

    return (
        <>
            <div>
                <label className="block text-xs font-semibold text-[#FAFAFA] mb-1">
                    {t('work_title')} <span className="text-red-400">*</span>
                </label>
                <input value={form.title} onChange={e => set('title', e.target.value)}
                    placeholder={t('work_title_placeholder')}
                    className="w-full rounded-lg border border-[#3B3929] bg-[#1C1B0E] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#A19F8D]/60 focus:border-[#C9AA71] focus:outline-none transition-colors" />
            </div>
            <div>
                <label className="block text-xs font-semibold text-[#FAFAFA] mb-1">{t('work_desc')}</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
                    placeholder={t('work_desc_placeholder')}
                    className="w-full rounded-lg border border-[#3B3929] bg-[#1C1B0E] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#A19F8D]/60 resize-none focus:border-[#C9AA71] focus:outline-none transition-colors" />
            </div>
            
            {/* Location selector with TPI / TBR / Kantor + specific detail */}
            <div>
                <label className="block text-xs font-semibold text-[#FAFAFA] mb-1.5">{t('work_location')}</label>
                <div className="flex gap-2 mb-2">
                    {MAIN_LOCATIONS.map(loc => {
                        const isSelected = form.locMain === loc;
                        return (
                            <button
                                key={loc}
                                type="button"
                                onClick={() => handleLocMainClick(loc)}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                                    isSelected
                                        ? 'bg-[#C9AA71] text-[#1C1B0E] border-[#C9AA71] shadow-md scale-[1.02]'
                                        : 'bg-[#1C1B0E] text-[#A19F8D] border-[#3B3929] hover:text-[#FAFAFA] hover:border-[#C9AA71]/50'
                                }`}
                            >
                                {loc}
                            </button>
                        );
                    })}
                </div>
                <input 
                    value={form.locDetail || ''} 
                    onChange={handleLocDetailChange}
                    placeholder={form.locMain ? `${t('specific_location_in')} ${form.locMain}… (${t('work_location_placeholder')})` : t('work_location_placeholder')}
                    className="w-full rounded-lg border border-[#3B3929] bg-[#1C1B0E] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#A19F8D]/60 focus:border-[#C9AA71] focus:outline-none transition-colors" 
                />
            </div>

            {/* Clickable Calendar Popup Date Fields (Min Today) */}
            <div className="grid grid-cols-2 gap-3">
                <DatePickerInput
                    label={t('start_date')}
                    value={form.startDate}
                    min={todayStr}
                    onChange={handleStartDateChange}
                />
                <DatePickerInput
                    label={t('end_date')}
                    value={form.endDate}
                    min={form.startDate || todayStr}
                    onChange={e => set('endDate', e.target.value)}
                />
            </div>

            <div>
                <label className="block text-xs font-semibold text-[#FAFAFA] mb-1.5">{t('photo_optional')}</label>
                <ImageDropzone 
                    previewUrl={form.photoPreview}
                    onChange={(file, preview) => {
                        set('photoFile', file);
                        set('photoPreview', preview);
                        if (!file && !preview) {
                            set('photoUrl', '');
                        }
                    }}
                    label={t('photo_optional')}
                    maxMb={10}
                />
            </div>
            <div>
                <label className="block text-xs font-semibold text-[#FAFAFA] mb-1">{t('notes')}</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
                    placeholder={t('notes_placeholder')}
                    className="w-full rounded-lg border border-[#3B3929] bg-[#1C1B0E] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#A19F8D]/60 resize-none focus:border-[#C9AA71] focus:outline-none transition-colors" />
            </div>
        </>
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
                        <IconComponent className="h-5 w-5" style={{ color: theme.text }} />
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

// ─── Add Work Modal ───────────────────────────────────────────────────────────
function AddWorkModal({ dept, theme, initialStartDate = '', onClose, onSuccess, t }) {
    const emptyForm = { 
        title: '', 
        description: '', 
        locMain: '',
        locDetail: '',
        location: '', 
        photoFile: null, 
        photoPreview: null, 
        startDate: initialStartDate || '', 
        endDate: initialStartDate || '', 
        notes: '' 
    };
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.title.trim()) { setErr(t('work_title') + ' is required'); return; }
        setSaving(true); setErr('');
        try {
            const fd = new FormData();
            fd.append('dept', dept);
            fd.append('title', form.title);
            fd.append('description', form.description || '');
            fd.append('location', form.location || '');
            fd.append('startDate', form.startDate || '');
            fd.append('endDate', form.endDate || '');
            fd.append('notes', form.notes || '');
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
                    title: form.title,
                    description: form.description,
                    location: form.location,
                    photoUrl: json.photoUrl || form.photoPreview || '',
                    startDate: form.startDate,
                    endDate: form.endDate,
                    notes: form.notes,
                    dept,
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    completedAt: ''
                });
            } else { setErr(json.message || 'Error saving'); }
        } catch (e2) { setErr(e2.message); }
        finally { setSaving(false); }
    };

    return (
        <ModalShell title={`${t('add_work_for')} ${dept}`} IconComponent={Plus} theme={theme} onClose={onClose}>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {err && <p className="text-xs text-red-300 bg-red-950/40 border border-red-500/40 rounded-lg px-3 py-2">{err}</p>}
                <WorkFormFields form={form} set={set} t={t} />
                <div className="flex gap-3 pt-3">
                    <button type="button" onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-[#3B3929] text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#3B3929]/50 transition-all cursor-pointer">
                        {t('cancel')}
                    </button>
                    <button type="submit" disabled={saving}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                        style={{ background: theme.bg, color: theme.text }}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Plus className="h-4 w-4"/>}
                        {saving ? t('saving') : t('save_work')}
                    </button>
                </div>
            </form>
        </ModalShell>
    );
}

// ─── Edit Work Modal ──────────────────────────────────────────────────────────
function EditWorkModal({ item, dept, theme, onClose, onSuccess, t }) {
    const rawLoc = item.location || '';
    let initialMain = '';
    let initialDetail = rawLoc;
    if (rawLoc.startsWith('TPI - ')) {
        initialMain = 'TPI';
        initialDetail = rawLoc.replace('TPI - ', '');
    } else if (rawLoc.startsWith('TBR - ')) {
        initialMain = 'TBR';
        initialDetail = rawLoc.replace('TBR - ', '');
    } else if (rawLoc.startsWith('Kantor - ')) {
        initialMain = 'Kantor';
        initialDetail = rawLoc.replace('Kantor - ', '');
    } else if (['TPI', 'TBR', 'Kantor'].includes(rawLoc.trim())) {
        initialMain = rawLoc.trim();
        initialDetail = '';
    }

    const [form, setForm] = useState({
        title: item.title||'', 
        description: item.description||'', 
        locMain: initialMain,
        locDetail: initialDetail,
        location: item.location||'',
        photoFile: null, 
        photoPreview: item.photoUrl||null, 
        photoUrl: item.photoUrl||'',
        startDate: item.startDate||'', 
        endDate: item.endDate||'',
        notes: item.notes||'',
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true); setErr('');
        try {
            const fd = new FormData();
            fd.append('dept', dept);
            fd.append('title', form.title);
            fd.append('description', form.description || '');
            fd.append('location', form.location || '');
            fd.append('startDate', form.startDate || '');
            fd.append('endDate', form.endDate || '');
            fd.append('notes', form.notes || '');
            if (form.photoFile) {
                fd.append('photo', form.photoFile);
            } else if (form.photoUrl) {
                fd.append('photoUrl', form.photoUrl);
            }

            const res = await fetch(`/api/operations/${item.rowIndex}`, {
                method: 'POST',
                headers: { 'X-CSRF-TOKEN': getCsrfToken() },
                body: fd,
            });
            const json = await parseResponseSafeJson(res);
            if (json.success) {
                onSuccess({
                    id: item.id,
                    ...form,
                    photoUrl: json.photoUrl !== undefined ? json.photoUrl : (form.photoPreview || form.photoUrl)
                });
            } else { setErr(json.message || 'Error saving'); }
        } catch (e2) { setErr(e2.message); }
        finally { setSaving(false); }
    };

    return (
        <ModalShell title={t('edit_work')} IconComponent={Edit2} theme={theme} onClose={onClose}>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {err && <p className="text-xs text-red-300 bg-red-950/40 border border-red-500/40 rounded-lg px-3 py-2">{err}</p>}
                <WorkFormFields form={form} set={set} t={t} />
                <div className="flex gap-3 pt-3">
                    <button type="button" onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-[#3B3929] text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#3B3929]/50 transition-all cursor-pointer">
                        {t('cancel')}
                    </button>
                    <button type="submit" disabled={saving}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                        style={{ background: theme.bg, color: theme.text }}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <CheckCheck className="h-4 w-4"/>}
                        {saving ? t('saving') : t('save_changes')}
                    </button>
                </div>
            </form>
        </ModalShell>
    );
}

function getTimeRemainingBadge(startDate, endDate, isDone, t) {
    if (isDone) {
        return {
            label: t('done_work'),
            icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
            className: 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
        };
    }
    if (!endDate && !startDate) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (endDate) {
        const end = new Date(endDate);
        end.setHours(0, 0, 0, 0);
        const diffDays = Math.round((end - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return {
                label: `${Math.abs(diffDays)} ${t('days_overdue')}`,
                icon: <Clock className="h-3.5 w-3.5 text-red-400" />,
                className: 'bg-red-950/70 border-red-500/50 text-red-300 animate-pulse'
            };
        }
        if (diffDays === 0) {
            return {
                label: t('due_today'),
                icon: <Clock className="h-3.5 w-3.5 text-amber-400" />,
                className: 'bg-amber-950/70 border-amber-500/50 text-amber-300'
            };
        }
        return {
            label: `${diffDays} ${diffDays === 1 ? t('day_remaining') : t('days_remaining')}`,
            icon: <Clock className="h-3.5 w-3.5 text-blue-400" />,
            className: 'bg-blue-950/60 border-blue-500/40 text-blue-300'
        };
    }

    if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const diffStart = Math.round((start - today) / (1000 * 60 * 60 * 24));
        if (diffStart > 0) {
            return {
                label: `${t('starts_in')} ${diffStart} ${t('days') || 'hari'}`,
                icon: <CalendarRange className="h-3.5 w-3.5 text-purple-400" />,
                className: 'bg-purple-950/60 border-purple-500/40 text-purple-300'
            };
        }
    }

    return null;
}

// ─── Timeline Calendar Popover Component ──────────────────────────────────────
function TimelineCalendarPopover({ startDate, endDate, isDone, t, lang }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isPinned, setIsPinned] = useState(false);
    const popoverRef = useRef(null);

    const sDate = parseDateOnly(startDate);
    const eDate = parseDateOnly(endDate);

    const initialDate = sDate || eDate || new Date();
    const [currentMonth, setCurrentMonth] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));

    useEffect(() => {
        if (sDate) {
            setCurrentMonth(new Date(sDate.getFullYear(), sDate.getMonth(), 1));
        } else if (eDate) {
            setCurrentMonth(new Date(eDate.getFullYear(), eDate.getMonth(), 1));
        }
    }, [startDate, endDate]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target)) {
                setIsPinned(false);
                setIsOpen(false);
            }
        };
        if (isPinned) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isPinned]);

    const activeShow = isOpen || isPinned;

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const monthName = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { month: 'long', year: 'numeric' }).format(currentMonth);

    // Days in current month
    const totalDays = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun ... 6 = Sat

    const dayHeaders = lang === 'id' 
        ? ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'] 
        : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const handlePrevMonth = (e) => {
        e.stopPropagation();
        setCurrentMonth(new Date(year, month - 1, 1));
    };

    const handleNextMonth = (e) => {
        e.stopPropagation();
        setCurrentMonth(new Date(year, month + 1, 1));
    };

    // Calculate duration
    let durationText = '';
    if (sDate && eDate) {
        const diffMs = Math.abs(eDate - sDate);
        const days = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
        durationText = `${days} ${t('days') || 'Hari'} (${formatDate(startDate, lang)} – ${formatDate(endDate, lang)})`;
    } else if (sDate) {
        durationText = `${t('start_date')}: ${formatDate(startDate, lang)}`;
    } else if (eDate) {
        durationText = `${t('end_date')}: ${formatDate(endDate, lang)}`;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cells = [];
    for (let i = 0; i < firstDayIndex; i++) {
        cells.push({ key: `blank-${i}`, blank: true });
    }
    for (let d = 1; d <= totalDays; d++) {
        const cellDate = new Date(year, month, d);
        cellDate.setHours(0, 0, 0, 0);

        const isStart = sDate && cellDate.getTime() === sDate.getTime();
        const isEnd = eDate && cellDate.getTime() === eDate.getTime();
        const isInRange = sDate && eDate && cellDate >= sDate && cellDate <= eDate;
        const isSingleSelected = (isStart && !eDate) || (isEnd && !sDate) || (isStart && isEnd);
        const isTodayCell = cellDate.getTime() === today.getTime();

        cells.push({
            key: `day-${d}`,
            dayNum: d,
            isStart,
            isEnd,
            isInRange,
            isSingleSelected,
            isTodayCell,
            blank: false,
        });
    }

    return (
        <div 
            className="relative inline-block"
            ref={popoverRef}
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
        >
            {/* Clickable / Hoverable Trigger Pill */}
            <div 
                onClick={(e) => {
                    e.stopPropagation();
                    setIsPinned(p => !p);
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2A281E] border transition-all cursor-pointer shadow-xs group ${
                    activeShow ? 'border-[#C9AA71] bg-[#353326] shadow-md scale-[1.02]' : 'border-white/10 hover:border-[#C9AA71]/60 hover:bg-[#353326]/60'
                }`}
                title="Hover atau klik untuk melihat kalender visual rentang tanggal"
            >
                <div className="flex items-center gap-1.5 text-[#FAFAFA]">
                    <CalendarRange className={`h-4 w-4 transition-colors ${activeShow ? 'text-[#C9AA71]' : 'text-[#C9AA71] group-hover:text-[#FAFAFA]'}`} />
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#A19F8D]">
                        {t('timeline_schedule')}:
                    </span>
                    <span className="font-bold text-[#E3D1AA]">
                        {startDate ? formatDate(startDate, lang) : (t('not_specified') || '-')}
                    </span>
                </div>

                <ArrowRight className="h-3.5 w-3.5 text-[#C9AA71] opacity-70" />

                <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#FAFAFA]">
                        {endDate ? formatDate(endDate, lang) : (t('not_specified') || '-')}
                    </span>
                </div>
            </div>

            {/* Floating Calendar Popover */}
            {activeShow && (
                <div 
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 bottom-full mb-2 z-50 w-72 sm:w-80 rounded-2xl border border-[#C9AA71]/40 bg-[#1E1D13] p-3.5 shadow-2xl backdrop-blur-2xl animate-fade-in text-[#FAFAFA]"
                    style={{
                        boxShadow: '0 20px 40px rgba(0,0,0,0.8), 0 0 25px rgba(201,170,113,0.2)'
                    }}
                >
                    {/* Header with Month Navigation */}
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#3B3929]">
                        <button
                            type="button"
                            onClick={handlePrevMonth}
                            className="p-1 rounded-lg hover:bg-white/10 text-[#A19F8D] hover:text-[#FAFAFA] transition-colors cursor-pointer"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-xs font-black tracking-widest uppercase text-[#C9AA71]">
                            {monthName}
                        </span>
                        <button
                            type="button"
                            onClick={handleNextMonth}
                            className="p-1 rounded-lg hover:bg-white/10 text-[#A19F8D] hover:text-[#FAFAFA] transition-colors cursor-pointer"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Day of week headers */}
                    <div className="grid grid-cols-7 gap-1 text-center mb-1 text-[10px] font-bold text-[#A19F8D] uppercase">
                        {dayHeaders.map((dh, idx) => (
                            <div key={idx} className={`py-0.5 ${idx === 0 || idx === 6 ? 'text-amber-300/80' : ''}`}>{dh}</div>
                        ))}
                    </div>

                    {/* Day Cells Grid */}
                    <div className="grid grid-cols-7 gap-y-1 text-center">
                        {cells.map((c) => {
                            if (c.blank) {
                                return <div key={c.key} className="h-7" />;
                            }

                            let cellClasses = 'h-7 flex items-center justify-center text-xs font-semibold transition-all relative ';
                            let innerTextClasses = '';

                            if (c.isSingleSelected) {
                                cellClasses += 'bg-[#C9AA71] text-[#1C1B0E] font-black rounded-lg shadow-md z-10 scale-105';
                                innerTextClasses = 'text-[#1C1B0E] font-black';
                            } else if (c.isStart) {
                                cellClasses += 'bg-[#C9AA71] text-[#1C1B0E] font-black rounded-l-lg shadow-sm z-10';
                                innerTextClasses = 'text-[#1C1B0E] font-black';
                            } else if (c.isEnd) {
                                cellClasses += 'bg-[#C9AA71] text-[#1C1B0E] font-black rounded-r-lg shadow-sm z-10';
                                innerTextClasses = 'text-[#1C1B0E] font-black';
                            } else if (c.isInRange) {
                                cellClasses += 'bg-[#C9AA71]/35 text-[#FAFAFA] font-bold';
                                innerTextClasses = 'text-white font-bold';
                            } else if (c.isTodayCell) {
                                cellClasses += 'ring-1.5 ring-[#C9AA71] text-[#FAFAFA] font-bold rounded-lg bg-white/5';
                            } else {
                                cellClasses += 'text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-white/5 rounded-md';
                            }

                            return (
                                <div key={c.key} className={cellClasses}>
                                    <span className={innerTextClasses}>{c.dayNum}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Bottom Summary Bar */}
                    {durationText && (
                        <div className="mt-3 pt-2.5 border-t border-[#3B3929] flex items-center justify-between text-[11px]">
                            <span className="text-[#E3D1AA] font-bold flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-[#C9AA71]" />
                                {durationText}
                            </span>
                            {isPinned && (
                                <button
                                    type="button"
                                    onClick={() => { setIsPinned(false); setIsOpen(false); }}
                                    className="text-[10px] text-[#A19F8D] hover:text-white underline cursor-pointer"
                                >
                                    {t('close') || 'Tutup'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Manual Work Card ─────────────────────────────────────────────────────────
function ManualWorkCard({ item, theme, onMarkDone, onDelete, onEdit, onPreviewImage, t, lang }) {
    const isDone = item.status === 'done';
    const displayImg = item.photoUrl || item.imageUrl || item.photo;
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImgError(false);
    }, [displayImg]);

    const timeBadge = getTimeRemainingBadge(item.startDate, item.endDate, isDone, t);

    return (
        <div className="group rounded-xl border border-[#3B3929] bg-[#2A281E]/95 backdrop-blur-md p-4 sm:p-5 flex flex-col md:flex-row gap-4 transition-all duration-300 hover:border-[#C9AA71]/50 hover:shadow-xl hover:shadow-black/50"
            style={{
                borderLeftWidth:'4px',
                borderLeftColor: isDone ? '#10B981' : theme.bg,
                opacity: isDone ? 0.75 : 1,
            }}>
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-[#1C1B0E] text-[#FAFAFA] border border-white/20 shadow-xs">
                        📋 {t('manual_badge')}
                    </span>
                    {isDone && (
                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                            <CheckCheck className="h-3 w-3"/> {t('done_work')}
                        </span>
                    )}
                </div>
                <h3 className="font-bold text-base sm:text-lg text-[#FAFAFA] mb-1.5 leading-snug group-hover:text-[#C9AA71] transition-colors">{item.title}</h3>
                {item.description && (
                    <p className="text-xs text-[#A19F8D] mb-3 leading-relaxed">{item.description}</p>
                )}
                
                {item.location && (
                    <div className="flex items-center gap-1.5 text-xs text-[#E3D1AA] font-medium mb-3">
                        <MapPin className="h-3.5 w-3.5 text-[#C9AA71] shrink-0"/>
                        <span>{item.location}</span>
                    </div>
                )}

                {/* ─── Prominent High-Visibility Timeline Hub with Visual Calendar Popover ─── */}
                <div className="mt-2 rounded-xl p-3 bg-[#1C1B0E]/90 border border-[#3B3929] flex flex-wrap items-center justify-between gap-3 shadow-inner">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Interactive Calendar Popover on Hover / Click */}
                        <TimelineCalendarPopover 
                            startDate={item.startDate} 
                            endDate={item.endDate} 
                            isDone={isDone}
                            t={t} 
                            lang={lang} 
                        />

                        {/* Status / Countdown Badge */}
                        {timeBadge && (
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 shadow-sm ${timeBadge.className}`}>
                                {timeBadge.icon}
                                <span>{timeBadge.label}</span>
                            </span>
                        )}
                    </div>

                    {/* Creation & Completion Timestamps */}
                    <div className="flex items-center gap-3 text-xs text-[#A19F8D]">
                        {item.createdAt && (
                            <span className="flex items-center gap-1 text-[11px]">
                                <Clock className="h-3 w-3 opacity-60" /> {t('created_at')} {formatDateTime(item.createdAt, lang)}
                            </span>
                        )}
                        {isDone && item.completedAt && (
                            <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[11px] bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-500/30">
                                <CheckCircle2 className="h-3 w-3" /> {t('completed_at')} {formatDateTime(item.completedAt, lang)}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {displayImg && !imgError && (
                <div 
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden shrink-0 bg-[#1C1B0E] border border-[#3B3929] relative group/thumb cursor-pointer shadow-md self-start"
                    onClick={() => onPreviewImage?.(displayImg, item.title, `${t('manual_badge')} — ${item.department || ''}`)}
                    title="Zoom"
                >
                    <img 
                        src={displayImg} 
                        alt="foto" 
                        className="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform duration-300"
                        onError={() => setImgError(true)} 
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="p-1.5 rounded-md bg-black/70 text-white border border-white/20">
                            <ZoomIn className="w-4 h-4 text-[#C9AA71]" />
                        </span>
                    </div>
                </div>
            )}

            {!isDone && (
                <div className="flex md:flex-col gap-1.5 shrink-0 justify-center">
                    <button type="button" onClick={() => onMarkDone(item)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/80 border border-emerald-500/40 transition-all hover:scale-105 cursor-pointer shadow-sm">
                        <CheckCheck className="h-3.5 w-3.5"/> {t('mark_done')}
                    </button>
                    <button type="button" onClick={() => onEdit(item)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[#FAFAFA] bg-[#1C1B0E] hover:bg-[#3B3929] border border-[#3B3929] transition-all hover:scale-105 cursor-pointer shadow-sm">
                        <Edit2 className="h-3.5 w-3.5 text-[#C9AA71]"/> {t('edit')}
                    </button>
                    <button type="button" onClick={() => onDelete(item)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-red-300 bg-red-950/50 hover:bg-red-900/80 border border-red-500/40 transition-all hover:scale-105 cursor-pointer shadow-sm">
                        <Trash2 className="h-3.5 w-3.5"/> {t('delete')}
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Issue Work Card ──────────────────────────────────────────────────────────
function IssueWorkCard({ item, theme, onPreviewImage, t, lang }) {
    const [imgError, setImgError] = useState(false);

    const scMap = {
        open:     { bg:'rgba(245, 158, 11, 0.15)', text:'#FCD34D', border:'rgba(245, 158, 11, 0.4)' },
        progress: { bg:'rgba(59, 130, 246, 0.15)', text:'#93C5FD', border:'rgba(59, 130, 246, 0.4)' },
        pending:  { bg:'rgba(249, 115, 22, 0.15)', text:'#FDBA74', border:'rgba(249, 115, 22, 0.4)' },
    };
    const sc = scMap[item.status] || { bg:'rgba(161, 159, 141, 0.15)', text:'#E5E7EB', border:'rgba(161, 159, 141, 0.4)' };

    const involvedLabels = {
        origin:   { label: t('origin_badge') || 'Asal', color:'#C4B5FD', bg:'rgba(139, 92, 246, 0.2)', border:'rgba(139, 92, 246, 0.4)' },
        assigned: { label: t('assigned_badge') || 'Ditugaskan', color:'#93C5FD', bg:'rgba(59, 130, 246, 0.2)', border:'rgba(59, 130, 246, 0.4)' },
        tagged:   { label: t('tagged_badge') || 'Ditandai', color:'#FDE68A', bg:'rgba(245, 158, 11, 0.2)', border:'rgba(245, 158, 11, 0.4)' },
    };

    const statusBorderColors = {
        open: '#F59E0B',
        progress: '#3B82F6',
        pending: '#F97316',
    };
    const leftColor = statusBorderColors[item.status] || '#C9AA71';

    const displayImg = (item.status === 'pending' && item.pendingImageUrl)
        ? item.pendingImageUrl
        : (item.imageUrl || (item.pendingTimeline && item.pendingTimeline[item.pendingTimeline.length - 1]?.image));

    return (
        <div className="group rounded-xl border border-[#3B3929] bg-[#2A281E]/95 backdrop-blur-md p-4 sm:p-5 flex flex-col md:flex-row gap-4 transition-all duration-300 hover:border-[#C9AA71]/50 hover:shadow-xl hover:shadow-black/50"
            style={{ borderLeftWidth:'4px', borderLeftColor: leftColor }}>
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-[#1C1B0E] text-[#C9AA71] border border-[#C9AA71]/35 shadow-xs">
                        🔧 {t('issue_badge')}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold"
                        style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                        {getStatusLabel(item.status, t)}
                    </span>
                    {item.sheet && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[#1C1B0E] text-[#A19F8D] border border-white/10">
                            {item.sheet}
                        </span>
                    )}
                    {(item.involvedAs || []).map(role => {
                        const ri = involvedLabels[role];
                        if (!ri) return null;
                        return (
                            <span key={role} className="px-2.5 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1"
                                style={{ background: ri.bg, color: ri.color, border: `1px solid ${ri.border}` }}>
                                {role === 'origin'   && <Building2 className="h-2.5 w-2.5"/>}
                                {role === 'assigned' && <ArrowRight className="h-2.5 w-2.5"/>}
                                {role === 'tagged'   && <Tag className="h-2.5 w-2.5"/>}
                                {ri.label}
                            </span>
                        );
                    })}
                </div>
                <h3 className="font-bold text-base sm:text-lg text-[#FAFAFA] mb-1.5 leading-snug group-hover:text-[#C9AA71] transition-colors">{item.title || '(No title)'}</h3>
                {item.description && (
                    <p className="text-xs text-[#A19F8D] mb-3 leading-relaxed line-clamp-2">{item.description}</p>
                )}
                
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#A19F8D] mb-3">
                    {item.location  && <span className="flex items-center gap-1.5 text-[#E3D1AA] font-medium"><MapPin className="h-3.5 w-3.5 text-[#C9AA71] shrink-0"/>{item.location}</span>}
                    {item.category  && <span className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5 text-[#C9AA71] shrink-0"/>{item.category}</span>}
                    {item.claimedBy && <span className="flex items-center gap-1.5 text-blue-300 font-semibold"><User className="h-3.5 w-3.5 text-blue-400 shrink-0"/>{item.claimedBy}</span>}
                    {item.department && <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-[#C9AA71] shrink-0"/>{t('from_dept')} {item.department}</span>}
                </div>

                {/* ─── Prominent Issue Progress Timeline ─── */}
                <div className="mt-2 rounded-xl p-3 bg-[#1C1B0E]/90 border border-[#3B3929] flex flex-wrap items-center justify-between gap-3 shadow-inner">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        {item.claimedAt ? (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2A281E] border border-white/10 text-xs shadow-xs text-[#FAFAFA]">
                                <Clock className="h-3.5 w-3.5 text-blue-400" />
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#A19F8D]">{t('claimed_at')}:</span>
                                <span className="font-bold text-blue-300">{formatDateTime(item.claimedAt, lang)}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2A281E] border border-white/10 text-xs shadow-xs text-[#FAFAFA]">
                                <Clock className="h-3.5 w-3.5 text-[#C9AA71]" />
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#A19F8D]">{t('created_at')}:</span>
                                <span className="font-bold text-[#E3D1AA]">{formatDateTime(item.submittedAt || item.createdAt, lang) || '-'}</span>
                            </div>
                        )}

                        {item.status === 'pending' && (
                            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-orange-950/70 border border-orange-500/50 text-orange-300 flex items-center gap-1.5 shadow-sm">
                                <PauseCircle className="h-3.5 w-3.5 text-orange-400" />
                                <span>{t('pending')}</span>
                            </span>
                        )}
                    </div>
                </div>

                {/* Nicely formatted pending timeline / reason */}
                {item.status === 'pending' && (
                    <div className="mt-3 rounded-xl p-3 sm:p-4 text-xs bg-orange-950/40 border border-orange-500/35 space-y-2.5 shadow-inner">
                        <div className="flex items-center gap-1.5 text-orange-400 font-bold tracking-wide uppercase text-[11px]">
                            <PauseCircle className="h-4 w-4" />
                            <span>{t('pending_reason_title')}</span>
                        </div>
                        {item.pendingTimeline && item.pendingTimeline.length > 0 ? (
                            item.pendingTimeline.map((tl, i) => (
                                <div key={i} className="flex flex-col sm:flex-row gap-3 sm:items-start justify-between border-t border-orange-500/20 pt-2.5 first:border-t-0 first:pt-0">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className="font-bold text-orange-200">
                                                {tl.by ? `${t('pending_by')} ${tl.by}` : t('pending')}
                                            </span>
                                            {tl.date && (
                                                <span className="text-[10px] text-[#A19F8D] font-mono bg-black/40 px-2 py-0.5 rounded border border-white/10">
                                                    {tl.date}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-orange-100/90 leading-relaxed font-normal whitespace-pre-wrap">
                                            {tl.reason || t('no_reason_provided')}
                                        </p>
                                    </div>
                                    {tl.image && (
                                        <div 
                                            className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-orange-500/40 bg-black/40 cursor-pointer relative group/pimg mt-1 sm:mt-0 shadow-sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPreviewImage?.(tl.image, item.title, `${t('pending_by')} ${tl.by || 'Staff'}`);
                                            }}
                                            title="Zoom"
                                        >
                                            <img src={tl.image} alt="Bukti Pending" className="w-full h-full object-cover group-hover/pimg:scale-110 transition-transform duration-200" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/pimg:opacity-100 flex items-center justify-center transition-opacity">
                                                <ZoomIn className="w-4 h-4 text-[#C9AA71]" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="text-orange-100/90 leading-relaxed">
                                {item.pendingReason || t('no_reason_provided')}
                            </p>
                        )}
                    </div>
                )}
            </div>

            {displayImg && !imgError && (
                <div 
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden shrink-0 bg-[#1C1B0E] border border-[#3B3929] relative group/thumb cursor-pointer shadow-md self-start"
                    onClick={() => onPreviewImage?.(displayImg, item.title, `Issue #${item.id}`)}
                    title="Zoom"
                >
                    <img 
                        src={displayImg} 
                        alt="foto issue" 
                        className="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform duration-300"
                        onError={() => setImgError(true)} 
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="p-1.5 rounded-md bg-black/70 text-white border border-white/20">
                            <ZoomIn className="w-4 h-4 text-[#C9AA71]" />
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Inner ───────────────────────────────────────────────────────────────
function OperationsInner() {
    const { t, lang } = useLanguage();
    const [selectedDept, setSelectedDept] = useState(ALL_DEPARTMENTS[0]);
    const [sourceFilter, setSourceFilter] = useState('all');
    const [selectedSheets, setSelectedSheets] = useState([]);
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);

    // Evaporating & Condensing Transition State
    const [transPhase, setTransPhase] = useState('idle'); // 'idle' | 'evaporating' | 'condensing'
    const [steamParticles, setSteamParticles] = useState([]);
    const transTimerRef = useRef(null);
    const condenseTimerRef = useRef(null);

    const theme = useDeptTheme(selectedDept);
    const { manual, setManual, issues, availableSheets, loading, error, reload } = useOpsData(selectedDept, selectedSheets);

    const handleDeptChange = (dept) => {
        if (dept === selectedDept) return;

        // Clear any previous running timers if user clicks rapidly
        if (transTimerRef.current) clearTimeout(transTimerRef.current);
        if (condenseTimerRef.current) clearTimeout(condenseTimerRef.current);

        const oldTheme = getDepartmentTheme(selectedDept);

        // Generate stylized evaporating steam/vapor particles that drift upwards
        const particles = Array.from({ length: 14 }).map((_, i) => ({
            id: Date.now() + i,
            left: `${5 + (i * 6.8) + (Math.random() * 3 - 1.5)}%`,
            top: `${20 + Math.random() * 40}%`,
            size: `${28 + Math.random() * 45}px`,
            delay: `${Math.random() * 0.08}s`,
            color: oldTheme.bg,
        }));
        setSteamParticles(particles);

        // 1. Trigger Evaporation Phase (smooth snappy dissolve)
        setTransPhase('evaporating');

        // 2. Midpoint (180ms): Switch department and trigger Condensation Phase
        transTimerRef.current = setTimeout(() => {
            setSelectedDept(dept);
            setSourceFilter('all');
            setTransPhase('condensing');

            // 3. Return to Idle once fully materialized
            condenseTimerRef.current = setTimeout(() => {
                setTransPhase('idle');
                setSteamParticles([]);
            }, 300);
        }, 180);
    };

    const isManualOnly = sourceFilter === 'manual';
    const isIssueOnly  = sourceFilter === 'issue';

    const totalWork    = isManualOnly ? manual.length : (isIssueOnly ? issues.length : (manual.length + issues.length));
    const totalActive  = isManualOnly 
        ? manual.filter(m => m.status === 'active').length 
        : (isIssueOnly 
            ? issues.filter(i => ['open','progress'].includes(i.status)).length 
            : (manual.filter(m => m.status === 'active').length + issues.filter(i => ['open','progress'].includes(i.status)).length));
    const totalDone    = isManualOnly 
        ? manual.filter(m => m.status === 'done').length 
        : (isIssueOnly ? 0 : manual.filter(m => m.status === 'done').length);
    const totalPending = isManualOnly 
        ? 0 
        : issues.filter(i => i.status === 'pending').length;

    const shownManual = isIssueOnly  ? [] : manual;
    const shownIssues = isManualOnly ? [] : issues;

    const handleMarkDone = async (item) => {
        try {
            await fetch(`/api/operations/${item.rowIndex}`, {
                method: 'POST',
                headers: { 'Content-Type':'application/json', 'X-CSRF-TOKEN': getCsrfToken() },
                body: JSON.stringify({ dept: selectedDept, status:'done' }),
            });
            setManual(prev => prev.map(m => m.id === item.id ? { ...m, status:'done', completedAt: new Date().toISOString() } : m));
        } catch {}
    };

    const handleDelete = async (item) => {
        if (!confirm(t('confirm_delete_work') || 'Hapus pekerjaan ini?')) return;
        try {
            await fetch(`/api/operations/${item.rowIndex}`, {
                method: 'DELETE',
                headers: { 'Content-Type':'application/json', 'X-CSRF-TOKEN': getCsrfToken() },
                body: JSON.stringify({ dept: selectedDept }),
            });
            setManual(prev => prev.filter(m => m.id !== item.id));
        } catch {}
    };

    const handlePreview = (src, title, subtitle) => {
        setPreviewImage({ src, title, subtitle });
    };

    const stats = [
        { label: t('total_work'),    value: totalWork,    Icon: ClipboardList },
        { label: t('active_work'),   value: totalActive,  Icon: Clock },
        { label: t('done_work'),     value: totalDone,    Icon: CheckCircle2 },
        ...(!isManualOnly ? [{ label: t('pending_work'), value: totalPending, Icon: PauseCircle }] : []),
    ];

    // Evaporating vs Condensing animation class applied to the blocks
    const transitionClass = transPhase === 'evaporating' 
        ? 'animate-evaporate' 
        : transPhase === 'condensing' 
            ? 'animate-condense' 
            : '';

    return (
        <div className="min-h-screen bg-[#1C1B0E] text-[#FAFAFA] relative overflow-hidden antialiased selection:bg-[#C9AA71]/30">
            <Head title={`${t('operations')} — Telunas Resort`} />

            {/* Background Motif Pattern Overlay */}
            <div 
                className="fixed inset-0 pointer-events-none opacity-25 z-0 bg-repeat"
                style={{
                    backgroundImage: "url('/bg-lineart.png')",
                    backgroundSize: '600px',
                }}
            />

            {/* Dynamic Department Ambient Glow */}
            <div 
                className="fixed top-12 left-1/2 -translate-x-1/2 w-[750px] h-[380px] pointer-events-none blur-[160px] opacity-20 rounded-full transition-all duration-700 z-0"
                style={{ backgroundColor: theme.bg }}
            />

            {/* Rising Ethereal Steam / Vapor Wisps during Evaporation */}
            {transPhase !== 'idle' && (
                <div className="pointer-events-none fixed inset-x-0 top-36 bottom-0 overflow-hidden z-30">
                    {steamParticles.map(p => (
                        <div
                            key={p.id}
                            className="absolute rounded-full animate-steam-wisp pointer-events-none"
                            style={{
                                left: p.left,
                                top: p.top,
                                width: p.size,
                                height: p.size,
                                backgroundColor: p.color,
                                boxShadow: `0 0 30px ${p.color}, 0 0 60px rgba(255,255,255,0.45)`,
                                animationDelay: p.delay,
                                opacity: 0.7,
                            }}
                        />
                    ))}
                </div>
            )}

            <div className="relative z-10">
                <CampusFixHeader mode="operations" />

                <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">

                    {/* Department Selector */}
                    <div className="mb-6">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-[#A19F8D] mb-3">
                            {t('select_department')}
                        </h2>
                        <div className="flex flex-wrap gap-2">
                            {ALL_DEPARTMENTS.map((dept) => {
                                const tTheme = getDepartmentTheme(dept);
                                const isSel = dept === selectedDept;
                                const isSecurity = dept.toLowerCase().includes('security') || tTheme.bg === '#212121';
                                return (
                                    <button key={dept} type="button" onClick={() => handleDeptChange(dept)}
                                        className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 cursor-pointer"
                                        style={{
                                            backgroundColor: isSel ? tTheme.bg : (tTheme.unselectedBg || `${tTheme.bg}22`),
                                            color: isSel ? tTheme.text : (isSecurity ? '#FFFFFF' : (tTheme.unselectedText || tTheme.bg)),
                                            border: `1.5px solid ${isSel ? tTheme.bg : (tTheme.unselectedBorder || `${tTheme.bg}44`)}`,
                                            transform: isSel ? 'scale(1.08)' : 'scale(1)',
                                            boxShadow: isSel ? `0 0 0 3px ${tTheme.bg}44, 0 4px 14px ${tTheme.bg}60` : 'none',
                                        }}>
                                        {dept}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Evaporating & Condensing Content Wrapper */}
                    <div className={transitionClass}>

                        {/* Banner */}
                        <div className="rounded-2xl p-5 sm:p-6 mb-6 flex flex-wrap items-center gap-4 justify-between shadow-xl border border-white/10 transition-colors duration-500"
                            style={{
                                background: `linear-gradient(135deg, ${theme.bg}EE, ${theme.bg}99)`,
                            }}>
                            <div>
                                <div className="flex items-center gap-2.5 mb-1.5">
                                    <Briefcase className="h-6 w-6" style={{ color: theme.text }} />
                                    <span className="text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: theme.text }}>
                                        {selectedDept}
                                    </span>
                                </div>
                                <p className="text-sm font-medium opacity-90" style={{ color: theme.text }}>
                                    {totalWork} {t('work_summary_total')} &middot; {totalActive} {t('work_summary_active')} &middot; {totalDone} {t('work_summary_done')}
                                    {!isManualOnly && totalPending > 0 ? ` · ${totalPending} ${t('pending')}` : ''}
                                </p>
                            </div>
                            <div className="flex gap-2.5">
                                <button type="button" onClick={() => reload(true)}
                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all hover:scale-105 cursor-pointer backdrop-blur-sm"
                                    style={{ background:`${theme.text}20`, color: theme.text, border:`1px solid ${theme.text}40` }}>
                                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                                    {t('refresh')}
                                </button>
                                <button type="button" onClick={() => setAddModalOpen(true)}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition-all hover:scale-105 shadow-xl cursor-pointer"
                                    style={{ background: theme.text, color: theme.bg }}>
                                    <Plus className="h-4 w-4" />
                                    {t('add_work')}
                                </button>
                            </div>
                        </div>

                        {/* Stats Grid: 3 columns for Department Tasks only, 4 columns for All / Issues */}
                        <div className={`grid gap-3 mb-6 ${isManualOnly ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
                            {stats.map(({ label, value, Icon }) => (
                                <div key={label} className="rounded-xl p-4 border border-[#3B3929] bg-[#2A281E]/80 backdrop-blur-md shadow-md transition-all duration-500"
                                    style={{ borderTop: `3px solid ${theme.bg === '#212121' ? '#FFFFFF' : theme.bg}` }}>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <Icon className="h-4 w-4" style={{ color: theme.bg === '#212121' ? '#FFFFFF' : theme.bg }} />
                                        <span className="text-xs text-[#A19F8D] font-semibold">{label}</span>
                                    </div>
                                    <p className="text-2xl font-extrabold text-[#FAFAFA]">{value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Source Filter & Multi-Sheet Selector */}
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Source Filter: All / Issues / Manual */}
                                <div className="flex items-center gap-2">
                                    <Filter className="h-4 w-4 text-[#C9AA71]" />
                                    <div className="flex gap-1 bg-[#2A281E] border border-[#3B3929] rounded-xl p-1 shadow-xs">
                                        {[
                                            { key: 'all',    label: t('all_sources') },
                                            { key: 'issue',  label: t('source_issues') },
                                            { key: 'manual', label: t('source_manual') },
                                        ].map(({ key, label }) => (
                                            <button key={key} type="button" onClick={() => setSourceFilter(key)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                                                style={sourceFilter === key
                                                    ? { background: theme.bg, color: theme.text, boxShadow:`0 2px 10px ${theme.bg}60` }
                                                    : { color:'#A19F8D' }}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Multi-Sheet Selector: ONLY shown when viewing 'all' or 'issue', hidden when 'manual' only */}
                                {sourceFilter !== 'manual' && availableSheets.length > 0 && (
                                    <MultiSheetSelector
                                        availableSheets={availableSheets}
                                        selectedSheets={selectedSheets}
                                        onChange={setSelectedSheets}
                                        theme={theme}
                                        t={t}
                                    />
                                )}
                            </div>

                            <span className="text-xs text-[#A19F8D] font-mono">
                                {shownManual.length + shownIssues.length} {t('total_items_displayed')}
                            </span>
                        </div>

                        {/* Loading / Error */}
                        {loading && (
                            <div className="flex items-center justify-center py-20 gap-3 text-[#A19F8D]">
                                <Loader2 className="h-6 w-6 animate-spin text-[#C9AA71]" />
                                <span className="text-sm font-medium">{t('loading_dept_data')} ({selectedDept})</span>
                            </div>
                        )}
                        {error && !loading && (
                            <div className="rounded-xl p-4 mb-4 text-sm bg-red-950/40 text-red-200 border border-red-500/40">
                                ⚠️ {error}
                            </div>
                        )}

                        {/* Cards List View */}
                        {!loading && (
                            <div className="space-y-3">
                                {shownManual.map((item) => (
                                    <ManualWorkCard key={item.id} item={item} theme={theme}
                                        onMarkDone={handleMarkDone} onDelete={handleDelete} onEdit={setEditItem}
                                        onPreviewImage={handlePreview} t={t} lang={lang} />
                                ))}
                                {shownIssues.map((item) => (
                                    <IssueWorkCard key={item.id} item={item} theme={theme}
                                        onPreviewImage={handlePreview} t={t} lang={lang} />
                                ))}
                                {shownManual.length === 0 && shownIssues.length === 0 && (
                                    <div className="text-center py-24 rounded-2xl border border-[#3B3929]/50 bg-[#2A281E]/40 backdrop-blur-sm">
                                        <Briefcase className="h-12 w-12 mx-auto mb-3 opacity-30 text-[#C9AA71]" />
                                        <p className="text-[#FAFAFA] font-bold text-base">{t('no_active_work')}</p>
                                        <p className="text-xs text-[#A19F8D] mt-1">
                                            {t('no_active_work_desc')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </div>
            </div>

            {addModalOpen && (
                <AddWorkModal dept={selectedDept} theme={theme}
                    onClose={() => setAddModalOpen(false)}
                    onSuccess={(item) => { 
                        setManual(prev => [item, ...prev]); 
                        setAddModalOpen(false); 
                        reload(true);
                    }}
                    t={t} />
            )}
            {editItem && (
                <EditWorkModal item={editItem} dept={selectedDept} theme={theme}
                    onClose={() => setEditItem(null)}
                    onSuccess={(updated) => {
                        setManual(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
                        setEditItem(null);
                        reload(true);
                    }}
                    t={t} />
            )}

            {/* Photo Preview Lightbox */}
            <ImageLightboxModal 
                open={!!previewImage}
                onClose={() => setPreviewImage(null)}
                src={previewImage?.src}
                title={previewImage?.title}
                subtitle={previewImage?.subtitle}
            />
        </div>
    );
}
