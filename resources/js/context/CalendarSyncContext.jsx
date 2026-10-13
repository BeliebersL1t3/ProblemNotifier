import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePage } from '@inertiajs/react';
import axios from 'axios';

const CalendarSyncContext = createContext({
    syncCountdown: 300,
    formattedCountdown: '05:00',
    isSyncing: false,
    canSync: false,
    triggerSync: async () => {},
    lastSyncedAt: null,
});

const DEFAULT_INTERVAL_SEC = 300; // 5 menit
const STORAGE_KEY_LAST_SYNC = 'telunas_calendar_last_sync_timestamp';
const STORAGE_KEY_LEASE = 'telunas_calendar_sync_lease';
const CHANNEL_NAME = 'telunas_calendar_sync_channel';

export function CalendarSyncProvider({ children }) {
    const { calendar_sync_meta, auth } = usePage().props;
    const user = auth?.user;
    const canSync = Boolean(user && (user.role === 'admin' || user.is_admin || user.is_hod));

    // Anchor: server timestamp reference
    const serverInterval = calendar_sync_meta?.interval_seconds || DEFAULT_INTERVAL_SEC;

    // Track last synced timestamp (epoch milliseconds)
    const [lastSyncTime, setLastSyncTime] = useState(() => {
        if (calendar_sync_meta?.last_synced_at) {
            return calendar_sync_meta.last_synced_at * 1000;
        }
        const cached = localStorage.getItem(STORAGE_KEY_LAST_SYNC);
        return cached ? parseInt(cached, 10) : Date.now();
    });

    const [isSyncing, setIsSyncing] = useState(false);
    const [syncCountdown, setSyncCountdown] = useState(DEFAULT_INTERVAL_SEC);

    const isSyncingRef = useRef(false);
    isSyncingRef.current = isSyncing;

    // BroadcastChannel reference for cross-tab communication
    const channelRef = useRef(null);

    // Initialize BroadcastChannel
    useEffect(() => {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            const ch = new BroadcastChannel(CHANNEL_NAME);
            ch.onmessage = (event) => {
                if (event.data?.type === 'SYNC_COMPLETED') {
                    const newTime = event.data.timestamp;
                    setLastSyncTime(newTime);
                    setIsSyncing(false);
                    // Dispatch a custom event on window for components like Calendar.jsx
                    window.dispatchEvent(new CustomEvent('telunas:calendar-synced', { detail: event.data }));
                } else if (event.data?.type === 'SYNC_STARTED') {
                    setIsSyncing(true);
                }
            };
            channelRef.current = ch;

            return () => {
                ch.close();
            };
        }
    }, []);

    // Update lastSyncTime if calendar_sync_meta from Inertia props updates
    useEffect(() => {
        if (calendar_sync_meta?.last_synced_at) {
            const serverMillis = calendar_sync_meta.last_synced_at * 1000;
            setLastSyncTime(prev => {
                // If server millis is newer, align with server
                if (serverMillis > prev) {
                    localStorage.setItem(STORAGE_KEY_LAST_SYNC, String(serverMillis));
                    return serverMillis;
                }
                return prev;
            });
        }
    }, [calendar_sync_meta]);

    // Leader election / lease to prevent multiple tabs from syncing at the exact same moment
    const acquireLease = () => {
        const now = Date.now();
        const existing = parseInt(localStorage.getItem(STORAGE_KEY_LEASE) || '0', 10);
        // If lease is held and still active (less than 25s old), do not acquire
        if (existing && now - existing < 25000) {
            return false;
        }
        localStorage.setItem(STORAGE_KEY_LEASE, String(now));
        return true;
    };

    // The actual sync trigger
    const triggerSync = useCallback(async (silent = true) => {
        if (!canSync || isSyncingRef.current) return;

        // Try to acquire lease
        if (!acquireLease()) {
            return;
        }

        setIsSyncing(true);
        if (channelRef.current) {
            channelRef.current.postMessage({ type: 'SYNC_STARTED' });
        }

        try {
            const res = await axios.post('/api/operations/pull-calendar', { silent });
            const nowMillis = (res.data?.last_synced_at ? res.data.last_synced_at * 1000 : Date.now());

            setLastSyncTime(nowMillis);
            localStorage.setItem(STORAGE_KEY_LAST_SYNC, String(nowMillis));

            // Notify all tabs
            if (channelRef.current) {
                channelRef.current.postMessage({
                    type: 'SYNC_COMPLETED',
                    timestamp: nowMillis,
                    data: res.data?.data,
                });
            }
            window.dispatchEvent(new CustomEvent('telunas:calendar-synced', { detail: res.data }));
            return res.data;
        } catch (err) {
            // In case of error (e.g. rate limit), still update lastSyncTime to prevent rapid spamming
            const nowMillis = Date.now();
            setLastSyncTime(nowMillis);
            localStorage.setItem(STORAGE_KEY_LAST_SYNC, String(nowMillis));
            if (channelRef.current) {
                channelRef.current.postMessage({ type: 'SYNC_COMPLETED', timestamp: nowMillis });
            }
            window.dispatchEvent(new CustomEvent('telunas:calendar-synced', { detail: { error: err.message } }));
        } finally {
            setIsSyncing(false);
            localStorage.removeItem(STORAGE_KEY_LEASE);
        }
    }, [canSync]);

    // 1-second accurate ticker calculated from true elapsed time against server anchor
    useEffect(() => {
        if (!canSync) return;

        const updateTick = () => {
            const now = Date.now();
            const elapsedSec = Math.floor((now - lastSyncTime) / 1000);
            const remaining = Math.max(0, serverInterval - (elapsedSec % serverInterval));

            setSyncCountdown(remaining);

            // When countdown hits 0 (or elapsed exceeds interval) and not currently syncing, trigger universal sync
            if (remaining === 0 && !isSyncingRef.current && elapsedSec >= serverInterval) {
                triggerSync(true);
            }
        };

        updateTick();
        const intervalId = setInterval(updateTick, 1000);

        return () => {
            clearInterval(intervalId);
        };
    }, [canSync, lastSyncTime, serverInterval, triggerSync]);

    const formatCountdown = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const formattedCountdown = formatCountdown(syncCountdown);

    return (
        <CalendarSyncContext.Provider
            value={{
                syncCountdown,
                formattedCountdown,
                isSyncing,
                canSync,
                triggerSync,
                lastSyncedAt: new Date(lastSyncTime),
                formatCountdown,
            }}
        >
            {children}
        </CalendarSyncContext.Provider>
    );
}

export function useCalendarSync() {
    return useContext(CalendarSyncContext);
}
