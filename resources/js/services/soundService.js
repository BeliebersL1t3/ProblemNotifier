/**
 * TelunasFix Web Audio & Notification Sound Service
 * Pure Web Audio API synthesized chimes - no external audio files required.
 * Works 100% on HTTP intranet, local Wi-Fi, and HTTPS.
 */

let sharedAudioContext = null;
let lastChimePlayedAt = 0;
const STORAGE_KEY = 'telunas_sound_chime_enabled';

/**
 * Get or initialize Web Audio Context
 */
export function getAudioContext() {
    try {
        if (!sharedAudioContext && typeof window !== 'undefined') {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                sharedAudioContext = new AudioContextClass();
            }
        }
        if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
            sharedAudioContext.resume().catch(() => {});
        }
        return sharedAudioContext;
    } catch (e) {
        return null;
    }
}

// Global user interaction listener to unlock Web Audio API Context across pages
if (typeof window !== 'undefined') {
    const unlockAudio = () => {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
    };
    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
}

/**
 * Check if sound notifications are enabled
 */
export function isSoundEnabled() {
    if (typeof window === 'undefined') return true;
    try {
        const val = localStorage.getItem(STORAGE_KEY);
        return val === null ? true : val !== 'false';
    } catch (e) {
        return true;
    }
}

/**
 * Set sound notifications enabled/disabled
 */
export function setSoundEnabled(enabled) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
        window.dispatchEvent(new CustomEvent('campusfix-sound-pref-changed', {
            detail: { enabled: !!enabled }
        }));
    } catch (e) {}
}

/**
 * Play synthesized notification chime
 * @param {'normal'|'emergency'} type 
 */
export function playNotificationChime(type = 'normal') {
    if (!isSoundEnabled()) return false;

    const now = Date.now();
    // Debounce to prevent acoustic overlap
    if (now - lastChimePlayedAt < 2000) return false;

    const ctx = getAudioContext();
    if (!ctx) return false;

    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }

    lastChimePlayedAt = now;

    const playTone = (freq, startTime, duration, gainVal, waveType = 'sine') => {
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = waveType;
            osc.frequency.setValueAtTime(freq, startTime);

            // Gentle Attack-Decay envelope
            gain.gain.setValueAtTime(0.001, startTime);
            gain.gain.exponentialRampToValueAtTime(gainVal, startTime + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(startTime);
            osc.stop(startTime + duration);
        } catch (e) {}
    };

    try {
        const t = ctx.currentTime;
        if (type === 'emergency') {
            // Urgent 3-tone chime for SOS/Critical alerts (C5 -> E5 -> G5)
            playTone(523.25, t, 0.28, 0.22, 'triangle');
            playTone(659.25, t + 0.14, 0.28, 0.22, 'triangle');
            playTone(783.99, t + 0.28, 0.45, 0.25, 'triangle');
        } else {
            // Elegant 2-tone hospitality chime (E5 -> B5 harmonic chime)
            playTone(659.25, t, 0.25, 0.18, 'sine');
            playTone(987.77, t + 0.16, 0.40, 0.18, 'sine');
        }

        // Haptic feedback for mobile phones (Android)
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
                if (type === 'emergency') {
                    navigator.vibrate([250, 100, 250, 100, 400]);
                } else {
                    navigator.vibrate([200, 80, 200]);
                }
            } catch (e) {}
        }

        return ctx.state === 'running';
    } catch (e) {
        return false;
    }
}

let lastAlertedNotificationId = null;

/**
 * Trigger in-app notification: plays sound + fires event for floating banner
 */
export function triggerNotificationAlert(notification) {
    if (!notification) return;

    if (notification.id && notification.id === lastAlertedNotificationId) {
        return;
    }
    lastAlertedNotificationId = notification.id;

    const isEmergency = 
        notification.type === 'sos' || 
        (notification.title && notification.title.toLowerCase().includes('darurat')) ||
        (notification.title && notification.title.toLowerCase().includes('sos'));

    playNotificationChime(isEmergency ? 'emergency' : 'normal');

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('campusfix-toast-notification', {
            detail: { notification, isEmergency }
        }));
    }
}
