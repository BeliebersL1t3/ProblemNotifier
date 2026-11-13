/**
 * Telunas Fix - Offline-First Service Worker (v4)
 * Caches app shell, Vite build assets, maps, and handles offline outbox & web push.
 */

const SHELL_CACHE_NAME = 'telunas-shell-v4';
const MAPS_CACHE_NAME = 'telunas-maps-v4';

const PRECACHE_ASSETS = [
    '/logo.png',
    '/hktyc.png',
    '/site.webmanifest',
    '/images/maps/tpi_masterplan_v2.png',
    '/images/maps/tbr_masterplan.png',
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        Promise.all([
            caches.open(SHELL_CACHE_NAME).then((cache) => {
                return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                    console.warn('[SW] Pre-caching shell assets warning:', err);
                });
            }),
        ])
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((keys) => {
                return Promise.all(
                    keys.map((key) => {
                        if (
                            (key.startsWith('telunas-shell-') && key !== SHELL_CACHE_NAME) ||
                            (key.startsWith('telunas-maps-') && key !== MAPS_CACHE_NAME)
                        ) {
                            console.log('[SW] Deleting legacy cache:', key);
                            return caches.delete(key);
                        }
                    })
                );
            }),
        ])
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle HTTP/HTTPS same-origin requests
    if (!url.protocol.startsWith('http') || url.origin !== self.location.origin) {
        return;
    }

    // Do NOT intercept POST, PUT, DELETE, etc.
    if (request.method !== 'GET') {
        return;
    }

    // 1. Navigation requests (HTML pages): Network-First with Cache Fallback
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(SHELL_CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        }).catch((cacheErr) => {
                            console.warn('[SW] Failed to cache page HTML:', cacheErr);
                        });
                    }
                    return networkResponse;
                })
                .catch(async (netErr) => {
                    console.log('[SW] Network failed for navigation, falling back to cache:', url.pathname);
                    const cache = await caches.open(SHELL_CACHE_NAME);
                    const cachedResponse = await cache.match(request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Fallback to root or /lapangan cache if specific URL not cached
                    const fallback = await cache.match('/') || await cache.match('/lapangan');
                    if (fallback) {
                        return fallback;
                    }
                    throw netErr;
                })
        );
        return;
    }

    // 2. Vite hashed assets (/build/assets/): Cache-First
    if (url.pathname.startsWith('/build/assets/')) {
        event.respondWith(
            caches.open(SHELL_CACHE_NAME).then(async (cache) => {
                const cached = await cache.match(request);
                if (cached) return cached;

                try {
                    const fetched = await fetch(request);
                    if (fetched && fetched.status === 200) {
                        cache.put(request, fetched.clone());
                    }
                    return fetched;
                } catch (fetchErr) {
                    console.warn('[SW] Failed to fetch build asset:', url.pathname, fetchErr);
                    throw fetchErr;
                }
            })
        );
        return;
    }

    // 3. Map images: Cache-First
    if (url.pathname.startsWith('/images/maps/')) {
        event.respondWith(
            caches.open(MAPS_CACHE_NAME).then(async (cache) => {
                const cached = await cache.match(request);
                if (cached) return cached;

                try {
                    const fetched = await fetch(request);
                    if (fetched && fetched.status === 200) {
                        cache.put(request, fetched.clone());
                    }
                    return fetched;
                } catch (fetchErr) {
                    console.warn('[SW] Failed to fetch map asset:', url.pathname, fetchErr);
                    if (cached) return cached;
                    throw fetchErr;
                }
            })
        );
        return;
    }

    // 4. Other static images, fonts, icons: Stale-While-Revalidate
    if (
        url.pathname.match(/\.(png|jpg|jpeg|svg|webp|gif|ico|woff|woff2|ttf|otf|eot)$/) ||
        url.pathname === '/site.webmanifest'
    ) {
        event.respondWith(
            caches.open(SHELL_CACHE_NAME).then(async (cache) => {
                const cached = await cache.match(request);
                const fetchPromise = fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        cache.put(request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch((fetchErr) => {
                    console.warn('[SW] SWR fetch failed for asset:', url.pathname, fetchErr);
                    return cached;
                });

                return cached || fetchPromise;
            })
        );
        return;
    }
});

self.addEventListener('push', (event) => {
    let payload = {};
    if (event.data) {
        try {
            payload = event.data.json();
        } catch (e) {
            console.warn('[SW] Push payload not JSON, falling back to text:', e);
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
        data: payload.data || { url: '/' },
        timestamp: payload.timestamp || Date.now(),
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (const client of windowClients) {
                if ('focus' in client) {
                    if ('navigate' in client) {
                        client.navigate(targetUrl);
                    }
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
