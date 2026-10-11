import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ProjectionUnavailableError } from './map-access-projection';
import {
  MapPurgeUnavailableError,
  purgeEligibleMaps,
  purgeOwnedMapChains,
} from './map-purge';

const ownedMapIds = vi.hoisted(() => vi.fn<(userId: string) => Promise<string[]>>());
vi.mock('@/data/maps/queries', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/data/maps/queries')>(),
  getOwnedMapIds: ownedMapIds,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  ownedMapIds.mockReset();
});

describe('purgeOwnedMapChains', () => {
  function configure() {
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud');
    vi.stubEnv('CONVEX_SERVICE_SECRET', 'secret');
  }

  function purgedMapIds(fetchMock: Mock<typeof fetch>): string[] {
    return fetchMock.mock.calls.map(([, init]) =>
      (JSON.parse(String(init?.body)) as { mapId: string }).mapId);
  }

  it('requires both Convex transport settings', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '');
    vi.stubEnv('CONVEX_SERVICE_SECRET', '');
    ownedMapIds.mockResolvedValueOnce(['map-a']);
    await expect(purgeOwnedMapChains('owner')).rejects.toBeInstanceOf(
      MapPurgeUnavailableError,
    );
  });

  it('purges each owned chain in order, one at a time, and returns the purged ids', async () => {
    configure();
    ownedMapIds.mockResolvedValueOnce(['map-a', 'map-b']);
    let inFlight = 0;
    let peak = 0;
    const fetchMock = vi.fn<typeof fetch>(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return Response.json({ deleted: 17, remaining: false });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(purgeOwnedMapChains('owner')).resolves.toEqual(['map-a', 'map-b']);
    expect(ownedMapIds).toHaveBeenCalledExactlyOnceWith('owner');
    expect(purgedMapIds(fetchMock)).toEqual(['map-a', 'map-b']);
    expect(peak).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.convex.site/purge-map-chain',
      expect.objectContaining({ method: 'POST' }),
    );

    ownedMapIds.mockResolvedValueOnce([]);
    await expect(purgeOwnedMapChains('mapless')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['network failure', () => Promise.reject(new Error('offline'))],
    ['non-success status', () => Promise.resolve(new Response(null, { status: 503 }))],
    ['unreadable JSON', () => Promise.resolve(new Response('not-json'))],
    [
      'drifted response',
      () => Promise.resolve(Response.json({ deleted: 1, remaining: true })),
    ],
  ])('rejects a %s at the first chain without claiming a clean purge', async (_case, response) => {
    configure();
    ownedMapIds.mockResolvedValueOnce(['map-a', 'map-b']);
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(response);
    vi.stubGlobal('fetch', fetchMock);
    await expect(purgeOwnedMapChains('owner')).rejects.toBeInstanceOf(
      MapPurgeUnavailableError,
    );
    expect(purgedMapIds(fetchMock)).toEqual(['map-a']);
  });
});

