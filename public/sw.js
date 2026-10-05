/**
 * Telunas Fix - Web Push Service Worker
 */

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    let payload = {};
    if (event.data) {
        try {
            payload = event.data.json();
        } catch (e) {
            payload = { title: 'Telunas Fix', body: event.data.text() };
        }
    }

    const title = payload.title || 'Telunas Fix';
    const options = {
        body: payload.body || 'Ada informasi tiket baru di Telunas Issue Tracker.',
        icon: payload.icon || '/logo.png',
        badge: payload.badge || '/logo.png',
        tag: payload.tag || 'telunas-notification',
        vibrate: payload.vibrate || [200, 100, 200],
        renotify: true,
        requireInteraction: !!payload.requireInteraction,
        data: payload.data || { url: '/dashboard' },
        timestamp: payload.timestamp || Date.now(),
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/dashboard';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // If any window with matching origin is open, navigate and focus it
            for (const client of windowClients) {
                if ('focus' in client) {
                    if ('navigate' in client) {
                        client.navigate(targetUrl);
                    }
                    return client.focus();
                }
            }
            // Otherwise, open a new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
