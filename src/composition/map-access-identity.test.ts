import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  affectedMapIdsForCharacter: vi.fn(),
  getOwnedMapIds: vi.fn(),
  projectMapAccess: vi.fn(),
  purgeMapChain: vi.fn(),
  purgeUserMapAccessProjection: vi.fn(),
  teardownLocationTracking: vi.fn(),
  enqueueMapAccessChanges: vi.fn(),
  acknowledgeMapAccessChanges: vi.fn(),
}));

vi.mock('@/data/maps/queries', () => ({
  affectedMapIdsForCharacter: mocks.affectedMapIdsForCharacter,
  getOwnedMapIds: mocks.getOwnedMapIds,
}));

vi.mock('@/composition/map-access-projection', () => ({
  projectMapAccess: mocks.projectMapAccess,
  requireCurrentProjection: (result: { outcome: string }) => {
    if (result.outcome === 'stale') throw new Error('newer projection won');
    return result;
  },
  purgeUserMapAccessProjection: mocks.purgeUserMapAccessProjection,
}));

vi.mock('@/composition/map-purge', () => ({
  purgeMapChain: mocks.purgeMapChain,
}));

vi.mock('@/data/location-tracking/purge', () => ({
  teardownLocationTracking: mocks.teardownLocationTracking,
}));

vi.mock('@/platform/auth/affiliation-store', () => ({
  enqueueMapAccessChanges: mocks.enqueueMapAccessChanges,
  acknowledgeMapAccessChanges: mocks.acknowledgeMapAccessChanges,
}));

vi.mock('@/platform/auth/affiliation', () => ({ refreshAffiliationsWithOutcome: vi.fn() }));

import {
  identityProjectionRunners,
  reprojectMapsForCharacter,
  teardownProjectionsForDeletedUser,
} from './map-access-identity';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.affectedMapIdsForCharacter.mockResolvedValue([]);
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
  mocks.enqueueMapAccessChanges.mockImplementation(async (ids: string[]) => ids.map((mapId) => ({ mapId, version: mapId })));
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
    expect(mocks.enqueueMapAccessChanges).toHaveBeenCalledWith(['map-a', 'map-b']);
    expect(mocks.projectMapAccess).toHaveBeenCalledWith('map-a', { timeoutMs: 4_000 });
    expect(mocks.projectMapAccess).toHaveBeenCalledWith('map-b', { timeoutMs: 4_000 });
    expect(mocks.acknowledgeMapAccessChanges).toHaveBeenCalledWith(
      [{ mapId: 'map-b', version: 'map-b' }], [{ mapId: 'map-a', version: 'map-a' }],
    );
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

  it('enqueues every affected map on unlink while bounding immediate delivery and cleaning location', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `map-${i}`);
    mocks.affectedMapIdsForCharacter.mockResolvedValue(ids);
    await identityProjectionRunners.runAfterCharacterLinkChanged({ userId: 'from-user', characterId: 42 });
    expect(mocks.enqueueMapAccessChanges).toHaveBeenCalledWith(ids);
    expect(mocks.projectMapAccess).toHaveBeenCalledTimes(100);
    expect(mocks.acknowledgeMapAccessChanges).toHaveBeenCalledWith(
      ids.slice(0, 100).map((mapId) => ({ mapId, version: mapId })), [],
    );
    expect(mocks.teardownLocationTracking).toHaveBeenCalledWith('from-user', 42);
  });

  it.each(['enqueue', 'acknowledge'])('still tears down location when map %s fails', async (stage) => {
    mocks.affectedMapIdsForCharacter.mockResolvedValue(['map-a']);
    const failing = stage === 'enqueue' ? mocks.enqueueMapAccessChanges : mocks.acknowledgeMapAccessChanges;
    failing.mockRejectedValueOnce(new Error('database unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await identityProjectionRunners.runAfterCharacterLinkChanged({ userId: 'from-user', characterId: 42 });
    expect(mocks.teardownLocationTracking).toHaveBeenCalledWith('from-user', 42);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
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
