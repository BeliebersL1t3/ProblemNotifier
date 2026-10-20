import { useState, useEffect } from 'react';
import axios from 'axios';
import { triggerNotificationAlert } from '@/services/soundService';

let state = {
    data: { tickets: [], issues: [], unread_count: 0 },
    loading: false,
};

const listeners = new Set();
let knownIds = null;
let pollInterval = null;
let activeSubscribers = 0;

function notify() {
    listeners.forEach((listener) => {
        try {
            listener({ ...state });
        } catch (e) {
            // Ignore subscriber update error
        }
    });
}

export const fetchNotificationsFeed = async () => {
    // If browser tab is minimized or screen locked, skip polling
    if (typeof document !== 'undefined' && document.hidden) return;

    try {
        const res = await axios.get('/notifications');
        if (res.data) {
            const allItems = [...(res.data.tickets || []), ...(res.data.issues || [])];
            const currentIds = new Set(allItems.map((item) => item.id));

            if (knownIds === null) {
                knownIds = currentIds;
            } else {
                const newUnreadItems = allItems.filter(
                    (item) => !item.is_read && !knownIds.has(item.id)
                );
                if (newUnreadItems.length > 0) {
                    triggerNotificationAlert(newUnreadItems[0]);
                }
                knownIds = currentIds;
            }

            state = { ...state, data: res.data };
            notify();
        }
    } catch (e) {
        // Ignore offline/background polling errors
    }
};

const startPolling = () => {
    if (!pollInterval) {
        fetchNotificationsFeed();
        // Single shared 60s poll for the entire app, regardless of how many headers/dropdowns exist
        pollInterval = setInterval(fetchNotificationsFeed, 60000);
    }
};

const stopPolling = () => {
    if (pollInterval && activeSubscribers <= 0) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
};

// Resume and re-fetch immediately on window focus / tab wake-up
if (typeof window !== 'undefined') {
    const handleVisibility = () => {
        if (!document.hidden && activeSubscribers > 0) {
            fetchNotificationsFeed();
        }
    };
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);
}

export function useNotificationFeed() {
    const [current, setCurrent] = useState(state);

    useEffect(() => {
        activeSubscribers++;
        listeners.add(setCurrent);
        startPolling();

        return () => {
            activeSubscribers--;
            listeners.delete(setCurrent);
            stopPolling();
        };
    }, []);

    const markAsRead = async (id) => {
        // Optimistic UI update across all components
        const prev = state.data;
        const wasUnread = [...prev.tickets, ...prev.issues].some((item) => item.id === id && !item.is_read);
        if (wasUnread) {
            state = {
                ...state,
                data: {
                    ...prev,
                    unread_count: Math.max(0, (prev.unread_count || 1) - 1),
                    tickets: prev.tickets.map((item) => (item.id === id ? { ...item, is_read: true } : item)),
                    issues: prev.issues.map((item) => (item.id === id ? { ...item, is_read: true } : item)),
                },
            };
            notify();
        }

        try {
            await axios.post(`/notifications/${id}/read`);
        } catch (e) {
            console.error('Failed to mark notification as read:', e);
            fetchNotificationsFeed();
        }
    };

    const markAllAsRead = async () => {
        const prev = state.data;
        state = {
            ...state,
            data: {
                ...prev,
                unread_count: 0,
                tickets: prev.tickets.map((item) => ({ ...item, is_read: true })),
                issues: prev.issues.map((item) => ({ ...item, is_read: true })),
            },
        };
        notify();

        try {
            await axios.post('/notifications/read-all');
        } catch (e) {
            console.error('Failed to mark all notifications as read:', e);
            fetchNotificationsFeed();
        }
    };

    return {
        data: current.data,
        loading: current.loading,
        fetchNotifications: fetchNotificationsFeed,
        markAsRead,
        markAllAsRead,
    };
}
