/**
 * Global bootstrap.
 *
 * The axios wiring (baseURL, timeout, telemetry, GET retry/cache, 401 session
 * expiry and the origin-scoped Authorization handling) now lives in
 * `resources/js/api.js` so the dedicated `api` instance and the shared
 * `window.axios` instance can never drift apart.
 *
 * The shared instance is still exposed as `window.axios` because much of the
 * existing SPA imports `axios` directly; migrating those call sites to `api`
 * is a separate mechanical sweep.
 */
import axios from 'axios';
import { configureApiInstance } from './api';

window.axios = configureApiInstance(axios);
