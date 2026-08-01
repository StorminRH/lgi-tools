import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCharacterCorporationId: vi.fn(),
  getMapIdsWithCharacterGrant: vi.fn(),
  getMapIdsWithCorporationGrants: vi.fn(),
  getOwnedMapIds: vi.fn(),
  projectMapAccess: vi.fn(),
  teardownMapAccessProjection: vi.fn(),
  purgeUserMapAccessProjection: vi.fn(),
  registerIdentityProjectionHooks: vi.fn(),
}));

vi.mock('@/data/maps/queries', () => ({
  getCharacterCorporationId: mocks.getCharacterCorporationId,
  getMapIdsWithCharacterGrant: mocks.getMapIdsWithCharacterGrant,
  getMapIdsWithCorporationGrants: mocks.getMapIdsWithCorporationGrants,
  getOwnedMapIds: mocks.getOwnedMapIds,
}));

vi.mock('@/composition/map-access-projection', () => ({
  projectMapAccess: mocks.projectMapAccess,
  teardownMapAccessProjection: mocks.teardownMapAccessProjection,
  purgeUserMapAccessProjection: mocks.purgeUserMapAccessProjection,
}));

vi.mock('@/platform/auth/identity-projection-hooks', () => ({
  registerIdentityProjectionHooks: mocks.registerIdentityProjectionHooks,
}));

import {
  mapIdsAffectedByCharacter,
  reprojectMapsForCharacter,
  teardownProjectionsForDeletedUser,
} from './map-access-identity';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCharacterCorporationId.mockResolvedValue(null);
  mocks.getMapIdsWithCharacterGrant.mockResolvedValue([]);
  mocks.getMapIdsWithCorporationGrants.mockResolvedValue([]);
  mocks.getOwnedMapIds.mockResolvedValue([]);
  mocks.projectMapAccess.mockResolvedValue({
    inserted: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
  });
  mocks.teardownMapAccessProjection.mockResolvedValue({
    inserted: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
  });
  mocks.purgeUserMapAccessProjection.mockResolvedValue({ deleted: 0 });
});

describe('map-access-identity', () => {
  it('unions character-grant and corp-grant map ids for one character', async () => {
    mocks.getCharacterCorporationId.mockResolvedValue(9800);
    mocks.getMapIdsWithCharacterGrant.mockResolvedValue(['map-a', 'map-b']);
    mocks.getMapIdsWithCorporationGrants.mockResolvedValue(['map-b', 'map-c']);

    await expect(mapIdsAffectedByCharacter(100)).resolves.toEqual(['map-a', 'map-b', 'map-c']);
    expect(mocks.getMapIdsWithCorporationGrants).toHaveBeenCalledWith([9800]);
  });

  it('re-projects every affected map and continues after a projection failure', async () => {
    mocks.getMapIdsWithCharacterGrant.mockResolvedValue(['map-a', 'map-b']);
    mocks.projectMapAccess
      .mockRejectedValueOnce(new Error('convex down'))
      .mockResolvedValueOnce({ inserted: 0, updated: 0, deleted: 1, unchanged: 0 });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await reprojectMapsForCharacter(100);

    expect(mocks.projectMapAccess).toHaveBeenCalledWith('map-a');
    expect(mocks.projectMapAccess).toHaveBeenCalledWith('map-b');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('tears down owned maps then purges the deleted user claims', async () => {
    mocks.getOwnedMapIds.mockResolvedValue(['owned-1', 'owned-2']);

    await teardownProjectionsForDeletedUser('user-gone');

    expect(mocks.teardownMapAccessProjection).toHaveBeenCalledWith('owned-1');
    expect(mocks.teardownMapAccessProjection).toHaveBeenCalledWith('owned-2');
    expect(mocks.purgeUserMapAccessProjection).toHaveBeenCalledWith('user-gone');
  });
});
