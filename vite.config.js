import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
// Change the import from '@vitejs/plugin-react' to the oxc version:
import react from '@vitejs/plugin-react-oxc';

export default defineConfig({
    plugins: [
        laravel({
            input: 'resources/js/app.jsx', // or app.tsx
            refresh: true,
        }),
        react(),
    ],
});