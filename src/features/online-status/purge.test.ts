import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onlineStatusPurgeContributor } from './purge';

// The contributor reaches Convex over the bearer-gated .convex.site HTTP origin.
// Drive it with real env (a .convex.cloud URL → deriveConvexSiteUrl resolves the
// .convex.site origin) + a fetch spy, so these prove the POST shape and the
// BEST-EFFORT swallow without a live deployment.
const USER = 'eve-user-1';
const CHAR = 90000001;

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
  process.env.CONVEX_SERVICE_SECRET = 'svc-secret';
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  fetchSpy.mockResolvedValue(new Response(JSON.stringify({ deleted: 1 }), { status: 200 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
  delete process.env.NEXT_PUBLIC_CONVEX_URL;
  delete process.env.CONVEX_SERVICE_SECRET;
});

describe('onlineStatusPurgeContributor', () => {
  it('is a cache-tier contributor that claims no Neon table (its home lives in Convex)', () => {
    expect(onlineStatusPurgeContributor.tier).toBe('cache');
    expect(onlineStatusPurgeContributor.claims).toEqual([]);
  });

  it('purgeCharacter POSTs the one-character teardown to /purge-online with the bearer secret', async () => {
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

  it('swallows a Convex outage (fetch reject) without throwing — the Neon purge must complete', async () => {
    fetchSpy.mockRejectedValue(new Error('convex down'));
    await expect(
      onlineStatusPurgeContributor.purgeCharacter?.({
        kind: 'character',
        userId: USER,
        characterId: CHAR,
      }),
    ).resolves.toBeUndefined();
  });

  it('no-ops when Convex is not configured (no NEXT_PUBLIC_CONVEX_URL)', async () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    await onlineStatusPurgeContributor.purgeUser?.({ kind: 'user', userId: USER });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
