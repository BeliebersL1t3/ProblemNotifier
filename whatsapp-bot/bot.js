const { makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const FormData = require('form-data');
const express = require('express');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const app = express();
app.use(express.json());

// ─── Server URL & Environment Configuration ──────────────────────────────────
// Defaults to Laragon dev domain on Windows, or environment variable on Linux
let envBaseUrl = process.env.BASE_URL || process.env.APP_URL;
if (!envBaseUrl && fs.existsSync('.env')) {
    try {
        const envContent = fs.readFileSync('.env', 'utf8');
        const match = envContent.match(/^BASE_URL=(.+)$/m) || envContent.match(/^APP_URL=(.+)$/m);
        if (match) envBaseUrl = match[1].trim();
    } catch (e) {}
}
const BASE_URL = envBaseUrl || 'http://TelunasIssueTracker.test';

// Bot Security Token
let botApiKey = process.env.BOT_API_KEY;
if (!botApiKey && fs.existsSync('.env')) {
    try {
        const envContent = fs.readFileSync('.env', 'utf8');
        const match = envContent.match(/^BOT_API_KEY=(.+)$/m);
        if (match) botApiKey = match[1].trim();
    } catch (e) {}
}
if (!botApiKey && fs.existsSync('../.env')) {
    try {
        const envContent = fs.readFileSync('../.env', 'utf8');
        const match = envContent.match(/^BOT_API_KEY=(.+)$/m);
        if (match) botApiKey = match[1].trim();
    } catch (e) {}
}
const BOT_API_KEY = botApiKey || 'telunas_bot_secure_token_change_in_production';
axios.defaults.headers.common['X-Bot-Key'] = BOT_API_KEY;
// ───────────────────────────────────────────────────────────────────────────────

// Memory Leak Prevention: userStates with 20-minute TTL
const rawUserStates = new Map();
const userStates = {
    get(key) {
        const item = rawUserStates.get(key);
        if (!item) return undefined;
        if (Date.now() - (item._timestamp || 0) > 20 * 60 * 1000) {
            rawUserStates.delete(key);
            return undefined;
        }
        return item;
    },
    set(key, val) {
        if (val && typeof val === 'object') {
            val._timestamp = Date.now();
        }
        rawUserStates.set(key, val);
        return this;
    },
    has(key) {
        return this.get(key) !== undefined;
    },
    delete(key) {
        return rawUserStates.delete(key);
    },
    clear() {
        return rawUserStates.clear();
    },
    entries() {
        return rawUserStates.entries();
    }
};

setInterval(() => {
    const now = Date.now();
    for (const [key, val] of rawUserStates.entries()) {
        if (now - (val?._timestamp || 0) > 20 * 60 * 1000) {
            rawUserStates.delete(key);
        }
    }
}, 5 * 60 * 1000);

// Multi-group & Community Configuration
let botConfig = {
    generalGroupId: null,
    departmentGroups: {},
    channelId: null,
    channelInvite: '0029VbD3yVS2UPBOZRraWu2j',
    channelName: null
};
let linkedGroupId = null;

// Staff Phone Directory Mapping & Anti-Impersonation Cache
let staffPhones = {}; // { [phone]: { name, staff_name, department, role, id, source, syncedAt } }

function loadStaffPhones() {
    try {
        if (fs.existsSync('staff_phones.json')) {
            staffPhones = JSON.parse(fs.readFileSync('staff_phones.json', 'utf8'));
        }
    } catch (e) {
        console.error("Could not load staff_phones.json:", e);
    }
}

function saveStaffPhones() {
    try {
        fs.writeFileSync('staff_phones.json', JSON.stringify(staffPhones, null, 2), 'utf8');
    } catch (e) {
        console.error("Could not save staff_phones.json:", e);
    }
}

loadStaffPhones();

function normalizePhoneNumber(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
        clean = '62' + clean.substring(1);
    }
    return clean;
}

async function syncStaffDirectory() {
    try {
        const res = await axios.get(`${BASE_URL}/api/staff-directory`, { timeout: 4000 });
        if (res.data.success && Array.isArray(res.data.data)) {
            const currentDbUsers = res.data.data;
            const currentDbPhones = new Set();
            const currentDbMap = new Map();

            currentDbUsers.forEach(user => {
                if (user.whatsapp_number) {
                    const cleanPhone = String(user.whatsapp_number).replace(/[^0-9]/g, '');
                    const normPhone = normalizePhoneNumber(cleanPhone);
                    const localPhone = normPhone.startsWith('62') ? ('0' + normPhone.substring(2)) : cleanPhone;
                    if (cleanPhone) {
                        currentDbPhones.add(cleanPhone);
                        currentDbPhones.add(normPhone);
                        currentDbPhones.add(localPhone);
                        currentDbMap.set(cleanPhone, user);
                        currentDbMap.set(normPhone, user);
                        currentDbMap.set(localPhone, user);
                    }
                }
            });

            // 1. If DB has 0 users with WhatsApp numbers, reset EVERYTHING!
            if (currentDbPhones.size === 0) {
                staffPhones = {};
                saveStaffPhones();
                console.log(`Synced 0 staff WhatsApp numbers (all unlinked / reset).`);
                return { success: true, count: 0 };
            }

            // 2. Re-build staffPhones strictly from active DB users!
            const newStaffPhones = {};
            currentDbUsers.forEach(user => {
                if (user.whatsapp_number) {
                    const cleanPhone = String(user.whatsapp_number).replace(/[^0-9]/g, '');
                    const normPhone = normalizePhoneNumber(cleanPhone);
                    const localPhone = normPhone.startsWith('62') ? ('0' + normPhone.substring(2)) : cleanPhone;
                    const staffData = {
                        name: user.staff_name || user.name,
                        staff_name: user.staff_name || user.name,
                        department: user.department || '',
                        subdivision: user.subdivision || '',
                        role: user.role || 'department',
                        permissions: user.permissions || {},
                        id: user.id,
                        source: 'dashboard_profile',
                        realPhone: normPhone,
                        syncedAt: new Date().toISOString(),
                    };
                    newStaffPhones[cleanPhone] = staffData;
                    newStaffPhones[normPhone] = staffData;
                    newStaffPhones[localPhone] = staffData;
                }
            });

            // 3. Attach known device LIDs ONLY if their mapped phone is in currentDbPhones!
            for (const [lid, phone] of Object.entries(deviceMappings)) {
                const normMapped = normalizePhoneNumber(phone);
                if (currentDbPhones.has(phone) || currentDbPhones.has(normMapped)) {
                    const user = currentDbMap.get(phone) || currentDbMap.get(normMapped);
                    if (user) {
                        newStaffPhones[lid] = {
                            name: user.staff_name || user.name,
                            staff_name: user.staff_name || user.name,
                            department: user.department || '',
                            subdivision: user.subdivision || '',
                            role: user.role || 'department',
                            permissions: user.permissions || {},
                            id: user.id,
                            source: 'whatsapp_lid',
                            realPhone: normMapped,
                            syncedAt: new Date().toISOString(),
                        };
                    }
                }
            }

            staffPhones = newStaffPhones;
            saveStaffPhones();
            console.log(`Synced ${currentDbUsers.length} staff WhatsApp numbers from Laravel Dashboard.`);
            return { success: true, count: currentDbUsers.length };
        }
    } catch (e) {
        console.log(`Staff directory sync note: ${e.message}`);
    }
    return { success: false };
}

// Helper: Normalize name for anti-impersonation matching
function normalizeStaffName(name) {
    if (!name) return '';
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Find registered phone by staff name (for anti-impersonation)
function getRegisteredPhoneByStaffName(targetName, groupDeptKey = '') {
    const targetNorm = normalizeStaffName(targetName);
    if (!targetNorm) return null;

    const targetFirst = targetName.trim().split(/\s+/)[0].toLowerCase();

    for (const [phone, data] of Object.entries(staffPhones)) {
        const norm1 = normalizeStaffName(data.staff_name);
        const norm2 = normalizeStaffName(data.name);
        const phoneToReport = data.realPhone || phone;

        // 1. Direct normalized name match
        if (norm1 === targetNorm || norm2 === targetNorm || (norm1 && norm1.includes(targetNorm)) || (targetNorm && targetNorm.includes(norm1))) {
            return { phone: phoneToReport, rawKey: phone, ...data };
        }

        // 2. First name match within the same department (e.g. "Ratna Dewi" vs "Ratna Procurement")
        const staffFirst1 = (data.staff_name || '').trim().split(/\s+/)[0].toLowerCase();
        const staffFirst2 = (data.name || '').trim().split(/\s+/)[0].toLowerCase();
        const isSameDept = groupDeptKey && data.department && (data.department.toLowerCase() === groupDeptKey.toLowerCase());

        if (targetFirst && targetFirst.length > 2 && (staffFirst1 === targetFirst || staffFirst2 === targetFirst)) {
            if (isSameDept || !groupDeptKey) {
                return { phone: phoneToReport, rawKey: phone, ...data };
            }
        }
    }
    return null;
}

// Helper: Get registered staff for a sender's phone
function getStaffByPhone(phone) {
    if (!phone) return null;
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    if (staffPhones[cleanPhone]) return staffPhones[cleanPhone];

    const norm = normalizePhoneNumber(cleanPhone);
    if (staffPhones[norm]) return staffPhones[norm];

    const local = norm.startsWith('62') ? ('0' + norm.substring(2)) : norm;
    if (staffPhones[local]) return staffPhones[local];

    if (deviceMappings[cleanPhone]) {
        const mapped = deviceMappings[cleanPhone];
        const mappedNorm = normalizePhoneNumber(mapped);
        return staffPhones[mapped] || staffPhones[mappedNorm] || null;
    }

    return null;
}

// On-demand staff directory sync with 10-second debounce
let lastOnDemandSync = 0;
async function checkOrSyncStaff(senderPhone, rawSenderPhone) {
    let user = getStaffByPhone(senderPhone) || getStaffByPhone(rawSenderPhone);
    if (!user) {
        const now = Date.now();
        if (now - lastOnDemandSync > 10000) {
            lastOnDemandSync = now;
            await syncStaffDirectory();
            user = getStaffByPhone(senderPhone) || getStaffByPhone(rawSenderPhone);
        }
    }
    return user;
}

// --- UNREGISTERED NUMBER TRACKER (ANTI-SPAM RATE LIMIT & SECURITY ALERTS) ---
// Map<trackingKey, { count, firstAttempt, lastAttempt, lastRejectedReply, alertSent, sampleMessages }>
const unregisteredTracker = new Map();

// Periodic cleanup of stale tracker entries (older than 24 hours)
setInterval(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [key, data] of unregisteredTracker.entries()) {
        if (data.lastAttempt < cutoff) {
            unregisteredTracker.delete(key);
        }
    }
}, 60 * 60 * 1000);

function trackUnregisteredAttempt(phone, text, isGroup) {
    const now = Date.now();
    let record = unregisteredTracker.get(phone);
    if (!record) {
        record = {
            count: 0,
            firstAttempt: now,
            lastAttempt: now,
            lastRejectedReply: 0,
            alertSent: false,
            sampleMessages: []
        };
        unregisteredTracker.set(phone, record);
    }

    record.count += 1;
    record.lastAttempt = now;
    if (text) {
        const snippet = text.length > 80 ? text.substring(0, 77) + '...' : text;
        record.sampleMessages.push(snippet);
        if (record.sampleMessages.length > 3) {
            record.sampleMessages.shift();
        }
    }

    // Rate Limiting (Opsi 3): Only reply rejection in DM once per 1 hour (3,600,000 ms)
    const ONE_HOUR = 60 * 60 * 1000;
    let shouldReplyDm = false;
    if (!isGroup) {
        if (now - record.lastRejectedReply >= ONE_HOUR) {
            shouldReplyDm = true;
            record.lastRejectedReply = now;
        }
    }

    // Alert Trigger (Opsi 1): Alert when attempts reach 3 or more and alert hasn't been sent yet
    let shouldAlert = false;
    if (record.count >= 3 && !record.alertSent) {
        record.alertSent = true;
        shouldAlert = true;
    }

    return { record, shouldReplyDm, shouldAlert };
}

async function sendUnauthorizedAccessAlert(sock, displayPhone, record, isGroup, text) {
    try {
        const lastSnippet = text ? (text.length > 100 ? text.substring(0, 97) + '...' : text) : (record.sampleMessages[record.sampleMessages.length - 1] || '-');
        const alertMsg = 
            `⚠️ *PERINGATAN KEAMANAN: PERCOBAAN AKSES TIDAK SAH* ⚠️\n\n` +
            `Terdeteksi aktivitas berulang dari nomor WhatsApp yang *TIDAK TERDAFTAR*:\n` +
            `• *Nomor Pengirim:* +${displayPhone}\n` +
            `• *Frekuensi:* ${record.count} kali percobaan\n` +
            `• *Pesan Terakhir:* "${lastSnippet}"\n` +
            `• *Kanal:* ${isGroup ? 'Grup WhatsApp' : 'Direct Message (DM)'}\n\n` +
            `_🛡️ Tindakan Bot:_ Interaksi telah diblokir secara otomatis.\n` +
            `_💡 Catatan:_ Jika nomor ini milik staf resmi, mohon HOD / Admin mendaftarkan dan menyetujui akun mereka melalui Web Dashboard di ${BASE_URL}/users`;

        // 1. Send alert to General Group if configured
        if (botConfig.generalGroupId) {
            try {
                await sock.sendMessage(botConfig.generalGroupId, { text: alertMsg });
                console.log(`[Security Alert] Sent unauthorized access warning to General Group for +${displayPhone}`);
            } catch (errG) {
                console.error(`[Security Alert] Failed sending to General Group:`, errG.message);
            }
        }

        // 2. Also notify registered Admins via DM
        const notifiedAdminPhones = new Set();
        for (const [p, staff] of Object.entries(staffPhones)) {
            if (staff.role === 'admin' && staff.realPhone) {
                const adminPhone = staff.realPhone;
                if (!notifiedAdminPhones.has(adminPhone)) {
                    notifiedAdminPhones.add(adminPhone);
                    const adminJid = `${adminPhone}@s.whatsapp.net`;
                    try {
                        await sock.sendMessage(adminJid, { text: alertMsg });
                        console.log(`[Security Alert] Sent unauthorized access warning to Admin DM (+${adminPhone})`);
                    } catch (errAdmin) {
                        console.error(`[Security Alert] Failed sending to Admin DM (+${adminPhone}):`, errAdmin.message);
                    }
                }
            }
        }
    } catch (e) {
        console.error(`[Security Alert] Error dispatching alert:`, e.message);
    }
}

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

// Helper to resolve real phone number from WhatsApp group LID
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

    // 4. Auto-pair if single active user registered in DB
    const activeDbPhones = Object.keys(staffPhones).filter(k => k.length <= 13 && staffPhones[k].source === 'dashboard_profile');
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

function loadConfig() {
    try {
        if (fs.existsSync('config.json')) {
            const data = JSON.parse(fs.readFileSync('config.json', 'utf8'));
            botConfig.generalGroupId = data.generalGroupId || data.groupId || null;
            botConfig.departmentGroups = data.departmentGroups || {};
            botConfig.channelId = data.channelId || null;
            botConfig.channelInvite = data.channelInvite || '0029VbD3yVS2UPBOZRraWu2j';
            botConfig.channelName = data.channelName || null;
            linkedGroupId = botConfig.generalGroupId;
            console.log(`Loaded General Group ID: ${botConfig.generalGroupId}`);
            console.log(`Loaded ${Object.keys(botConfig.departmentGroups).length} Department Groups`);
            if (botConfig.channelId) {
                console.log(`Loaded WhatsApp Channel ID: ${botConfig.channelId}`);
            }
        }
    } catch (e) {
        console.error("Could not load config.json:", e);
    }
}

function saveConfig() {
    try {
        fs.writeFileSync('config.json', JSON.stringify(botConfig, null, 2), 'utf8');
    } catch (e) {
        console.error("Could not save config.json:", e);
    }
}

loadConfig();

// Helper to look up an issue by ID (including archived issues)
async function getIssueDetails(issueId) {
    if (!issueId) return null;
    const cleanId = String(issueId).trim();
    try {
        const res = await axios.get(`${BASE_URL}/api/issues/lookup/${encodeURIComponent(cleanId)}`, { timeout: 7000 });
        if (res.data?.success && res.data.data) {
            return res.data.data;
        }
    } catch (e) {
        // Fallback or not found
    }
    return null;
}

