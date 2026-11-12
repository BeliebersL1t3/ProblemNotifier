import { useState, useEffect, useCallback } from 'react';

export const LEAN_THEME_STORAGE_KEY = 'telunas_field_theme';
const LEAN_THEME_EVENT = 'telunas-theme-changed';

export function readStoredLeanTheme() {
    if (typeof window === 'undefined') return 'dark';
    try {
        return localStorage.getItem(LEAN_THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
    } catch (err) {
        console.warn('[useLeanTheme] Unable to read theme from localStorage:', err);
        return 'dark';
    }
}

export function useLeanTheme() {
    const [theme, setThemeState] = useState(readStoredLeanTheme);

    useEffect(() => {
        const handleCustomEvent = (e) => {
            const nextTheme = e?.detail?.theme;
            if (nextTheme === 'light' || nextTheme === 'dark') {
                setThemeState(nextTheme);
            } else {
                setThemeState(readStoredLeanTheme());
            }
        };

        const handleStorageEvent = (e) => {
            if (!e.key || e.key === LEAN_THEME_STORAGE_KEY) {
                setThemeState(readStoredLeanTheme());
            }
        };

        window.addEventListener(LEAN_THEME_EVENT, handleCustomEvent);
        window.addEventListener('storage', handleStorageEvent);
        return () => {
            window.removeEventListener(LEAN_THEME_EVENT, handleCustomEvent);
            window.removeEventListener('storage', handleStorageEvent);
        };
    }, []);

    const setTheme = useCallback((nextOrUpdater) => {
        setThemeState((prev) => {
            const resolved = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
            const normalized = resolved === 'light' ? 'light' : 'dark';
            try {
                localStorage.setItem(LEAN_THEME_STORAGE_KEY, normalized);
            } catch (err) {
                console.warn('[useLeanTheme] Unable to persist theme to localStorage:', err);
            }
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent(LEAN_THEME_EVENT, { detail: { theme: normalized } }));
            }
            return normalized;
        });
    }, []);

    const toggleTheme = useCallback(() => {
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    }, [setTheme]);

    return {
        theme,
        setTheme,
        toggleTheme,
        isDark: theme === 'dark',
    };
}

export default useLeanTheme;

