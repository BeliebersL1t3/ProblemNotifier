const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const pino = require('pino');
const { makeCacheableSignalKeyStore, BufferJSON } = require('@whiskeysockets/baileys');

const {
    DB_FILENAME,
    CREDS_BACKUP_FILENAME,
    useSqliteAuthState,
    resetAuthDirectory,
    clearSessionKeysById,
    pruneCorruptedSessionRows,
    getAuthDbPath,
} = require('../sqliteAuthState');
const { getAuthFolderStats, cleanAuthFolder } = require('../housekeeping');

const silentLogger = pino({ level: 'silent' });
const DAY_MS = 24 * 60 * 60 * 1000;

function createTempBotEnv() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telunas-wa-sqlite-'));
    const authDir = path.join(rootDir, 'auth_info_baileys');
    fs.mkdirSync(authDir, { recursive: true });
    return {
        rootDir,
        authDir,
        cleanup() {
            resetAuthDirectory(authDir);
            fs.rmSync(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        },
    };
}

test('useSqliteAuthState persists creds, Buffers, special keys, and AppStateSyncKeyData via makeCacheableSignalKeyStore', async (t) => {
    const env = createTempBotEnv();
    t.after(() => env.cleanup());

    let handle = await useSqliteAuthState(env.authDir);
    assert.equal(handle.state.creds.registered, false);

    handle.state.creds.registered = true;
    handle.state.creds.firstUnuploadedPreKeyId = 1500;
    handle.state.creds.me = { id: '628111111111:1@s.whatsapp.net', lid: '999888777:1@lid' };
    await handle.saveCreds();

    assert.equal(fs.existsSync(path.join(env.authDir, DB_FILENAME)), true);
    assert.equal(fs.existsSync(path.join(env.authDir, CREDS_BACKUP_FILENAME)), true);

    const cachedKeys = makeCacheableSignalKeyStore(handle.state.keys, silentLogger);

    const preKeyBytes = Buffer.from([1, 2, 3, 4, 5]);
    const senderKeyBytes = Buffer.from([9, 8, 7, 6]);
    const appStateBytes = Buffer.from('app-state-secret-payload');

    await cachedKeys.set({
        'pre-key': {
            '1499': { public: preKeyBytes, private: Buffer.from([11, 22, 33]) },
        },
        tctoken: {
            '/index': { timestamp: '1700000000' },
        },
        'sender-key': {
            '120363123456@g.us:1006870358:0': { senderKey: senderKeyBytes },
            'temp-to-delete': { senderKey: Buffer.from([1]) },
        },
        'app-state-sync-key': {
            AAAAAOTQ: {
                keyData: appStateBytes,
                timestamp: 123456789,
                fingerprint: { rawId: 1, currentIndex: 0, deviceIndexes: [0] },
            },
        },
    });

    // Test deletion semantics
    await cachedKeys.set({
        'sender-key': {
            'temp-to-delete': null,
        },
    });

    // Clear in-memory cache ONLY (verify SQLite is untouched!)
    await cachedKeys.clear();

    // Reopen fresh handle without prior RAM state
    handle.close();
    handle = await useSqliteAuthState(env.authDir);
    const reloadedCache = makeCacheableSignalKeyStore(handle.state.keys, silentLogger);

    assert.equal(handle.state.creds.registered, true);
    assert.equal(handle.state.creds.me.id, '628111111111:1@s.whatsapp.net');

    const loadedPre = await reloadedCache.get('pre-key', ['1499']);
    assert.ok(Buffer.isBuffer(loadedPre['1499'].public));
    assert.ok(loadedPre['1499'].public.equals(preKeyBytes));

    const loadedTc = await reloadedCache.get('tctoken', ['/index']);
    assert.deepEqual(loadedTc['/index'], { timestamp: '1700000000' });

    const loadedSender = await reloadedCache.get('sender-key', [
        '120363123456@g.us:1006870358:0',
        'temp-to-delete',
    ]);
    assert.ok(Buffer.isBuffer(loadedSender['120363123456@g.us:1006870358:0'].senderKey));
    assert.ok(loadedSender['120363123456@g.us:1006870358:0'].senderKey.equals(senderKeyBytes));
    assert.equal(loadedSender['temp-to-delete'], undefined);

    const loadedAppState = await reloadedCache.get('app-state-sync-key', ['AAAAAOTQ']);
    assert.ok(loadedAppState.AAAAAOTQ);
    assert.equal(Buffer.from(loadedAppState.AAAAAOTQ.keyData).toString(), 'app-state-secret-payload');

    handle.close();
});

