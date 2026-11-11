/**
 * Telunas CampusFix - Single-File SQLite Auth State for Baileys
 *
 * Replaces `useMultiFileAuthState` (1,500+ loose JSON files) with a single
 * crash-safe SQLite database powered by Node.js built-in `node:sqlite`
 * (`DatabaseSync`), complete with automatic one-time migration from legacy
 * `auth_info_baileys/*.json` files without requiring a QR re-scan.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');

const DB_FILENAME = 'baileys_auth.sqlite';
const CREDS_BACKUP_FILENAME = 'creds.json.bak';

// Ordered longest-prefix-first so parsing legacy JSON filenames is exact.
const KNOWN_KEY_CATEGORIES = [
    'app-state-sync-version',
    'app-state-sync-key',
    'sender-key-memory',
    'identity-key',
    'lid-mapping',
    'device-list',
    'sender-key',
    'pre-key',
    'session',
    'tctoken',
];

// Per-process registry of active DB connections so in-process housekeeping and socket resets
// share/close the exact same handle cleanly without Windows EBUSY / SQLITE_BUSY locks.
const activeHandles = new Map();

/**
 * Matches Baileys' `fixFileName` normalization for keys with slashes or colons.
 */
function fixKeyComponent(raw) {
    return String(raw || '').replace(/\//g, '__').replace(/:/g, '-');
}

function makeStorageKey(category, id) {
    return fixKeyComponent(`${category}-${id}`);
}

/**
 * Splits a normalized storage key (without `.json`) into `{ category, keyId }`.
 */
function parseStorageKey(storageKey) {
    for (const category of KNOWN_KEY_CATEGORIES) {
        const prefix = `${category}-`;
        if (storageKey.startsWith(prefix)) {
            return {
                category,
                keyId: storageKey.slice(prefix.length),
            };
        }
    }

    const dashIdx = storageKey.indexOf('-');
    if (dashIdx > 0) {
        return {
            category: storageKey.slice(0, dashIdx),
            keyId: storageKey.slice(dashIdx + 1),
        };
    }

    return {
        category: 'other',
        keyId: storageKey,
    };
}

function getAuthDbPath(authDir = path.resolve(__dirname, 'auth_info_baileys')) {
    return path.join(path.resolve(authDir), DB_FILENAME);
}

function configureSqliteConnection(db) {
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA busy_timeout = 5000;
    `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS auth_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auth_keys (
            storage_key TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            key_id TEXT NOT NULL,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_auth_keys_cat_updated
            ON auth_keys (category, updated_at);
    `);
}

function openSqliteConnection(dbPath) {
    const db = new DatabaseSync(dbPath);
    configureSqliteConnection(db);
    return db;
}

function safeWriteCredsBackup(authDir, serializedCreds) {
    const backupPath = path.join(authDir, CREDS_BACKUP_FILENAME);
    try {
        fs.writeFileSync(backupPath, serializedCreds, 'utf8');
        return true;
    } catch (err) {
        console.warn('[SQLiteAuth] Failed writing creds.json.bak:', err.message);
        return false;
    }
}

function parseJsonWithBufferReviver(rawText) {
    return JSON.parse(rawText, BufferJSON.reviver);
}

function serializeWithBufferReplacer(obj) {
    return JSON.stringify(obj, BufferJSON.replacer);
}

/**
 * Safely imports existing `useMultiFileAuthState` JSON files inside `authDir` into SQLite
 * inside a single atomic transaction. Verifies DB integrity before deleting legacy JSONs.
 */
