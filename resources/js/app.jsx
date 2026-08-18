import '../css/app.css';
import './bootstrap';

import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

import { SlashProvider } from '@/Components/CampusFix/SlashTransition';
import { LanguageProvider } from '@/context/LanguageContext';

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
            <LanguageProvider>
                <SlashProvider>
                    <App {...props} />
                </SlashProvider>
            </LanguageProvider>
        );
    },
    progress: {
        color: '#C9AA71',
    },
});
