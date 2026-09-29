/**
 * Consolidated Resort Departments & Staff Rosters
 * 
 * Combinations:
 * - GR: GR + Service + Bar + Spa + TiRek
 * - HR: HR + Legal + Tekong
 * - HK: HK + Pest Control
 * - Fasilitas: Fasilitas + Security
 */

export const ALL_DEPARTMENTS = [
    'HR',
    'GR',
    'OE',
    'Kitchen',
    'HK',
    'IT',
    'Procurement',
    'Finance',
    'Reservasi',
    'Engineer',
    'Fasilitas',
];

// Sub-units / Sub-Departments under each parent department
export const DEPARTMENT_SUBDIVISIONS = {
    'HR': ['HR', 'Legal', 'LnD', 'Transportasi', 'Tekong'],
    'GR': ['GRE', 'Service', 'TIrek', 'Spa', 'Bar'],
    'OE': ['OE'],
    'Kitchen': ['Kitchen'],
    'HK': ['HK', 'Pest Control'],
    'IT': ['IT'],
    'Procurement': ['Procurement'],
    'Finance': ['Finance'],
    'Reservasi': ['Reservasi', 'Sales', 'Marketing'],
    'Engineer': ['Engineer'],
    'Fasilitas': ['Fasilitas', 'Security'],
};

// Department Mapping / Alias Normalizer
export const DEPARTMENT_ALIASES = {
    // 🏢 HR Group
    'hr': 'HR',
    'human resources': 'HR',
    'legal': 'HR',
    'lnd': 'HR',
    'learning & development': 'HR',
    'transportasi': 'HR',
    'tekong': 'HR',

    // 🌟 GR Group
    'gr': 'GR',
    'gre': 'GR',
    'guest relations': 'GR',
    'service': 'GR',
    'bar': 'GR',
    'spa': 'GR',
    'tirek': 'GR',

    // 💡 OE Group
    'oe': 'OE',

    // 🍳 Kitchen Group (formerly F&B)
    'kitchen': 'Kitchen',
    'f&b': 'Kitchen',
    'fnb': 'Kitchen',
    'food & beverage': 'Kitchen',

    // 🧹 HK Group
    'hk': 'HK',
    'housekeeping': 'HK',
    'pest control': 'HK',
    'pestcontrol': 'HK',

    // 💻 IT Group
    'it': 'IT',
    'it & technology': 'IT',

    // 📦 Procurement Group
    'procurement': 'Procurement',

    // 💵 Finance Group
    'finance': 'Finance',

    // 🛎️ Reservasi Group (includes Sales & Marketing)
    'reservasi': 'Reservasi',
    'reservation': 'Reservasi',
    'sales': 'Reservasi',
    'marketing': 'Reservasi',
    'sales/marketing': 'Reservasi',
    'sales marketing': 'Reservasi',

    // 🔧 Engineer Group
    'engineer': 'Engineer',
    'engineering': 'Engineer',
    'maintenance': 'Engineer',

    // 🛠️ Fasilitas Group
    'fasilitas': 'Fasilitas',
    'facility': 'Fasilitas',
    'facilities': 'Fasilitas',
    'security': 'Fasilitas',
};

export function normalizeDepartment(deptName) {
    if (!deptName) return '';
    const key = String(deptName).toLowerCase().trim();
    return DEPARTMENT_ALIASES[key] || deptName;
}

