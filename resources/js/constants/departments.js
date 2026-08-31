/**
 * Official Resort Department Consolidated Palette
 * 
 * Combinations:
 * - GR: GR, Service, Bar, Spa, TiRek (Coral #FF7043)
 * - HR: HR, Legal, Tekong (Purple #4A148C)
 * - HK: HK, Pest Control (Mint #4DB6AC)
 * - Fasilitas: Fasilitas, Security (Lime #C0CA33)
 * - Engineer: Slate/Gray (#9E9E9E)
 * - F&B: Red (#D32F2F)
 * - IT: Cyan (#00BCD4)
 * - OE: Bright Purple (#8E24AA)
 * - Procurement: Slate Blue (#607D8B)
 * - Sales/Marketing: Magenta (#E91E63)
 * - Reservasi: Pink Magenta (#EC407A)
 * - Finance: Forest Green (#1B5E20)
 */

export const DEPARTMENT_COLORS = {
    // 🏢 Corporate, Admin & Management
    'hr': { bg: '#737FCC', text: '#FFFFFF', name: 'HR', label: 'Lavender (#737FCC)' },
    'human resources': { bg: '#737FCC', text: '#FFFFFF', name: 'HR', label: 'Lavender' },
    'legal': { bg: '#737FCC', text: '#FFFFFF', name: 'HR', label: 'Lavender' },
    'tekong': { bg: '#737FCC', text: '#FFFFFF', name: 'HR', label: 'Lavender' },

    'finance': { bg: '#76E553', text: '#14130B', name: 'Finance', label: 'Kiwi (#76E553)' },
    'procurement': { bg: '#19A6ED', text: '#FFFFFF', name: 'Procurement', label: 'Azure (#19A6ED)' },
    'oe': { bg: '#F09BFF', text: '#14130B', name: 'OE', label: 'Amethyst (#F09BFF)' },
    'it': { bg: '#87DEF4', text: '#14130B', name: 'IT', label: 'Aqua (#87DEF4)' },
    'it & technology': { bg: '#87DEF4', text: '#14130B', name: 'IT', label: 'Aqua (#87DEF4)' },

    // 🛎️ Frontline, Sales & Guest Facing
    'reservasi': { bg: '#0058FF', text: '#FFFFFF', name: 'Reservasi', label: 'Cobalt (#0058FF)' },
    'sales/marketing': { bg: '#E034A5', text: '#FFFFFF', name: 'Sales/Marketing', label: 'Fuchsia (#E034A5)' },
    'sales marketing': { bg: '#E034A5', text: '#FFFFFF', name: 'Sales/Marketing', label: 'Fuchsia (#E034A5)' },

    // 🌟 GR Combined Group (Service, Bar, Spa, TiRek, GR)
    'gr': { bg: '#FDB256', text: '#14130B', name: 'GR', label: 'Tangerine (#FDB256)' },
    'guest relations': { bg: '#FDB256', text: '#14130B', name: 'GR', label: 'Tangerine' },
    'service': { bg: '#FDB256', text: '#14130B', name: 'GR', label: 'Tangerine' },
    'bar': { bg: '#FDB256', text: '#14130B', name: 'GR', label: 'Tangerine' },
    'spa': { bg: '#FDB256', text: '#14130B', name: 'GR', label: 'Tangerine' },
    'tirek': { bg: '#FDB256', text: '#14130B', name: 'GR', label: 'Tangerine' },

    // 🍽️ Food & Beverage
    'f&b': { bg: '#EE6E78', text: '#FFFFFF', name: 'F&B', label: 'Cranberry (#EE6E78)' },
    'fnb': { bg: '#EE6E78', text: '#FFFFFF', name: 'F&B', label: 'Cranberry (#EE6E78)' },
    'food & beverage': { bg: '#EE6E78', text: '#FFFFFF', name: 'F&B', label: 'Cranberry (#EE6E78)' },

    // 🧹 HK Combined Group (HK + Pest Control)
    'hk': { bg: '#8CEDAE', text: '#14130B', name: 'HK', label: 'Mint (#8CEDAE)' },
    'housekeeping': { bg: '#8CEDAE', text: '#14130B', name: 'HK', label: 'Mint' },
    'pest control': { bg: '#8CEDAE', text: '#14130B', name: 'HK', label: 'Mint' },
    'pestcontrol': { bg: '#8CEDAE', text: '#14130B', name: 'HK', label: 'Mint' },

    // 🛠️ Fasilitas Combined Group (Fasilitas + Security)
    'fasilitas': { bg: '#F2CD5A', text: '#14130B', name: 'Fasilitas', label: 'Sunny (#F2CD5A)' },
    'facility': { bg: '#F2CD5A', text: '#14130B', name: 'Fasilitas', label: 'Sunny' },
    'security': { bg: '#F2CD5A', text: '#14130B', name: 'Fasilitas', label: 'Sunny' },

    // 🔧 Engineering
    'engineer': { bg: '#61A6F1', text: '#14130B', name: 'Engineer', label: 'Sky (#61A6F1)' },
    'engineering': { bg: '#61A6F1', text: '#14130B', name: 'Engineer', label: 'Sky' },
    'maintenance': { bg: '#61A6F1', text: '#14130B', name: 'Engineer', label: 'Sky' },
};

