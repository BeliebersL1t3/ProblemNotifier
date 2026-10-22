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
    const norm = normalizePhoneNumber(clean);
    const local = norm.startsWith('62') ? ('0' + norm.substring(2)) : norm;
    return staffPhones[norm] || staffPhones[clean] || staffPhones[local] || null;
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
        browser: ['Telunas CampusFix V2', 'Chrome', '1.0.0']
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
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message) continue;
            if (msg.key.fromMe) continue;

            const from = msg.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            const senderJid = isGroup ? (msg.key.participant || from) : from;
            const senderPhone = normalizePhoneNumber(senderJid.split('@')[0].split(':')[0]);

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
            let registeredUser = getStaffByPhone(senderPhone);
            if (!registeredUser) {
                await syncStaffDirectory();
                registeredUser = getStaffByPhone(senderPhone);
            }

            // Unregistered user check
            if (!registeredUser) {
                if (!isGroup) {
                    await reply(
                        `🔒 *AKSES DITOLAK — NOMOR TIDAK TERDAFTAR*\n\n` +
                        `Nomor WhatsApp Anda (+${senderPhone}) belum terdaftar dalam sistem Telunas Issue Tracker.\n\n` +
                        `Bot ini khusus digunakan oleh staf resmi Telunas Resort.\n` +
                        `Silakan daftarkan nomor WhatsApp Anda melalui Web Dashboard di:\n${BASE_URL}/profile atau hubungi HOD Anda.`
                    );
                }
                continue;
            }

            // ═════════════════════════════════════════════════════════════════
            // A. COMMANDS IN GROUP (Action-Only: ambil, selesai, edit, list forwarding)
            // ═════════════════════════════════════════════════════════════════
            if (isGroup) {
                // 1. HELP in Group
                if (lower === 'help' || lower === '!help') {
                    await reply(
                        `🛠️ *TELUNAS CAMPUSFIX - PERINTAH GRUP* 🛠️\n\n` +
                        `Grup ini khusus digunakan untuk eksekusi tindakan penanganan isu:\n\n` +
                        `👉 *ambil [ID]* : Mengklaim & mulai mengerjakan isu.\n` +
                        `   _Bisa juga langsung reply pesan tiket dengan kata *ambil*._\n\n` +
                        `👉 *selesai [ID]* : Menyelesaikan tiket pengerjaan.\n` +
                        `   _Bisa juga langsung reply pesan tiket dengan kata *selesai*._\n\n` +
                        `👉 *edit [ID] ke [DEPT] [Alasan]* : Mengalihkan isu ke departemen lain.\n` +
                        `   _Contoh: edit ENG-221026-105 ke HK Plafon berjamur butuh dibersihkan HK._\n\n` +
                        `👉 *list departemen* : Melihat daftar kode & nama departemen.\n\n` +
                        `💡 _Perintah *lapor* dan pengecekan *list status* dilakukan melalui Chat Pribadi (DM) ke bot._`
                    );
                    continue;
                }

                // 2. LIST DEPARTEMEN in Group or DM
                if (lower === 'list departemen' || lower === 'list dept' || lower === '!list dept') {
                    let deptList = `📋 *DAFTAR KODE & DEPARTEMEN TELUNAS* 📋\n\n`;
                    OFFICIAL_DEPARTMENTS.forEach(d => {
                        deptList += `• *${d.code.padEnd(4, ' ')}* : ${d.name}\n`;
                    });
                    deptList += `\n💡 _Format ID Isu: [KODE]-[TGLBLNTHN]-[NOMOR]_\n_Contoh: ENG-221026-105_`;
                    await reply(deptList);
                    continue;
                }

                // 3. LIST COMMANDS IN GROUP (FORWARD TO PRIVATE DM!)
                if (lower.startsWith('list menunggu') || lower.startsWith('list progress') || 
                    lower.startsWith('list pending')  || lower.startsWith('list selesai')) {
                    
                    const statusType = lower.includes('menunggu') ? 'open' :
                                       lower.includes('progress') ? 'progress' :
                                       lower.includes('pending') ? 'pending' : 'solved';

                    const userDept = registeredUser.department || '';
                    const userDmJid = `${senderPhone}@s.whatsapp.net`;

                    // Fetch issues from Laravel
                    try {
                        const issuesRes = await axios.get(`${BASE_URL}/api/lean/issues`);
                        let issues = issuesRes.data?.data || [];

                        // Filter by user's department & status
                        const filtered = issues.filter(iss => {
                            const issDept = (iss.department || iss.assignedDepartments?.[0] || '').toLowerCase();
                            const matchesDept = userDept ? issDept.includes(userDept.toLowerCase()) : true;
                            const matchesStatus = (iss.status || '').toLowerCase() === statusType;
                            return matchesDept && matchesStatus;
                        });

                        const statusLabel = statusType === 'open' ? 'MENUNGGU PENANGANAN' :
                                            statusType === 'progress' ? 'SEDANG DIKERJAKAN' :
                                            statusType === 'pending' ? 'TERTUNDA (PENDING)' : 'SUDAH SELESAI';

                        let listMsg = `📋 *DAFTAR ISU ${statusLabel}* 📋\n`;
                        listMsg += `🏢 *Departemen:* ${userDept || 'Semua'}\n`;
                        listMsg += `👤 *Penerima:* ${registeredUser.name}\n\n`;

                        if (filtered.length === 0) {
                            listMsg += `_Tidak ada isu dengan status ${statusLabel} untuk departemen Anda saat ini._`;
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

                // 4. GROUP ACTION: AMBIL (CLAIM)
                if (lower.startsWith('ambil') || lower.startsWith('!ambil') || lower.startsWith('claim') || lower.startsWith('!claim')) {
                    const words = text.split(/\s+/);
                    let targetId = words[1] || extractIssueId(text) || extractIssueId(quotedText);

                    if (!targetId) {
                        await reply(`⚠️ *Format Tidak Lengkap*\n\nKetik: *ambil [ID_ISU]*\nAtau reply pesan notifikasi tiket dengan kata *ambil*.`);
                        continue;
                    }

                    try {
                        const claimRes = await axios.post(`${BASE_URL}/api/lean/issues/${targetId}/claim`, {
                            taker: registeredUser.name,
                            department: registeredUser.department || ''
                        });

                        if (claimRes.data.success) {
                            await reply(
                                `✅ *TIKET BERHASIL DIAMBIL* ✅\n\n` +
                                `• *ID Tiket:* #${targetId}\n` +
                                `• *Pengerja:* ${registeredUser.name} (${registeredUser.department || 'Staf'})\n` +
                                `• *Status:* 🟡 Sedang Dikerjakan (In Progress)\n\n` +
                                `_Selamat bertugas! Ketik *selesai ${targetId}* bila pekerjaan telah rampung._`
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

                // 5. GROUP ACTION: SELESAI (RESOLVE)
                if (lower.startsWith('selesai') || lower.startsWith('!selesai') || lower.startsWith('solve') || lower.startsWith('!solve')) {
                    const words = text.split(/\s+/);
                    let targetId = words[1] || extractIssueId(text) || extractIssueId(quotedText);

                    if (!targetId) {
                        await reply(`⚠️ *Format Tidak Lengkap*\n\nKetik: *selesai [ID_ISU]*\nAtau reply pesan notifikasi tiket dengan kata *selesai*.`);
                        continue;
                    }

                    try {
                        const solveRes = await axios.post(`${BASE_URL}/api/lean/issues/${targetId}/resolve`, {
                            solver: registeredUser.name,
                            fixDescription: 'Diselesaikan via WhatsApp Grup Telunas V2'
                        });

                        if (solveRes.data.success) {
                            await reply(
                                `🎉 *TIKET TELAH SELESAI* 🎉\n\n` +
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

                // 6. GROUP ACTION: EDIT (PENGALIHAN KE DEPT LAIN)
                if (lower.startsWith('edit') || lower.startsWith('!edit') || lower.startsWith('transfer')) {
                    // Pattern 1: edit ENG-221026-105 ke HK Alasan kenapa
                    // Pattern 2: (quoted message) edit ke HK Alasan kenapa
                    let targetId = extractIssueId(text) || extractIssueId(quotedText);
                    
                    // Parse target department and reason
                    let remaining = text.replace(/^(?:!edit|edit|transfer)\s+/i, '');
                    if (targetId) {
                        remaining = remaining.replace(new RegExp('#?' + targetId, 'i'), '').trim();
                    }
                    remaining = remaining.replace(/^ke\s+/i, '').trim();

                    const matchDept = remaining.match(/^([A-Za-z]+)\s*(.*)$/);
                    let targetDeptRaw = matchDept ? matchDept[1] : '';
                    let transferReason = matchDept ? matchDept[2].trim() : '';

                    const validDept = normalizeDept(targetDeptRaw);

                    if (!targetId || !validDept || !transferReason) {
                        await reply(
                            `⚠️ *Format Perintah Edit / Pengalihan Departemen:*\n\n` +
                            `Ketik:\n*edit [ID] ke [DEPARTEMEN] [Alasan]*\n\n` +
                            `*Contoh:* edit ENG-221026-105 ke HK Plafon bernoda butuh dibersihkan HK terlebih dahulu.\n` +
                            `_Atau reply pesan tiket dan ketik: edit ke HK [Alasan]_`
                        );
                        continue;
                    }

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

                            // 1. Announce in current group (Old Group)
                            await reply(
                                `🔄 *TIKET DIALIHKAN KE DEPARTEMEN LAIN* 🔄\n\n` +
                                `• *ID Tiket:* #${targetId}\n` +
                                `• *Dialihkan ke:* ${newDeptName}\n` +
                                `• *Dialihkan oleh:* ${registeredUser.name}\n` +
                                `• *Alasan:* ${transferReason}\n\n` +
                                `_Tiket telah dilepaskan dari antrean ${oldDeptName} dan diteruskan ke grup ${newDeptName}._`
                            );

                            // 2. Broadcast to New Department Group
                            const newDeptKey = validDept.key;
                            const newGroupJid = botConfig.departmentGroups[newDeptKey];
                            if (newGroupJid) {
                                const newDeptMsg = 
                                    `📥 *TIKET MASUK (DIALIHKAN)* 📥\n\n` +
                                    `• *ID Tiket:* #${targetId}\n` +
                                    `• *Masalah:* ${updated.title || '-'}\n` +
                                    `• *Lokasi:* ${updated.location || '-'}\n` +
                                    `• *Dialihkan dari:* ${oldDeptName}\n` +
                                    `• *Dialihkan oleh:* ${registeredUser.name}\n` +
                                    `• *Alasan Pengalihan:* ${transferReason}\n` +
                                    `• *Deskripsi Asal:* ${updated.description || '-'}\n\n` +
                                    `👉 _Ketik *ambil ${targetId}* atau reply pesan ini dengan kata *ambil* untuk memulai pengerjaan._`;
                                
                                await sock.sendMessage(newGroupJid, { text: newDeptMsg });
                            }

                            // 3. Notify Reporter's DM if phone is mapped
                            const reporterPhone = updated.reporter_phone || null;
                            if (reporterPhone) {
                                const repDmJid = `${reporterPhone}@s.whatsapp.net`;
                                try {
                                    await sock.sendMessage(repDmJid, {
                                        text: `ℹ️ *UPDATE STATUS LAPORAN ANDA*\n\n` +
                                              `Laporan Anda *#${targetId}* (${updated.title}) telah dialihkan pengerjaannya dari *${oldDeptName}* ke *${newDeptName}*.\n\n` +
                                              `*Alasan:* ${transferReason}\n\n` +
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

                // If user tried to 'lapor' in group, gently direct them to DM
                if (lower === 'lapor' || lower === '!lapor') {
                    await reply(`📝 Halo @${senderPhone}, pembuatan laporan masalah dilakukan melalui *Chat Pribadi (DM)* ke bot ini agar data dan foto tersimpan dengan tertib.`);
                    continue;
                }

                // Ignore other normal group chatter
                continue;
            }

            // ═════════════════════════════════════════════════════════════════
            // B. COMMANDS IN DIRECT MESSAGE (DM / Chat Pribadi)
            // ═════════════════════════════════════════════════════════════════

            let state = getUserState(senderPhone) || { step: STEPS.IDLE, data: {} };

            // CANCEL COMMAND
            if (['batal', 'cancel', 'reset', '!batal'].includes(lower)) {
                clearUserState(senderPhone);
                await reply(`🔄 Proses pelaporan telah dibatalkan. Ketik *lapor* kapan saja untuk membuat laporan baru.`);
                continue;
            }

            // HELP in DM
            if (state.step === STEPS.IDLE && (lower === 'help' || lower === '!help' || lower === 'bantuan')) {
                await reply(
                    `👋 *HALO ${registeredUser.name.toUpperCase()}!* 📱\n` +
                    `Selamat datang di Telunas CampusFix Bot V2.\n\n` +
                    `Berikut perintah yang dapat Anda gunakan di chat pribadi:\n\n` +
                    `👉 *lapor* : Memulai pelaporan masalah baru step-by-step.\n` +
                    `👉 *list menunggu* : Melihat isu yang belum dikerjakan di departemen Anda.\n` +
                    `👉 *list progress* : Melihat isu yang sedang dikerjakan tim Anda.\n` +
                    `👉 *list pending* : Melihat isu yang sedang tertunda/pending.\n` +
                    `👉 *list selesai* : Melihat riwayat isu yang baru diselesaikan.\n` +
                    `👉 *list departemen* : Melihat daftar kode & singkatan departemen.\n` +
                    `👉 *batal* : Membatalkan proses pengisian formulir pelaporan.`
                );
                continue;
            }

            // LIST DEPARTEMEN in DM
            if (state.step === STEPS.IDLE && (lower === 'list departemen' || lower === 'list dept')) {
                let deptList = `📋 *DAFTAR KODE & DEPARTEMEN TELUNAS* 📋\n\n`;
                OFFICIAL_DEPARTMENTS.forEach(d => {
                    deptList += `• *${d.code.padEnd(4, ' ')}* : ${d.name}\n`;
                });
                deptList += `\n💡 _Format ID Isu: [KODE]-[TGLBLNTHN]-[NOMOR]_\n_Contoh: ENG-221026-105_`;
                await reply(deptList);
                continue;
            }

            // LIST STATUS COMMANDS in DM
            if (state.step === STEPS.IDLE && (lower.startsWith('list menunggu') || lower.startsWith('list progress') || 
                lower.startsWith('list pending')  || lower.startsWith('list selesai'))) {

                const statusType = lower.includes('menunggu') ? 'open' :
                                   lower.includes('progress') ? 'progress' :
                                   lower.includes('pending') ? 'pending' : 'solved';

                const userDept = registeredUser.department || '';

                try {
                    const issuesRes = await axios.get(`${BASE_URL}/api/lean/issues`);
                    let issues = issuesRes.data?.data || [];

                    const filtered = issues.filter(iss => {
                        const issDept = (iss.department || iss.assignedDepartments?.[0] || '').toLowerCase();
                        const matchesDept = userDept ? issDept.includes(userDept.toLowerCase()) : true;
                        const matchesStatus = (iss.status || '').toLowerCase() === statusType;
                        return matchesDept && matchesStatus;
                    });

                    const statusLabel = statusType === 'open' ? 'MENUNGGU PENANGANAN' :
                                        statusType === 'progress' ? 'SEDANG DIKERJAKAN' :
                                        statusType === 'pending' ? 'TERTUNDA (PENDING)' : 'SUDAH SELESAI';

                    let listMsg = `📋 *DAFTAR ISU ${statusLabel}* 📋\n`;
                    listMsg += `🏢 *Departemen:* ${userDept || 'Semua'}\n\n`;

                    if (filtered.length === 0) {
                        listMsg += `_Tidak ada isu dengan status ${statusLabel} untuk departemen Anda saat ini._`;
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
            // STEP-BY-STEP REPORTING WIZARD (lapor)
            // ═════════════════════════════════════════════════════════════════
            if (state.step === STEPS.IDLE) {
                if (lower === 'lapor' || lower === '!lapor' || lower === 'buat tiket') {
                    state.step = STEPS.AWAITING_TITLE;
                    state.data = {
                        reporter: registeredUser.name,
                        reporter_phone: senderPhone,
                        reporter_dept: registeredUser.department || ''
                    };
                    setUserState(senderPhone, state);

                    await reply(
                        `📝 *FORMULIR LAPORAN KENDALA / MASALAH* 📝\n\n` +
                        `Halo *${registeredUser.name}* (${registeredUser.department || 'Staf Telunas'})!\n` +
                        `Identitas Anda telah terverifikasi secara otomatis.\n\n` +
                        `*Langkah 1/5:* Apa masalah atau judul kendala yang Anda temukan?\n` +
                        `_(Contoh: AC Kamar 5 Menetes Air / Lampu Dermaga Mati)_\n\n` +
                        `💡 _Ketik *batal* kapan saja untuk membatalkan._`
                    );
                    continue;
                } else {
                    // Friendly greeting
                    await reply(
                        `Halo *${registeredUser.name}*! 👋\n` +
                        `Ketik *lapor* untuk membuat laporan masalah baru, atau ketik *help* untuk melihat seluruh perintah yang tersedia.`
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
                    `📍 *Langkah 2/5:* Di mana lokasi kendala ini?\n\n` +
                    `Pilih angka atau ketik nama lokasi:\n` +
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
                    `_(Contoh: Rembesan air mengenai meja kerja sejak tadi malam, tamu meminta dicek segera.)_`
                );
                continue;
            }

            // Step 3 -> Step 4: Photo
            if (state.step === STEPS.AWAITING_DESC) {
                if (!text || text.length < 3) {
                    await reply(`⚠️ Mohon tuliskan deskripsi masalah dengan cukup jelas.`);
                    continue;
                }
                state.data.description = text;
                state.step = STEPS.AWAITING_PHOTO;
                setUserState(senderPhone, state);

                await reply(
                    `📸 *Langkah 4/5:* Silakan kirimkan *FOTO BUKTI KENDALA*.\n\n` +
                    `_Kirim foto langsung ke chat ini, atau ketik *lewati* jika tidak ada foto saat ini._`
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
                } else if (lower !== 'lewati' && lower !== 'skip' && lower !== 'tidak ada') {
                    await reply(`⚠️ Kirimkan gambar foto bukti kendala, atau ketik *lewati* jika tidak memiliki foto.`);
                    continue;
                }

                state.step = STEPS.AWAITING_DEPARTMENT;
                setUserState(senderPhone, state);

                let deptPrompt = `🎯 *Langkah 5/5: Pilih 1 Departemen yang bertanggung jawab menyelesaikan masalah ini:*\n\n`;
                OFFICIAL_DEPARTMENTS.forEach((d, idx) => {
                    deptPrompt += `${idx + 1}. *${d.name}* (${d.code})\n`;
                });
                deptPrompt += `\n_Ketik angka (1-11) atau nama departemen tujuan._`;

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

                        // Confirmation to Reporter
                        await reply(
                            `✅ *LAPORAN BERHASIL DIBUAT!* ✅\n\n` +
                            `• *ID Isu:* #${issueId}\n` +
                            `• *Judul:* ${state.data.title}\n` +
                            `• *Lokasi:* ${state.data.location}\n` +
                            `• *Departemen Dituju:* ${state.data.department}\n` +
                            `• *Pelapor:* ${state.data.reporter}\n\n` +
                            `Laporan telah diteruskan ke grup terkait. Terima kasih!`
                        );

                        // Broadcast message content
                        const broadcastText = 
                            `📢 *LAPORAN MASALAH BARU* 📢\n\n` +
                            `• *ID Tiket:* #${issueId}\n` +
                            `• *Masalah:* ${state.data.title}\n` +
                            `• *Lokasi:* ${state.data.location}\n` +
                            `• *Departemen:* ${state.data.department}\n` +
                            `• *Pelapor:* ${state.data.reporter} (${state.data.reporter_dept || 'Staf'})\n` +
                            `• *Deskripsi:* ${state.data.description}\n\n`;

                        // 1. Send to Location Group (FYI, Read-only)
                        const locKey = (state.data.location || '').toLowerCase();
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

    app.listen(PORT, () => {
        console.log(`[HTTP Server V2] Listening on port ${PORT}`);
    });
}

startBot().catch(err => {
    console.error('[Bot Fatal Error]', err);
});
