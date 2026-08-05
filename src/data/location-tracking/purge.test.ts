import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locationTrackingPurgeContributor } from './purge';

const USER = 'eve-user-1';
const CHAR = 90_000_001;

let fetchSpy: ReturnType<typeof vi.spyOn>;
let originalConvexUrl: string | undefined;
let originalServiceSecret: string | undefined;

beforeEach(() => {
  originalConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  originalServiceSecret = process.env.CONVEX_SERVICE_SECRET;
  process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
  process.env.CONVEX_SERVICE_SECRET = 'svc-secret';
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  fetchSpy.mockResolvedValue(
    new Response(JSON.stringify({ deletedLocations: 1, deletedTracking: 1 }), { status: 200 }),
  );
});

afterEach(() => {
  fetchSpy.mockRestore();
  if (originalConvexUrl === undefined) delete process.env.NEXT_PUBLIC_CONVEX_URL;
  else process.env.NEXT_PUBLIC_CONVEX_URL = originalConvexUrl;
  if (originalServiceSecret === undefined) delete process.env.CONVEX_SERVICE_SECRET;
  else process.env.CONVEX_SERVICE_SECRET = originalServiceSecret;
});

describe('locationTrackingPurgeContributor', () => {
  it('is a durable-tier contributor that claims no Neon table (its homes live in Convex)', () => {
    // durable, not cache: mapTracking is app-authored opt-in state with no
    // upstream to rebuild from — the stricter of the two tables decides.
    expect(locationTrackingPurgeContributor.tier).toBe('durable');
    expect(locationTrackingPurgeContributor.claims).toEqual([]);
  });

  it('purgeCharacter POSTs the one-character teardown to /purge-location-tracking with the bearer secret', async () => {
    await locationTrackingPurgeContributor.purgeCharacter?.({
      kind: 'character',
      userId: USER,
      characterId: CHAR,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://example.convex.site/purge-location-tracking');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer svc-secret');
    expect(JSON.parse(init?.body as string)).toEqual({ userId: USER, characterId: CHAR });
  });

  it('purgeUser POSTs the whole-user teardown (characterId null)', async () => {
    await locationTrackingPurgeContributor.purgeUser?.({ kind: 'user', userId: USER });
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toEqual({ userId: USER, characterId: null });
  });

  it('swallows a Convex outage (fetch reject) without throwing — the Neon purge must complete', async () => {
    fetchSpy.mockRejectedValue(new Error('convex down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      locationTrackingPurgeContributor.purgeCharacter?.({
        kind: 'character',
        userId: USER,
        characterId: CHAR,
      }),
    ).resolves.toBeUndefined();
    // Detectable, not silent: bestEffort logs the structured failure line.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[location-tracking/purge] convex-teardown failed'),
      expect.anything(),
    );
    errorSpy.mockRestore();
  });

  it('logs a non-2xx response as a missed delete instead of asserting done', async () => {
    // A rotated bearer (401) or deploy drift must be detectable in logs — a
    // deleted account has no later sync to orphan-clean these tables.
    fetchSpy.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      locationTrackingPurgeContributor.purgeUser?.({ kind: 'user', userId: USER }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[location-tracking/purge] convex-teardown failed'),
      expect.anything(),
    );
    errorSpy.mockRestore();
  });

  it('no-ops when Convex is not configured (no NEXT_PUBLIC_CONVEX_URL)', async () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    await locationTrackingPurgeContributor.purgeUser?.({ kind: 'user', userId: USER });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
