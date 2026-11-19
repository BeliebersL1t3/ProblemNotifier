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

export const GROUP_ESCALATION_MS = 60 * 60 * 1000; // 1 hour
export const OWNER_ESCALATION_MS = 180 * 60 * 1000; // 3 hours

/**
 * Evaluate automatic 1h Group / 3h Owner progress-reminder timer status for any LeanIssue.
 * - Running when status is 'open' or 'in_progress' (measured from last_progress_at || created_at).
 * - Paused when status is 'pending'.
 * - Stopped permanently when status is 'resolved' (shows total created_at -> resolved_at duration).
 */
export function getAutoTimerBadgeInfo(issue, nowMs = Date.now(), isEn = false) {
    if (!issue) return null;

    const status = String(issue.status || 'open').toLowerCase();
    const createdMs = parseEtaTimestampMs(issue.created_at);
    const anchorMs = parseEtaTimestampMs(issue.last_progress_at || issue.created_at);
    const groupCount = Number(issue.escalation_group_count || 0);
    const ownerCount = Number(issue.escalation_owner_count || 0);

    if (status === 'resolved') {
        const resolvedMs = parseEtaTimestampMs(issue.resolved_at);
        const totalMs = (createdMs !== null && resolvedMs !== null)
            ? Math.max(0, resolvedMs - createdMs)
            : null;
        const totalDur = totalMs !== null ? formatDurationShort(totalMs, isEn) : '-';

        let state = 'resolved_clean';
        let subLabel = isEn ? 'Total solve time' : 'Total durasi selesai';
        if (ownerCount > 0) {
            state = 'resolved_owner_escalated';
            subLabel = isEn ? `Owner alert (${ownerCount}x)` : `Eskalasi Owner (${ownerCount}x)`;
        } else if (groupCount > 0) {
            state = 'resolved_group_escalated';
            subLabel = isEn ? `Group alert (${groupCount}x)` : `Reminder Grup (${groupCount}x)`;
        }

        const primaryLabel = isEn ? `Solved • ${totalDur}` : `Selesai • ${totalDur}`;
        return {
            state,
            isOverdue: ownerCount > 0,
            isEscalated: groupCount > 0 || ownerCount > 0,
            isPaused: false,
            idleMs: 0,
            totalSolveMs: totalMs,
            primaryLabel,
            subLabel,
            formattedTarget: primaryLabel,
            formattedFullTarget: `${primaryLabel} (${subLabel})`,
            statusLabel: subLabel,
        };
    }

    if (status === 'pending') {
        const pendingMs = parseEtaTimestampMs(issue.pending_since || issue.last_progress_at || issue.created_at);
        const pausedDur = pendingMs !== null ? formatDurationShort(Math.max(0, nowMs - pendingMs), isEn) : '';
        const primaryLabel = isEn ? 'Timer Paused' : 'Timer Dijeda';
        const subLabel = pausedDur
            ? `Pending ${pausedDur}`
            : (isEn ? 'Waiting to resume' : 'Menunggu dilanjutkan');

        return {
            state: 'paused',
            isOverdue: false,
            isEscalated: false,
            isPaused: true,
            idleMs: 0,
            primaryLabel,
            subLabel,
            formattedTarget: primaryLabel,
            formattedFullTarget: `${primaryLabel} (${subLabel})`,
            statusLabel: subLabel,
        };
    }

    if (anchorMs === null) return null;

    const idleMs = Math.max(0, nowMs - anchorMs);

    if (idleMs >= OWNER_ESCALATION_MS) {
        const idleDur = formatDurationShort(idleMs, isEn);
        const primaryLabel = isEn ? 'Owner Escalated (3h+)' : 'Eskalasi Owner (3j+)';
        const subLabel = isEn ? `${idleDur} no update` : `${idleDur} tanpa update`;
        return {
            state: 'owner_escalated',
            isOverdue: true,
            isOnTime: false,
            isEscalated: true,
            isPaused: false,
            idleMs,
            primaryLabel,
            subLabel,
            formattedTarget: primaryLabel,
            formattedFullTarget: `${primaryLabel} • ${subLabel}`,
            statusLabel: subLabel,
        };
    }

    if (idleMs >= GROUP_ESCALATION_MS) {
        const remOwnerMs = Math.max(60000, OWNER_ESCALATION_MS - idleMs);
        const remOwner = formatDurationShort(remOwnerMs, isEn);
        const primaryLabel = isEn ? 'Group Alert (1h+)' : 'Reminder Grup (1j+)';
        const subLabel = `${remOwner} → Owner`;
        return {
            state: 'group_escalated',
            isOverdue: true,
            isOnTime: false,
            isEscalated: true,
            isPaused: false,
            idleMs,
            primaryLabel,
            subLabel,
            formattedTarget: primaryLabel,
            formattedFullTarget: `${primaryLabel} • ${subLabel}`,
            statusLabel: subLabel,
        };
    }

    const remGroupMs = Math.max(60000, GROUP_ESCALATION_MS - idleMs);
    const remGroup = formatDurationShort(remGroupMs, isEn);
    const isWarningSoon = remGroupMs <= 15 * 60000;
    const primaryLabel = isEn ? `${remGroup} → Group` : `${remGroup} → Grup`;
    const subLabel = status === 'open'
        ? (isEn ? 'Waiting first update' : 'Menunggu respon')
        : (isEn ? 'Auto progress timer' : 'Timer progres aktif');

    return {
        state: isWarningSoon ? 'warning_soon' : 'running',
        isOverdue: false,
        isOnTime: false,
        isEscalated: false,
        isPaused: false,
        idleMs,
        primaryLabel,
        subLabel,
        formattedTarget: primaryLabel,
        formattedFullTarget: `${primaryLabel} • ${subLabel}`,
        statusLabel: subLabel,
    };
}

/**
 * Backward-compatible alias for getAutoTimerBadgeInfo.
 */
export function getEtaBadgeInfo(issue, nowMs = Date.now(), isEn = false) {
    return getAutoTimerBadgeInfo(issue, nowMs, isEn);
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
