import axios from 'axios';
window.axios = axios;

window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
window.axios.defaults.baseURL = import.meta.env.VITE_API_URL || '/api';
window.axios.defaults.timeout = 8000; // 8 Seconds timeout

// Cache settings for static lookup references
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache expiry
const cacheableUrls = [
    '/contractor-subspecialties'
];
const apiCache = new Map();

// Request interceptor to record start time and handle caching
window.axios.interceptors.request.use(config => {
    config.metadata = { startTime: new Date().getTime() };

    if (config.method?.toLowerCase() === 'get') {
        const isCacheable = cacheableUrls.some(url => config.url?.includes(url));
        if (isCacheable) {
            const cacheKey = config.url + (config.params ? JSON.stringify(config.params) : '');
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
    }

    return config;
}, error => {
    return Promise.reject(error);
});

// Response interceptor to calculate total duration, parse backend headers, handle caching, and retry failures
window.axios.interceptors.response.use(response => {
    const endTime = new Date().getTime();
    const startTime = response.config?.metadata?.startTime;
    const frontendDurationMs = startTime ? (endTime - startTime) : 0;

    const queryCount = response.headers['x-query-count'];
    const queryTimeMs = response.headers['x-query-time-ms'];
    const backendResponseTimeMs = response.headers['x-response-time-ms'];

    // Dispatch the telemetry event
    const event = new CustomEvent('api-telemetry', {
        detail: {
            url: response.config.url || '',
            method: response.config.method?.toUpperCase() || 'GET',
            queryCount: queryCount ? parseInt(queryCount, 10) : 0,
            queryTimeMs: queryTimeMs ? parseFloat(queryTimeMs) : 0,
            backendResponseTimeMs: backendResponseTimeMs ? parseFloat(backendResponseTimeMs) : 0,
            frontendDurationMs
        }
    });
    window.dispatchEvent(event);

    // Cache the response if it is cacheable
    if (response.config.method?.toLowerCase() === 'get') {
        const isCacheable = cacheableUrls.some(url => response.config.url?.includes(url));
        if (isCacheable && !response.headers['x-from-cache']) {
            const cacheKey = response.config.url + (response.config.params ? JSON.stringify(response.config.params) : '');
            apiCache.set(cacheKey, {
                data: response.data,
                expiry: Date.now() + CACHE_TTL
            });
        }
    }

    return response;
}, async error => {
    const endTime = new Date().getTime();
    const startTime = error.config?.metadata?.startTime;
    const frontendDurationMs = startTime ? (endTime - startTime) : 0;

    const queryCount = error.response?.headers?.['x-query-count'];
    const queryTimeMs = error.response?.headers?.['x-query-time-ms'];
    const backendResponseTimeMs = error.response?.headers?.['x-response-time-ms'];

    // Dispatch the telemetry event even for errors
    const event = new CustomEvent('api-telemetry', {
        detail: {
            url: error.config?.url || '',
            method: error.config?.method?.toUpperCase() || 'GET',
            queryCount: queryCount ? parseInt(queryCount, 10) : 0,
            queryTimeMs: queryTimeMs ? parseFloat(queryTimeMs) : 0,
            backendResponseTimeMs: backendResponseTimeMs ? parseFloat(backendResponseTimeMs) : 0,
            frontendDurationMs,
            isError: true
        }
    });
    window.dispatchEvent(event);

    // Auto-retry logic for idempotent GET requests
    const config = error.config;
    if (config && config.method?.toLowerCase() === 'get') {
        const shouldRetry = !error.response || (error.response.status >= 500 && error.response.status <= 599);
        if (shouldRetry) {
            config.__retryCount = config.__retryCount || 0;
            if (config.__retryCount < 2) {
                config.__retryCount += 1;
                const delay = config.__retryCount * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                return window.axios(config);
            }
        }
    }

    return Promise.reject(error);
});



