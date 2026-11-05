/**
 * Telunas Geofencing & Location Snapping Service
 * Connects raw GPS coordinates (from WhatsApp Location messages)
 * to official Telunas Private Island (TPI) & Telunas Beach Resort (TBR) masterplan facilities.
 */

// Earth radius in meters
const EARTH_RADIUS_METERS = 6371000;

/**
 * Calculate Great-Circle distance between two coordinates using Haversine formula.
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in meters
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_METERS * c;
}

/**
 * Calibrated GPS Anchors for Telunas Resorts Facilities
 * Sugi Island, Moro, Riau Islands, Indonesia
 */
const FACILITY_ANCHORS = [
    // --- TELUNAS PRIVATE ISLAND (TPI - 22 ZONES) ---
    { num: 1,  resort: 'TPI', id: 'jetty_arrival',           name: 'Jetty Kedatangan',             lat: 0.809800, lng: 103.713500 },
    { num: 2,  resort: 'TPI', id: 'restaurant_office',         name: 'Restoran & Kantor',            lat: 0.810600, lng: 103.714100 },
    { num: 3,  resort: 'TPI', id: 'meeting_room',             name: 'Ruang Pertemuan',              lat: 0.810800, lng: 103.714400 },
    { num: 4,  resort: 'TPI', id: 'pool',                     name: 'Kolam Renang',                 lat: 0.810300, lng: 103.713900 },
    { num: 5,  resort: 'TPI', id: 'manager_house',            name: 'Rumah Manager',                lat: 0.810900, lng: 103.713800 },
    { num: 6,  resort: 'TPI', id: 'spa',                      name: 'Spa Pavillion',                lat: 0.811300, lng: 103.713600 },
    { num: 7,  resort: 'TPI', id: 'villas_overwater',         name: 'Vila Terapung 1–15',           lat: 0.809900, lng: 103.714800 },
    { num: 8,  resort: 'TPI', id: 'boardwalk',                name: 'Pelantar (Boardwalk)',         lat: 0.810200, lng: 103.714500 },
    { num: 9,  resort: 'TPI', id: 'gudang_hk',                name: 'Gudang HK',                    lat: 0.810700, lng: 103.714800 },
    { num: 10, resort: 'TPI', id: 'asrama_staff',             name: 'Asrama Karyawan',              lat: 0.811100, lng: 103.715100 },
    { num: 11, resort: 'TPI', id: 'workshop_wood',            name: 'Bengkel Kayu',                 lat: 0.811400, lng: 103.715500 },
    { num: 12, resort: 'TPI', id: 'asrama_pria',              name: 'Asrama Karyawan Pria',         lat: 0.811200, lng: 103.715300 },
    { num: 13, resort: 'TPI', id: 'asrama_wanita',            name: 'Asrama Karyawan Wanita',       lat: 0.811000, lng: 103.715200 },
    { num: 14, resort: 'TPI', id: 'rumah_karyawan',           name: 'Rumah Karyawan',               lat: 0.811600, lng: 103.715600 },
    { num: 15, resort: 'TPI', id: 'genset_warehouse',         name: 'Gudang / Genset',              lat: 0.811800, lng: 103.715800 },
    { num: 16, resort: 'TPI', id: 'recreation_area',          name: 'Area Rekreasi',                lat: 0.812200, lng: 103.716100 },
    { num: 17, resort: 'TPI', id: 'conservation_education',   name: 'Area Konservasi & Edukasi',    lat: 0.812500, lng: 103.716500 },
    { num: 18, resort: 'TPI', id: 'jetty_logistics',          name: 'Jetty Logistik',               lat: 0.811900, lng: 103.715000 },
    { num: 19, resort: 'TPI', id: 'boat_workshop',            name: 'Bengkel Kapal',                lat: 0.811700, lng: 103.714700 },
    { num: 20, resort: 'TPI', id: 'water_reservoir',          name: 'Reservoir Air',                lat: 0.811200, lng: 103.714300 },
    { num: 21, resort: 'TPI', id: 'villas_ridge',             name: 'Vila Bukit Telunas',           lat: 0.811500, lng: 103.714000 },
    { num: 22, resort: 'TPI', id: 'villas_planned',           name: 'Akomodasi Tamu (Rencana)',     lat: 0.812000, lng: 103.715400 },

    // --- TELUNAS BEACH RESORT (TBR - 11 OVERWATER & BEACH ZONES) ---
    { num: 1,  resort: 'TBR', id: 'tbr_dining',               name: 'Dining Room',                  lat: 0.815400, lng: 103.712600 },
    { num: 2,  resort: 'TBR', id: 'tbr_new_dining',           name: 'New Dining Room',              lat: 0.815500, lng: 103.712800 },
    { num: 3,  resort: 'TBR', id: 'tbr_lounge',               name: 'Lounge Deck',                  lat: 0.815300, lng: 103.712500 },
    { num: 4,  resort: 'TBR', id: 'tbr_bungalow_inner',        name: 'Overwater Bungalow (Tengah)',  lat: 0.815800, lng: 103.713000 },
    { num: 5,  resort: 'TBR', id: 'tbr_bungalow_balcony',      name: 'Overwater Bungalow (Balkon)',  lat: 0.816000, lng: 103.713200 },
    { num: 6,  resort: 'TBR', id: 'tbr_bungalow_3br',          name: '3-Bedroom Bungalow (Loft)',    lat: 0.816300, lng: 103.713400 },
    { num: 7,  resort: 'TBR', id: 'tbr_rooms',                name: 'Overwater Rooms (Kamar Titian)',lat: 0.815700, lng: 103.712900 },
    { num: 8,  resort: 'TBR', id: 'tbr_dorm',                 name: 'Dormitory Room',               lat: 0.815500, lng: 103.712700 },
    { num: 9,  resort: 'TBR', id: 'tbr_meeting',              name: 'Meeting Room',                 lat: 0.815200, lng: 103.712400 },
    { num: 10, resort: 'TBR', id: 'tbr_swimming',             name: 'Swimming Area (Laut)',         lat: 0.815000, lng: 103.712300 },
    { num: 11, resort: 'TBR', id: 'tbr_beach_front',          name: 'Area Pantai & Resepsionis',    lat: 0.814800, lng: 103.712000 },
];

