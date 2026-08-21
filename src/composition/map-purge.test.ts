import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MapPurgeUnavailableError,
  purgeEligibleMaps,
  purgeMapChain,
} from './map-purge';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('purgeMapChain', () => {
  function configure() {
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud');
    vi.stubEnv('CONVEX_SERVICE_SECRET', 'secret');
  }

  it('requires both Convex transport settings', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '');
    vi.stubEnv('CONVEX_SERVICE_SECRET', '');
    await expect(purgeMapChain('map-a')).rejects.toBeInstanceOf(
      MapPurgeUnavailableError,
    );
  });

  it('returns only a validated clean terminal response', async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ deleted: 17, remaining: false }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(purgeMapChain('map-a')).resolves.toEqual({
      deleted: 17,
      remaining: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.convex.site/purge-map-chain',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    ['network failure', () => Promise.reject(new Error('offline'))],
    ['non-success status', () => Promise.resolve(new Response(null, { status: 503 }))],
    ['unreadable JSON', () => Promise.resolve(new Response('not-json'))],
    [
      'drifted response',
      () => Promise.resolve(Response.json({ deleted: 1, remaining: true })),
    ],
  ])('rejects a %s without claiming a clean purge', async (_case, response) => {
    configure();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(response));
    await expect(purgeMapChain('map-a')).rejects.toBeInstanceOf(
      MapPurgeUnavailableError,
    );
  });
});

describe('purgeEligibleMaps', () => {
  it('tombstones only after each clean collaborative sweep, then tears down access', async () => {
    const order: string[] = [];
    const purgeChain = vi.fn(async (mapId: string) => {
      order.push(`purge:${mapId}`);
      return { deleted: 9, remaining: false as const };
    });
    const tombstoneMap = vi.fn(async (mapId: string) => {
      order.push(`tombstone:${mapId}`);
      return true;
    });
    const teardownAccess = vi.fn(async (mapId: string) => {
      order.push(`teardown:${mapId}`);
      return {
        inserted: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        outcome: 'applied' as const,
      };
    });

    await expect(
      purgeEligibleMaps({
        claimMaps: vi.fn().mockResolvedValue([{ id: 'map-a' }, { id: 'map-b' }]),
        purgeChain,
        tombstoneMap,
        teardownAccess,
      }),
    ).resolves.toEqual({
      selected: 2,
      tombstoned: 2,
      deletedDocuments: 18,
      projectionPending: 0,
    });
    expect(order).toEqual([
      'purge:map-a',
      'tombstone:map-a',
      'teardown:map-a',
      'purge:map-b',
      'tombstone:map-b',
      'teardown:map-b',
    ]);
  });

  it('never tombstones after an interrupted or failed collaborative sweep', async () => {
    const failure = new Error('door down');
    const tombstoneMap = vi.fn();
    await expect(
      purgeEligibleMaps({
        claimMaps: vi.fn().mockResolvedValue([{ id: 'map-a' }]),
        purgeChain: vi.fn().mockRejectedValue(failure),
        tombstoneMap,
      }),
    ).rejects.toBe(failure);
    expect(tombstoneMap).not.toHaveBeenCalled();
  });

  it('counts a stale teardown as pending after tombstone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      purgeEligibleMaps({
        claimMaps: vi.fn().mockResolvedValue([{ id: 'map-a' }]),
        purgeChain: vi.fn().mockResolvedValue({ deleted: 4, remaining: false }),
        tombstoneMap: vi.fn().mockResolvedValue(true),
        teardownAccess: vi.fn().mockResolvedValue({
          inserted: 0,
          updated: 0,
          deleted: 0,
          unchanged: 0,
          outcome: 'stale' as const,
        }),
      }),
    ).resolves.toEqual({
      selected: 1,
      tombstoned: 1,
      deletedDocuments: 4,
      projectionPending: 1,
    });
  });

  it('keeps a completed tombstone successful if redundant access teardown is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      purgeEligibleMaps({
        claimMaps: vi.fn().mockResolvedValue([{ id: 'map-a' }]),
        purgeChain: vi.fn().mockResolvedValue({ deleted: 4, remaining: false }),
        tombstoneMap: vi.fn().mockResolvedValue(true),
        teardownAccess: vi.fn().mockRejectedValue(new Error('offline')),
      }),
    ).resolves.toEqual({
      selected: 1,
      tombstoned: 1,
      deletedDocuments: 4,
      projectionPending: 1,
    });
  });
});
