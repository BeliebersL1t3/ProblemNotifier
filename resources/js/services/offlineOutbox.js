/**
 * Offline Outbox Service using IndexedDB for Telunas Resorts
 * Stores tickets and photos locally when offline (0 bar) and auto-syncs when online.
 */

import axios from 'axios';

const DB_NAME = 'telunas_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'outbox_tickets';

/**
 * Open or upgrade IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
export function openOutboxDB() {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            reject(new Error('IndexedDB tidak didukung pada peramban ini.'));
            return;
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            console.error('[OfflineOutbox] Database open error:', event.target.error);
            reject(new Error(`Gagal membuka IndexedDB: ${event.target.error?.message || 'Akses ditolak'}`));
        };
    });
}

/**
 * Notify application components that outbox count has changed
 */
export async function notifyOutboxChanged() {
    try {
        const count = await getOutboxCount();
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('telunas:outbox-updated', {
                detail: { count }
            }));
        }
    } catch (err) {
        console.warn('[OfflineOutbox] Failed to dispatch outbox-updated event:', err);
    }
}

/**
 * Add a ticket to the offline outbox
 * @param {Object} ticket
 * @returns {Promise<number>} ID of inserted ticket
 */
export async function addToOutbox(ticket) {
    const db = await openOutboxDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const outboxRecord = {
            title: ticket.title || '',
            description: ticket.description || '',
            location: ticket.location || '',
            target_departments: ticket.target_departments || [],
            reporter_name: ticket.reporter_name || '',
            reporter_dept: ticket.reporter_dept || '',
            reporter_phone: ticket.reporter_phone || '',
            imageBlob: ticket.imageBlob || null,
            imageName: ticket.imageName || (ticket.imageBlob ? 'photo.jpg' : null),
            imagePreview: ticket.imagePreview || null,
            status: 'pending',
            errorMessage: null,
            retryCount: 0,
            createdAt: new Date().toISOString(),
        };

        const request = store.add(outboxRecord);

        request.onsuccess = (event) => {
            const id = event.target.result;
            notifyOutboxChanged();
            resolve(id);
        };

        request.onerror = (event) => {
            console.error('[OfflineOutbox] Failed to add item to outbox:', event.target.error);
            reject(new Error(`Gagal menyimpan laporan ke antrean lokal: ${event.target.error?.message || 'Kesalahan sistem'}`));
        };
    });
}

/**
 * Retrieve all tickets from outbox
 * @returns {Promise<Array>}
 */
export async function getOutboxTickets() {
    const db = await openOutboxDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = (event) => {
            const items = event.target.result || [];
            // Sort by newest first
            items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            resolve(items);
        };

        request.onerror = (event) => {
            console.error('[OfflineOutbox] Failed to fetch outbox tickets:', event.target.error);
            reject(new Error(`Gagal membaca antrean lokal: ${event.target.error?.message}`));
        };
    });
}

/**
 * Get count of pending tickets in outbox
 * @returns {Promise<number>}
 */
export async function getOutboxCount() {
    const db = await openOutboxDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.count();

        request.onsuccess = (event) => {
            resolve(event.target.result || 0);
        };

        request.onerror = (event) => {
            console.error('[OfflineOutbox] Failed to get outbox count:', event.target.error);
            resolve(0);
        };
    });
}

/**
 * Delete a ticket from outbox after successful sync
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function removeOutboxTicket(id) {
    const db = await openOutboxDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => {
            notifyOutboxChanged();
            resolve();
        };

        request.onerror = (event) => {
            console.error(`[OfflineOutbox] Failed to remove item #${id}:`, event.target.error);
            reject(new Error(`Gagal menghapus tiket #${id} dari antrean: ${event.target.error?.message}`));
        };
    });
}

/**
 * Update outbox ticket status (e.g., syncing, failed)
 * @param {number} id
 * @param {Object} updates
 */
export async function updateOutboxTicket(id, updates) {
    const db = await openOutboxDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getReq = store.get(id);

        getReq.onsuccess = (event) => {
            const data = event.target.result;
            if (!data) {
                resolve();
                return;
            }

            Object.assign(data, updates);
            const putReq = store.put(data);
            putReq.onsuccess = () => resolve();
            putReq.onerror = (e) => reject(e.target.error);
        };

        getReq.onerror = (event) => reject(event.target.error);
    });
}

/**
 * Synchronize a single ticket to the backend server
 * @param {Object} ticket
 * @returns {Promise<Object>} Server response
 */
