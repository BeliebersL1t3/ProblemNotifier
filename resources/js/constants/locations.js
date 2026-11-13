/**
 * Telunas Private Island (TPI) & Telunas Beach Resort (TBR) Location Constants
 * Source: Denah Tata Ruang dan Pengembangan Pulau Telunas (PT Island Connections International)
 */

export const TPI_MASTERPLAN_ZONES = [
    {
        num: 1,
        id: 'jetty_arrival',
        name: 'Jetty Kedatangan',
        enName: 'Arrival Dock',
        x: 6.95,
        y: 24.19,
        keywords: ['jetty kedatangan', 'dermaga kedatangan', 'arrival dock', 'arrival jetty', 'dermaga utama', 'boat arrival', 'dock kedatangan'],
    },
    {
        num: 2,
        id: 'restaurant_office',
        name: 'Restoran & Kantor',
        enName: 'Restaurant & Office',
        x: 14.39,
        y: 36.36,
        keywords: ['restoran', 'restaurant', 'kantor', 'office', 'dining room', 'reception', 'lobby', 'front office', 'kasir', 'bar', 'dapur utama', 'kitchen'],
    },
    {
        num: 3,
        id: 'meeting_room',
        name: 'Ruang Pertemuan',
        enName: 'Meeting Room',
        x: 18.07,
        y: 32.37,
        keywords: ['ruang pertemuan', 'meeting room', 'meeting', 'ruang rapat', 'conference', 'serbaguna'],
    },
    {
        num: 4,
        id: 'pool',
        name: 'Kolam Renang',
        enName: 'Swimming Pool',
        x: 12.91,
        y: 24.42,
        keywords: ['kolam renang', 'swimming pool', 'pool', 'kolam', 'deck pool'],
    },
    {
        num: 5,
        id: 'manager_house',
        name: 'Rumah Manager',
        enName: 'Manager Residence',
        x: 6.49,
        y: 36.22,
        keywords: ['rumah manager', 'manager residence', 'villa manager', 'gm house', 'manager'],
    },
    {
        num: 6,
        id: 'spa',
        name: 'Spa Pavillion',
        enName: 'Spa',
        x: 3.04,
        y: 45.20,
        keywords: ['spa', 'massage', 'spa pavillion', 'balai spa', 'pijat'],
    },
    {
        num: 7,
        id: 'villas_overwater',
        name: 'Akomodasi Tamu (Vila Terapung 1–15)',
        enName: 'Overwater Villas 1-15',
        x: 29.27,
        y: 8.85,
        keywords: ['villa', 'overwater', 'vila terapung', 'kamar', 'bungalow', 'water villa', 'unit'],
    },
    {
        num: 8,
        id: 'boardwalk',
        name: 'Pelantar (Boardwalk)',
        enName: 'Overwater Boardwalk',
        x: 34.28,
        y: 22.60,
        keywords: ['pelantar', 'boardwalk', 'jembatan kayu', 'dermaga kayu penghubung', 'titian', 'pier walk'],
    },
    {
        num: 9,
        id: 'gudang_hk',
        name: 'Gudang HK',
        enName: 'Housekeeping Storage',
        x: 33.57,
        y: 31.47,
        keywords: ['gudang hk', 'housekeeping', 'linen', 'laundry', 'store hk', 'gudang housekeeping'],
    },
    {
        num: 10,
        id: 'asrama_staff',
        name: 'Asrama Karyawan',
        enName: 'Staff Dormitory',
        x: 35.67,
        y: 41.64,
        keywords: ['asrama karyawan', 'mes karyawan', 'staff dorm', 'asrama umum', 'mess staf'],
    },
    {
        num: 11,
        id: 'workshop_wood',
        name: 'Bengkel Kayu',
        enName: 'Carpentry Workshop',
        x: 53.60,
        y: 47.68,
        keywords: ['bengkel kayu', 'carpentry', 'wood workshop', 'pertukangan', 'tukang kayu'],
    },
    {
        num: 12,
        id: 'asrama_pria',
        name: 'Asrama Karyawan Pria',
        enName: 'Male Staff Dorm',
        x: 49.38,
        y: 49.85,
        keywords: ['asrama pria', 'asrama karyawan pria', 'mes pria', 'male dorm', 'mess cowok', 'asrama laki'],
    },
    {
        num: 13,
        id: 'asrama_wanita',
        name: 'Asrama Karyawan Wanita',
        enName: 'Female Staff Dorm',
        x: 47.16,
        y: 47.95,
        keywords: ['asrama wanita', 'asrama karyawan wanita', 'mes wanita', 'female dorm', 'mess cewek', 'asrama perempuan'],
    },
    {
        num: 14,
        id: 'rumah_karyawan',
        name: 'Rumah Karyawan',
        enName: 'Staff House',
        x: 47.74,
        y: 63.18,
        keywords: ['rumah karyawan', 'staff house', 'perumahan staf', 'rumah tinggal karyawan'],
    },
    {
        num: 15,
        id: 'genset_warehouse',
        name: 'Gudang / Genset',
        enName: 'Genset & Powerhouse',
        x: 53.60,
        y: 59.19,
        keywords: ['genset', 'powerhouse', 'gudang genset', 'panel listrik', 'mesin genset', 'utilitas', 'power plant', 'kelistrikan'],
    },
    {
        num: 16,
        id: 'recreation_area',
        name: 'Area Rekreasi',
        enName: 'Recreation Area',
        x: 63.56,
        y: 56.02,
        keywords: ['area rekreasi', 'lapangan', 'recreation', 'games', 'sport', 'lapangan voli', 'taman bermain'],
    },
    {
        num: 17,
        id: 'conservation_education',
        name: 'Area Konservasi & Edukasi',
        enName: 'Conservation & Trail',
        x: 84.46,
        y: 60.80,
        keywords: ['konservasi', 'edukasi', 'conservation', 'jalur treking', 'treking', 'hutan', 'bukit edukasi', 'mangrove', 'bakau'],
    },
    {
        num: 18,
        id: 'jetty_logistics',
        name: 'Jetty Logistik',
        enName: 'Logistics Jetty',
        x: 69.93,
        y: 25.29,
        keywords: ['jetty logistik', 'dermaga logistik', 'cargo jetty', 'supply dock', 'dermaga barang', 'dermaga boat barang'],
    },
    {
        num: 19,
        id: 'boat_workshop',
        name: 'Bengkel Kapal',
        enName: 'Boat Workshop',
        x: 66.64,
        y: 11.33,
        keywords: ['bengkel kapal', 'boat workshop', 'dock boat', 'speed boat', 'perahu', 'slipway', 'mesin kapal'],
    },
    {
        num: 20,
        id: 'water_reservoir',
        name: 'Reservoir Air',
        enName: 'Water Reservoir',
        x: 29.82,
        y: 52.06,
        keywords: ['reservoir air', 'tangki air', 'water tank', 'tandon air', 'pompa air utama', 'toren air', 'penampungan air'],
    },
    {
        num: 21,
        id: 'villas_ridge',
        name: 'Vila Bukit Telunas',
        enName: 'Ridge Guest Villas',
        x: 15.93,
        y: 54.70,
        keywords: ['vila bukit', 'villa bukit', 'hill villa', 'bukit telunas', 'ridge villa', 'villa bukit telunas'],
    },
    {
        num: 22,
        id: 'villas_planned',
        name: 'Akomodasi Tamu (Rencana)',
        enName: 'Planned South Units',
        x: 59.04,
        y: 82.42,
        keywords: ['rencana', 'akomodasi rencana', 'pantai selatan', 'vila rencana'],
    },
];

