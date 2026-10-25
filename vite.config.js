import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
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
                // Tailwind v4 runs as a Vite plugin, not a PostCSS plugin.
                // Both build modes need it: a stylesheet that only exists in
                // one of them is how the standalone build shipped without
                // Tailwind at all.
                tailwindcss(),
                pwaPlugin
            ],
            build: {
                outDir: 'dist',
                rollupOptions: {
                    // `resources/css/app.css` is imported by `resources/js/app.tsx`,
                    // so it is already in the module graph and needs no entry of
                    // its own.
                    //
                    // It USED to be listed here as a separate input, and that is
                    // what silently shipped a Tailwind-free build to Vercel:
                    // Vite emits no `<link>` element for a CSS-only entry, so
                    // `dist/index.html` referenced only `index-*.css` (the custom
                    // theme) and never the 206 kB Tailwind bundle that sat
                    // next to it in `dist/assets/`, referenced only by
                    // `sw.js`/`manifest.json`. The committed build proved it:
                    // `index-DnKoKolg.css` held 0 `--tw-` variables.
                    input: ['index.html'],
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
                // `resources/css/app.css` is imported by `resources/js/app.tsx`.
                // Listing it here as well made it a SECOND entry, and a CSS
                // entry produces a second stylesheet with no `<link>` for it in
                // the emitted HTML — the same defect as the standalone build,
                // just less visible because the Laravel blade template linked
                // the file by hand.
                input: [
                    'resources/js/app.tsx',
                ],
                refresh: true,
            }),
            react(),
            tailwindcss(),
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