export async function syncSingleTicket(ticket) {
    const formData = new FormData();
    formData.append('title', ticket.title);
    formData.append('description', ticket.description || '');
    formData.append('location', ticket.location);
    formData.append('reporter_name', ticket.reporter_name);
    formData.append('reporter_dept', ticket.reporter_dept || '');
    if (ticket.reporter_phone) {
        formData.append('reporter_phone', ticket.reporter_phone);
    }
    if (ticket.createdAt) {
        formData.append('reported_at', ticket.createdAt);
    }
    if (ticket.start_in_progress) {
        formData.append('start_in_progress', '1');
    }

    if (Array.isArray(ticket.target_departments)) {
        ticket.target_departments.forEach((dept) => {
            formData.append('target_departments[]', dept);
        });
    }

    if (ticket.imageBlob) {
        const fileName = ticket.imageName || 'offline_photo.jpg';
        formData.append('image', ticket.imageBlob, fileName);
    }

    // Get CSRF token from page
    const tokenMeta = document.querySelector('meta[name="csrf-token"]');
    const csrfToken = tokenMeta ? tokenMeta.getAttribute('content') : null;

    const response = await axios.post('/lapangan/issues', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
            'X-Requested-With': 'XMLHttpRequest',
            ...(csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {})
        },
        timeout: 25000, // 25s timeout for mobile upload
    });

    return response.data;
}

let isSyncInProgress = false;

/**
 * Synchronize all pending tickets in outbox
 * @param {Function} [onProgress] Callback (current, total, item)
 * @returns {Promise<{ synced: number, failed: number, errors: Array }>}
 */
export async function syncAllOutboxTickets(onProgress = null) {
    if (isSyncInProgress) {
        console.warn('[OfflineOutbox] Sync is already running, skipping duplicate trigger.');
        return { synced: 0, failed: 0, errors: [] };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        console.warn('[OfflineOutbox] Cannot sync: Device is currently offline.');
        return { synced: 0, failed: 0, errors: ['Device offline'] };
    }

    isSyncInProgress = true;
    const errors = [];
    let synced = 0;
    let failed = 0;

    try {
        const tickets = await getOutboxTickets();
        if (tickets.length === 0) {
            isSyncInProgress = false;
            return { synced: 0, failed: 0, errors: [] };
        }

        console.log(`[OfflineOutbox] Starting sync for ${tickets.length} tickets...`);

        for (let i = 0; i < tickets.length; i++) {
            const ticket = tickets[i];
            if (onProgress) {
                onProgress(i + 1, tickets.length, ticket);
            }

            try {
                await updateOutboxTicket(ticket.id, { status: 'syncing', errorMessage: null });
                await syncSingleTicket(ticket);
                await removeOutboxTicket(ticket.id);
                synced++;
                console.log(`[OfflineOutbox] Successfully synced ticket #${ticket.id}: "${ticket.title}"`);
            } catch (err) {
                failed++;
                const errMsg = err.response?.data?.message || err.message || 'Gagal mengirim tiket ke server';
                console.error(`[OfflineOutbox] Failed to sync ticket #${ticket.id}:`, errMsg);
                errors.push({ id: ticket.id, title: ticket.title, error: errMsg });

                await updateOutboxTicket(ticket.id, {
                    status: 'failed',
                    errorMessage: errMsg,
                    retryCount: (ticket.retryCount || 0) + 1
                });
            }
        }
    } catch (globalErr) {
        console.error('[OfflineOutbox] Fatal error during sync loop:', globalErr);
        errors.push({ error: globalErr.message });
    } finally {
        isSyncInProgress = false;
        notifyOutboxChanged();
    }

    return { synced, failed, errors };
}

/**
 * Setup listeners for auto-sync when network reconnects
 * @param {Function} [onStatusChange] Optional callback receiving ({ isOnline, outboxCount })
 * @returns {Function} Cleanup function
 */
export function registerOutboxAutoSync(onStatusChange = null) {
    if (typeof window === 'undefined') return () => {};

    const handleNetworkChange = async () => {
        const isOnline = navigator.onLine;
        const count = await getOutboxCount();

        if (onStatusChange) {
            onStatusChange({ isOnline, outboxCount: count });
        }

        if (isOnline && count > 0) {
            console.log('[OfflineOutbox] Network restored & outbox items detected. Triggering auto-sync...');
            try {
                const res = await syncAllOutboxTickets();
                if (res.synced > 0) {
                    console.log(`[OfflineOutbox] Auto-synced ${res.synced} tickets.`);
                    // Dispatch a custom event so UI can display a success toast or refresh list
                    window.dispatchEvent(new CustomEvent('telunas:outbox-synced', {
                        detail: { syncedCount: res.synced }
                    }));
                }
            } catch (syncErr) {
                console.error('[OfflineOutbox] Error during auto-sync:', syncErr);
            }
        }
    };

    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);

    // Initial check on page load
    handleNetworkChange();

    return () => {
        window.removeEventListener('online', handleNetworkChange);
        window.removeEventListener('offline', handleNetworkChange);
    };
}

