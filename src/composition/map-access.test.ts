import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedAffiliation } from '@/platform/auth/affiliation-store';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  scheduleAccessDrain: vi.fn(),
  getAuthorizedMapGrantsForMaps: vi.fn(),
  listAuthorizedMapsForPrincipals: vi.fn(),
  listDeletedRestorableMapsForPrincipals: vi.fn(),
  getUserAffiliations: vi.fn(),
  refreshAffiliationsWithOutcome: vi.fn(),
  resolveEntityNames: vi.fn(),
}));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/composition/map-affiliation-access', () => ({
  scheduleAccessDrain: mocks.scheduleAccessDrain,
}));

vi.mock('@/data/maps/queries', () => ({
  getAuthorizedMapGrantsForMaps: mocks.getAuthorizedMapGrantsForMaps,
  listAuthorizedMapsForPrincipals: mocks.listAuthorizedMapsForPrincipals,
  listDeletedRestorableMapsForPrincipals: mocks.listDeletedRestorableMapsForPrincipals,
}));
vi.mock('@/platform/auth/affiliation-store', () => ({
  getUserAffiliations: mocks.getUserAffiliations,
}));
vi.mock('@/platform/auth/affiliation', () => ({
  refreshAffiliationsWithOutcome: mocks.refreshAffiliationsWithOutcome,
}));
vi.mock('@/data/eve-data/entity-names', () => ({
  resolveEntityNames: mocks.resolveEntityNames,
}));

import {
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
  mocks.refreshAffiliationsWithOutcome.mockResolvedValue({
    accessChanged: false,
    refreshed: 0,
    transientFailure: false,
  });
  mocks.getUserAffiliations.mockResolvedValue([]);
  mocks.getAuthorizedMapGrantsForMaps.mockResolvedValue([]);
  mocks.listAuthorizedMapsForPrincipals.mockResolvedValue([]);
  mocks.listDeletedRestorableMapsForPrincipals.mockResolvedValue([]);
  mocks.resolveEntityNames.mockResolvedValue({});
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
    mocks.listDeletedRestorableMapsForPrincipals.mockResolvedValue([
      {
        id: 'map-deleted',
        name: 'Deleted',
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        creatorName: 'Mapper',
        role: 'admin',
        archivedAt: new Date('2026-08-12T10:00:00.000Z'),
        provenance: { kind: 'created' },
      },
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
      deletedMaps: [
        {
          id: 'map-deleted',
          name: 'Deleted',
          createdAt: new Date('2026-08-01T10:00:00.000Z'),
          creatorName: 'Mapper',
          role: 'admin',
          archivedAt: new Date('2026-08-12T10:00:00.000Z'),
          provenance: { kind: 'created' },
        },
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
    expect(mocks.listDeletedRestorableMapsForPrincipals).toHaveBeenCalledWith(
      'user-1',
      { characterIds: [42, 43], corporationIds: [99, 100] },
    );
    expect(mocks.getAuthorizedMapGrantsForMaps).toHaveBeenCalledWith(
      'user-1',
      { characterIds: [42, 43], corporationIds: [99, 100] },
      ['map-a'],
    );
    expect(mocks.resolveEntityNames).toHaveBeenCalledWith([99, 100, 42, 100]);
    expect(mocks.refreshAffiliationsWithOutcome).not.toHaveBeenCalled();
    expect(mocks.scheduleAccessDrain).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('schedules one access drain when a stale refresh changes membership', async () => {
    mocks.getUserAffiliations
      .mockResolvedValueOnce([affiliation(42, 99, new Date(Date.now() - 2 * 60 * 60 * 1000))])
      .mockResolvedValueOnce([affiliation(42, 3000, new Date())]);
    mocks.refreshAffiliationsWithOutcome.mockResolvedValue({
      accessChanged: true,
      refreshed: 1,
      transientFailure: false,
    });

    await listMapChromeData('user-1');

    expect(mocks.scheduleAccessDrain).toHaveBeenCalledOnce();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

describe('resolveMapPrincipals', () => {
  it('reads once and reuses character and fresh corporation principals', async () => {
    const rows = [affiliation(42, 99, new Date())];
    mocks.getUserAffiliations.mockResolvedValue(rows);

    await expect(resolveMapPrincipals('user-1')).resolves.toEqual({
      characterIds: [42],
      corporationIds: [99],
    });
    expect(mocks.refreshAffiliationsWithOutcome).not.toHaveBeenCalled();
    expect(mocks.getUserAffiliations).toHaveBeenCalledOnce();
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
