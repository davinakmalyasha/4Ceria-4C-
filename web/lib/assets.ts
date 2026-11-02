import { apiOrigin } from './session';
import { resolveAsset } from './assetUrl';

/**
 * Resolve a stored asset path to a browser URL.
 *
 * Rows carry either an absolute URL (unsplash, CDN) or a relative disk path
 * (`uploads/house/…`). Relative paths live on the API origin, never on the Next
 * host, so they must be prefixed before they reach an `<img src>`.
 *
 * SERVER ONLY: `apiOrigin()` lives in `lib/session.ts`, which reads the httpOnly
 * cookie. A client component must import `resolveAsset` from `lib/assetUrl`
 * instead and receive the origin as a prop.
 */
export function assetUrl(value: string | null | undefined): string | null {
    return resolveAsset(apiOrigin(), value);
}
