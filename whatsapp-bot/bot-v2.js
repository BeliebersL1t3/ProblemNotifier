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

const { makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const FormData = require('form-data');
const express = require('express');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// ─── Environment & Base URL Configuration ─────────────────────────────────────
let envBaseUrl = process.env.BASE_URL || process.env.APP_URL;
if (!envBaseUrl && fs.existsSync('.env')) {
    try {
        const envContent = fs.readFileSync('.env', 'utf8');
        const match = envContent.match(/^BASE_URL=([^\r\n]+)$/m) || envContent.match(/^APP_URL=([^\r\n]+)$/m);
        if (match) envBaseUrl = match[1].trim();
    } catch (e) {}
}
if (!envBaseUrl && fs.existsSync('../.env')) {
    try {
        const envContent = fs.readFileSync('../.env', 'utf8');
        const match = envContent.match(/^BASE_URL=([^\r\n]+)$/m) || envContent.match(/^APP_URL=([^\r\n]+)$/m);
        if (match) envBaseUrl = match[1].trim();
    } catch (e) {}
}
const BASE_URL = envBaseUrl || 'http://TelunasIssueTracker.test';

let botApiKey = process.env.BOT_API_KEY;
if (!botApiKey && fs.existsSync('.env')) {
    try {
        const envContent = fs.readFileSync('.env', 'utf8');
        const match = envContent.match(/^BOT_API_KEY=([^\r\n]+)$/m);
        if (match) botApiKey = match[1].trim();
    } catch (e) {}
}
if (!botApiKey && fs.existsSync('../.env')) {
    try {
        const envContent = fs.readFileSync('../.env', 'utf8');
        const match = envContent.match(/^BOT_API_KEY=([^\r\n]+)$/m);
        if (match) botApiKey = match[1].trim();
    } catch (e) {}
}
const BOT_API_KEY = botApiKey || '';
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
    'hr': 'hr', 'legal': 'hr', 'lnd': 'hr', 'transportasi': 'hr', 'tekong': 'hr',
    'gr': 'gr', 'gre': 'gr', 'guest relations': 'gr', 'service': 'gr', 'bar': 'gr', 'spa': 'gr', 'tirek': 'gr',
    'kitchen': 'kitchen', 'f&b': 'kitchen', 'fnb': 'kitchen',
    'hk': 'hk', 'housekeeping': 'hk', 'pest control': 'hk',
    'engineer': 'engineer', 'engineering': 'engineer',
    'fasilitas': 'fasilitas', 'facilities': 'fasilitas', 'security': 'fasilitas',
    'it': 'it', 'edp': 'it',
    'procurement': 'procurement', 'purchasing': 'procurement', 'logistic': 'procurement', 'logistik': 'procurement',
    'finance': 'finance', 'accounting': 'finance',
    'reservasi': 'reservasi', 'reservation': 'reservasi', 'sales': 'reservasi', 'marketing': 'reservasi',
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
            botConfig.locationGroups = raw.locationGroups || botConfig.locationGroups;
            botConfig.departmentGroups = raw.departmentGroups || {};
            botConfig.lastKnownBotPhone = raw.lastKnownBotPhone || null;
        }
    } catch (e) {
        console.error('[Config] Error loading config.json:', e.message);
    }
}
loadConfig();

// ─── Staff Phone Directory & Verification ─────────────────────────────────────
let staffPhones = {};

function normalizePhoneNumber(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
        clean = '62' + clean.substring(1);
    }
    return clean;
}

