'use client';

/**
 * `react-router-dom`, on Next's router.
 *
 * WHY A SHIM RATHER THAN A REWRITE
 * --------------------------------
 * The dashboard is 38 tabs and roughly 300 components, and they all navigate
 * the same three ways: `<Link to>`, `navigate(path)`, and `useLocation()`. The
 * port's navigation semantics are IDENTICAL — the only difference is which
 * library spells them — so rewriting 300 call sites by hand would be 300
 * opportunities to change a route, in exchange for nothing a reviewer can
 * verify.
 *
 * This module maps the three primitives onto `next/link` and
 * `next/navigation`, and `next.config.ts` aliases `react-router-dom` to it. A
 * component therefore keeps its own code and gains the real router: URLs are
 * shareable, the back button works, and a server component can render the page
 * the URL names.
 *
 * WHAT IT IS NOT
 * --------------
 * It is not a general compatibility layer. Nested `<Routes>`, loaders, route
 * matching and `useParams` on a matched route are NOT here — the pages that
 * need them are the ones the port renders itself. Adding them "just in case"
 * would make the alias silently lie about what works.
 */

import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createElement, useEffect, type AnchorHTMLAttributes, type ReactNode } from 'react';

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    replace?: boolean;
    children?: ReactNode;
};

export function Link({ to, replace: _replace, children, ...rest }: LinkProps) {
    return createElement(NextLink, { href: to, ...rest }, children);
}

type NavigateOptions = { replace?: boolean; state?: unknown };

export function useNavigate() {
    const router = useRouter();

    return (to: string | number, options?: NavigateOptions) => {
        if (typeof to === 'number') {
            if (to < 0) {
                router.back();
            } else {
                router.forward();
            }

            return;
        }

        if (options?.replace) {
            router.replace(to);
        } else {
            router.push(to);
        }
    };
}

/**
 * The current location.
 *
 * The PATH comes from `usePathname()`, which the server knows — so a component
 * that styles itself by route renders the correct markup on the first paint
 * instead of correcting itself after hydration. Reading `window` here would
 * make the server render '/' and the client render '/admin', which is a
 * hydration mismatch and a visible flash.
 *
 * The QUERY is read from `window`, because `useSearchParams()` forces a
 * Suspense boundary around every consumer, and a navigation helper should not
 * change what renders while a page streams. It is only used for optional
 * detail (a chat user, a project id), never for layout.
 */
export function useLocation() {
    const pathname = usePathname();
    const search = typeof window === 'undefined' ? '' : window.location.search;

    return { pathname: pathname ?? '/', search, state: null, key: 'default', hash: '' };
}

/** `<Navigate to>` as an effect: render nothing, then go. */
export function Navigate({ to, replace = false }: { to: string; replace?: boolean }) {
    const router = useRouter();

    useEffect(() => {
        if (replace) {
            router.replace(to);
        } else {
            router.push(to);
        }
    }, [router, to, replace]);

    return null;
}

export default { Link, useNavigate, useLocation, Navigate };
