/**
 * Telunas CampusFix - Baileys Auth State Housekeeping & Auto-Cleanup
 *
 * Safely prunes stale one-time pre-keys and dormant (>60 day) ephemeral encryption
 * keys (sessions, sender-keys, identity-keys, tctokens, device-lists, and non-staff
 * LID mappings) from the single-file SQLite auth database (or legacy multi-file JSONs),
 * while strictly preserving `creds`, `app-state-sync-*`, `sender-key-memory`,
 * the bot's own keys, and registered staff LID mappings.
 */

const fs = require('fs');
const path = require('path');
const { BufferJSON } = require('@whiskeysockets/baileys');
const {
    DB_FILENAME,
    CREDS_BACKUP_FILENAME,
    activeHandles,
    getAuthDbPath,
    openSqliteConnection,
    parseStorageKey,
} = require('./sqliteAuthState');

const DEFAULT_AUTH_DIR = path.resolve(__dirname, 'auth_info_baileys');
const DEFAULT_TTL_DAYS = 60;
const PREKEY_SAFE_BUFFER = 100;
const STALE_KEY_CATEGORIES = ['session', 'sender-key', 'identity-key', 'tctoken', 'device-list'];

let scheduleTimer = null;
let lastScheduledDay = null;

function sumPhysicalDirectoryStats(authDir) {
    const entries = fs.readdirSync(authDir);
    let totalFiles = 0;
    let totalBytes = 0;
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(authDir, entry);
        try {
            const stat = fs.statSync(fullPath);
            if (!stat.isFile()) continue;
            totalFiles++;
            totalBytes += stat.size;
            files.push({ name: entry, fullPath, size: stat.size, mtimeMs: stat.mtimeMs });
        } catch (statErr) {
            console.warn(`[Housekeeping] Could not stat file ${entry}:`, statErr.message);
        }
    }

    return { totalFiles, totalBytes, files };
}

function addIdentifierVariants(targetSet, rawValue) {
    if (rawValue === null || rawValue === undefined) return;
    const basePart = String(rawValue).split('@')[0].split(':')[0];
    const digits = basePart.replace(/[^0-9]/g, '');
    if (!digits || digits.length < 5) return;

    targetSet.add(digits);
    if (digits.startsWith('0')) {
        targetSet.add('62' + digits.slice(1));
    } else if (digits.startsWith('62')) {
        targetSet.add('0' + digits.slice(2));
    }
}

/**
 * Collects phone numbers and LIDs belonging to registered Telunas staff, device mappings,
 * and the bot itself so their `lid-mapping` records are never removed by TTL pruning.
 */
function loadProtectedIdentifiers(authDir, credsObj = null) {
    const protectedIds = new Set();
    const resolvedAuthDir = path.resolve(authDir);
    const botDir = path.dirname(resolvedAuthDir);

    if (credsObj?.me) {
        addIdentifierVariants(protectedIds, credsObj.me.id);
        addIdentifierVariants(protectedIds, credsObj.me.lid);
    }

    const staffPath = path.join(botDir, 'staff_phones.json');
    if (fs.existsSync(staffPath)) {
        try {
            const rawStaff = JSON.parse(fs.readFileSync(staffPath, 'utf8'));
            if (rawStaff && typeof rawStaff === 'object') {
                for (const [key, record] of Object.entries(rawStaff)) {
                    addIdentifierVariants(protectedIds, key);
                    if (record && typeof record === 'object') {
                        addIdentifierVariants(protectedIds, record.phone);
                        addIdentifierVariants(protectedIds, record.realPhone);
                        addIdentifierVariants(protectedIds, record.whatsapp_number);
                        addIdentifierVariants(protectedIds, record.lid);
                    }
                }
            }
        } catch (err) {
            console.warn('[Housekeeping] Could not read staff_phones.json for LID protection:', err.message);
        }
    }

    const deviceMapPath = path.join(botDir, 'device_mappings.json');
    if (fs.existsSync(deviceMapPath)) {
        try {
            const rawMap = JSON.parse(fs.readFileSync(deviceMapPath, 'utf8'));
            if (rawMap && typeof rawMap === 'object') {
                for (const [lidOrKey, phoneOrVal] of Object.entries(rawMap)) {
                    addIdentifierVariants(protectedIds, lidOrKey);
                    addIdentifierVariants(protectedIds, phoneOrVal);
                }
            }
        } catch (err) {
            console.warn('[Housekeeping] Could not read device_mappings.json for LID protection:', err.message);
        }
    }

    return protectedIds;
}