/**
 * Telunas Beach Resort (TBR) Architectural Masterplan Overwater Zones
 * Source: Architectural site layout & overwater aerial facility diagram
 */
export const TBR_MASTERPLAN_ZONES = [
    {
        num: 1,
        id: 'tbr_dining',
        name: 'Dining Room',
        enName: 'Main Dining Pavilion',
        x: 23.5,
        y: 86.8,
        keywords: ['dining room', 'restoran', 'dining', 'meja makan', 'makan', 'lodge overwater dining', 'restoran lama'],
    },
    {
        num: 2,
        id: 'tbr_new_dining',
        name: 'New Dining Room',
        enName: 'New Dining Room',
        x: 30.2,
        y: 86.8,
        keywords: ['new dining room', 'new dining', 'restoran baru', 'dining baru', 'paviliun makan baru'],
    },
    {
        num: 3,
        id: 'tbr_lounge',
        name: 'Lounge',
        enName: 'Lounge Deck',
        x: 23.0,
        y: 78.5,
        keywords: ['lounge', 'lounge deck', 'balkon santai', 'deck tengah', 'ruang santai'],
    },
    {
        num: 4,
        id: 'tbr_bungalow_inner',
        name: 'Overwater Bungalow (Tengah)',
        enName: 'Inner Overwater Bungalow',
        x: 19.2,
        y: 59.4,
        keywords: ['overwater bungalow tengah', 'bungalow tengah', 'inner bungalow', 'chalet tengah'],
    },
    {
        num: 5,
        id: 'tbr_bungalow_balcony',
        name: 'Overwater Bungalow with Balcony',
        enName: 'Overwater Bungalow with Balcony',
        x: 14.2,
        y: 67.5,
        keywords: ['overwater bungalow with balcony', 'overwater bungalow', 'bungalow with balcony', 'chalet balkon', 'villa balkon', 'chalet timur'],
    },
    {
        num: 6,
        id: 'tbr_bungalow_3br',
        name: 'Overwater 3-Bedroom Bungalow (Loft & Balcony)',
        enName: '3-Bedroom Bungalow with Loft',
        x: 14.2,
        y: 88.0,
        keywords: ['3 bedroom', '3-bedroom', 'bungalow loft', '3 br', 'villa 3 kamar', 'family bungalow', 'loft & balcony', 'villa selatan'],
    },
    {
        num: 7,
        id: 'tbr_rooms',
        name: 'Overwater Rooms',
        enName: 'Overwater Rooms (West)',
        x: 28.0,
        y: 53.5,
        keywords: ['overwater room', 'kamar overwater', 'room 1', 'room 2', 'room 3', 'room 4', 'kamar barat', 'kamar titian'],
    },
    {
        num: 8,
        id: 'tbr_dorm',
        name: 'Dorm Room',
        enName: 'Dormitory Rooms',
        x: 28.0,
        y: 65.5,
        keywords: ['dorm room', 'dorm', 'dormitory', 'kamar dorm', 'asrama', 'mes', 'kamar staf titian'],
    },
    {
        num: 9,
        id: 'tbr_meeting',
        name: 'Meeting Room',
        enName: 'Meeting Room',
        x: 28.0,
        y: 43.8,
        keywords: ['meeting room', 'ruang pertemuan', 'ruang rapat', 'meeting', 'briefing room', 'serbaguna tbr'],
    },
    {
        num: 10,
        id: 'tbr_swimming',
        name: 'Swimming Area',
        enName: 'Designated Swimming Area',
        x: 51.5,
        y: 78.0,
        keywords: ['swimming area', 'area berenang', 'kolam laut', 'laut renang', 'swimming', 'lagoon'],
    },
    {
        num: 11,
        id: 'tbr_beach_front',
        name: 'Area Pantai & Resepsionis',
        enName: 'Beachfront & Reception',
        x: 45.0,
        y: 18.5,
        keywords: ['beach', 'pantai', 'resepsionis', 'reception', 'dapur', 'kitchen', 'genset', 'kantor tbr', 'mes staf tbr', 'dermaga boat tbr', 'kids club'],
    },
];

