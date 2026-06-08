import axios from 'axios';
window.axios = axios;

window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
window.axios.defaults.baseURL = import.meta.env.VITE_API_URL || '/api';

// Request interceptor to record start time
window.axios.interceptors.request.use(config => {
    config.metadata = { startTime: new Date().getTime() };
    return config;
}, error => {
    return Promise.reject(error);
});

// Response interceptor to calculate total duration and parse backend headers
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

    return response;
}, error => {
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

    return Promise.reject(error);
});


