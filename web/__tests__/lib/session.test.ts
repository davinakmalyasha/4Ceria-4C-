import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiOrigin, clearSession, sessionToken, setSession, SESSION_COOKIE } from '@/lib/session';

const jar = vi.hoisted(() => {
  const data: Record<string, string> = {};
  const store = {
    get: vi.fn((name: string) => (data[name] === undefined ? undefined : { value: data[name] })),
    set: vi.fn((name: string, value: string, _options: unknown) => {
      data[name] = value;
    }),
    delete: vi.fn((name: string) => {
      delete data[name];
    }),
  };
  return { data, store };
});

vi.mock('next/headers', () => ({
  cookies: async () => jar.store,
}));

beforeEach(() => {
  for (const key of Object.keys(jar.data)) delete jar.data[key];
  jar.store.get.mockClear();
  jar.store.set.mockClear();
  jar.store.delete.mockClear();
  vi.unstubAllEnvs();
});

describe('session', () => {
  test('apiOrigin defaults to the local gateway', () => {
    vi.stubEnv('API_ORIGIN', '');
    delete process.env.API_ORIGIN;
    expect(apiOrigin()).toBe('http://127.0.0.1:8099');
  });

  test('apiOrigin follows API_ORIGIN', () => {
    vi.stubEnv('API_ORIGIN', 'http://gateway:8099');
    expect(apiOrigin()).toBe('http://gateway:8099');
  });

  test('sessionToken returns the cookie value', async () => {
    jar.data[SESSION_COOKIE] = 'tok123';
    await expect(sessionToken()).resolves.toBe('tok123');
  });

  test('sessionToken is null when the cookie is missing or empty', async () => {
    await expect(sessionToken()).resolves.toBeNull();
    jar.data[SESSION_COOKIE] = '';
    await expect(sessionToken()).resolves.toBeNull();
  });

  test('setSession stores an httpOnly lax cookie for 48 hours', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    await setSession('tok123');
    expect(jar.store.set).toHaveBeenCalledWith(
      SESSION_COOKIE,
      'tok123',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
        maxAge: 60 * 60 * 48,
      }),
    );
  });

  test('setSession honours an explicit secure flag', async () => {
    vi.stubEnv('SESSION_COOKIE_SECURE', 'true');
    await setSession('tok123');
    expect(jar.store.set).toHaveBeenCalledWith(
      SESSION_COOKIE,
      'tok123',
      expect.objectContaining({ secure: true }),
    );
    vi.stubEnv('SESSION_COOKIE_SECURE', 'false');
    await setSession('tok123');
    expect(jar.store.set).toHaveBeenCalledWith(
      SESSION_COOKIE,
      'tok123',
      expect.objectContaining({ secure: false }),
    );
  });

  test('setSession is secure by default in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await setSession('tok123');
    expect(jar.store.set).toHaveBeenCalledWith(
      SESSION_COOKIE,
      'tok123',
      expect.objectContaining({ secure: true }),
    );
  });

  test('clearSession forgets the cookie', async () => {
    jar.data[SESSION_COOKIE] = 'tok123';
    await clearSession();
    expect(jar.data[SESSION_COOKIE]).toBeUndefined();
    await expect(sessionToken()).resolves.toBeNull();
  });
});