function isProtectedLidMapping(keyId, rawJsonValue, protectedIds) {
    if (!protectedIds || protectedIds.size === 0) return false;

    const candidateSet = new Set();
    addIdentifierVariants(candidateSet, String(keyId || '').replace(/_reverse$/i, ''));

    if (rawJsonValue !== null && rawJsonValue !== undefined) {
        try {
            const parsedVal = typeof rawJsonValue === 'string'
                ? JSON.parse(rawJsonValue, BufferJSON.reviver)
                : rawJsonValue;
            addIdentifierVariants(candidateSet, parsedVal);
        } catch (parseErr) {
            console.warn(`[Housekeeping] Failed parsing lid-mapping value for ${keyId}:`, parseErr.message);
            addIdentifierVariants(candidateSet, rawJsonValue);
        }
    }

    for (const candidate of candidateSet) {
        if (protectedIds.has(candidate)) {
            return true;
        }
    }
    return false;
}

function inspectSqliteAuthStats(authDir, db) {
    const physical = sumPhysicalDirectoryStats(authDir);
    let credsStatus = 'missing';

    try {
        const credsRow = db.prepare(`SELECT value FROM auth_meta WHERE key = 'creds'`).get();
        if (credsRow?.value) {
            const parsed = JSON.parse(credsRow.value, BufferJSON.reviver);
            credsStatus = parsed?.registered ? 'registered' : 'unregistered';
        }
    } catch (err) {
        console.warn('[Housekeeping] Could not parse creds in SQLite:', err.message);
        credsStatus = 'corrupted';
    }

    const breakdown = {};
    let totalKeys = 0;
    const rows = db.prepare(`
        SELECT category, COUNT(*) AS cnt
        FROM auth_keys
        GROUP BY category
    `).all();

    for (const row of rows) {
        const cnt = Number(row.cnt || 0);
        breakdown[row.category] = cnt;
        totalKeys += cnt;
    }

    return {
        exists: true,
        authDir,
        dbPath: getAuthDbPath(authDir),
        storageMode: 'sqlite',
        credsStatus,
        totalFiles: physical.totalFiles,
        totalKeys,
        totalSizeKB: Math.round(physical.totalBytes / 1024),
        totalSizeMB: Number((physical.totalBytes / (1024 * 1024)).toFixed(2)),
        breakdown,
    };
}

/**
 * Inspects and returns current statistics of the Baileys auth directory (SQLite or multi-file fallback).
 */
