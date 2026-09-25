import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

import os from 'os';

function getLocalIp() {
    const ifaces = os.networkInterfaces();
    const candidates = [];
    for (const name in ifaces) {
        if (/virtual|vbox|vmware|pseudo|loopback/i.test(name)) continue;
        for (const net of ifaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                candidates.push({ name, address: net.address });
            }
        }
    }
    const priority = candidates.find(c => /^(ethernet|wi-fi|wlan|lan)$/i.test(c.name.trim())) || candidates[0];
    return priority ? priority.address : 'localhost';
}

const localIp = process.env.VITE_HMR_HOST || getLocalIp();

export default defineConfig({
    server: {
        host: '0.0.0.0',
        hmr: {
            host: localIp,
        },
        cors: true,
    },
    plugins: [
        laravel({
            input: 'resources/js/app.jsx',
            refresh: true,
        }),
        react(),
    ],
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (id.includes('jspdf') || id.includes('exceljs')) {
                            return 'vendor-export';
                        }
                        if (id.includes('recharts')) {
                            return 'vendor-charts';
                        }
                        if (id.includes('@radix-ui') || id.includes('lucide-react')) {
                            return 'vendor-ui';
                        }
                    }
                },
            },
        },
        chunkSizeWarningLimit: 1500,
    },
});