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
    'HR': ['HR', 'Legal', 'LnD', 'Transportasi'],
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

/**
 * Returns the list of staff names for a given department.
 */
export function getStaffForDepartment(departmentName) {
    if (!departmentName) return [];
    const normalized = normalizeDepartment(departmentName);

    if (DEPARTMENT_STAFF[normalized]) {
        return DEPARTMENT_STAFF[normalized];
    }

    const key = Object.keys(DEPARTMENT_STAFF).find(
        (k) => k.toLowerCase() === normalized.toLowerCase()
    );
    if (key && DEPARTMENT_STAFF[key]) {
        return DEPARTMENT_STAFF[key];
    }

    return [];
}

/**
 * Detects / returns the department for a given staff name string.
 */
export function getDepartmentForStaff(staffName, issue = null) {
    if (!staffName || typeof staffName !== 'string') return null;

    const cleanStaff = staffName.replace(/\s*via\s+WhatsApp/i, '').trim();

    const match = cleanStaff.match(/\(([^)]+)\)/);
    if (match && match[1]) {
        const potentialDept = normalizeDepartment(match[1].trim());
        const found = ALL_DEPARTMENTS.find(
            d => d.toLowerCase() === potentialDept.toLowerCase() ||
                 (potentialDept.toLowerCase() === 'eng' && d === 'Engineer')
        );
        if (found) return found;
    }

    if (issue) {
        const candidateDepts = [
            ...(Array.isArray(issue.assignedDepartments) ? issue.assignedDepartments : (issue.assignedDepartments ? [issue.assignedDepartments] : [])),
            ...(Array.isArray(issue.taggedDepartments) ? issue.taggedDepartments : (issue.taggedDepartments ? [issue.taggedDepartments] : [])),
            ...(issue.department ? [issue.department] : [])
        ].map(d => normalizeDepartment(d));

        for (const dept of candidateDepts) {
            const roster = getStaffForDepartment(dept);
            if (roster.some(name => name.toLowerCase() === cleanStaff.toLowerCase() || cleanStaff.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(cleanStaff.toLowerCase()))) {
                return dept;
            }
        }
    }

    for (const [dept, roster] of Object.entries(DEPARTMENT_STAFF)) {
        if (roster.some(name => name.toLowerCase() === cleanStaff.toLowerCase() || cleanStaff.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(cleanStaff.toLowerCase()))) {
            return dept;
        }
    }

    for (const dept of ALL_DEPARTMENTS) {
        if (cleanStaff.toLowerCase().includes(dept.toLowerCase())) {
            return dept;
        }
    }

    return null;
}
