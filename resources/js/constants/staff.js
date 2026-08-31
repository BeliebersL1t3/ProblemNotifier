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
    'Engineer',
    'Fasilitas',
    'HK',
    'F&B',
    'GR',
    'HR',
    'IT',
    'OE',
    'Procurement',
    'Sales/Marketing',
    'Reservasi',
    'Finance',
];

// Department Mapping / Alias Normalizer
export const DEPARTMENT_ALIASES = {
    // GR Group
    'service': 'GR',
    'bar': 'GR',
    'spa': 'GR',
    'tirek': 'GR',
    'gr': 'GR',
    'guest relations': 'GR',

    // HR Group
    'legal': 'HR',
    'tekong': 'HR',
    'hr': 'HR',
    'human resources': 'HR',

    // HK Group
    'pest control': 'HK',
    'pestcontrol': 'HK',
    'hk': 'HK',
    'housekeeping': 'HK',

    // Fasilitas Group
    'security': 'Fasilitas',
    'fasilitas': 'Fasilitas',
    'facility': 'Fasilitas',

    // Standalone
    'engineer': 'Engineer',
    'engineering': 'Engineer',
    'maintenance': 'Engineer',
    'f&b': 'F&B',
    'fnb': 'F&B',
    'food & beverage': 'F&B',
    'it': 'IT',
    'oe': 'OE',
    'procurement': 'Procurement',
    'sales/marketing': 'Sales/Marketing',
    'sales marketing': 'Sales/Marketing',
    'reservasi': 'Reservasi',
    'finance': 'Finance',
};

export function normalizeDepartment(deptName) {
    if (!deptName) return '';
    const key = String(deptName).toLowerCase().trim();
    return DEPARTMENT_ALIASES[key] || deptName;
}

export const DEPARTMENT_STAFF = {
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
        'Agus Setiawan',
        'Doni Prasetyo',
        'Security Lead',
    ],
    'HK': [
        'Siti Rahma',
        'Dewi Lestari',
        'Sri Wahyuni',
        'Nurul Aini',
        'Fitri Handayani',
        'Wahyu Hidayat (Pest Control)',
        'Rian Kurniawan (Pest Control)',
        'Pest Control Team',
    ],
    'F&B': [
        'Chef Ricky',
        'Bayu Pratama',
        'Putri Ayu',
        'F&B Kitchen Team',
    ],
    'GR': [
        'Wawan (GR)',
        'Nadia Safitri',
        'Indah Permata',
        'GR Reception Team',
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
    'HR': [
        'Pak Bambang (HR)',
        'Siti HR Specialist',
        'HR Officer',
        'Advokat Hendro (Legal)',
        'Ratna SH (Legal)',
        'Legal Team Lead',
        'Captain Arif (Tekong)',
        'Rudi Hartono (Tekong)',
        'Surya Saputra (Tekong)',
        'Bambang Irawan (Tekong)',
    ],
    'IT': [
        'Reza (IT)',
        'Dani (IT)',
        'IT Support Team',
    ],
    'OE': [
        'Dimas (OE)',
        'OE Operations Lead',
        'Taufik Hidayat',
    ],
    'Procurement': [
        'Procurement Team',
        'Budi Purchasing',
        'Ratna Dewi',
    ],
    'Sales/Marketing': [
        'Clarissa Tan',
        'Sales Lead',
        'Marketing Coordinator',
    ],
    'Reservasi': [
        'Maya Putri',
        'Reservasi Lead',
        'Res Staff',
    ],
    'Finance': [
        'Iwan Accountant',
        'Finance Lead',
        'Finance Officer',
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
