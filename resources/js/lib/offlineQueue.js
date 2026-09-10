/**
 * Offline Outbox Queue & Client Timestamp Manager
 * Manages queued issues when staff submit with spotty or disconnected resort Wi-Fi.
 */

const OUTBOX_KEY = 'campusfix_offline_outbox';

export function getOfflineQueue() {
    try {
        const raw = localStorage.getItem(OUTBOX_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error('Error reading offline outbox:', e);
        return [];
    }
}

export function addToOfflineQueue(item) {
    try {
        const queue = getOfflineQueue();
        const newItem = {
            id: item.id || `offline-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            // Preserve the exact timestamp of when the user tapped Submit!
            reportedAt: item.reportedAt || new Date().toISOString(),
            title: item.title || '',
            description: item.description || '',
            location: item.location || '',
            category: item.category || 'broken',
            department: item.department || '',
            assignedDepartments: item.assignedDepartments || '',
            taggedDepartments: item.taggedDepartments || '',
            reporter: item.reporter || '',
            priority: item.priority || 'low',
            deadline: item.deadline || '',
            imageDataUrl: item.imageDataUrl || null,
            imageName: item.imageName || 'photo.jpg',
            queuedAt: Date.now(),
        };

        queue.push(newItem);
        localStorage.setItem(OUTBOX_KEY, JSON.stringify(queue));
        window.dispatchEvent(new CustomEvent('campusfix:outbox-updated', { detail: { count: queue.length } }));
        return newItem;
    } catch (e) {
        console.error('Error saving to offline outbox:', e);
        return null;
    }
}

export function removeFromOfflineQueue(id) {
    try {
        const queue = getOfflineQueue().filter(i => i.id !== id);
        localStorage.setItem(OUTBOX_KEY, JSON.stringify(queue));
        window.dispatchEvent(new CustomEvent('campusfix:outbox-updated', { detail: { count: queue.length } }));
    } catch (e) {
        console.error('Error removing from offline outbox:', e);
    }
}

export function clearOfflineQueue() {
    try {
        localStorage.removeItem(OUTBOX_KEY);
        window.dispatchEvent(new CustomEvent('campusfix:outbox-updated', { detail: { count: 0 } }));
    } catch (e) {}
}

export function dataUrlToFile(dataUrl, filename = 'photo.jpg') {
    try {
        const arr = dataUrl.split(',');
        const mimeMatch = arr[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, { type: mime });
    } catch (e) {
        console.error('Failed to convert dataUrl to File:', e);
        return null;
    }
}
