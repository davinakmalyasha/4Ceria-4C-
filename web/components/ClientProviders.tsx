'use client';

/**
 * Client-only bootstrap that must run BEFORE any component's effects.
 *
 * It is an empty component on purpose: its value is the import below, whose
 * module body configures `axios` once. Putting that in a `useEffect` would run
 * it after every page's first request (React runs child effects first), and
 * putting it in a server component only makes the bundler keep a reference
 * without executing it in the browser.
 */
import '@/lib/axios-bootstrap';
import type { ReactNode } from 'react';

export function ClientProviders({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