export const DEPARTMENT_STAFF = {
    'HR': [
        'Pak Bambang (HR)',
        'Siti HR Specialist',
        'HR Officer',
        'Advokat Hendro (Legal)',
        'Ratna SH (Legal)',
        'Legal Team Lead',
        'Putri (LnD)',
        'LnD Specialist',
        'Captain Arif (Transportasi)',
        'Rudi Hartono (Transportasi)',
        'Surya Saputra (Transportasi)',
    ],
    'GR': [
        'Wawan (GRE)',
        'Nadia Safitri (GRE)',
        'Indah Permata (GRE)',
        'GRE Team',
        'Andi Kurnia (Service)',
        'Rina Marlina (Service)',
        'Dian Anggraini (Service)',
        'Lia (Bar)',
        'Kevin Sanjaya (Bar)',
        'Nurse Maya (Spa)',
        'Sari Wulandari (Spa)',
        'Yanti Komala (Spa)',
        'TiRek Coordinator',
        'Fajar Ramadhan (TiRek)',
    ],
    'OE': [
        'Dimas (OE)',
        'OE Operations Lead',
        'Taufik Hidayat',
    ],
    'Kitchen': [
        'Chef Ricky (Kitchen)',
        'Bayu Pratama (Kitchen)',
        'Putri Ayu (Kitchen)',
        'Kitchen Team',
    ],
    'HK': [
        'Siti Rahma (HK)',
        'Dewi Lestari (HK)',
        'Sri Wahyuni (HK)',
        'Nurul Aini (HK)',
        'Fitri Handayani (HK)',
        'Wahyu Hidayat (Pest Control)',
        'Rian Kurniawan (Pest Control)',
        'Pest Control Team',
    ],
    'IT': [
        'Reza (IT)',
        'Dani (IT)',
        'IT Support Team',
    ],
    'Procurement': [
        'Procurement Team',
        'Budi Purchasing',
        'Ratna Dewi',
    ],
    'Finance': [
        'Iwan Accountant',
        'Finance Lead',
        'Finance Officer',
    ],
    'Reservasi': [
        'Maya Putri (Reservasi)',
        'Reservasi Lead',
        'Res Staff',
        'Clarissa Tan (Sales)',
        'Sales Lead',
        'Ana (Marketing)',
        'Marketing Coordinator',
    ],
    'Engineer': [
        'Dimas Pratama',
        'Budi Santoso',
        'Ahmad Fauzi',
        'Hendra Wijaya',
        'Joko Susilo',
    ],
    'Fasilitas': [
        'Anto (Fasilitas)',
        'Dedi Kusuma',
        'Eko Purnomo',
        'Fasilitas Team',
        'Pak Joko (Security)',
        'Agus Setiawan (Security)',
        'Doni Prasetyo (Security)',
        'Security Lead',
    ],
};

let dynamicRosterCache = null;
let archivedStaffCache = new Set();

/**
 * Cache or update the dynamic staff roster from the database (active users).
 */
export function setDynamicStaffRoster(roster) {
    if (roster && typeof roster === 'object') {
        dynamicRosterCache = roster;
    }
}

export function getDynamicStaffRoster() {
    return dynamicRosterCache;
}

/**
 * Cache or update the list of archived (soft-deleted) staff names.
 */
export function setArchivedStaffNames(names) {
    if (Array.isArray(names)) {
        archivedStaffCache = new Set(
            names
                .filter(Boolean)
                .map(n => String(n).toLowerCase().trim())
        );
    }
}

export function getArchivedStaffNames() {
    return archivedStaffCache;
}

function isStaffArchived(name, archivedSet) {
    if (!name || typeof name !== 'string') return false;
    const nLower = name.toLowerCase().trim();
    const nClean = name.replace(/\([^)]*\)/g, '').trim().toLowerCase();
    return archivedSet.has(nLower) || (nClean && archivedSet.has(nClean));
}

/**
 * Returns the list of staff names for a given department.
 * - If real active users exist in the database for this department, they are used exclusively.
 * - Soft-deleted (archived) users are strictly excluded.
 * - Fallback static roster is only used if NO registered database accounts exist for this department.
 */