function getAuthFolderStats(authDir = DEFAULT_AUTH_DIR) {
    const resolvedDir = path.resolve(authDir);
    if (!fs.existsSync(resolvedDir)) {
        return {
            exists: false,
            authDir: resolvedDir,
            storageMode: 'none',
            credsStatus: 'missing',
            totalFiles: 0,
            totalKeys: 0,
            totalSizeKB: 0,
            totalSizeMB: 0,
            breakdown: {},
            lastCleanup: null,
        };
    }

    const dbPath = getAuthDbPath(resolvedDir);
    if (fs.existsSync(dbPath)) {
        const registered = activeHandles.get(dbPath);
        let db = registered?.db || null;
        const ownConnection = !db;

        try {
            if (!db) {
                db = openSqliteConnection(dbPath);
            }
            return inspectSqliteAuthStats(resolvedDir, db);
        } catch (err) {
            console.error('[Housekeeping] Error reading SQLite auth stats:', err.message);
            const physical = sumPhysicalDirectoryStats(resolvedDir);
            return {
                exists: true,
                authDir: resolvedDir,
                dbPath,
                storageMode: 'sqlite',
                credsStatus: 'error',
                totalFiles: physical.totalFiles,
                totalKeys: 0,
                totalSizeKB: Math.round(physical.totalBytes / 1024),
                totalSizeMB: Number((physical.totalBytes / (1024 * 1024)).toFixed(2)),
                breakdown: {},
                error: err.message,
            };
        } finally {
            if (ownConnection && db) {
                try {
                    db.close();
                } catch (closeErr) {
                    console.warn('[Housekeeping] Failed closing temporary stats SQLite handle:', closeErr.message);
                }
            }
        }
    }

    // Legacy multi-file JSON inspection fallback
    try {
        const physical = sumPhysicalDirectoryStats(resolvedDir);
        const breakdown = {};
        let totalKeys = 0;

        for (const fileInfo of physical.files) {
            const name = fileInfo.name;
            if (name === 'creds.json' || name === CREDS_BACKUP_FILENAME) continue;
            if (!name.endsWith('.json')) continue;
            const { category } = parseStorageKey(name.slice(0, -5));
            breakdown[category] = (breakdown[category] || 0) + 1;
            totalKeys++;
        }

        let credsStatus = 'missing';
        const credsFile = path.join(resolvedDir, 'creds.json');
        if (fs.existsSync(credsFile)) {
            try {
                const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
                credsStatus = creds?.registered ? 'registered' : 'unregistered';
            } catch (parseErr) {
                console.warn('[Housekeeping] Could not parse legacy creds.json:', parseErr.message);
                credsStatus = 'corrupted';
            }
        }

        return {
            exists: true,
            authDir: resolvedDir,
            storageMode: 'multifile',
            credsStatus,
            totalFiles: physical.totalFiles,
            totalKeys,
            totalSizeKB: Math.round(physical.totalBytes / 1024),
            totalSizeMB: Number((physical.totalBytes / (1024 * 1024)).toFixed(2)),
            breakdown,
        };
    } catch (err) {
        console.error('[Housekeeping] Error calculating auth folder stats:', err.message);
        return {
            exists: true,
            authDir: resolvedDir,
            storageMode: 'multifile',
            totalFiles: 0,
            totalKeys: 0,
            totalSizeKB: 0,
            totalSizeMB: 0,
            breakdown: {},
            error: err.message,
        };
    }
}