function getArchivedMessage(issue, lang = 'id') {
    const isEnglish = lang === 'en';
    const id = issue.id || 'N/A';
    const title = issue.title || '-';
    const archivedBy = issue.archivedBy || 'Admin';
    const archivedAt = issue.archivedAtStr || issue.archivedAt || '-';
    const location = issue.location ? `\n📍 *Lokasi:* ${issue.location}` : '';
    const locationEn = issue.location ? `\n📍 *Location:* ${issue.location}` : '';

    if (isEnglish) {
        return (
            `📦 *ISSUE ARCHIVED* 📦\n\n` +
            `Kartu masalah *${id}* ("${title}") sudah di-archive / diarsipkan oleh Administrator.\n` +
            locationEn + `\n` +
            `👤 *Archived By:* ${archivedBy}\n` +
            `🕒 *Archived At:* ${archivedAt}\n\n` +
            `ℹ️ *Note:* Issue cards that have been archived are closed and cannot be claimed, modified, or updated through WhatsApp. Contact Admin if this issue needs to be restored.`
        );
    }

    return (
        `📦 *KARTU MASALAH SUDAH DI-ARCHIVE* 📦\n\n` +
        `Kartu masalah *${id}* ("${title}") sudah di-archive / diarsipkan oleh Administrator.\n` +
        location + `\n` +
        `👤 *Diarsipkan Oleh:* ${archivedBy}\n` +
        `🕒 *Waktu Arsip:* ${archivedAt}\n\n` +
        `ℹ️ *Catatan:* Kartu masalah yang telah diarsipkan telah ditutup dan tidak dapat diklaim, diubah, atau dikerjakan kembali via WhatsApp. Hubungi Admin jika isu ini perlu dipulihkan (restore).`
    );
}

function getIssueSummaryMessage(issue, lang = 'id') {
    const isEn = lang === 'en';
    const statusIcons = {
        open: '🔴 Open (Unclaimed)',
        progress: '🟡 In Progress',
        pending: '⏸️ Pending (Delayed)',
        solved: '✅ Solved'
    };
    const statusIconsId = {
        open: '🔴 Open (Belum Diklaim)',
        progress: '🟡 Sedang Dikerjakan (In Progress)',
        pending: '⏸️ Ditunda (Pending)',
        solved: '✅ Selesai (Solved)'
    };
    const statusText = isEn ? (statusIcons[issue.status] || issue.status) : (statusIconsId[issue.status] || issue.status);
    
    if (isEn) {
        return (
            `📋 *ISSUE DETAILS: ${issue.id}*\n\n` +
            `📌 *Title:* ${issue.title}\n` +
            `📍 *Location:* ${issue.location || '-'}\n` +
            `🏢 *Department:* ${issue.department || '-'}\n` +
            `📊 *Status:* ${statusText}\n` +
            `👤 *Reporter:* ${issue.reporter || '-'}\n` +
            (issue.taker ? `👷 *Claimed by:* ${issue.taker}\n` : '') +
            (issue.solver ? `✅ *Solved by:* ${issue.solver}\n` : '') +
            (issue.pendingReason ? `⏸️ *Pending Reason:* ${issue.pendingReason}\n` : '')
        );
    }
    return (
        `📋 *DETAIL MASALAH: ${issue.id}*\n\n` +
        `📌 *Judul:* ${issue.title}\n` +
        `📍 *Lokasi:* ${issue.location || '-'}\n` +
        `🏢 *Departemen:* ${issue.department || '-'}\n` +
        `📊 *Status:* ${statusText}\n` +
        `👤 *Pelapor:* ${issue.reporter || '-'}\n` +
        (issue.taker ? `👷 *Dikerjakan oleh:* ${issue.taker}\n` : '') +
        (issue.solver ? `✅ *Diselesaikan oleh:* ${issue.solver}\n` : '') +
        (issue.pendingReason ? `⏸️ *Alasan Pending:* ${issue.pendingReason}\n` : '')
    );
}

const STEPS = {
    IDLE: 0,
    AWAITING_NAME: 1,
    AWAITING_TITLE: 2,
    AWAITING_DESC: 3,
    AWAITING_LOC: 4,
    AWAITING_CAT: 5,
    AWAITING_DESC: 3,
    AWAITING_LOC: 4,
    AWAITING_CAT: 5,
    AWAITING_PHOTO: 6,
    AWAITING_SOLVE_ID: 7,
    AWAITING_SOLVE_NAME: 8,
    AWAITING_SOLVE_DESC: 9,
    AWAITING_SOLVE_PHOTO: 10,
    AWAITING_CAT_OTHER: 11,
    AWAITING_CAT_CUSTOM: 12,
    AWAITING_PRIORITY: 13,
    AWAITING_CRITICAL_TIME: 14,
    SOS_AWAITING_NAME: 15,
    SOS_AWAITING_TITLE: 16,
    SOS_AWAITING_LOC: 17,
    AWAITING_PENDING_ID: 18,
    AWAITING_PENDING_NAME: 19,
    AWAITING_PENDING_REASON: 20,
    AWAITING_PENDING_PHOTO: 21,
    AWAITING_ORIGIN_DEPT: 22,
    AWAITING_ASSIGNED_DEPTS: 23,
    STATUS_AWAITING_DEPT: 24,
    STATUS_AWAITING_STATUS: 25,
    STATUS_AWAITING_CAT: 26,
    AWAITING_LOC_DETAIL: 27,  // Entered when user picks "Other" in location step
    SOS_AWAITING_DESC: 28,    // Optional details in SOS emergency flow
    // Out-of-order confirmation flows
    CONFIRM_CLAIM_THEN_PENDING: 29, // Issue is open; ask if user wants claim+pending
    CONFIRM_CLAIM_THEN_SOLVE: 30,   // Issue is open; ask if user wants claim+solve
    CONFIRM_CLAIM_PENDING_NAME: 31, // Collect worker name after yes-confirm for claim+pending
    AWAITING_MENU_LANG: 33,         // User typed "menu" and needs to choose ID or EN
    SOS_AWAITING_PHOTO: 34,         // Optional photo upload in SOS flow
    AWAITING_TAG_DEPT: 35,          // Multi-selection or skip for informational tags
};

const DEPARTMENTS = [
    'HR', 'GR', 'OE', 'Kitchen', 'HK', 'IT', 'Procurement', 'Finance', 'Reservasi', 'Engineer', 'Fasilitas'
];

// Map sub-departments / small units to their parent community group
const SUBDEPARTMENT_TO_MAIN = {
    // 🏢 HR Group
    'hr': 'hr',
    'legal': 'hr',
    'lnd': 'hr',
    'transportasi': 'hr',
    'tekong': 'hr',

    // 🌟 GR Group
    'gr': 'gr',
    'gre': 'gr',
    'guest relations': 'gr',
    'service': 'gr',
    'bar': 'gr',
    'spa': 'gr',
    'tirek': 'gr',

    // 🍳 Kitchen Group
    'kitchen': 'kitchen',
    'f&b': 'kitchen',
    'fnb': 'kitchen',

    // 🧹 HK Group
    'hk': 'hk',
    'pest control': 'hk',

    // 🛎️ Reservasi Group
    'reservasi': 'reservasi',
    'sales': 'reservasi',
    'marketing': 'reservasi',
    'sales/marketing': 'reservasi',

    // 🛠️ Fasilitas Group
    'fasilitas': 'fasilitas',
    'security': 'fasilitas',

    // Standalone
    'it': 'it',
    'oe': 'oe',
    'procurement': 'procurement',
    'finance': 'finance',
    'engineer': 'engineer',
};

// Staff rosters keyed by lowercase department or subdivision name
const DEPARTMENT_STAFF = {
    'engineer':         ['Dimas Pratama', 'Budi Santoso', 'Ahmad Fauzi', 'Hendra Wijaya', 'Joko Susilo'],
    'fasilitas':        ['Anto (Fasilitas)', 'Dedi Kusuma', 'Eko Purnomo', 'Fasilitas Team', 'Pak Joko (Security)', 'Agus Setiawan (Security)', 'Doni Prasetyo (Security)'],
    'security':         ['Pak Joko (Security)', 'Agus Setiawan (Security)', 'Doni Prasetyo (Security)', 'Security Lead'],
    'hk':               ['Siti Rahma (HK)', 'Dewi Lestari (HK)', 'Sri Wahyuni (HK)', 'Nurul Aini (HK)', 'Fitri Handayani (HK)', 'Wahyu Hidayat (Pest Control)'],
    'pest control':     ['Wahyu Hidayat (Pest Control)', 'Rian Kurniawan (Pest Control)', 'Pest Control Team'],
    'kitchen':          ['Chef Ricky (Kitchen)', 'Bayu Pratama (Kitchen)', 'Putri Ayu (Kitchen)', 'Kitchen Team'],
    'f&b':              ['Chef Ricky (Kitchen)', 'Bayu Pratama (Kitchen)', 'Putri Ayu (Kitchen)', 'Kitchen Team'],
    'service':          ['Andi Kurnia (Service)', 'Rina Marlina (Service)', 'Dian Anggraini (Service)', 'Service Captain'],
    'bar':              ['Lia (Bar)', 'Kevin Sanjaya (Bar)', 'Bar Team Lead'],
    'gre':              ['Wawan (GRE)', 'Nadia Safitri (GRE)', 'Indah Permata (GRE)', 'GRE Team'],
    'gr':               ['Wawan (GRE)', 'Nadia Safitri (GRE)', 'Indah Permata (GRE)', 'Andi Kurnia (Service)', 'Lia (Bar)', 'Nurse Maya (Spa)', 'Fajar Ramadhan (TiRek)'],
    'spa':              ['Nurse Maya (Spa)', 'Sari Wulandari (Spa)', 'Yanti Komala (Spa)', 'Spa Therapist Lead'],
    'tirek':            ['TiRek Coordinator', 'Fajar Ramadhan (TiRek)', 'Activity Guide Team'],
    'oe':               ['Dimas (OE)', 'OE Operations Lead', 'Taufik Hidayat'],
    'it':               ['Reza (IT)', 'Dani (IT)', 'IT Support Team'],
    'procurement':      ['Procurement Team', 'Budi Purchasing', 'Ratna Dewi'],
    'reservasi':        ['Maya Putri (Reservasi)', 'Reservasi Lead', 'Clarissa Tan (Sales)', 'Ana (Marketing)'],
    'sales':            ['Clarissa Tan (Sales)', 'Sales Lead'],
    'marketing':        ['Ana (Marketing)', 'Marketing Coordinator'],
    'finance':          ['Iwan Accountant', 'Finance Lead', 'Finance Officer'],
    'legal':            ['Advokat Hendro (Legal)', 'Ratna SH (Legal)', 'Legal Team Lead'],
    'lnd':              ['Putri (LnD)', 'LnD Specialist'],
    'transportasi':     ['Captain Arif (Transportasi)', 'Rudi Hartono (Transportasi)', 'Surya Saputra (Transportasi)'],
    'tekong':           ['Captain Arif (Transportasi)', 'Rudi Hartono (Transportasi)', 'Surya Saputra (Transportasi)'],
    'hr':               ['Pak Bambang (HR)', 'Siti HR Specialist', 'Advokat Hendro (Legal)', 'Putri (LnD)', 'Captain Arif (Transportasi)'],
};

/**
 * Get the department key for a WhatsApp group JID (reverse-lookup).
 */
function getDeptKeyForGroup(groupJid) {
    for (const [deptKey, gid] of Object.entries(botConfig.departmentGroups || {})) {
        if (gid === groupJid) return deptKey;
    }
    return null;
}

// Fixed 10-category system: no custom/dynamic categories
const CORE_DISPLAY = {
    '1': 'Broken Equipment',
    '2': 'Plumbing',
    '3': 'Electrical',
    '4': 'Structural / Building',
    '5': 'Pest & Hygiene',
    '6': 'IT & Technology',
    '7': 'Marine & Outdoor',
    '8': 'Safety Hazard',
    '9': 'Guest Issues',
    '10': 'Other'
};

// All categories as a flat array for the status filter flow
const ALL_CATEGORIES = ['broken equipment', 'plumbing', 'electrical', 'structural / building', 'pest & hygiene', 'it & technology', 'marine & outdoor', 'safety hazard', 'guest issues', 'other'];

const MENU_TEXT_ID = 
`📱 *TELUNAS RESORT ISSUE TRACKER — MENU UTAMA* 📱\n\n` +
`Berikut adalah daftar perintah WhatsApp:\n\n` +
`1. 🚨 *!darurat* / *sos* / *tolong* / *bantuan* / *help*\n   → Laporan cepat mode darurat SOS (deadline kritis otomatis).\n\n` +
`2. 📋 *!lapor* / *lapor* / *rusak*\n   → Laporkan masalah fasilitas resort step-by-step.\n\n` +
`3. 🔧 *!perbaiki* / *perbaiki* / *selesai* / *fix*\n   → Selesaikan masalah dengan deskripsi & foto bukti.\n\n` +
`4. ⏳ *!tunda* / *tunda* / *tertunda* / *pending*\n   → Tandai pekerjaan sebagai tertunda dengan foto alasan.\n\n` +
`5. 🤝 *!claim* (di Grup)\n   → Balas notifikasi masalah di grup untuk klaim instan (otomatis mengenali akun Anda).\n\n` +
`6. 👤 *!whoami*\n   → Cek status profil akun WhatsApp terdaftar Anda.\n\n` +
`7. 📊 *!status* / *!masalah*\n   → Cek status masalah berdasarkan departemen.\n\n` +
`8. 📖 *menu id* / *menu en*\n   → Buka menu panduan Bahasa Indonesia / English.\n\n` +
`9. ❌ *batal* / *reset*\n   → Batalkan percakapan & kembali ke awal.`;

const MENU_TEXT_EN = 
`📱 *TELUNAS RESORT ISSUE TRACKER — MAIN MENU* 📱\n\n` +
`Here is the complete list of WhatsApp commands:\n\n` +
`1. 🚨 *!sos* / *sos* / *emergency* / *help* / *darurat*\n   → Fast-track emergency report (automatic critical deadline).\n\n` +
`2. 📋 *!report* / *report* / *broken*\n   → Step-by-step issue reporting flow.\n\n` +
`3. 🔧 *!solve* / *solve* / *fix*\n   → Resolve an issue with fix description & proof photo.\n\n` +
`4. ⏳ *!pending* / *pending* / *delay*\n   → Mark a job as pending with reason & proof photo.\n\n` +
`5. 🤝 *!claim* (in Group)\n   → Reply directly to an issue notification to claim instantly (auto-detects your account).\n\n` +
`6. 👤 *!whoami*\n   → Check your linked WhatsApp staff account profile.\n\n` +
`7. 📊 *!status* / *!issues*\n   → Check active/solved issue status by department.\n\n` +
`8. 📖 *menu en* / *menu id*\n   → Open English / Indonesian guide menu.\n\n` +
`9. ❌ *cancel* / *reset*\n   → Cancel current operation & reset to menu.`;


// Helper: Clean command prefixes from issue ID input
function cleanIssueIdInput(input) {
    if (!input) return '';
    let cleaned = String(input).trim();
    cleaned = cleaned.replace(/^(!?pending|!?solve|!?tunda|!?perbaiki|!?lapor|!?report|!claim|claim|id:?)s+/i, '');
    cleaned = cleaned.replace(/^(ids*:s*)/i, '');
    return cleaned.trim();
}

// Helper: Match full or partial issue ID
function findIssueByIdOrPartial(issues, inputId) {
    if (!inputId || !issues || !issues.length) return null;
    const cleanId = cleanIssueIdInput(inputId).toLowerCase();
    if (!cleanId) return null;
    
    // 1. Exact match
    let found = issues.find(i => String(i.id).toLowerCase() === cleanId);
    if (found) return found;

    // 2. Suffix match (e.g. "190826-4" matches "UND-190826-4" or "Sec-190826-4")
    found = issues.find(i => String(i.id).toLowerCase().endsWith('-' + cleanId) || String(i.id).toLowerCase().endsWith(cleanId));
    if (found) return found;

    // 3. Substring match
    if (cleanId.length >= 4) {
        found = issues.find(i => String(i.id).toLowerCase().includes(cleanId));
        if (found) return found;
    }

    return null;
}



// Helper: Auto-Discover & Map Community Groups
async function syncCommunityGroups(sock) {
    try {
        const allGroups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(allGroups);
        let matched = [];

        for (const group of groupList) {
            const subject = group.subject.trim();
            const lowerSubject = subject.toLowerCase();

            // Announcements group is skipped because announcements are routed to the WhatsApp Channel
            if (lowerSubject.includes('general') || lowerSubject.includes('pengumuman') || lowerSubject === 'telunas resort issue report') {
                // Do not set generalGroupId — all broad announcements go to WhatsApp Channel!
            }

            // Auto-index all participants' LIDs to Phone numbers across all groups!
            if (Array.isArray(group.participants)) {
                for (const p of group.participants) {
                    const pPhone = String(p.id).replace(/[^0-9]/g, '');
                    const pLid = p.lid ? String(p.lid).replace(/[^0-9]/g, '') : null;
                    if (pLid && pPhone) {
                        lidToPhoneCache.set(pLid, pPhone);
                        if (staffPhones[pPhone] && !staffPhones[pLid]) {
                            staffPhones[pLid] = {
                                ...staffPhones[pPhone],
                                source: 'dashboard_profile',
                            };
                        }
                    }
                }
            }

            // Match each department
            for (const dept of DEPARTMENTS) {
                const deptKey = dept.toLowerCase();
                if (lowerSubject === deptKey || lowerSubject.startsWith(deptKey + ' ') || lowerSubject.endsWith(' ' + deptKey) || lowerSubject.includes(deptKey)) {
                    botConfig.departmentGroups[deptKey] = group.id;
                    matched.push(`🏷️ *${dept}*: "${subject}"`);
                }
            }
        }

        saveStaffPhones();
        saveConfig();
        return { success: true, count: matched.length, summary: matched.join('\n') };
    } catch (err) {
        console.error('Group sync error:', err);
        return { success: false, error: err.message };
    }
}

