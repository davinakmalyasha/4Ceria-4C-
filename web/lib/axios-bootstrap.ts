'use client';

/**
 * The `axios` defaults, once, before any component runs.
 *
 * The legacy app configures the shared instance in `bootstrap.js`:
 * `baseURL = '/api'`, the XHR header, and a timeout. Almost every ported page
 * imports `axios` directly and calls `axios.get('/admin/users')`, expecting the
 * prefix to be added for it.
 *
 * THIS MUST BE A MODULE SIDE EFFECT, not an effect in a provider: React runs
 * child effects BEFORE parent effects, so a provider that configured axios in
 * `useEffect` would configure it AFTER every page had already fired its first
 * request — and the first request is the one that fills the screen.
 *
 * The BFF answers `/api/*` with the session's token attached, so `baseURL`
 * being the application's own origin is exactly right.
 */
import axios from 'axios';

axios.defaults.baseURL = '/api';
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
axios.defaults.headers.common['Accept'] = 'application/json';

export const axiosBootstrapped = true;
