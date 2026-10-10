import { afterEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';

const door = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/convex-http-door', () => ({ postConvexHttpDoor: door.post }));

import {
  grandfatherGrants,
  scopeLegacyMap,
  scopeLegacyMaps,
  type MapScopingDependencies,
} from './map-character-scoping';

const AT = new Date('2026-09-01T00:00:00.000Z');

function affiliation(userId: string, characterId: number, corporationId: number | null, eligible = true) {
  return {
    userId, characterId, corporationId, allianceId: null, factionId: null,
    refreshedAt: AT, sharedAccessEligible: eligible,
  };
}

const CLAIMS = [
  { userId: 'creator', roles: ['admin' as const] },
  { userId: 'member', roles: ['viewer' as const, 'editor' as const] },
];
const GRANTS = [{ ownerType: 'corporation' as const, ownerId: 990, role: 'viewer' as const, grantedAt: AT }];

describe('grandfatherGrants', () => {
  it('grants tracked characters outside the grants at the account\'s highest role, nothing else', () => {
    expect(grandfatherGrants({
      claims: CLAIMS,
      grants: GRANTS,
      tracked: [
        { userId: 'creator', characterId: 1 },
        { userId: 'member', characterId: 2 },
        { userId: 'member', characterId: 3 },
        { userId: 'member', characterId: 4 },
        { userId: 'member', characterId: 99 },
        { userId: 'gone', characterId: 5 },
        { userId: 'creator', characterId: 1 },
      ],
      affiliations: [
        affiliation('creator', 1, 100),
        affiliation('member', 2, 990),
        affiliation('member', 3, 991),
        affiliation('member', 4, 990, false),
        affiliation('gone', 5, 991),
      ],
    })).toEqual([
      { userId: 'creator', characterId: 1, role: 'admin' },
      { userId: 'member', characterId: 3, role: 'editor' },
      { userId: 'member', characterId: 4, role: 'editor' },
    ]);
  });
});

function deps(overrides: Partial<Required<MapScopingDependencies>> = {}) {
  return {
    computeClaims: vi.fn().mockResolvedValue(CLAIMS),
    readGrants: vi.fn().mockResolvedValue(GRANTS),
    freezeTracking: vi.fn().mockResolvedValue([{ userId: 'member', characterId: 3 }]),
    readTransfers: vi.fn().mockResolvedValue([]),
    readAffiliations: vi.fn().mockResolvedValue([affiliation('member', 3, 991)]),
    grandfather: vi.fn().mockResolvedValue(undefined),
    stamp: vi.fn().mockResolvedValue({ mapId: 'map-1', version: 'v1' }),
    deliver: vi.fn().mockResolvedValue({ processed: 1, failed: 0 }),
    ...overrides,
  };
}

describe('scopeLegacyMap', () => {
  afterEach(() => vi.restoreAllMocks());

  it('freezes and snapshots once, then grants, stamps, and reprojects', async () => {
    const order: string[] = [];
    const record = <T,>(step: string, value: T) => vi.fn(async () => {
      order.push(step);
      return value;
    });
    const d = deps({
      freezeTracking: record('freeze', [{ userId: 'member', characterId: 3 }]),
      grandfather: record('grant', undefined),
      stamp: record('stamp', { mapId: 'map-1', version: 'v1' }),
      deliver: record('deliver', { processed: 1, failed: 0 }),
    });
    await expect(scopeLegacyMap('map-1', d)).resolves.toBe(true);
    expect(order).toEqual(['freeze', 'grant', 'stamp', 'deliver']);
    expect(d.grandfather).toHaveBeenCalledWith('map-1', [{ userId: 'member', characterId: 3, role: 'editor' }], expect.any(Date));
    expect(d.deliver).toHaveBeenCalledExactlyOnceWith([{ mapId: 'map-1', version: 'v1' }]);
    expect(d.readAffiliations).toHaveBeenCalledWith(['member']);
  });

  it('leaves the map unscoped for retry when the frozen grandfather write fails', async () => {
    const d = deps({
      grandfather: vi.fn().mockRejectedValueOnce(new Error('SQL down')),
    });
    await expect(scopeLegacyMap('map-1', d)).rejects.toThrow('SQL down');
    expect(d.grandfather).toHaveBeenCalledOnce();
    expect(d.stamp).not.toHaveBeenCalled();
    expect(d.deliver).not.toHaveBeenCalled();
  });

  it('reads tracked pairs through the service door by default', async () => {
    door.post.mockResolvedValue({ tracked: [{ userId: 'member', characterId: 3 }] });
    const { freezeTracking: _freezeTracking, ...rest } = deps();
    await expect(scopeLegacyMap('map-1', rest)).resolves.toBe(true);
    expect(door.post).toHaveBeenCalledWith(expect.objectContaining({
      path: '/map-tracking-snapshot', body: { mapId: 'map-1' },
    }));
    expect(rest.grandfather).toHaveBeenCalledWith('map-1', [{ userId: 'member', characterId: 3, role: 'editor' }], expect.any(Date));
  });

  it('uses durable transfer intent after the source tracking and account are gone', async () => {
    const d = deps({
      freezeTracking: vi.fn().mockResolvedValue([]),
      readTransfers: vi.fn().mockResolvedValue([{ userId: 'member', characterId: 3 }]),
    });
    await expect(scopeLegacyMap('map-1', d)).resolves.toBe(true);
    expect(d.grandfather).toHaveBeenCalledWith('map-1', [
      { userId: 'member', characterId: 3, role: 'editor' },
    ], expect.any(Date));
    expect(d.freezeTracking).toHaveBeenCalledOnce();
  });

  it('recomputes fresh claims when a new transfer commits during the grandfather write', async () => {
    const transferred = { userId: 'survivor', characterId: 3 };
    const d = deps({
      readTransfers: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([transferred]),
      computeClaims: vi.fn().mockResolvedValueOnce(CLAIMS).mockResolvedValue([
        { userId: 'creator', roles: ['admin'] }, { userId: 'survivor', roles: ['viewer'] },
      ]),
      readAffiliations: vi.fn().mockResolvedValueOnce([affiliation('member', 3, 991)])
        .mockResolvedValue([affiliation('survivor', 3, 991)]),
    });
    await expect(scopeLegacyMap('map-1', d)).resolves.toBe(true);
    expect(d.grandfather).toHaveBeenLastCalledWith('map-1', [
      { userId: 'survivor', characterId: 3, role: 'viewer' },
    ], expect.any(Date));
    expect(d.grandfather).toHaveBeenCalledTimes(2);
    expect(d.freezeTracking).toHaveBeenCalledOnce();
  });

  it('follows a pending job retargeted by a chained merge without stamping through continuing churn', async () => {
    const d = deps({
      freezeTracking: vi.fn().mockResolvedValue([]),
      readTransfers: vi.fn()
        .mockResolvedValueOnce([{ userId: 'middle', characterId: 3 }])
        .mockResolvedValue([{ userId: 'final', characterId: 3 }]),
      computeClaims: vi.fn().mockResolvedValueOnce([{ userId: 'middle', roles: ['editor'] }])
        .mockResolvedValue([{ userId: 'final', roles: ['viewer'] }]),
      readAffiliations: vi.fn().mockResolvedValueOnce([affiliation('middle', 3, 991)])
        .mockResolvedValue([affiliation('final', 3, 991)]),
    });
    await expect(scopeLegacyMap('map-1', d)).resolves.toBe(true);
    expect(d.grandfather).toHaveBeenLastCalledWith('map-1', [
      { userId: 'final', characterId: 3, role: 'viewer' },
    ], expect.any(Date));
    expect(d.stamp).toHaveBeenCalledOnce();

    const churning = deps({ readTransfers: vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: 'member', characterId: 4 }])
      .mockResolvedValueOnce([{ userId: 'member', characterId: 5 }])
      .mockResolvedValueOnce([{ userId: 'member', characterId: 6 }]),
    });
    await expect(scopeLegacyMap('map-1', churning)).rejects.toThrow('retained for retry');
    expect(churning.stamp).not.toHaveBeenCalled();
    expect(churning.deliver).not.toHaveBeenCalled();
    expect(churning.freezeTracking).toHaveBeenCalledOnce();
  });

  it('skips a map that vanished and reports a reprojection kept for retry', async () => {
    const gone = deps({ stamp: vi.fn().mockResolvedValue(null) });
    await expect(scopeLegacyMap('map-1', gone)).resolves.toBe(true);
    expect(gone.deliver).not.toHaveBeenCalled();

    const kept = deps({ deliver: vi.fn().mockResolvedValue({ processed: 0, failed: 1 }) });
    await expect(scopeLegacyMap('map-1', kept)).resolves.toBe(false);
  });
});

describe('scopeLegacyMaps', () => {
  it('counts each map, keeps going past a failure, and stops at the deadline', async () => {
    silenceConsolePrefixes('error', ['[map-character-scoping] map kept for retry']);
    const listMapIds = vi.fn().mockResolvedValue(['a', 'b', 'c']);
    const d = deps({
      freezeTracking: vi.fn(async (mapId: string) => {
        if (mapId === 'b') throw new Error('door down');
        return [];
      }),
      deliver: vi.fn()
        .mockResolvedValueOnce({ processed: 1, failed: 0 })
        .mockResolvedValueOnce({ processed: 0, failed: 1 }),
    });
    await expect(scopeLegacyMaps(Date.now() + 60_000, { ...d, listMapIds }))
      .resolves.toEqual({ succeeded: 1, failed: 2 });
    expect(listMapIds).toHaveBeenCalledWith(50);

    await expect(scopeLegacyMaps(Date.now() - 1, { ...d, listMapIds }))
      .resolves.toEqual({ succeeded: 0, failed: 0 });
  });
});