function cleanSqliteAuthDatabase(resolvedDir, dbPath, options) {
    const now = options.now;
    const ttlDays = options.ttlDays;
    const cutoffMs = now - (ttlDays * 24 * 60 * 60 * 1000);

    const registered = activeHandles.get(dbPath);
    let db = registered?.db || null;
    const ownConnection = !db;

    let beforePhysical;
    let beforeStats;
    let backupCreated = false;

    let deletedPreKeys = 0;
    let deletedLidMappings = 0;
    let deletedSessions = 0;
    let deletedSenderKeys = 0;
    let deletedIdentityKeys = 0;
    let deletedTcTokens = 0;
    let deletedDeviceLists = 0;
    let protectedLidSkipped = 0;
    let deletedPayloadBytes = 0;

    try {
        if (!db) {
            db = openSqliteConnection(dbPath);
        }

        const credsRow = db.prepare(`SELECT value FROM auth_meta WHERE key = 'creds'`).get();
        if (!credsRow?.value) {
            return {
                success: false,
                storageMode: 'sqlite',
                message: 'Data creds di SQLite tidak ditemukan. Pembersihan dibatalkan demi keamanan sesi.',
            };
        }

        let credsData;
        try {
            credsData = JSON.parse(credsRow.value, BufferJSON.reviver);
            if (!credsData || typeof credsData !== 'object') {
                throw new Error('Objek creds tidak valid.');
            }
        } catch (parseErr) {
            console.error('[Housekeeping] Gagal membaca metadata creds dari SQLite:', parseErr.message);
            return {
                success: false,
                storageMode: 'sqlite',
                message: 'Gagal membaca metadata sesi SQLite: ' + parseErr.message,
            };
        }

        // 1. Refresh emergency creds.json.bak before pruning
        const backupFile = path.join(resolvedDir, CREDS_BACKUP_FILENAME);
        try {
            fs.writeFileSync(backupFile, credsRow.value, 'utf8');
            backupCreated = true;
        } catch (backupErr) {
            console.error('[Housekeeping] Gagal membuat backup creds.json.bak:', backupErr.message);
            return {
                success: false,
                storageMode: 'sqlite',
                message: 'Gagal membuat cadangan creds.json.bak: ' + backupErr.message,
            };
        }

        beforePhysical = sumPhysicalDirectoryStats(resolvedDir);
        beforeStats = inspectSqliteAuthStats(resolvedDir, db);

        const nextPreKeyId = Number(credsData.firstUnuploadedPreKeyId || credsData.nextPreKeyId || 0);
        const minSafePreKeyId = Math.max(0, nextPreKeyId - PREKEY_SAFE_BUFFER);
        const protectedIds = loadProtectedIdentifiers(resolvedDir, credsData);

        const stalePreKeyRows = [];
        if (minSafePreKeyId > 0) {
            const preKeyRows = db.prepare(`
                SELECT storage_key, key_id, LENGTH(value) AS payload_bytes
                FROM auth_keys
                WHERE category = 'pre-key'
            `).all();

            for (const row of preKeyRows) {
                if (/^\d+$/.test(String(row.key_id))) {
                    const numId = parseInt(row.key_id, 10);
                    if (numId < minSafePreKeyId) {
                        stalePreKeyRows.push(row);
                    }
                }
            }
        }

        const staleEphemeralRows = db.prepare(`
            SELECT storage_key, category, LENGTH(value) AS payload_bytes
            FROM auth_keys
            WHERE category IN ('session', 'sender-key', 'identity-key', 'tctoken', 'device-list')
              AND updated_at < ?
        `).all(cutoffMs);

        const candidateLidRows = db.prepare(`
            SELECT storage_key, key_id, value, LENGTH(value) AS payload_bytes
            FROM auth_keys
            WHERE category = 'lid-mapping'
              AND updated_at < ?
        `).all(cutoffMs);

        const staleLidRows = [];
        for (const row of candidateLidRows) {
            if (isProtectedLidMapping(row.key_id, row.value, protectedIds)) {
                protectedLidSkipped++;
                continue;
            }
            staleLidRows.push(row);
        }

        const deleteKeyStmt = db.prepare(`DELETE FROM auth_keys WHERE storage_key = ?`);

        db.exec('BEGIN IMMEDIATE');
        try {
            for (const row of stalePreKeyRows) {
                const info = deleteKeyStmt.run(row.storage_key);
                if (Number(info?.changes || 0) > 0) {
                    deletedPreKeys++;
                    deletedPayloadBytes += Number(row.payload_bytes || 0);
                }
            }

            for (const row of staleEphemeralRows) {
                const info = deleteKeyStmt.run(row.storage_key);
                if (Number(info?.changes || 0) > 0) {
                    deletedPayloadBytes += Number(row.payload_bytes || 0);
                    if (row.category === 'session') deletedSessions++;
                    else if (row.category === 'sender-key') deletedSenderKeys++;
                    else if (row.category === 'identity-key') deletedIdentityKeys++;
                    else if (row.category === 'tctoken') deletedTcTokens++;
                    else if (row.category === 'device-list') deletedDeviceLists++;
                }
            }

            for (const row of staleLidRows) {
                const info = deleteKeyStmt.run(row.storage_key);
                if (Number(info?.changes || 0) > 0) {
                    deletedLidMappings++;
                    deletedPayloadBytes += Number(row.payload_bytes || 0);
                }
            }

            db.exec('COMMIT');
        } catch (txErr) {
            try {
                db.exec('ROLLBACK');
            } catch (rbErr) {
                console.error('[Housekeeping] Rollback failed during SQLite cleanup:', rbErr.message);
            }
            throw txErr;
        }

        const totalDeleted =
            deletedPreKeys +
            deletedLidMappings +
            deletedSessions +
            deletedSenderKeys +
            deletedIdentityKeys +
            deletedTcTokens +
            deletedDeviceLists;

        if (totalDeleted > 0) {
            try {
                db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
            } catch (vacErr) {
                console.warn('[Housekeeping] Could not VACUUM/checkpoint SQLite after cleanup:', vacErr.message);
            }
        }
    } catch (err) {
        console.error('[Housekeeping] Terjadi kesalahan saat pembersihan SQLite auth:', err.message);
        return {
            success: false,
            storageMode: 'sqlite',
            message: 'Terjadi kesalahan saat pembersihan SQLite: ' + err.message,
        };
    } finally {
        if (ownConnection && db) {
            try {
                db.close();
            } catch (closeErr) {
                console.warn('[Housekeeping] Failed closing temporary cleanup SQLite handle:', closeErr.message);
            }
        }
    }

    const totalDeleted =
        deletedPreKeys +
        deletedLidMappings +
        deletedSessions +
        deletedSenderKeys +
        deletedIdentityKeys +
        deletedTcTokens +
        deletedDeviceLists;

    const afterPhysical = sumPhysicalDirectoryStats(resolvedDir);
    const afterStats = getAuthFolderStats(resolvedDir);
    const physicalSavedBytes = Math.max(0, beforePhysical.totalBytes - afterPhysical.totalBytes);
    const freedKB = Math.round(physicalSavedBytes / 1024);
    const deletedPayloadKB = Math.round(deletedPayloadBytes / 1024);

    if (totalDeleted > 0) {
        console.log(
            `[Housekeeping] SQLite cleanup selesai (${ttlDays}d TTL): ${totalDeleted} key dihapus ` +
            `(pre-key: ${deletedPreKeys}, session: ${deletedSessions}, sender-key: ${deletedSenderKeys}, ` +
            `identity: ${deletedIdentityKeys}, tctoken: ${deletedTcTokens}, device-list: ${deletedDeviceLists}, ` +
            `lid-mapping: ${deletedLidMappings}, lid-staf dilindungi: ${protectedLidSkipped}). ` +
            `Total key: ${beforeStats.totalKeys} -> ${afterStats.totalKeys} (disk hemat ${freedKB} KB, payload ${deletedPayloadKB} KB).`
        );
    } else {
        console.log(
            `[Housekeeping] SQLite auth sudah bersih (${afterStats.totalKeys} key, ${afterStats.totalSizeKB} KB; ` +
            `0 key melebihi TTL ${ttlDays} hari, lid-staf dilindungi: ${protectedLidSkipped}).`
        );
    }

    return {
        success: true,
        storageMode: 'sqlite',
        dbFile: DB_FILENAME,
        backupCreated,
        ttlDays,
        totalDeleted,
        deletedPreKeys,
        deletedLidMappings,
        deletedSessions,
        deletedSenderKeys,
        deletedIdentityKeys,
        deletedTcTokens,
        deletedDeviceLists,
        protectedLidSkipped,
        deletedZeroByteFiles: 0,
        freedKB,
        deletedPayloadKB,
        filesBefore: beforeStats.totalFiles,
        filesAfter: afterStats.totalFiles,
        keysBefore: beforeStats.totalKeys,
        keysAfter: afterStats.totalKeys,
        currentStats: afterStats,
        message: totalDeleted > 0
            ? `Berhasil membersihkan ${totalDeleted} key sesi usang dari SQLite (${freedKB > 0 ? freedKB : deletedPayloadKB} KB dibebaskan).`
            : `Database sesi SQLite sudah bersih (${afterStats.totalKeys} key aktif). Tidak ada data >${ttlDays} hari yang perlu dihapus.`,
    };
}