// Helper: Auto-resolve and follow WhatsApp Channel via invite code
async function syncWhatsAppChannel(sock) {
    try {
        const inviteCode = botConfig.channelInvite || '0029VbD3yVS2UPBOZRraWu2j';
        if (!inviteCode) return { success: false, error: 'No channel invite code configured' };

        console.log(`[Channel] Resolving channel invite code: ${inviteCode}...`);
        const meta = await sock.newsletterMetadata('INVITE', inviteCode);
        if (meta && meta.id) {
            botConfig.channelId = meta.id;
            botConfig.channelName = meta.name || 'Telunas Issue Tracker';
            saveConfig();
            console.log(`[Channel] ✅ Linked WhatsApp Channel: "${meta.name}" (${meta.id})`);
            return { success: true, id: meta.id, name: meta.name };
        }
    } catch (err) {
        console.log(`[Channel] Channel sync note: ${err.message}`);
        return { success: false, error: err.message };
    }
    return { success: false, error: 'Could not resolve channel metadata' };
}

let globalSock = null;

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }) // suppress spam
    });

    globalSock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('\n--> Scan the QR code above with WhatsApp to log in.');
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect.error?.output?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            console.log(`Connection closed (Status Code: ${statusCode || 'unknown'}). Reconnecting...`, !isLoggedOut);
            
            if (isLoggedOut) {
                console.log('\n⚠️ WhatsApp Session was logged out / expired.');
                console.log('--> Resetting auth_info_baileys and generating a new QR code...\n');
                try {
                    fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                } catch (e) {
                    console.error('Error resetting session files:', e.message);
                }
                setTimeout(() => startSock(), 1500);
            } else {
                setTimeout(() => startSock(), 2000);
            }
        } else if (connection === 'open') {
            console.log('Client is ready!');
            syncCommunityGroups(sock).then(res => { if (res.success) console.log(`Auto-synced ${res.count} community groups.`); });
            syncStaffDirectory();
            syncWhatsAppChannel(sock);
        }
    });

    // Periodically sync staff WhatsApp directory every 5 minutes
    setInterval(syncStaffDirectory, 5 * 60 * 1000);

    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
            if (!msg.message || msg.key.fromMe) continue;

            const from = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '').trim();

            const reply = async (replyText) => {
                await sock.sendMessage(from, { text: replyText }, { quoted: msg });
            };

            const senderJid = msg.key.participant || from;
            const rawSenderPhone = String(senderJid).replace(/[^0-9]/g, '');
            const senderPhone = await resolveSenderPhone(sock, from, msg);
            const registeredUser = await checkOrSyncStaff(senderPhone, rawSenderPhone);
            const lower = text.toLowerCase().trim();

            const isGroup = from.endsWith('@g.us');

            // --- STRICT ACCESS RESTRICTION: UNREGISTERED NUMBERS CANNOT INTERACT AT ALL ---
            if (!registeredUser) {
                // Clear any leftover state
                userStates.delete(senderPhone);
                userStates.delete(rawSenderPhone);
                userStates.delete(from);

                const displayPhone = (rawSenderPhone && rawSenderPhone.length <= 13) ? rawSenderPhone : (senderPhone || rawSenderPhone);
                const trackingKey = senderPhone || rawSenderPhone;

                // Track attempt for anti-spam rate limiting & security alert
                const { record, shouldReplyDm, shouldAlert } = trackUnregisteredAttempt(trackingKey, text, isGroup);

                // If attempts threshold reached (>= 3 attempts), send security alert to Admin & General Group
                if (shouldAlert) {
                    await sendUnauthorizedAccessAlert(sock, displayPhone, record, isGroup, text);
                }

                if (isGroup) {
                    // In WhatsApp groups: silent drop (completely ignore, do not respond or interact)
                    continue;
                } else {
                    // In private DM: rate limited rejection (maximum once per 1 hour)
                    if (shouldReplyDm) {
                        await reply(
                            `🔒 *AKSES DITOLAK — NOMOR TIDAK TERDAFTAR*\n\n` +
                            `Nomor WhatsApp Anda (+${displayPhone}) tidak terdaftar dalam sistem Telunas Issue Tracker.\n\n` +
                            `Bot ini hanya dapat diakses dan digunakan oleh staf resmi yang telah terdaftar di Web Dashboard.\n\n` +
                            `📌 *Pendaftaran Akun Staf:*\n` +
                            `Silakan mendaftar melalui Web Dashboard di ${BASE_URL}/register atau hubungi HOD / Admin departemen Anda.`
                        );
                    } else {
                        console.log(`[Rate Limit] Suppressed repeat rejection DM to +${displayPhone} (last reply within 1h). Attempt #${record.count}`);
                    }
                    continue;
                }
            } else {
                // User is registered: clear any lingering tracking history
                unregisteredTracker.delete(senderPhone);
                unregisteredTracker.delete(rawSenderPhone);
            }

            // --- 0. Global Self-Service Identity Command (Works in DM & Groups) ---
            if (lower === '!whoami' || lower === '!profil' || lower === '!akun' || lower === 'whoami' || lower === 'profil') {
                const displayPhone = registeredUser.realPhone || (senderPhone.length <= 13 ? senderPhone : (registeredUser.phone || senderPhone));
                const hasSubdivision = registeredUser.subdivision && registeredUser.subdivision.toLowerCase() !== (registeredUser.department || '').toLowerCase();
                let profileMsg = `📱 *PROFIL WHATSAPP TELUNAS* 📱\n\n`;
                profileMsg += `• *Nama Tampilan:* ${registeredUser.name || registeredUser.staff_name}\n`;
                profileMsg += `• *Departemen:* ${registeredUser.department || '-'}${hasSubdivision ? ` [${registeredUser.department} • ${registeredUser.subdivision}]` : ''}\n`;
                profileMsg += `• *Nomor WhatsApp:* +${displayPhone}\n`;
                profileMsg += `• *Status:* ✅ Terverifikasi (${registeredUser.source === 'dashboard_profile' ? 'Dashboard Profile' : 'WhatsApp Link'})\n\n`;
                profileMsg += `💡 _Setiap kali Anda mengetik !claim atau membuat laporan, sistem akan otomatis mencatat atas nama Anda._\n\n`;
                profileMsg += `🔑 _Lupa password Web Dashboard? Reply pesan ini atau ketik *!password* untuk melihat password akun Anda._`;
                await reply(profileMsg);
                continue;
            }

            // --- Password Retrieval for Verified Linked Accounts ---
            const passwordKeywords = ['!password', '!resetpassword', '!lupapassword', '!pass', 'password', 'reset password', 'lupa password', 'minta password', 'lupa sandi', 'lihat password'];
            const isPasswordRequest = passwordKeywords.some(kw => lower === kw || lower.startsWith(kw + ' '));

            if (isPasswordRequest) {

                try {
                    const targetPhone = registeredUser.realPhone || senderPhone || rawSenderPhone;
                    const resetRes = await axios.post(`${BASE_URL}/api/reset-whatsapp-password`, {
                        user_id: registeredUser.id,
                        whatsapp_number: targetPhone,
                    });

                    if (resetRes.data.success) {
                        const { email, password, name, department } = resetRes.data;
                        let credsMsg = `🔐 *KREDENSIAL LOGIN WEB TELUNAS* 🔐\n\n`;
                        credsMsg += `Halo *${name}*, berikut adalah akun login Web Dashboard Anda:\n\n`;
                        credsMsg += `• *Departemen:* ${department || '-'}\n`;
                        credsMsg += `• *Email:* ${email}\n`;
                        credsMsg += `• *Password:* *${password || 'telunas123'}*\n\n`;
                        credsMsg += `🌐 *Link Login:* ${BASE_URL}/login\n\n`;
                        credsMsg += `💡 _Anda dapat mengubah password ini kapan saja melalui menu Profile di Web Dashboard._`;

                        if (from.endsWith('@g.us')) {
                            // In a group: Send credentials strictly to private DM to protect password privacy!
                            const userDmJid = `${targetPhone}@s.whatsapp.net`;
                            try {
                                await sock.sendMessage(userDmJid, { text: credsMsg });
                                await reply(`🔒 *Keamanan Terjaga*\n\nPassword akun *${name}* telah dikirimkan secara rahasia ke *Chat Pribadi (DM)* WhatsApp Anda.`);
                            } catch (dmErr) {
                                await reply(credsMsg);
                            }
                        } else {
                            // Already in private chat
                            await reply(credsMsg);
                        }
                    } else {
                        await reply(`❌ Gagal mengambil password: ${resetRes.data.message || 'Error tidak diketahui'}`);
                    }
                } catch (e) {
                    const errMsg = e.response?.data?.message || e.message;
                    await reply(`❌ Gagal mengambil password: ${errMsg}`);
                }
                continue;
            }

            if (lower.startsWith('!iam') || lower.startsWith('!daftar') || lower.startsWith('iam ')) {
                await reply(`ℹ️ *Pendaftaran Mandiri via WhatsApp Dinonaktifkan*\n\nNomor WhatsApp hanya dapat didaftarkan melalui Web Dashboard (${BASE_URL}) dengan verifikasi HOD & Admin, atau didaftarkan langsung oleh Administrator.`);
                continue;
            }

            if (lower === '!syncstaff' || lower === '!refreshstaff') {
                await reply('🔄 Menyinkronkan daftar nomor WhatsApp staf dari Web Dashboard...');
                const res = await syncStaffDirectory();
                if (res.success) {
                    await reply(`✅ *Sinkronisasi Berhasil!*\n\n${res.count} nomor WhatsApp staf tersinkronisasi dari Database Dashboard.`);
                } else {
                    await reply(`⚠️ Sinkronisasi selesai (menggunakan cache lokal ${Object.keys(staffPhones).length} staf terdaftar).`);
                }
                continue;
            }

            // --- DIRECT ISSUE QUERY / LOOKUP (Both Group & DM) ---
            let queryIssueId = null;
            let isExplicitLookup = false;
            const checkPrefixes = ['!cek', '!check', '!info', '!isu', '!issue', '!cari', '!lookup', '!status'];
            const trimmedMsgText = text.trim();
            for (const pfx of checkPrefixes) {
                if (lower.startsWith(pfx)) {
                    const remainder = trimmedMsgText.substring(pfx.length).trim();
                    if (remainder && /^[A-Za-z0-9\-_]+$/.test(remainder)) {
                        queryIssueId = remainder;
                        isExplicitLookup = true;
                        break;
                    }
                }
            }
            // Also match if message itself is exactly an issue ID pattern (e.g. HK-140926-2 or 140926-2)
            if (!queryIssueId && /^(?:[A-Za-z]{2,5}-)?\d{6}-\d+$/i.test(trimmedMsgText)) {
                queryIssueId = trimmedMsgText;
            }

            if (queryIssueId) {
                const issueDetails = await getIssueDetails(queryIssueId);
                if (issueDetails) {
                    if (issueDetails.isArchived) {
                        await reply(getArchivedMessage(issueDetails, 'id'));
                    } else {
                        await reply(getIssueSummaryMessage(issueDetails, 'id'));
                    }
                    continue;
                } else if (isExplicitLookup) {
                    await reply(`❌ Masalah dengan ID *${queryIssueId}* tidak ditemukan dalam sistem Telunas.`);
                    continue;
                }
            }

            // Group messages handler
            if (from.endsWith('@g.us')) {
                // Auto-map this group on-the-fly if not already mapped
                try {
                    const groupMeta = await sock.groupMetadata(from);
                    if (groupMeta && groupMeta.subject) {
                        const subject = groupMeta.subject.trim().toLowerCase();
                        if (subject === 'general' || subject.includes('pengumuman') || subject === 'telunas resort issue report') {
                            if (botConfig.generalGroupId !== from) {
                                botConfig.generalGroupId = from;
                                saveConfig();
                            }
                        }
                        for (const dept of DEPARTMENTS) {
                            const deptKey = dept.toLowerCase();
                            if (subject === deptKey || subject.startsWith(deptKey + ' ') || subject.endsWith(' ' + deptKey) || subject.includes(deptKey)) {
                                if (botConfig.departmentGroups[deptKey] !== from) {
                                    botConfig.departmentGroups[deptKey] = from;
                                    saveConfig();
                                    console.log(`Auto-mapped group "${groupMeta.subject}" to department ${dept}`);
                                }
                            }
                        }
                    }
                } catch (e) {}

                // 1. Leave testing/old group
                if (lower === '!leavegroup' || lower === '!leave') {
                    await reply('👋 Goodbye! Leaving this group now...');
                    try {
                        await sock.groupLeave(from);
                    } catch (e) {
                        console.error('Failed to leave group:', e.message);
                    }
                    continue;
                }

                // 2. Auto-sync community groups
                if (lower === '!syncgroups' || lower === '!sync') {
                    await reply('🔄 Scanning all WhatsApp Community groups... Please wait.');
                    const res = await syncCommunityGroups(sock);
                    if (res.success) {
                        await reply(`✅ *Community Groups Synced Successfully!* (${res.count} groups mapped)\n\n${res.summary || 'No department groups found.'}`);
                    } else {
                        await reply(`❌ Failed to sync groups: ${res.error}`);
                    }
                    continue;
                }

                // 3. Manual group link: !setgroup or !setgroup <DeptName>
                if (lower.startsWith('!setgroup')) {
                    const arg = text.substring(9).trim();
                    if (!arg || arg.toLowerCase() === 'general') {
                        botConfig.generalGroupId = from;
                        saveConfig();
                        await reply('✅ This group is now set as the *General Announcement Group*! All notifications and @ALL emergencies will be sent here.');
                    } else {
                        const matchedDept = DEPARTMENTS.find(d => d.toLowerCase() === arg.toLowerCase());
                        if (matchedDept) {
                            botConfig.departmentGroups[matchedDept.toLowerCase()] = from;
                            saveConfig();
                            await reply(`✅ This group is now linked to the *${matchedDept}* department! Notifications tagged with @${matchedDept} will be routed here.`);
                        } else {
                            await reply(`❓ Department "${arg}" not recognized. Available departments:\n${DEPARTMENTS.join(', ')}\n\nOr use !syncgroups to automatically map all groups!`);
                        }
                    }
                    continue;
                }

                // 4. View currently linked groups & channel
                if (lower === '!groups' || lower === '!groupinfo') {
                    let msgInfo = '📋 *LINKED TELUNAS CHANNELS & GROUPS* 📋\n\n';
                    msgInfo += `📢 *WhatsApp Channel:* ${botConfig.channelId ? `✅ Linked (${botConfig.channelName || botConfig.channelId})` : (botConfig.channelInvite ? `⏳ Pending Sync (${botConfig.channelInvite})` : '❌ Not set')}\n`;
                    msgInfo += `📌 *General Group:* ${botConfig.generalGroupId ? '✅ Configured' : '❌ Not set'}\n\n`;
                    msgInfo += '*Department Groups:*\n';
                    DEPARTMENTS.forEach(d => {
                        const isSet = botConfig.departmentGroups[d.toLowerCase()] ? '✅' : '❌';
                        msgInfo += `• ${d}: ${isSet}\n`;
                    });
                    msgInfo += '\n💡 Type !syncgroups to auto-detect community groups, or !setchannel <link> to link a WhatsApp Channel.';
                    await reply(msgInfo);
                    continue;
                }

                // 4b. Command to set or re-sync WhatsApp Channel
                if (lower.startsWith('!setchannel') || lower === '!syncchannel') {
                    const arg = text.substring(lower.startsWith('!setchannel') ? 11 : 12).trim();
                    let code = arg;
                    if (code.includes('whatsapp.com/channel/')) {
                        code = code.split('whatsapp.com/channel/')[1].split(/[/?#]/)[0];
                    }
                    if (code) {
                        botConfig.channelInvite = code;
                        saveConfig();
                    }
                    await reply(`⏳ Checking WhatsApp Channel with invite code *${botConfig.channelInvite || '0029VbD3yVS2UPBOZRraWu2j'}*...`);
                    const res = await syncWhatsAppChannel(sock);
                    if (res.success) {
                        await reply(`✅ *WhatsApp Channel Linked Successfully!*\n\n• *Name:* ${res.name}\n• *ID:* \`${res.id}\`\n\nAll new issue reports and alerts will now be broadcasted directly to this Channel!`);
                    } else {
                        await reply(`⚠️ Could not link channel: ${res.error || 'Unknown error'}\n\nPlease ensure the bot is an *Admin* of the channel and the invite link is valid.`);
                    }
                    continue;
                }

                if (text.toLowerCase().startsWith('!claim')) {
                    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    const quotedText = quotedMsg?.conversation || quotedMsg?.imageMessage?.caption || quotedMsg?.extendedTextMessage?.text;

                    let issueId = null;
                    if (quotedText) {
                        // Match alphanumeric ID with hyphens
                        const idMatch = quotedText.match(/ID:\s*\*?\s*([A-Za-z0-9\-_]+)/i);
                        if (idMatch) issueId = idMatch[1];
                    }
                    if (!issueId) {
                        const parts = text.trim().split(/\s+/);
                        if (parts.length > 1 && /^[A-Za-z0-9\-_]+$/.test(parts[1])) {
                            issueId = parts[1];
                        }
                    }

                    if (!issueId) {
                        await reply('Please reply directly to an issue notification to claim it, or type *!claim <IssueID>*. Example: *!claim HK-140926-2*');
                        continue;
                    }

                    try {
                        let issue = null;
                        const getRes = await axios.get(`${BASE_URL}/api/issues`);
                        if (getRes.data?.success) {
                            issue = getRes.data.data.find(i => i.id === issueId);
                        }

                        if (!issue) {
                            const lookup = await getIssueDetails(issueId);
                            if (lookup?.isArchived) {
                                await reply(getArchivedMessage(lookup, state.lang));
                                continue;
                            }
                            if (lookup) {
                                issue = lookup;
                            } else {
                                await reply(`❌ Could not find issue *${issueId}* in the system.`);
                                continue;
                            }
                        }

                        if (issue.isArchived) {
                            await reply(getArchivedMessage(issue, state.lang));
                            continue;
                        }

                        // Status guards
                        if (issue.status === 'solved') {
                            await reply(`✅ Issue *${issueId}* has already been *solved*. No further action needed.`);
                            continue;
                        }
                        if (issue.status === 'progress') {
                            await reply(`⚠️ Issue *${issueId}* has already been claimed by *${issue.taker || 'someone'}* and is currently *In Progress*.`);
                            continue;
                        }
                        if (issue.status === 'pending') {
                            await reply(`⏸️ Issue *${issueId}* is currently *Pending* (delayed by ${issue.pendingBy || 'someone'}). It cannot be re-claimed until it's back In Progress.`);
                            continue;
                        }

                        // Determine which department this WhatsApp group belongs to
                        const groupDeptKey = getDeptKeyForGroup(from);

                        // Build authorized assigned dept keys (Tagged departments are INFO ONLY, cannot claim)
                        const assignedDepts = (Array.isArray(issue.assignedDepartments) ? issue.assignedDepartments : (issue.assignedDepartments || '').split(',').map(d => d.trim())).filter(Boolean);
                        const taggedDepts  = (Array.isArray(issue.taggedDepartments) ? issue.taggedDepartments : (issue.taggedDepartments || '').split(',').map(d => d.trim())).filter(Boolean);
                        const assignedKeys = assignedDepts.map(d => d.toLowerCase());
                        const taggedKeys   = taggedDepts.map(d => d.toLowerCase());

                        // --- GROUP AUTHORIZATION CHECK (ASSIGNED ONLY) ---
                        const isAllDepts = assignedDepts.some(d => d.toUpperCase() === 'ALL');
                        const isAssigned = isAllDepts || !groupDeptKey || assignedKeys.includes(groupDeptKey) || assignedDepts.some(ad => {
                            const adNorm = ad.toLowerCase().trim();
                            const adMain = SUBDEPARTMENT_TO_MAIN[adNorm] || adNorm;
                            return adNorm === groupDeptKey || adMain === groupDeptKey;
                        });
                        const isTaggedOnly = !isAssigned && groupDeptKey && taggedKeys.includes(groupDeptKey);

                        if (!isAssigned && groupDeptKey) {
                            const assignedList = assignedDepts.filter(d => d.toUpperCase() !== 'ALL').join(', ') || 'departemen yang ditugaskan';
                            const taggedList   = taggedDepts.filter(d => d.toUpperCase() !== 'ALL').join(', ');

                            if (isTaggedOnly) {
                                let routingMsg = `📢 *Departemen Anda hanya di-Tag (Hanya Info / Pemantauan)*\n\n`;
                                routingMsg += `Masalah *${issueId}* ini ditugaskan (*Assigned*) kepada: *${assignedList}*.\n`;
                                routingMsg += `Departemen Anda (${groupDeptKey.toUpperCase()}) hanya menerima notifikasi info dan tidak dapat mengklaim perbaikan ini.`;
                                await reply(routingMsg);
                            } else {
                                let routingMsg = `ℹ️ *Masalah ${issueId}* tidak ditugaskan ke departemen Anda.\n\n`;
                                routingMsg += `🎯 *Ditugaskan kepada:* ${assignedList}\n`;
                                if (taggedList) routingMsg += `📢 *Notifikasi info:* ${taggedList}\n`;
                                routingMsg += `\nSilakan hubungi tim terkait untuk menangani masalah ini.`;
                                await reply(routingMsg);
                            }
                            continue;
                        }

                        // --- SENDER RESOLUTION & ANTI-IMPERSONATION ---
                        const senderJid = msg.key.participant || from;
                        const rawSenderPhone = String(senderJid).replace(/[^0-9]/g, '');
                        const resolvedSenderPhone = await resolveSenderPhone(sock, from, msg);
                        const registeredUser = getStaffByPhone(resolvedSenderPhone) || getStaffByPhone(rawSenderPhone);
                        const senderPhone = resolvedSenderPhone || rawSenderPhone;

                        // --- SENDER BARRIER & PERMISSION CHECK ---
                        if (registeredUser && registeredUser.role !== 'admin') {
                            if (registeredUser.permissions && registeredUser.permissions.can_manage_issues === false) {
                                await reply(`❌ *Akses Dibatasi (Barrier Aktif)* ❌\n\nIzin mengedit & mengklaim isu untuk akun Anda telah dinonaktifkan oleh Administrator di Web Dashboard.`);
                                continue;
                            }
                        }

                        // --- SENDER DEPARTMENT AUTHORIZATION CHECK ---
                        if (registeredUser && !isAllDepts && registeredUser.role !== 'admin') {
                            const userDeptRaw = (registeredUser.department || '').toLowerCase().trim();
                            const userSubdivRaw = (registeredUser.subdivision || '').toLowerCase().trim();
                            const userMainDept = SUBDEPARTMENT_TO_MAIN[userDeptRaw] || userDeptRaw;
                            const userSubdivMain = SUBDEPARTMENT_TO_MAIN[userSubdivRaw] || userSubdivRaw;

                            const isUserAuthorized = assignedKeys.includes(userDeptRaw) ||
                                                     assignedKeys.includes(userMainDept) ||
                                                     (userSubdivRaw && assignedKeys.includes(userSubdivRaw)) ||
                                                     (userSubdivMain && assignedKeys.includes(userSubdivMain)) ||
                                                     assignedDepts.some(ad => {
                                                         const adNorm = ad.toLowerCase().trim();
                                                         const adMain = SUBDEPARTMENT_TO_MAIN[adNorm] || adNorm;
                                                         return adNorm === userDeptRaw || adMain === userDeptRaw || adMain === userMainDept;
                                                     });

                            if (!isUserAuthorized) {
                                const userDeptDisplay = registeredUser.department || 'Lainnya';
                                const assignedList = assignedDepts.filter(d => d.toUpperCase() !== 'ALL').join(', ') || 'departemen yang ditugaskan';
                                let rejectMsg = `❌ *Klaim Tidak Diizinkan / Claim Unauthorized* ❌\n\n`;
                                rejectMsg += `Halo *${registeredUser.name || registeredUser.staff_name}*, Anda terdaftar sebagai staf departemen *${userDeptDisplay}*.\n\n`;
                                rejectMsg += `Masalah *${issueId}* ini ditugaskan khusus untuk departemen:\n`;
                                rejectMsg += `🎯 *${assignedList}*\n\n`;
                                rejectMsg += `Pekerjaan ini hanya dapat diklaim oleh staf dari departemen yang ditugaskan.`;
                                await reply(rejectMsg);
                                continue;
                            }
                        }

                        if (!registeredUser) {
                            await reply(`❌ *Klaim Ditolak (Nomor Belum Terdaftar)* ❌\n\nNomor WhatsApp Anda (+${senderPhone}) belum terdaftar di Web Dashboard Telunas.\n\nSesuai kebijakan Telunas, pengklaiman masalah hanya dapat dilakukan oleh staf terdaftar yang telah disetujui HOD & Admin.`);
                            continue;
                        }

                        let takerName = registeredUser.name || registeredUser.staff_name;
                        let autoSaved = false;

                        const userTrueDept = registeredUser?.department || (groupDeptKey ? (groupDeptKey.charAt(0).toUpperCase() + groupDeptKey.slice(1)) : '');
                        const deptLabel = userTrueDept ? (userTrueDept.charAt(0).toUpperCase() + userTrueDept.slice(1)) : '';
                        const claimRes = await axios.post(`${BASE_URL}/api/issues/${issue.rowIndex}/claim`, {
                            taker: takerName + (deptLabel ? ` (${deptLabel})` : '') + ' via WhatsApp',
                            ...(deptLabel ? { department: deptLabel } : {}),
                        });

                        if (claimRes.data.success) {
                            let successMsg = `✅ Issue *${issueId}* berhasil diklaim oleh *${takerName}*!`;
                            if (autoSaved) {
                                successMsg += `\n\n💡 *Nomor Anda (+${senderPhone}) kini tersimpan.* Selanjutnya, Anda cukup reply *!claim* tanpa perlu memilih nama lagi.`;
                            }
                            await reply(successMsg);
                        } else {
                            await reply(`❌ Failed to claim: ${claimRes.data.message || 'Unknown error'}`);
                        }
                    } catch (e) {
                        const errMsg = e.response?.data?.message || e.message;
                        await reply(`❌ API Error: ${errMsg}`);
                    }
                }

                // Allow state machine for this user if they are in an active flow, or triggering one
                const p = msg.key.participant || from;
                const sk = `${from}_${p}`;
                const hasActiveState = userStates.has(sk);
                const isStatusTrigger = text.toLowerCase() === '!status' || text.toLowerCase() === '!issues';
                const isCancelTrigger = ['cancel', 'batal', 'reset', '!cancel', '!batal'].includes(text.toLowerCase().trim());
                
                if (!hasActiveState && !isStatusTrigger && !isCancelTrigger) {
                    continue; // Ignore normal group chatter
                }
            }

            // --- USER DM OR ACTIVE GROUP FLOW ---
            const participant = msg.key.participant || from;
            const stateKey = from.endsWith('@g.us') ? `${from}_${participant}` : from;
            let state = userStates.get(stateKey) || { step: STEPS.IDLE, data: {}, lang: 'en' };

            const lowerText = text.toLowerCase();

            // Language detection helper function
            const getMsg = (enText, idText) => (state.lang === 'id' ? idText : enText);

            // Detect language from user input
            const idKeywords = ['lapor', 'rusak', 'ada masalah', 'bocor', 'patah', 'mati', 'darurat', 'tolong', 'bantu', 'perbaiki', 'diperbaiki', 'selesai', 'sudah bener', 'udah', 'tunda', 'tertunda', 'batal', 'bantuan', 'masalah', 'daftar'];
            if (idKeywords.some(kw => lowerText.includes(kw))) {
                state.lang = 'id';
            } else if (['report', 'sos', 'emergency', 'urgent', 'help', 'solve', 'fix', 'pending', 'delay', 'cancel', 'reset', 'status', 'issues'].some(kw => lowerText.includes(kw))) {
                state.lang = 'en';
            }

            if (lowerText === 'cancel' || lowerText === 'reset' || lowerText === 'batal') {
                userStates.delete(stateKey);
                await reply(getMsg(
                    '❌ Operation cancelled. You can type "report" to report an issue, "sos" for emergency, or "solve" to resolve one.',
                    '❌ Operasi dibatalkan. Anda dapat mengetik "lapor" untuk melaporkan masalah, "darurat" untuk SOS, atau "perbaiki" untuk menyelesaikannya.'
                ));
                continue;
            }

            if (state.step === STEPS.IDLE) {
                // Keyword lists for intent detection
                // NOTE: "menu" is strictly for opening the guide. "help", "bantuan", "tolong", "sos", "darurat" are all routed to EMERGENCY SOS!
                const menuKeywords   = ['!menu', 'menu'];
                const sosKeywords    = ['!sos', 'sos', '!darurat', 'darurat', 'emergency', 'urgent', '!help', 'help', '!bantuan', 'bantuan', 'tolong', 'bantu'];
                const reportKeywords = ['!report', 'report', '!lapor', 'lapor', 'rusak', 'ada masalah', 'bocor', 'patah', 'mati'];
                const solveKeywords  = ['!solve', 'solve', '!perbaiki', 'perbaiki', 'diperbaiki', 'sudah bener', 'selesai', 'fix', 'udah'];
                const pendingKeywords= ['!pending', 'pending', '!tunda', 'tunda', 'delay', 'tertunda'];
                const statusKeywords = ['!status', '!issues', '!masalah', '!daftar'];

                let intent = 'UNKNOWN';

                // Direct language-specific menu requests
                // Direct language-specific menu requests
                if (lowerText === 'menu id' || lowerText === '!menu id') {
                    state.lang = 'id';
                    await reply(MENU_TEXT_ID);
                    continue;
                } else if (lowerText === 'menu en' || lowerText === '!menu en') {
                    state.lang = 'en';
                    await reply(MENU_TEXT_EN);
                    continue;
                } else if (menuKeywords.some(kw => lowerText === kw)) {
                    await reply(
                        `🌐 *PILIH BAHASA / SELECT LANGUAGE* 🌐\n\n` +
                        `Silakan balas dengan angka / ketik perintah:\n` +
                        `1️⃣ Balas *1* atau ketik *menu EN* → English Menu\n` +
                        `2️⃣ Balas *2* atau ketik *menu ID* → Menu Bahasa Indonesia`
                    );
                    userStates.set(stateKey, { step: STEPS.AWAITING_MENU_LANG, data: {}, lang: state.lang });
                    continue;
                } else if (sosKeywords.some(kw => lowerText.includes(kw))) {
                    intent = 'SOS';
                } else if (reportKeywords.some(kw => lowerText.includes(kw))) {
                    intent = 'REPORT';
                } else if (solveKeywords.some(kw => lowerText.includes(kw))) {
                    intent = 'SOLVE';
                } else if (pendingKeywords.some(kw => lowerText.includes(kw))) {
                    intent = 'PENDING';
                } else if (statusKeywords.some(kw => lowerText.includes(kw))) {
                    intent = 'STATUS';
                }

                // If UNKNOWN, silently ignore so it doesn't disturb normal chats
                if (intent === 'UNKNOWN') {
                    continue;
                }

                // --- SECURITY & ACCESS GATEKEEPER ---
                const rawSenderPhone = String(participant).replace(/[^0-9]/g, '');
                const senderPhone = await resolveSenderPhone(sock, from, msg);
                const registeredStaff = getStaffByPhone(senderPhone) || getStaffByPhone(rawSenderPhone);

                if (!registeredStaff) {
                    await reply(
                        `🔒 *AKSES TERBATAS — TELUNAS RESORT* 🔒\n\n` +
                        `Nomor WhatsApp Anda (+${rawSenderPhone}) belum terdaftar di Web Dashboard Telunas.\n\n` +
                        `📌 *Alur Pendaftaran:*\n` +
                        `1. Registrasi akun mandiri di Web Dashboard (${BASE_URL}/register) dengan persetujuan HOD & Admin, ATAU\n` +
                        `2. Hubungi Admin / HOD Departemen Anda untuk mendaftarkan nomor ini.\n\n` +
                        `_Catatan: Pendaftaran langsung via WhatsApp telah dinonaktifkan._`
                    );
                    continue;
                }

                // Dispatch detected intent with user's locked department context
                if (intent === 'SOS') {
                    const userDept = registeredStaff.department || 'General';
                    const userName = registeredStaff.name || registeredStaff.staff_name || 'Staff';

                    state.data.department = userDept;
                    state.data.reporter = userName + " (via WhatsApp)";
                    state.data.isEmergency = true;
                    state.step = STEPS.SOS_AWAITING_TITLE;
                    userStates.set(stateKey, state);

                    await reply(getMsg(
                        `🚨 EMERGENCY MODE (*${userDept}* — ${userName}) 🚨\n\nStay calm. What is the emergency situation? (e.g. Fire in kitchen, Guest medical emergency):`,
                        `🚨 MODE DARURAT (*${userDept}* — ${userName}) 🚨\n\nTetap tenang. Apa situasi darurat yang terjadi? (contoh: Kebakaran di dapur, Tamu butuh bantuan medis):`
                    ));
                    continue;
                } else if (intent === 'REPORT') {
                    const userDept = registeredStaff.department || 'General';
                    const userName = registeredStaff.name || registeredStaff.staff_name || 'Staff';

                    state.data.department = userDept;
                    state.data.reporter = userName + " (via WhatsApp)";
                    state.step = STEPS.AWAITING_TITLE;
                    userStates.set(stateKey, state);

                    await reply(getMsg(
                        `📋 *TELUNAS ISSUE REPORT* 📋\n👤 Pelapor: *${userName}* (*${userDept}*)\n\nWhat is the title/summary of the issue? (e.g. AC tidak dingin, Pipa bocor):`,
                        `📋 *LAPORAN MASALAH TELUNAS* 📋\n👤 Pelapor: *${userName}* (*${userDept}*)\n\nApa judul/ringkasan masalah yang ingin dilaporkan? (contoh: AC tidak dingin di Villa 5, Pipa bocor):`
                    ));
                    continue;
                } else if (intent === 'SOLVE') {
                    if (registeredStaff.role !== 'admin' && registeredStaff.permissions?.can_manage_issues === false) {
                        await reply(`❌ *Akses Dibatasi (Barrier Aktif)* ❌\n\nIzin menyelesaikan isu untuk akun Anda telah dinonaktifkan oleh Administrator di Web Dashboard.`);
                        continue;
                    }
                    await reply(getMsg(
                        'Great! Please provide the Issue ID you want to resolve (e.g., Sec-190826-1 or 190826-4):',
                        'Bagus! Harap masukkan ID Masalah yang ingin Anda selesaikan (contoh: Sec-190826-1 atau 190826-4):'
                    ));
                    userStates.set(stateKey, { step: STEPS.AWAITING_SOLVE_ID, data: {}, lang: state.lang });
                    continue;
                } else if (intent === 'PENDING') {
                    if (registeredStaff.role !== 'admin' && registeredStaff.permissions?.can_manage_issues === false) {
                        await reply(`❌ *Akses Dibatasi (Barrier Aktif)* ❌\n\nIzin menunda/mengubah status isu untuk akun Anda telah dinonaktifkan oleh Administrator di Web Dashboard.`);
                        continue;
                    }
                    await reply(getMsg(
                        'You want to mark a job as Pending. Please provide the Issue ID (e.g., Sec-190826-1 or 190826-4):',
                        'Anda ingin menandai pekerjaan sebagai Tertunda. Harap masukkan ID Masalah (contoh: Sec-190826-1 atau 190826-4):'
                    ));
                    userStates.set(stateKey, { step: STEPS.AWAITING_PENDING_ID, data: {}, lang: state.lang });
                    continue;
                } else if (intent === 'STATUS') {
                    const isAdminUser = registeredStaff.role === 'admin';
                    const userDept = registeredStaff.department;

                    // If Department User (Non-Admin): lock department to their own and prompt for status filter!
                    if (!isAdminUser && userDept) {
                        state.data.department = userDept;
                        state.step = STEPS.STATUS_AWAITING_STATUS;
                        userStates.set(stateKey, state);

                        await reply(getMsg(
                            `📋 *Issue Status Filter — Dept ${userDept}* 📋\n\nWhat status do you want to see?\n1. 🔴 Open (Unclaimed)\n2. 🟡 In Progress\n3. ⏸️ Pending (Delayed)\n4. 🌐 All Active Statuses\n\nReply with a number (1-4) or "all":`,
                            `📋 *Filter Status Masalah — Dept ${userDept}* 📋\n\nStatus masalah apa yang ingin Anda lihat?\n1. 🔴 Open (Belum diklaim)\n2. 🟡 In Progress (Sedang dikerjakan)\n3. ⏸️ Pending (Tertunda)\n4. 🌐 All (Semua status aktif)\n\nBalas dengan nomor (1-4) atau ketik "all":`
                        ));
                        continue;
                    }

                    // Admin user: can pick department or 'all'
                    let deptMsg = getMsg(
                        '👑 *Admin Status Overview*\nPlease reply with the number of the department to check, or type "all":\n',
                        '👑 *Ringkasan Status Admin*\nHarap balas dengan nomor departemen yang ingin dicek, atau ketik "all":\n'
                    );
                    DEPARTMENTS.forEach((d, idx) => {
                        deptMsg += `${idx + 1}. ${d}\n`;
                    });
                    await reply(deptMsg.trim());
                    userStates.set(stateKey, { step: STEPS.STATUS_AWAITING_DEPT, data: {}, lang: state.lang });
                    continue;
                }

                // If UNKNOWN, silently ignore so it doesn't disturb normal chats
                continue;
            }

            if (state.step === STEPS.AWAITING_MENU_LANG) {
                const choice = lowerText.trim();
                if (choice === '1' || choice === 'en' || choice === 'menu en' || choice === '!menu en' || choice === 'english') {
                    state.lang = 'en';
                    userStates.delete(stateKey);
                    await reply(MENU_TEXT_EN);
                } else if (choice === '2' || choice === 'id' || choice === 'menu id' || choice === '!menu id' || choice === 'indonesia' || choice === 'bahasa') {
                    state.lang = 'id';
                    userStates.delete(stateKey);
                    await reply(MENU_TEXT_ID);
                } else {
                    await reply(`Silakan balas *1* (English) atau *2* (Bahasa Indonesia), atau ketik *cancel* untuk keluar.`);
                }
                continue;
            }

            if (state.step === STEPS.SOS_AWAITING_NAME) {
                state.data.reporter = text + " (via WhatsApp)";
                await reply(getMsg(
                    `Stay calm, ${text}. What is the emergency situation? (e.g., Fire in kitchen, Guest medical emergency)`,
                    `Tetap tenang, ${text}. Apa situasi daruratnya? (contoh: Kebakaran di dapur, Tamu butuh bantuan medis)`
                ));
                state.step = STEPS.SOS_AWAITING_TITLE;
                userStates.set(stateKey, state);
                continue;
            }

            if (state.step === STEPS.SOS_AWAITING_TITLE) {
                state.data.title = text;
                await reply(getMsg(
                    'Where are you located right now? Reply with number(s) (can select multiple with spaces, e.g. "1 2" for TPI & TBR), or type your location:\n' +
                    '1. TPI\n2. TBR\n3. Kantor\n4. Other (type location)',
                    'Di mana lokasi Anda saat ini? Balas dengan nomor (bisa pilih lebih dari 1 dengan spasi, contoh: "1 2" untuk TPI & TBR), atau ketik lokasi Anda:\n' +
                    '1. TPI\n2. TBR\n3. Kantor\n4. Lainnya (ketik lokasi)'
                ));
                state.step = STEPS.SOS_AWAITING_LOC;
                continue;
            }

            if (state.step === STEPS.SOS_AWAITING_LOC) {
                const LOCATION_QUICK = { '1': 'TPI', '2': 'TBR', '3': 'Kantor' };
                const parts = text.split(/[\s,]+/).filter(Boolean);
                const matchedLocs = [];
                let hasOther = false;

                for (const p of parts) {
                    if (LOCATION_QUICK[p]) {
                        if (!matchedLocs.includes(LOCATION_QUICK[p])) {
                            matchedLocs.push(LOCATION_QUICK[p]);
                        }
                    } else if (p === '4') {
                        hasOther = true;
                    }
                }

                if (matchedLocs.length > 0) {
                    state.data.location = matchedLocs.join(', ');
                } else if (hasOther || text === '4') {
                    state.data.location = 'Telunas Resort';
                } else {
                    state.data.location = text;
                }

                await reply(getMsg(
                    'Any more specific details or description of the problem? (Type details, or reply *skip* / *no* to proceed to photo):',
                    'Ada rincian atau deskripsi masalah yang lebih spesifik? (Ketik rincian, atau balas *skip* / *tidak* untuk lanjut ke foto):'
                ));
                state.step = STEPS.SOS_AWAITING_DESC;
                userStates.set(stateKey, state);
                continue;
            }

            if (state.step === STEPS.SOS_AWAITING_DESC) {
                // If user sends an image directly at this step, capture and submit immediately!
                if (msg.message?.imageMessage) {
                    let photoBuffer = null;
                    try {
                        photoBuffer = await downloadMediaMessage(
                            msg,
                            'buffer',
                            { },
                            { 
                                logger: pino({ level: 'silent' }),
                                reuploadRequest: sock.updateMediaMessage
                            }
                        );
                    } catch (e) {
                        console.error('Failed to download SOS image:', e.message);
                    }

                    try {
                        await reply(getMsg(
                            '🚨 Photo received! Submitting emergency report immediately... please wait.',
                            '🚨 Foto diterima! Mengirim laporan darurat sekarang... mohon tunggu.'
                        ));

                        const formData = new FormData();
                        formData.append('title', state.data.title);
                        formData.append('description', '[EMERGENCY FAST-TRACK]');
                        formData.append('location', state.data.location);
                        formData.append('category', 'emergency');
                        formData.append('department', 'Emergency');
                        formData.append('taggedDepartments', 'ALL');
                        formData.append('reporter', state.data.reporter);
                        formData.append('priority', 'critical');
                        formData.append('deadline', Date.now().toString());
                        if (photoBuffer) {
                            formData.append('image', photoBuffer, { filename: 'sos.jpg', contentType: 'image/jpeg' });
                        }

                        const res = await axios.post(`${BASE_URL}/api/issues`, formData, {
                            headers: formData.getHeaders()
                        });

                        if (res.data.success) {
                            await reply(getMsg(
                                '✅ Emergency reported successfully with photo! The team has been alerted.',
                                '✅ Laporan darurat dengan foto berhasil dikirim! Tim telah diberitahu.'
                            ));
                        } else {
                            await reply(getMsg(
                                '❌ Failed to report emergency. Please try again or seek help directly.',
                                '❌ Gagal melaporkan darurat. Silakan coba lagi atau minta bantuan langsung.'
                            ));
                        }
                    } catch (err) {
                        console.error("API Error:", err.response ? err.response.data : err.message);
                        const errorMessage = err.response?.data?.message || err.message;
                        await reply(`❌ Display Error: ${errorMessage}`);
                    }

                    userStates.delete(stateKey);
                    continue;
                }

                let description = '[EMERGENCY FAST-TRACK]';
                const lower = text.toLowerCase();
                if (lower !== 'skip' && lower !== 'no' && lower !== 'tidak' && text.trim() !== '') {
                    description = `${text.trim()} [EMERGENCY FAST-TRACK]`;
                }
                state.data.description = description;

                await reply(getMsg(
                    '📸 Almost done! Do you have a photo of the emergency? (Send an image, or reply with "no" / "skip" to submit without photo):',
                    '📸 Hampir selesai! Apakah ada foto bukti darurat? (Kirim gambar di sini, atau balas "no" / "skip" / "tidak" untuk kirim tanpa foto):'
                ));
                state.step = STEPS.SOS_AWAITING_PHOTO;
                userStates.set(stateKey, state);
                continue;
            }

            if (state.step === STEPS.SOS_AWAITING_PHOTO) {
                let buffer = null;

                if (msg.message?.imageMessage) {
                    try {
                        buffer = await downloadMediaMessage(
                            msg,
                            'buffer',
                            { },
                            { 
                                logger: pino({ level: 'silent' }),
                                reuploadRequest: sock.updateMediaMessage
                            }
                        );
                    } catch (e) {
                        console.error('Failed to download SOS image:', e.message);
                    }
                }

                    try {
                        await reply(getMsg(
                            '🚨 Submitting emergency report immediately... please wait.',
                            '🚨 Mengirim laporan darurat sekarang... mohon tunggu.'
                        ));

                        const formData = new FormData();
                        formData.append('title', state.data.title);
                        formData.append('description', state.data.description);
                        formData.append('location', state.data.location);
                        formData.append('category', 'emergency');
                        formData.append('department', 'Emergency');
                        formData.append('assignedDepartments', 'ALL');
                        formData.append('taggedDepartments', 'ALL');
                        formData.append('reporter', state.data.reporter);
                        formData.append('priority', 'critical');
                        formData.append('deadline', Date.now().toString());
                        if (buffer) {
                            formData.append('image', buffer, { filename: 'sos.jpg', contentType: 'image/jpeg' });
                        }

                        const res = await axios.post(`${BASE_URL}/api/issues`, formData, {
                            headers: formData.getHeaders()
                        });

                        if (res.data.success) {
                            await reply(getMsg(
                                buffer ? '✅ Emergency reported successfully with photo! The team has been alerted.' : '✅ Emergency reported successfully! The team has been alerted.',
                                buffer ? '✅ Laporan darurat dengan foto berhasil dikirim! Tim telah diberitahu.' : '✅ Laporan darurat berhasil dikirim! Tim telah diberitahu.'
                            ));
                        } else {
                            await reply(getMsg(
                                '❌ Failed to report emergency. Please try again or seek help directly.',
                                '❌ Gagal melaporkan darurat. Silakan coba lagi atau minta bantuan langsung.'
                            ));
                        }
                    } catch (err) {
                        console.error("API Error:", err.response ? err.response.data : err.message);
                        const errorMessage = err.response?.data?.message || err.message;
                        await reply(`❌ Display Error: ${errorMessage}`);
                    }
                    
                    userStates.delete(stateKey);
                    continue;
                }

                // --- NORMAL ISSUE REPORTING FLOW ---
                if (state.step === STEPS.AWAITING_NAME) {
                    state.data.reporter = text + " (via WhatsApp)";
                    await reply(getMsg(
                        `Thanks, ${text}. What is the title of the issue? (e.g., Broken lab door handle)`,
                        `Terima kasih, ${text}. Apa judul masalahnya? (contoh: Gagang pintu rusak)`
                    ));
                    state.step = STEPS.AWAITING_TITLE;
                    continue;
                }

                if (state.step === STEPS.AWAITING_TITLE) {
                    state.data.title = text;
                    await reply(getMsg(
                        'Got it. Please describe the problem in a few words.',
                        'Paham. Harap jelaskan masalahnya secara singkat.'
                    ));
                    state.step = STEPS.AWAITING_DESC;
                    continue;
                }

                if (state.step === STEPS.AWAITING_DESC) {
                    state.data.description = text;
                    await reply(getMsg(
                        'Where is this located? Reply with number(s) (can select multiple with spaces, e.g. "1 2" for TPI & TBR), or just type your location:\n' +
                        '1. TPI\n2. TBR\n3. Kantor\n4. Other (type location)',
                        'Di mana lokasinya? Balas dengan nomor pilihan (bisa pilih lebih dari 1 dengan spasi, contoh: "1 2" untuk TPI & TBR), atau ketik lokasi Anda:\n' +
                        '1. TPI\n2. TBR\n3. Kantor\n4. Lainnya (ketik lokasi)'
                    ));
                    state.step = STEPS.AWAITING_LOC;
                    continue;
                }

                if (state.step === STEPS.AWAITING_LOC) {
                    const LOCATION_QUICK = { '1': 'TPI', '2': 'TBR', '3': 'Kantor' };
                    const parts = text.split(/[\s,]+/).filter(Boolean);
                    const matchedLocs = [];
                    let hasOther = false;

                    for (const p of parts) {
                        if (LOCATION_QUICK[p]) {
                            if (!matchedLocs.includes(LOCATION_QUICK[p])) {
                                matchedLocs.push(LOCATION_QUICK[p]);
                            }
                        } else if (p === '4') {
                            hasOther = true;
                        }
                    }

                    if (matchedLocs.length > 0) {
                        const locStr = matchedLocs.join(', ');
                        state.data.location = locStr;
                        await reply(getMsg(
                            `📍 Location set to *${locStr}*. Any more specific area within ${locStr}? (e.g. "Room 12") — or type *skip* to continue.`,
                            `📍 Lokasi diatur ke *${locStr}*. Ada area lebih spesifik di ${locStr}? (contoh: "Kamar 12") — atau ketik *skip* untuk lanjut.`
                        ));
                        state.step = STEPS.AWAITING_LOC_DETAIL;
                        continue;
                    } else if (hasOther || text === '4') {
                        await reply(getMsg('Please type the location:', 'Harap ketik lokasinya:'));
                        state.step = STEPS.AWAITING_LOC_DETAIL;
                        state.data.location = '';
                        continue;
                    } else {
                        state.data.location = text;
                    }

                    let assignMenu = getMsg(
                        '🎯 Which department(s) are RESPONSIBLE for fixing this? You can select multiple by separating with spaces (e.g. "1" or "1 5"):\n\n',
                        '🎯 Departemen mana saja yang BERTANGGUNG JAWAB memperbaiki ini? Bisa pilih beberapa dengan spasi (contoh: "1" atau "1 5"):\n\n'
                    );
                    DEPARTMENTS.forEach((dept, index) => {
                        assignMenu += `${index + 1}. ${dept}\n`;
                    });

                    await reply(assignMenu.trim());
                    state.step = STEPS.AWAITING_ASSIGNED_DEPTS;
                    continue;
                }

                if (state.step === STEPS.AWAITING_LOC_DETAIL) {
                    if (text.toLowerCase() !== 'skip' && text !== '') {
                        state.data.location = state.data.location
                            ? `${state.data.location} - ${text}`
                            : text;
                    }

                    let assignMenu = getMsg(
                        '🎯 Which department(s) are RESPONSIBLE for fixing this? You can select multiple by separating with spaces (e.g. "1" or "1 5"):\n\n',
                        '🎯 Departemen mana saja yang BERTANGGUNG JAWAB memperbaiki ini? Bisa pilih beberapa dengan spasi (contoh: "1" atau "1 5"):\n\n'
                    );
                    DEPARTMENTS.forEach((dept, index) => {
                        assignMenu += `${index + 1}. ${dept}\n`;
                    });

                    await reply(assignMenu.trim());
                    state.step = STEPS.AWAITING_ASSIGNED_DEPTS;
                    continue;
                }

            if (state.step === STEPS.AWAITING_ASSIGNED_DEPTS) {
                const parts = text.split(/\s+/);
                const selectedAssigns = [];
                for (const part of parts) {
                    const idx = parseInt(part) - 1;
                    if (!isNaN(idx) && idx >= 0 && idx < DEPARTMENTS.length) {
                        selectedAssigns.push(DEPARTMENTS[idx]);
                    }
                }
                
                if (selectedAssigns.length === 0) {
                    await reply(getMsg(
                        'Invalid selection. Please reply with at least one valid department number (e.g. "1" or "1 5").',
                        'Pilihan tidak valid. Harap balas dengan setidaknya satu nomor departemen yang valid (contoh: "1" atau "1 5").'
                    ));
                    continue;
                }
                
                state.data.assignedDepartments = selectedAssigns.join(', ');
                
                // Filter out already assigned departments so they do NOT appear in the Tag/Info list
                const assignedSet = new Set(selectedAssigns.map(d => d.toLowerCase()));
                const availableTagDepts = DEPARTMENTS.filter(dept => !assignedSet.has(dept.toLowerCase()));
                state.data.availableTagDepts = availableTagDepts;

                if (availableTagDepts.length === 0) {
                    state.data.taggedDepartments = '';
                    let categoryMenu = getMsg(
                        'All departments are assigned! Now, please select a category by replying with the number:\n\n',
                        'Semua departemen telah ditugaskan! Sekarang, pilih kategori dengan membalas nomornya:\n\n'
                    );
                    for (const [key, val] of Object.entries(CORE_DISPLAY)) {
                        categoryMenu += `${key}. ${val}\n`;
                    }
                    await reply(categoryMenu.trim());
                    state.step = STEPS.AWAITING_CAT;
                    continue;
                }

                let tagMenu = getMsg(
                    '📢 Tag other departments for INFORMATION / NOTIFICATION only? Select numbers (e.g. "1 3") or reply with "0" to skip:\n\n',
                    '📢 Tandai departemen lain HANYA UNTUK INFO / NOTIFIKASI? Pilih nomor (contoh: "1 3") atau balas "0" untuk lewati:\n\n'
                );
                tagMenu += getMsg('0. (Skip / None)\n', '0. (Lewati / Tidak ada)\n');
                availableTagDepts.forEach((dept, index) => {
                    tagMenu += `${index + 1}. ${dept}\n`;
                });
                
                await reply(tagMenu.trim());
                state.step = STEPS.AWAITING_TAG_DEPT;
                continue;
            }
            
            if (state.step === STEPS.AWAITING_TAG_DEPT) {
                const assignedList = (state.data.assignedDepartments || '').split(',').map(s => s.trim().toLowerCase());
                const availableTagDepts = state.data.availableTagDepts || DEPARTMENTS.filter(d => !assignedList.includes(d.toLowerCase()));

                const trimmed = text.trim().toLowerCase();
                if (trimmed === '0' || trimmed === 'skip' || trimmed === 'none' || trimmed === 'tidak' || trimmed === 'pass') {
                    state.data.taggedDepartments = '';
                } else {
                    const parts = text.split(/\s+/);
                    const selectedTags = [];
                    for (const part of parts) {
                        const idx = parseInt(part) - 1;
                        if (!isNaN(idx) && idx >= 0 && idx < availableTagDepts.length) {
                            selectedTags.push(availableTagDepts[idx]);
                        }
                    }
                    state.data.taggedDepartments = selectedTags.join(', ');
                }
                
                let categoryMenu = getMsg(
                    'Almost done! Please select a category by replying with the number:\n\n',
                    'Hampir selesai! Pilih kategori dengan membalas nomornya:\n\n'
                );
                for (const [key, val] of Object.entries(CORE_DISPLAY)) {
                    categoryMenu += `${key}. ${val}\n`;
                }
                
                await reply(categoryMenu.trim());
                state.step = STEPS.AWAITING_CAT;
                continue;
            }

            if (state.step === STEPS.AWAITING_CAT) {
                if (!CORE_DISPLAY[text]) {
                    await reply(getMsg(
                        'Invalid selection. Please reply with a valid number (1-10).',
                        'Pilihan tidak valid. Harap balas dengan nomor valid (1-10).'
                    ));
                    continue;
                }
                
                state.data.category = text === '10' ? 'other' : CORE_DISPLAY[text].toLowerCase();
                await reply(getMsg(
                    'Got it. What is the priority of this issue? Reply with the number:\n1. Priority (Standard)\n2. High Priority\n3. 🚨 Critical',
                    'Paham. Apa prioritas masalah ini? Balas dengan nomor:\n1. Prioritas (Standar)\n2. Prioritas Tinggi\n3. 🚨 Kritis'
                ));
                state.step = STEPS.AWAITING_PRIORITY;
                continue;
            }

            if (state.step === STEPS.AWAITING_PRIORITY) {
                const priorityMap = {
                    '1': 'low',
                    '2': 'high',
                    '3': 'critical',
                    '4': 'critical',
                };
                const lowerText = text.toLowerCase().trim();
                let selectedPriority = priorityMap[text];
                if (!selectedPriority) {
                    if (lowerText.includes('kritis') || lowerText.includes('critical')) selectedPriority = 'critical';
                    else if (lowerText.includes('tinggi') || lowerText.includes('high')) selectedPriority = 'high';
                    else if (lowerText.includes('standar') || lowerText.includes('prioritas') || lowerText.includes('priority') || lowerText.includes('rendah') || lowerText.includes('low')) selectedPriority = 'low';
                }

                if (!selectedPriority) {
                    await reply(getMsg(
                        'Invalid selection. Please reply with a valid number (1-3):\n1. Priority\n2. High Priority\n3. 🚨 Critical',
                        'Pilihan tidak valid. Harap balas dengan nomor (1-3):\n1. Prioritas (Standar)\n2. Prioritas Tinggi\n3. 🚨 Kritis'
                    ));
                    continue;
                }
                
                state.data.priority = selectedPriority;
                if (state.data.priority === 'critical') {
                    await reply(getMsg(
                        '🚨 *Critical Priority selected.* What is the time limit? (Max 24 Hours)\n\nReply with a number or type directly (e.g. 4h, 30m, 16:30):\n1. 15 Minutes\n2. 30 Minutes\n3. 1 Hour\n4. 2 Hours\n5. 4 Hours\n6. 8 Hours\n7. 12 Hours\n8. 24 Hours (Max)',
                        '🚨 *Prioritas Kritis dipilih.* Berapa batas waktu penanganan? (Maksimal 24 Jam)\n\nBalas dengan nomor preset atau ketik langsung (contoh: 4h, 30m, 16:30):\n1. 15 Menit\n2. 30 Menit\n3. 1 Jam\n4. 2 Jam\n5. 4 Jam\n6. 8 Jam\n7. 12 Jam\n8. 24 Jam (Maksimal)'
                    ));
                    state.step = STEPS.AWAITING_CRITICAL_TIME;
                } else {
                    await reply(getMsg(
                        'Great. Finally, please upload a photo of the problem as proof. (Send an image here)',
                        'Bagus. Terakhir, harap unggah foto bukti masalah. (Kirim gambar di sini)'
                    ));
                    state.step = STEPS.AWAITING_PHOTO;
                }
                continue;
            }

            if (state.step === STEPS.AWAITING_CRITICAL_TIME) {
                const presetMap = {
                    '1': 15,
                    '2': 30,
                    '3': 60,
                    '4': 120,
                    '5': 240,
                    '6': 480,
                    '7': 720,
                    '8': 1440,
                };

                let targetDeadlineMs = null;
                const cleanInput = text.trim().toLowerCase();

                // 1. Check numeric preset (1-8)
                if (presetMap[cleanInput] !== undefined) {
                    targetDeadlineMs = Date.now() + presetMap[cleanInput] * 60000;
                }
                // 2. Check duration format like '4h', '4 jam', '4 hours', '30m', '30 menit', '90 mins'
                else if (/^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|jam)$/i.test(cleanInput)) {
                    const match = cleanInput.match(/^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|jam)$/i);
                    const hours = parseFloat(match[1]);
                    targetDeadlineMs = Date.now() + Math.round(hours * 60) * 60000;
                } else if (/^(\d+)\s*(m|min|mins|menit|mnt)$/i.test(cleanInput)) {
                    const match = cleanInput.match(/^(\d+)\s*(m|min|mins|menit|mnt)$/i);
                    const mins = parseInt(match[1], 10);
                    targetDeadlineMs = Date.now() + mins * 60000;
                }
                // 3. Check clock time format like '16:30', '4:30 pm', '09.15'
                else if (/^(\d{1,2})[:.](\d{2})(?:\s*(am|pm))?$/i.test(cleanInput)) {
                    const match = cleanInput.match(/^(\d{1,2})[:.](\d{2})(?:\s*(am|pm))?$/i);
                    let h = parseInt(match[1], 10);
                    const m = parseInt(match[2], 10);
                    const meridiem = (match[3] || '').toLowerCase();

                    if (meridiem === 'pm' && h < 12) h += 12;
                    if (meridiem === 'am' && h === 12) h = 0;

                    const target = new Date();
                    target.setHours(h, m, 0, 0);
                    if (target.getTime() <= Date.now() + 60000) {
                        target.setDate(target.getDate() + 1);
                    }
                    targetDeadlineMs = target.getTime();
                }

                if (!targetDeadlineMs) {
                    await reply(getMsg(
                        'Invalid time format. Please reply with a number (1-8) or type a duration (e.g. 4h, 30m, 16:30):',
                        'Format waktu tidak valid. Harap balas dengan nomor (1-8) atau ketik durasi (contoh: 4h, 30m, 16:30):'
                    ));
                    continue;
                }

                // Strict Cap: Max 24 hours
                const maxDeadlineMs = Date.now() + 24 * 60 * 60 * 1000;
                if (targetDeadlineMs > maxDeadlineMs) {
                    targetDeadlineMs = maxDeadlineMs;
                }

                state.data.deadline = targetDeadlineMs.toString();

                const diffMins = Math.max(1, Math.round((targetDeadlineMs - Date.now()) / 60000));
                const diffHours = Math.floor(diffMins / 60);
                const remMins = diffMins % 60;
                const timeStr = diffHours > 0 
                    ? (remMins > 0 ? `${diffHours}h ${remMins}m` : `${diffHours} hour${diffHours > 1 ? 's' : ''}`)
                    : `${remMins}m`;
                const targetTimeClock = new Date(targetDeadlineMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                await reply(getMsg(
                    `✅ Time limit set: *${timeStr} from now* (${targetTimeClock}).\n\nFinally, please upload a photo of the problem as proof. (Send an image here)`,
                    `✅ Batas waktu diatur: *${diffHours > 0 ? (remMins > 0 ? `${diffHours} jam ${remMins} mnt` : `${diffHours} jam`) : `${remMins} mnt`} lagi* (${targetTimeClock}).\n\nTerakhir, harap unggah foto bukti masalah. (Kirim gambar di sini)`
                ));
                state.step = STEPS.AWAITING_PHOTO;
                continue;
            }

            if (state.step === STEPS.AWAITING_PHOTO) {
                if (!msg.message?.imageMessage) {
                    await reply('Please send a valid photo. Or type "cancel" to restart.');
                    continue;
                }

                try {
                    await reply('Uploading issue to Telunas Resort... Please wait.');

                    const buffer = await downloadMediaMessage(
                        msg,
                        'buffer',
                        { },
                        { 
                            logger: pino({ level: 'silent' }),
                            reuploadRequest: sock.updateMediaMessage
                        }
                    );

                    const formData = new FormData();
                    formData.append('title', state.data.title);
                    formData.append('description', state.data.description);
                    formData.append('location', state.data.location);
                    formData.append('category', state.data.category);
                    formData.append('department', state.data.department);
                    if (state.data.assignedDepartments) formData.append('assignedDepartments', state.data.assignedDepartments);
                    if (state.data.taggedDepartments) formData.append('taggedDepartments', state.data.taggedDepartments);
                    formData.append('reporter', state.data.reporter);
                    if (state.data.priority) formData.append('priority', state.data.priority);
                    if (state.data.deadline) formData.append('deadline', state.data.deadline);
                    formData.append('image', buffer, { filename: 'upload.jpg', contentType: 'image/jpeg' });

                    const res = await axios.post(`${BASE_URL}/api/issues`, formData, {
                        headers: formData.getHeaders()
                    });

                    if (res.data.success) {
                        const issueData = res.data.data || {};
                        const issueId = issueData.id || '';
                        const idStr = issueId ? `\n🆔 *Issue ID:* ${issueId}` : '';
                        await reply(
                            `✅ *Issue Reported Successfully!*${idStr}\n\n` +
                            `📋 *Title:* ${state.data.title}\n` +
                            `📍 *Location:* ${state.data.location}\n` +
                            `🏷️ *Category:* ${state.data.category}\n` +
                            `🏠 *Origin:* ${state.data.department}\n` +
                            `🎯 *Assigned:* ${state.data.assignedDepartments || 'None'}\n` +
                            `📢 *Tagged (Info):* ${state.data.taggedDepartments || 'None'}\n\n` +
                            `Thank you! You can track this issue on the dashboard.`
                        );
                    } else {
                        await reply('❌ Failed to report issue. Please try again later.');
                    }
                } catch (err) {
                    console.error("API Error:", err.response ? err.response.data : err.message);
                    const errorMessage = err.response?.data?.message || err.message;
                    await reply(`❌ Display Error: ${errorMessage}`);
                }
                
                userStates.delete(stateKey);
                continue;
            }

            // --- SOLVING FLOW ---
            if (state.step === STEPS.AWAITING_SOLVE_ID) {
                let queryId = text.trim();
                
                try {
                    let issue = null;
                    const getRes = await axios.get(`${BASE_URL}/api/issues`);
                    if (getRes.data && getRes.data.success) {
                        issue = getRes.data.data.find(i => i.id === queryId);
                    }

                    if (!issue) {
                        const lookup = await getIssueDetails(queryId);
                        if (lookup?.isArchived) {
                            await reply(getArchivedMessage(lookup, state.lang));
                            userStates.delete(stateKey);
                            continue;
                        }
                        if (lookup) {
                            issue = lookup;
                        } else {
                            await reply(`❌ Could not find issue *${queryId}* in the database. Please check the ID and try again, or type "cancel" to exit.`);
                            continue;
                        }
                    }

                    if (issue.isArchived) {
                        await reply(getArchivedMessage(issue, state.lang));
                        userStates.delete(stateKey);
                        continue;
                    }
                        if (issue.status === 'solved') {
                            await reply(`✅ Issue *${queryId}* has already been marked as *Solved*. No further action needed. Type "cancel" to exit.`);
                            continue;
                        }
                        if (issue.status === 'open') {
                            // Out-of-order: issue hasn't been claimed yet
                            await reply(
                                `⚠️ Issue *${queryId}* has not been claimed yet — it is currently *Open (unclaimed)*. ` +
                                `The normal flow is: claim first → then solve.\n\n` +
                                `Do you want to *claim this job and immediately resolve it* in one step?\n\n` +
                                `Reply *yes* to claim + solve now, or *no* to cancel.`
                            );
                            state.data.issueId = queryId;
                            state.data.issueRowIndex = issue.rowIndex;
                            state.step = STEPS.CONFIRM_CLAIM_THEN_SOLVE;
                            userStates.set(stateKey, state);
                            continue;
                        }
                        // status is 'progress' or 'pending' — allowed to proceed

                        // Roster prompt if in a group that matches an authorized dept
                        const solveGroupDeptKey = getDeptKeyForGroup(from);
                        const solveAssigned = (Array.isArray(issue.assignedDepartments) ? issue.assignedDepartments : (issue.assignedDepartments || '').split(',').map(d => d.trim())).filter(Boolean);
                        const solveTagged   = (Array.isArray(issue.taggedDepartments) ? issue.taggedDepartments : (issue.taggedDepartments || '').split(',').map(d => d.trim())).filter(Boolean);
                        const solveAuthKeys = [...solveAssigned, ...solveTagged].map(d => d.toLowerCase());
                        const isSolveGroupAuth = !solveGroupDeptKey || solveAssigned.includes('ALL') || solveAuthKeys.includes(solveGroupDeptKey);

                        if (solveGroupDeptKey && isSolveGroupAuth) {
                            const solveRoster = DEPARTMENT_STAFF[solveGroupDeptKey] || [];
                            if (solveRoster.length > 0) {
                                let rMsg = `🔧 *Resolving Issue ${queryId}*\n\nSelect your name:\n\n`;
                                solveRoster.forEach((n, i) => { rMsg += `${i + 1}. ${n}\n`; });
                                rMsg += `\nExample: *2* or your full name.`;
                                state.data.rosterList = solveRoster;
                                state.data.issueId = queryId;
                                state.step = STEPS.AWAITING_SOLVE_NAME;
                                userStates.set(stateKey, state);
                                await reply(rMsg);
                                continue;
                            }
                        }
                } catch (e) {
                    console.error("Validation error:", e.message);
                }

                state.data.issueId = queryId;
                await reply(getMsg('What is your name? (Solver Name)', 'Siapa nama Anda? (Nama Penyelesai)'));
                state.step = STEPS.AWAITING_SOLVE_NAME;
                userStates.set(stateKey, state);
                continue;
            }


            if (state.step === STEPS.AWAITING_SOLVE_NAME) {
                let solverInput = text.trim();
                // If we have a roster context stored, try to resolve by number
                const solveRoster = state.data.rosterList || [];
                if (solveRoster.length > 0) {
                    const numIdx = parseInt(solverInput, 10);
                    if (!isNaN(numIdx) && numIdx >= 1 && numIdx <= solveRoster.length) {
                        solverInput = solveRoster[numIdx - 1];
                    } else {
                        const matched = solveRoster.find(n => n.toLowerCase().includes(solverInput.toLowerCase()));
                        if (matched) solverInput = matched;
                    }
                }
                state.data.solverName = solverInput + ' (via WhatsApp)';
                await reply('Please provide a brief description of how you fixed it.');
                state.step = STEPS.AWAITING_SOLVE_DESC;
                continue;
            }

            if (state.step === STEPS.AWAITING_SOLVE_DESC) {
                state.data.fixDescription = text;
                await reply('Finally, please upload a photo of the completed work as proof. (Send an image here)');
                state.step = STEPS.AWAITING_SOLVE_PHOTO;
                continue;
            }

            if (state.step === STEPS.AWAITING_SOLVE_PHOTO) {
                if (!msg.message?.imageMessage) {
                    await reply('Please send a valid photo. Or type "cancel" to restart.');
                    continue;
                }

                try {
                    await reply('Resolving issue for Telunas Resort... Please wait.');

                    const buffer = await downloadMediaMessage(
                        msg,
                        'buffer',
                        { },
                        { 
                            logger: pino({ level: 'silent' }),
                            reuploadRequest: sock.updateMediaMessage
                        }
                    );

                    // Fetch issues to find the rowIndex for this ID
                    const getRes = await axios.get(`${BASE_URL}/api/issues`);
                    if (!getRes.data.success) throw new Error("Failed to fetch issues");
                    
                    let issue = getRes.data.data.find(i => i.id === state.data.issueId);
                    if (!issue) {
                        const lookup = await getIssueDetails(state.data.issueId);
                        if (lookup?.isArchived) {
                            await reply(getArchivedMessage(lookup, state.lang));
                            userStates.delete(stateKey);
                            continue;
                        }
                        if (lookup) {
                            issue = lookup;
                        } else {
                            await reply(`❌ Could not find issue ${state.data.issueId} in the database.`);
                            userStates.delete(stateKey);
                            continue;
                        }
                    }
                    if (issue.isArchived) {
                        await reply(getArchivedMessage(issue, state.lang));
                        userStates.delete(stateKey);
                        continue;
                    }

                    const formData = new FormData();
                    formData.append('solver', state.data.solverName);
                    formData.append('fixDescription', state.data.fixDescription);
                    formData.append('proofImage', buffer, { filename: 'proof.jpg', contentType: 'image/jpeg' });

                    const res = await axios.post(`${BASE_URL}/api/issues/${issue.rowIndex}/resolve`, formData, {
                        headers: formData.getHeaders()
                    });

                    if (res.data.success) {
                        await reply('✅ Issue resolved successfully! The dashboard and group have been updated.');
                    } else {
                        await reply('❌ Failed to resolve issue.');
                    }
                } catch (err) {
                    console.error("API Error:", err.response ? err.response.data : err.message);
                    const errorMessage = err.response?.data?.message || err.message;
                    await reply(`❌ API Error: ${errorMessage}`);
                }
                
                userStates.delete(stateKey);
                continue;
            }


            // --- PENDING FLOW ---
            if (state.step === STEPS.AWAITING_PENDING_ID) {
                let queryId = text.trim();

                try {
                    let issue = null;
                    const getRes = await axios.get(`${BASE_URL}/api/issues`);
                    if (getRes.data && getRes.data.success) {
                        issue = getRes.data.data.find(i => i.id === queryId);
                    }

                    if (!issue) {
                        const lookup = await getIssueDetails(queryId);
                        if (lookup?.isArchived) {
                            await reply(getArchivedMessage(lookup, state.lang));
                            userStates.delete(stateKey);
                            continue;
                        }
                        if (lookup) {
                            issue = lookup;
                        } else {
                            await reply(`❌ Could not find issue *${queryId}* in the database. Please check the ID and try again, or type "cancel" to exit.`);
                            continue;
                        }
                    }

                    if (issue.isArchived) {
                        await reply(getArchivedMessage(issue, state.lang));
                        userStates.delete(stateKey);
                        continue;
                    }
                        if (issue.status === 'solved') {
                            await reply(`✅ Issue *${queryId}* is already *Solved* — no pending needed. Type "cancel" to exit.`);
                            continue;
                        }
                        if (issue.status === 'open') {
                            await reply(
                                `⚠️ Issue *${queryId}* has not been claimed yet — it is currently *Open (unclaimed)*.

To mark a job as pending, someone must first claim it.

Do you want to *claim this job AND immediately mark it as pending*?

Reply *yes* to claim + pending, or *no* to cancel.`
                            );
                            state.data.issueId = queryId;
                            state.data.issueRowIndex = issue.rowIndex;
                            state.step = STEPS.CONFIRM_CLAIM_THEN_PENDING;
                            userStates.set(stateKey, state);
                            continue;
                        }
                        if (issue.status !== 'progress') {
                            await reply(`❌ Issue *${queryId}* is currently *${issue.status}* — only In Progress issues can be marked pending.`);
                            continue;
                        }
                        // status === 'progress' — allowed
                        const pendGroupDeptKey = getDeptKeyForGroup(from);
                        const pendAssigned = (Array.isArray(issue.assignedDepartments) ? issue.assignedDepartments : (issue.assignedDepartments || '').split(',').map(d => d.trim())).filter(Boolean);
                        const pendTagged   = (Array.isArray(issue.taggedDepartments) ? issue.taggedDepartments : (issue.taggedDepartments || '').split(',').map(d => d.trim())).filter(Boolean);
                        const pendAuthKeys = [...pendAssigned, ...pendTagged].map(d => d.toLowerCase());
                        const isPendGroupAuth = !pendGroupDeptKey || pendAssigned.includes('ALL') || pendAuthKeys.includes(pendGroupDeptKey);
                        if (pendGroupDeptKey && isPendGroupAuth) {
                            const pendRoster = DEPARTMENT_STAFF[pendGroupDeptKey] || [];
                            if (pendRoster.length > 0) {
                                let rMsg = `⏸️ *Marking Issue ${queryId} as Pending*

Select your name:

`;
                                pendRoster.forEach((n, i) => { rMsg += `${i + 1}. ${n}
`; });
                                rMsg += `
Example: *2* or your full name.`;
                                state.data.rosterList = pendRoster;
                                state.data.issueId = queryId;
                                state.step = STEPS.AWAITING_PENDING_NAME;
                                userStates.set(stateKey, state);
                                await reply(rMsg);
                                continue;
                            }
                        }
                } catch (e) {
                    console.error('Validation error:', e.message);
                }
                state.data.issueId = queryId;
                await reply(getMsg('What is your name? (Worker Name)', 'Siapa nama Anda? (Nama Pekerja)'));
                state.step = STEPS.AWAITING_PENDING_NAME;
                userStates.set(stateKey, state);
                continue;
            }
            if (state.step === STEPS.AWAITING_PENDING_NAME) {
                let pendingInput = text.trim();
                const pendRoster = state.data.rosterList || [];
                if (pendRoster.length > 0) {
                    const numIdx = parseInt(pendingInput, 10);
                    if (!isNaN(numIdx) && numIdx >= 1 && numIdx <= pendRoster.length) {
                        pendingInput = pendRoster[numIdx - 1];
                    } else {
                        const matched = pendRoster.find(n => n.toLowerCase().includes(pendingInput.toLowerCase()));
                        if (matched) pendingInput = matched;
                    }
                }
                state.data.pendingBy = pendingInput + ' (via WhatsApp)';
                await reply('What is the reason for the delay?');
                state.step = STEPS.AWAITING_PENDING_REASON;
                continue;
            }
            if (state.step === STEPS.AWAITING_PENDING_REASON) {
                state.data.pendingReason = text;
                await reply('Finally, please upload a photo as proof of the delay. (Send an image here)');
                state.step = STEPS.AWAITING_PENDING_PHOTO;
                continue;
            }
            if (state.step === STEPS.AWAITING_PENDING_PHOTO) {
                if (!msg.message.imageMessage) {
                    await reply('Please send a valid photo. Or type "cancel" to restart.');
                    continue;
                }

                try {
                    await reply('Marking issue as pending... Please wait.');

                    const buffer = await downloadMediaMessage(
                        msg,
                        'buffer',
                        { },
                        { 
                            logger: pino({ level: 'silent' }),
                            reuploadRequest: sock.updateMediaMessage
                        }
                    );

                    const getRes = await axios.get(`${BASE_URL}/api/issues`);
                    if (!getRes.data.success) throw new Error("Failed to fetch issues");
                    
                    let issue = getRes.data.data.find(i => i.id === state.data.issueId);
                    if (!issue) {
                        const lookup = await getIssueDetails(state.data.issueId);
                        if (lookup?.isArchived) {
                            await reply(getArchivedMessage(lookup, state.lang));
                            userStates.delete(stateKey);
                            continue;
                        }
                        if (lookup) {
                            issue = lookup;
                        } else {
                            await reply(`❌ Could not find issue ${state.data.issueId} in the database.`);
                            userStates.delete(stateKey);
                            continue;
                        }
                    }

                    if (issue.isArchived) {
                        await reply(getArchivedMessage(issue, state.lang));
                        userStates.delete(stateKey);
                        continue;
                    }

                    const formData = new FormData();
                    formData.append('pendingBy', state.data.pendingBy);
                    formData.append('pendingReason', state.data.pendingReason);
                    formData.append('pendingImage', buffer, { filename: 'pending.jpg', contentType: 'image/jpeg' });

                    const res = await axios.post(`${BASE_URL}/api/issues/${issue.rowIndex}/pending`, formData, {
                        headers: formData.getHeaders()
                    });

                    if (res.data.success) {
                        await reply('✅ Issue successfully marked as Pending! The dashboard has been updated.');
                    } else {
                        await reply('❌ Failed to mark issue as pending.');
                    }
                } catch (err) {
                    console.error("API Error:", err.response ? err.response.data : err.message);
                    const errorMessage = err.response?.data?.message || err.message;
                    await reply(`❌ API Error: ${errorMessage}`);
                }
                
                userStates.delete(stateKey);
                continue;
            }

            // --- OUT-OF-ORDER CONFIRMATION FLOWS ---

            // CONFIRM: Claim + Pending (user said "pending" but issue is still open)
            if (state.step === STEPS.CONFIRM_CLAIM_THEN_PENDING) {
                const ans = lowerText.trim();
                if (ans === 'yes' || ans === 'ya' || ans === 'y') {
                    await reply(getMsg(
                        'Got it! What is your name? You will be recorded as both the claimer and the person marking it pending.',
                        'Baik! Siapa nama Anda? Anda akan dicatat sebagai peng-klaim dan yang menandai tertunda.'
                    ));
                    state.step = STEPS.CONFIRM_CLAIM_PENDING_NAME;
                    userStates.set(stateKey, state);
                } else {
                    userStates.delete(stateKey);
                    await reply(getMsg(
                        '✅ No problem. The issue remains *Open (unclaimed)*. No changes were made.',
                        '✅ Tidak apa-apa. Masalah tetap *Terbuka (belum diklaim)*. Tidak ada perubahan.'
                    ));
                }
                continue;
            }

            if (state.step === STEPS.CONFIRM_CLAIM_PENDING_NAME) {
                const workerName = text.trim() + ' (via WhatsApp)';
                // Silently auto-claim first
                try {
                    await axios.post(`${BASE_URL}/api/issues/${state.data.issueRowIndex}/claim`, {
                        taker: workerName
                    });
                } catch (e) {
                    console.error('Auto-claim failed:', e.message);
                }
                state.data.pendingBy = workerName;
                await reply(getMsg('What is the reason for the delay?', 'Apa alasan keterlambatannya?'));
                state.step = STEPS.AWAITING_PENDING_REASON;
                userStates.set(stateKey, state);
                continue;
            }

            // CONFIRM: Claim + Solve (user said "solve" but issue is still open)
            if (state.step === STEPS.CONFIRM_CLAIM_THEN_SOLVE) {
                const ans = lowerText.trim();
                if (ans === 'yes' || ans === 'ya' || ans === 'y') {
                    await reply(getMsg(
                        'Got it! What is your name? You will be recorded as both the claimer and the solver.',
                        'Baik! Siapa nama Anda? Anda akan dicatat sebagai peng-klaim dan penyelesai.'
                    ));
                    state.step = STEPS.CONFIRM_CLAIM_SOLVE_NAME;
                    userStates.set(stateKey, state);
                } else {
                    userStates.delete(stateKey);
                    await reply(getMsg(
                        '✅ No problem. The issue remains *Open (unclaimed)*. No changes were made.',
                        '✅ Tidak apa-apa. Masalah tetap *Terbuka (belum diklaim)*. Tidak ada perubahan.'
                    ));
                }
                continue;
            }

            if (state.step === STEPS.CONFIRM_CLAIM_SOLVE_NAME) {
                const workerName = text.trim() + ' (via WhatsApp)';
                state.data.solverName = workerName;
                // Silently auto-claim first
                try {
                    await axios.post(`${BASE_URL}/api/issues/${state.data.issueRowIndex}/claim`, {
                        taker: workerName
                    });
                } catch (e) {
                    console.error('Auto-claim failed:', e.message);
                }
                await reply(getMsg(
                    `✅ Job claimed by *${text.trim()}*! Please describe how you fixed it.`,
                    `✅ Pekerjaan diklaim oleh *${text.trim()}*! Jelaskan cara Anda memperbaikinya.`
                ));
                state.step = STEPS.AWAITING_SOLVE_DESC;
                userStates.set(stateKey, state);
                continue;
            }

            // --- STATUS FLOW ---
            if (state.step === STEPS.STATUS_AWAITING_DEPT) {
                const lowerText = text.toLowerCase().trim();
                if (lowerText === 'all') {
                    state.data.department = 'all';
                } else {
                    const idx = parseInt(lowerText) - 1;
                    if (isNaN(idx) || idx < 0 || idx >= DEPARTMENTS.length) {
                        await reply('Invalid selection. Please reply with a valid number or "all".');
                        continue;
                    }
                    state.data.department = DEPARTMENTS[idx];
                }
                
                await reply("Great. What status do you want to see?\n1. Open\n2. Progress\n3. Pending\n\nReply with a number or 'all':");
                state.step = STEPS.STATUS_AWAITING_STATUS;
                continue;
            }

            if (state.step === STEPS.STATUS_AWAITING_STATUS) {
                const lowerText = text.toLowerCase().trim();
                const statuses = ['open', 'progress', 'pending'];
                if (lowerText === 'all' || lowerText === '4' || lowerText === 'semua') {
                    state.data.status = 'all';
                } else {
                    const idx = parseInt(lowerText) - 1;
                    if (isNaN(idx) || idx < 0 || idx >= statuses.length) {
                        await reply(getMsg(
                            'Invalid selection. Please reply with a valid number (1-4) or "all".',
                            'Pilihan tidak valid. Silakan balas dengan nomor (1-4) atau ketik "all".'
                        ));
                        continue;
                    }
                    state.data.status = statuses[idx];
                }
                
                let catMsg = getMsg("Finally, what category?\n", "Terakhir, kategori apa yang ingin dilihat?\n");
                ALL_CATEGORIES.forEach((c, idx) => {
                    catMsg += `${idx + 1}. ${c.charAt(0).toUpperCase() + c.slice(1)}\n`;
                });
                catMsg += getMsg("\nReply with a number (1-10) or type 'all':", "\nBalas dengan nomor (1-10) atau ketik 'all':");
                await reply(catMsg);
                
                state.step = STEPS.STATUS_AWAITING_CAT;
                userStates.set(stateKey, state);
                continue;
            }

            if (state.step === STEPS.STATUS_AWAITING_CAT) {
                const lowerText = text.toLowerCase();
                if (lowerText === 'all' || lowerText === 'semua') {
                    state.data.category = 'all';
                } else {
                    if (CORE_DISPLAY[text]) {
                        state.data.category = CORE_DISPLAY[text].toLowerCase();
                    } else if (ALL_CATEGORIES.includes(lowerText)) {
                        state.data.category = lowerText;
                    } else {
                        await reply('Invalid selection. Please reply with a number (1-10) or \'all\'.');
                        continue;
                    }
                }
                
                try {
                    await reply('Fetching active issues... Please wait.');
                    const res = await axios.get(`${BASE_URL}/api/issues`);
                    if (res.data && res.data.success) {
                        const issues = res.data.data;
                        
                        const filtered = issues.filter(i => {
                            if (i.status === 'solved') return false; // Never show solved in status
                            
                            const matchDept = state.data.department.toLowerCase() === 'all' || 
                                              (i.department && String(i.department).toLowerCase() === state.data.department.toLowerCase()) ||
                                              (i.taggedDepartments && String(i.taggedDepartments).toLowerCase().includes(state.data.department.toLowerCase()));
                            
                            const matchStatus = state.data.status === 'all' || i.status === state.data.status;
                            const matchCat = state.data.category === 'all' || (i.category && i.category.toLowerCase() === state.data.category.toLowerCase());
                            
                            return matchDept && matchStatus && matchCat;
                        });

                        if (filtered.length === 0) {
                            await reply('No active issues found matching your filters.');
                        } else {
                            // Group by category
                            const grouped = {};
                            filtered.forEach(i => {
                                const cat = i.category || 'other';
                                if (!grouped[cat]) grouped[cat] = [];
                                grouped[cat].push(i);
                            });

                            let msgText = `📋 *Active Issues* (Dept: ${state.data.department} | Status: ${state.data.status} | Cat: ${state.data.category})\n\n`;
                            
                            for (const cat in grouped) {
                                msgText += `*${cat.toUpperCase()}*\n`;
                                grouped[cat].forEach(i => {
                                    const extra = i.status === 'progress' ? ` - Taken by: ${i.taker}` : 
                                                  (i.status === 'pending' ? ` - Pending by: ${i.pendingBy}` : ` - Reporter: ${i.reporter}`);
                                    msgText += `• [${i.status}] ${i.title} (ID: ${i.id})${extra}\n`;
                                });
                                msgText += '\n';
                            }
                            
                            await reply(msgText.trim());
                        }
                    } else {
                        await reply('❌ Failed to fetch issues from the server.');
                    }
                } catch (e) {
                    console.error('Status fetch error:', e);
                    await reply('❌ API Error while fetching issues.');
                }

                userStates.delete(stateKey);
                continue;
            }
        }
    });
}

