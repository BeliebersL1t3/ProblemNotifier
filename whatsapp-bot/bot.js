const { makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const FormData = require('form-data');
const express = require('express');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const app = express();
app.use(express.json());

const userStates = new Map();
let linkedGroupId = null;

try {
    if (fs.existsSync('config.json')) {
        linkedGroupId = JSON.parse(fs.readFileSync('config.json')).groupId;
        console.log(`Loaded linked group ID: ${linkedGroupId}`);
    }
} catch (e) {
    console.error("Could not load config.json:", e);
}

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
};

const DEPARTMENTS = [
    'Engineer', 'Tekong', 'Pest Control', 'Security', 'Fasilitas', 
    'HK', 'F&B', 'Service', 'Bar', 'GR', 'Spa', 'TiRek', 'OE', 
    'IT', 'Procurement', 'Sales/Marketing', 'Reservasi', 'Finance'
];

const CORE_CATEGORIES = ['broken items', 'plumbing', 'electrical'];
const CORE_DISPLAY = {
    '1': 'Broken items',
    '2': 'Plumbing',
    '3': 'Electrical',
    '4': 'Other'
};

async function getCustomCategories() {
    try {
        const res = await axios.get('http://TelunasIssueTracker.test/api/categories');
        if (res.data && res.data.success) {
            const catMap = {};
            let i = 1;
            for (const cat of res.data.data) {
                // Skip defaults, or include them?
                // The bot currently expects ONLY custom categories to be added here.
                const catLower = cat.id.toLowerCase();
                if (!CORE_CATEGORIES.includes(catLower) && catLower !== 'other') {
                    catMap[i.toString()] = cat.label;
                    i++;
                }
            }
            return catMap;
        }
    } catch (e) {
        console.error("Failed to fetch custom categories:", e.message);
    }
    return {};
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
                if (text.toLowerCase() === '!setgroup') {
                    linkedGroupId = from;
                    fs.writeFileSync('config.json', JSON.stringify({ groupId: from }));
                    await reply('âœ… This group has been successfully linked! I will now send all Telunas Resort notifications here.');
                } else if (text.toLowerCase().startsWith('!claim ')) {
                    const takerName = text.substring(7).trim();
                    
                    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    const quotedText = quotedMsg?.conversation || quotedMsg?.imageMessage?.caption || quotedMsg?.extendedTextMessage?.text;

                    if (!quotedText) {
                        await reply('Please reply directly to an issue notification to claim it.');
                        continue;
                    }
                    
                    const idMatch = quotedText.match(/ID:\s*\*?\s*(\d+)/i);
                    if (!idMatch) {
                        await reply('Could not find the Issue ID in the message you replied to. Please make sure you reply to a new issue notification.');
                        continue;
                    }
                    
                    const issueId = idMatch[1];
                    try {
                        const getRes = await axios.get('http://TelunasIssueTracker.test/api/issues');
                        if (!getRes.data.success) throw new Error("Failed to fetch issues");
                        
                        const issue = getRes.data.data.find(i => i.id === issueId);
                        if (!issue) {
                            await reply(`Could not find issue ${issueId} in the database.`);
                            continue;
                        }
                        
                        if (issue.status.toLowerCase() === 'solved' || issue.status.toLowerCase() === 'resolved') {
                            await reply(`âŒ This issue (${issueId}) has already been solved! It cannot be claimed or modified.`);
                            continue;
                        }
                        
                        const claimRes = await axios.post(`http://TelunasIssueTracker.test/api/issues/${issue.rowIndex}/claim`, {
                            taker: takerName + " (via WhatsApp)"
                        });
                        
                        if (claimRes.data.success) {
                            await reply(`✅ Issue ${issueId} claimed successfully by ${takerName}!`);
                        } else {
                            await reply(`❌ Failed to claim issue.`);
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
            let state = userStates.get(stateKey) || { step: STEPS.IDLE, data: {} };

            if (text.toLowerCase() === 'cancel' || text.toLowerCase() === 'reset' || text.toLowerCase() === 'batal') {
                userStates.delete(stateKey);
                await reply('Operation cancelled. You can type keywords like "mau lapor" to report an issue, or "sudah diperbaiki" to resolve one.');
                continue;
            }

            if (state.step === STEPS.IDLE) {
                const lowerText = text.toLowerCase();
                
                // Keyword lists for intent detection
                const reportKeywords = ['!report', 'report', 'lapor', 'rusak', 'ada masalah', 'bocor', 'patah', 'mati'];
                const solveKeywords = ['!solve', 'solve', 'perbaiki', 'diperbaiki', 'sudah bener', 'selesai', 'fix', 'udah'];
                const sosKeywords = ['!sos', 'sos', 'emergency', 'urgent', 'help'];
                const pendingKeywords = ['!pending', 'pending', 'tunda', 'delay', 'masalah'];
                const statusKeywords = ['!status', '!issues'];
                
                let intent = 'UNKNOWN';
                
                if (sosKeywords.some(kw => lowerText.includes(kw))) {
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

                if (intent === 'SOS') {
                    await reply('🚨 EMERGENCY MODE ACTIVATED 🚨\n\nFirst, what is your name?');
                    userStates.set(stateKey, { step: STEPS.SOS_AWAITING_NAME, data: {} });
                } else if (intent === 'REPORT') {
                    await reply('Welcome to the Telunas Resort Issue Tracker! Let\'s report an issue.\n\nFirst, what is your name?');
                    userStates.set(stateKey, { step: STEPS.AWAITING_NAME, data: {} });
                } else if (intent === 'SOLVE') {
                    await reply('Great! Please provide the Issue ID you want to resolve (e.g., 1785995410):');
                    userStates.set(stateKey, { step: STEPS.AWAITING_SOLVE_ID, data: {} });
                } else if (intent === 'PENDING') {
                    await reply('You want to mark a job as Pending. Please provide the Issue ID (e.g., 1785995410):');
                    userStates.set(stateKey, { step: STEPS.AWAITING_PENDING_ID, data: {} });
                } else if (intent === 'STATUS') {
                    let deptMsg = 'Please reply with the number of the department to check, or type "all":\n';
                    DEPARTMENTS.forEach((d, idx) => {
                        deptMsg += `${idx + 1}. ${d}\n`;
                    });
                    await reply(deptMsg.trim());
                    userStates.set(stateKey, { step: STEPS.STATUS_AWAITING_DEPT, data: {} });
                }
                
                // If UNKNOWN, silently ignore so it doesn't disturb normal chats
                continue;
            }

            // --- SOS FAST-TRACK FLOW ---
            if (state.step === STEPS.SOS_AWAITING_NAME) {
                state.data.reporter = text + " (via WhatsApp)";
                await reply(`Thanks, ${text}. What is the emergency?`);
                state.step = STEPS.SOS_AWAITING_TITLE;
                continue;
            }

            if (state.step === STEPS.SOS_AWAITING_TITLE) {
                state.data.title = text;
                await reply('Where are you located right now?');
                state.step = STEPS.SOS_AWAITING_LOC;
                continue;
            }

            if (state.step === STEPS.SOS_AWAITING_LOC) {
                state.data.location = text;
                
                try {
                    await reply('🚨 Submitting emergency report immediately... please wait.');

                    const formData = new FormData();
                    formData.append('title', state.data.title);
                    formData.append('description', '[EMERGENCY FAST-TRACK]');
                    formData.append('location', state.data.location);
                    formData.append('category', 'emergency');
                    formData.append('department', 'Security');
                    formData.append('taggedDepartments', 'Security');
                    formData.append('reporter', state.data.reporter);
                    formData.append('priority', 'critical');
                    formData.append('deadline', Date.now().toString());
                    // NO IMAGE APPENDED!

                    const res = await axios.post('http://TelunasIssueTracker.test/api/issues', formData, {
                        headers: formData.getHeaders()
                    });

                    if (res.data.success) {
                        await reply('✅ Emergency reported successfully! The team has been alerted.');
                    } else {
                        await reply('❌ Failed to report emergency. Please try again or seek help directly.');
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
                await reply(`Thanks, ${text}. What is the title of the issue? (e.g., Broken lab door handle)`);
                state.step = STEPS.AWAITING_TITLE;
                continue;
            }

            if (state.step === STEPS.AWAITING_TITLE) {
                state.data.title = text;
                await reply('Got it. Please describe the problem in a few words.');
                state.step = STEPS.AWAITING_DESC;
                continue;
            }

            if (state.step === STEPS.AWAITING_DESC) {
                state.data.description = text;
                await reply('Where is this located? (e.g., Engineering Block B)');
                state.step = STEPS.AWAITING_LOC;
                continue;
            }

            if (state.step === STEPS.AWAITING_LOC) {
                state.data.location = text;
                
                let deptMenu = 'Great. What department is this issue originating from? Reply with the number:\n';
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
                    await reply('Invalid selection. Please reply with a valid number from the list.');
                    continue;
                }
                
                state.data.department = DEPARTMENTS[idx];
                
                let tagMenu = 'Which departments are responsible for fixing this? You can select multiple by separating with spaces (e.g., "1 14 15"):\n';
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
                    await reply('Invalid selection. Please reply with at least one valid number from the list (e.g. "1" or "1 2").');
                    continue;
                }
                
                state.data.taggedDepartments = selectedTags.join(', ');
                
                let categoryMenu = 'Almost done! Please select a category by replying with the number:\n';
                for (const [key, val] of Object.entries(CORE_DISPLAY)) {
                    categoryMenu += `${key}. ${val}\n`;
                }
                
                await reply(categoryMenu.trim());
                state.step = STEPS.AWAITING_CAT;
                continue;
            }

            if (state.step === STEPS.AWAITING_CAT) {
                if (!CORE_DISPLAY[text]) {
                    await reply('Invalid selection. Please reply with a valid number (1-4).');
                    continue;
                }
                
                if (text === '4') { // Other
                    const customCats = await getCustomCategories();
                    state.data.catMap = customCats;
                    
                    let otherMenu = 'Here are the other available categories:\n';
                    let nextIndex = 1;
                    for (const [key, val] of Object.entries(customCats)) {
                        otherMenu += `${key}. ${val}\n`;
                        nextIndex++;
                    }
                    otherMenu += `${nextIndex}. \u2795 Create New Category\n`;
                    state.data.createNewIndex = nextIndex.toString();
                    
                    await reply(otherMenu.trim());
                    state.step = STEPS.AWAITING_CAT_OTHER;
                    continue;
                }

                state.data.category = CORE_DISPLAY[text].toLowerCase();
                await reply('Got it. What is the priority of this issue? Reply with the number:\n1. Low\n2. Medium\n3. High\n4. 🚨 Critical');
                state.step = STEPS.AWAITING_PRIORITY;
                continue;
            }
            
            if (state.step === STEPS.AWAITING_CAT_OTHER) {
                if (text === state.data.createNewIndex) {
                    await reply('Please type the name of your new category:');
                    state.step = STEPS.AWAITING_CAT_CUSTOM;
                    continue;
                }
                
                const customCats = state.data.catMap;
                if (!customCats[text]) {
                    await reply('Invalid selection. Please reply with a valid number.');
                    continue;
                }
                
                state.data.category = customCats[text].toLowerCase();
                await reply('Got it. What is the priority of this issue? Reply with the number:\n1. Low\n2. Medium\n3. High\n4. 🚨 Critical');
                state.step = STEPS.AWAITING_PRIORITY;
                continue;
            }
            
            if (state.step === STEPS.AWAITING_CAT_CUSTOM) {
                if (text.length < 2) {
                    await reply('Category name too short. Please try again.');
                    continue;
                }
                state.data.category = text.trim();
                await reply(`Got it, added category "${state.data.category}". What is the priority of this issue? Reply with the number:\n1. Low\n2. Medium\n3. High\n4. 🚨 Critical`);
                state.step = STEPS.AWAITING_PRIORITY;
                continue;
            }

            if (state.step === STEPS.AWAITING_PRIORITY) {
                const priorityMap = { '1': 'low', '2': 'medium', '3': 'high', '4': 'critical' };
                if (!priorityMap[text]) {
                    await reply('Invalid selection. Please reply with a valid number (1-4).');
                    continue;
                }
                
                state.data.priority = priorityMap[text];
                if (state.data.priority === 'critical') {
                    await reply('🚨 Critical Priority selected. How much time do we have to fix this? Reply with the number:\n1. NOW\n2. 15 Minutes\n3. 30 Minutes\n4. 1 Hour\n5. 2 Hours');
                    state.step = STEPS.AWAITING_CRITICAL_TIME;
                } else {
                    await reply('Great. Finally, please upload a photo of the problem as proof. (Send an image here)');
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

                    const res = await axios.post('http://TelunasIssueTracker.test/api/issues', formData, {
                        headers: formData.getHeaders()
                    });

                    if (res.data.success) {
                        await reply('âœ… Issue reported successfully! You can track it on the dashboard.');
                    } else {
                        await reply('âŒ Failed to report issue. Please try again later.');
                    }
                } catch (err) {
                    console.error("API Error:", err.response ? err.response.data : err.message);
                    const errorMessage = err.response?.data?.message || err.message;
                    await reply(`âŒ Display Error: ${errorMessage}`);
                }
                
                userStates.delete(stateKey);
                continue;
            }

            // --- SOLVING FLOW ---
            if (state.step === STEPS.AWAITING_SOLVE_ID) {
                let queryId = text.trim();
                
                try {
                    const getRes = await axios.get('http://TelunasIssueTracker.test/api/issues');
                    if (getRes.data && getRes.data.success) {
                        const issue = getRes.data.data.find(i => i.id === queryId);
                        if (!issue) {
                            await reply(`âŒ Could not find issue ${queryId} in the database. Please try again or type "batal" to cancel.`);
                            continue;
                        }
                        if (issue.status.toLowerCase() === 'solved' || issue.status.toLowerCase() === 'resolved') {
                            await reply(`âŒ This issue (${queryId}) has already been solved! You cannot modify it. Type "batal" to exit or provide a different ID.`);
                            continue;
                        }
                    }
                } catch (e) {
                    console.error("Validation error:", e.message);
                }

                state.data.issueId = queryId;
                await reply('What is your name? (Solver Name)');
                state.step = STEPS.AWAITING_SOLVE_NAME;
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
                    const getRes = await axios.get('http://TelunasIssueTracker.test/api/issues');
                    if (!getRes.data.success) throw new Error("Failed to fetch issues");
                    
                    const issue = getRes.data.data.find(i => i.id === state.data.issueId);
                    if (!issue) {
                        await reply(`âŒ Could not find issue ${state.data.issueId} in the database.`);
                        userStates.delete(stateKey);
                        continue;
                    }

                    const formData = new FormData();
                    formData.append('solver', state.data.solverName);
                    formData.append('fixDescription', state.data.fixDescription);
                    formData.append('proofImage', buffer, { filename: 'proof.jpg', contentType: 'image/jpeg' });

                    const res = await axios.post(`http://TelunasIssueTracker.test/api/issues/${issue.rowIndex}/resolve`, formData, {
                        headers: formData.getHeaders()
                    });

                    if (res.data.success) {
                        await reply('âœ… Issue resolved successfully! The dashboard and group have been updated.');
                    } else {
                        await reply('âŒ Failed to resolve issue.');
                    }
                } catch (err) {
                    console.error("API Error:", err.response ? err.response.data : err.message);
                    const errorMessage = err.response?.data?.message || err.message;
                    await reply(`âŒ API Error: ${errorMessage}`);
                }
                
                userStates.delete(stateKey);
                continue;
            }

            // --- PENDING FLOW ---
            if (state.step === STEPS.AWAITING_PENDING_ID) {
                let queryId = text.trim();
                
                try {
                    const getRes = await axios.get('http://TelunasIssueTracker.test/api/issues');
                    if (getRes.data && getRes.data.success) {
                        const issue = getRes.data.data.find(i => i.id === queryId);
                        if (!issue) {
                            await reply(`❌ Could not find issue ${queryId} in the database. Please try again or type "batal" to cancel.`);
                            continue;
                        }
                        if (issue.status.toLowerCase() !== 'progress') {
                            await reply(`❌ This issue (${queryId}) is not currently "In Progress". Only active jobs can be marked pending!`);
                            continue;
                        }
                    }
                } catch (e) {
                    console.error("Validation error:", e.message);
                }

                state.data.issueId = queryId;
                await reply('What is your name? (Worker Name)');
                state.step = STEPS.AWAITING_PENDING_NAME;
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

                    const getRes = await axios.get('http://TelunasIssueTracker.test/api/issues');
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

                    const res = await axios.post(`http://TelunasIssueTracker.test/api/issues/${issue.rowIndex}/pending`, formData, {
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
                let idx = 1;
                const catArray = [];
                
                CORE_CATEGORIES.forEach(c => {
                    catMsg += `${idx}. ${c.charAt(0).toUpperCase() + c.slice(1)}\n`;
                    catArray.push(c);
                    idx++;
                });

                const customCats = await getCustomCategories();
                for (const val of Object.values(customCats)) {
                    catMsg += `${idx}. ${val}\n`;
                    catArray.push(val.toLowerCase());
                    idx++;
                }
                
                catMsg += "\nReply with a number, type the name, or type 'all':";
                await reply(catMsg);
                
                state.data.catArray = catArray;
                state.step = STEPS.STATUS_AWAITING_CAT;
                continue;
            }

            if (state.step === STEPS.STATUS_AWAITING_CAT) {
                const lowerText = text.toLowerCase().trim();
                const catArray = state.data.catArray || CORE_CATEGORIES;
                
                if (lowerText === 'all') {
                    state.data.category = 'all';
                } else {
                    const idx = parseInt(lowerText) - 1;
                    if (!isNaN(idx) && idx >= 0 && idx < catArray.length) {
                        state.data.category = catArray[idx];
                    } else {
                        state.data.category = lowerText; // Fallback to raw text if they typed something custom
                    }
                }
                
                try {
                    await reply('Fetching active issues... Please wait.');
                    const res = await axios.get('http://TelunasIssueTracker.test/api/issues');
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

// --- EXPRESS SERVER FOR NOTIFICATIONS ---
app.post('/notify', async (req, res) => {
    try {
        const { message, imageUrl } = req.body;
        
        if (!linkedGroupId) {
            return res.status(400).json({ error: 'No group linked. Send !setgroup in a WhatsApp group first.' });
        }

        if (!globalSock) {
            return res.status(500).json({ error: 'Socket not initialized.' });
        }

        if (imageUrl) {
            await globalSock.sendMessage(linkedGroupId, { 
                image: { url: imageUrl }, 
                caption: message 
            });
        } else {
            await globalSock.sendMessage(linkedGroupId, { text: message });
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// --- BACKGROUND ESCALATION LOOP ---
// Tracks when each issue was LAST alerted so we can re-alert every 5 minutes
const lastAlertedAt = new Map();

setInterval(async () => {
    if (!linkedGroupId || !globalSock) return;
    try {
        const res = await axios.get('http://TelunasIssueTracker.test/api/issues');
        if (res.data && res.data.success) {
            const issues = res.data.data;
            const now = Date.now();
            const REPEAT_INTERVAL_MS = 5 * 60 * 1000; // Re-alert every 5 minutes
            const GRACE_PERIOD_MS    = 60 * 1000;      // 60s grace after deadline to avoid double-ping on submit

            for (const issue of issues) {
                // Alert if: critical + has deadline + not yet solved/pending + deadline passed
                const isUnresolved = issue.status === 'open' || issue.status === 'progress';
                if (!isUnresolved || issue.priority !== 'critical' || !issue.deadline) continue;

                const deadlineTime = parseInt(issue.deadline);
                if (now < deadlineTime + GRACE_PERIOD_MS) continue; // Not yet past deadline

                const lastAlert = lastAlertedAt.get(issue.id) || 0;
                if (now - lastAlert < REPEAT_INTERVAL_MS) continue; // Too soon to re-alert

                lastAlertedAt.set(issue.id, now);

                const overdueMins = Math.floor((now - deadlineTime) / 60000);
                const overdueStr  = overdueMins <= 0 ? 'just now' : `${overdueMins} minute${overdueMins !== 1 ? 's' : ''} ago`;
                const statusLabel = issue.status === 'progress' ? '🔧 In Progress (NOT YET RESOLVED)' : '⚠️ Unclaimed';

                const msg = `🚨 *OVERDUE CRITICAL ISSUE!* 🚨\n\nThis issue has breached its time limit and is still unresolved!\n\n*Title:* ${issue.title}\n*Location:* ${issue.location}\n*Reporter:* ${issue.reporter}\n*Status:* ${statusLabel}\n*Deadline passed:* ${overdueStr}\n*ID:* ${issue.id}\n\n*PLEASE RESOLVE OR ESCALATE IMMEDIATELY!*\n🔗 ${process.env.APP_URL || 'http://telunasissuetracker.test'}/dashboard`;

                if (issue.imageUrl) {
                    await globalSock.sendMessage(linkedGroupId, {
                        image: { url: issue.imageUrl },
                        caption: msg
                    });
                } else {
                    await globalSock.sendMessage(linkedGroupId, { text: msg });
                }
            }

            // Clean up resolved issues from tracking map to free memory
            for (const [id] of lastAlertedAt) {
                const found = issues.find(i => i.id === id);
                if (!found || (found.status !== 'open' && found.status !== 'progress')) {
                    lastAlertedAt.delete(id);
                }
            }
        }
    } catch (e) {
        console.error("Escalation loop error:", e.message);
    }
}, 30000); // Check every 30 seconds

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Notification API listening on port ${PORT}`);
});

startSock();
