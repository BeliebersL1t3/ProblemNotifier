import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
// Change the import from '@vitejs/plugin-react' to the oxc version:
import react from '@vitejs/plugin-react-oxc';

export default defineConfig({
    server: {
        host: '0.0.0.0',
        hmr: {
            host: '192.168.1.3',
        },
    },
    plugins: [
        laravel({
            input: 'resources/js/app.jsx',
            refresh: true,
        }),
        react(),
    ],
});