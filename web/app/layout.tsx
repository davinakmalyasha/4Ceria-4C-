import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { PwaProvider } from '@/components/pwa/PwaProvider';
import { PwaStatus } from '@/components/pwa/PwaStatus';

/**
 * The document shell.
 *
 * The metadata describes the installed application as well as the web page:
 * 4Ceria is a PWA, so the manifest, icons, theme colour and standalone display
 * mode are part of the product surface, not decoration.
 */
export const metadata: Metadata = {
    metadataBase: new URL(process.env.SITE_URL ?? 'http://127.0.0.1:3000'),
    applicationName: '4Ceria',
    title: {
        default: '4Ceria — Construction, coordinated',
        template: '%s · 4Ceria',
    },
    description:
        'One workspace for construction: verified professionals, escrow-protected milestones, building materials, logistics and a project ledger.',
    manifest: '/manifest.webmanifest',
    keywords: [
        'construction marketplace',
        'contractor bidding',
        'escrow',
        'project management',
        'building materials',
        'Indonesia construction',
    ],
    icons: {
        icon: [
            { url: '/favicon.ico', sizes: 'any' },
            { url: '/pwa-192x192.png', type: 'image/png', sizes: '192x192' },
            { url: '/pwa-512x512.png', type: 'image/png', sizes: '512x512' },
        ],
        apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    appleWebApp: {
        capable: true,
        title: '4Ceria',
        statusBarStyle: 'default',
    },
    openGraph: {
        type: 'website',
        siteName: '4Ceria',
        title: '4Ceria — Construction, coordinated',
        description:
            'Bidding, escrow, materials and logistics in one workspace for owners and verified professionals.',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: '4Ceria Portal' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: '4Ceria — Construction, coordinated',
        description:
            'Bidding, escrow, materials and logistics in one workspace for owners and verified professionals.',
        images: ['/og.png'],
    },
    formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
    themeColor: '#0f172a',
    colorScheme: 'light',
    viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="id" data-scroll-behavior="smooth">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body className="antialiased">
                <PwaProvider>
                    {children}
                    <PwaStatus />
                </PwaProvider>
            </body>
        </html>
    );
}
