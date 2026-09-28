/**
 * Shared HTTP client plumbing.
 *
 * Two axios instances are configured here:
 *
 *   1. `api`  - a dedicated instance (use this for new code).
 *   2. the long-lived shared instance (aliased as `window.axios` in
 *      `bootstrap.js`) which the rest of the SPA still imports directly.
 *
 * Both get the exact same interceptor stack, so behaviour cannot drift between
 * them.
 *
 * SECURITY: the bearer token is NEVER written to `defaults.headers.common`.
 * It used to be, which meant every `axios.get()` in the app - including calls
 * to cross-origin, presigned Railway/Tigris document URLs - carried the user's
 * Sanctum token to whatever host the URL pointed at. The token is now resolved
 * per request, at request time, from localStorage, and is explicitly stripped
 * for any absolute URL that is not the SPA origin or the API origin.
 */
import axios from 'axios';

const TOKEN_STORAGE_KEY = 'auth_token';
const PROFILE_STORAGE_KEY = 'user_profile';

/** Same source of truth as the old `bootstrap.js` baseURL logic. */
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const REQUEST_TIMEOUT = 8000; // 8 seconds

// Cache settings for static lookup references
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache expiry
const cacheableUrls = [
    '/contractor-subspecialties'
];
const apiCache = new Map();

const hasWindow = typeof window !== 'undefined';

const baseHref = hasWindow ? window.location.href : undefined;

/**
 * Origins that may legitimately receive the Authorization header: the origin
 * that served the SPA and the origin of the API base URL. Computed per request
 * so it always reflects the live environment.
 */
const trustedOrigins = () => {
    const origins = new Set();
    if (hasWindow && window.location?.origin) {
        origins.add(window.location.origin);
    }
    try {
        const apiOrigin = new URL(API_BASE_URL, baseHref).origin;
        if (apiOrigin && apiOrigin !== 'null') {
            origins.add(apiOrigin);
        }
    } catch (e) {
        // Relative/invalid base URL: only the SPA origin is trusted.
    }
    return origins;
};

const ABSOLUTE_URL_RE = /^(?:[a-z][a-z\d+\-.]*:)?\/\//i;

const isAbsoluteUrl = (url) => ABSOLUTE_URL_RE.test(String(url || ''));

const originOf = (url) => {
    try {
        return new URL(url, baseHref).origin;
    } catch (e) {
        return null;
    }
};