function migrateLegacyJsonFilesIfNeeded(db, authDir) {
    const files = fs.readdirSync(authDir);
    const jsonFiles = files.filter((file) => {
        if (!file.endsWith('.json')) return false;
        if (file === CREDS_BACKUP_FILENAME) return false;
        return true;
    });

    if (jsonFiles.length === 0) {
        return { migrated: false, importedKeys: 0, deletedFiles: 0, skippedCorrupt: 0 };
    }

    const existingCredsRow = db.prepare(`SELECT value FROM auth_meta WHERE key = 'creds'`).get();
    const existingMigratedFlag = db.prepare(`SELECT value FROM auth_meta WHERE key = 'legacy_migrated'`).get();

    // Already migrated cleanly earlier, only leftover JSONs remain (rare recovery case)
    if (existingCredsRow && existingMigratedFlag?.value === '1') {
        let deletedLeftovers = 0;
        for (const file of jsonFiles) {
            try {
                fs.unlinkSync(path.join(authDir, file));
                deletedLeftovers++;
            } catch (unlinkErr) {
                console.warn(`[SQLiteAuth] Could not delete leftover legacy file ${file}:`, unlinkErr.message);
            }
        }
        return { migrated: false, importedKeys: 0, deletedFiles: deletedLeftovers, skippedCorrupt: 0 };
    }

    // Attempt to read valid creds from creds.json (or creds.json.bak if creds.json is damaged)
    let serializedCreds = null;
    const credsCandidates = [
        path.join(authDir, 'creds.json'),
        path.join(authDir, CREDS_BACKUP_FILENAME),
    ];

    for (const candidate of credsCandidates) {
        if (!fs.existsSync(candidate)) continue;
        try {
            const raw = fs.readFileSync(candidate, 'utf8');
            if (!raw || !raw.trim()) continue;
            const parsed = parseJsonWithBufferReviver(raw);
            if (parsed && typeof parsed === 'object') {
                serializedCreds = serializeWithBufferReplacer(parsed);
                break;
            }
        } catch (err) {
            console.warn(`[SQLiteAuth] Invalid creds candidate (${path.basename(candidate)}):`, err.message);
        }
    }

    // If SQLite doesn't have creds and no valid creds file exists on disk, do NOT destroy anything;
    // let empty creds initialize normally unless key files shouldn't be orphaned.
    if (!existingCredsRow && !serializedCreds && files.includes('creds.json')) {
        console.warn('[SQLiteAuth] creds.json exists but could not be parsed cleanly; aborting destructive cleanup.');
        return { migrated: false, importedKeys: 0, deletedFiles: 0, skippedCorrupt: 1 };
    }

    const keyFiles = jsonFiles.filter((file) => file !== 'creds.json');
    const recordsToInsert = [];
    let skippedCorrupt = 0;

    for (const file of keyFiles) {
        const fullPath = path.join(authDir, file);
        let stat;
        try {
            stat = fs.statSync(fullPath);
        } catch (statErr) {
            console.warn(`[SQLiteAuth] Could not stat ${file} during migration:`, statErr.message);
            continue;
        }

        if (!stat.isFile() || stat.size === 0) {
            skippedCorrupt++;
            continue;
        }

        try {
            const raw = fs.readFileSync(fullPath, 'utf8');
            const parsed = parseJsonWithBufferReviver(raw);
            const storageKey = file.slice(0, -5); // remove ".json"
            const { category, keyId } = parseStorageKey(storageKey);
            recordsToInsert.push({
                storageKey,
                category,
                keyId,
                value: serializeWithBufferReplacer(parsed),
                updatedAt: Math.round(stat.mtimeMs || Date.now()),
            });
        } catch (parseErr) {
            skippedCorrupt++;
            console.warn(`[SQLiteAuth] Skipping corrupted legacy key file ${file}:`, parseErr.message);
        }
    }

    const now = Date.now();
    const credsStatMs = fs.existsSync(path.join(authDir, 'creds.json'))
        ? Math.round(fs.statSync(path.join(authDir, 'creds.json')).mtimeMs || now)
        : now;

    const upsertMeta = db.prepare(`
        INSERT INTO auth_meta (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
    `);
    const upsertKey = db.prepare(`
        INSERT INTO auth_keys (storage_key, category, key_id, value, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(storage_key) DO UPDATE SET
            category = excluded.category,
            key_id = excluded.key_id,
            value = excluded.value,
            updated_at = excluded.updated_at
    `);

    db.exec('BEGIN IMMEDIATE');
    try {
        if (serializedCreds && !existingCredsRow) {
            upsertMeta.run('creds', serializedCreds, credsStatMs);
        }
        for (const rec of recordsToInsert) {
            upsertKey.run(rec.storageKey, rec.category, rec.keyId, rec.value, rec.updatedAt);
        }
        upsertMeta.run('legacy_migrated', '1', now);
        db.exec('COMMIT');
    } catch (txErr) {
        try {
            db.exec('ROLLBACK');
        } catch (rbErr) {
            console.error('[SQLiteAuth] Rollback failed during legacy migration:', rbErr.message);
        }
        throw txErr;
    }

    // Verify committed data before removing legacy JSON files
    const verifyCreds = db.prepare(`SELECT value FROM auth_meta WHERE key = 'creds'`).get();
    const verifyCountRow = db.prepare(`SELECT COUNT(*) AS cnt FROM auth_keys`).get();
    if (serializedCreds && !verifyCreds?.value) {
        throw new Error('[SQLiteAuth] Verification failed after migration: creds missing in SQLite.');
    }
    if (Number(verifyCountRow?.cnt || 0) < recordsToInsert.length) {
        throw new Error('[SQLiteAuth] Verification failed after migration: inserted key count mismatch.');
    }

    if (verifyCreds?.value) {
        safeWriteCredsBackup(authDir, verifyCreds.value);
    }

    let deletedFiles = 0;
    for (const file of jsonFiles) {
        try {
            fs.unlinkSync(path.join(authDir, file));
            deletedFiles++;
        } catch (delErr) {
            console.warn(`[SQLiteAuth] Failed removing legacy file ${file}:`, delErr.message);
        }
    }

    console.log(
        `[SQLiteAuth] Auto-migrated ${recordsToInsert.length} key records${serializedCreds ? ' + creds' : ''} to ${DB_FILENAME}; removed ${deletedFiles} legacy JSON files (${skippedCorrupt} skipped/corrupt).`
    );

    return {
        migrated: true,
        importedKeys: recordsToInsert.length,
        deletedFiles,
        skippedCorrupt,
    };
}

