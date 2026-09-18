import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

/**
 * Safely parses any deadline representation (timestamp ms, seconds, or human-readable date string)
 * into numeric milliseconds.
 *
 * Supports:
 * - 1789385400000 (Epoch MS)
 * - 1789385400 (Epoch Sec)
 * - "2026-09-18 16:30:00" / "2026-09-18T16:30:00"
 * - ISO strings
 */
export function parseDeadlineToMs(deadline) {
    if (!deadline) return null;
    if (typeof deadline === 'number') {
        let t = deadline;
        if (t < 10000000000) t *= 1000;
        return t > 0 ? t : null;
    }
    const str = String(deadline).trim();
    if (!str || str === 'undefined' || str === 'null') return null;

    // Numeric timestamp string
    if (/^\d+$/.test(str)) {
        let t = parseInt(str, 10);
        if (t < 10000000000) t *= 1000;
        return t > 0 ? t : null;
    }

    // Try standard Date parsing (replace space with 'T' for iOS/Safari cross-compatibility)
    let parsed = Date.parse(str.replace(' ', 'T'));
    if (isNaN(parsed) || parsed <= 0) {
        parsed = Date.parse(str);
    }
    return (!isNaN(parsed) && parsed > 0) ? parsed : null;
}

