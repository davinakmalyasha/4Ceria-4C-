import type { Metadata } from 'next';
import '@/styles/globals.css';
import { ToastProvider } from '@/content/context/ToastContext';
import { ClientProviders } from '@/components/ClientProviders';

/**
 * The document shell.
 *
 * IT REPRODUCES THE LEGACY SHELL, because the body's `antialiased` class is
 * part of the design: it switches the whole page to grayscale antialiasing, and
 * dropping it changes every glyph edge on every screen.
 *
 * `lang` matches `resources/views/app.blade.php`. The title is the legacy one —
 * the port is not an opportunity to rename the product.
 *
 * THE FONT. Plus Jakarta Sans, from the same stylesheet URL and the same five
 * weights as the legacy template. `next/font` would self-host it, which is
 * better for latency and privacy — but it ships ITS copy of the files, and the
 * port's contract is that the glyphs are the ones the baseline was captured
 * from. Moving the font is a design change (ADR-0021), not a porting decision.
 *
 * The visual harness fulfils this request from the files committed under
 * `tools/visual/fixtures/fonts`, so the gate does not depend on the CDN.
 */
export const metadata: Metadata = {
    title: '4C Project',
    description: 'Construction coordination and real estate marketplace.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body className="antialiased">
                {/* The toast host is global, as it is in the legacy tree: any
                    component may raise one, and it must survive a route
                    change. The AUTH provider is per page, because it carries
                    the user the server resolved for that request. */}
                <ClientProviders>
                    <ToastProvider>{children}</ToastProvider>
                </ClientProviders>
            </body>
        </html>
    );
}
