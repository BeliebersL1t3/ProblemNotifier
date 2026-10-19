import '../css/app.css';
import './bootstrap';

import { createInertiaApp, router } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

// Intercept non-Inertia or 403 responses and force a full hard redirect
// to prevent Inertia from displaying the restriction page inside a dismissable dialog
router.on('invalid', (event) => {
    const status = event.detail.response?.status;
    if (status === 403) {
        event.preventDefault();
        window.location.href = '/telunas-wifi-required';
    }
});

import { SlashProvider } from '@/Components/CampusFix/SlashTransition';
import { LanguageProvider } from '@/context/LanguageContext';
import { CalendarSyncProvider } from '@/context/CalendarSyncContext';
import { ErrorBoundary } from '@/Components/CampusFix/ErrorBoundary';
import { registerServiceWorker } from '@/services/webPushService';

// Automatically register service worker for PWA & Web Push
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        registerServiceWorker();
    });
}

createInertiaApp({
    title: (title) => `${title} - ${appName}`,
    resolve: (name) =>
        resolvePageComponent(
            `./Pages/${name}.jsx`,
            import.meta.glob('./Pages/**/*.jsx'),
        ),
    setup({ el, App, props }) {
        const root = createRoot(el);

        root.render(
            <ErrorBoundary>
                <LanguageProvider>
                    <CalendarSyncProvider initialProps={props.initialPage?.props}>
                        <SlashProvider>
                            <App {...props} />
                        </SlashProvider>
                    </CalendarSyncProvider>
                </LanguageProvider>
            </ErrorBoundary>
        );
    },
    progress: {
        color: '#C9AA71',
    },
});