const readToken = () => {
    try {
        return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch (e) {
        return null;
    }
};

/** Works with both AxiosHeaders and a plain header bag. */
const setHeader = (headers, key, value) => {
    if (typeof headers.set === 'function') {
        headers.set(key, value);
    } else {
        headers[key] = value;
    }
};

const deleteHeader = (headers, key) => {
    if (typeof headers.delete === 'function') {
        headers.delete(key);
    } else {
        delete headers[key];
    }
};

/**
 * Attaches the bearer token to same-origin/API calls and guarantees it never
 * travels to a third-party origin.
 */
const applyScopedAuth = (config) => {
    if (!config.headers) return;

    const rawUrl = config.url || '';
    if (isAbsoluteUrl(rawUrl) && !trustedOrigins().has(originOf(rawUrl))) {
        // Cross-origin request (e.g. a presigned Tigris/Railway document URL):
        // drop the credential even if some caller set it by hand.
        deleteHeader(config.headers, 'Authorization');
        return;
    }

    const token = readToken();
    if (token) {
        // Read at request time, so a token refresh/logout takes effect
        // immediately and nothing is retained in module state.
        setHeader(config.headers, 'Authorization', `Bearer ${token}`);
    }
};

const isCacheableUrl = (url) => cacheableUrls.some((needle) => String(url || '').includes(needle));

const cacheKeyFor = (config) => `${config.url}${config.params ? JSON.stringify(config.params) : ''}`;

const emitTelemetry = (url, method, headers, durationMs, isError) => {
    if (!hasWindow || typeof window.dispatchEvent !== 'function') return;
    const queryCount = headers?.['x-query-count'];
    const queryTimeMs = headers?.['x-query-time-ms'];
    const backendResponseTimeMs = headers?.['x-response-time-ms'];

    window.dispatchEvent(new CustomEvent('api-telemetry', {
        detail: {
            url: url || '',
            method: method?.toUpperCase() || 'GET',
            queryCount: queryCount ? parseInt(queryCount, 10) : 0,
            queryTimeMs: queryTimeMs ? parseFloat(queryTimeMs) : 0,
            backendResponseTimeMs: backendResponseTimeMs ? parseFloat(backendResponseTimeMs) : 0,
            frontendDurationMs: durationMs,
            ...(isError ? { isError: true } : {})
        }
    }));
};

const durationSince = (config) => {
    const startTime = config?.metadata?.startTime;
    return startTime ? new Date().getTime() - startTime : 0;
};

/**
 * Global session-expiry handling: an expired/invalid token previously left the
 * user stranded with silent per-call errors. Redirect to login ONCE.
 */
const handleExpiredSession = () => {
    if (!hasWindow) return;
    if (
        !window.location.pathname.startsWith('/login') &&
        !window.location.pathname.startsWith('/register') &&
        !window.__redirectingToLogin
    ) {
        try {
            localStorage.removeItem(TOKEN_STORAGE_KEY);
            localStorage.removeItem(PROFILE_STORAGE_KEY);
        } catch (e) {
            // Storage unavailable (private mode) - the redirect still applies.
        }
        window.__redirectingToLogin = true;
        window.location.href = '/login';
    }
};

/**
 * Applies baseURL/timeout/headers plus the shared request + response
 * interceptor stack (telemetry, GET cache, GET retry, 401 handling) to an
 * axios instance.
 */
export const configureApiInstance = (instance) => {
    instance.defaults.baseURL = API_BASE_URL;
    instance.defaults.timeout = REQUEST_TIMEOUT;
    instance.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

    // NOTE: deliberately NO `Authorization` here - see applyScopedAuth().
    instance.interceptors.request.use((config) => {
        config.metadata = { startTime: new Date().getTime() };

        if (config.method?.toLowerCase() === 'get' && isCacheableUrl(config.url)) {
            const cacheKey = cacheKeyFor(config);
            const cached = apiCache.get(cacheKey);
            if (cached && cached.expiry > Date.now()) {
                config.adapter = () => Promise.resolve({
                    data: cached.data,
                    status: 200,
                    statusText: 'OK',
                    headers: { 'x-from-cache': 'true' },
                    config
                });
            }
        }

        applyScopedAuth(config);

        return config;
    }, (error) => {
        return Promise.reject(error);
    });

    instance.interceptors.response.use((response) => {
        const { config, headers } = response;
        emitTelemetry(config?.url, config?.method, headers, durationSince(config), false);

        // Cache the response if it is cacheable
        if (config?.method?.toLowerCase() === 'get' && isCacheableUrl(config.url) && !headers['x-from-cache']) {
            apiCache.set(cacheKeyFor(config), {
                data: response.data,
                expiry: Date.now() + CACHE_TTL
            });
        }

        return response;
    }, async (error) => {
        const config = error.config;
        emitTelemetry(config?.url, config?.method, error.response?.headers, durationSince(config), true);

        // Auto-retry logic for idempotent GET requests
        if (config && config.method?.toLowerCase() === 'get') {
            const shouldRetry = !error.response || (error.response.status >= 500 && error.response.status <= 599);
            if (shouldRetry) {
                config.__retryCount = config.__retryCount || 0;
                if (config.__retryCount < 2) {
                    config.__retryCount += 1;
                    const delay = config.__retryCount * 1000;
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    return instance(config);
                }
            }
        }

        if (error.response?.status === 401 && !config?.__isAuthCall) {
            handleExpiredSession();
        }

        return Promise.reject(error);
    });

    return instance;
};

/**
 * Dedicated, origin-scoped client for API calls. Prefer this in new code; the
 * shared instance remains for the modules that still import `axios` directly.
 */
export const api = configureApiInstance(axios.create());

export default api;
