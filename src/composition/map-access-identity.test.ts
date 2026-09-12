import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  affectedMapIdsForCharacter: vi.fn(),
  affectedMapIdsForCorporations: vi.fn(),
  getOwnedMapIds: vi.fn(),
  projectMapAccess: vi.fn(),
  purgeMapChain: vi.fn(),
  purgeUserMapAccessProjection: vi.fn(),
  teardownLocationTracking: vi.fn(),
  refreshAffiliationsWithOutcome: vi.fn(),
}));

vi.mock('@/data/maps/queries', () => ({
  affectedMapIdsForCharacter: mocks.affectedMapIdsForCharacter,
  affectedMapIdsForCorporations: mocks.affectedMapIdsForCorporations,
  getOwnedMapIds: mocks.getOwnedMapIds,
}));

vi.mock('@/platform/auth/affiliation', () => ({
  refreshAffiliationsWithOutcome: mocks.refreshAffiliationsWithOutcome,
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
  refreshAffiliationsAndReproject,
  reprojectMapsForCharacter,
  reprojectMapsForCorporations,
  teardownProjectionsForDeletedUser,
} from './map-access-identity';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.affectedMapIdsForCharacter.mockResolvedValue([]);
  mocks.affectedMapIdsForCorporations.mockResolvedValue([]);
  mocks.refreshAffiliationsWithOutcome.mockResolvedValue({
    refreshed: 0,
    transientFailure: false,
    changedCorporationIds: [],
  });
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
  it('re-projects through failures, and tears down owned chains before claims', async () => {
    mocks.affectedMapIdsForCharacter.mockResolvedValue(['map-a', 'map-b']);

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
    expect(mocks.affectedMapIdsForCharacter).toHaveBeenCalledWith(100);
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

  it('re-projects maps granted to the previous and next corporations', async () => {
    mocks.affectedMapIdsForCorporations.mockResolvedValue(['map-old', 'map-new']);
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

    await reprojectMapsForCorporations([98000011, 98000021]);

    expect(mocks.affectedMapIdsForCorporations).toHaveBeenCalledWith([98000011, 98000021]);
    expect(mocks.affectedMapIdsForCharacter).not.toHaveBeenCalled();
    expect(mocks.projectMapAccess).toHaveBeenCalledWith('map-old');
    expect(mocks.projectMapAccess).toHaveBeenCalledWith('map-new');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('refreshes affiliations then re-projects only corporations that changed', async () => {
    mocks.refreshAffiliationsWithOutcome.mockResolvedValue({
      refreshed: 1,
      transientFailure: false,
      changedCorporationIds: [98000011, 98000021],
    });
    mocks.affectedMapIdsForCorporations.mockResolvedValue(['map-old']);

    await expect(refreshAffiliationsAndReproject([42])).resolves.toBe(1);
    expect(mocks.refreshAffiliationsWithOutcome).toHaveBeenCalledWith([42]);
    expect(mocks.affectedMapIdsForCorporations).toHaveBeenCalledWith([98000011, 98000021]);
    expect(mocks.projectMapAccess).toHaveBeenCalledWith('map-old');
  });

  it('skips corporation map lookup when affiliations did not change corporations', async () => {
    mocks.refreshAffiliationsWithOutcome.mockResolvedValue({
      refreshed: 1,
      transientFailure: false,
      changedCorporationIds: [],
    });

    await expect(refreshAffiliationsAndReproject([42])).resolves.toBe(1);
    expect(mocks.affectedMapIdsForCorporations).not.toHaveBeenCalled();
    expect(mocks.projectMapAccess).not.toHaveBeenCalled();
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