test('auto-migrates legacy multi-file JSONs atomically, preserves mtimeMs, and removes old JSONs', async (t) => {
    const env = createTempBotEnv();
    t.after(() => env.cleanup());

    const now = Date.now();
    const seventyDaysAgoSec = (now - 70 * DAY_MS) / 1000;
    const fiveDaysAgoSec = (now - 5 * DAY_MS) / 1000;

    const writeLegacyJson = (filename, data, mtimeSec = fiveDaysAgoSec) => {
        const fullPath = path.join(env.authDir, filename);
        fs.writeFileSync(fullPath, JSON.stringify(data, BufferJSON.replacer), 'utf8');
        fs.utimesSync(fullPath, mtimeSec, mtimeSec);
    };

    writeLegacyJson('creds.json', {
        registered: true,
        nextPreKeyId: 1200,
        noiseKey: { private: Buffer.from([10, 20]), public: Buffer.from([30, 40]) },
        me: { id: '628999888777:0@s.whatsapp.net' },
    });
    writeLegacyJson('pre-key-1150.json', { public: Buffer.from([1, 2]), private: Buffer.from([3, 4]) });
    writeLegacyJson('session-100687035805704_1.0.json', { session: Buffer.from('old-ses') }, seventyDaysAgoSec);
    writeLegacyJson('session-200687035805704_1.0.json', { session: Buffer.from('new-ses') }, fiveDaysAgoSec);
    writeLegacyJson('sender-key-120363163479456946@g.us--125928474693--0.json', { k: Buffer.from([7]) });
    writeLegacyJson('sender-key-memory-120363411512804682@g.us.json', { '125928474693': true });
    writeLegacyJson('identity-key-100687035805704_1.0.json', Buffer.from([5, 6, 7]));
    writeLegacyJson('lid-mapping-628123456789.json', '100687035805704');
    writeLegacyJson('lid-mapping-100687035805704_reverse.json', '628123456789');
    writeLegacyJson('tctoken-__index.json', { idx: 1 });
    writeLegacyJson('tctoken-101752103768087@lid.json', { token: Buffer.from([9]) });
    writeLegacyJson('device-list-103156541321283.json', ['0', '1']);
    writeLegacyJson('app-state-sync-key-AAAAAOTQ.json', {
        keyData: Buffer.from('sync-key'),
        timestamp: 999,
    });
    writeLegacyJson('app-state-sync-version-regular.json', { version: 42 });

    // Corrupted 0-byte legacy file must be skipped cleanly without aborting migration
    fs.writeFileSync(path.join(env.authDir, 'session-corrupted-empty.json'), '', 'utf8');

    const handle = await useSqliteAuthState(env.authDir);
    assert.equal(handle.migration.migrated, true);
    assert.equal(handle.migration.importedKeys, 13);
    assert.equal(handle.migration.skippedCorrupt, 1);

    // Ensure creds.json and legacy key *.json files are deleted; SQLite + creds.json.bak remain
    const remainingFiles = fs.readdirSync(env.authDir);
    const remainingJsonKeys = remainingFiles.filter((f) => f.endsWith('.json'));
    assert.deepEqual(remainingJsonKeys, []);
    assert.ok(remainingFiles.includes(DB_FILENAME));
    assert.ok(remainingFiles.includes(CREDS_BACKUP_FILENAME));

    assert.equal(handle.state.creds.registered, true);
    assert.ok(Buffer.isBuffer(handle.state.creds.noiseKey.private));

    const cachedKeys = makeCacheableSignalKeyStore(handle.state.keys, silentLogger);
    const tc = await cachedKeys.get('tctoken', ['/index']);
    assert.deepEqual(tc['/index'], { idx: 1 });

    const sk = await cachedKeys.get('sender-key', ['120363163479456946@g.us::125928474693::0']);
    assert.ok(Buffer.isBuffer(sk['120363163479456946@g.us::125928474693::0'].k));

    // Verify original mtimeMs (~70 days ago) survived inside SQLite updated_at
    const oldRow = handle.db
        .prepare(`SELECT updated_at FROM auth_keys WHERE storage_key = ?`)
        .get('session-100687035805704_1.0');
    assert.ok(oldRow);
    assert.ok(now - oldRow.updated_at > 69 * DAY_MS);

    handle.close();
});