/**
 * Safely closes a registered active handle for `authDir` (prevents Windows EBUSY on file reset).
 */
function closeActiveAuthHandle(authDir = path.resolve(__dirname, 'auth_info_baileys')) {
    const dbPath = getAuthDbPath(authDir);
    const existing = activeHandles.get(dbPath);
    if (existing) {
        existing.close();
        return true;
    }
    return false;
}

/**
 * Removes SQLite DB files (plus WAL/SHM) and legacy session files inside `authDir`,
 * falling back to wiping tables inside SQLite if Windows holds an external lock.
 */
function resetAuthDirectory(authDir = path.resolve(__dirname, 'auth_info_baileys')) {
    const resolvedDir = path.resolve(authDir);
    closeActiveAuthHandle(resolvedDir);

    if (!fs.existsSync(resolvedDir)) {
        return { reset: true, method: 'absent' };
    }

    const dbPath = getAuthDbPath(resolvedDir);
    let removeError = null;

    try {
        fs.rmSync(resolvedDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        return { reset: true, method: 'rm_dir' };
    } catch (err) {
        removeError = err;
        console.warn(`[SQLiteAuth] Directory removal hit lock (${err.message}); falling back to SQLite table wipe...`);
    }

    // Fallback: delete individual JSON files and wipe SQLite rows so session resets cleanly even on locked file handles
    try {
        for (const file of fs.readdirSync(resolvedDir)) {
            if (file.endsWith('.json') || file === CREDS_BACKUP_FILENAME) {
                try {
                    fs.unlinkSync(path.join(resolvedDir, file));
                } catch (e) {
                    console.warn(`[SQLiteAuth] Could not delete ${file}:`, e.message);
                }
            }
        }
        if (fs.existsSync(dbPath)) {
            const db = openSqliteConnection(dbPath);
            try {
                db.exec('DELETE FROM auth_keys; DELETE FROM auth_meta; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
            } finally {
                db.close();
            }
        }
        return { reset: true, method: 'sql_wipe' };
    } catch (fallbackErr) {
        console.error('[SQLiteAuth] Reset fallback failed:', fallbackErr.message, 'Initial error:', removeError?.message);
        throw fallbackErr;
    }
}

/**
 * Deletes Signal keys belonging to a corrupted JID/LID ID (used by MessageCounterError/Bad MAC auto-repair).
 */
function clearSessionKeysById(cleanId, authDir = path.resolve(__dirname, 'auth_info_baileys')) {
    if (!cleanId || String(cleanId).length < 3) return 0;
    const resolvedDir = path.resolve(authDir);
    const dbPath = getAuthDbPath(resolvedDir);
    if (!fs.existsSync(dbPath)) return 0;

    const registered = activeHandles.get(dbPath);
    const db = registered?.db || openSqliteConnection(dbPath);
    const ownConnection = !registered;

    try {
        const stmt = db.prepare(`
            DELETE FROM auth_keys
            WHERE category IN ('session', 'sender-key', 'identity-key', 'device-list')
              AND INSTR(storage_key, ?) > 0
        `);
        const info = stmt.run(String(cleanId));
        return Number(info?.changes || 0);
    } finally {
        if (ownConnection) {
            db.close();
        }
    }
}

/**
 * Inspects `session` and `sender-key` rows in SQLite and deletes any empty or unparseable JSON payloads.
 */
function pruneCorruptedSessionRows(authDir = path.resolve(__dirname, 'auth_info_baileys')) {
    const resolvedDir = path.resolve(authDir);
    const dbPath = getAuthDbPath(resolvedDir);
    if (!fs.existsSync(dbPath)) return 0;

    const registered = activeHandles.get(dbPath);
    const db = registered?.db || openSqliteConnection(dbPath);
    const ownConnection = !registered;

    try {
        const rows = db.prepare(`
            SELECT storage_key, value
            FROM auth_keys
            WHERE category IN ('session', 'sender-key')
        `).all();

        const deleteStmt = db.prepare(`DELETE FROM auth_keys WHERE storage_key = ?`);
        let removed = 0;

        for (const row of rows) {
            if (!row.value || !String(row.value).trim()) {
                deleteStmt.run(row.storage_key);
                removed++;
                continue;
            }
            try {
                const parsed = parseJsonWithBufferReviver(row.value);
                if (!parsed || typeof parsed !== 'object') {
                    deleteStmt.run(row.storage_key);
                    removed++;
                }
            } catch (parseErr) {
                console.warn(`[SQLiteAuth] Removing corrupted row ${row.storage_key}:`, parseErr.message);
                deleteStmt.run(row.storage_key);
                removed++;
            }
        }

        return removed;
    } finally {
        if (ownConnection) {
            db.close();
        }
    }
}

/**
 * Initializes Baileys AuthenticationState backed by a single SQLite database.
 * Returns `{ state, saveCreds, authDir, dbPath, migration, close, reset, clearKeysById }`.
 */
async function useSqliteAuthState(authDir = path.resolve(__dirname, 'auth_info_baileys')) {
    const resolvedDir = path.resolve(authDir);
    const dbPath = getAuthDbPath(resolvedDir);

    // Ensure no stale DB handle stays open from a prior reconnect cycle in this process
    closeActiveAuthHandle(resolvedDir);

    if (fs.existsSync(resolvedDir)) {
        const dirStat = fs.statSync(resolvedDir);
        if (!dirStat.isDirectory()) {
            throw new Error(`found something that is not a directory at ${resolvedDir}, either delete it or specify a different location`);
        }
    } else {
        fs.mkdirSync(resolvedDir, { recursive: true });
    }

    const db = openSqliteConnection(dbPath);
    let closed = false;

    const close = () => {
        if (closed) return;
        closed = true;
        activeHandles.delete(dbPath);
        try {
            db.close();
        } catch (err) {
            console.warn('[SQLiteAuth] Error closing SQLite handle:', err.message);
        }
    };

    const migration = migrateLegacyJsonFilesIfNeeded(db, resolvedDir);

    // Load creds or initialize fresh creds matching useMultiFileAuthState semantics
    let creds = null;
    const credsRow = db.prepare(`SELECT value FROM auth_meta WHERE key = 'creds'`).get();
    if (credsRow?.value) {
        try {
            creds = parseJsonWithBufferReviver(credsRow.value);
        } catch (parseErr) {
            console.error('[SQLiteAuth] Corrupted creds in SQLite; attempting backup recovery:', parseErr.message);
            const backupPath = path.join(resolvedDir, CREDS_BACKUP_FILENAME);
            if (fs.existsSync(backupPath)) {
                try {
                    creds = parseJsonWithBufferReviver(fs.readFileSync(backupPath, 'utf8'));
                } catch (bakErr) {
                    console.error('[SQLiteAuth] Backup creds.json.bak also unreadable:', bakErr.message);
                }
            }
        }
    }
    if (!creds) {
        creds = initAuthCreds();
    }

    const upsertMetaStmt = db.prepare(`
        INSERT INTO auth_meta (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
    `);
    const selectKeyStmt = db.prepare(`
        SELECT value, updated_at FROM auth_keys WHERE storage_key = ?
    `);
    const touchKeyStmt = db.prepare(`
        UPDATE auth_keys SET updated_at = ? WHERE storage_key = ? AND updated_at < ?
    `);
    const upsertKeyStmt = db.prepare(`
        INSERT INTO auth_keys (storage_key, category, key_id, value, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(storage_key) DO UPDATE SET
            category = excluded.category,
            key_id = excluded.key_id,
            value = excluded.value,
            updated_at = excluded.updated_at
    `);
    const deleteKeyStmt = db.prepare(`
        DELETE FROM auth_keys WHERE storage_key = ?
    `);

    // Touch activity timestamp at most once every 24h on read so active read-only keys
    // (e.g. lid-mapping, identity-key) stay protected from 60-day TTL expiry without extra write churn.
    const READ_TOUCH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

    const saveCreds = async () => {
        if (closed) {
            console.warn('[SQLiteAuth] Skipping saveCreds because SQLite auth handle is already closed.');
            return;
        }
        const serialized = serializeWithBufferReplacer(creds);
        upsertMetaStmt.run('creds', serialized, Date.now());
        safeWriteCredsBackup(resolvedDir, serialized);
    };

    const keys = {
        get: async (type, ids) => {
            if (closed) return {};
            const data = {};
            const now = Date.now();
            const touchCutoff = now - READ_TOUCH_THRESHOLD_MS;

            for (const id of ids) {
                const storageKey = makeStorageKey(type, id);
                const row = selectKeyStmt.get(storageKey);
                if (!row) {
                    data[id] = null;
                    continue;
                }

                try {
                    let value = parseJsonWithBufferReviver(row.value);
                    if (type === 'app-state-sync-key' && value) {
                        value = proto.Message.AppStateSyncKeyData.fromObject(value);
                    }
                    data[id] = value;

                    if (Number(row.updated_at || 0) < touchCutoff) {
                        touchKeyStmt.run(now, storageKey, touchCutoff);
                    }
                } catch (err) {
                    console.warn(`[SQLiteAuth] Failed parsing key ${storageKey}; returning null:`, err.message);
                    data[id] = null;
                }
            }
            return data;
        },
        set: async (data) => {
            if (closed) return;
            const now = Date.now();

            db.exec('BEGIN IMMEDIATE');
            try {
                for (const category in data) {
                    const bucket = data[category];
                    if (!bucket) continue;
                    for (const id in bucket) {
                        const value = bucket[id];
                        const storageKey = makeStorageKey(category, id);
                        if (value) {
                            upsertKeyStmt.run(
                                storageKey,
                                category,
                                String(id),
                                serializeWithBufferReplacer(value),
                                now
                            );
                        } else {
                            deleteKeyStmt.run(storageKey);
                        }
                    }
                }
                db.exec('COMMIT');
            } catch (err) {
                try {
                    db.exec('ROLLBACK');
                } catch (rbErr) {
                    console.error('[SQLiteAuth] Rollback failed in keys.set:', rbErr.message);
                }
                console.error('[SQLiteAuth] Failed committing keys.set transaction:', err.message);
                throw err;
            }
        },
    };

    const handle = {
        db,
        dbPath,
        authDir: resolvedDir,
        state: { creds, keys },
        saveCreds,
        migration,
        close,
        reset: () => resetAuthDirectory(resolvedDir),
        clearKeysById: (cleanId) => clearSessionKeysById(cleanId, resolvedDir),
    };

    activeHandles.set(dbPath, handle);
    return handle;
}

module.exports = {
    DB_FILENAME,
    CREDS_BACKUP_FILENAME,
    KNOWN_KEY_CATEGORIES,
    fixKeyComponent,
    makeStorageKey,
    parseStorageKey,
    getAuthDbPath,
    openSqliteConnection,
    closeActiveAuthHandle,
    resetAuthDirectory,
    clearSessionKeysById,
    pruneCorruptedSessionRows,
    useSqliteAuthState,
    activeHandles,
};
