import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserCorpAccess } from '@/platform/auth/corp-access';

const mocks = vi.hoisted(() => ({
  getAuthorizedMapGrantsForMaps: vi.fn(),
  listAuthorizedMapsForPrincipals: vi.fn(),
  listDeletedRestorableMapsForPrincipals: vi.fn(),
  resolveUserCorpAccess: vi.fn(),
  resolveEntityNames: vi.fn(),
}));

vi.mock('@/data/maps/queries', () => ({
  getAuthorizedMapGrantsForMaps: mocks.getAuthorizedMapGrantsForMaps,
  listAuthorizedMapsForPrincipals: mocks.listAuthorizedMapsForPrincipals,
  listDeletedRestorableMapsForPrincipals: mocks.listDeletedRestorableMapsForPrincipals,
}));
vi.mock('@/platform/auth/corp-access', () => ({
  resolveUserCorpAccess: mocks.resolveUserCorpAccess,
}));
vi.mock('@/data/eve-data/entity-names', () => ({
  resolveEntityNames: mocks.resolveEntityNames,
}));

import {
  listMapChromeData,
  resolveMapPrincipals,
  resolveMapPrincipalsWithOutcome,
} from './map-access';

function accessFor(overrides: Partial<UserCorpAccess> = {}): UserCorpAccess {
  return {
    userId: 'user-1',
    resolvedAt: new Date(),
    transientFailure: false,
    memberCorpIds: [],
    memberCharacterIdsByCorp: new Map(),
    allCharacterIds: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolveUserCorpAccess.mockResolvedValue(accessFor());
  mocks.getAuthorizedMapGrantsForMaps.mockResolvedValue([]);
  mocks.listAuthorizedMapsForPrincipals.mockResolvedValue([]);
  mocks.listDeletedRestorableMapsForPrincipals.mockResolvedValue([]);
  mocks.resolveEntityNames.mockResolvedValue({});
});

describe('map chrome data', () => {
  it('uses one fresh principal set for the authorized list, corporations, and batched admin grants', async () => {
    mocks.resolveUserCorpAccess.mockResolvedValue(
      accessFor({ allCharacterIds: [42, 43], memberCorpIds: [99, 100] }),
    );
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
    expect(mocks.resolveUserCorpAccess).toHaveBeenCalledWith('user-1');
    expect(mocks.resolveUserCorpAccess).toHaveBeenCalledOnce();
  });
});

describe('resolveMapPrincipals', () => {
  it('derives character and corporation principals from one access snapshot', async () => {
    mocks.resolveUserCorpAccess.mockResolvedValue(
      accessFor({ allCharacterIds: [42], memberCorpIds: [99] }),
    );

    await expect(resolveMapPrincipals('user-1')).resolves.toEqual({
      characterIds: [42],
      corporationIds: [99],
    });
    expect(mocks.resolveUserCorpAccess).toHaveBeenCalledWith('user-1');
    expect(mocks.resolveUserCorpAccess).toHaveBeenCalledOnce();
  });

  it('surfaces the snapshot transientFailure unchanged', async () => {
    mocks.resolveUserCorpAccess.mockResolvedValue(
      accessFor({ allCharacterIds: [42], memberCorpIds: [], transientFailure: true }),
    );

    await expect(resolveMapPrincipalsWithOutcome('user-1')).resolves.toEqual({
      principals: { characterIds: [42], corporationIds: [] },
      refreshTransientFailure: true,
    });
  });
});
