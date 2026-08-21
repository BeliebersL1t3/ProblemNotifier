/**
 * Complete list of 20 Resort Departments & Staff Rosters
 */
export const ALL_DEPARTMENTS = [
    'Engineer',
    'Tekong',
    'Pest Control',
    'Security',
    'Fasilitas',
    'HK',
    'F&B',
    'Service',
    'Bar',
    'GR',
    'Spa',
    'TiRek',
    'OE',
    'IT',
    'Procurement',
    'Sales/Marketing',
    'Reservasi',
    'Finance',
    'Legal',
    'HR',
];

export const DEPARTMENT_STAFF = {
    'Engineer': [
        'Dimas Pratama',
        'Budi Santoso',
        'Ahmad Fauzi',
        'Hendra Wijaya',
        'Joko Susilo',
    ],
    'Tekong': [
        'Captain Arif',
        'Rudi Hartono',
        'Surya Saputra',
        'Bambang Irawan',
    ],
    'Pest Control': [
        'Wahyu Hidayat',
        'Rian Kurniawan',
        'Pest Control Team',
    ],
    'Security': [
        'Pak Joko (Security)',
        'Agus Setiawan',
        'Doni Prasetyo',
        'Security Lead',
    ],
    'Fasilitas': [
        'Anto (Fasilitas)',
        'Dedi Kusuma',
        'Eko Purnomo',
        'Fasilitas Team',
    ],
    'HK': [
        'Siti Rahma',
        'Dewi Lestari',
        'Sri Wahyuni',
        'Nurul Aini',
        'Fitri Handayani',
    ],
    'F&B': [
        'Chef Ricky',
        'Bayu Pratama',
        'Putri Ayu',
        'F&B Kitchen Team',
    ],
    'Service': [
        'Andi Kurnia',
        'Rina Marlina',
        'Dian Anggraini',
        'Service Captain',
    ],
    'Bar': [
        'Lia (Bar)',
        'Kevin Sanjaya',
        'Bar Team Lead',
    ],
    'GR': [
        'Wawan (GR)',
        'Nadia Safitri',
        'Indah Permata',
        'GR Reception Team',
    ],
    'Spa': [
        'Nurse Maya',
        'Sari Wulandari',
        'Yanti Komala',
        'Spa Therapist Lead',
    ],
    'TiRek': [
        'TiRek Coordinator',
        'Fajar Ramadhan',
        'Activity Guide Team',
    ],
    'OE': [
        'Dimas (OE)',
        'OE Operations Lead',
        'Taufik Hidayat',
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
    'Legal': [
        'Advokat Hendro',
        'Ratna SH (Legal)',
        'Legal Team Lead',
    ],
    'HR': [
        'Pak Bambang (HR)',
        'Siti HR Specialist',
        'HR Officer',
    ],
};

/**
 * Returns the list of staff names for a given department.
 * Falls back to empty array if not found.
 */
export function getStaffForDepartment(departmentName) {
    if (!departmentName) return [];

    // Exact match
    if (DEPARTMENT_STAFF[departmentName]) {
        return DEPARTMENT_STAFF[departmentName];
    }

    // Case-insensitive match
    const key = Object.keys(DEPARTMENT_STAFF).find(
        (k) => k.toLowerCase() === departmentName.toLowerCase()
    );
    if (key && DEPARTMENT_STAFF[key]) {
        return DEPARTMENT_STAFF[key];
    }

    return [];
}
