import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onlineStatusPurgeContributor } from './purge';

const USER = 'eve-user-1';
const CHAR = 90000001;

let fetchSpy: ReturnType<typeof vi.spyOn>;
let originalConvexUrl: string | undefined;
let originalServiceSecret: string | undefined;

beforeEach(() => {
  originalConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  originalServiceSecret = process.env.CONVEX_SERVICE_SECRET;
  process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
  process.env.CONVEX_SERVICE_SECRET = 'svc-secret';
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  fetchSpy.mockResolvedValue(new Response(JSON.stringify({ deleted: 1 }), { status: 200 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
  if (originalConvexUrl === undefined) delete process.env.NEXT_PUBLIC_CONVEX_URL;
  else process.env.NEXT_PUBLIC_CONVEX_URL = originalConvexUrl;
  if (originalServiceSecret === undefined) delete process.env.CONVEX_SERVICE_SECRET;
  else process.env.CONVEX_SERVICE_SECRET = originalServiceSecret;
});

describe('onlineStatusPurgeContributor', () => {
  it('purgeCharacter POSTs the one-character teardown to /purge-online with the bearer secret', async () => {
    expect(onlineStatusPurgeContributor.tier).toBe('cache');
    expect(onlineStatusPurgeContributor.claims).toEqual([]);
    await onlineStatusPurgeContributor.purgeCharacter?.({
      kind: 'character',
      userId: USER,
      characterId: CHAR,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://example.convex.site/purge-online');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer svc-secret');
    expect(JSON.parse(init?.body as string)).toEqual({ userId: USER, characterId: CHAR });
  });

  it('purgeUser POSTs the whole-user teardown (characterId null)', async () => {
    await onlineStatusPurgeContributor.purgeUser?.({ kind: 'user', userId: USER });
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ userId: USER, characterId: null });
  });

  it('propagates a Convex outage so the deletion stays requested for retry', async () => {
    fetchSpy.mockRejectedValue(new Error('convex down'));
    await expect(
      onlineStatusPurgeContributor.purgeCharacter?.({
        kind: 'character',
        userId: USER,
        characterId: CHAR,
      }),
    ).rejects.toThrow('convex down');
  });

  it('propagates a non-2xx response instead of asserting done', async () => {
    fetchSpy.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    await expect(
      onlineStatusPurgeContributor.purgeUser?.({ kind: 'user', userId: USER }),
    ).rejects.toThrow('purge-online 401');
  });

  it('rejects a configured Convex URL with no service secret', async () => {
    delete process.env.CONVEX_SERVICE_SECRET;
    await expect(
      onlineStatusPurgeContributor.purgeUser?.({ kind: 'user', userId: USER }),
    ).rejects.toThrow('service secret');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no-ops when Convex is not configured (no NEXT_PUBLIC_CONVEX_URL)', async () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    await onlineStatusPurgeContributor.purgeUser?.({ kind: 'user', userId: USER });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
