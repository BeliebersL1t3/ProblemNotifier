import axios from 'axios';

/**
 * Convert base64 VAPID public key string to Uint8Array
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Check if Web Push & Service Workers are supported on current device / browser
 */
export function isPushNotificationSupported() {
    return (
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window
    );
}

/**
 * Register Service Worker (/sw.js)
 */
export async function registerServiceWorker() {
    if (!isPushNotificationSupported()) return null;
    try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
        });
        return registration;
    } catch (error) {
        console.warn('Failed to register service worker:', error);
        return null;
    }
}

/**
 * Get current push subscription if active
 */
export async function getCurrentPushSubscription() {
    if (!isPushNotificationSupported()) return null;
    try {
        const registration = await navigator.serviceWorker.ready;
        return await registration.pushManager.getSubscription();
    } catch (e) {
        return null;
    }
}

/**
 * Detect friendly device name (e.g., "Chrome on Windows", "Safari on iPhone")
 */
function getDeviceLabel() {
    const ua = navigator.userAgent;
    let browser = 'Browser';
    if (ua.includes('Edg/')) browser = 'Edge';
    else if (ua.includes('Chrome/')) browser = 'Chrome';
    else if (ua.includes('Safari/')) browser = 'Safari';
    else if (ua.includes('Firefox/')) browser = 'Firefox';

    let os = 'Device';
    if (ua.includes('iPhone')) os = 'iPhone';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('Windows')) os = 'Windows PC';
    else if (ua.includes('Macintosh')) os = 'Mac';

    return `${browser} on ${os}`;
}

/**
 * Subscribe current device to Web Push
 */
export async function subscribeToPushNotifications() {
    if (!isPushNotificationSupported()) {
        throw new Error('Perangkat atau browser ini tidak mendukung Web Push Notification.');
    }

    // 1. Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        throw new Error(
            permission === 'denied'
                ? 'Izin notifikasi diblokir di browser. Buka setelan browser untuk mengaktifkannya.'
                : 'Izin notifikasi tidak diberikan.'
        );
    }

    // 2. Register Service Worker & get ready instance
    await registerServiceWorker();
    const registration = await navigator.serviceWorker.ready;

    // 3. Get VAPID public key from backend
    const { data: keyData } = await axios.get('/api/push-subscriptions/vapid-public-key');
    if (!keyData?.publicKey) {
        throw new Error('Kunci VAPID belum dikonfigurasi di server.');
    }

    const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);

    // 4. Subscribe via PushManager
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
        });
    }

    // 5. Send subscription keys to server
    const rawSub = subscription.toJSON();
    await axios.post('/api/push-subscriptions', {
        endpoint: subscription.endpoint,
        keys: {
            p256dh: rawSub.keys?.p256dh,
            auth: rawSub.keys?.auth,
        },
        device_name: getDeviceLabel(),
    });

    return subscription;
}

/**
 * Unsubscribe current device
 */
export async function unsubscribeFromPushNotifications() {
    if (!isPushNotificationSupported()) return;

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            await axios.post('/api/push-subscriptions/delete', {
                endpoint: subscription.endpoint,
            });
            await subscription.unsubscribe();
        }
    } catch (error) {
        console.warn('Failed to unsubscribe push notifications:', error);
    }
}

/**
 * Send test push notification to user's registered device
 */
export async function sendTestPushNotification() {
    const response = await axios.post('/api/push-subscriptions/test');
    return response.data;
}
