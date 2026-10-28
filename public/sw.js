/**
 * Telunas Fix - Web Push & Static Map Cache Service Worker
 */

const MAPS_CACHE_NAME = 'telunas-maps-cache-v1';
const MAPS_ASSETS = [
    '/images/maps/tpi_masterplan_v2.png',
    '/images/maps/tbr_masterplan.png',
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(MAPS_CACHE_NAME).then((cache) => {
            return cache.addAll(MAPS_ASSETS).catch((err) => {
                console.warn('[SW] Pre-caching maps failed (will fetch on demand):', err);
            });
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((keys) => {
                return Promise.all(
                    keys.map((key) => {
                        if (key.startsWith('telunas-maps-cache-') && key !== MAPS_CACHE_NAME) {
                            return caches.delete(key);
                        }
                    })
                );
            }),
        ])
    );
});

// Cache-First strategy for map images
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.origin === self.location.origin && url.pathname.startsWith('/images/maps/')) {
        event.respondWith(
            caches.open(MAPS_CACHE_NAME).then(async (cache) => {
                const cachedResponse = await cache.match(event.request);
                if (cachedResponse) {
                    return cachedResponse;
                }
                try {
                    const networkResponse = await fetch(event.request);
                    if (networkResponse && networkResponse.status === 200) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                } catch (err) {
                    return cachedResponse;
                }
            })
        );
    }
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
