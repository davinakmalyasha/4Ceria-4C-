/**
 * A client-safe asset resolver.
 *
 * `lib/assets.ts` reads the API origin from `lib/session.ts`, which imports
 * `next/headers` and therefore cannot be pulled into a client bundle. A browser
 * island that needs to resolve a stored path receives the origin as a prop and
 * calls this pure function instead.
 */
export function resolveAsset(base: string, value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    if (/^https?:\/\//i.test(value)) {
        // Uploaded bytes are served by the same-origin Next proxy. If the API
        // returned an absolute origin for a `/storage/` path, keep only the
        // path so the browser does not depend on the API host.
        try {
            const parsed = new URL(value);
            if (parsed.pathname.startsWith('/storage/')) {
                return `${parsed.pathname}${parsed.search}`;
            }
        } catch {
            // Not a URL after all; fall through.
        }

        return value;
    }

    // The API sometimes returns the full `/storage/...` path and sometimes a
    // bare relative path. Do not double-prefix either form.
    if (value.startsWith('/storage/')) {
        return value;
    }

    if (value.startsWith('storage/')) {
        return `/${value}`;
    }

    return `${base.replace(/\/+$/, '')}/storage/${value.replace(/^\/+/, '')}`;
}