const KANTOR_SEKUPANG_ANCHOR = {
    resort: 'OFFICE',
    id: 'kantor_sekupang',
    name: 'Kantor Sekupang (Batam)',
    lat: 1.125000,
    lng: 103.935000
};

/**
 * Find nearest Telunas facility for given GPS coordinates.
 * @param {number} lat 
 * @param {number} lng 
 * @param {string} rawPlaceName Optional place name provided by WhatsApp
 * @returns {object} Geofence matching result
 */
function findNearestTelunasFacility(lat, lng, rawPlaceName = '') {
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
        return {
            resort: 'TPI',
            zoneId: null,
            facilityNum: null,
            facilityName: rawPlaceName || 'Lokasi Tidak Terdeteksi',
            distanceMeters: null,
            formattedLocation: rawPlaceName || 'TPI - Umum',
            mapsUrl: ''
        };
    }

    const mapsUrl = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

    // Check distance to Batam / Sekupang Office
    const distToBatam = haversineDistance(lat, lng, KANTOR_SEKUPANG_ANCHOR.lat, KANTOR_SEKUPANG_ANCHOR.lng);
    if (distToBatam <= 15000) { // Within 15km of Batam office
        return {
            resort: 'OFFICE',
            zoneId: 'kantor_sekupang',
            facilityNum: null,
            facilityName: 'Kantor Sekupang (Batam)',
            distanceMeters: Math.round(distToBatam),
            formattedLocation: `Kantor Sekupang (GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}) - ${mapsUrl}`,
            mapsUrl,
            isWithinResort: false,
        };
    }

    // Find nearest facility anchor in Telunas (TPI / TBR)
    let minDistance = Infinity;
    let nearestAnchor = FACILITY_ANCHORS[0];

    for (const anchor of FACILITY_ANCHORS) {
        const d = haversineDistance(lat, lng, anchor.lat, anchor.lng);
        if (d < minDistance) {
            minDistance = d;
            nearestAnchor = anchor;
        }
    }

    const roundedDist = Math.round(minDistance);
    const resortTag = nearestAnchor.resort;
    const prefix = `${resortTag} - #${nearestAnchor.num} ${nearestAnchor.name}`;
    
    // If WhatsApp had a custom POI name that is specific (e.g. "Villa 5"), append it
    const extraName = rawPlaceName && !rawPlaceName.toLowerCase().includes('telunas') ? ` (${rawPlaceName})` : '';

    const formattedLocation = `${prefix}${extraName} (GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}) - ${mapsUrl}`;

    return {
        resort: resortTag,
        zoneId: nearestAnchor.id,
        facilityNum: nearestAnchor.num,
        facilityName: nearestAnchor.name,
        distanceMeters: roundedDist,
        formattedLocation,
        mapsUrl,
        isWithinResort: roundedDist <= 600, // Within 600m of Telunas facilities
    };
}

module.exports = {
    haversineDistance,
    FACILITY_ANCHORS,
    findNearestTelunasFacility
};
