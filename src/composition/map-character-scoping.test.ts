import { afterEach, describe, expect, it, vi } from 'vitest';

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
      { characterId: 1, role: 'admin' },
      { characterId: 3, role: 'editor' },
      { characterId: 4, role: 'editor' },
    ]);
  });
});

function deps(overrides: Partial<Required<MapScopingDependencies>> = {}) {
  return {
    computeClaims: vi.fn().mockResolvedValue(CLAIMS),
    readGrants: vi.fn().mockResolvedValue(GRANTS),
    readTracked: vi.fn().mockResolvedValue([{ userId: 'member', characterId: 3 }]),
    readAffiliations: vi.fn().mockResolvedValue([affiliation('member', 3, 991)]),
    grandfather: vi.fn().mockResolvedValue({ mapId: 'map-1', version: 'v1' }),
    deliver: vi.fn().mockResolvedValue({ processed: 1, failed: 0 }),
    ...overrides,
  };
}

describe('scopeLegacyMap', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stamps with grants twice before one reprojection of the latest queued change', async () => {
    const order: string[] = [];
    const d = deps({
      grandfather: vi.fn(async () => {
        order.push('grandfather');
        return { mapId: 'map-1', version: `v${order.length}` };
      }),
      deliver: vi.fn(async () => {
        order.push('deliver');
        return { processed: 1, failed: 0 };
      }),
    });
    await expect(scopeLegacyMap('map-1', d)).resolves.toBe(true);
    expect(order).toEqual(['grandfather', 'grandfather', 'deliver']);
    expect(d.grandfather).toHaveBeenCalledWith('map-1', [{ characterId: 3, role: 'editor' }]);
    expect(d.deliver).toHaveBeenCalledExactlyOnceWith([{ mapId: 'map-1', version: 'v2' }]);
    expect(d.readAffiliations).toHaveBeenCalledWith(['member']);
  });

  it('reads tracked pairs through the service door by default', async () => {
    door.post.mockResolvedValue({ tracked: [{ userId: 'member', characterId: 3 }] });
    const { readTracked: _readTracked, ...rest } = deps();
    await expect(scopeLegacyMap('map-1', rest)).resolves.toBe(true);
    expect(door.post).toHaveBeenCalledWith(expect.objectContaining({
      path: '/map-tracking-snapshot', body: { mapId: 'map-1' },
    }));
    expect(rest.grandfather).toHaveBeenCalledWith('map-1', [{ characterId: 3, role: 'editor' }]);
  });

  it('skips a map that vanished and reports a reprojection kept for retry', async () => {
    const gone = deps({ grandfather: vi.fn().mockResolvedValue(null) });
    await expect(scopeLegacyMap('map-1', gone)).resolves.toBe(true);
    expect(gone.deliver).not.toHaveBeenCalled();

    const kept = deps({ deliver: vi.fn().mockResolvedValue({ processed: 0, failed: 1 }) });
    await expect(scopeLegacyMap('map-1', kept)).resolves.toBe(false);
  });
});

describe('scopeLegacyMaps', () => {
  it('counts each map, keeps going past a failure, and stops at the deadline', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const listMapIds = vi.fn().mockResolvedValue(['a', 'b', 'c']);
    const d = deps({
      readTracked: vi.fn(async (mapId: string) => {
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
