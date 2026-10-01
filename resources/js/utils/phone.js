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
 * Checks if a string is a potentially valid Indonesian mobile phone number
 *
 * @param {string} phone
 * @returns {boolean}
 */
export function isValidIndonesianPhone(phone) {
    if (!phone) return false;
    const clean = String(phone).replace(/\D/g, '');
    return /^08\d{8,12}$/.test(clean);
}
