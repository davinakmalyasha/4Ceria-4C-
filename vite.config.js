import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const pwaPlugin = VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        workbox: {
            globPatterns: ['**/*.{js,css,html,png,svg,webp,woff2}'],
            runtimeCaching: [
                {
                    urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                    handler: 'CacheFirst',
                    options: {
                        cacheName: 'google-fonts-stylesheets',
                        expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
                    }
                },
                {
                    urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                    handler: 'CacheFirst',
                    options: {
                        cacheName: 'google-fonts-webfonts',
                        expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }
                    }
                }
            ]
        },
        manifest: {
            name: '4Ceria Portal',
            short_name: '4Ceria',
            description: 'Construction Coordination & Real Estate Portal',
            theme_color: '#09090b',
            background_color: '#09090b',
            display: 'standalone',
            scope: '/',
            start_url: '/',
            icons: [
                { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }
            ]
        }
    });

    // Shared vendor chunking so BOTH build modes produce identical caching
    // behavior (the standalone/Vercel build previously shipped one monolithic
    // bundle with maplibre inline).
    const manualChunks = (id) => {
        if (id.includes('node_modules')) {
            if (id.includes('maplibre-gl') || id.includes('mapbox-gl') || id.includes('leaflet')) {
                return 'vendor-maps';
            }
            if (id.includes('lucide-react')) {
                return 'vendor-icons';
            }
            if (id.includes('framer-motion')) {
                return 'vendor-animations';
            }
            return 'vendor';
        }
    };

    // Enable standalone SPA build for Vercel/frontend hosting
    if (process.env.VITE_STANDALONE === 'true' || mode === 'frontend') {
        return {
            plugins: [
                react(),
                pwaPlugin
            ],
            build: {
                outDir: 'dist',
                rollupOptions: {
                    input: 'index.html',
                    output: {
                        manualChunks,
                    },
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
            pwaPlugin
        ],
        build: {
            rollupOptions: {
                output: {
                    manualChunks,
                }
            }
        }
    };
});