/**
 * Quick selectable presets for TPI in report / edit issue forms
 */
export const TPI_PRESET_LOCATIONS = [
    'Vila Terapung 01', 'Vila Terapung 02', 'Vila Terapung 03', 'Vila Terapung 04', 'Vila Terapung 05',
    'Vila Terapung 06', 'Vila Terapung 07', 'Vila Terapung 08', 'Vila Terapung 09', 'Vila Terapung 10',
    'Vila Terapung 11', 'Vila Terapung 12', 'Vila Terapung 13', 'Vila Terapung 14', 'Vila Terapung 15',
    'Restoran & Kantor', 'Kolam Renang', 'Jetty Kedatangan', 'Ruang Pertemuan', 'Spa Pavillion',
    'Pelantar', 'Vila Bukit Telunas', 'Gudang HK', 'Gudang / Genset', 'Bengkel Kayu',
    'Jetty Logistik', 'Bengkel Kapal', 'Reservoir Air', 'Asrama Karyawan Pria', 'Asrama Karyawan Wanita',
    'Rumah Manager', 'Rumah Karyawan', 'Area Rekreasi', 'Area Konservasi & Edukasi'
];

/**
 * Quick selectable presets for TBR (Telunas Beach Resort)
 */
export const TBR_PRESET_LOCATIONS = [
    'Dining Room (Overwater)', 'New Dining Room', 'Lounge Deck', 'Meeting Room',
    'Overwater Bungalow with Balcony', 'Overwater 3-Bedroom Bungalow (Loft)',
    'Overwater Bungalow (Tengah)', 'Overwater Rooms (Kamar Titian)', 'Dorm Room',
    'Swimming Area (Laut)', 'Area Pantai & Resepsionis', 'Restoran & Dapur Pantai',
    'Dermaga Boat TBR', 'Genset & Utilitas TBR', 'Mes Staf TBR'
];

/**
 * Resolves an issue to its corresponding Resort ('TPI', 'TBR', or 'OFFICE')
 * and matching spatial masterplan zone.
 */
