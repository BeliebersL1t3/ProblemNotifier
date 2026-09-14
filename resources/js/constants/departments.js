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
    // 🏢 1. HR Group (HR, Legal, LnD, Transportasi)
    'hr': { bg: '#737FCC', text: '#FFFFFF', name: 'HR', label: 'Lavender (#737FCC)' },
    'human resources': { bg: '#737FCC', text: '#FFFFFF', name: 'HR', label: 'Lavender' },
    'legal': { bg: '#737FCC', text: '#FFFFFF', name: 'HR', label: 'Lavender' },
    'lnd': { bg: '#737FCC', text: '#FFFFFF', name: 'HR', label: 'Lavender' },
    'learning & development': { bg: '#737FCC', text: '#FFFFFF', name: 'HR', label: 'Lavender' },
    'transportasi': { bg: '#737FCC', text: '#FFFFFF', name: 'HR', label: 'Lavender' },
    'tekong': { bg: '#737FCC', text: '#FFFFFF', name: 'HR', label: 'Lavender' },

    // 🌟 2. GR Group (GRE, Service, TIrek, Spa, Bar)
    'gr': { bg: '#FDB256', text: '#14130B', name: 'GR', label: 'Tangerine (#FDB256)' },
    'gre': { bg: '#FDB256', text: '#14130B', name: 'GR', label: 'Tangerine' },
    'guest relations': { bg: '#FDB256', text: '#14130B', name: 'GR', label: 'Tangerine' },
    'service': { bg: '#FDB256', text: '#14130B', name: 'GR', label: 'Tangerine' },
    'bar': { bg: '#FDB256', text: '#14130B', name: 'GR', label: 'Tangerine' },
    'spa': { bg: '#FDB256', text: '#14130B', name: 'GR', label: 'Tangerine' },
    'tirek': { bg: '#FDB256', text: '#14130B', name: 'GR', label: 'Tangerine' },

    // 💡 3. OE (Operational Excellence)
    'oe': { bg: '#F09BFF', text: '#14130B', name: 'OE', label: 'Amethyst (#F09BFF)' },

    // 🍳 4. Kitchen (Formerly F&B)
    'kitchen': { bg: '#EE6E78', text: '#FFFFFF', name: 'Kitchen', label: 'Cranberry (#EE6E78)' },
    'f&b': { bg: '#EE6E78', text: '#FFFFFF', name: 'Kitchen', label: 'Cranberry (#EE6E78)' },
    'fnb': { bg: '#EE6E78', text: '#FFFFFF', name: 'Kitchen', label: 'Cranberry (#EE6E78)' },
    'food & beverage': { bg: '#EE6E78', text: '#FFFFFF', name: 'Kitchen', label: 'Cranberry (#EE6E78)' },

    // 🧹 5. HK (HK + Pest Control)
    'hk': { bg: '#8CEDAE', text: '#14130B', name: 'HK', label: 'Mint (#8CEDAE)' },
    'housekeeping': { bg: '#8CEDAE', text: '#14130B', name: 'HK', label: 'Mint' },
    'pest control': { bg: '#8CEDAE', text: '#14130B', name: 'HK', label: 'Mint' },
    'pestcontrol': { bg: '#8CEDAE', text: '#14130B', name: 'HK', label: 'Mint' },

    // 💻 6. IT
    'it': { bg: '#87DEF4', text: '#14130B', name: 'IT', label: 'Aqua (#87DEF4)' },
    'it & technology': { bg: '#87DEF4', text: '#14130B', name: 'IT', label: 'Aqua (#87DEF4)' },

    // 📦 7. Procurement
    'procurement': { bg: '#19A6ED', text: '#FFFFFF', name: 'Procurement', label: 'Azure (#19A6ED)' },

    // 💵 8. Finance
    'finance': { bg: '#76E553', text: '#14130B', name: 'Finance', label: 'Kiwi (#76E553)' },

    // 🛎️ 9. Reservasi Group (Reservasi, Sales, Marketing)
    'reservasi': { bg: '#0058FF', text: '#FFFFFF', name: 'Reservasi', label: 'Cobalt (#0058FF)' },
    'sales': { bg: '#0058FF', text: '#FFFFFF', name: 'Reservasi', label: 'Cobalt' },
    'marketing': { bg: '#0058FF', text: '#FFFFFF', name: 'Reservasi', label: 'Cobalt' },
    'sales/marketing': { bg: '#0058FF', text: '#FFFFFF', name: 'Reservasi', label: 'Cobalt' },
    'sales marketing': { bg: '#0058FF', text: '#FFFFFF', name: 'Reservasi', label: 'Cobalt' },

    // 🔧 10. Engineer
    'engineer': { bg: '#61A6F1', text: '#14130B', name: 'Engineer', label: 'Sky (#61A6F1)' },
    'engineering': { bg: '#61A6F1', text: '#14130B', name: 'Engineer', label: 'Sky' },
    'maintenance': { bg: '#61A6F1', text: '#14130B', name: 'Engineer', label: 'Sky' },

    // 🛠️ 11. Fasilitas Group (Fasilitas + Security)
    'fasilitas': { bg: '#F2CD5A', text: '#14130B', name: 'Fasilitas', label: 'Sunny (#F2CD5A)' },
    'facility': { bg: '#F2CD5A', text: '#14130B', name: 'Fasilitas', label: 'Sunny' },
    'security': { bg: '#F2CD5A', text: '#14130B', name: 'Fasilitas', label: 'Sunny' },
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
        'kitchen': 'KTCH',
        'f&b': 'KTCH',
        'fnb': 'KTCH',
        'food & beverage': 'KTCH',
        'transportasi': 'TRP',
        'tekong': 'TRP',
        'lnd': 'LnD',
        'gre': 'GRE',
        'sales': 'SLS',
        'marketing': 'MKT',
        'procurement': 'PROC',
        'engineering': 'ENG',
        'engineer': 'ENG',
        'housekeeping': 'HK',
        'hk': 'HK',
        'pest control': 'PEST',
        'human resources': 'HR',
        'hr': 'HR',
        'legal': 'LEGAL',
        'finance': 'FIN',
        'fasilitas': 'FAS',
        'facility': 'FAS',
        'facilities': 'FAS',
        'security': 'SEC',
        'guest relations': 'GR',
        'gr': 'GR',
        'service': 'SRV',
        'bar': 'BAR',
        'spa': 'SPA',
        'tirek': 'TIREK',
        'reservasi': 'RES',
        'reservation': 'RES',
        'sales/marketing': 'RES',
        'sales marketing': 'RES',
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

export { 
    ALL_DEPARTMENTS, 
    DEPARTMENT_SUBDIVISIONS, 
    ALL_DEPARTMENTS as DEPARTMENTS, 
    DEPARTMENT_SUBDIVISIONS as SUBDEPARTMENTS,
    normalizeDepartment
} from './staff';