function cleanLegacyMultiFileAuthFolder(resolvedDir, options) {
    const credsFile = path.join(resolvedDir, 'creds.json');
    if (!fs.existsSync(credsFile)) {
        return {
            success: false,
            storageMode: 'multifile',
            message: 'File creds.json tidak ditemukan. Pembersihan dibatalkan demi keamanan sesi.',
        };
    }

    const beforeStats = getAuthFolderStats(resolvedDir);

    const backupFile = path.join(resolvedDir, CREDS_BACKUP_FILENAME);
    let backupCreated = false;
    try {
        fs.copyFileSync(credsFile, backupFile);
        backupCreated = true;
    } catch (backupErr) {
        console.error('[Housekeeping] Gagal membuat backup creds.json:', backupErr.message);
        return {
            success: false,
            storageMode: 'multifile',
            message: 'Gagal membuat cadangan creds.json: ' + backupErr.message,
        };
    }

    let credsData;
    try {
        credsData = JSON.parse(fs.readFileSync(credsFile, 'utf8'), BufferJSON.reviver);
    } catch (parseErr) {
        console.error('[Housekeeping] Gagal membaca metadata pre-key dari creds.json:', parseErr.message);
        return {
            success: false,
            storageMode: 'multifile',
            message: 'Gagal membaca metadata sesi: ' + parseErr.message,
        };
    }

    const nextPreKeyId = Number(credsData.firstUnuploadedPreKeyId || credsData.nextPreKeyId || 0);
    const minSafePreKeyId = Math.max(0, nextPreKeyId - PREKEY_SAFE_BUFFER);
    const cutoffMs = options.now - (options.ttlDays * 24 * 60 * 60 * 1000);
    const protectedIds = loadProtectedIdentifiers(resolvedDir, credsData);

    let deletedPreKeys = 0;
    let deletedLidMappings = 0;
    let deletedSessions = 0;
    let deletedSenderKeys = 0;
    let deletedIdentityKeys = 0;
    let deletedTcTokens = 0;
    let deletedDeviceLists = 0;
    let deletedZeroByteFiles = 0;
    let protectedLidSkipped = 0;
    let deletedBytes = 0;

    try {
        const files = fs.readdirSync(resolvedDir);

        for (const file of files) {
            if (file === 'creds.json' || file === CREDS_BACKUP_FILENAME) continue;
            if (!file.endsWith('.json')) continue;
            if (file.startsWith('app-state-sync-') || file.startsWith('sender-key-memory-')) continue;

            const filePath = path.join(resolvedDir, file);
            let stat;
            try {
                stat = fs.statSync(filePath);
            } catch (statErr) {
                console.warn(`[Housekeeping] Tidak dapat mengakses stat ${file}:`, statErr.message);
                continue;
            }

            if (!stat.isFile()) continue;

            if (stat.size === 0) {
                try {
                    fs.unlinkSync(filePath);
                    deletedZeroByteFiles++;
                } catch (delErr) {
                    console.warn(`[Housekeeping] Gagal menghapus file kosong ${file}:`, delErr.message);
                }
                continue;
            }

            const { category, keyId } = parseStorageKey(file.slice(0, -5));

            if (category === 'pre-key' && /^\d+$/.test(keyId)) {
                const numericId = parseInt(keyId, 10);
                if (numericId < minSafePreKeyId) {
                    try {
                        deletedBytes += stat.size;
                        fs.unlinkSync(filePath);
                        deletedPreKeys++;
                    } catch (delErr) {
                        console.warn(`[Housekeeping] Gagal menghapus pre-key usang ${file}:`, delErr.message);
                    }
                }
                continue;
            }

            if (stat.mtimeMs >= cutoffMs) continue;

            if (category === 'lid-mapping') {
                let rawVal = null;
                try {
                    rawVal = fs.readFileSync(filePath, 'utf8');
                } catch (readErr) {
                    console.warn(`[Housekeeping] Gagal membaca lid-mapping ${file}:`, readErr.message);
                }
                if (isProtectedLidMapping(keyId, rawVal, protectedIds)) {
                    protectedLidSkipped++;
                    continue;
                }
                try {
                    deletedBytes += stat.size;
                    fs.unlinkSync(filePath);
                    deletedLidMappings++;
                } catch (delErr) {
                    console.warn(`[Housekeeping] Gagal menghapus LID mapping usang ${file}:`, delErr.message);
                }
                continue;
            }

            if (STALE_KEY_CATEGORIES.includes(category)) {
                try {
                    deletedBytes += stat.size;
                    fs.unlinkSync(filePath);
                    if (category === 'session') deletedSessions++;
                    else if (category === 'sender-key') deletedSenderKeys++;
                    else if (category === 'identity-key') deletedIdentityKeys++;
                    else if (category === 'tctoken') deletedTcTokens++;
                    else if (category === 'device-list') deletedDeviceLists++;
                } catch (delErr) {
                    console.warn(`[Housekeeping] Gagal menghapus key usang ${file}:`, delErr.message);
                }
            }
        }

        const afterStats = getAuthFolderStats(resolvedDir);
        const totalDeleted =
            deletedPreKeys +
            deletedLidMappings +
            deletedSessions +
            deletedSenderKeys +
            deletedIdentityKeys +
            deletedTcTokens +
            deletedDeviceLists +
            deletedZeroByteFiles;
        const freedKB = Math.round(deletedBytes / 1024);

        console.log(
            `[Housekeeping] Pembersihan selesai: ${totalDeleted} file dihapus (${freedKB} KB dibebaskan). Total file: ${beforeStats.totalFiles} -> ${afterStats.totalFiles}`
        );

        return {
            success: true,
            storageMode: 'multifile',
            backupCreated,
            ttlDays: options.ttlDays,
            totalDeleted,
            deletedPreKeys,
            deletedLidMappings,
            deletedSessions,
            deletedSenderKeys,
            deletedIdentityKeys,
            deletedTcTokens,
            deletedDeviceLists,
            protectedLidSkipped,
            deletedZeroByteFiles,
            freedKB,
            filesBefore: beforeStats.totalFiles,
            filesAfter: afterStats.totalFiles,
            keysBefore: beforeStats.totalKeys,
            keysAfter: afterStats.totalKeys,
            currentStats: afterStats,
            message: totalDeleted > 0
                ? `Berhasil membersihkan ${totalDeleted} file usang (${freedKB} KB dibebaskan).`
                : `Folder sesi sudah bersih. Tidak ada file >${options.ttlDays} hari yang perlu dihapus.`,
        };
    } catch (err) {
        console.error('[Housekeeping] Terjadi kesalahan saat pembersihan auth folder:', err.message);
        return {
            success: false,
            storageMode: 'multifile',
            message: 'Terjadi kesalahan saat pembersihan: ' + err.message,
        };
    }
}