export function getStaffForDepartment(departmentName, overrideRoster = null, overrideArchived = null) {
    if (!departmentName) return [];
    const normalized = normalizeDepartment(departmentName);
    const dynamic = overrideRoster || dynamicRosterCache;
    const archived = overrideArchived ? new Set(overrideArchived.map(n => String(n).toLowerCase().trim())) : archivedStaffCache;

    // 1. Get base static roster
    let staticList = DEPARTMENT_STAFF[normalized] || [];
    if (!staticList.length) {
        const key = Object.keys(DEPARTMENT_STAFF).find(
            (k) => k.toLowerCase() === normalized.toLowerCase()
        );
        if (key && DEPARTMENT_STAFF[key]) {
            staticList = DEPARTMENT_STAFF[key];
        }
    }

    // 2. Extract dynamic staff assigned to this department
    let dynamicList = [];
    if (dynamic && typeof dynamic === 'object') {
        const dynKey = Object.keys(dynamic).find(
            (k) => normalizeDepartment(k).toLowerCase() === normalized.toLowerCase()
        );
        if (dynKey && Array.isArray(dynamic[dynKey])) {
            dynamicList = dynamic[dynKey].filter(name => !isStaffArchived(name, archived));
        }
    }

    // If dynamic active accounts exist in the database for this department, USE THEM as the true roster!
    // Do NOT pollute with hardcoded dummy/deleted staff.
    if (dynamicList.length > 0) {
        return dynamicList;
    }

    // 3. Fallback: only if NO dynamic database accounts exist for this department, use static fallback
    if (!dynamic || typeof dynamic !== 'object') {
        return staticList.filter(name => !isStaffArchived(name, archived));
    }

    // Find any users who currently belong to a DIFFERENT department in the database
    const otherDeptUsers = new Set();
    Object.entries(dynamic).forEach(([dKey, staffArr]) => {
        if (normalizeDepartment(dKey).toLowerCase() !== normalized.toLowerCase() && Array.isArray(staffArr)) {
            staffArr.forEach(name => {
                if (name && typeof name === 'string') {
                    otherDeptUsers.add(name.toLowerCase().trim());
                    const cleanBase = name.replace(/\([^)]*\)/g, '').trim().toLowerCase();
                    if (cleanBase) otherDeptUsers.add(cleanBase);
                }
            });
        }
    });

    // Filter static list: remove any static name that matches a user now in another department OR is archived
    return staticList.filter(sName => {
        if (!sName || typeof sName !== 'string') return false;
        if (isStaffArchived(sName, archived)) return false;
        const sNorm = sName.toLowerCase().trim();
        const sClean = sName.replace(/\([^)]*\)/g, '').trim().toLowerCase();
        return !otherDeptUsers.has(sNorm) && !otherDeptUsers.has(sClean);
    });
}

/**
 * Detects / returns the department for a given staff name string.
 * Priority: Dynamic database roster -> Issue context -> Static roster
 */
export function getDepartmentForStaff(staffName, issue = null, overrideRoster = null) {
    if (!staffName || typeof staffName !== 'string') return null;

    const cleanStaff = staffName.replace(/\s*via\s+WhatsApp/i, '').trim().toLowerCase();
    const dynamic = overrideRoster || dynamicRosterCache;

    // 1. Dynamic active database accounts (reflects real-time transfers)
    if (dynamic && typeof dynamic === 'object') {
        for (const [dept, roster] of Object.entries(dynamic)) {
            if (Array.isArray(roster)) {
                if (roster.some(name => {
                    const n = String(name).toLowerCase().trim();
                    return n === cleanStaff || cleanStaff.includes(n) || n.includes(cleanStaff);
                })) {
                    return normalizeDepartment(dept);
                }
            }
        }
    }

    // 2. Department tag in parentheses e.g. "Ana (Marketing)"
    const match = staffName.match(/\(([^)]+)\)/);
    if (match && match[1]) {
        const potentialDept = normalizeDepartment(match[1].trim());
        const found = ALL_DEPARTMENTS.find(
            d => d.toLowerCase() === potentialDept.toLowerCase() ||
                 (potentialDept.toLowerCase() === 'eng' && d === 'Engineer')
        );
        if (found) return found;
    }

    // 3. Issue candidate departments
    if (issue) {
        const candidateDepts = [
            ...(Array.isArray(issue.assignedDepartments) ? issue.assignedDepartments : (issue.assignedDepartments ? [issue.assignedDepartments] : [])),
            ...(Array.isArray(issue.taggedDepartments) ? issue.taggedDepartments : (issue.taggedDepartments ? [issue.taggedDepartments] : [])),
            ...(issue.department ? [issue.department] : [])
        ].map(d => normalizeDepartment(d));

        for (const dept of candidateDepts) {
            const roster = getStaffForDepartment(dept, dynamic);
            if (roster.some(name => {
                const n = String(name).toLowerCase().trim();
                return n === cleanStaff || cleanStaff.includes(n) || n.includes(cleanStaff);
            })) {
                return dept;
            }
        }
    }

    // 4. Default static roster
    for (const [dept, roster] of Object.entries(DEPARTMENT_STAFF)) {
        if (roster.some(name => {
            const n = String(name).toLowerCase().trim();
            return n === cleanStaff || cleanStaff.includes(n) || n.includes(cleanStaff);
        })) {
            return dept;
        }
    }

    for (const dept of ALL_DEPARTMENTS) {
        if (cleanStaff.includes(dept.toLowerCase())) {
            return dept;
        }
    }

    return null;
}