/**
 * Get the exact theme for a department name (case-insensitive & alias-safe)
 */
export function getDepartmentTheme(deptName) {
    if (!deptName) {
        return { bg: '#607D8B', text: '#FFFFFF', border: '#78909C', unselectedText: '#FFFFFF', unselectedBg: 'rgba(96, 125, 139, 0.15)', unselectedBorder: 'rgba(96, 125, 139, 0.35)' };
    }
    const key = String(deptName).toLowerCase().trim();
    if (DEPARTMENT_COLORS[key]) {
        const item = DEPARTMENT_COLORS[key];
        return {
            bg: item.bg,
            text: item.text,
            border: `${item.bg}99`,
            unselectedText: item.bg === '#212121' ? '#FFFFFF' : item.bg,
            unselectedBg: `${item.bg}22`,
            unselectedBorder: `${item.bg}44`,
        };
    }

    // Partial search
    for (const [k, v] of Object.entries(DEPARTMENT_COLORS)) {
        if (key.includes(k) || k.includes(key)) {
            return {
                bg: v.bg,
                text: v.text,
                border: `${v.bg}99`,
                unselectedText: v.bg === '#212121' ? '#FFFFFF' : v.bg,
                unselectedBg: `${v.bg}22`,
                unselectedBorder: `${v.bg}44`,
            };
        }
    }

    return { bg: '#607D8B', text: '#FFFFFF', border: '#78909C', unselectedText: '#FFFFFF', unselectedBg: 'rgba(96, 125, 139, 0.15)', unselectedBorder: 'rgba(96, 125, 139, 0.35)' };
}

export function getDepartmentColor(deptName, fallbackIndex = 0) {
    return getDepartmentTheme(deptName).bg;
}

export function getDepartmentTextColor(deptName) {
    return getDepartmentTheme(deptName).text;
}

function hexToRgb(hex) {
    let clean = String(hex || '').replace('#', '');
    if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
    if (clean.length !== 6) return { r: 96, g: 125, b: 139 };
    const num = parseInt(clean, 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const h = Math.max(0, Math.min(255, Math.round(x))).toString(16);
        return h.length === 1 ? '0' + h : h;
    }).join('');
}

export function lightenHex(hex, percent = 0.45) {
    try {
        const { r, g, b } = hexToRgb(hex);
        return rgbToHex(
            r + (255 - r) * percent,
            g + (255 - g) * percent,
            b + (255 - b) * percent
        );
    } catch (e) {
        return hex;
    }
}

export function darkenHex(hex, percent = 0.35) {
    try {
        const { r, g, b } = hexToRgb(hex);
        return rgbToHex(
            r * (1 - percent),
            g * (1 - percent),
            b * (1 - percent)
        );
    } catch (e) {
        return hex;
    }
}

export function getDepartmentLightColor(deptName) {
    const baseColor = getDepartmentColor(deptName);
    return lightenHex(baseColor, 0.45);
}

export function getDepartmentDarkColor(deptName) {
    const baseColor = getDepartmentColor(deptName);
    return darkenHex(baseColor, 0.35);
}

export function getShortDepartmentName(dept) {
    if (!dept) return '';
    const d = dept.trim().toLowerCase();
    const map = {
        'procurement': 'PROC',
        'engineering': 'ENG',
        'engineer': 'ENG',
        'housekeeping': 'HK',
        'hk': 'HK',
        'pest control': 'PEST',
        'human resources': 'HR',
        'hr': 'HR',
        'legal': 'LEGAL',
        'tekong': 'TEKONG',
        'finance': 'FIN',
        'fasilitas': 'FAS',
        'facility': 'FAS',
        'facilities': 'FAS',
        'security': 'SEC',
        'f&b': 'F&B',
        'fnb': 'F&B',
        'food & beverage': 'F&B',
        'guest relations': 'GR',
        'gr': 'GR',
        'service': 'SRV',
        'bar': 'BAR',
        'spa': 'SPA',
        'tirek': 'TIREK',
        'reservasi': 'RES',
        'reservation': 'RES',
        'sales/marketing': 'MKT',
        'sales marketing': 'MKT',
        'marketing': 'MKT',
        'it': 'IT',
        'it & technology': 'IT',
        'oe': 'OE',
        'admin': 'ADM',
        'administrator': 'ADMIN',
    };
    if (map[d]) return map[d];
    if (dept.length <= 4) return dept.toUpperCase();
    return dept.slice(0, 4).toUpperCase();
}