describe('purgeEligibleMaps', () => {
  it('starts no map when claiming consumes the work budget', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const purgeChain = vi.fn().mockResolvedValue({ deleted: 9, remaining: false });
    const teardownAccess = vi.fn().mockResolvedValue({
      inserted: 0, updated: 0, deleted: 0, unchanged: 0, outcome: 'applied',
    });
    const tombstoneMap = vi.fn().mockResolvedValue(true);

    await expect(purgeEligibleMaps({
      claimMaps: vi.fn(async () => {
        vi.setSystemTime(60_000);
        return [{ id: 'map-a' }, { id: 'map-b' }];
      }),
      purgeChain,
      teardownAccess,
      tombstoneMap,
    })).resolves.toEqual({
      selected: 2,
      tombstoned: 0,
      deletedDocuments: 0,
    });
    expect(purgeChain).not.toHaveBeenCalled();
    expect(teardownAccess).not.toHaveBeenCalled();
    expect(tombstoneMap).not.toHaveBeenCalled();
  });

  it('finishes the started map when the work budget expires and leaves the next map untouched', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const order: string[] = [];

    await expect(purgeEligibleMaps({
      claimMaps: vi.fn().mockResolvedValue([{ id: 'map-a' }, { id: 'map-b' }]),
      purgeChain: vi.fn(async (mapId: string) => {
        order.push(`purge:${mapId}`);
        vi.setSystemTime(60_000);
        return { deleted: 9, remaining: false as const };
      }),
      teardownAccess: vi.fn(async (mapId: string) => {
        order.push(`teardown:${mapId}`);
        return { inserted: 0, updated: 0, deleted: 0, unchanged: 0, outcome: 'applied' as const };
      }),
      tombstoneMap: vi.fn(async (mapId: string) => {
        order.push(`tombstone:${mapId}`);
        return true;
      }),
    })).resolves.toEqual({
      selected: 2,
      tombstoned: 1,
      deletedDocuments: 9,
    });
    expect(order).toEqual(['purge:map-a', 'teardown:map-a', 'tombstone:map-a']);
  });

  it('resumes the untombstoned claimed maps on the next invocation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const remaining = new Set(['map-a', 'map-b']);
    const dependencies = {
      claimMaps: vi.fn(async () => Array.from(remaining, (id) => ({ id }))),
      purgeChain: vi.fn(async (mapId: string) => {
        if (mapId === 'map-a') vi.setSystemTime(60_000);
        return { deleted: 9, remaining: false as const };
      }),
      teardownAccess: vi.fn().mockResolvedValue({
        inserted: 0, updated: 0, deleted: 0, unchanged: 0, outcome: 'applied',
      }),
      tombstoneMap: vi.fn(async (mapId: string) => remaining.delete(mapId)),
    };

    await expect(purgeEligibleMaps(dependencies)).resolves.toMatchObject({ selected: 2, tombstoned: 1 });
    expect(remaining).toEqual(new Set(['map-b']));
    await expect(purgeEligibleMaps(dependencies)).resolves.toMatchObject({ selected: 1, tombstoned: 1 });
    expect(remaining.size).toBe(0);
    expect(dependencies.purgeChain.mock.calls.map(([mapId]) => mapId)).toEqual(['map-a', 'map-b']);
    expect(dependencies.teardownAccess.mock.calls.map(([mapId]) => mapId)).toEqual(['map-a', 'map-b']);
  });

  it('tombstones only after each clean collaborative sweep and current access fence', async () => {
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
    });
    expect(order).toEqual([
      'purge:map-a',
      'teardown:map-a',
      'tombstone:map-a',
      'purge:map-b',
      'teardown:map-b',
      'tombstone:map-b',
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

  it('does not tombstone when the empty-claim fence is stale or unavailable', async () => {
    const tombstoneMap = vi.fn();
    await expect(
      purgeEligibleMaps({
        claimMaps: vi.fn().mockResolvedValue([{ id: 'map-a' }]),
        purgeChain: vi.fn().mockResolvedValue({ deleted: 4, remaining: false }),
        tombstoneMap,
        teardownAccess: vi.fn().mockRejectedValue(
          new ProjectionUnavailableError('Map access projection unavailable: a newer projection already won'),
        ),
      }),
    ).rejects.toBeInstanceOf(MapPurgeUnavailableError);
    expect(tombstoneMap).not.toHaveBeenCalled();

    await expect(
      purgeEligibleMaps({
        claimMaps: vi.fn().mockResolvedValue([{ id: 'map-a' }]),
        purgeChain: vi.fn().mockResolvedValue({ deleted: 4, remaining: false }),
        tombstoneMap,
        teardownAccess: vi.fn().mockRejectedValue(new Error('offline')),
      }),
    ).rejects.toBeInstanceOf(MapPurgeUnavailableError);
    expect(tombstoneMap).not.toHaveBeenCalled();
  });
});