function loadStaffPhones() {
    try {
        if (fs.existsSync('staff_phones.json')) {
            staffPhones = JSON.parse(fs.readFileSync('staff_phones.json', 'utf8'));
        }
    } catch (e) {}
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
        deviceMappings = {};
    }
}
function saveDeviceMappings() {
    try {
        fs.writeFileSync('device_mappings.json', JSON.stringify(deviceMappings, null, 2), 'utf8');
    } catch (e) {}
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
        } catch (e) {}
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
            fs.writeFileSync('staff_phones.json', JSON.stringify(staffPhones, null, 2), 'utf8');
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
    AWAITING_DEPARTMENT: 5,
    TRANSFER_AWAITING_DEPT: 6,
    TRANSFER_AWAITING_REASON: 7
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

    const authDir = path.resolve(__dirname, 'auth_info_baileys');
    if (!fs.existsSync(authDir)) return 0;

    try {
        const files = fs.readdirSync(authDir);
        let removed = 0;
        for (const file of files) {
            if (file.includes(cleanId) && (
                file.startsWith('session-') ||
                file.startsWith('sender-key-') ||
                file.startsWith('identity-key-') ||
                file.startsWith('device-list-')
            )) {
                fs.unlinkSync(path.join(authDir, file));
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

// ─── Baileys Connection Setup ─────────────────────────────────────────────────
let globalSock = null;

async function startBot() {
    console.log('====================================================');
    console.log('       Telunas CampusFix WhatsApp Bot V2 Starting    ');
    console.log('====================================================');

    await syncStaffDirectory();

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
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

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('\n[WhatsApp Bot V2] Scan this QR code with WhatsApp:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('[WhatsApp Bot V2] Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(startBot, 3000);
            }
        } else if (connection === 'open') {
            console.log('✅ [WhatsApp Bot V2] Connected successfully to WhatsApp!');
        }
    });

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

            const lower = text.toLowerCase();

            // Reply helper
            const reply = async (replyText, targetJid = from) => {
                try {
                    await sock.sendMessage(targetJid, { text: replyText });
                } catch (err) {
                    console.error('[Send Error]', err.message);
                }
            };

            // Detect quoted message for ID lookup
            const quotedText = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                               msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text ||
                               msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage?.caption || '';

            const extractIssueId = (rawInput) => {
                // Matches format like ENG-221026-105 or #ENG-221026-105 or generic alphanumeric with hyphen
                const match = rawInput.match(/#?([A-Za-z]{2,5}-\d{5,8}-\d{1,4})/i) ||
                              rawInput.match(/#?([A-Za-z]{2,5}-\d+)/i) ||
                              rawInput.match(/(?:ID|Tiket|Issue):\s*#?([^\s\n]+)/i);
                if (match) return match[1].replace('#', '').trim();
                return null;
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

            // ─────────────────────────────────────────────────────────────────
            // 0. GLOBAL INTERACTIVE TRANSFER WIZARD (Works in Group & DM)
            // ─────────────────────────────────────────────────────────────────
            let state = getUserState(senderPhone);

            // Handle Cancel globally (in group or DM)
            if (state && ['batal', 'cancel', 'reset', '!batal', '!cancel'].includes(lower)) {
                const wasTransfer = state.step === STEPS.TRANSFER_AWAITING_DEPT || state.step === STEPS.TRANSFER_AWAITING_REASON;
                clearUserState(senderPhone);
                if (wasTransfer) {
                    await reply(`🔄 Proses pengalihan tiket telah dibatalkan / Ticket transfer cancelled.`);
                } else {
                    await reply(`🔄 Proses pelaporan telah dibatalkan / Reporting cancelled. Ketik *lapor* / *report* kapan saja untuk membuat laporan baru.`);
                }
                continue;
            }

            // Step 1 of Transfer Wizard: Department Selection
            if (state && state.step === STEPS.TRANSFER_AWAITING_DEPT) {
                let selectedDept = null;
                const num = parseInt(text.trim(), 10);
                if (!isNaN(num) && num >= 1 && num <= OFFICIAL_DEPARTMENTS.length) {
                    selectedDept = OFFICIAL_DEPARTMENTS[num - 1];
                } else {
                    selectedDept = normalizeDept(text.trim());
                }

                if (!selectedDept) {
                    await reply(
                        `⚠️ Pilihan departemen tidak valid / Invalid department.\n\n` +
                        `Silakan ketik angka 1-${OFFICIAL_DEPARTMENTS.length} atau kode departemen (contoh: HK / ENG).\n` +
                        `_Type number 1-${OFFICIAL_DEPARTMENTS.length} or department code._\n\n` +
                        `💡 _Ketik *batal* / *cancel* untuk membatalkan._`
                    );
                    continue;
                }

                state.step = STEPS.TRANSFER_AWAITING_REASON;
                state.data.toDept = selectedDept.name;
                state.data.toDeptCode = selectedDept.code;
                state.data.toDeptKey = selectedDept.key;
                setUserState(senderPhone, state);

                await reply(
                    `📝 *PENGALIHAN DEPARTEMEN TIKET #${state.data.targetId} (2/2)* 📝\n` +
                    `_REASSIGN DEPARTMENT REASON_\n\n` +
                    `Departemen Tujuan / Target: *${selectedDept.name} (${selectedDept.code})*\n\n` +
                    `Silakan tuliskan alasan pengalihan tiket ini:\n` +
                    `_Please write the reason for transferring this issue:_\n\n` +
                    `_(Contoh: Plafon bernoda butuh dibersihkan HK terlebih dahulu)_\n` +
                    `💡 _Ketik *batal* / *cancel* untuk membatalkan._`
                );
                continue;
            }

            // Step 2 of Transfer Wizard: Reason Input & Submission
            if (state && state.step === STEPS.TRANSFER_AWAITING_REASON) {
                if (!text || text.trim().length < 3) {
                    await reply(
                        `⚠️ Mohon tuliskan alasan pengalihan dengan jelas (minimal 3 karakter).\n` +
                        `_Please write a clear reason (min 3 chars)._\n` +
                        `_Ketik *batal* / *cancel* untuk membatalkan._`
                    );
                    continue;
                }

                const transferReason = text.trim();
                const targetId = state.data.targetId;
                const newDeptName = state.data.toDept;
                const newDeptKey = state.data.toDeptKey;

                await reply(`⏳ *Mengalihkan tiket #${targetId} ke ${newDeptName}... Mohon tunggu sebentar / Please wait.*`);

                try {
                    const transferRes = await axios.post(`${BASE_URL}/api/lean/issues/${targetId}/transfer`, {
                        to_department: newDeptName,
                        reason: transferReason,
                        transferred_by: registeredUser.name,
                        transferred_by_phone: senderPhone
                    });

                    if (transferRes.data.success) {
                        const updated = transferRes.data.data;
                        const oldDeptName = updated.from_department || registeredUser.department || 'Departemen Asal';

                        // 1. Announce in current group / chat
                        await reply(
                            `🔄 *TIKET BERHASIL DIALIHKAN KE DEPARTEMEN LAIN* 🔄\n` +
                            `_TICKET REASSIGNED SUCCESSFULLY_\n\n` +
                            `• *ID Tiket:* #${targetId}\n` +
                            `• *Masalah:* ${updated.title || '-'}\n` +
                            `• *Dari / From:* ${oldDeptName}\n` +
                            `• *Dialihkan ke / To:* ${newDeptName}\n` +
                            `• *Dialihkan oleh / By:* ${registeredUser.name}\n` +
                            `• *Alasan / Reason:* ${transferReason}\n\n` +
                            `_Tiket telah dilepaskan dari antrean ${oldDeptName} dan diteruskan ke grup ${newDeptName}._`
                        );

                        // 2. Broadcast to New Department Group
                        const newGroupJid = botConfig.departmentGroups[newDeptKey];
                        if (newGroupJid) {
                            const newDeptMsg = 
                                `📥 *TIKET MASUK (DIALIHKAN) / INCOMING TICKET* 📥\n\n` +
                                `• *ID Tiket:* #${targetId}\n` +
                                `• *Masalah:* ${updated.title || '-'}\n` +
                                `• *Lokasi:* ${updated.location || '-'}\n` +
                                `• *Dialihkan dari:* ${oldDeptName}\n` +
                                `• *Dialihkan oleh:* ${registeredUser.name}\n` +
                                `• *Alasan Pengalihan:* ${transferReason}\n` +
                                `• *Deskripsi Asal:* ${updated.description || '-'}\n\n` +
                                `👉 _Ketik *ambil ${targetId}* (atau *take ${targetId}*) atau reply pesan ini untuk mengambil tugas._`;
                            
                            await sock.sendMessage(newGroupJid, { text: newDeptMsg });
                        }

                        // 3. Notify Reporter's DM if phone is mapped
                        const reporterPhone = updated.reporter_phone || null;
                        if (reporterPhone) {
                            const repDmJid = `${reporterPhone}@s.whatsapp.net`;
                            try {
                                await sock.sendMessage(repDmJid, {
                                    text: `ℹ️ *UPDATE STATUS LAPORAN ANDA / STATUS UPDATE*\n\n` +
                                          `Laporan Anda *#${targetId}* (${updated.title}) telah dialihkan pengerjaannya dari *${oldDeptName}* ke *${newDeptName}*.\n` +
                                          `_Your report has been transferred from ${oldDeptName} to ${newDeptName}._\n\n` +
                                          `*Alasan / Reason:* ${transferReason}\n\n` +
                                          `Tim ${newDeptName} akan segera menindaklanjuti laporan Anda.`
                                });
                            } catch (e) {}
                        }
                    } else {
                        await reply(`❌ Gagal mengalihkan tiket: ${transferRes.data.message || 'Error'}`);
                    }
                } catch (e) {
                    const errMsg = e.response?.data?.message || e.message;
                    await reply(`❌ Gagal mengalihkan tiket: ${errMsg}`);
                }

                clearUserState(senderPhone);
                continue;
            }

            // ═════════════════════════════════════════════════════════════════
            // A. COMMANDS IN GROUP (Action-Only: ambil, selesai, edit, list forwarding)
            // ═════════════════════════════════════════════════════════════════
            if (isGroup) {
                // 1. HELP in Group (Bilingual)
                if (['help', '!help', 'bantuan'].includes(lower)) {
                    await reply(
                        `🛠️ *TELUNAS CAMPUSFIX - PERINTAH GRUP / GROUP COMMANDS* 🛠️\n\n` +
                        `Grup ini khusus digunakan untuk eksekusi tindakan penanganan isu:\n` +
                        `_This group is for executing issue actions:_\n\n` +
                        `👉 *ambil [ID]* / *take [ID]* / *claim [ID]* :\n` +
                        `   Mulai pengerjaan isu (atau reply tiket dengan kata *ambil* / *take*).\n` +
                        `   _Claim & start working on the issue._\n\n` +
                        `👉 *selesai [ID]* / *done [ID]* / *finish [ID]* / *solve [ID]* :\n` +
                        `   Selesaikan tiket (atau reply tiket dengan kata *selesai* / *done*).\n` +
                        `   _Complete and resolve the ticket._\n\n` +
                        `👉 *edit* / *transfer* :\n` +
                        `   Reply tiket dengan kata *edit* untuk memulai alur pengalihan departemen interaktif.\n` +
                        `   _Reply to ticket with 'edit' to start interactive department transfer wizard._\n\n` +
                        `👉 *list departemen* / *list department* :\n` +
                        `   Melihat daftar kode & nama departemen / _View department codes._\n\n` +
                        `💡 _Perintah *lapor* / *report* dan pengecekan *list status* dilakukan melalui Chat Pribadi (DM) ke bot._`
                    );
                    continue;
                }

                // 2. LIST DEPARTEMEN in Group or DM
                if (lower === 'list departemen' || lower === 'list dept' || lower === '!list dept' ||
                    lower === 'list department' || lower === 'list departments') {
                    let deptList = `📋 *DAFTAR KODE & DEPARTEMEN TELUNAS* 📋\n` +
                                   `_TELUNAS DEPARTMENT CODES_\n\n`;
                    OFFICIAL_DEPARTMENTS.forEach(d => {
                        deptList += `• *${d.code.padEnd(4, ' ')}* : ${d.name}\n`;
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

                // 4. GROUP ACTION: AMBIL / TAKE / CLAIM
                if (lower.startsWith('ambil') || lower.startsWith('!ambil') || 
                    lower.startsWith('claim') || lower.startsWith('!claim') ||
                    lower.startsWith('take')  || lower.startsWith('!take')) {
                    const words = text.split(/\s+/);
                    let targetId = words[1] || extractIssueId(text) || extractIssueId(quotedText);

                    if (!targetId) {
                        await reply(`⚠️ *Format Tidak Lengkap / Incomplete Format*\n\nKetik: *ambil [ID_ISU]* atau *take [ID_ISU]*\nAtau reply pesan tiket dengan kata *ambil* / *take*.`);
                        continue;
                    }

                    try {
                        const claimRes = await axios.post(`${BASE_URL}/api/lean/issues/${targetId}/claim`, {
                            taker: registeredUser.name,
                            department: registeredUser.department || ''
                        });

                        if (claimRes.data.success) {
                            await reply(
                                `✅ *TIKET BERHASIL DIAMBIL* ✅\n` +
                                `_TICKET CLAIMED SUCCESSFULLY_\n\n` +
                                `• *ID Tiket:* #${targetId}\n` +
                                `• *Pengerja:* ${registeredUser.name} (${registeredUser.department || 'Staf'})\n` +
                                `• *Status:* 🟡 Sedang Dikerjakan (In Progress)\n\n` +
                                `_Selamat bertugas! Ketik *selesai ${targetId}* (or *done ${targetId}*) bila pekerjaan telah rampung._`
                            );
                        } else {
                            await reply(`❌ Gagal mengambil tiket: ${claimRes.data.message || 'Error tidak diketahui'}`);
                        }
                    } catch (e) {
                        const msgErr = e.response?.data?.message || e.message;
                        await reply(`❌ Gagal mengambil tiket: ${msgErr}`);
                    }
                    continue;
                }

                // 5. GROUP ACTION: SELESAI / DONE / SOLVE / RESOLVE
                if (lower.startsWith('selesai') || lower.startsWith('!selesai') || 
                    lower.startsWith('solve')   || lower.startsWith('!solve')   ||
                    lower.startsWith('done')    || lower.startsWith('!done')    ||
                    lower.startsWith('finish')  || lower.startsWith('!finish')) {
                    const words = text.split(/\s+/);
                    let targetId = words[1] || extractIssueId(text) || extractIssueId(quotedText);

                    if (!targetId) {
                        await reply(`⚠️ *Format Tidak Lengkap / Incomplete Format*\n\nKetik: *selesai [ID_ISU]* atau *done [ID_ISU]*\nAtau reply pesan tiket dengan kata *selesai* / *done*.`);
                        continue;
                    }

                    try {
                        const solveRes = await axios.post(`${BASE_URL}/api/lean/issues/${targetId}/resolve`, {
                            solver: registeredUser.name,
                            fixDescription: 'Diselesaikan via WhatsApp Grup Telunas V2'
                        });

                        if (solveRes.data.success) {
                            await reply(
                                `🎉 *TIKET TELAH SELESAI* 🎉\n` +
                                `_TICKET RESOLVED SUCCESSFULLY_\n\n` +
                                `• *ID Tiket:* #${targetId}\n` +
                                `• *Diselesaikan oleh:* ${registeredUser.name} (${registeredUser.department || 'Staf'})\n` +
                                `• *Status:* 🟢 Selesai (Resolved)\n\n` +
                                `_Terima kasih atas kerja keras tim! Tiket telah ditutup di sistem._`
                            );
                        } else {
                            await reply(`❌ Gagal menyelesaikan tiket: ${solveRes.data.message || 'Error tidak diketahui'}`);
                        }
                    } catch (e) {
                        const msgErr = e.response?.data?.message || e.message;
                        await reply(`❌ Gagal menyelesaikan tiket: ${msgErr}`);
                    }
                    continue;
                }

                // 6. GROUP ACTION: EDIT / TRANSFER
                if (lower.startsWith('edit') || lower.startsWith('!edit') || lower.startsWith('transfer') || lower.startsWith('!transfer')) {
                    let targetId = extractIssueId(text) || extractIssueId(quotedText);

                    // Check fast one-liner shortcut: edit [ID] ke [DEPT] [Alasan] or edit [ID] to [DEPT] [Reason]
                    let remaining = text.replace(/^(?:!edit|edit|!transfer|transfer)\s*/i, '');
                    if (targetId) {
                        remaining = remaining.replace(new RegExp('#?' + targetId, 'i'), '').trim();
                    }
                    remaining = remaining.replace(/^(?:ke|to)\s+/i, '').trim();

                    const matchDept = remaining.match(/^([A-Za-z]+)\s*(.*)$/);
                    let targetDeptRaw = matchDept ? matchDept[1] : '';
                    let transferReason = matchDept ? matchDept[2].trim() : '';
                    const validDept = normalizeDept(targetDeptRaw);

                    // If fast one-liner provided all parameters, execute directly!
                    if (targetId && validDept && transferReason) {
                        try {
                            const transferRes = await axios.post(`${BASE_URL}/api/lean/issues/${targetId}/transfer`, {
                                to_department: validDept.name,
                                reason: transferReason,
                                transferred_by: registeredUser.name,
                                transferred_by_phone: senderPhone
                            });

                            if (transferRes.data.success) {
                                const updated = transferRes.data.data;
                                const oldDeptName = updated.from_department || registeredUser.department || 'Departemen Asal';
                                const newDeptName = validDept.name;

                                await reply(
                                    `🔄 *TIKET DIALIHKAN KE DEPARTEMEN LAIN* 🔄\n` +
                                    `_TICKET REASSIGNED_\n\n` +
                                    `• *ID Tiket:* #${targetId}\n` +
                                    `• *Dialihkan ke:* ${newDeptName}\n` +
                                    `• *Dialihkan oleh:* ${registeredUser.name}\n` +
                                    `• *Alasan / Reason:* ${transferReason}\n\n` +
                                    `_Tiket telah dilepaskan dari antrean ${oldDeptName} dan diteruskan ke grup ${newDeptName}._`
                                );

                                const newDeptKey = validDept.key;
                                const newGroupJid = botConfig.departmentGroups[newDeptKey];
                                if (newGroupJid) {
                                    const newDeptMsg = 
                                        `📥 *TIKET MASUK (DIALIHKAN) / INCOMING TICKET* 📥\n\n` +
                                        `• *ID Tiket:* #${targetId}\n` +
                                        `• *Masalah:* ${updated.title || '-'}\n` +
                                        `• *Lokasi:* ${updated.location || '-'}\n` +
                                        `• *Dialihkan dari:* ${oldDeptName}\n` +
                                        `• *Dialihkan oleh:* ${registeredUser.name}\n` +
                                        `• *Alasan Pengalihan:* ${transferReason}\n` +
                                        `• *Deskripsi Asal:* ${updated.description || '-'}\n\n` +
                                        `👉 _Ketik *ambil ${targetId}* (atau *take ${targetId}*) atau reply pesan ini untuk mengambil tugas._`;
                                    
                                    await sock.sendMessage(newGroupJid, { text: newDeptMsg });
                                }

                                const reporterPhone = updated.reporter_phone || null;
                                if (reporterPhone) {
                                    const repDmJid = `${reporterPhone}@s.whatsapp.net`;
                                    try {
                                        await sock.sendMessage(repDmJid, {
                                            text: `ℹ️ *UPDATE STATUS LAPORAN ANDA / STATUS UPDATE*\n\n` +
                                                  `Laporan Anda *#${targetId}* (${updated.title}) telah dialihkan pengerjaannya dari *${oldDeptName}* ke *${newDeptName}*.\n` +
                                                  `_Your report has been transferred from ${oldDeptName} to ${newDeptName}._\n\n` +
                                                  `*Alasan / Reason:* ${transferReason}\n\n` +
                                                  `Tim ${newDeptName} akan segera menindaklanjuti laporan Anda.`
                                        });
                                    } catch (e) {}
                                }
                            } else {
                                await reply(`❌ Gagal mengalihkan tiket: ${transferRes.data.message || 'Error'}`);
                            }
                        } catch (e) {
                            const errMsg = e.response?.data?.message || e.message;
                            await reply(`❌ Gagal mengalihkan tiket: ${errMsg}`);
                        }
                        continue;
                    }

                    // Otherwise, start Interactive Edit Wizard if targetId is found!
                    if (!targetId) {
                        await reply(
                            `⚠️ *Format Perintah Edit / Reassign:*\n\n` +
                            `Ketik *edit [ID_TIKET]* atau reply pesan tiket dengan kata *edit* / *transfer*.\n` +
                            `_Type edit [TICKET_ID] or reply to ticket notification with 'edit' or 'transfer'._`
                        );
                        continue;
                    }

                    // Initiate Step 1: Ask for target department
                    setUserState(senderPhone, {
                        step: STEPS.TRANSFER_AWAITING_DEPT,
                        data: {
                            targetId: targetId,
                            groupJid: from
                        }
                    });

                    let deptPrompt = 
                        `🔄 *PENGALIHAN DEPARTEMEN TIKET #${targetId} (1/2)* 🔄\n` +
                        `_REASSIGN DEPARTMENT_\n\n` +
                        `Halo *${registeredUser.name}*, silakan pilih Departemen yang dituju:\n` +
                        `_Please select the target Department:_\n\n`;
                    OFFICIAL_DEPARTMENTS.forEach((d, idx) => {
                        deptPrompt += `${idx + 1}. *${d.name}* (${d.code})\n`;
                    });
                    deptPrompt += `\nKetik angka (1-${OFFICIAL_DEPARTMENTS.length}) atau nama/kode departemen.\n` +
                                  `_Type number (1-${OFFICIAL_DEPARTMENTS.length}) or department code._\n\n` +
                                  `💡 _Ketik *batal* / *cancel* untuk membatalkan._`;

                    await reply(deptPrompt);
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
                    deptList += `• *${d.code.padEnd(4, ' ')}* : ${d.name}\n`;
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
                        reporter_phone: senderPhone,
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
                    `Pilih angka atau ketik nama lokasi / _Choose number or type location_:\n` +
                    `1. *TBR* (Telunas Beach Resort)\n` +
                    `2. *TPC / TPI* (Telunas Private Island)\n` +
                    `3. *Kantor Sekupang*\n` +
                    `_Atau ketik lokasi spesifik, contoh: TBR - Villa 3_`
                );
                continue;
            }

            // Step 2 -> Step 3: Description
            if (state.step === STEPS.AWAITING_LOCATION) {
                let loc = text;
                if (text === '1' || lower === 'tbr') loc = 'TBR';
                else if (text === '2' || lower === 'tpc' || lower === 'tpi') loc = 'TPC';
                else if (text === '3' || lower === 'kantor') loc = 'Kantor';

                state.data.location = loc;
                state.step = STEPS.AWAITING_DESC;
                setUserState(senderPhone, state);

                await reply(
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
                    deptPrompt += `${idx + 1}. *${d.name}* (${d.code})\n`;
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

                        // Confirmation to Reporter
                        await reply(
                            `✅ *LAPORAN BERHASIL DIBUAT!* ✅\n\n` +
                            `• *ID Isu:* #${issueId}\n` +
                            `• *Judul:* ${state.data.title}\n` +
                            `• *Lokasi:* ${accurateLocation}\n` +
                            `• *Departemen Dituju:* ${state.data.department}\n` +
                            `• *Pelapor:* ${state.data.reporter}\n\n` +
                            `Laporan telah diteruskan ke grup terkait. Terima kasih!`
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
                            if (state.data.photoBuffer) {
                                await sock.sendMessage(targetLocGid, { image: state.data.photoBuffer, caption: fyiMsg });
                            } else {
                                await sock.sendMessage(targetLocGid, { text: fyiMsg });
                            }
                        }

                        // 2. Send to Department Group (Actionable)
                        const deptKey = selectedDept.key;
                        const deptGroupJid = botConfig.departmentGroups[deptKey];
                        if (deptGroupJid) {
                            const actionMsg = broadcastText + `👉 _Ketik *ambil ${issueId}* atau reply pesan ini dengan kata *ambil* untuk mengambil tugas._`;
                            if (state.data.photoBuffer) {
                                await sock.sendMessage(deptGroupJid, { image: state.data.photoBuffer, caption: actionMsg });
                            } else {
                                await sock.sendMessage(deptGroupJid, { text: actionMsg });
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

    // ─── Express HTTP Server for Webhook Notifications ───────────────────────
    const PORT = process.env.BOT_PORT || 3000;

    app.get(['/status', '/health', '/api/status'], (req, res) => {
        const isConnected = Boolean(globalSock && globalSock.user);
        const phone = globalSock?.user?.id ? globalSock.user.id.split(':')[0] : (botConfig.lastKnownBotPhone || '628117700554');
        res.json({
            success: true,
            bot: 'Telunas CampusFix V2',
            connected: isConnected,
            status: isConnected ? 'connected' : 'connecting',
            phone: phone,
            uptime: Math.floor(process.uptime())
        });
    });

    app.post('/shutdown', (req, res) => {
        res.json({ success: true, message: 'Bot V2 shutting down...' });
        setTimeout(() => process.exit(0), 500);
    });

    app.post(['/notify', '/api/notify'], async (req, res) => {
        try {
            const { message, imageUrl, department } = req.body;
            if (!globalSock) return res.status(500).json({ error: 'Socket not ready' });

            if (botConfig.generalGroupId) {
                if (imageUrl) {
                    await globalSock.sendMessage(botConfig.generalGroupId, { image: { url: imageUrl }, caption: message });
                } else {
                    await globalSock.sendMessage(botConfig.generalGroupId, { text: message });
                }
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post(['/repair-sessions', '/api/repair-sessions'], (req, res) => {
        try {
            const { targetId } = req.body || {};
            let removed = 0;
            if (targetId) {
                removed = clearCorruptedSession(targetId);
            } else {
                const authDir = path.resolve(__dirname, 'auth_info_baileys');
                if (fs.existsSync(authDir)) {
                    const files = fs.readdirSync(authDir);
                    for (const f of files) {
                        if (f.startsWith('session-') || f.startsWith('sender-key-')) {
                            const p = path.join(authDir, f);
                            try {
                                const st = fs.statSync(p);
                                if (st.size === 0) {
                                    fs.unlinkSync(p);
                                    removed++;
                                }
                            } catch (_) {}
                        }
                    }
                }
            }
            res.json({ success: true, message: `Session repair completed. Removed ${removed} files.` });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.listen(PORT, () => {
        console.log(`[HTTP Server V2] Listening on port ${PORT}`);
    });
}

startBot().catch(err => {
    console.error('[Bot Fatal Error]', err);
});
