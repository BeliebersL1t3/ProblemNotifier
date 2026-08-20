const { makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const FormData = require('form-data');
const express = require('express');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const app = express();
app.use(express.json());

// ─── Server URL ────────────────────────────────────────────────────────────────
// Dev (Laragon):   http://TelunasIssueTracker.test
// Production:      http://telunas.local
const BASE_URL = 'http://TelunasIssueTracker.test';
// ───────────────────────────────────────────────────────────────────────────────

const userStates = new Map();

// Multi-group & Community Configuration
let botConfig = {
    generalGroupId: null,
    departmentGroups: {}
};
let linkedGroupId = null;

function loadConfig() {
    try {
        if (fs.existsSync('config.json')) {
            const data = JSON.parse(fs.readFileSync('config.json', 'utf8'));
            botConfig.generalGroupId = data.generalGroupId || data.groupId || null;
            botConfig.departmentGroups = data.departmentGroups || {};
            linkedGroupId = botConfig.generalGroupId;
            console.log(`Loaded General Group ID: ${botConfig.generalGroupId}`);
            console.log(`Loaded ${Object.keys(botConfig.departmentGroups).length} Department Groups`);
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

const STEPS = {
    IDLE: 0,
    AWAITING_NAME: 1,
    AWAITING_TITLE: 2,
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
    AWAITING_TAG_DEPT: 23,
    STATUS_AWAITING_DEPT: 24,
    STATUS_AWAITING_STATUS: 25,
    STATUS_AWAITING_CAT: 26,
    AWAITING_LOC_DETAIL: 27,  // Entered when user picks "Other" in location step
    SOS_AWAITING_DESC: 28,    // Optional details in SOS emergency flow
    // Out-of-order confirmation flows
    CONFIRM_CLAIM_THEN_PENDING: 29, // Issue is open; ask if user wants claim+pending
    CONFIRM_CLAIM_THEN_SOLVE: 30,   // Issue is open; ask if user wants claim+solve
    CONFIRM_CLAIM_PENDING_NAME: 31, // Collect worker name after yes-confirm for claim+pending
    CONFIRM_CLAIM_SOLVE_NAME: 32,   // Collect solver name after yes-confirm for claim+solve
    AWAITING_MENU_LANG: 33,         // User typed "menu" and needs to choose ID or EN
    SOS_AWAITING_PHOTO: 34,         // Optional photo upload in SOS flow
};

const DEPARTMENTS = [
    'Engineer', 'Tekong', 'Pest Control', 'Security', 'Fasilitas', 
    'HK', 'F&B', 'Service', 'Bar', 'GR', 'Spa', 'TiRek', 'OE', 
    'IT', 'Procurement', 'Sales/Marketing', 'Reservasi', 'Finance'
];

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
`5. 🤝 *!claim <Nama>* (di Grup)\n   → Balas notifikasi masalah di grup untuk mengambil pekerjaan.\n\n` +
`6. 📊 *!status* / *!masalah*\n   → Cek status masalah berdasarkan departemen.\n\n` +
`7. 📖 *menu id* / *menu en*\n   → Buka menu panduan Bahasa Indonesia / English.\n\n` +
`8. ❌ *batal* / *reset*\n   → Batalkan percakapan & kembali ke awal.`;

const MENU_TEXT_EN = 
`📱 *TELUNAS RESORT ISSUE TRACKER — MAIN MENU* 📱\n\n` +
`Here is the complete list of WhatsApp commands:\n\n` +
`1. 🚨 *!sos* / *sos* / *emergency* / *help* / *darurat*\n   → Fast-track emergency report (automatic critical deadline).\n\n` +
`2. 📋 *!report* / *report* / *broken*\n   → Step-by-step issue reporting flow.\n\n` +
`3. 🔧 *!solve* / *solve* / *fix*\n   → Resolve an issue with fix description & proof photo.\n\n` +
`4. ⏳ *!pending* / *pending* / *delay*\n   → Mark a job as pending with reason & proof photo.\n\n` +
`5. 🤝 *!claim <Your Name>* (in Group)\n   → Reply directly to an issue notification to claim it.\n\n` +
`6. 📊 *!status* / *!issues*\n   → Check active/solved issue status by department.\n\n` +
`7. 📖 *menu en* / *menu id*\n   → Open English / Indonesian guide menu.\n\n` +
`8. ❌ *cancel* / *reset*\n   → Cancel current operation & reset to menu.`;


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

            // Match General / Main Community Group
            if (lowerSubject.includes('general') || lowerSubject.includes('pengumuman') || lowerSubject === 'telunas resort issue report') {
                botConfig.generalGroupId = group.id;
                matched.push(`📌 *General*: "${subject}"`);
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

        saveConfig();
        return { success: true, count: matched.length, summary: matched.join('\n') };
    } catch (err) {
        console.error('Group sync error:', err);
        return { success: false, error: err.message };
    }
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
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                startSock();
            }
        } else if (connection === 'open') {
            console.log('Client is ready!');
            syncCommunityGroups(sock).then(res => { if (res.success) console.log(`Auto-synced ${res.count} community groups.`); });
        }
    });

    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
            if (!msg.message || msg.key.fromMe) continue;

            const from = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '').trim();

            const reply = async (replyText) => {
                await sock.sendMessage(from, { text: replyText }, { quoted: msg });
            };

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

                const lower = text.toLowerCase().trim();

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

                // 4. View currently linked groups
                if (lower === '!groups' || lower === '!groupinfo') {
                    let msgInfo = '📋 *LINKED TELUNAS GROUPS* 📋\n\n';
                    msgInfo += `📌 *General Group:* ${botConfig.generalGroupId ? '✅ Configured' : '❌ Not set'}\n\n`;
                    msgInfo += '*Department Groups:*\n';
                    DEPARTMENTS.forEach(d => {
                        const isSet = botConfig.departmentGroups[d.toLowerCase()] ? '✅' : '❌';
                        msgInfo += `• ${d}: ${isSet}\n`;
                    });
                    msgInfo += '\n💡 Type !syncgroups to auto-detect all community groups, or !setgroup <Department> in any group.';
                    await reply(msgInfo);
                    continue;
                }

                if (text.toLowerCase().startsWith('!claim')) {
                    let takerName = text.substring(6).trim();
                    if (!takerName) {
                        takerName = msg.pushName || 'Staff';
                    }
                    
                    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    const quotedText = quotedMsg?.conversation || quotedMsg?.imageMessage?.caption || quotedMsg?.extendedTextMessage?.text;

                    if (!quotedText) {
                        await reply('Please reply directly to an issue notification to claim it.');
                        continue;
                    }
                    
                    // Match alphanumeric ID with hyphens (e.g. "UND-190826-4", "Eng-190826-1", "123")
                    const idMatch = quotedText.match(/ID:\s*\*?\s*([A-Za-z0-9\-_]+)/i);
                    if (!idMatch) {
                        await reply('Could not find the Issue ID in the message you replied to. Please make sure you reply to a new issue notification.');
                        continue;
                    }
                    
                    const issueId = idMatch[1];
                    try {
                        const getRes = await axios.get(`${BASE_URL}/api/issues`);
                        if (!getRes.data.success) throw new Error("Failed to fetch issues");
                        
                        const issue = getRes.data.data.find(i => i.id === issueId);
                        if (!issue) {
                            await reply(`❌ Could not find issue ${issueId} in the database.`);
                            continue;
                        }
                        
                        // Status-specific guard messages
                        if (issue.status === 'solved') {
                            await reply(`✅ This issue (ID: ${issueId}) has already been *solved*. No further action needed.`);
                            continue;
                        }
                        if (issue.status === 'progress') {
                            await reply(`⚠️ Issue *${issueId}* has already been claimed by *${issue.taker || 'someone'}* and is currently *In Progress*. You cannot claim it again.\n\nIf they need to mark it pending, they can DM the bot with \`pending\`.`);
                            continue;
                        }
                        if (issue.status === 'pending') {
                            await reply(`⏸️ Issue *${issueId}* is currently *Pending* (delayed by ${issue.pendingBy || 'someone'}). It cannot be claimed until it's back In Progress.\n\nIf this is now resolved, the worker should DM the bot with \`solve\`.`);
                            continue;
                        }
                        
                        const claimRes = await axios.post(`${BASE_URL}/api/issues/${issue.rowIndex}/claim`, {
                            taker: takerName + " (via WhatsApp)"
                        });
                        
                        if (claimRes.data.success) {
                            await reply(`✅ Issue ${issueId} claimed successfully by *${takerName}*! The dashboard has been updated.`);
                        } else {
                            await reply(`❌ Failed to claim issue: ${claimRes.data.message || 'Unknown error'}`);
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
                
                if (!hasActiveState && !isStatusTrigger) {
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

                // Dispatch detected intent
                if (intent === 'SOS') {
                    await reply(getMsg(
                        '🚨 EMERGENCY MODE ACTIVATED 🚨\n\nFirst, what is your name?',
                        '🚨 MODE DARURAT DIAKTIFKAN 🚨\n\nPertama, siapa nama Anda?'
                    ));
                    userStates.set(stateKey, { step: STEPS.SOS_AWAITING_NAME, data: {}, lang: state.lang });
                    continue;
                } else if (intent === 'REPORT') {
                    await reply(getMsg(
                        'Welcome to the Telunas Resort Issue Tracker! Let\'s report an issue.\n\nFirst, what is your name?',
                        'Selamat datang di Telunas Resort Issue Tracker! Mari laporkan masalah.\n\nPertama, siapa nama Anda?'
                    ));
                    userStates.set(stateKey, { step: STEPS.AWAITING_NAME, data: {}, lang: state.lang });
                    continue;
                } else if (intent === 'SOLVE') {
                    await reply(getMsg(
                        'Great! Please provide the Issue ID you want to resolve (e.g., Sec-190826-1 or 190826-4):',
                        'Bagus! Harap masukkan ID Masalah yang ingin Anda selesaikan (contoh: Sec-190826-1 atau 190826-4):'
                    ));
                    userStates.set(stateKey, { step: STEPS.AWAITING_SOLVE_ID, data: {}, lang: state.lang });
                    continue;
                } else if (intent === 'PENDING') {
                    await reply(getMsg(
                        'You want to mark a job as Pending. Please provide the Issue ID (e.g., Sec-190826-1 or 190826-4):',
                        'Anda ingin menandai pekerjaan sebagai Tertunda. Harap masukkan ID Masalah (contoh: Sec-190826-1 atau 190826-4):'
                    ));
                    userStates.set(stateKey, { step: STEPS.AWAITING_PENDING_ID, data: {}, lang: state.lang });
                    continue;
                } else if (intent === 'STATUS') {
                    let deptMsg = getMsg(
                        'Please reply with the number of the department to check, or type "all":\n',
                        'Harap balas dengan nomor departemen yang ingin dicek, atau ketik "all":\n'
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
                    'Where are you located right now? Reply with a number or type your location:\n' +
                    '1. TPI\n2. TBR\n3. Kantor\n4. Other (type location)',
                    'Di mana lokasi Anda saat ini? Balas dengan nomor atau ketik lokasi Anda:\n' +
                    '1. TPI\n2. TBR\n3. Kantor\n4. Lainnya (ketik lokasi)'
                ));
                state.step = STEPS.SOS_AWAITING_LOC;
                continue;
            }

            if (state.step === STEPS.SOS_AWAITING_LOC) {
                const LOCATION_QUICK = { '1': 'TPI', '2': 'TBR', '3': 'Kantor' };
                if (LOCATION_QUICK[text]) {
                    state.data.location = LOCATION_QUICK[text];
                } else if (text === '4') {
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
                    'Where is this located? Reply with a number for quick-select, or just type your location:\n' +
                    '1. TPI\n2. TBR\n3. Kantor\n4. Other (type location)',
                    'Di mana lokasinya? Balas dengan nomor pilihan cepat, atau ketik lokasi Anda:\n' +
                    '1. TPI\n2. TBR\n3. Kantor\n4. Lainnya (ketik lokasi)'
                ));
                state.step = STEPS.AWAITING_LOC;
                continue;
            }

            if (state.step === STEPS.AWAITING_LOC) {
                const LOCATION_QUICK = { '1': 'TPI', '2': 'TBR', '3': 'Kantor' };

                if (LOCATION_QUICK[text]) {
                    state.data.location = LOCATION_QUICK[text];
                    await reply(getMsg(
                        `📍 Location set to *${LOCATION_QUICK[text]}*. Any more specific area within ${LOCATION_QUICK[text]}? (e.g. "Room 12") — or type *skip* to continue.`,
                        `📍 Lokasi diatur ke *${LOCATION_QUICK[text]}*. Ada area lebih spesifik di ${LOCATION_QUICK[text]}? (contoh: "Kamar 12") — atau ketik *skip* untuk lanjut.`
                    ));
                    state.step = STEPS.AWAITING_LOC_DETAIL;
                    continue;
                } else if (text === '4') {
                    await reply(getMsg('Please type the location:', 'Harap ketik lokasinya:'));
                    state.step = STEPS.AWAITING_LOC_DETAIL;
                    state.data.location = '';
                    continue;
                } else {
                    state.data.location = text;
                }

                let deptMenu = getMsg(
                    'Great. What department is this issue originating from? Reply with the number:\n',
                    'Bagus. Departemen mana asal masalah ini? Balas dengan nomornya:\n'
                );
                DEPARTMENTS.forEach((dept, index) => {
                    deptMenu += `${index + 1}. ${dept}\n`;
                });

                await reply(deptMenu.trim());
                state.step = STEPS.AWAITING_ORIGIN_DEPT;
                continue;
            }

            if (state.step === STEPS.AWAITING_LOC_DETAIL) {
                if (text.toLowerCase() !== 'skip' && text !== '') {
                    state.data.location = state.data.location
                        ? `${state.data.location} - ${text}`
                        : text;
                }

                let deptMenu = getMsg(
                    'Great. What department is this issue originating from? Reply with the number:\n',
                    'Bagus. Departemen mana asal masalah ini? Balas dengan nomornya:\n'
                );
                DEPARTMENTS.forEach((dept, index) => {
                    deptMenu += `${index + 1}. ${dept}\n`;
                });

                await reply(deptMenu.trim());
                state.step = STEPS.AWAITING_ORIGIN_DEPT;
                continue;
            }

            if (state.step === STEPS.AWAITING_ORIGIN_DEPT) {
                const idx = parseInt(text) - 1;
                if (isNaN(idx) || idx < 0 || idx >= DEPARTMENTS.length) {
                    await reply(getMsg(
                        'Invalid selection. Please reply with a valid number from the list.',
                        'Pilihan tidak valid. Harap balas dengan nomor yang sesuai dari daftar.'
                    ));
                    continue;
                }
                
                state.data.department = DEPARTMENTS[idx];
                
                let tagMenu = getMsg(
                    'Which departments are responsible for fixing this? You can select multiple by separating with spaces (e.g., "1 14 15"):\n',
                    'Departemen mana saja yang bertanggung jawab memperbaiki ini? Bisa pilih beberapa dengan spasi (contoh: "1 14 15"):\n'
                );
                DEPARTMENTS.forEach((dept, index) => {
                    tagMenu += `${index + 1}. ${dept}\n`;
                });
                
                await reply(tagMenu.trim());
                state.step = STEPS.AWAITING_TAG_DEPT;
                continue;
            }
            
            if (state.step === STEPS.AWAITING_TAG_DEPT) {
                const parts = text.split(/\s+/);
                const selectedTags = [];
                for (const part of parts) {
                    const idx = parseInt(part) - 1;
                    if (!isNaN(idx) && idx >= 0 && idx < DEPARTMENTS.length) {
                        selectedTags.push(DEPARTMENTS[idx]);
                    }
                }
                
                if (selectedTags.length === 0) {
                    await reply(getMsg(
                        'Invalid selection. Please reply with at least one valid number from the list (e.g. "1" or "1 2").',
                        'Pilihan tidak valid. Harap balas dengan setidaknya satu nomor valid dari daftar (contoh: "1" atau "1 2").'
                    ));
                    continue;
                }
                
                state.data.taggedDepartments = selectedTags.join(', ');
                
                let categoryMenu = getMsg(
                    'Almost done! Please select a category by replying with the number:\n',
                    'Hampir selesai! Pilih kategori dengan membalas nomornya:\n'
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
                    'Got it. What is the priority of this issue? Reply with the number:\n1. Low\n2. Medium\n3. High\n4. 🚨 Critical',
                    'Paham. Apa prioritas masalah ini? Balas dengan nomor:\n1. Rendah (Low)\n2. Sedang (Medium)\n3. Tinggi (High)\n4. 🚨 Kritis (Critical)'
                ));
                state.step = STEPS.AWAITING_PRIORITY;
                continue;
            }

            if (state.step === STEPS.AWAITING_PRIORITY) {
                const priorityMap = { '1': 'low', '2': 'medium', '3': 'high', '4': 'critical' };
                if (!priorityMap[text]) {
                    await reply(getMsg(
                        'Invalid selection. Please reply with a valid number (1-4).',
                        'Pilihan tidak valid. Harap balas dengan nomor (1-4).'
                    ));
                    continue;
                }
                
                state.data.priority = priorityMap[text];
                if (state.data.priority === 'critical') {
                    await reply(getMsg(
                        '🚨 Critical Priority selected. How much time do we have to fix this? Reply with the number:\n1. NOW\n2. 15 Minutes\n3. 30 Minutes\n4. 1 Hour\n5. 2 Hours',
                        '🚨 Prioritas Kritis dipilih. Berapa lama waktu penanganan? Balas dengan nomor:\n1. SEKARANG (NOW)\n2. 15 Menit\n3. 30 Menit\n4. 1 Jam\n5. 2 Jam'
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
                const timeMap = { '1': 0, '2': 15, '3': 30, '4': 60, '5': 120 };
                if (timeMap[text] === undefined) {
                    await reply('Invalid selection. Please reply with a valid number (1-5).');
                    continue;
                }
                
                const deadlineMs = Date.now() + timeMap[text] * 60000;
                state.data.deadline = deadlineMs.toString();
                await reply('Time limit set. Finally, please upload a photo of the problem as proof. (Send an image here)');
                state.step = STEPS.AWAITING_PHOTO;
                continue;
            }

            if (state.step === STEPS.AWAITING_PHOTO) {
                if (!msg.message.imageMessage) {
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
                            `👥 *Tagged:* ${state.data.taggedDepartments || 'None'}\n\n` +
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
                    const getRes = await axios.get(`${BASE_URL}/api/issues`);
                    if (getRes.data && getRes.data.success) {
                        const issue = getRes.data.data.find(i => i.id === queryId);
                        if (!issue) {
                            await reply(`❌ Could not find issue *${queryId}* in the database. Please check the ID and try again, or type "cancel" to exit.`);
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
                state.data.solverName = text + " (via WhatsApp)";
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
                if (!msg.message.imageMessage) {
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
                    
                    const issue = getRes.data.data.find(i => i.id === state.data.issueId);
                    if (!issue) {
                        await reply(`❌ Could not find issue ${state.data.issueId} in the database.`);
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
                    const getRes = await axios.get(`${BASE_URL}/api/issues`);
                    if (getRes.data && getRes.data.success) {
                        const issue = getRes.data.data.find(i => i.id === queryId);
                        if (!issue) {
                            await reply(`❌ Could not find issue *${queryId}* in the database. Please check the ID and try again, or type "cancel" to exit.`);
                            continue;
                        }
                        if (issue.status === 'solved') {
                            await reply(`✅ Issue *${queryId}* is already *Solved* — no pending needed. Type "cancel" to exit.`);
                            continue;
                        }
                        if (issue.status === 'open') {
                            // Out-of-order: issue hasn't been claimed yet
                            await reply(
                                `⚠️ Issue *${queryId}* has not been claimed yet — it is currently *Open (unclaimed)*.\n\n` +
                                `To mark a job as pending, someone must first claim it.\n\n` +
                                `Do you want to *claim this job AND immediately mark it as pending*?\n\n` +
                                `Reply *yes* to claim + pending, or *no* to cancel and keep the issue Open.`
                            );
                            state.data.issueId = queryId;
                            state.data.issueRowIndex = issue.rowIndex;
                            state.step = STEPS.CONFIRM_CLAIM_THEN_PENDING;
                            userStates.set(stateKey, state);
                            continue;
                        }
                        if (issue.status !== 'progress') {
                            // Catch any other unexpected status (e.g. future states)
                            await reply(`❌ Issue *${queryId}* is currently *${issue.status}* — only issues that are *In Progress* can be marked as pending.`);
                            continue;
                        }
                        // status === 'progress' — allowed
                    }
                } catch (e) {
                    console.error("Validation error:", e.message);
                }

                state.data.issueId = queryId;
                await reply(getMsg('What is your name? (Worker Name)', 'Siapa nama Anda? (Nama Pekerja)'));
                state.step = STEPS.AWAITING_PENDING_NAME;
                userStates.set(stateKey, state);
                continue;
            }
            if (state.step === STEPS.AWAITING_PENDING_NAME) {
                state.data.pendingBy = text + " (via WhatsApp)";
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
                    
                    const issue = getRes.data.data.find(i => i.id === state.data.issueId);
                    if (!issue) {
                        await reply(`❌ Could not find issue ${state.data.issueId} in the database.`);
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
                if (lowerText === 'all') {
                    state.data.status = 'all';
                } else {
                    const idx = parseInt(lowerText) - 1;
                    if (isNaN(idx) || idx < 0 || idx >= statuses.length) {
                        await reply('Invalid selection. Please reply with a valid number (1-3) or "all".');
                        continue;
                    }
                    state.data.status = statuses[idx];
                }
                
                let catMsg = "Finally, what category?\n";
                ALL_CATEGORIES.forEach((c, idx) => {
                    catMsg += `${idx + 1}. ${c.charAt(0).toUpperCase() + c.slice(1)}\n`;
                });
                catMsg += "\nReply with a number or type 'all':";
                await reply(catMsg);
                
                state.step = STEPS.STATUS_AWAITING_CAT;
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
// --- EXPRESS SERVER FOR NOTIFICATIONS (MULTI-GROUP ROUTING) ---
// --- EXPRESS SERVER FOR NOTIFICATIONS (MULTI-GROUP ROUTING) ---
app.post('/notify', async (req, res) => {
    try {
        const { message, imageUrl, taggedDepartments, priority } = req.body;
        
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
                      lowerMsg.includes('priority: critical') ||
                      priority === 'critical';

        if (isAll) {
            // Broadcast to ALL connected department groups
            Object.values(botConfig.departmentGroups).forEach(gid => {
                if (gid) targetGroupIds.add(gid);
            });
        } else {
            // Specific department matching from taggedDepartments or text
            for (const dept of DEPARTMENTS) {
                const deptKey = dept.toLowerCase();
                if (lowerMsg.includes(`@${deptKey}`) || (taggedDepartments && String(taggedDepartments).toLowerCase().includes(deptKey))) {
                    if (botConfig.departmentGroups[deptKey]) {
                        targetGroupIds.add(botConfig.departmentGroups[deptKey]);
                    }
                }
            }
        }

        if (targetGroupIds.size === 0) {
            return res.status(400).json({ error: 'No groups linked. Type !syncgroups or !setgroup in WhatsApp.' });
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
        
        res.json({ success: true, sentToCount: targetGroupIds.size });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// --- BACKGROUND ESCALATION LOOP ---
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

                let deadlineTime = parseInt(issue.deadline, 10);
                if (isNaN(deadlineTime) || deadlineTime <= 0) continue;

                if (deadlineTime < 10000000000) {
                    deadlineTime = deadlineTime * 1000;
                }

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
                    `❗ *PLEASE RESOLVE OR UPDATE IMMEDIATELY!*\n` +
                    `🔗 ${BASE_URL}/dashboard`;

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

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Notification API listening on port ${PORT}`);
});

startSock();
