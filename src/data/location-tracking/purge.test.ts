import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locationTrackingPurgeContributor, purgeLocationTracking, teardownLocationTracking } from './purge';

const cancelPendingTracking = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('./merge-store', () => ({ cancelPendingTracking }));

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
  it('is a durable-tier contributor that claims the durable tracking recovery queue', () => {
    expect(locationTrackingPurgeContributor.tier).toBe('durable');
    expect(locationTrackingPurgeContributor.claims).toHaveLength(1);
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
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toEqual({ userId: USER, characterId: null });
  });

  it('propagates a Convex outage so the deletion stays requested for retry', async () => {
    fetchSpy.mockRejectedValue(new Error('convex down'));
    await expect(
      locationTrackingPurgeContributor.purgeCharacter?.({
        kind: 'character',
        userId: USER,
        characterId: CHAR,
      }),
    ).rejects.toThrow('request failed');
  });

  it('propagates a non-2xx response instead of asserting done', async () => {
    fetchSpy.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    await expect(
      locationTrackingPurgeContributor.purgeUser?.({ kind: 'user', userId: USER }),
    ).rejects.toThrow('/purge-location-tracking answered 401');
  });

  it('no-ops when Convex is not configured (no NEXT_PUBLIC_CONVEX_URL)', async () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    await locationTrackingPurgeContributor.purgeUser?.({ kind: 'user', userId: USER });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('teardownLocationTracking', () => {
  it('is the same Convex purge door the contributor uses', async () => {
    await teardownLocationTracking(USER, CHAR);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://example.convex.site/purge-location-tracking');
    expect(JSON.parse(init?.body as string)).toEqual({ userId: USER, characterId: CHAR });
  });
});

describe('purgeLocationTracking', () => {
  it('rejects missing Convex configuration instead of claiming a completed purge', async () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    await expect(purgeLocationTracking(USER, null)).rejects.toThrow('Convex URL or service secret is unset or unsafe');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    'http://example.convex.cloud',
    'http://remote.example:3210',
    'http://localhost.example:3210',
    'ftp://localhost:3210',
    'https://localhost:65535',
  ])('rejects an unsafe HTTP door derived from %s before sending credentials', async (convexUrl) => {
    process.env.NEXT_PUBLIC_CONVEX_URL = convexUrl;
    await expect(purgeLocationTracking(USER, null)).rejects.toThrow('Convex URL or service secret is unset or unsafe');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['https://example.convex.cloud', 'https://example.convex.site'],
    ['https://remote.example:3210', 'https://remote.example:3211'],
    ['http://localhost:3210', 'http://localhost:3211'],
    ['http://127.0.0.1:3210', 'http://127.0.0.1:3211'],
    ['http://[::1]:3210', 'http://[::1]:3211'],
  ])('purges through a secure or loopback HTTP door derived from %s', async (convexUrl, siteUrl) => {
    process.env.NEXT_PUBLIC_CONVEX_URL = convexUrl;
    await purgeLocationTracking(USER, CHAR);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(`${siteUrl}/purge-location-tracking`);
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer svc-secret');
    expect(JSON.parse(init?.body as string)).toEqual({ userId: USER, characterId: CHAR });
  });

  it('fails when configured Convex has no service secret', async () => {
    delete process.env.CONVEX_SERVICE_SECRET;
    await expect(purgeLocationTracking(USER, null)).rejects.toThrow('service secret');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails when the configured URL cannot address an HTTP door', async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'not-a-url';
    await expect(purgeLocationTracking(USER, null)).rejects.toThrow('Convex URL or service secret is unset or unsafe');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('propagates a refused purge instead of reporting success', async () => {
    fetchSpy.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    await expect(purgeLocationTracking(USER, null)).rejects.toThrow('/purge-location-tracking answered 401');
  });

  it('propagates a network failure', async () => {
    fetchSpy.mockRejectedValue(new Error('convex down'));
    await expect(purgeLocationTracking(USER, null)).rejects.toThrow('request failed');
  });
});