/**
 * Cleans expired pre-keys and dormant (>60d) ephemeral Signal keys & non-staff LID mappings.
 * ALWAYS backs up creds first and preserves `creds`, `app-state-sync-*`, and staff LIDs.
 */
function cleanAuthFolder(options = {}) {
    const resolvedDir = path.resolve(options.authDir || DEFAULT_AUTH_DIR);
    if (!fs.existsSync(resolvedDir)) {
        return {
            success: false,
            message: 'Direktori auth_info_baileys tidak ditemukan.',
        };
    }

    const parsedTtl = Number(options.ttlDays);
    const ttlDays = Number.isFinite(parsedTtl) && parsedTtl > 0 ? parsedTtl : DEFAULT_TTL_DAYS;
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const normalizedOptions = {
        authDir: resolvedDir,
        ttlDays,
        now,
    };

    const dbPath = getAuthDbPath(resolvedDir);
    if (fs.existsSync(dbPath)) {
        return cleanSqliteAuthDatabase(resolvedDir, dbPath, normalizedOptions);
    }

    return cleanLegacyMultiFileAuthFolder(resolvedDir, normalizedOptions);
}

/**
 * Sets up a background schedule that checks every hour.
 * Fires cleanAuthFolder() automatically at 03:00 AM once per day.
 */
