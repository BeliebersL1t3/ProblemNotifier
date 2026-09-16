/**
 * Formats a duration string or calculated duration to use days and hours if >= 24h.
 * Example:
 * - "Solved in 41 hours" -> "Solved in 1 day 17 hours"
 * - "Solved in 24 hours" -> "Solved in 1 day"
 * - "Solved in 48 hours" -> "Solved in 2 days"
 * - "Solved in 49 hours" -> "Solved in 2 days 1 hour"
 * - "Solved in 5 hours" -> "Solved in 5 hours"
 * - "Solved in 45 minutes" -> "Solved in 45 minutes"
 */
export function formatDurationLabel(label) {
    if (!label || typeof label !== 'string') return label;

    // Pattern for English: "Solved in X hours" or "X hours" or "X hour"
    const hoursMatch = label.match(/^(?:(Solved in)\s+)?(\d+(?:\.\d+)?)\s*hours?$/i);
    if (hoursMatch) {
        const prefix = hoursMatch[1] ? `${hoursMatch[1]} ` : '';
        const totalHours = Math.round(parseFloat(hoursMatch[2]));
        if (totalHours >= 24) {
            const days = Math.floor(totalHours / 24);
            const remHours = totalHours % 24;
            const dayStr = `${days} day${days === 1 ? '' : 's'}`;
            if (remHours === 0) {
                return `${prefix}${dayStr}`;
            }
            const hourStr = `${remHours} hour${remHours === 1 ? '' : 's'}`;
            return `${prefix}${dayStr} ${hourStr}`;
        }
        return `${prefix}${totalHours} hour${totalHours === 1 ? '' : 's'}`;
    }

    // Pattern for Indonesian: "Selesai dalam X jam" or "X jam"
    const idHoursMatch = label.match(/^(?:(Selesai dalam)\s+)?(\d+(?:\.\d+)?)\s*jam$/i);
    if (idHoursMatch) {
        const prefix = idHoursMatch[1] ? `${idHoursMatch[1]} ` : '';
        const totalHours = Math.round(parseFloat(idHoursMatch[2]));
        if (totalHours >= 24) {
            const days = Math.floor(totalHours / 24);
            const remHours = totalHours % 24;
            const dayStr = `${days} hari`;
            if (remHours === 0) {
                return `${prefix}${dayStr}`;
            }
            const hourStr = `${remHours} jam`;
            return `${prefix}${dayStr} ${hourStr}`;
        }
        return `${prefix}${totalHours} jam`;
    }

    return label;
}

/**
 * Computes duration label between two timestamps (in ms) using days and hours.
 */
export function computeDurationFromTimestamps(createdTime, solveTime) {
    if (!createdTime || !solveTime || solveTime <= createdTime) return 'Solved';
    const diffMinutes = Math.max(1, Math.round((solveTime - createdTime) / 60000));
    if (diffMinutes < 60) return `Solved in ${diffMinutes} minute${diffMinutes === 1 ? '' : 's'}`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Solved in ${diffHours} hour${diffHours === 1 ? '' : 's'}`;
    const diffDays = Math.floor(diffHours / 24);
    const remHours = diffHours % 24;
    if (remHours === 0) return `Solved in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
    return `Solved in ${diffDays} day${diffDays === 1 ? '' : 's'} ${remHours} hour${remHours === 1 ? '' : 's'}`;
}
