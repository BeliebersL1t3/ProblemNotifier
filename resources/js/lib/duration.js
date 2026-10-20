/**
 * Formats a duration string or calculated duration to use days and hours if >= 24h,
 * and dynamically localizes between English and Indonesian.
 * Examples:
 * - "Solved in 41 hours", "id" -> "Selesai dalam 1 hari 17 jam"
 * - "Solved in 3 minutes", "id" -> "Selesai dalam 3 menit"
 * - "Solved in 24 hours", "en" -> "Solved in 1 day"
 * - "Selesai dalam 45 menit", "en" -> "Solved in 45 minutes"
 */
export function formatDurationLabel(label, lang = 'en') {
    if (!label || typeof label !== 'string') return label;

    const trimmed = label.trim();
    if (trimmed.toLowerCase() === 'solved') {
        return lang === 'id' ? 'Selesai' : 'Solved';
    }
    if (trimmed.toLowerCase() === 'selesai') {
        return lang === 'en' ? 'Solved' : 'Selesai';
    }

    // 1. Minute match (e.g. "Solved in 3 minutes", "Solved in 1 minute", "Selesai dalam 3 menit", "3 minutes", "3 menit")
    const minMatch = trimmed.match(/^(?:(?:Solved in|Selesai dalam)\s+)?(\d+)\s*(?:minutes?|mins?|menit)$/i);
    if (minMatch) {
        const mins = parseInt(minMatch[1], 10);
        if (lang === 'id') {
            return `Selesai dalam ${mins} menit`;
        }
        return `Solved in ${mins} minute${mins === 1 ? '' : 's'}`;
    }

    // 2. Days and hours match (e.g. "Solved in 2 days 3 hours", "Selesai dalam 2 hari 3 jam")
    const dayHourMatch = trimmed.match(/^(?:(?:Solved in|Selesai dalam)\s+)?(\d+)\s*(?:days?|hari)\s+(\d+)\s*(?:hours?|hrs?|jam)$/i);
    if (dayHourMatch) {
        const days = parseInt(dayHourMatch[1], 10);
        const hours = parseInt(dayHourMatch[2], 10);
        if (lang === 'id') {
            return `Selesai dalam ${days} hari ${hours} jam`;
        }
        return `Solved in ${days} day${days === 1 ? '' : 's'} ${hours} hour${hours === 1 ? '' : 's'}`;
    }

    // 3. Days only match (e.g. "Solved in 2 days", "Selesai dalam 2 hari")
    const dayOnlyMatch = trimmed.match(/^(?:(?:Solved in|Selesai dalam)\s+)?(\d+)\s*(?:days?|hari)$/i);
    if (dayOnlyMatch) {
        const days = parseInt(dayOnlyMatch[1], 10);
        if (lang === 'id') {
            return `Selesai dalam ${days} hari`;
        }
        return `Solved in ${days} day${days === 1 ? '' : 's'}`;
    }

    // 4. Hours match (e.g. "Solved in 41 hours", "41 hours", "Selesai dalam 41 jam", "41 jam")
    const hoursMatch = trimmed.match(/^(?:(?:Solved in|Selesai dalam)\s+)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|jam)$/i);
    if (hoursMatch) {
        const totalHours = Math.round(parseFloat(hoursMatch[1]));
        if (totalHours >= 24) {
            const days = Math.floor(totalHours / 24);
            const remHours = totalHours % 24;
            if (remHours === 0) {
                return lang === 'id'
                    ? `Selesai dalam ${days} hari`
                    : `Solved in ${days} day${days === 1 ? '' : 's'}`;
            }
            return lang === 'id'
                ? `Selesai dalam ${days} hari ${remHours} jam`
                : `Solved in ${days} day${days === 1 ? '' : 's'} ${remHours} hour${remHours === 1 ? '' : 's'}`;
        }
        return lang === 'id'
            ? `Selesai dalam ${totalHours} jam`
            : `Solved in ${totalHours} hour${totalHours === 1 ? '' : 's'}`;
    }

    return label;
}

/**
 * Computes duration label between two timestamps (in ms) using days and hours.
 */
export function computeDurationFromTimestamps(createdTime, solveTime, lang = 'en') {
    if (!createdTime || !solveTime || solveTime <= createdTime) {
        return lang === 'id' ? 'Selesai' : 'Solved';
    }
    const diffMinutes = Math.max(1, Math.round((solveTime - createdTime) / 60000));
    if (diffMinutes < 60) {
        return lang === 'id'
            ? `Selesai dalam ${diffMinutes} menit`
            : `Solved in ${diffMinutes} minute${diffMinutes === 1 ? '' : 's'}`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        return lang === 'id'
            ? `Selesai dalam ${diffHours} jam`
            : `Solved in ${diffHours} hour${diffHours === 1 ? '' : 's'}`;
    }
    const diffDays = Math.floor(diffHours / 24);
    const remHours = diffHours % 24;
    if (remHours === 0) {
        return lang === 'id'
            ? `Selesai dalam ${diffDays} hari`
            : `Solved in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
    }
    return lang === 'id'
        ? `Selesai dalam ${diffDays} hari ${remHours} jam`
        : `Solved in ${diffDays} day${diffDays === 1 ? '' : 's'} ${remHours} hour${remHours === 1 ? '' : 's'}`;
}

