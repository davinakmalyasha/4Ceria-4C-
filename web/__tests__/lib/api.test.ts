import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiFailure, apiFetch } from '@/lib/api';

const sessionState = vi.hoisted(() => ({ token: null as string | null }));

vi.mock('@/lib/session', () => ({
    apiOrigin: () => 'http://api.test',
    sessionToken: async () => sessionState.token,
}));

function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as unknown as Response;
}

async function catchApiFailure(promise: Promise<unknown>): Promise<ApiFailure> {
    try {
        await promise;
    } catch (error) {
        expect(error).toBeInstanceOf(ApiFailure);
        return error as ApiFailure;
    }
    throw new Error('expected apiFetch to reject');
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    sessionState.token = null;
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function callInit(callIndex = 0): RequestInit {
    return fetchMock.mock.calls[callIndex][1] as RequestInit;
}

describe('apiFetch', () => {
    test('a network failure surfaces as a 503 ApiFailure', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
        const error = await catchApiFailure(apiFetch('/projects'));
        expect(error.status).toBe(503);
        expect(error.message).toContain('unreachable');
    });

    test('a 422 maps the message and validation errors', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ message: 'Invalid.', errors: { amount: ['Required.'] } }, 422),
        );
        const error = await catchApiFailure(apiFetch('/projects'));
        expect(error.name).toBe('ApiFailure');
        expect(error.status).toBe(422);
        expect(error.message).toBe('Invalid.');
        expect(error.errors).toEqual({ amount: ['Required.'] });
    });

    test('a 401 stays an ApiFailure for the caller to decide on', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Unauthenticated.' }, 401));
        const error = await catchApiFailure(apiFetch('/projects'));
        expect(error.status).toBe(401);
        expect(error.message).toBe('Unauthenticated.');
    });

    test('a text error body falls back to the status', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => {
                throw new SyntaxError('not JSON');
            },
        } as unknown as Response);
        const error = await catchApiFailure(apiFetch('/projects'));
        expect(error.status).toBe(500);
        expect(error.message).toBe('The API answered 500.');
    });

    test('success returns the parsed JSON', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }));
        await expect(apiFetch<{ id: number }>('/projects')).resolves.toEqual({ id: 1 });
    });

    test('a 204 resolves undefined without reading a body', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 204,
            json: async () => {
                throw new Error('no body');
            },
        } as unknown as Response);
        await expect(apiFetch('/projects/1', { method: 'DELETE' })).resolves.toBeUndefined();
    });

    test('calls the manifest API URL with JSON headers and no token', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
        await apiFetch('/projects');
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/projects');
        const headers = new Headers(callInit().headers);
        expect(headers.get('Accept')).toBe('application/json');
        expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
        expect(headers.get('Authorization')).toBeNull();
    });

    test('attaches the bearer token when signed in', async () => {
        sessionState.token = 'tok123';
        fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
        await apiFetch('/projects');
        expect(new Headers(callInit().headers).get('Authorization')).toBe('Bearer tok123');
    });

    test('sets a JSON content type for a JSON body but not for FormData', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
        await apiFetch('/projects', { method: 'POST', body: JSON.stringify({ a: 1 }) });
        expect(new Headers(callInit(0).headers).get('Content-Type')).toBe('application/json');

        const form = new FormData();
        form.append('file', new Blob(['x']), 'x.png');
        await apiFetch('/uploads', { method: 'POST', body: form });
        expect(new Headers(callInit(1).headers).get('Content-Type')).toBeNull();
    });

    test('forwards a revalidate window when signed out', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
        await apiFetch('/projects', {}, 60);
        const init = callInit();
        expect(init).toMatchObject({ next: { revalidate: 60 } });
        expect(init).not.toHaveProperty('cache');
    });
});