export function resolveIssueResortAndZone(issue) {
    if (!issue) return { resort: null, zoneId: null, zoneName: null, isOffice: false };

    const loc = (issue.location || '').toLowerCase().trim();
    const title = (issue.title || '').toLowerCase().trim();
    const desc = (issue.description || '').toLowerCase().trim();
    const fullText = `${loc} ${title} ${desc}`;

    // Check if Office / Kantor
    const isOffice = (
        loc.startsWith('kantor') || 
        loc.startsWith('office') || 
        (loc.includes('kantor') && !loc.includes('tpi') && !loc.includes('tbr') && !loc.includes('restoran'))
    );

    if (isOffice) {
        return { resort: 'OFFICE', zoneId: null, zoneName: 'Kantor / Office', isOffice: true };
    }

    const isTbr = loc.includes('tbr') || loc.includes('beach resort') || title.includes('tbr');
    const isTpi = loc.includes('tpi') || loc.includes('private island') || title.includes('tpi') || Boolean(loc.match(/#(\d+)/));

    // If neither TPI nor TBR is explicitly specified, it is an unmapped general/operational issue (not on map)
    if (!isTbr && !isTpi) {
        return { resort: null, zoneId: null, zoneName: null, isOffice: false };
    }

    const resort = isTbr ? 'TBR' : 'TPI';

    let matchedKey = null;
    let matchedZone = null;

    // Direct #num match (e.g. from WhatsApp geofence: "TPI - #2 Restoran & Kantor")
    const numMatch = loc.match(/#(\d+)/);
    if (numMatch) {
        const targetNum = parseInt(numMatch[1], 10);
        const candidateList = isTbr ? TBR_MASTERPLAN_ZONES : TPI_MASTERPLAN_ZONES;
        const byNum = candidateList.find(z => z.num === targetNum);
        if (byNum) {
            matchedKey = byNum.id;
            matchedZone = byNum;
            return {
                resort,
                zoneId: matchedKey,
                zoneName: matchedZone.name,
                zone: matchedZone,
                isOffice: false,
            };
        }
    }

    if (isTbr) {
        if (loc.includes('3 bedroom') || loc.includes('3-bedroom') || loc.includes('3 br') || fullText.includes('loft') || fullText.includes('3 bedroom')) {
            matchedKey = 'tbr_bungalow_3br';
        } else if (loc.includes('balcony') || loc.includes('balkon') || fullText.includes('bungalow with balcony') || loc.includes('chalet timur')) {
            matchedKey = 'tbr_bungalow_balcony';
        } else if (loc.includes('new dining') || loc.includes('dining baru') || loc.includes('restoran baru')) {
            matchedKey = 'tbr_new_dining';
        } else if (loc.includes('dining') || loc.includes('restoran') || loc.includes('lodge')) {
            matchedKey = 'tbr_dining';
        } else if (loc.includes('lounge') || loc.includes('deck')) {
            matchedKey = 'tbr_lounge';
        } else if (loc.includes('meeting') || loc.includes('rapat') || loc.includes('serbaguna')) {
            matchedKey = 'tbr_meeting';
        } else if (loc.includes('dorm') || loc.includes('asrama')) {
            matchedKey = 'tbr_dorm';
        } else if (loc.includes('swimming') || loc.includes('renang') || loc.includes('laut') || loc.includes('lagoon')) {
            matchedKey = 'tbr_swimming';
        } else if (loc.includes('chalet') || loc.includes('kamar') || loc.includes('room')) {
            if (loc.includes('tengah') || loc.includes('inner')) {
                matchedKey = 'tbr_bungalow_inner';
            } else {
                matchedKey = 'tbr_rooms';
            }
        } else {
            for (const zone of TBR_MASTERPLAN_ZONES) {
                const hasKeyword = zone.keywords.some(kw => fullText.includes(kw));
                if (hasKeyword) {
                    matchedKey = zone.id;
                    break;
                }
            }
        }
        matchedZone = matchedKey ? TBR_MASTERPLAN_ZONES.find(z => z.id === matchedKey) : null;
    } else {
        // TPI matching against 22 official masterplan facilities
        if (loc.includes('bukit') || fullText.includes('vila bukit') || fullText.includes('villa bukit') || fullText.includes('ridge')) {
            matchedKey = 'villas_ridge';
        } else if (loc.includes('villa') || loc.includes('kamar') || loc.includes('overwater')) {
            matchedKey = 'villas_overwater';
        } else {
            for (const zone of TPI_MASTERPLAN_ZONES) {
                if (zone.id === 'villas_overwater' || zone.id === 'villas_ridge') continue;
                const hasKeyword = zone.keywords.some(kw => fullText.includes(kw));
                if (hasKeyword) {
                    matchedKey = zone.id;
                    break;
                }
            }
        }
        matchedZone = matchedKey ? TPI_MASTERPLAN_ZONES.find(z => z.id === matchedKey) : null;
    }

    return {
        resort: matchedZone ? resort : null,
        zoneId: matchedKey,
        zoneName: matchedZone ? matchedZone.name : null,
        zone: matchedZone,
        isOffice: false,
    };
}
