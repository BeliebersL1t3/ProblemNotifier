/**
 * Telunas CampusFix - WhatsApp Bot V2
 * 
 * Architecture:
 * 1. Reporting 100% via WhatsApp DM (Zero friction, auto-detect staff identity).
 * 2. Single target department selection (no multi-dept confusion).
 * 3. Dual Group Dispatch:
 *    - Location Group (TBR / TPC / Kantor): FYI Read-only broadcast.
 *    - Department Group: Action hub for `ambil`, `edit`, `selesai`.
 * 4. List commands (`list menunggu`, `list progress`, `list pending`, `list selesai`):
 *    - If DM: answers immediately for caller's department.
 *    - If Group: delivers list to caller's DM to keep group clean.
 * 5. Reassignment (`edit [ID] ke [DEPT] [Alasan]`):
 *    - Releases ticket, updates target dept, resets status to open, logs transfer history,
 *      and notifies old group, new group, and reporter's DM.
 */

const { makeWASocket, makeCacheableSignalKeyStore, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const FormData = require('form-data');
const express = require('express');
const crypto = require('crypto');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { getAuthFolderStats, cleanAuthFolder, setupHousekeepingSchedule } = require('./housekeeping');
const {
    useSqliteAuthState,
    resetAuthDirectory,
    clearSessionKeysById,
    pruneCorruptedSessionRows,
    getAuthDbPath,
} = require('./sqliteAuthState');
const { findNearestTelunasFacility } = require('./services/telunasGeofence');

const AUTH_DIR = path.resolve(__dirname, 'auth_info_baileys');
const authCacheLogger = pino({ level: 'silent' });

const app = express();
app.use(express.json());

// ─── Environment & Base URL Configuration ─────────────────────────────────────
function readEnvVar(keys) {
    for (const key of keys) {
        if (process.env[key]) {
            return String(process.env[key]).trim().replace(/^(['"])(.*)\1$/, '$2');
        }
    }
    for (const envPath of ['.env', '../.env']) {
        if (fs.existsSync(envPath)) {
            try {
                const envContent = fs.readFileSync(envPath, 'utf8');
                for (const key of keys) {
                    const regex = new RegExp(`^${key}=([^\\r\\n]+)$`, 'm');
                    const match = envContent.match(regex);
                    if (match && match[1]) {
                        return match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
                    }
                }
            } catch (e) {
                console.warn(`[Env] Gagal membaca ${envPath}:`, e.message);
            }
        }
    }
    return '';
}

const BASE_URL = readEnvVar(['BASE_URL', 'APP_URL']) || 'http://TelunasIssueTracker.test';
const BOT_API_KEY = readEnvVar(['BOT_API_KEY']);
const BOT_PORT = (() => {
    const p = Number(readEnvVar(['BOT_PORT']));
    return Number.isInteger(p) && p > 0 && p <= 65535 ? p : 3000;
})();

if (!BOT_API_KEY) {
    console.warn('[Security Warning] BOT_API_KEY is not set in .env! Endpoint sensitif akan menolak akses dan sinkronisasi CSRF Laravel dapat gagal.');
}
axios.defaults.headers.common['X-Bot-Key'] = BOT_API_KEY;

// ─── Constants: Department Catalog & Abbreviations ────────────────────────────
const OFFICIAL_DEPARTMENTS = [
    { code: 'ENG', name: 'Engineer', key: 'engineer' },
    { code: 'HK',  name: 'Housekeeping', key: 'hk' },
    { code: 'FAS', name: 'Fasilitas', key: 'fasilitas' },
    { code: 'KTC', name: 'Kitchen', key: 'kitchen' },
    { code: 'IT',  name: 'IT', key: 'it' },
    { code: 'GR',  name: 'Guest Relations', key: 'gr' },
    { code: 'HR',  name: 'HR', key: 'hr' },
    { code: 'FIN', name: 'Finance', key: 'finance' },
    { code: 'PRC', name: 'Procurement', key: 'procurement' },
    { code: 'RES', name: 'Reservasi', key: 'reservasi' },
    { code: 'OE',  name: 'OE', key: 'oe' }
];

const SUBDEPARTMENT_TO_MAIN = {
    'hr': 'hr', 'legal': 'hr', 'lnd': 'hr', 'transportasi': 'hr', 'tekong': 'hr', 'human resources': 'hr',
    'gr': 'gr', 'gre': 'gr', 'guest relations': 'gr', 'service': 'gr', 'bar': 'gr', 'spa': 'gr', 'tirek': 'gr',
    'kitchen': 'kitchen', 'f&b': 'kitchen', 'fnb': 'kitchen', 'food & beverage': 'kitchen',
    'hk': 'hk', 'housekeeping': 'hk', 'pest control': 'hk', 'pestcontrol': 'hk',
    'engineer': 'engineer', 'engineering': 'engineer', 'maintenance': 'engineer',
    'fasilitas': 'fasilitas', 'facilities': 'fasilitas', 'facility': 'fasilitas', 'security': 'fasilitas',
    'it': 'it', 'edp': 'it',
    'procurement': 'procurement', 'purchasing': 'procurement', 'logistic': 'procurement', 'logistik': 'procurement',
    'finance': 'finance', 'accounting': 'finance',
    'reservasi': 'reservasi', 'reservation': 'reservasi', 'sales': 'reservasi', 'marketing': 'reservasi', 'sales/marketing': 'reservasi',
    'oe': 'oe', 'operational excellence': 'oe'
};

function normalizeDept(input) {
    if (!input) return null;
    const clean = String(input).trim().toLowerCase();
    const mapped = SUBDEPARTMENT_TO_MAIN[clean] || clean;
    return OFFICIAL_DEPARTMENTS.find(d => d.key === mapped || d.code.toLowerCase() === mapped || d.name.toLowerCase() === mapped) || null;
}

// ─── Group Configuration ──────────────────────────────────────────────────────
let botConfig = {
    generalGroupId: null,
    locationGroups: {
        tbr: null,
        tpc: null,
        kantor: null
    },
    departmentGroups: {},
    lastKnownBotPhone: null
};

function loadConfig() {
    try {
        if (fs.existsSync('config.json')) {
            const raw = JSON.parse(fs.readFileSync('config.json', 'utf8'));
            botConfig.generalGroupId = raw.generalGroupId || null;
            botConfig.locationGroups = {
                tbr: null,
                tpc: null,
                kantor: null,
                ...(raw.locationGroups || {})
            };
            botConfig.departmentGroups = raw.departmentGroups || {};
            botConfig.lastKnownBotPhone = raw.lastKnownBotPhone || null;
        }
    } catch (e) {
        console.error('[Config] Error loading config.json:', e.message);
    }
}

function saveConfig() {
    try {
        fs.writeFileSync('config.json', JSON.stringify(botConfig, null, 2), 'utf8');
    } catch (e) {
        console.error('[Config] Error saving config.json:', e.message);
    }
}
loadConfig();

// Real-time Pairing & Connection State for Dashboard Control
let globalSock = null;
let currentAuthHandle = null;
let currentCachedKeys = null;
let latestQrString = null;
let latestQrDataUrl = null;
let activePairingCode = null;
let activePairingPhone = null;
let botConnectionStatus = 'offline'; // 'offline' | 'connecting' | 'qr_ready' | 'pairing_ready' | 'connected'
let announceNumberChangeOnConnect = false;
let staffSyncTimer = null;
let housekeepingScheduled = false;

async function invalidateAuthKeyCache() {
    if (!currentCachedKeys || typeof currentCachedKeys.clear !== 'function') return;
    try {
        await currentCachedKeys.clear();
    } catch (err) {
        console.warn('[AuthCache V2] Gagal membersihkan cache key in-memory:', err.message);
    }
}

async function resetCurrentAuthState() {
    await invalidateAuthKeyCache();
    currentCachedKeys = null;
    if (currentAuthHandle) {
        currentAuthHandle.close();
        currentAuthHandle = null;
    }
    return resetAuthDirectory(AUTH_DIR);
}

// ─── Staff Phone Directory & Verification ─────────────────────────────────────
let staffPhones = {};

function normalizePhoneNumber(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
        clean = '62' + clean.substring(1);
    } else if (clean.startsWith('8')) {
        clean = '62' + clean;
    }
    return clean;
}

function loadStaffPhones() {
    try {
        if (fs.existsSync('staff_phones.json')) {
            staffPhones = JSON.parse(fs.readFileSync('staff_phones.json', 'utf8'));
        }
    } catch (e) {
        console.error('[Staff] Error loading staff_phones.json:', e.message);
    }
}

function saveStaffPhones() {
    try {
        fs.writeFileSync('staff_phones.json', JSON.stringify(staffPhones, null, 2), 'utf8');
    } catch (e) {
        console.error('[Staff] Error saving staff_phones.json:', e.message);
    }
}
loadStaffPhones();

// Persistent Device LID <-> Phone Mapping
let deviceMappings = {};
function loadDeviceMappings() {
    try {
        if (fs.existsSync('device_mappings.json')) {
            deviceMappings = JSON.parse(fs.readFileSync('device_mappings.json', 'utf8'));
        }
    } catch (e) {
        console.error('[DeviceMappings] Error loading device_mappings.json:', e.message);
        deviceMappings = {};
    }
}
function saveDeviceMappings() {
    try {
        fs.writeFileSync('device_mappings.json', JSON.stringify(deviceMappings, null, 2), 'utf8');
    } catch (e) {
        console.error('[DeviceMappings] Error saving device_mappings.json:', e.message);
    }
}
loadDeviceMappings();

const lidToPhoneCache = new Map();

async function resolveSenderPhone(sock, from, msg) {
    const rawParticipant = msg.key.participant || from;
    const cleanRaw = String(rawParticipant).replace(/[^0-9]/g, '');

    // 1. Direct match in persistent deviceMappings
    if (deviceMappings[cleanRaw]) {
        return deviceMappings[cleanRaw];
    }

    // 2. Direct match in staffPhones
    if (staffPhones[cleanRaw]) {
        return cleanRaw;
    }

    // 3. Cached LID -> Phone mapping
    if (lidToPhoneCache.has(cleanRaw)) {
        const cached = lidToPhoneCache.get(cleanRaw);
        deviceMappings[cleanRaw] = cached;
        saveDeviceMappings();
        return cached;
    }

    // 4. Auto-pair if single active admin registered in DB
    const activeDbPhones = Object.keys(staffPhones).filter(k => k.length <= 13 && staffPhones[k].role === 'admin');
    if (activeDbPhones.length === 1 && cleanRaw.length >= 13) {
        const targetPhone = activeDbPhones[0];
        deviceMappings[cleanRaw] = targetPhone;
        saveDeviceMappings();
        return targetPhone;
    }

    // 5. Scan all participating groups to find this participant's real phone
    if (sock) {
        try {
            const allGroups = await sock.groupFetchAllParticipating();
            for (const group of Object.values(allGroups)) {
                if (Array.isArray(group.participants)) {
                    for (const p of group.participants) {
                        const pPhone = String(p.id).replace(/[^0-9]/g, '');
                        const pLid = p.lid ? String(p.lid).replace(/[^0-9]/g, '') : null;
                        if (pLid && pPhone) {
                            lidToPhoneCache.set(pLid, pPhone);
                            deviceMappings[pLid] = pPhone;
                            saveDeviceMappings();
                        }
                        if (pLid === cleanRaw || pPhone === cleanRaw || p.id === rawParticipant) {
                            return pPhone;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[ResolveSenderPhone] Gagal memindai grup WhatsApp:', e.message);
        }
    }

    return cleanRaw;
}

async function syncStaffDirectory() {
    try {
        const res = await axios.get(`${BASE_URL}/api/staff-directory`, { timeout: 5000 });
        if (res.data && res.data.success && Array.isArray(res.data.data)) {
            const newStaff = {};
            res.data.data.forEach(user => {
                if (user.whatsapp_number) {
                    const norm = normalizePhoneNumber(user.whatsapp_number);
                    const local = norm.startsWith('62') ? ('0' + norm.substring(2)) : norm;
                    const staffRecord = {
                        id: user.id,
                        name: user.staff_name || user.name,
                        department: user.department || '',
                        role: user.role || 'staff',
                        phone: norm,
                        realPhone: norm
                    };
                    newStaff[norm] = staffRecord;
                    newStaff[local] = staffRecord;
                    newStaff[user.whatsapp_number] = staffRecord;
                }
            });

            // Preserve known device LIDs
            for (const [lid, phone] of Object.entries(deviceMappings)) {
                const normMapped = normalizePhoneNumber(phone);
                const localMapped = normMapped.startsWith('62') ? ('0' + normMapped.substring(2)) : normMapped;
                const user = newStaff[normMapped] || newStaff[phone] || newStaff[localMapped];
                if (user) {
                    newStaff[lid] = {
                        ...user,
                        source: 'whatsapp_lid',
                        realPhone: normMapped
                    };
                }
            }

            staffPhones = newStaff;
            saveStaffPhones();
            console.log(`[Staff Sync] Loaded ${res.data.data.length} staff records from Telunas DB.`);
            return true;
        }
    } catch (e) {
        console.log(`[Staff Sync] Note: ${e.message}`);
    }
    return false;
}

function getStaffByPhone(phone) {
    if (!phone) return null;
    const clean = String(phone).replace(/[^0-9]/g, '');
    if (staffPhones[clean]) return staffPhones[clean];

    const norm = normalizePhoneNumber(clean);
    if (staffPhones[norm]) return staffPhones[norm];

    const local = norm.startsWith('62') ? ('0' + norm.substring(2)) : norm;
    if (staffPhones[local]) return staffPhones[local];

    if (deviceMappings[clean]) {
        const mapped = deviceMappings[clean];
        const mappedNorm = normalizePhoneNumber(mapped);
        const mappedLocal = mappedNorm.startsWith('62') ? ('0' + mappedNorm.substring(2)) : mappedNorm;
        if (staffPhones[mapped] || staffPhones[mappedNorm] || staffPhones[mappedLocal]) {
            return staffPhones[mapped] || staffPhones[mappedNorm] || staffPhones[mappedLocal];
        }
    }

    // Hot-reload staffPhones from disk in case a new staff was added while bot is running
    loadStaffPhones();
    if (staffPhones[clean]) return staffPhones[clean];
    if (staffPhones[norm]) return staffPhones[norm];
    if (staffPhones[local]) return staffPhones[local];

    return null;
}

// ─── Conversation State Machine (DM Reporting) ────────────────────────────────
const STEPS = {
    IDLE: 0,
    AWAITING_TITLE: 1,
    AWAITING_LOCATION: 2,
    AWAITING_DESC: 3,
    AWAITING_PHOTO: 4,
    AWAITING_DEPARTMENT: 5
};

const userStates = new Map(); // key: senderPhone -> { step, data, timestamp }

function getUserState(phone) {
    const s = userStates.get(phone);
    if (!s) return null;
    if (Date.now() - (s.timestamp || 0) > 30 * 60 * 1000) {
        userStates.delete(phone);
        return null;
    }
    return s;
}

function setUserState(phone, state) {
    state.timestamp = Date.now();
    userStates.set(phone, state);
}

function clearUserState(phone) {
    userStates.delete(phone);
}

// ─── Baileys Message Store & Retry Cache (Prevents Session Decrypt Errors) ──
const recentMessageStore = new Map();
const msgRetryCounterMap = new Map();

const msgRetryCounterCache = {
    get: (key) => msgRetryCounterMap.get(key),
    set: (key, value) => {
        msgRetryCounterMap.set(key, value);
        if (msgRetryCounterMap.size > 1500) {
            const oldest = msgRetryCounterMap.keys().next().value;
            msgRetryCounterMap.delete(oldest);
        }
    },
    del: (key) => msgRetryCounterMap.delete(key),
};

// Auto-repair helper to clear broken session/sender keys for a specific ID/LID
function clearCorruptedSession(sessionId) {
    if (!sessionId) return 0;
    const cleanId = String(sessionId).replace(/[^0-9_.]/g, '');
    if (!cleanId || cleanId.length < 3) return 0;

    try {
        if (fs.existsSync(getAuthDbPath(AUTH_DIR))) {
            const removed = clearSessionKeysById(cleanId, AUTH_DIR);
            if (removed > 0) {
                console.log(`[Auto-Repair V2] Cleared ${removed} stale/corrupted SQLite session keys for ID: ${cleanId}`);
                invalidateAuthKeyCache().catch((err) => {
                    console.warn('[Auto-Repair V2] Cache flush warning:', err.message);
                });
            }
            return removed;
        }

        if (!fs.existsSync(AUTH_DIR)) return 0;
        const files = fs.readdirSync(AUTH_DIR);
        let removed = 0;
        for (const file of files) {
            if (file.includes(cleanId) && (
                file.startsWith('session-') ||
                file.startsWith('sender-key-') ||
                file.startsWith('identity-key-') ||
                file.startsWith('device-list-')
            )) {
                fs.unlinkSync(path.join(AUTH_DIR, file));
                removed++;
            }
        }
        if (removed > 0) {
            console.log(`[Auto-Repair] Cleared ${removed} stale/corrupted session keys for ID: ${cleanId}`);
        }
        return removed;
    } catch (err) {
        console.error(`[Auto-Repair] Error clearing session keys for ${cleanId}:`, err.message);
        return 0;
    }
}

// Catch and auto-heal libsignal decryption errors without crashing
process.on('uncaughtException', (err) => {
    const errMsg = String(err?.message || err || '');
    if (errMsg.includes('MessageCounterError') || errMsg.includes('Bad MAC') || errMsg.includes('Key used already')) {
        console.warn('⚠️ [Auto-Repair Intercepted] Signal decryption error caught:', errMsg);
        const stack = String(err?.stack || '');
        const match = stack.match(/at\s+([0-9_.]+)\s+\[as awaitable\]/);
        if (match && match[1]) {
            const badId = match[1].split('_')[0];
            clearCorruptedSession(badId);
        }
        return;
    }
    console.error('[Process UncaughtException]', err);
});

// ─── Group Auto-Discovery & Number Migration Helpers ──────────────────────────
async function syncCommunityGroups(sock) {
    try {
        const allGroups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(allGroups);
        const matched = [];

        for (const group of groupList) {
            const subject = (group.subject || '').trim();
            const lowerSubject = subject.toLowerCase();

            // Auto-index participants LIDs <-> Phone numbers
            if (Array.isArray(group.participants)) {
                for (const p of group.participants) {
                    const pPhone = String(p.id || '').replace(/[^0-9]/g, '');
                    const pLid = p.lid ? String(p.lid).replace(/[^0-9]/g, '') : null;
                    if (pLid && pPhone) {
                        lidToPhoneCache.set(pLid, pPhone);
                        deviceMappings[pLid] = pPhone;
                    }
                }
            }

            // 1. Broadcast / General Group
            if (
                lowerSubject === 'issue broadcast' ||
                lowerSubject.includes('issue broadcast') ||
                lowerSubject.includes('broadcast') ||
                lowerSubject === 'general' ||
                lowerSubject.includes('pengumuman') ||
                lowerSubject === 'telunas resort issue report'
            ) {
                botConfig.generalGroupId = group.id;
                matched.push(`Broadcast: "${subject}"`);
                continue;
            }

            // 2. Official Department Groups
            let matchedDept = false;
            for (const dept of OFFICIAL_DEPARTMENTS) {
                const deptKey = dept.key.toLowerCase();
                const deptName = dept.name.toLowerCase();
                const deptCode = dept.code.toLowerCase();
                if (
                    lowerSubject === deptKey ||
                    lowerSubject === deptName ||
                    lowerSubject === deptCode ||
                    lowerSubject.includes(deptKey) ||
                    lowerSubject.includes(deptName)
                ) {
                    botConfig.departmentGroups[dept.key] = group.id;
                    matched.push(`${dept.name}: "${subject}"`);
                    matchedDept = true;
                    break;
                }
            }
            if (matchedDept) continue;

            // 3. Dedicated Location Groups (only when NOT a department group)
            if (lowerSubject === 'tbr' || lowerSubject.includes('telunas beach') || lowerSubject.includes('lokasi tbr') || lowerSubject.includes('info tbr')) {
                botConfig.locationGroups.tbr = group.id;
                matched.push(`Location TBR: "${subject}"`);
            } else if (lowerSubject === 'tpc' || lowerSubject === 'tpi' || lowerSubject.includes('private island') || lowerSubject.includes('lokasi tpc') || lowerSubject.includes('lokasi tpi') || lowerSubject.includes('info tpi')) {
                botConfig.locationGroups.tpc = group.id;
                matched.push(`Location TPC/TPI: "${subject}"`);
            } else if (lowerSubject === 'kantor' || lowerSubject.includes('sekupang') || lowerSubject.includes('lokasi kantor')) {
                botConfig.locationGroups.kantor = group.id;
                matched.push(`Location Kantor: "${subject}"`);
            }
        }

        saveDeviceMappings();
        saveConfig();
        return { success: true, count: matched.length, summary: matched.join('\n') };
    } catch (err) {
        console.error('[Group Sync Error]', err.message);
        return { success: false, error: err.message };
    }
}

async function broadcastNewBotNumber(newPhone, previousPhone) {
    if (!globalSock || !globalSock.user) return;
    const textMsg =
        `📢 *PEMBERITAHUAN NOMOR BOT WHATSAPP TELUNAS* 📢\n\n` +
        `Halo Tim Telunas! WhatsApp Bot V2 kini aktif menggunakan nomor:\n` +
        `📱 *+${newPhone}*\n` +
        (previousPhone && previousPhone !== newPhone ? `_(Sebelumnya: +${previousPhone})_\n\n` : '\n') +
        `Mohon simpan nomor ini agar notifikasi & perintah bot berjalan lancar.`;

    const targets = new Set();
    if (botConfig.generalGroupId) targets.add(botConfig.generalGroupId);
    Object.values(botConfig.departmentGroups || {}).forEach((gid) => {
        if (gid) targets.add(gid);
    });

    for (const gid of targets) {
        try {
            await globalSock.sendMessage(gid, { text: textMsg });
        } catch (err) {
            console.warn(`[Bot Migration] Gagal broadcast nomor baru ke ${gid}:`, err.message);
        }
    }
}

// ─── Baileys Connection Setup ─────────────────────────────────────────────────
async function startSock() {
    botConnectionStatus = 'connecting';

    if (currentCachedKeys) {
        await invalidateAuthKeyCache();
        currentCachedKeys = null;
    }
    if (currentAuthHandle) {
        currentAuthHandle.close();
        currentAuthHandle = null;
    }

    const authHandle = await useSqliteAuthState(AUTH_DIR);
    currentAuthHandle = authHandle;

    const cachedKeys = makeCacheableSignalKeyStore(authHandle.state.keys, authCacheLogger);
    currentCachedKeys = cachedKeys;

    const sock = makeWASocket({
        auth: {
            creds: authHandle.state.creds,
            keys: cachedKeys,
        },
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        browser: ['Telunas CampusFix V2', 'Chrome', '1.0.0'],
        msgRetryCounterCache,
        getMessage: async (key) => {
            const cached = recentMessageStore.get(key.id);
            return cached?.message || undefined;
        }
    });

    globalSock = sock;

    sock.ev.on('creds.update', authHandle.saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            latestQrString = qr;
            botConnectionStatus = 'qr_ready';
            try {
                latestQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
            } catch (qrErr) {
                console.error('[QR Error] Gagal menghasilkan QR data URL:', qrErr.message);
            }
            console.log('\n[WhatsApp Bot V2] Scan this QR code with WhatsApp:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            botConnectionStatus = 'offline';
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            console.log(`[WhatsApp Bot V2] Connection closed (Status: ${statusCode || 'unknown'}). Reconnecting...`, !isLoggedOut);

            if (isLoggedOut) {
                console.log('[WhatsApp Bot V2] Session logged out. Resetting auth_info_baileys for fresh QR/Pairing...');
                latestQrDataUrl = null;
                latestQrString = null;
                activePairingCode = null;
                activePairingPhone = null;
                globalSock = null;
                try {
                    await resetCurrentAuthState();
                } catch (e) {
                    console.error('[Session Reset Error]', e.message);
                }
                setTimeout(() => {
                    startSock().catch((err) => console.error('[Reconnect Socket Error]', err.message));
                }, 2000);
            } else {
                setTimeout(() => {
                    startSock().catch((err) => console.error('[Reconnect Socket Error]', err.message));
                }, 3000);
            }
        } else if (connection === 'open') {
            botConnectionStatus = 'connected';
            latestQrDataUrl = null;
            latestQrString = null;
            activePairingCode = null;
            activePairingPhone = null;
            console.log('✅ [WhatsApp Bot V2] Connected successfully to WhatsApp!');

            if (!housekeepingScheduled) {
                housekeepingScheduled = true;
                setupHousekeepingSchedule({
                    authDir: AUTH_DIR,
                    onCleanup: async (cleanupRes) => {
                        if (cleanupRes?.totalDeleted > 0) {
                            await invalidateAuthKeyCache();
                        }
                    }
                });
            }
            setTimeout(async () => {
                try {
                    console.log('[Housekeeping] Menjalankan pembersihan berkala awal saat bot online...');
                    const cleanupRes = cleanAuthFolder({ authDir: AUTH_DIR });
                    if (cleanupRes?.totalDeleted > 0) {
                        await invalidateAuthKeyCache();
                    }
                } catch (hkErr) {
                    console.error('[Housekeeping] Startup cleanup V2 error:', hkErr.message);
                }
            }, 10000);

            const currentPhone = globalSock?.user?.id ? globalSock.user.id.split(':')[0] : null;
            const previousPhone = botConfig.lastKnownBotPhone;
            if (currentPhone && (announceNumberChangeOnConnect || (previousPhone && currentPhone !== previousPhone))) {
                console.log(`[Bot Migration] Connected with phone +${currentPhone} (prev: ${previousPhone || 'none'})`);
                setTimeout(() => {
                    broadcastNewBotNumber(currentPhone, previousPhone);
                }, 3000);
                announceNumberChangeOnConnect = false;
            }
            if (currentPhone && botConfig.lastKnownBotPhone !== currentPhone) {
                botConfig.lastKnownBotPhone = currentPhone;
                saveConfig();
            }

            syncCommunityGroups(sock).then((res) => {
                if (res.success) {
                    console.log(`[Group Sync] Auto-synced ${res.count} community groups.`);
                }
            });
            syncStaffDirectory();
        }
    });

    if (!staffSyncTimer) {
        staffSyncTimer = setInterval(syncStaffDirectory, 5 * 60 * 1000);
    }

    // ─── Incoming Message Handler ─────────────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // Cache messages for retry negotiation
        for (const msg of messages) {
            if (msg.key?.id) {
                recentMessageStore.set(msg.key.id, msg);
                if (recentMessageStore.size > 2000) {
                    const oldest = recentMessageStore.keys().next().value;
                    recentMessageStore.delete(oldest);
                }
            }
        }
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message) continue;
            if (msg.key.fromMe) continue;

            const from = msg.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            const senderJid = isGroup ? (msg.key.participant || from) : from;
            const rawSenderPhone = senderJid.split('@')[0].split(':')[0];
            const senderPhone = await resolveSenderPhone(sock, from, msg);

            // Extract message text
            let text = '';
            if (msg.message.conversation) text = msg.message.conversation;
            else if (msg.message.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text;
            else if (msg.message.imageMessage?.caption) text = msg.message.imageMessage.caption;
            text = text.trim();

            // Extract native WhatsApp Location Message (Send Location pin)
            let locationPayload = null;
            const rawLocMsg = msg.message?.locationMessage || msg.message?.liveLocationMessage;
            if (rawLocMsg) {
                const lat = rawLocMsg.degreesLatitude;
                const lng = rawLocMsg.degreesLongitude;
                const placeName = rawLocMsg.name || rawLocMsg.address || '';
                
                // Snap GPS coordinates to nearest Telunas facility anchor (Geofencing)
                const geoMatch = findNearestTelunasFacility(lat, lng, placeName);

                locationPayload = {
                    lat,
                    lng,
                    name: placeName,
                    mapsUrl: geoMatch.mapsUrl,
                    formatted: geoMatch.formattedLocation,
                    geoMatch: geoMatch,
                };
                if (!text) {
                    text = locationPayload.formatted;
                }
            }

            const lower = text.toLowerCase();

            // Reply helper
            const reply = async (replyText, targetJid = from) => {
                try {
                    await sock.sendMessage(targetJid, { text: replyText });
                } catch (err) {
                    console.error('[Send Error]', err.message);
                }
            };

            // Staff Verification
            let registeredUser = getStaffByPhone(senderPhone) || getStaffByPhone(rawSenderPhone);
            if (!registeredUser) {
                await syncStaffDirectory();
                registeredUser = getStaffByPhone(senderPhone) || getStaffByPhone(rawSenderPhone);
            }

            // Unregistered user check
            if (!registeredUser) {
                if (!isGroup) {
                    await reply(
                        `🔒 *AKSES DITOLAK — NOMOR TIDAK TERDAFTAR*\n` +
                        `_ACCESS DENIED — UNREGISTERED NUMBER_\n\n` +
                        `Nomor WhatsApp Anda (+${senderPhone}) belum terdaftar dalam sistem Telunas Issue Tracker.\n` +
                        `Bot ini khusus digunakan oleh staf resmi Telunas Resort.\n\n` +
                        `Silakan hubungi Administrator atau Tim IT untuk mendaftarkan nomor dan departemen Anda ke sistem.\n` +
                        `_Please contact the Administrator or IT Team to register your phone number and department._`
                    );
                }
                continue;
            }

            let state = getUserState(senderPhone);

            // Handle Cancel for DM Reporting Wizard
            if (!isGroup && state && ['batal', 'cancel', 'reset', '!batal', '!cancel'].includes(lower)) {
                clearUserState(senderPhone);
                await reply(`🔄 Proses pelaporan telah dibatalkan / Reporting cancelled. Ketik *lapor* / *report* kapan saja untuk membuat laporan baru.`);
                continue;
            }

            // ═════════════════════════════════════════════════════════════════
            // A. COMMANDS IN GROUP (Info-Only Broadcasts + Read-only List)
            // ═════════════════════════════════════════════════════════════════
            if (isGroup) {
                // 1. HELP in Group (Bilingual Info-Only)
                if (['help', '!help', 'bantuan'].includes(lower)) {
                    await reply(
                        `ℹ️ *TELUNAS TRACKER - GRUP INFORMASI (INFO-ONLY)* ℹ️\n\n` +
                        `Grup WhatsApp ini bersifat *Informasi & Pemberitahuan*.\n` +
                        `Seluruh perubahan status (*Progress*, *Pending*, *Selesai*, dan *Alihkan Dept*) dilakukan melalui *Web Dashboard Telunas (/lapangan)*.\n\n` +
                        `Perintah baca yang masih tersedia:\n` +
                        `👉 *list menunggu / progress / pending / selesai* :\n` +
                        `   Mengirim daftar isu departemen ke Chat Pribadi (DM) Anda.\n` +
                        `👉 *list departemen* / *list department* :\n` +
                        `   Melihat daftar kode & nama departemen.\n\n` +
                        `💡 _Pelaporan isu via WA tetap dapat dilakukan melalui Chat Pribadi (DM) ke bot dengan mengetik *lapor*._`
                    );
                    continue;
                }

                // 2. LIST DEPARTEMEN in Group or DM
                if (lower === 'list departemen' || lower === 'list dept' || lower === '!list dept' ||
                    lower === 'list department' || lower === 'list departments') {
                    let deptList = `📋 *DAFTAR KODE & DEPARTEMEN TELUNAS* 📋\n` +
                                   `_TELUNAS DEPARTMENT CODES_\n\n`;
                    OFFICIAL_DEPARTMENTS.forEach(d => {
                        deptList += `• ${d.code.padEnd(4, ' ')} : ${d.name}\n`;
                    });
                    deptList += `\n💡 _Format ID Isu: [KODE]-[TGLBLNTHN]-[NOMOR]_\n_Contoh: ENG-221026-105_`;
                    await reply(deptList);
                    continue;
                }

                // 3. LIST COMMANDS IN GROUP (FORWARD TO PRIVATE DM!)
                if (lower.startsWith('list menunggu') || lower.startsWith('list waiting') || lower.startsWith('list open') ||
                    lower.startsWith('list progress') || lower.startsWith('list ongoing') || lower.startsWith('list in progress') ||
                    lower.startsWith('list pending')  || lower.startsWith('list tertunda') ||
                    lower.startsWith('list selesai')  || lower.startsWith('list done')    || lower.startsWith('list solved') || lower.startsWith('list resolved')) {
                    
                    const statusType = (lower.includes('menunggu') || lower.includes('waiting') || lower.includes('open')) ? 'open' :
                                       (lower.includes('progress') || lower.includes('ongoing')) ? 'in_progress' :
                                       (lower.includes('pending') || lower.includes('tertunda')) ? 'pending' : 'resolved';

                    const userDept = registeredUser.department || '';
                    const userDmJid = `${senderPhone}@s.whatsapp.net`;

                    // Fetch issues from Laravel
                    try {
                        const issuesRes = await axios.get(`${BASE_URL}/api/lean/issues`);
                        let issues = issuesRes.data?.data || [];

                        // Filter by user's department & status with normalization
                        const filtered = issues.filter(iss => {
                            const issDept = (iss.department || iss.assignedDepartments?.[0] || '').toLowerCase();
                            const matchesDept = userDept ? (issDept.includes(userDept.toLowerCase()) || userDept.toLowerCase().includes(issDept)) : true;
                            const currentStatus = (iss.status || '').toLowerCase();
                            const matchesStatus = currentStatus === statusType ||
                                                  (statusType === 'in_progress' && (currentStatus === 'progress' || currentStatus === 'in_progress')) ||
                                                  (statusType === 'resolved' && (currentStatus === 'solved' || currentStatus === 'resolved'));
                            return matchesDept && matchesStatus;
                        });

                        const statusLabel = statusType === 'open' ? 'MENUNGGU PENANGANAN (WAITING)' :
                                            statusType === 'in_progress' ? 'SEDANG DIKERJAKAN (IN PROGRESS)' :
                                            statusType === 'pending' ? 'TERTUNDA (PENDING)' : 'SUDAH SELESAI (RESOLVED)';

                        let listMsg = `📋 *DAFTAR ISU ${statusLabel}* 📋\n`;
                        listMsg += `🏢 *Departemen:* ${userDept || 'Semua / All'}\n`;
                        listMsg += `👤 *Penerima:* ${registeredUser.name}\n\n`;

                        if (filtered.length === 0) {
                            listMsg += `_Tidak ada isu dengan status ${statusLabel} untuk departemen Anda saat ini._\n` +
                                       `_No issues found for your department with this status._`;
                        } else {
                            filtered.slice(0, 10).forEach((item, idx) => {
                                listMsg += `${idx + 1}. *#${item.id}* - ${item.title}\n`;
                                listMsg += `   📍 Lokasi: ${item.location || '-'}\n`;
                                if (item.taker) listMsg += `   👷 Pengerja: ${item.taker}\n`;
                                if (statusType === 'pending') {
                                    const pReason = item.fixDescription || 'Tidak ada alasan dicantumkan';
                                    listMsg += `   ⏸️ Alasan Pending: ${pReason.replace(/^Pending:\s*/i, '')}\n`;
                                }
                                if (statusType === 'resolved') {
                                    if (item.created_at) listMsg += `   🕒 Di-upload: ${item.created_at_human || item.created_at}\n`;
                                    if (item.resolved_at) listMsg += `   ✅ Selesai: ${item.resolved_at}\n`;
                                    if (item.solver) listMsg += `   👤 Diselesaikan: ${item.solver}\n`;
                                }
                                listMsg += `\n`;
                            });
                        }

                        // Send to DM
                        await sock.sendMessage(userDmJid, { text: listMsg });
                        // Polite note in group
                        await reply(`📩 Halo @${senderPhone}, daftar isu *${statusLabel}* untuk departemen Anda telah dikirimkan ke *Chat Pribadi (DM)* Anda agar percakapan grup tetap bersih.`);
                    } catch (e) {
                        await reply(`❌ Gagal mengambil list isu: ${e.message}`);
                    }
                    continue;
                }

                // 4. DISABLED GROUP MUTATION COMMANDS (WhatsApp Group is Info-Only; status changes happen on Dashboard)
                if (
                    lower.startsWith('ambil') || lower.startsWith('!ambil') ||
                    lower.startsWith('claim') || lower.startsWith('!claim') ||
                    lower.startsWith('take')  || lower.startsWith('!take')  ||
                    lower.startsWith('pending') || lower.startsWith('!pending') ||
                    lower.startsWith('tunda')   || lower.startsWith('!tunda')   ||
                    lower.startsWith('selesai') || lower.startsWith('!selesai') ||
                    lower.startsWith('solve')   || lower.startsWith('!solve')   ||
                    lower.startsWith('done')    || lower.startsWith('!done')    ||
                    lower.startsWith('finish')  || lower.startsWith('!finish')  ||
                    lower.startsWith('edit')    || lower.startsWith('!edit')    ||
                    lower.startsWith('transfer') || lower.startsWith('!transfer')
                ) {
                    await reply(
                        `ℹ️ *WhatsApp Bot Bersifat Informasi (Info-Only)*\n` +
                        `_WhatsApp Group Is Notification-Only_\n\n` +
                        `Pembaruan status (*Mulai Kerja / Progress / Pending / Selesai*) serta pengalihan departemen dilakukan melalui *Web Dashboard Telunas (/lapangan)* agar tim pelaksana, komentar progress, dan foto bukti tercatat rapi.\n` +
                        `_Please update ticket status directly via the Web Dashboard (/lapangan)._`
                    );
                    continue;
                }

                // If user tried to 'lapor' / 'report' in group, gently direct them to DM
                if (lower === 'lapor' || lower === '!lapor' || lower === 'report' || lower === '!report') {
                    await reply(`📝 Halo @${senderPhone}, pembuatan laporan masalah dilakukan melalui *Chat Pribadi (DM)* ke bot ini agar data dan foto tersimpan dengan tertib.\n_Please send DM to create reports._`);
                    continue;
                }

                // Ignore other normal group chatter
                continue;
            }

            // ═════════════════════════════════════════════════════════════════
            // B. COMMANDS IN DIRECT MESSAGE (DM / Chat Pribadi)
            // ═════════════════════════════════════════════════════════════════

            state = getUserState(senderPhone) || { step: STEPS.IDLE, data: {} };

            // HELP in DM (Bilingual)
            if (state.step === STEPS.IDLE && ['help', '!help', 'bantuan'].includes(lower)) {
                await reply(
                    `👋 *HALO / HELLO ${registeredUser.name.toUpperCase()}!* 📱\n` +
                    `Selamat datang di Telunas CampusFix Bot V2.\n\n` +
                    `Berikut perintah yang dapat Anda gunakan di chat pribadi:\n` +
                    `_Available commands in private chat:_\n\n` +
                    `👉 *lapor* / *report* : Memulai pelaporan masalah baru / _Create new report._\n` +
                    `👉 *list menunggu* / *list waiting* : Melihat isu antrean departemen Anda / _Open issues._\n` +
                    `👉 *list progress* / *list ongoing* : Melihat isu yang sedang dikerjakan / _In-progress._\n` +
                    `👉 *list pending* : Melihat isu tertunda / _Pending issues._\n` +
                    `👉 *list selesai* / *list done* : Melihat riwayat isu selesai / _Resolved issues._\n` +
                    `👉 *list departemen* / *list department* : Melihat daftar kode departemen.\n` +
                    `👉 *batal* / *cancel* : Membatalkan proses pengisian formulir.`
                );
                continue;
            }

            // LIST DEPARTEMEN in DM
            if (state.step === STEPS.IDLE && (lower === 'list departemen' || lower === 'list dept' || lower === 'list department' || lower === 'list departments')) {
                let deptList = `📋 *DAFTAR KODE & DEPARTEMEN TELUNAS* 📋\n` +
                               `_TELUNAS DEPARTMENT CODES_\n\n`;
                OFFICIAL_DEPARTMENTS.forEach(d => {
                    deptList += `• ${d.code.padEnd(4, ' ')} : ${d.name}\n`;
                });
                deptList += `\n💡 _Format ID Isu: [KODE]-[TGLBLNTHN]-[NOMOR]_\n_Contoh: ENG-221026-105_`;
                await reply(deptList);
                continue;
            }

            // LIST STATUS COMMANDS in DM
            if (state.step === STEPS.IDLE && (
                lower.startsWith('list menunggu') || lower.startsWith('list waiting') || lower.startsWith('list open') ||
                lower.startsWith('list progress') || lower.startsWith('list ongoing') || lower.startsWith('list in progress') ||
                lower.startsWith('list pending')  || lower.startsWith('list tertunda') ||
                lower.startsWith('list selesai')  || lower.startsWith('list done')    || lower.startsWith('list solved') || lower.startsWith('list resolved'))) {

                const statusType = (lower.includes('menunggu') || lower.includes('waiting') || lower.includes('open')) ? 'open' :
                                   (lower.includes('progress') || lower.includes('ongoing')) ? 'in_progress' :
                                   (lower.includes('pending') || lower.includes('tertunda')) ? 'pending' : 'resolved';

                const userDept = registeredUser.department || '';

                try {
                    const issuesRes = await axios.get(`${BASE_URL}/api/lean/issues`);
                    let issues = issuesRes.data?.data || [];

                    const filtered = issues.filter(iss => {
                        const issDept = (iss.department || iss.assignedDepartments?.[0] || '').toLowerCase();
                        const matchesDept = userDept ? (issDept.includes(userDept.toLowerCase()) || userDept.toLowerCase().includes(issDept)) : true;
                        const currentStatus = (iss.status || '').toLowerCase();
                        const matchesStatus = currentStatus === statusType ||
                                              (statusType === 'in_progress' && (currentStatus === 'progress' || currentStatus === 'in_progress')) ||
                                              (statusType === 'resolved' && (currentStatus === 'solved' || currentStatus === 'resolved'));
                        return matchesDept && matchesStatus;
                    });

                    const statusLabel = statusType === 'open' ? 'MENUNGGU PENANGANAN (WAITING)' :
                                        statusType === 'in_progress' ? 'SEDANG DIKERJAKAN (IN PROGRESS)' :
                                        statusType === 'pending' ? 'TERTUNDA (PENDING)' : 'SUDAH SELESAI (RESOLVED)';

                    let listMsg = `📋 *DAFTAR ISU ${statusLabel}* 📋\n`;
                    listMsg += `🏢 *Departemen:* ${userDept || 'Semua / All'}\n\n`;

                    if (filtered.length === 0) {
                        listMsg += `_Tidak ada isu dengan status ${statusLabel} untuk departemen Anda saat ini._\n` +
                                   `_No issues found for your department with this status._`;
                    } else {
                        filtered.slice(0, 10).forEach((item, idx) => {
                            listMsg += `${idx + 1}. *#${item.id}* - ${item.title}\n`;
                            listMsg += `   📍 Lokasi: ${item.location || '-'}\n`;
                            if (item.taker) listMsg += `   👷 Pengerja: ${item.taker}\n`;
                            if (statusType === 'pending') {
                                const pReason = item.fixDescription || 'Tidak ada alasan dicantumkan';
                                listMsg += `   ⏸️ Alasan Pending: ${pReason.replace(/^Pending:\s*/i, '')}\n`;
                            }
                            if (statusType === 'resolved') {
                                if (item.created_at) listMsg += `   🕒 Di-upload: ${item.created_at_human || item.created_at}\n`;
                                if (item.resolved_at) listMsg += `   ✅ Selesai: ${item.resolved_at}\n`;
                                if (item.solver) listMsg += `   👤 Diselesaikan: ${item.solver}\n`;
                            }
                            listMsg += `\n`;
                        });
                    }
                    await reply(listMsg);
                } catch (e) {
                    await reply(`❌ Gagal mengambil data isu: ${e.message}`);
                }
                continue;
            }

            // ═════════════════════════════════════════════════════════════════
            // STEP-BY-STEP REPORTING WIZARD (lapor / report)
            // ═════════════════════════════════════════════════════════════════
            if (state.step === STEPS.IDLE) {
                if (['lapor', '!lapor', 'report', '!report', 'buat tiket', 'create ticket', 'new issue'].includes(lower)) {
                    state.step = STEPS.AWAITING_TITLE;
                    state.data = {
                        reporter: registeredUser.name,
                        reporter_phone: registeredUser.realPhone || registeredUser.phone || senderPhone,
                        reporter_dept: registeredUser.department || ''
                    };
                    setUserState(senderPhone, state);

                    await reply(
                        `📝 *FORMULIR LAPORAN KENDALA / ISSUE REPORT* 📝\n\n` +
                        `Halo *${registeredUser.name}* (${registeredUser.department || 'Staf Telunas'})!\n` +
                        `Identitas Anda telah terverifikasi secara otomatis.\n\n` +
                        `*Langkah 1/5:* Apa masalah atau judul kendala yang Anda temukan?\n` +
                        `_Step 1/5: What issue or problem did you discover?_\n` +
                        `_(Contoh: AC Kamar 5 Menetes Air / Light bulb broken)_\n\n` +
                        `💡 _Ketik *batal* / *cancel* kapan saja untuk membatalkan._`
                    );
                    continue;
                } else {
                    // Friendly greeting
                    await reply(
                        `Halo *${registeredUser.name}*! 👋\n` +
                        `Ketik *lapor* / *report* untuk membuat laporan masalah baru, atau ketik *help* untuk melihat seluruh perintah yang tersedia.`
                    );
                    continue;
                }
            }

            // Step 1 -> Step 2: Location
            if (state.step === STEPS.AWAITING_TITLE) {
                if (!text || text.length < 3) {
                    await reply(`⚠️ Mohon tuliskan judul masalah dengan jelas (minimal 3 karakter).`);
                    continue;
                }
                state.data.title = text;
                state.step = STEPS.AWAITING_LOCATION;
                setUserState(senderPhone, state);

                await reply(
                    `📍 *Langkah 2/5:* Di mana lokasi kendala ini?\n` +
                    `_Step 2/5: Where is this issue located?_\n\n` +
                    `Pilih angka, ketik lokasi, atau bagikan Pin Lokasi WhatsApp (Send Location):\n` +
                    `1. TBR (Telunas Beach Resort)\n` +
                    `2. TPC / TPI (Telunas Private Island)\n` +
                    `3. Kantor Sekupang\n` +
                    `_Contoh teks: TBR - Villa 3 atau langsung kirim Pin Lokasi._`
                );
                continue;
            }

            // Step 2 -> Step 3: Description
            if (state.step === STEPS.AWAITING_LOCATION) {
                let loc = null;
                let detectedGeo = null;
                if (locationPayload) {
                    loc = locationPayload.formatted;
                    detectedGeo = locationPayload.geoMatch;
                } else if (text) {
                    if (text === '1' || lower === 'tbr') loc = 'TBR';
                    else if (text === '2' || lower === 'tpc' || lower === 'tpi') loc = 'TPC';
                    else if (text === '3' || lower === 'kantor') loc = 'Kantor';
                    else loc = text.trim();
                }

                if (!loc) {
                    await reply(`⚠️ Mohon pilih angka lokasi (1: TBR, 2: TPC/TPI, 3: Kantor), ketik lokasi spesifik, atau kirimkan Pin Lokasi WhatsApp.`);
                    continue;
                }

                state.data.location = loc;
                state.step = STEPS.AWAITING_DESC;
                setUserState(senderPhone, state);

                let geoFeedback = '';
                if (detectedGeo && detectedGeo.facilityName) {
                    const rName = detectedGeo.resort === 'TBR' 
                        ? 'Telunas Beach Resort (TBR)' 
                        : (detectedGeo.resort === 'OFFICE' ? 'Kantor Sekupang' : 'Telunas Private Island (TPI)');
                    const numPrefix = detectedGeo.facilityNum ? `#${detectedGeo.facilityNum} ` : '';
                    geoFeedback = `📍 *Lokasi Terdeteksi Otomatis (Geofencing):*\n` +
                        `• *Resor:* ${rName}\n` +
                        `• *Fasilitas:* ${numPrefix}${detectedGeo.facilityName} (~${detectedGeo.distanceMeters}m)\n\n`;
                }

                await reply(
                    geoFeedback +
                    `📝 *Langkah 3/5:* Jelaskan deskripsi detail kendala atau kronologinya:\n` +
                    `_Step 3/5: Describe the issue details or chronology:_\n\n` +
                    `_(Contoh: Rembesan air mengenai meja kerja sejak tadi malam, tamu meminta dicek segera.)_`
                );
                continue;
            }

            // Step 3 -> Step 4: Photo
            if (state.step === STEPS.AWAITING_DESC) {
                if (!text || text.length < 3) {
                    await reply(`⚠️ Mohon tuliskan deskripsi masalah dengan cukup jelas / Please provide a clear description.`);
                    continue;
                }
                state.data.description = text;
                state.step = STEPS.AWAITING_PHOTO;
                setUserState(senderPhone, state);

                await reply(
                    `📸 *Langkah 4/5:* Silakan kirimkan *FOTO BUKTI KENDALA*.\n` +
                    `_Step 4/5: Please send PHOTO PROOF of the issue._\n\n` +
                    `_Kirim foto langsung ke chat ini, atau ketik *lewati* / *skip* jika tidak ada foto saat ini._`
                );
                continue;
            }

            // Step 4 -> Step 5: Department
            if (state.step === STEPS.AWAITING_PHOTO) {
                let photoBuffer = null;

                if (msg.message.imageMessage) {
                    try {
                        photoBuffer = await downloadMediaMessage(
                            msg,
                            'buffer',
                            {},
                            { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
                        );
                        state.data.photoBuffer = photoBuffer;
                    } catch (e) {
                        console.error('[Download Photo Error]', e.message);
                    }
                } else if (!['lewati', 'skip', 'tidak ada', 'none', 'no'].includes(lower)) {
                    await reply(`⚠️ Kirimkan gambar foto bukti kendala, atau ketik *lewati* / *skip* jika tidak memiliki foto.`);
                    continue;
                }

                state.step = STEPS.AWAITING_DEPARTMENT;
                setUserState(senderPhone, state);

                let deptPrompt = `🎯 *Langkah 5/5: Pilih 1 Departemen yang bertanggung jawab:*\n` +
                                 `_Step 5/5: Select 1 responsible Department:_\n\n`;
                OFFICIAL_DEPARTMENTS.forEach((d, idx) => {
                    deptPrompt += `${idx + 1}. ${d.name} (${d.code})\n`;
                });
                deptPrompt += `\n_Ketik angka (1-11) atau nama/kode departemen tujuan._\n` +
                              `_Type number (1-11) or department code._`;

                await reply(deptPrompt);
                continue;
            }

            // Step 5: Submit Issue!
            if (state.step === STEPS.AWAITING_DEPARTMENT) {
                let selectedDept = null;
                const num = parseInt(text, 10);
                if (!isNaN(num) && num >= 1 && num <= OFFICIAL_DEPARTMENTS.length) {
                    selectedDept = OFFICIAL_DEPARTMENTS[num - 1];
                } else {
                    selectedDept = normalizeDept(text);
                }

                if (!selectedDept) {
                    await reply(`⚠️ Pilihan departemen tidak valid. Silakan ketik angka 1-${OFFICIAL_DEPARTMENTS.length} atau nama departemen.`);
                    continue;
                }

                state.data.department = selectedDept.name;

                await reply(`⏳ *Mengirimkan laporan ke sistem Telunas... Mohon tunggu sebentar.*`);

                try {
                    const formData = new FormData();
                    formData.append('title', state.data.title);
                    formData.append('description', state.data.description);
                    formData.append('location', state.data.location);
                    formData.append('department', state.data.department);
                    formData.append('reporter', state.data.reporter);
                    formData.append('reporter_phone', state.data.reporter_phone || registeredUser.realPhone || registeredUser.phone || senderPhone || '');
                    formData.append('reporter_dept', state.data.reporter_dept || registeredUser.department || 'Umum');
                    formData.append('source', 'whatsapp_bot');

                    if (state.data.photoBuffer) {
                        formData.append('image', state.data.photoBuffer, { filename: 'issue.jpg', contentType: 'image/jpeg' });
                    }

                    const res = await axios.post(`${BASE_URL}/api/lean/issues`, formData, {
                        headers: formData.getHeaders()
                    });

                    if (res.data.success) {
                        const createdData = res.data.data || {};
                        const issueId = createdData.id || 'TERCATAT';
                        const accurateLocation = createdData.location || state.data.location;

                        // Confirmation to Reporter (source='whatsapp_bot' skips redundant DM from Laravel)
                        await reply(
                            `✅ *LAPORAN BERHASIL DIBUAT!* ✅\n\n` +
                            `• *ID Isu:* #${issueId}\n` +
                            `• *Judul:* ${state.data.title}\n` +
                            `• *Lokasi:* ${accurateLocation}\n` +
                            `• *Departemen Dituju:* ${state.data.department}\n` +
                            `• *Pelapor:* ${state.data.reporter}\n\n` +
                            `Laporan telah diteruskan ke grup terkait. Pembaruan status (*dikerjakan, progress, pending, pengalihan,* hingga *selesai*) akan dikirim otomatis ke WhatsApp ini. Terima kasih!`
                        );

                        // Broadcast message content
                        const broadcastText = 
                            `📢 *LAPORAN MASALAH BARU* 📢\n\n` +
                            `• *ID Tiket:* #${issueId}\n` +
                            `• *Masalah:* ${state.data.title}\n` +
                            `• *Lokasi:* ${accurateLocation}\n` +
                            `• *Departemen:* ${state.data.department}\n` +
                            `• *Pelapor:* ${state.data.reporter} (${state.data.reporter_dept || 'Staf'})\n` +
                            `• *Deskripsi:* ${state.data.description}\n\n`;

                        // 1. Send to Location Group (FYI, Read-only)
                        const locKey = (accurateLocation || '').toLowerCase();
                        let targetLocGid = null;
                        if (locKey.includes('tbr')) targetLocGid = botConfig.locationGroups.tbr;
                        else if (locKey.includes('tpc') || locKey.includes('tpi')) targetLocGid = botConfig.locationGroups.tpc;
                        else if (locKey.includes('kantor')) targetLocGid = botConfig.locationGroups.kantor;

                        if (!targetLocGid) targetLocGid = botConfig.generalGroupId;

                        if (targetLocGid) {
                            const fyiMsg = broadcastText + `ℹ️ _Pemberitahuan operasional lokasi._`;
                            try {
                                if (state.data.photoBuffer) {
                                    await sock.sendMessage(targetLocGid, { image: state.data.photoBuffer, caption: fyiMsg });
                                } else {
                                    await sock.sendMessage(targetLocGid, { text: fyiMsg });
                                }
                            } catch (locSendErr) {
                                console.error(`[Lapor V2] Gagal mengirim ke grup lokasi ${targetLocGid}:`, locSendErr.message);
                            }
                        }

                        // 2. Send to Department Group (Info-Only)
                        const deptKey = selectedDept.key;
                        const deptGroupJid = botConfig.departmentGroups[deptKey];
                        if (deptGroupJid && deptGroupJid !== targetLocGid) {
                            const actionMsg = broadcastText + `ℹ️ _Pemberitahuan otomatis untuk departemen penangan (tindak lanjut dilakukan via Web Dashboard /lapangan)._`;
                            try {
                                if (state.data.photoBuffer) {
                                    await sock.sendMessage(deptGroupJid, { image: state.data.photoBuffer, caption: actionMsg });
                                } else {
                                    await sock.sendMessage(deptGroupJid, { text: actionMsg });
                                }
                            } catch (deptSendErr) {
                                console.error(`[Lapor V2] Gagal mengirim ke grup departemen ${deptGroupJid}:`, deptSendErr.message);
                            }
                        }

                    } else {
                        await reply(`❌ Gagal menyimpan laporan: ${res.data.message || 'Error tidak diketahui'}`);
                    }
                } catch (err) {
                    const errMsg = err.response?.data?.message || err.message;
                    await reply(`❌ Terjadi kendala saat mengirim laporan: ${errMsg}`);
                }

                clearUserState(senderPhone);
                continue;
            }
        }
    });
}

// ─── Webhook Security & Media Helpers ─────────────────────────────────────────
function resolveSafeMediaPayload(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return null;
    const trimmed = imageUrl.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/')) {
        const uploadsBaseDir = path.resolve(__dirname, '..', 'public', 'uploads');
        const cleanRelative = trimmed.split('?')[0].split('#')[0].replace(/^\/?uploads\//, '');
        const resolvedFile = path.resolve(uploadsBaseDir, cleanRelative);

        if (!resolvedFile.startsWith(uploadsBaseDir + path.sep)) {
            console.warn(`[Notify Media Blocked] Canonical path traversal rejected: ${trimmed}`);
            return null;
        }

        try {
            if (fs.existsSync(resolvedFile) && fs.statSync(resolvedFile).isFile()) {
                return { image: fs.readFileSync(resolvedFile) };
            }
            console.warn(`[Notify Media] File lokal tidak ditemukan: ${resolvedFile}`);
        } catch (err) {
            console.error(`[Notify Media] Gagal membaca file ${resolvedFile}:`, err.message);
        }
        return null;
    }

    if (/^https?:\/\//i.test(trimmed)) {
        try {
            const parsed = new URL(trimmed);
            const host = (parsed.hostname || '').toLowerCase();
            if (host === '169.254.169.254' || host === 'metadata.google.internal') {
                console.warn(`[Notify Media Blocked] Metadata host rejected: ${host}`);
                return null;
            }
            return { image: { url: trimmed } };
        } catch (err) {
            console.warn(`[Notify Media] URL tidak valid (${trimmed}):`, err.message);
            return null;
        }
    }

    console.warn(`[Notify Media] Skema URL tidak didukung diabaikan: ${trimmed}`);
    return null;
}

const authenticateInbound = (req, res, next) => {
    const authHeader = req.headers['authorization'] || '';
    const bearerKey = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    const inboundKey = req.headers['x-bot-key'] || bearerKey;

    if (!BOT_API_KEY || !inboundKey) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid bot security key.' });
    }

    const expectedBuf = Buffer.from(String(BOT_API_KEY), 'utf8');
    const providedBuf = Buffer.from(String(inboundKey), 'utf8');
    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid bot security key.' });
    }

    return next();
};

// ─── Express HTTP Server (Registered Once Outside startSock) ───────────────────
app.get(['/status', '/health', '/api/status'], (req, res) => {
    const isConnected = Boolean(globalSock && globalSock.user);
    const phone = globalSock?.user?.id ? globalSock.user.id.split(':')[0] : (botConfig.lastKnownBotPhone || null);
    res.json({
        success: true,
        bot: 'Telunas CampusFix V2',
        connected: isConnected,
        status: isConnected ? 'connected' : (activePairingCode ? 'pairing_ready' : (latestQrDataUrl ? 'qr_ready' : botConnectionStatus)),
        phone: phone,
        name: globalSock?.user?.name || null,
        uptime: Math.floor(process.uptime())
    });
});

app.use([
    '/auth-state', '/api/auth-state',
    '/request-pairing-code', '/api/request-pairing-code',
    '/unlink', '/api/unlink',
    '/sync-staff', '/api/sync-staff',
    '/check-number', '/api/check-number',
    '/notify-direct', '/api/notify-direct',
    '/notify', '/api/notify',
    '/shutdown', '/api/shutdown',
    '/repair-sessions', '/api/repair-sessions',
    '/cleanup-stats', '/api/cleanup-stats',
    '/cleanup-auth', '/api/cleanup-auth'
], authenticateInbound);

app.get(['/auth-state', '/api/auth-state'], (req, res) => {
    const isConnected = Boolean(globalSock && globalSock.user);
    const phone = globalSock?.user?.id ? globalSock.user.id.split(':')[0] : (botConfig.lastKnownBotPhone || null);
    res.json({
        success: true,
        bot: 'Telunas CampusFix V2',
        connected: isConnected,
        phone: phone,
        name: globalSock?.user?.name || null,
        status: isConnected ? 'connected' : (activePairingCode ? 'pairing_ready' : (latestQrDataUrl ? 'qr_ready' : botConnectionStatus)),
        qr: latestQrDataUrl,
        pairingCode: activePairingCode,
        pairingPhone: activePairingPhone,
        uptime: Math.floor(process.uptime())
    });
});

app.post(['/request-pairing-code', '/api/request-pairing-code'], async (req, res) => {
    try {
        const { phone } = req.body || {};
        if (!phone) {
            return res.status(400).json({ success: false, error: 'Nomor telepon WhatsApp wajib diisi.' });
        }
        const cleanPhone = normalizePhoneNumber(phone);
        if (!cleanPhone || cleanPhone.length < 8) {
            return res.status(400).json({ success: false, error: 'Format nomor telepon tidak valid.' });
        }

        console.log(`[Pairing V2] Menerima permintaan pairing code untuk nomor: +${cleanPhone}`);

        if (globalSock && globalSock.authState?.creds?.registered) {
            console.log('[Pairing V2] Me-reset sesi lama untuk pairing nomor baru...');
            announceNumberChangeOnConnect = true;
            try {
                await globalSock.end(new Error('Admin requested pairing new number'));
            } catch (endErr) {
                console.warn('[Pairing V2] Peringatan saat menutup socket lama:', endErr.message);
            }
            globalSock = null;
            await new Promise((r) => setTimeout(r, 600));
            try {
                await resetCurrentAuthState();
            } catch (rmErr) {
                console.warn('[Pairing V2] Peringatan saat me-reset sesi SQLite:', rmErr.message);
            }
            await startSock();
            await new Promise((r) => setTimeout(r, 1200));
        } else if (!globalSock) {
            await startSock();
            await new Promise((r) => setTimeout(r, 1200));
        }

        if (!globalSock) {
            return res.status(500).json({ success: false, error: 'Socket bot WhatsApp gagal diinisialisasi.' });
        }

        announceNumberChangeOnConnect = true;
        const rawCode = await globalSock.requestPairingCode(cleanPhone);
        let formattedCode = String(rawCode || '').trim();
        if (formattedCode.length === 8 && !formattedCode.includes('-')) {
            formattedCode = `${formattedCode.slice(0, 4)}-${formattedCode.slice(4)}`;
        }

        activePairingCode = formattedCode;
        activePairingPhone = cleanPhone;
        botConnectionStatus = 'pairing_ready';

        return res.json({
            success: true,
            pairingCode: formattedCode,
            phone: cleanPhone,
            message: 'Kode pairing berhasil dibuat.'
        });
    } catch (err) {
        console.error('[Pairing V2 Error]', err.message);
        return res.status(500).json({ success: false, error: err.message || 'Gagal membuat kode pairing.' });
    }
});

app.post(['/unlink', '/api/unlink'], async (req, res) => {
    try {
        console.log('[Bot Unlink V2] Permintaan putuskan sesi diterima.');
        announceNumberChangeOnConnect = true;
        latestQrDataUrl = null;
        latestQrString = null;
        activePairingCode = null;
        activePairingPhone = null;
        botConnectionStatus = 'offline';

        if (globalSock) {
            try {
                await globalSock.end(new Error('Admin unlinked bot'));
            } catch (endErr) {
                console.warn('[Bot Unlink V2] Peringatan saat menutup socket:', endErr.message);
            }
            globalSock = null;
        }

        await new Promise((r) => setTimeout(r, 800));
        try {
            await resetCurrentAuthState();
        } catch (rmErr) {
            console.warn('[Bot Unlink V2] Peringatan saat membersihkan auth_info_baileys:', rmErr.message);
        }

        startSock().catch((err) => console.error('[Bot Unlink V2] Gagal restart socket:', err.message));

        return res.json({
            success: true,
            message: 'Sesi bot berhasil diputuskan. Silakan masukkan nomor baru atau scan QR code.'
        });
    } catch (err) {
        console.error('[Bot Unlink V2 Error]', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.post(['/sync-staff', '/api/sync-staff'], async (req, res) => {
    const ok = await syncStaffDirectory();
    res.json({ success: ok });
});

app.get(['/sync-staff', '/api/sync-staff'], async (req, res) => {
    const ok = await syncStaffDirectory();
    res.json({ success: ok });
});

app.post(['/check-number', '/api/check-number'], async (req, res) => {
    try {
        const { phone } = req.body || {};
        if (!phone) {
            return res.status(400).json({ success: false, error: 'Phone number is required.' });
        }
        if (!globalSock || !globalSock.user) {
            return res.json({
                success: true,
                botOnline: false,
                exists: null,
                message: 'Bot is offline or not paired with WhatsApp.'
            });
        }
        const cleanPhone = normalizePhoneNumber(phone);
        const jid = `${cleanPhone}@s.whatsapp.net`;
        const results = await globalSock.onWhatsApp(jid);
        const match = Array.isArray(results) && results.length > 0 ? results[0] : null;
        const exists = Boolean(match && match.exists);

        return res.json({
            success: true,
            botOnline: true,
            exists: exists,
            jid: match?.jid || jid,
            message: exists ? 'Nomor terdaftar di WhatsApp.' : 'Nomor tidak terdaftar di WhatsApp.'
        });
    } catch (err) {
        console.error('[CheckNumber V2 Error]', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.post(['/notify-direct', '/api/notify-direct'], async (req, res) => {
    try {
        const { phone, message } = req.body || {};
        if (!globalSock || !globalSock.user) {
            return res.status(503).json({ success: false, error: 'WhatsApp socket not connected.' });
        }
        if (!phone || !message) {
            return res.status(400).json({ success: false, error: 'Phone and message are required.' });
        }

        const cleanPhone = normalizePhoneNumber(phone);
        if (!cleanPhone || cleanPhone.length < 8) {
            return res.status(400).json({ success: false, error: 'Invalid phone number format.' });
        }

        const jid = `${cleanPhone}@s.whatsapp.net`;
        await globalSock.sendMessage(jid, { text: String(message) });
        console.log(`[Notify-Direct V2] Terkirim ke +${cleanPhone}`);
        return res.json({ success: true });
    } catch (err) {
        console.error('[Notify-Direct V2 Error]', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.post(['/notify', '/api/notify'], async (req, res) => {
    try {
        const {
            message,
            imageUrl,
            department,
            departments,
            assignedDepartments,
            taggedDepartments,
            location,
            includeGeneral,
            includeLocation,
            departmentOnly
        } = req.body || {};

        if (!globalSock || !globalSock.user) {
            return res.status(503).json({ success: false, error: 'WhatsApp socket not connected.' });
        }
        if (!message || String(message).trim() === '') {
            return res.status(400).json({ success: false, error: 'Message is required.' });
        }

        const isDeptOnly = Boolean(departmentOnly);
        const targetGroupIds = new Set();

        const addDeptTarget = (deptInput) => {
            if (!deptInput) return;
            const matched = normalizeDept(deptInput);
            if (matched && botConfig.departmentGroups?.[matched.key]) {
                targetGroupIds.add(botConfig.departmentGroups[matched.key]);
                return;
            }
            const rawKey = String(deptInput).trim().toLowerCase();
            if (botConfig.departmentGroups?.[rawKey]) {
                targetGroupIds.add(botConfig.departmentGroups[rawKey]);
            }
        };

        if (department) addDeptTarget(department);
        const listFields = [departments, assignedDepartments, taggedDepartments];
        for (const field of listFields) {
            if (!field) continue;
            const items = Array.isArray(field) ? field : String(field).split(',');
            items.forEach((d) => addDeptTarget(d));
        }

        if (!isDeptOnly) {
            let locMatchedGid = null;
            if (includeLocation && location) {
                const locLower = String(location).toLowerCase();
                if (locLower.includes('tbr')) {
                    locMatchedGid = botConfig.locationGroups?.tbr || null;
                } else if (locLower.includes('tpc') || locLower.includes('tpi')) {
                    locMatchedGid = botConfig.locationGroups?.tpc || null;
                } else if (locLower.includes('kantor') || locLower.includes('office')) {
                    locMatchedGid = botConfig.locationGroups?.kantor || null;
                }
            }

            if (locMatchedGid) {
                targetGroupIds.add(locMatchedGid);
            } else if ((includeGeneral !== false || includeLocation) && botConfig.generalGroupId) {
                targetGroupIds.add(botConfig.generalGroupId);
            }

            if (includeGeneral === true && botConfig.generalGroupId) {
                targetGroupIds.add(botConfig.generalGroupId);
            }
        }

        if (targetGroupIds.size === 0) {
            console.warn('[Notify V2] Tidak ada grup tujuan yang cocok untuk payload.');
            return res.json({ success: true, sentToCount: 0, warning: 'No target group mapped.' });
        }

        const mediaPayload = resolveSafeMediaPayload(imageUrl);
        let sentCount = 0;
        const failures = [];

        for (const gid of targetGroupIds) {
            try {
                if (mediaPayload) {
                    try {
                        await globalSock.sendMessage(gid, { ...mediaPayload, caption: String(message) });
                    } catch (mediaErr) {
                        console.error(`[Notify V2 Media Fallback] Gagal kirim foto ke ${gid}, mengirim teks saja:`, mediaErr.message);
                        await globalSock.sendMessage(gid, { text: String(message) });
                    }
                } else {
                    await globalSock.sendMessage(gid, { text: String(message) });
                }
                sentCount++;
            } catch (sendErr) {
                console.error(`[Notify V2 Error] Gagal kirim ke grup ${gid}:`, sendErr.message);
                failures.push({ gid, error: sendErr.message });
            }
        }

        if (sentCount === 0 && failures.length > 0) {
            return res.status(500).json({
                success: false,
                sentToCount: 0,
                failures,
                error: failures[0].error
            });
        }

        return res.json({ success: true, sentToCount: sentCount, failures });
    } catch (e) {
        console.error('[Notify V2 Fatal Error]', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post(['/shutdown', '/api/shutdown'], (req, res) => {
    console.log('[Bot Shutdown V2] Permintaan shutdown diterima.');
    res.json({ success: true, message: 'Bot V2 shutting down gracefully.' });
    setTimeout(async () => {
        try {
            if (globalSock) {
                await globalSock.end(new Error('Dashboard requested shutdown'));
            }
        } catch (endErr) {
            console.warn('[Bot Shutdown V2] Error saat menutup socket:', endErr.message);
        } finally {
            if (currentAuthHandle) {
                currentAuthHandle.close();
                currentAuthHandle = null;
            }
        }
        process.exit(0);
    }, 500);
});

app.post(['/repair-sessions', '/api/repair-sessions'], async (req, res) => {
    try {
        const { targetId } = req.body || {};
        let removed = 0;
        if (targetId) {
            removed = clearCorruptedSession(targetId);
        } else if (fs.existsSync(getAuthDbPath(AUTH_DIR))) {
            removed = pruneCorruptedSessionRows(AUTH_DIR);
            if (removed > 0) {
                await invalidateAuthKeyCache();
            }
        } else if (fs.existsSync(AUTH_DIR)) {
            const files = fs.readdirSync(AUTH_DIR);
            for (const f of files) {
                if (f.startsWith('session-') || f.startsWith('sender-key-')) {
                    const p = path.join(AUTH_DIR, f);
                    try {
                        const st = fs.statSync(p);
                        if (st.size === 0) {
                            fs.unlinkSync(p);
                            removed++;
                        }
                    } catch (fileErr) {
                        console.warn(`[RepairSessions V2] Gagal memeriksa/menghapus ${f}:`, fileErr.message);
                    }
                }
            }
        }
        res.json({ success: true, message: `Session repair completed. Removed ${removed} entries.` });
    } catch (e) {
        console.error('[RepairSessions V2 Error]', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get(['/cleanup-stats', '/api/cleanup-stats'], (req, res) => {
    try {
        const stats = getAuthFolderStats(AUTH_DIR);
        res.json({ success: true, stats });
    } catch (e) {
        console.error('[Housekeeping API V2] Error reading stats:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post(['/cleanup-auth', '/api/cleanup-auth'], async (req, res) => {
    try {
        const result = cleanAuthFolder({ authDir: AUTH_DIR });
        if (result?.totalDeleted > 0) {
            await invalidateAuthKeyCache();
        }
        res.json(result);
    } catch (e) {
        console.error('[Housekeeping API V2] Error running cleanup:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

async function startBot() {
    console.log('====================================================');
    console.log('       Telunas CampusFix WhatsApp Bot V2 Starting    ');
    console.log('====================================================');

    app.listen(BOT_PORT, () => {
        console.log(`[HTTP Server V2] Listening on port ${BOT_PORT}`);
    });

    await syncStaffDirectory();
    await startSock();
}

function handleGracefulExit(signal) {
    console.log(`[Bot V2] Received ${signal}, closing SQLite auth handle cleanly...`);
    if (currentAuthHandle) {
        currentAuthHandle.close();
        currentAuthHandle = null;
    }
    process.exit(0);
}

process.on('SIGINT', () => handleGracefulExit('SIGINT'));
process.on('SIGTERM', () => handleGracefulExit('SIGTERM'));

startBot().catch((err) => {
    console.error('[Bot Fatal Error]', err);
});
