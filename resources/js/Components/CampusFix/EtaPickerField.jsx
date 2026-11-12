import React from 'react';
import { CalendarClock, Clock, RotateCcw } from 'lucide-react';

export const JAKARTA_TIMEZONE = 'Asia/Jakarta';

function getJakartaParts(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) {
        return null;
    }

    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: JAKARTA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(d);

    const map = {};
    parts.forEach((p) => {
        map[p.type] = p.value;
    });

    const hour = map.hour === '24' ? '00' : map.hour;
    return {
        year: map.year,
        month: map.month,
        day: map.day,
        hour,
        minute: map.minute,
    };
}

/**
 * Convert an ISO/Date/datetime-local value into a `YYYY-MM-DDTHH:mm` wall-clock string in Asia/Jakarta (WIB).
 */
export function toJakartaDatetimeLocal(value) {
    if (!value) return '';
    const str = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str)) {
        return str;
    }

    const d = new Date(str);
    if (Number.isNaN(d.getTime())) return '';

    const p = getJakartaParts(d);
    if (!p) return '';

    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * Convert a Jakarta wall-clock `YYYY-MM-DDTHH:mm` value into an unambiguous ISO-8601 string with `+07:00`.
 */
export function jakartaLocalToIso(localStr) {
    if (!localStr) return '';
    const clean = String(localStr).trim();
    if (!clean) return '';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(clean)) {
        return `${clean}:00+07:00`;
    }
    return clean;
}

/**
 * Parse either ISO-8601 or naive Jakarta `YYYY-MM-DDTHH:mm` into UTC epoch milliseconds.
 */
export function parseEtaTimestampMs(value) {
    if (!value) return null;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    const clean = String(value).trim();
    if (!clean) return null;

    const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(clean)
        ? `${clean}:00+07:00`
        : clean;
    const ms = Date.parse(normalized);
    return Number.isNaN(ms) ? null : ms;
}

/**
 * Format an ETA timestamp cleanly in Asia/Jakarta (WIB).
 */
