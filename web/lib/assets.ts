import { resolveAsset } from './assetUrl';

/**
 * Resolve a stored asset path to a same-origin browser URL.
 *
 * Rows carry either an absolute URL (Unsplash, a CDN) or a relative disk path
 * (`uploads/house/…`). Relative paths are served by the Next storage proxy, so
 * the internal API origin never reaches the browser.
 */
export function assetUrl(value: string | null | undefined): string | null {
    return resolveAsset('', value);
}
