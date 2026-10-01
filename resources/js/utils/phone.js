/**
 * Utility functions for Indonesian WhatsApp / Phone number normalization
 */

/**
 * Normalizes and converts Indonesian phone/WhatsApp numbers to local '08...' format.
 * Handles:
 *  - '+628...' -> '08...'
 *  - '628...'  -> '08...'
 *  - '8...'    -> '08...'
 *  - '08...'   -> '08...'
 * Strips non-digit characters and limits length to 15 digits.
 *
 * @param {string|number} value
 * @returns {string}
 */
export function formatToLocalPhone(value) {
    if (!value) return '';
    let cleaned = String(value).trim();

    // If user typed or pasted +62 or 62
    if (cleaned.startsWith('+62')) {
        cleaned = '0' + cleaned.slice(3);
    } else if (cleaned.startsWith('62')) {
        cleaned = '0' + cleaned.slice(2);
    } else if (cleaned.startsWith('+')) {
        cleaned = cleaned.replace(/^\++/, '');
        if (cleaned.startsWith('62')) {
            cleaned = '0' + cleaned.slice(2);
        }
    } else if (cleaned.startsWith('8')) {
        cleaned = '0' + cleaned;
    }

    // Keep only numbers
    cleaned = cleaned.replace(/\D/g, '');

    // Double check in case of numbers after removing non-digits
    if (cleaned.startsWith('62')) {
        cleaned = '0' + cleaned.slice(2);
    } else if (cleaned.startsWith('8')) {
        cleaned = '0' + cleaned;
    }

    return cleaned.slice(0, 15);
}

/**
 * Checks if a string is a valid Indonesian mobile phone number (08xx, 10-13 digits)
 *
 * @param {string} phone
 * @returns {boolean}
 */
export function isValidIndonesianPhone(phone) {
    if (!phone) return false;
    const clean = String(phone).replace(/\D/g, '');
    return /^08[1-9]\d{7,10}$/.test(clean);
}

/**
 * Returns a human-friendly error string if phone format is invalid, or null if valid.
 *
 * @param {string} phone
 * @returns {string|null}
 */
export function getPhoneFormatError(phone) {
    if (!phone) return null;
    const clean = String(phone).replace(/\D/g, '');
    if (clean.length === 0) return null;
    if (!clean.startsWith('08')) {
        return 'Nomor WhatsApp harus diawali 08 (contoh: 0812xxxxxxxx).';
    }
    if (clean.length < 10) {
        return `Nomor terlalu pendek (${clean.length}/10 digit).`;
    }
    if (clean.length > 13) {
        return `Nomor terlalu panjang (${clean.length}/13 digit).`;
    }
    if (!/^08[1-9]/.test(clean)) {
        return 'Prefix operator tidak valid. Harus diawali 081x - 089x.';
    }
    return null;
}
