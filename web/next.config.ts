import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

// Turbopack otherwise treats the REPOSITORY root (the legacy SPA's lockfile)
// as the workspace and scans files this app does not own.
const root = fileURLToPath(new URL('.', import.meta.url));

const config: NextConfig = {
    reactStrictMode: true,

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

        // The ported pages keep `react-router-dom`'s vocabulary (`<Link to>`,
        // `navigate`, `useLocation`) and get Next's router underneath. See
        // `lib/react-router-shim.tsx` for what is deliberately NOT shimmed.
        resolveAlias: {
            'react-router-dom': './lib/react-router-shim.tsx',
        },
    },
    outputFileTracingRoot: root,
};

export default config;
