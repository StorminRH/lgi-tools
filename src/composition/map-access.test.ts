import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedAffiliation } from '@/platform/auth/membership';

const mocks = vi.hoisted(() => ({
  getMapAccessSubject: vi.fn(),
  getMapGrants: vi.fn(),
  getAuthorizedMapGrantsForMaps: vi.fn(),
  listAuthorizedMapsForPrincipals: vi.fn(),
  listDeletedRestorableMapsForPrincipals: vi.fn(),
  getUserAffiliations: vi.fn(),
  refreshStaleAffiliationsForUserWithOutcome: vi.fn(),
  resolveEntityNames: vi.fn(),
}));

vi.mock('@/data/maps/queries', () => ({
  getMapAccessSubject: mocks.getMapAccessSubject,
  getMapGrants: mocks.getMapGrants,
  getAuthorizedMapGrantsForMaps: mocks.getAuthorizedMapGrantsForMaps,
  listAuthorizedMapsForPrincipals: mocks.listAuthorizedMapsForPrincipals,
  listDeletedRestorableMapsForPrincipals: mocks.listDeletedRestorableMapsForPrincipals,
}));
vi.mock('@/platform/auth/affiliation-store', () => ({
  getUserAffiliations: mocks.getUserAffiliations,
}));
vi.mock('@/platform/auth/affiliation', () => ({
  refreshStaleAffiliationsForUserWithOutcome: mocks.refreshStaleAffiliationsForUserWithOutcome,
}));
vi.mock('@/data/eve-data/entity-names', () => ({
  resolveEntityNames: mocks.resolveEntityNames,
}));

import {
  getMapAccess,
  listAuthorizedMaps,
  listDeletedRestorableMaps,
  listMapChromeData,
  resolveMapPrincipals,
} from './map-access';

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
  mocks.getAuthorizedMapGrantsForMaps.mockResolvedValue([]);
  mocks.listAuthorizedMapsForPrincipals.mockResolvedValue([]);
  mocks.listDeletedRestorableMapsForPrincipals.mockResolvedValue([]);
  mocks.resolveEntityNames.mockResolvedValue({});
});

describe('map listings', () => {
  it('resolves principals once and delegates the authorized listing to its data owner', async () => {
    mocks.getUserAffiliations.mockResolvedValue([affiliation(42, 99, new Date())]);
    const expected = [{ id: 'map-1' }];
    mocks.listAuthorizedMapsForPrincipals.mockResolvedValue(expected);

    await expect(listAuthorizedMaps('user-1')).resolves.toBe(expected);
    expect(mocks.listAuthorizedMapsForPrincipals).toHaveBeenCalledWith('user-1', {
      characterIds: [42],
      corporationIds: [99],
    });
  });

  it('resolves the same principals for the restorable listing owner', async () => {
    mocks.getUserAffiliations.mockResolvedValue([affiliation(42, 99, new Date())]);
    const expected = [{ id: 'map-deleted' }];
    mocks.listDeletedRestorableMapsForPrincipals.mockResolvedValue(expected);

    await expect(listDeletedRestorableMaps('user-1')).resolves.toBe(expected);
    expect(mocks.listDeletedRestorableMapsForPrincipals).toHaveBeenCalledWith(
      'user-1',
      { characterIds: [42], corporationIds: [99] },
    );
  });
});

describe('map chrome data', () => {
  it('uses one fresh principal set for the authorized list, corporations, and batched admin grants', async () => {
    mocks.getUserAffiliations.mockResolvedValue([
      affiliation(42, 99, new Date()),
      affiliation(43, 100, new Date()),
    ]);
    mocks.listAuthorizedMapsForPrincipals.mockResolvedValue([
      { id: 'map-a', name: 'Alpha', role: 'admin' },
      { id: 'map-b', name: 'Bravo', role: 'viewer' },
    ]);
    mocks.getAuthorizedMapGrantsForMaps.mockResolvedValue([
      {
        mapId: 'map-a',
        ownerType: 'character',
        ownerId: 42,
        role: 'editor',
      },
      {
        mapId: 'map-a',
        ownerType: 'corporation',
        ownerId: 100,
        role: 'viewer',
      },
    ]);
    mocks.resolveEntityNames.mockResolvedValue({
      '42': 'Scout',
      '99': 'Signal Cartel',
    });

    await expect(listMapChromeData('user-1')).resolves.toEqual({
      maps: [
        { id: 'map-a', name: 'Alpha', role: 'admin' },
        { id: 'map-b', name: 'Bravo', role: 'viewer' },
      ],
      corporations: [
        { corporationId: 99, name: 'Signal Cartel' },
        { corporationId: 100, name: 'Corporation 100' },
      ],
      grantsByMapId: {
        'map-a': [
          {
            ownerType: 'character',
            ownerId: 42,
            role: 'editor',
            name: 'Scout',
          },
          {
            ownerType: 'corporation',
            ownerId: 100,
            role: 'viewer',
            name: 'Corporation 100',
          },
        ],
      },
    });
    expect(mocks.listAuthorizedMapsForPrincipals).toHaveBeenCalledWith(
      'user-1',
      { characterIds: [42, 43], corporationIds: [99, 100] },
    );
    expect(mocks.getAuthorizedMapGrantsForMaps).toHaveBeenCalledWith(
      'user-1',
      { characterIds: [42, 43], corporationIds: [99, 100] },
      ['map-a'],
    );
    expect(mocks.resolveEntityNames).toHaveBeenCalledWith([99, 100, 42, 100]);
    expect(mocks.refreshStaleAffiliationsForUserWithOutcome).toHaveBeenCalledOnce();
  });
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
      expected: { role: 'admin', canView: true, canEdit: true },
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
      grants: [{ ownerType: 'character', ownerId: 42, role: 'admin' }],
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
