import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCharacterCorporationId: vi.fn(),
  getMapIdsWithCharacterGrant: vi.fn(),
  getMapIdsWithCorporationGrants: vi.fn(),
  getOwnedMapIds: vi.fn(),
  projectMapAccess: vi.fn(),
  purgeMapChain: vi.fn(),
  purgeUserMapAccessProjection: vi.fn(),
  teardownLocationTracking: vi.fn(),
}));

vi.mock('@/data/maps/queries', () => ({
  getCharacterCorporationId: mocks.getCharacterCorporationId,
  getMapIdsWithCharacterGrant: mocks.getMapIdsWithCharacterGrant,
  getMapIdsWithCorporationGrants: mocks.getMapIdsWithCorporationGrants,
  getOwnedMapIds: mocks.getOwnedMapIds,
}));

vi.mock('@/composition/map-access-projection', () => ({
  projectMapAccess: mocks.projectMapAccess,
  purgeUserMapAccessProjection: mocks.purgeUserMapAccessProjection,
}));

vi.mock('@/composition/map-purge', () => ({
  purgeMapChain: mocks.purgeMapChain,
}));

vi.mock('@/data/location-tracking/purge', () => ({
  teardownLocationTracking: mocks.teardownLocationTracking,
}));

import {
  identityProjectionRunners,
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
    outcome: 'applied',
  });
  mocks.purgeMapChain.mockResolvedValue({ deleted: 0, remaining: false });
  mocks.purgeUserMapAccessProjection.mockResolvedValue({ deleted: 0 });
  mocks.teardownLocationTracking.mockResolvedValue(undefined);
});

describe('map-access-identity', () => {
  it('unions affected maps, re-projects through failures, and tears down owned chains before claims', async () => {
    mocks.getCharacterCorporationId.mockResolvedValue(9800);
    mocks.getMapIdsWithCharacterGrant.mockResolvedValue(['map-a', 'map-b']);
    mocks.getMapIdsWithCorporationGrants.mockResolvedValue(['map-b', 'map-c']);

    await expect(mapIdsAffectedByCharacter(100)).resolves.toEqual(['map-a', 'map-b', 'map-c']);
    expect(mocks.getMapIdsWithCorporationGrants).toHaveBeenCalledWith([9800]);

    mocks.projectMapAccess
      .mockRejectedValueOnce(new Error('convex down'))
      .mockResolvedValueOnce({
        inserted: 0,
        updated: 0,
        deleted: 1,
        unchanged: 0,
        outcome: 'applied',
      });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await reprojectMapsForCharacter(100);
    expect(mocks.projectMapAccess).toHaveBeenCalledWith('map-a');
    expect(mocks.projectMapAccess).toHaveBeenCalledWith('map-b');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();

    mocks.getOwnedMapIds.mockResolvedValue(['owned-1', 'owned-2']);
    await teardownProjectionsForDeletedUser('user-gone');
    expect(mocks.purgeMapChain).toHaveBeenCalledWith('owned-1');
    expect(mocks.purgeMapChain).toHaveBeenCalledWith('owned-2');
    expect(mocks.purgeUserMapAccessProjection).toHaveBeenCalledWith('user-gone');
    expect(mocks.teardownLocationTracking).toHaveBeenCalledWith('user-gone', null);
  });

  it('tears down location tracking for the user losing a character', async () => {
    await identityProjectionRunners.runAfterCharacterLinkChanged({
      userId: 'from-user',
      characterId: 42,
    });
    expect(mocks.teardownLocationTracking).toHaveBeenCalledWith('from-user', 42);
  });

  it('propagates a full-chain failure before clearing claims', async () => {
    mocks.getOwnedMapIds.mockResolvedValue(['owned-1', 'owned-2']);
    const failure = new Error('convex down');
    mocks.purgeMapChain.mockRejectedValueOnce(failure);

    await expect(teardownProjectionsForDeletedUser('user-gone')).rejects.toBe(failure);
    expect(mocks.purgeMapChain).toHaveBeenCalledTimes(1);
    expect(mocks.purgeUserMapAccessProjection).not.toHaveBeenCalled();
    expect(mocks.teardownLocationTracking).not.toHaveBeenCalled();
  });
});