function setupHousekeepingSchedule(options = {}) {
    if (scheduleTimer) {
        return scheduleTimer;
    }

    const resolvedDir = path.resolve(options.authDir || DEFAULT_AUTH_DIR);
    const onCleanup = typeof options.onCleanup === 'function' ? options.onCleanup : null;

    scheduleTimer = setInterval(() => {
        try {
            const d = new Date();
            const currentHour = d.getHours();
            const todayStr = d.toDateString();

            if (currentHour === 3 && lastScheduledDay !== todayStr) {
                lastScheduledDay = todayStr;
                console.log('[Housekeeping] Menjalankan pembersihan berkala otomatis (Pukul 03:00 AM)...');
                const result = cleanAuthFolder({ authDir: resolvedDir });
                if (onCleanup) {
                    Promise.resolve(onCleanup(result)).catch((cbErr) => {
                        console.error('[Housekeeping] Error in scheduled onCleanup callback:', cbErr.message);
                    });
                }
            }
        } catch (schedErr) {
            console.error('[Housekeeping] Error in scheduled cleanup loop:', schedErr.message);
        }
    }, 60 * 60 * 1000);

    return scheduleTimer;
}

module.exports = {
    DEFAULT_TTL_DAYS,
    PREKEY_SAFE_BUFFER,
    STALE_KEY_CATEGORIES,
    loadProtectedIdentifiers,
    isProtectedLidMapping,
    getAuthFolderStats,
    cleanAuthFolder,
    setupHousekeepingSchedule,
};
