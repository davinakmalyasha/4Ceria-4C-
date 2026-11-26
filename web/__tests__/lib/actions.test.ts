import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { signOut } from '@/lib/actions';

const sessionState = vi.hoisted(() => ({ token: null as string | null, cleared: false }));

vi.mock('@/lib/session', () => ({
  apiOrigin: () => 'http://api.test',
  sessionToken: async () => sessionState.token,
  clearSession: async () => {
    sessionState.cleared = true;
  },
}));

const nav = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock('next/navigation', () => ({
  redirect: nav.redirect,
}));

beforeEach(() => {
  sessionState.token = null;
  sessionState.cleared = false;
  nav.redirect.mockReset().mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true }) as unknown as Response));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function expectLoginRedirect(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toThrow('NEXT_REDIRECT /login');
  expect(nav.redirect).toHaveBeenCalledWith('/login');
}

describe('signOut', () => {
  test('revokes with the bearer token, then clears and redirects', async () => {
    sessionState.token = 'tok123';
    await expectLoginRedirect(signOut());
    const mockedFetch = vi.mocked(fetch);
    expect(mockedFetch).toHaveBeenCalledOnce();
    expect(mockedFetch.mock.calls[0][0]).toBe('http://api.test/api/logout');
    const init = mockedFetch.mock.calls[0][1] ?? {};
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok123');
    expect(sessionState.cleared).toBe(true);
  });

  test('a failed revoke still clears and redirects', async () => {
    sessionState.token = 'tok123';
    vi.mocked(fetch).mockRejectedValueOnce(new Error('down'));
    await expectLoginRedirect(signOut());
    expect(sessionState.cleared).toBe(true);
  });

  test('signs out locally when there is no token to revoke', async () => {
    await expectLoginRedirect(signOut());
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(sessionState.cleared).toBe(true);
  });
});
