import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readEnvMock = vi.fn();
const fetchMock = vi.fn();
const deriveMock = vi.fn();

vi.mock('@/lib/env', () => ({ readEnv: (key: string) => readEnvMock(key) }));
vi.mock('@/lib/fetch-with-timeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchMock(...args),
}));
vi.mock('@/lib/sync-engine', () => ({ deriveConvexSiteUrl: (url: string) => deriveMock(url) }));

import { purgeConvexCharacterProjections } from './purge';

const USER = 'user-1';
const CHAR = 90000001;

beforeEach(() => {
  readEnvMock.mockReset();
  fetchMock.mockReset();
  deriveMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud');
  deriveMock.mockReturnValue('https://example.convex.site');
  readEnvMock.mockReturnValue('service-secret');
  fetchMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('purgeConvexCharacterProjections', () => {
  it('POSTs to /purge-character with the bearer + body on the happy path', async () => {
    await purgeConvexCharacterProjections(USER, CHAR);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://example.convex.site/purge-character');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer service-secret');
    expect(JSON.parse(init.body as string)).toEqual({ userId: USER, characterId: CHAR });
  });

  it('skips when NEXT_PUBLIC_CONVEX_URL is absent (a Convex-less deployment)', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '');
    await purgeConvexCharacterProjections(USER, CHAR);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when the site URL cannot be derived', async () => {
    deriveMock.mockReturnValue(null);
    await purgeConvexCharacterProjections(USER, CHAR);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when the service secret is unset', async () => {
    readEnvMock.mockReturnValue(undefined);
    await purgeConvexCharacterProjections(USER, CHAR);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows a non-ok response without throwing (lazy cleanup is the safety net)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(purgeConvexCharacterProjections(USER, CHAR)).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
  });

  it('swallows a fetch rejection without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(purgeConvexCharacterProjections(USER, CHAR)).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
  });
});