test('cleanAuthFolder applies conservative 60-day TTL while strictly protecting staff LID mappings and app-state', async (t) => {
    const env = createTempBotEnv();
    t.after(() => env.cleanup());

    // Configure staff phones & device mappings in parent bot directory
    fs.writeFileSync(
        path.join(env.rootDir, 'staff_phones.json'),
        JSON.stringify({
            '6281122334455': { name: 'Engineer One', role: 'technician', phone: '6281122334455' },
            '628777666555': { name: 'Staff Unmapped LID', role: 'staff', phone: '628777666555' },
        }),
        'utf8'
    );
    fs.writeFileSync(
        path.join(env.rootDir, 'device_mappings.json'),
        JSON.stringify({
            '555666777888': '6281122334455',
        }),
        'utf8'
    );

    const handle = await useSqliteAuthState(env.authDir);
    handle.state.creds.registered = true;
    handle.state.creds.firstUnuploadedPreKeyId = 1500; // safe watermark >= 1400
    handle.state.creds.me = { id: '628999000111:0@s.whatsapp.net', lid: '444333222111:0@lid' };
    await handle.saveCreds();

    await handle.state.keys.set({
        'pre-key': {
            '1200': { public: Buffer.from([1]) }, // below watermark -> PRUNE
            '1450': { public: Buffer.from([2]) }, // within buffer -> KEEP
        },
        session: {
            '9990001_1.0': { data: 'x'.repeat(2000) }, // aged 75d -> PRUNE
            '9990002_1.0': { data: 'active' },        // aged 10d -> KEEP
        },
        'sender-key': {
            'oldgroup@g.us::123::0': { sk: 1 },       // aged 75d -> PRUNE
        },
        'identity-key': {
            '9990001_1.0': Buffer.from([3, 4]),       // aged 75d -> PRUNE
        },
        tctoken: {
            '9990001@lid': { t: 1 },                  // aged 75d -> PRUNE
            '/index': { idx: 99 },                    // aged 15d -> KEEP
        },
        'device-list': {
            '9990001': ['0'],                         // aged 75d -> PRUNE
        },
        'lid-mapping': {
            '6281122334455': '555666777888',          // staff forward @ 90d -> KEEP
            '555666777888_reverse': '6281122334455',  // staff reverse @ 90d -> KEEP
            '987654321012_reverse': '628777666555',   // staff via value PN match @ 90d -> KEEP
            '444333222111_reverse': '628999000111',   // bot own LID @ 90d -> KEEP
            '333444555666_reverse': '628000999888',   // unknown outsider @ 90d -> PRUNE
        },
        'sender-key-memory': {
            '120363999@g.us': { '111': true },        // aged 120d -> KEEP
        },
        'app-state-sync-key': {
            AAAAAOTQ: { keyData: Buffer.from([5]) },  // aged 120d -> KEEP
        },
        'app-state-sync-version': {
            regular: { version: 7 },                  // aged 120d -> KEEP
        },
    });

    const now = Date.now();
    const setAgeDays = (storageKey, daysAgo) => {
        handle.db
            .prepare(`UPDATE auth_keys SET updated_at = ? WHERE storage_key = ?`)
            .run(now - daysAgo * DAY_MS, storageKey);
    };

    setAgeDays('session-9990001_1.0', 75);
    setAgeDays('session-9990002_1.0', 10);
    setAgeDays('sender-key-oldgroup@g.us--123--0', 75);
    setAgeDays('identity-key-9990001_1.0', 75);
    setAgeDays('tctoken-9990001@lid', 75);
    setAgeDays('tctoken-__index', 15);
    setAgeDays('device-list-9990001', 75);
    setAgeDays('lid-mapping-6281122334455', 90);
    setAgeDays('lid-mapping-555666777888_reverse', 90);
    setAgeDays('lid-mapping-987654321012_reverse', 90);
    setAgeDays('lid-mapping-444333222111_reverse', 90);
    setAgeDays('lid-mapping-333444555666_reverse', 90);
    setAgeDays('sender-key-memory-120363999@g.us', 120);
    setAgeDays('app-state-sync-key-AAAAAOTQ', 120);
    setAgeDays('app-state-sync-version-regular', 120);

    // Run housekeeping in-process while handle is actively open (no lock failures)
    const statsBefore = getAuthFolderStats(env.authDir);
    assert.equal(statsBefore.storageMode, 'sqlite');
    assert.equal(statsBefore.credsStatus, 'registered');
    assert.equal(statsBefore.totalKeys, 17);

    const cleanupRes = cleanAuthFolder({ authDir: env.authDir, now });
    assert.equal(cleanupRes.success, true);
    assert.equal(cleanupRes.storageMode, 'sqlite');
    assert.equal(cleanupRes.backupCreated, true);
    assert.equal(cleanupRes.deletedPreKeys, 1);
    assert.equal(cleanupRes.deletedSessions, 1);
    assert.equal(cleanupRes.deletedSenderKeys, 1);
    assert.equal(cleanupRes.deletedIdentityKeys, 1);
    assert.equal(cleanupRes.deletedTcTokens, 1);
    assert.equal(cleanupRes.deletedDeviceLists, 1);
    assert.equal(cleanupRes.deletedLidMappings, 1);
    assert.equal(cleanupRes.protectedLidSkipped, 4);
    assert.equal(cleanupRes.totalDeleted, 7);
    assert.equal(cleanupRes.keysAfter, 10);

    const remainingKeys = handle.db
        .prepare(`SELECT storage_key FROM auth_keys ORDER BY storage_key`)
        .all()
        .map((r) => r.storage_key);

    assert.deepEqual(remainingKeys, [
        'app-state-sync-key-AAAAAOTQ',
        'app-state-sync-version-regular',
        'lid-mapping-444333222111_reverse',
        'lid-mapping-555666777888_reverse',
        'lid-mapping-6281122334455',
        'lid-mapping-987654321012_reverse',
        'pre-key-1450',
        'sender-key-memory-120363999@g.us',
        'session-9990002_1.0',
        'tctoken-__index',
    ]);

    handle.close();
});

