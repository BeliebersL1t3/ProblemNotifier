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
const PUBLIC_URL = (readEnvVar(['TAILSCALE_URL', 'APP_PUBLIC_URL']) || 'https://msi.taile8cc1e.ts.net').replace(/\/+$/, '');
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
        // ─── Mode Murni 1-Arah (Broadcast Only / Outbound Notification) ─────────
        // Bot murni berfungsi sebagai pengirim notifikasi dari Web Dashboard ke WhatsApp.
        // Bot sama sekali tidak memproses perintah atau membalas chat masuk apa pun
        // baik di dalam grup maupun di chat pribadi (DM).
        // Hal ini menjamin bot tidak akan pernah merespons pesan lama saat baru aktif (offline sync).
        return;
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

        if (Boolean(req.body.generalOnly)) {
            targetGroupIds.clear();
            if (botConfig.generalGroupId) {
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