// --- EXPRESS SERVER FOR NOTIFICATIONS & REAL-TIME SYNC ---
app.post(['/sync-staff', '/api/sync-staff'], async (req, res) => {
    const result = await syncStaffDirectory();
    res.json(result);
});

app.get(['/sync-staff', '/api/sync-staff'], async (req, res) => {
    const result = await syncStaffDirectory();
    res.json(result);
});

app.post(['/notify-direct', '/api/notify-direct'], async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (!globalSock) {
            return res.status(500).json({ error: 'Socket not initialized.' });
        }
        if (!phone || !message) {
            return res.status(400).json({ error: 'Phone and message are required.' });
        }
        let cleanPhone = normalizePhoneNumber(phone);
        const jid = `${cleanPhone}@s.whatsapp.net`;
        await globalSock.sendMessage(jid, { text: message });
        console.log(`[Ticket Notification] Sent private WhatsApp message to +${cleanPhone}`);
        res.json({ success: true });
    } catch (err) {
        console.error('Failed sending direct notification:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/notify', async (req, res) => {
    try {
        const { message, imageUrl, taggedDepartments, assignedDepartments, department, priority } = req.body;
        
        if (!globalSock) {
            return res.status(500).json({ error: 'Socket not initialized.' });
        }

        // Collect all target group JIDs
        const targetGroupIds = new Set();

        // 1. Always send to General announcement group if configured
        if (botConfig.generalGroupId) {
            targetGroupIds.add(botConfig.generalGroupId);
        } else if (linkedGroupId) {
            targetGroupIds.add(linkedGroupId);
        }

        // 2. Check if Emergency / @ALL
        const lowerMsg = (message || '').toLowerCase();
        const isAll = lowerMsg.includes('@all') || 
                      (taggedDepartments && String(taggedDepartments).toLowerCase().includes('all')) || 
                      (assignedDepartments && String(assignedDepartments).toLowerCase().includes('all')) || 
                      lowerMsg.includes('priority: critical') ||
                      priority === 'critical';

        if (isAll) {
            // Broadcast to ALL connected department groups
            Object.values(botConfig.departmentGroups).forEach(gid => {
                if (gid) targetGroupIds.add(gid);
            });
        } else {
            // Helper to safely match department or sub-department name to group
            const addDeptToTargets = (deptName) => {
                if (!deptName) return;
                const rawKey = String(deptName).toLowerCase().trim();
                const mainKey = SUBDEPARTMENT_TO_MAIN[rawKey] || rawKey;
                if (botConfig.departmentGroups[mainKey]) {
                    targetGroupIds.add(botConfig.departmentGroups[mainKey]);
                } else if (botConfig.departmentGroups[rawKey]) {
                    targetGroupIds.add(botConfig.departmentGroups[rawKey]);
                } else {
                    // Try partial/alias match
                    for (const [k, gid] of Object.entries(botConfig.departmentGroups)) {
                        if (k === mainKey || mainKey.includes(k) || k.includes(mainKey)) {
                            targetGroupIds.add(gid);
                            break;
                        }
                    }
                }
            };

            // 2a. Origin Department group (gets notifications for claim, pending, solved, etc.)
            if (department) {
                addDeptToTargets(department);
            }

            // 2b. Assigned Department groups
            if (assignedDepartments) {
                const assignedList = Array.isArray(assignedDepartments) ? assignedDepartments : String(assignedDepartments).split(',');
                assignedList.forEach(d => addDeptToTargets(d));
            }

            // 2c. Tagged Department groups
            if (taggedDepartments) {
                const taggedList = Array.isArray(taggedDepartments) ? taggedDepartments : String(taggedDepartments).split(',');
                taggedList.forEach(d => addDeptToTargets(d));
            }

            // 2d. Also match any @mentions or *Origin:* / *Taken by:* / *Solved by:* text inside message
            for (const [subKey, parentKey] of Object.entries(SUBDEPARTMENT_TO_MAIN)) {
                if (lowerMsg.includes(`@${subKey}`) || lowerMsg.includes(`origin:* ${subKey}`) || lowerMsg.includes(`origin: ${subKey}`)) {
                    if (botConfig.departmentGroups[parentKey]) {
                        targetGroupIds.add(botConfig.departmentGroups[parentKey]);
                    }
                }
            }
        }

        if (targetGroupIds.size === 0 && !botConfig.channelId) {
            return res.status(400).json({ error: 'No groups linked or channel set. Type !syncgroups or !setgroup in WhatsApp.' });
        }

        console.log(`Dispatching notification to ${targetGroupIds.size} groups...`);

        // Send to all target groups
        for (const gid of targetGroupIds) {
            try {
                let mentions = [];
                // Ping all members if it's an @ALL emergency in the General group
                if (isAll && gid === botConfig.generalGroupId) {
                    try {
                        const meta = await globalSock.groupMetadata(gid);
                        mentions = (meta.participants || []).map(p => p.id);
                    } catch (e) {}
                }

                // Determine department for this group to tailor the tag
                let deptForGid = null;
                for (const [dKey, dGid] of Object.entries(botConfig.departmentGroups)) {
                    if (dGid === gid) {
                        deptForGid = DEPARTMENTS.find(d => d.toLowerCase() === dKey) || dKey;
                        break;
                    }
                }

                let targetMsg = message;
                // If it's a specific department group (not General and not @ALL), show ONLY their own tag
                if (deptForGid && gid !== botConfig.generalGroupId && !isAll) {
                    targetMsg = targetMsg.replace(/\*Tags:\*[^\n]*/i, `*Tags:* @${deptForGid}`);
                }

                if (imageUrl) {
                    await globalSock.sendMessage(gid, { 
                        image: { url: imageUrl }, 
                        caption: targetMsg,
                        mentions
                    });
                } else {
                    await globalSock.sendMessage(gid, { 
                        text: targetMsg,
                        mentions
                    });
                }
            } catch (errSend) {
                console.error(`Failed sending to group ${gid}:`, errSend.message);
            }
        }

        // Broadcast to WhatsApp Channel (Read-only bulletin feed for all staff & management)
        if (botConfig.channelId) {
            try {
                await globalSock.sendMessage(botConfig.channelId, { 
                    text: message
                });
                console.log(`[Channel] Broadcasted notification to Channel: ${botConfig.channelId}`);
            } catch (errChan) {
                console.error(`[Channel] Failed sending to channel ${botConfig.channelId}:`, errChan.message);
            }
        }
        
        res.json({ success: true, sentToCount: targetGroupIds.size, channelSent: !!botConfig.channelId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// --- BACKGROUND ESCALATION LOOP ---
function parseDeadlineToMs(deadline) {
    if (!deadline) return null;
    if (typeof deadline === 'number') {
        let t = deadline;
        if (t < 10000000000) t *= 1000;
        return t > 0 ? t : null;
    }
    const str = String(deadline).trim();
    if (!str || str === 'undefined' || str === 'null') return null;

    if (/^\d+$/.test(str)) {
        let t = parseInt(str, 10);
        if (t < 10000000000) t *= 1000;
        return t > 0 ? t : null;
    }

    let parsed = Date.parse(str.replace(' ', 'T'));
    if (isNaN(parsed) || parsed <= 0) {
        parsed = Date.parse(str);
    }
    return (!isNaN(parsed) && parsed > 0) ? parsed : null;
}

// Tracks alerted milestones per issue to ensure NO rapid-fire spam
const triggeredMilestones = new Set(); // Stores 'issueId-milestone' keys

setInterval(async () => {
    if ((!botConfig.generalGroupId && Object.keys(botConfig.departmentGroups).length === 0) || !globalSock) return;
    try {
        const res = await axios.get(`${BASE_URL}/api/issues`);
        if (res.data && res.data.success) {
            const issues = res.data.data;
            const now = Date.now();
            const TARGET_MILESTONES = [5, 10, 15, 30, 60]; // Strict milestone minutes

            let alertSentThisCycle = false;

            for (const issue of issues) {
                if (alertSentThisCycle) break; // Rate-limit: Max 1 WhatsApp alert per 15-second check!

                const isUnresolved = issue.status === 'open' || issue.status === 'progress';
                if (!isUnresolved || issue.priority !== 'critical' || !issue.deadline) continue;

                const deadlineTime = parseDeadlineToMs(issue.deadline);
                if (!deadlineTime) continue;

                if (now < deadlineTime) continue; // Deadline not reached yet

                const overdueMins = Math.floor((now - deadlineTime) / 60000);

                // Ignore legacy seed items or items overdue by > 24 hours (1440 mins) to prevent spam
                if (overdueMins > 1440) continue;

                // Determine matching milestone
                let matchingMilestone = null;
                for (const m of TARGET_MILESTONES) {
                    // Match if overdueMins is currently within 1 min of milestone
                    if (overdueMins === m || overdueMins === m + 1) {
                        matchingMilestone = m;
                        break;
                    }
                }

                // If overdue > 60m, check hourly milestones (120m, 180m, etc.)
                if (overdueMins > 60 && overdueMins % 60 <= 1) {
                    matchingMilestone = Math.floor(overdueMins / 60) * 60;
                }

                if (matchingMilestone === null) continue; // Not at a milestone minute right now!

                const mKey = `${issue.id}-${matchingMilestone}`;
                if (triggeredMilestones.has(mKey)) continue; // Already alerted for this milestone!

                triggeredMilestones.add(mKey);
                alertSentThisCycle = true;

                const milestoneNotice = issue.status === 'progress'
                    ? `⏰ *In-Progress Milestone:* Overdue by ${matchingMilestone} minutes!`
                    : `⚠️ *Unclaimed Milestone:* Overdue by ${matchingMilestone} minutes (Unclaimed)!`;

                const overdueStr  = `${overdueMins} minute${overdueMins !== 1 ? 's' : ''} ago`;
                const statusLabel = issue.status === 'progress' ? '🔧 In Progress (STILL UNRESOLVED)' : '⚠️ UNCLAIMED & OPEN';
                const workerStr   = issue.status === 'progress' && issue.taker
                    ? `\n*Assigned Worker:* ${issue.taker}`
                    : '\n*Assigned Worker:* ⚠️ *UNCLAIMED — NO ONE IS HANDLING THIS YET!*';
                const taggedStr   = issue.taggedDepartments ? `\n*Tagged Departments:* ${issue.taggedDepartments}` : '';

                const msg = `🚨 *OVERDUE CRITICAL ISSUE ALERT!* 🚨\n\n` +
                    `${milestoneNotice}\n\n` +
                    `*Title:* ${issue.title}\n` +
                    `*Location:* ${issue.location}\n` +
                    `*Reporter:* ${issue.reporter}\n` +
                    `*Status:* ${statusLabel}${workerStr}${taggedStr}\n` +
                    `*Overdue by:* ${overdueStr}\n` +
                    `*ID:* ${issue.id}\n\n` +
                    `❗ *PLEASE RESOLVE OR UPDATE IMMEDIATELY!*`;

                // Targets for escalation
                const escalationTargets = new Set();
                if (botConfig.generalGroupId) escalationTargets.add(botConfig.generalGroupId);
                
                if (issue.taggedDepartments) {
                    const isAllEsc = issue.taggedDepartments.toLowerCase().includes('all');
                    if (isAllEsc) {
                        Object.values(botConfig.departmentGroups).forEach(gid => escalationTargets.add(gid));
                    } else {
                        for (const d of DEPARTMENTS) {
                            if (issue.taggedDepartments.toLowerCase().includes(d.toLowerCase()) && botConfig.departmentGroups[d.toLowerCase()]) {
                                escalationTargets.add(botConfig.departmentGroups[d.toLowerCase()]);
                            }
                        }
                    }
                }

                for (const gid of escalationTargets) {
                    try {
                        let deptForGid = null;
                        for (const [dKey, dGid] of Object.entries(botConfig.departmentGroups)) {
                            if (dGid === gid) {
                                deptForGid = DEPARTMENTS.find(d => d.toLowerCase() === dKey) || dKey;
                                break;
                            }
                        }

                        let targetMsg = msg;
                        if (deptForGid && gid !== botConfig.generalGroupId && !issue.taggedDepartments?.toLowerCase().includes('all')) {
                            targetMsg = targetMsg.replace(/\*Tagged Departments:\*[^\n]*/i, `*Tagged Departments:* ${deptForGid}`);
                        }

                        if (issue.imageUrl) {
                            await globalSock.sendMessage(gid, {
                                image: { url: issue.imageUrl },
                                caption: targetMsg
                            });
                        } else {
                            await globalSock.sendMessage(gid, { text: targetMsg });
                        }
                    } catch (e) {}
                }

                // Also broadcast critical milestone escalation to WhatsApp Channel
                if (botConfig.channelId) {
                    try {
                        await globalSock.sendMessage(botConfig.channelId, { text: msg });
                        console.log(`[Channel] Broadcasted milestone escalation to Channel: ${botConfig.channelId}`);
                    } catch (eChan) {
                        console.error(`[Channel] Milestone broadcast error:`, eChan.message);
                    }
                }
            }

            // Cleanup solved/deleted issues from milestone memory
            for (const key of triggeredMilestones) {
                const [id] = key.split('-');
                const found = issues.find(i => i.id === id);
                if (!found || (found.status !== 'open' && found.status !== 'progress')) {
                    triggeredMilestones.delete(key);
                }
            }
        }
    } catch (e) {
        console.error("Escalation loop error:", e.message);
    }
}, 15000); // Check every 15 seconds

const PORT = process.env.BOT_PORT || process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Notification API listening on port ${PORT}`);
});

startSock();
