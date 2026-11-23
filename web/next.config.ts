import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

// Turbopack otherwise treats the REPOSITORY root (the legacy SPA's lockfile)
// as the workspace and scans files this app does not own.
const root = fileURLToPath(new URL('.', import.meta.url));

const config: NextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    compress: true,

    // The dev server is opened as both localhost and 127.0.0.1 in local work.
    allowedDevOrigins: ['127.0.0.1', 'localhost'],

    async headers() {
        const security = [
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'X-Frame-Options', value: 'DENY' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'X-DNS-Prefetch-Control', value: 'off' },
            {
                key: 'Permissions-Policy',
                value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()',
            },
            {
                key: 'Content-Security-Policy',
                value: [
                    "default-src 'self'",
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                    "font-src 'self' https://fonts.gstatic.com",
                    "img-src 'self' data: blob: https://images.unsplash.com https://*.unsplash.com",
                    "connect-src 'self' ws: wss:",
                    "object-src 'none'",
                    "base-uri 'self'",
                    "form-action 'self'",
                    "frame-ancestors 'none'",
                ].join('; '),
            },
        ];

        return [
            { source: '/:path*', headers: security },
            {
                source: '/sw.js',
                headers: [
                    { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
                    { key: 'Service-Worker-Allowed', value: '/' },
                ],
            },
            {
                source: '/manifest.webmanifest',
                headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }],
            },
        ];
    },

    // The API's origin is read at RUNTIME (`lib/session.ts`), not inlined here.
    //
    // Next's `env` block substitutes the value at BUILD time, so an image built
    // for staging would keep pointing at staging when it is deployed to
    // production — and the failure is a connection refused from a server
    // component, which reads as "the API is down".

    // The Next app is NOT in a workspace with the legacy SPA. The output is
    // standalone so the deploy ships a server, not a directory of sources.
    output: 'standalone',

    // Sized variants for the card/cover images (`CoverImage`). Absolute seeds
    // come from `images.unsplash.com`; uploads resolve to `{API_ORIGIN}/storage`.
    // The API host is runtime (`API_ORIGIN`), so local entries pin the local
    // gateway — a deploy adds its own API host here.
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'images.unsplash.com' },
            { protocol: 'http', hostname: '127.0.0.1', port: '8099', pathname: '/storage/**' },
            { protocol: 'http', hostname: 'localhost', port: '8099', pathname: '/storage/**' },
        ],
    },
    turbopack: {
        root,
    },
    outputFileTracingRoot: root,
};

export default config;
