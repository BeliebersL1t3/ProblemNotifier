import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
        './resources/js/**/*.jsx',
    ],

    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', ...defaultTheme.fontFamily.sans],
            },
            colors: {
                background: 'var(--background)',
                foreground: 'var(--foreground)',
                surface: 'var(--surface)',
                primary: {
                    DEFAULT: 'var(--primary)',
                    foreground: 'var(--primary-foreground)',
                },
                secondary: {
                    DEFAULT: 'var(--secondary)',
                    foreground: 'var(--secondary-foreground)',
                },
                muted: {
                    DEFAULT: 'var(--muted)',
                    foreground: 'var(--muted-foreground)',
                },
                accent: {
                    DEFAULT: 'var(--accent)',
                    foreground: 'var(--accent-foreground)',
                },
                destructive: {
                    DEFAULT: 'var(--destructive)',
                    foreground: 'var(--destructive-foreground)',
                },
                border: 'var(--border)',
                input: 'var(--input)',
                ring: 'var(--ring)',
                card: {
                    DEFAULT: 'var(--card)',
                    foreground: 'var(--card-foreground)',
                },
                popover: {
                    DEFAULT: 'var(--popover)',
                    foreground: 'var(--popover-foreground)',
                },
                'status-open': {
                    DEFAULT: 'var(--status-open)',
                    foreground: 'var(--status-open-foreground)',
                },
                'status-progress': {
                    DEFAULT: 'var(--status-progress)',
                    foreground: 'var(--status-progress-foreground)',
                },
                'status-solved': {
                    DEFAULT: 'var(--status-solved)',
                    foreground: 'var(--status-solved-foreground)',
                },
            },
            borderRadius: {
                sm: 'calc(var(--radius) - 4px)',
                md: 'calc(var(--radius) - 2px)',
                lg: 'var(--radius)',
                xl: 'calc(var(--radius) + 4px)',
                '2xl': 'calc(var(--radius) + 8px)',
            },
            boxShadow: {
                card: '0 1px 2px 0 oklch(0.2 0.04 265 / 0.06), 0 4px 16px -4px oklch(0.2 0.04 265 / 0.1)',
                'card-hover': '0 2px 4px 0 oklch(0.2 0.04 265 / 0.08), 0 16px 32px -8px oklch(0.2 0.04 265 / 0.18)',
            },
            keyframes: {
                'aura-pulse': {
                    '0%, 100%': { boxShadow: '0 0 15px 5px rgba(239, 68, 68, 0.4), 0 0 30px 10px rgba(239, 68, 68, 0.2)' },
                    '50%': { boxShadow: '0 0 25px 10px rgba(239, 68, 68, 0.7), 0 0 60px 20px rgba(239, 68, 68, 0.4)' },
                }
            },
            animation: {
                'aura': 'aura-pulse 2s ease-in-out infinite',
            },
        },
    },

    plugins: [forms],
};
