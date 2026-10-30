/**
 * Telunas CampusFix - Baileys Auth State Housekeeping & Auto-Cleanup
 * 
 * Safely prunes stale one-time pre-keys, expired LID mappings, and corrupted zero-byte files
 * while strictly protecting `creds.json`, `app-state-sync-*`, and active encryption sessions.
 */

const fs = require('fs');
const path = require('path');

/**
 * Inspects and returns current statistics of the Baileys auth folder.
 */
function getAuthFolderStats(authDir = path.resolve(__dirname, 'auth_info_baileys')) {
    if (!fs.existsSync(authDir)) {
        return {
            exists: false,
            totalFiles: 0,
            totalSizeKB: 0,
            totalSizeMB: 0,
            breakdown: {},
            lastCleanup: null
        };
    }

    try {
        const files = fs.readdirSync(authDir);
        let totalBytes = 0;
        const breakdown = {};

        for (const file of files) {
            const prefix = file.split('-')[0] || file.split('.')[0] || 'other';
            breakdown[prefix] = (breakdown[prefix] || 0) + 1;
            try {
                const stat = fs.statSync(path.join(authDir, file));
                totalBytes += stat.size;
            } catch (statErr) {
                console.warn(`[Housekeeping] Could not stat file ${file}:`, statErr.message);
            }
        }

        let credsStatus = 'missing';
        const credsFile = path.join(authDir, 'creds.json');
        if (fs.existsSync(credsFile)) {
            try {
                const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
                credsStatus = creds?.registered ? 'registered' : 'unregistered';
            } catch (_) {
                credsStatus = 'corrupted';
            }
        }

        return {
            exists: true,
            authDir,
            credsStatus,
            totalFiles: files.length,
            totalSizeKB: Math.round(totalBytes / 1024),
            totalSizeMB: Number((totalBytes / (1024 * 1024)).toFixed(2)),
            breakdown,
        };
    } catch (err) {
        console.error('[Housekeeping] Error calculating auth folder stats:', err.message);
        return {
            exists: true,
            totalFiles: 0,
            totalSizeKB: 0,
            totalSizeMB: 0,
            breakdown: {},
            error: err.message
        };
    }
}

/**
 * Cleans expired pre-keys, stale LID mappings (>30d), and zero-byte files.
 * ALWAYS backs up creds.json first and preserves active sessions.
 */
