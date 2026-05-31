import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Enable standalone SPA build for Vercel/frontend hosting
    if (process.env.VITE_STANDALONE === 'true' || mode === 'frontend') {
        return {
            plugins: [react()],
            build: {
                outDir: 'dist',
                rollupOptions: {
                    input: 'index.html',
                },
            },
        };
    }

    // Default Laravel integration build
    return {
        plugins: [
            laravel({
                input: [
                    'resources/css/app.css',
                    'resources/js/app.tsx',
                ],
                refresh: true,
            }),
            react(),
        ],
    };
});

