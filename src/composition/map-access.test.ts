import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedAffiliation } from '@/platform/auth/membership';

const mocks = vi.hoisted(() => ({
  getMapAccessSubject: vi.fn(),
  getMapGrants: vi.fn(),
  getUserAffiliations: vi.fn(),
  refreshStaleAffiliationsForUserWithOutcome: vi.fn(),
}));

vi.mock('@/data/maps/queries', () => ({
  getMapAccessSubject: mocks.getMapAccessSubject,
  getMapGrants: mocks.getMapGrants,
}));
vi.mock('@/platform/auth/affiliation-store', () => ({
  getUserAffiliations: mocks.getUserAffiliations,
}));
vi.mock('@/platform/auth/affiliation', () => ({
  refreshStaleAffiliationsForUserWithOutcome: mocks.refreshStaleAffiliationsForUserWithOutcome,
}));

import { getMapAccess, resolveMapPrincipals } from './map-access';

function affiliation(
  characterId: number,
  corporationId: number,
  refreshedAt: Date,
): CachedAffiliation {
  return {
    characterId,
    corporationId,
    allianceId: null,
    factionId: null,
    refreshedAt,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.refreshStaleAffiliationsForUserWithOutcome.mockResolvedValue({
    refreshed: 0,
    transientFailure: false,
  });
  mocks.getUserAffiliations.mockResolvedValue([]);
  mocks.getMapAccessSubject.mockResolvedValue({
    userId: 'creator',
    archivedAt: null,
  });
  mocks.getMapGrants.mockResolvedValue([]);
});

describe('resolveMapPrincipals', () => {
  it('refreshes exactly once before reading character and fresh corporation principals', async () => {
    const rows = [affiliation(42, 99, new Date())];
    mocks.getUserAffiliations.mockResolvedValue(rows);

    await expect(resolveMapPrincipals('user-1')).resolves.toEqual({
      characterIds: [42],
      corporationIds: [99],
    });
    expect(mocks.refreshStaleAffiliationsForUserWithOutcome).toHaveBeenCalledOnce();
    expect(mocks.refreshStaleAffiliationsForUserWithOutcome).toHaveBeenCalledWith('user-1');
    expect(
      mocks.refreshStaleAffiliationsForUserWithOutcome.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.getUserAffiliations.mock.invocationCallOrder[0] ?? 0);
  });

  it('keeps character identity but fails closed on a stale corporation affiliation', async () => {
    mocks.getUserAffiliations.mockResolvedValue([
      affiliation(42, 99, new Date(Date.now() - 2 * 60 * 60 * 1000)),
    ]);

    await expect(resolveMapPrincipals('user-1')).resolves.toEqual({
      characterIds: [42],
      corporationIds: [],
    });
  });
});

describe('getMapAccess', () => {
  it.each([
    {
      label: 'creator',
      userId: 'creator',
      affiliations: [],
      grants: [],
      expected: { role: 'owner', canView: true, canEdit: true },
    },
    {
      label: 'corporation editor',
      userId: 'editor',
      affiliations: [affiliation(42, 99, new Date())],
      grants: [{ ownerType: 'corporation', ownerId: 99, role: 'editor' }],
      expected: { role: 'editor', canView: true, canEdit: true },
    },
    {
      label: 'character viewer',
      userId: 'viewer',
      affiliations: [affiliation(42, 99, new Date())],
      grants: [{ ownerType: 'character', ownerId: 42, role: 'viewer' }],
      expected: { role: 'viewer', canView: true, canEdit: false },
    },
    {
      label: 'unrelated user',
      userId: 'unrelated',
      affiliations: [affiliation(7, 8, new Date())],
      grants: [{ ownerType: 'character', ownerId: 42, role: 'owner' }],
      expected: { role: null, canView: false, canEdit: false },
    },
  ] as const)(
    'returns the authoritative role and capability pair for a $label',
    async ({ userId, affiliations, grants, expected }) => {
      mocks.getUserAffiliations.mockResolvedValue(affiliations);
      mocks.getMapGrants.mockResolvedValue(grants);
      await expect(getMapAccess(userId, 'map-1')).resolves.toEqual(expected);
    },
  );

  it('denies a stale corporation grant while preserving a direct character grant', async () => {
    mocks.getUserAffiliations.mockResolvedValue([
      affiliation(42, 99, new Date(Date.now() - 2 * 60 * 60 * 1000)),
    ]);
    mocks.getMapGrants.mockResolvedValue([
      { ownerType: 'corporation', ownerId: 99, role: 'editor' },
      { ownerType: 'character', ownerId: 42, role: 'viewer' },
    ]);

    await expect(getMapAccess('viewer', 'map-1')).resolves.toEqual({
      role: 'viewer',
      canView: true,
      canEdit: false,
    });
  });

  it('short-circuits a missing map before principal or grant resolution', async () => {
    mocks.getMapAccessSubject.mockResolvedValue(null);

    await expect(getMapAccess('user-1', 'missing')).resolves.toEqual({
      role: null,
      canView: false,
      canEdit: false,
    });
    expect(mocks.refreshStaleAffiliationsForUserWithOutcome).not.toHaveBeenCalled();
    expect(mocks.getMapGrants).not.toHaveBeenCalled();
  });
});