function cleanAuthFolder(options = {}) {
    const authDir = options.authDir || path.resolve(__dirname, 'auth_info_baileys');
    if (!fs.existsSync(authDir)) {
        return {
            success: false,
            message: 'Direktori auth_info_baileys tidak ditemukan.'
        };
    }

    const credsFile = path.join(authDir, 'creds.json');
    if (!fs.existsSync(credsFile)) {
        return {
            success: false,
            message: 'File creds.json tidak ditemukan. Pembersihan dibatalkan demi keamanan sesi.'
        };
    }

    const beforeStats = getAuthFolderStats(authDir);

    // 1. Create a safety backup of creds.json
    const backupFile = path.join(authDir, 'creds.json.bak');
    let backupCreated = false;
    try {
        fs.copyFileSync(credsFile, backupFile);
        backupCreated = true;
    } catch (backupErr) {
        console.error('[Housekeeping] Gagal membuat backup creds.json:', backupErr.message);
        return {
            success: false,
            message: 'Gagal membuat cadangan creds.json: ' + backupErr.message
        };
    }

    // 2. Read pre-key watermark from creds.json
    let nextPreKeyId = 0;
    try {
        const credsData = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
        nextPreKeyId = Number(credsData.firstUnuploadedPreKeyId || credsData.nextPreKeyId || 0);
    } catch (parseErr) {
        console.error('[Housekeeping] Gagal membaca metadata pre-key dari creds.json:', parseErr.message);
        return {
            success: false,
            message: 'Gagal membaca metadata sesi: ' + parseErr.message
        };
    }

    // Retain a safe buffer of 100 pre-keys below nextPreKeyId
    const minSafePreKeyId = Math.max(0, nextPreKeyId - 100);
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

    let deletedPreKeys = 0;
    let deletedLidMappings = 0;
    let deletedZeroByteFiles = 0;
    let deletedBytes = 0;

    try {
        const files = fs.readdirSync(authDir);

        for (const file of files) {
            // Strictly protected files
            if (file === 'creds.json' || file === 'creds.json.bak') continue;
            if (file.startsWith('app-state-sync-')) continue;

            const filePath = path.join(authDir, file);
            let stat;
            try {
                stat = fs.statSync(filePath);
            } catch (e) {
                continue;
            }

            // A. Clean corrupted zero-byte files
            if (stat.size === 0) {
                try {
                    fs.unlinkSync(filePath);
                    deletedZeroByteFiles++;
                } catch (delErr) {
                    console.warn(`[Housekeeping] Gagal menghapus file kosong ${file}:`, delErr.message);
                }
                continue;
            }

            // B. Clean expired one-time pre-keys
            const preKeyMatch = file.match(/^pre-key-(\d+)\.json$/);
            if (preKeyMatch) {
                const keyId = parseInt(preKeyMatch[1], 10);
                if (keyId < minSafePreKeyId) {
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

            // C. Clean stale LID mapping older than 30 days
            if (file.startsWith('lid-mapping-') && stat.mtimeMs < thirtyDaysAgo) {
                try {
                    deletedBytes += stat.size;
                    fs.unlinkSync(filePath);
                    deletedLidMappings++;
                } catch (delErr) {
                    console.warn(`[Housekeeping] Gagal menghapus LID mapping usang ${file}:`, delErr.message);
                }
                continue;
            }
        }

        const afterStats = getAuthFolderStats(authDir);
        const totalDeleted = deletedPreKeys + deletedLidMappings + deletedZeroByteFiles;
        const freedKB = Math.round(deletedBytes / 1024);

        console.log(`[Housekeeping] Pembersihan selesai: ${totalDeleted} file dihapus (${freedKB} KB dibebaskan).`);
        console.log(`[Housekeeping] Rincian -> Pre-keys: ${deletedPreKeys}, LID: ${deletedLidMappings}, Kosong: ${deletedZeroByteFiles}. Total file: ${beforeStats.totalFiles} -> ${afterStats.totalFiles}`);

        return {
            success: true,
            backupCreated,
            totalDeleted,
            deletedPreKeys,
            deletedLidMappings,
            deletedZeroByteFiles,
            freedKB,
            filesBefore: beforeStats.totalFiles,
            filesAfter: afterStats.totalFiles,
            currentStats: afterStats,
            message: `Berhasil membersihkan ${totalDeleted} file usang (${freedKB} KB dibebaskan).`
        };
    } catch (err) {
        console.error('[Housekeeping] Terjadi kesalahan saat pembersihan auth folder:', err.message);
        return {
            success: false,
            message: 'Terjadi kesalahan saat pembersihan: ' + err.message
        };
    }
}

/**
 * Sets up a background schedule that checks every hour.
 * Fires cleanAuthFolder() automatically at 03:00 AM once per day.
 */
let lastScheduledDay = null;

function setupHousekeepingSchedule() {
    setInterval(() => {
        try {
            const d = new Date();
            const currentHour = d.getHours();
            const todayStr = d.toDateString();

            if (currentHour === 3 && lastScheduledDay !== todayStr) {
                lastScheduledDay = todayStr;
                console.log('[Housekeeping] Menjalankan pembersihan berkala otomatis (Pukul 03:00 AM)...');
                cleanAuthFolder();
            }
        } catch (schedErr) {
            console.error('[Housekeeping] Error in scheduled cleanup loop:', schedErr.message);
        }
    }, 60 * 60 * 1000); // Check once every hour
}

module.exports = {
    getAuthFolderStats,
    cleanAuthFolder,
    setupHousekeepingSchedule
};