test('reading an active key refreshes updated_at when older than 24h so active contacts do not expire', async (t) => {
    const env = createTempBotEnv();
    t.after(() => env.cleanup());

    const handle = await useSqliteAuthState(env.authDir);
    await handle.state.keys.set({
        session: { 'active_contact_1.0': { chain: 'ok' } },
    });

    const fortyDaysAgo = Date.now() - 40 * DAY_MS;
    handle.db
        .prepare(`UPDATE auth_keys SET updated_at = ? WHERE storage_key = ?`)
        .run(fortyDaysAgo, 'session-active_contact_1.0');

    const res = await handle.state.keys.get('session', ['active_contact_1.0']);
    assert.deepEqual(res['active_contact_1.0'], { chain: 'ok' });

    const rowAfter = handle.db
        .prepare(`SELECT updated_at FROM auth_keys WHERE storage_key = ?`)
        .get('session-active_contact_1.0');
    assert.ok(rowAfter.updated_at > fortyDaysAgo);
    assert.ok(Date.now() - rowAfter.updated_at < 5000);

    handle.close();
});

test('clearSessionKeysById, pruneCorruptedSessionRows, and resetAuthDirectory operate cleanly on Windows', async (t) => {
    const env = createTempBotEnv();
    t.after(() => env.cleanup());

    const handle = await useSqliteAuthState(env.authDir);
    await handle.state.keys.set({
        session: { '100687035805704_1.0': { ok: 1 }, 'other999_1.0': { ok: 2 } },
        'identity-key': { '100687035805704_1.0': Buffer.from([1]) },
        'lid-mapping': { '100687035805704_reverse': '628123456' },
    });

    // Insert intentionally malformed JSON row into SQLite
    handle.db
        .prepare(`INSERT INTO auth_keys (storage_key, category, key_id, value, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run('session-broken_1.0', 'session', 'broken_1.0', '{corrupted-json', Date.now());

    const clearedForId = clearSessionKeysById('100687035805704', env.authDir);
    assert.equal(clearedForId, 2); // session + identity-key; lid-mapping preserved

    const prunedCorrupt = pruneCorruptedSessionRows(env.authDir);
    assert.equal(prunedCorrupt, 1);

    const leftKeys = handle.db.prepare(`SELECT storage_key FROM auth_keys ORDER BY storage_key`).all();
    assert.deepEqual(
        leftKeys.map((r) => r.storage_key),
        ['lid-mapping-100687035805704_reverse', 'session-other999_1.0']
    );

    const resetResult = handle.reset();
    assert.equal(resetResult.reset, true);
    assert.equal(fs.existsSync(getAuthDbPath(env.authDir)), false);
});

test('PHP PDO fallback accurately inspects SQLite WAL database produced by node:sqlite', async (t) => {
    const env = createTempBotEnv();
    t.after(() => env.cleanup());

    const handle = await useSqliteAuthState(env.authDir);
    handle.state.creds.registered = true;
    await handle.saveCreds();
    await handle.state.keys.set({
        session: { a_1: { s: 1 }, b_1: { s: 2 } },
        'lid-mapping': { '628123': '10001' },
    });

    // Test reading via PHP CLI while Node SQLite WAL handle is closed (offline fallback simulation)
    handle.close();

    const phpSnippet = [
        '$dbPath = $argv[1];',
        '$pdo = new PDO("sqlite:" . $dbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY]);',
        '$rows = $pdo->query("SELECT category, COUNT(*) AS cnt FROM auth_keys GROUP BY category")->fetchAll(PDO::FETCH_ASSOC);',
        '$creds = $pdo->query("SELECT value FROM auth_meta WHERE key = \'creds\'")->fetchColumn();',
        'echo json_encode(["rows" => $rows, "creds" => json_decode($creds, true)]);',
    ].join(' ');

    const stdout = execFileSync('php', ['-r', phpSnippet, getAuthDbPath(env.authDir)], {
        encoding: 'utf8',
    });
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.creds.registered, true);
    const counts = Object.fromEntries(parsed.rows.map((r) => [r.category, Number(r.cnt)]));
    assert.equal(counts.session, 2);
    assert.equal(counts['lid-mapping'], 1);
});
