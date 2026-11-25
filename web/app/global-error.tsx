'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary for failures in the root layout itself.
 *
 * This file replaces the root layout when active, so it must be
 * self-contained: its own <html>/<body>, no layout providers, no global
 * stylesheet dependency beyond inline utility classes. A plain <a> is used
 * instead of <Link> because router context may be the thing that broke.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    const digest =
        error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;

    return (
        <html lang="id">
            <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fafafa' }}>
                <title>Something went wrong · 4Ceria</title>
                <main
                    style={{
                        minHeight: '100vh',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '48px 24px',
                    }}
                >
                    <div style={{ maxWidth: 440, textAlign: 'center' }}>
                        <p
                            style={{
                                display: 'inline-block',
                                fontSize: 11,
                                fontWeight: 800,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: '#92400e',
                                background: '#fef3c7',
                                border: '1px solid #fcd34d',
                                borderRadius: 999,
                                padding: '6px 16px',
                            }}
                        >
                            Something went wrong
                        </p>
                        <h1
                            style={{
                                marginTop: 20,
                                fontSize: 28,
                                fontWeight: 900,
                                letterSpacing: '-0.02em',
                                color: '#171717',
                            }}
                        >
                            4Ceria could not start this page.
                        </h1>
                        <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, color: '#737373' }}>
                            Retrying is safe — no form has been submitted twice.
                            {digest ? (
                                <>
                                    <br />
                                    <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                        Reference {digest}
                                    </span>
                                </>
                            ) : null}
                        </p>
                        <div
                            style={{
                                marginTop: 32,
                                display: 'flex',
                                gap: 12,
                                justifyContent: 'center',
                                flexWrap: 'wrap',
                            }}
                        >
                            <button
                                type="button"
                                onClick={retry}
                                style={{
                                    background: '#171717',
                                    color: '#fff',
                                    border: 0,
                                    borderRadius: 12,
                                    padding: '12px 20px',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                Try again
                            </button>
                            <a
                                href="/"
                                style={{
                                    display: 'inline-block',
                                    background: '#fff',
                                    color: '#404040',
                                    border: '1px solid #e5e5e5',
                                    borderRadius: 12,
                                    padding: '12px 20px',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    textDecoration: 'none',
                                }}
                            >
                                Back to home
                            </a>
                        </div>
                    </div>
                </main>
            </body>
        </html>
    );
}
