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
        return value;
    }

    return `${base.replace(/\/+$/, '')}/storage/${value.replace(/^\/+/, '')}`;
}
