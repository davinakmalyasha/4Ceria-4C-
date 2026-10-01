import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const pwaPlugin = VitePWA({
        strategies: 'injectManifest',
        srcDir: 'resources/js',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        injectManifest: {
            globPatterns: ['**/*.{js,css,html,png,svg,webp,woff2}'],
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
            // LAZY-ONLY LIBRARIES. RETURN `undefined` SO THE DYNAMIC IMPORT WINS.
            //
            // The three PDF/canvas call sites are all already correct --
            // `await import('jspdf')` at utils/exporters.ts:35,
            // QuoteHistoryTab.tsx:83 and FinalHandover.tsx:162. The dynamic
            // import boundary was then UNDONE by the `return 'vendor'`
            // catch-all below, because a manual-chunk assignment takes
            // precedence over Rollup's own code splitting.
            //
            // Verified against the committed build: the eager `vendor-*.js` chunk
            // held 92 jsPDF hits and 23 html2canvas hits, while every feature
            // chunk that needs them held zero -- a single copy, in the chunk
            // `index.html` modulepreloads. ~530 KB raw / ~200 KB gzip of PDF
            // machinery, downloaded and parsed on the landing page by every
            // visitor, for a feature behind a button.
            //
            // `undefined` is the documented way to opt a module out of a
            // catch-all chunk, so Rollup places it in its own async chunk and
            // fetches it on first use.
            if (id.includes('jspdf') || id.includes('html2canvas')) {
                return undefined;
            }
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
                    // `resources/css/app.css` IS THE ONLY FILE WITH `@tailwind`
                    // DIRECTIVES. Without it in this input list, the standalone
                    // build emitted `index-*.css` from `resources/css/index.css`
                    // alone -- confirmed to contain no `--tw-` variable and no
                    // `.container{` rule -- so the frontend Vercel serves shipped
                    // with NO Tailwind at all. The Laravel build listed the file,
                    // which is why this was invisible locally: the two modes
                    // silently disagreed.
                    input: ['index.html', 'resources/css/app.css'],
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