export function formatEtaDisplayWib(value, isEn = false, compact = false) {
    const ms = parseEtaTimestampMs(value);
    if (ms === null) return '';

    try {
        const d = new Date(ms);
        const locale = isEn ? 'en-US' : 'id-ID';
        const formatted = d.toLocaleString(locale, {
            timeZone: JAKARTA_TIMEZONE,
            day: '2-digit',
            month: 'short',
            ...(compact ? {} : { year: 'numeric' }),
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
        return `${formatted} WIB`;
    } catch (err) {
        console.warn('[EtaPickerField] Failed formatting ETA timestamp:', err);
        return String(value);
    }
}

export function formatDurationShort(diffMs, isEn = false) {
    const totalMinutes = Math.max(1, Math.round(Math.abs(diffMs) / 60000));
    if (totalMinutes < 60) {
        return `${totalMinutes} ${isEn ? 'm' : 'mnt'}`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours < 24) {
        if (mins === 0) {
            return `${hours}${isEn ? 'h' : 'j'}`;
        }
        return `${hours}${isEn ? 'h' : 'j'} ${mins}${isEn ? 'm' : 'm'}`;
    }

    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    if (remHours === 0) {
        return `${days}${isEn ? 'd' : 'h'}`;
    }
    return `${days}${isEn ? 'd' : 'h'} ${remHours}${isEn ? 'h' : 'j'}`;
}

/**
 * Evaluate ticket ETA / SLA visual status across Card View, ERP Table, Detail Modal, and Analytics.
 */
export function getEtaBadgeInfo(issue, nowMs = Date.now(), isEn = false) {
    if (!issue?.estimated_completion_at) return null;

    const etaMs = parseEtaTimestampMs(issue.estimated_completion_at);
    if (etaMs === null) return null;

    const etaMin = Math.floor(etaMs / 60000) * 60000;
    const formattedTarget = formatEtaDisplayWib(etaMs, isEn, true);
    const formattedFullTarget = formatEtaDisplayWib(etaMs, isEn, false);

    if (issue.status === 'resolved') {
        const resolvedMs = parseEtaTimestampMs(issue.resolved_at);
        if (resolvedMs === null) {
            return {
                state: 'scheduled',
                isOverdue: false,
                isOnTime: false,
                formattedTarget,
                formattedFullTarget,
                statusLabel: formattedTarget,
                deltaText: '',
            };
        }

        const resolvedMin = Math.floor(resolvedMs / 60000) * 60000;
        if (resolvedMin <= etaMin) {
            return {
                state: 'on_time',
                isOverdue: false,
                isOnTime: true,
                formattedTarget,
                formattedFullTarget,
                statusLabel: isEn ? 'On Time' : 'Tepat Waktu',
                deltaText: '',
            };
        }

        const lateDur = formatDurationShort(resolvedMin - etaMin, isEn);
        return {
            state: 'late_resolved',
            isOverdue: true,
            isOnTime: false,
            formattedTarget,
            formattedFullTarget,
            statusLabel: isEn ? `Late (+${lateDur})` : `Lewat (+${lateDur})`,
            deltaText: lateDur,
        };
    }

    const nowMin = Math.floor(nowMs / 60000) * 60000;
    if (nowMin > etaMin) {
        const overdueDur = formatDurationShort(nowMin - etaMin, isEn);
        return {
            state: 'overdue',
            isOverdue: true,
            isOnTime: false,
            formattedTarget,
            formattedFullTarget,
            statusLabel: isEn ? `Overdue (${overdueDur})` : `Lewat ETA (${overdueDur})`,
            deltaText: overdueDur,
        };
    }

    const diffMs = Math.max(0, etaMin - nowMin);
    const remDur = diffMs === 0 ? (isEn ? 'Now' : 'Sekarang') : formatDurationShort(diffMs, isEn);
    const isDueSoon = diffMs <= 30 * 60000;

    return {
        state: isDueSoon ? 'due_soon' : 'scheduled',
        isOverdue: false,
        isOnTime: false,
        formattedTarget,
        formattedFullTarget,
        statusLabel: diffMs === 0 ? remDur : (isEn ? `${remDur} left` : `${remDur} lagi`),
        deltaText: remDur,
    };
}

/**
 * Reusable Opsi A (Quick Presets + Manual Datetime-local) ETA picker field in Asia/Jakarta (WIB).
 */
export function EtaPickerField({
    value = '',
    onChange,
    isEn = false,
    isDark = true,
    accent = 'amber', // 'amber' | 'sky' | 'orange' | 'emerald'
    label = null,
    helperText = null,
}) {
    const now = new Date();
    const parts = getJakartaParts(now);

    const presetOptions = [];
    presetOptions.push({
        id: '30m',
        label: isEn ? '+30 Mins' : '+30 Menit',
        value: toJakartaDatetimeLocal(new Date(now.getTime() + 30 * 60000)),
    });
    presetOptions.push({
        id: '1h',
        label: isEn ? '+1 Hour' : '+1 Jam',
        value: toJakartaDatetimeLocal(new Date(now.getTime() + 60 * 60000)),
    });
    presetOptions.push({
        id: '2h',
        label: isEn ? '+2 Hours' : '+2 Jam',
        value: toJakartaDatetimeLocal(new Date(now.getTime() + 120 * 60000)),
    });

    if (parts) {
        const today17Ms = Date.parse(`${parts.year}-${parts.month}-${parts.day}T17:00:00+07:00`);
        if (!Number.isNaN(today17Ms) && now.getTime() < today17Ms) {
            presetOptions.push({
                id: 'today17',
                label: isEn ? 'Today 17:00' : 'Hari Ini 17:00',
                value: `${parts.year}-${parts.month}-${parts.day}T17:00`,
            });
        }

        const tomorrowNoonMs = Date.parse(`${parts.year}-${parts.month}-${parts.day}T12:00:00+07:00`) + 86400000;
        if (!Number.isNaN(tomorrowNoonMs)) {
            presetOptions.push({
                id: 'tomorrow12',
                label: isEn ? 'Tomorrow 12:00' : 'Besok 12:00',
                value: toJakartaDatetimeLocal(new Date(tomorrowNoonMs)),
            });
        }
    }

    presetOptions.push({
        id: '24h',
        label: isEn ? '+24 Hours' : 'Besok (+24 Jam)',
        value: toJakartaDatetimeLocal(new Date(now.getTime() + 24 * 60 * 60000)),
    });

    const accentStyles = {
        amber: {
            icon: isDark ? 'text-amber-400' : 'text-amber-600',
            activeChip: 'bg-amber-600 text-white keep-white border-amber-500 shadow-sm',
            inputFocus: 'focus:border-amber-500',
            preview: isDark ? 'text-amber-300' : 'text-amber-700',
        },
        sky: {
            icon: isDark ? 'text-sky-400' : 'text-sky-600',
            activeChip: 'bg-sky-600 text-white keep-white border-sky-500 shadow-sm',
            inputFocus: 'focus:border-sky-500',
            preview: isDark ? 'text-sky-300' : 'text-sky-700',
        },
        orange: {
            icon: isDark ? 'text-orange-400' : 'text-orange-600',
            activeChip: 'bg-orange-600 text-white keep-white border-orange-500 shadow-sm',
            inputFocus: 'focus:border-orange-500',
            preview: isDark ? 'text-orange-300' : 'text-orange-700',
        },
        emerald: {
            icon: isDark ? 'text-emerald-400' : 'text-emerald-600',
            activeChip: 'bg-emerald-600 text-white keep-white border-emerald-500 shadow-sm',
            inputFocus: 'focus:border-emerald-500',
            preview: isDark ? 'text-emerald-300' : 'text-emerald-700',
        },
    }[accent] || {
        icon: isDark ? 'text-sky-400' : 'text-sky-600',
        activeChip: 'bg-sky-600 text-white keep-white border-sky-500 shadow-sm',
        inputFocus: 'focus:border-sky-500',
        preview: isDark ? 'text-sky-300' : 'text-sky-700',
    };

    const resolvedLabel = label || (isEn
        ? 'Estimated Completion Time (Optional • WIB)'
        : 'Perkiraan Waktu Selesai (Opsional • WIB)');

    return (
        <div className={`p-3 rounded-xl border space-y-2 ${
            isDark ? 'bg-slate-800/70 border-slate-700' : 'bg-slate-50 border-slate-200'
        }`}>
            <div className="flex items-center justify-between gap-2">
                <label className={`text-xs font-bold flex items-center gap-1.5 ${
                    isDark ? 'text-slate-200' : 'text-slate-800'
                }`}>
                    <CalendarClock className={`w-3.5 h-3.5 ${accentStyles.icon} shrink-0`} />
                    <span>{resolvedLabel}</span>
                </label>
                {value && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        className={`text-[10px] font-semibold flex items-center gap-1 px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                            isDark
                                ? 'text-slate-400 hover:text-rose-300 bg-slate-900/80 border-slate-700'
                                : 'text-slate-600 hover:text-rose-600 bg-white border-slate-300'
                        }`}
                        title={isEn ? 'Clear estimated completion time' : 'Kosongkan perkiraan selesai'}
                    >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>{isEn ? 'Clear' : 'Kosongkan'}</span>
                    </button>
                )}
            </div>

            {helperText && (
                <p className={`text-[10px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{helperText}</p>
            )}

            {/* Quick 1-Tap Preset Chips */}
            <div className="flex flex-wrap gap-1.5">
                {presetOptions.map((preset) => {
                    const isSelected = value && value === preset.value;
                    return (
                        <button
                            key={preset.id}
                            type="button"
                            onClick={() => onChange(isSelected ? '' : preset.value)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                                isSelected
                                    ? accentStyles.activeChip
                                    : isDark
                                    ? 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white hover:border-slate-500'
                                    : 'bg-white text-slate-700 border-slate-300 hover:text-slate-900 hover:border-slate-400'
                            }`}
                        >
                            {preset.label}
                        </button>
                    );
                })}
            </div>

            {/* Manual Datetime Input + Formatted WIB Preview */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
                <input
                    type="datetime-local"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    className={`w-full sm:w-auto flex-1 text-xs border rounded-lg px-2.5 py-1.5 focus:outline-none ${accentStyles.inputFocus} ${
                        isDark
                            ? 'bg-slate-900 border-slate-700 text-white [color-scheme:dark]'
                            : 'bg-white border-slate-300 text-slate-900 [color-scheme:light]'
                    }`}
                />
                {value ? (
                    <span className={`text-[11px] font-semibold flex items-center gap-1 shrink-0 ${accentStyles.preview}`}>
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>{formatEtaDisplayWib(value, isEn, false)}</span>
                    </span>
                ) : (
                    <span className="text-[10px] text-slate-500 italic shrink-0">
                        {isEn ? 'No ETA target set' : 'Belum ditentukan'}
                    </span>
                )}
            </div>
        </div>
    );
}
