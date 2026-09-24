import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  affectedMapIdsForCharacter: vi.fn(),
  getOwnedMapIds: vi.fn(),
  projectMapAccess: vi.fn(),
  purgeMapChain: vi.fn(),
  purgeUserMapAccessProjection: vi.fn(),
  revokeUserMapClaims: vi.fn(),
  teardownLocationTracking: vi.fn(),
  enqueueAffectedMapAccessChanges: vi.fn(),
  acknowledgeMapAccessChanges: vi.fn(),
  readPendingMapAccessChanges: vi.fn(),
}));

vi.mock('@/data/maps/queries', () => ({
  affectedMapIdsForCharacter: mocks.affectedMapIdsForCharacter,
  enqueueAffectedMapAccessChanges: mocks.enqueueAffectedMapAccessChanges,
  getOwnedMapIds: mocks.getOwnedMapIds,
}));

vi.mock('@/composition/map-access-projection', () => ({
  projectMapAccess: mocks.projectMapAccess,
  requireCurrentProjection: (result: { outcome: string }) => {
    if (result.outcome === 'stale') throw new Error('newer projection won');
    return result;
  },
  purgeUserMapAccessProjection: mocks.purgeUserMapAccessProjection,
  revokeUserMapClaims: mocks.revokeUserMapClaims,
}));

vi.mock('@/composition/map-purge', () => ({
  purgeMapChain: mocks.purgeMapChain,
}));

vi.mock('@/data/location-tracking/purge', () => ({
  teardownLocationTracking: mocks.teardownLocationTracking,
}));

vi.mock('@/platform/auth/affiliation-store', () => ({
  MAX_PENDING_BATCH: 100,
  acknowledgeMapAccessChanges: mocks.acknowledgeMapAccessChanges,
  readPendingMapAccessChanges: mocks.readPendingMapAccessChanges,
}));

import {
  identityProjectionRunners,
  reprojectMapsForCharacter,
  revokeCharacterMapClaims,
  teardownProjectionsForDeletedUser,
} from './map-access-identity';

const pending = (ids: string[]) => ids.map((mapId) => ({ mapId, version: mapId }));

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
  mocks.enqueueAffectedMapAccessChanges.mockResolvedValue([]);
  mocks.readPendingMapAccessChanges.mockResolvedValue([]);
});

describe('map-access-identity', () => {
  it('re-projects through failures, and tears down owned chains before claims', async () => {
    mocks.enqueueAffectedMapAccessChanges.mockResolvedValue(pending(['map-a', 'map-b']));

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
    expect(mocks.enqueueAffectedMapAccessChanges).toHaveBeenCalledWith(100);
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

  it('enqueues affected maps on unlink, bounds immediate delivery, and always cleans location tracking', async () => {
    await identityProjectionRunners.runAfterCharacterLinkChanged({
      userId: 'from-user',
      characterId: 42,
    });
    expect(mocks.teardownLocationTracking).toHaveBeenCalledWith('from-user', 42);
    expect(mocks.enqueueAffectedMapAccessChanges).toHaveBeenCalledWith(42);
    expect(mocks.projectMapAccess).not.toHaveBeenCalled();

    const ids = Array.from({ length: 101 }, (_, i) => `map-${i}`);
    mocks.enqueueAffectedMapAccessChanges.mockResolvedValue(pending(ids));
    mocks.teardownLocationTracking.mockClear();
    await identityProjectionRunners.runAfterCharacterLinkChanged({ userId: 'from-user', characterId: 42 });
    expect(mocks.projectMapAccess).toHaveBeenCalledTimes(100);
    expect(mocks.acknowledgeMapAccessChanges).toHaveBeenCalledWith(
      ids.slice(0, 100).map((mapId) => ({ mapId, version: mapId })), [],
    );
    expect(mocks.readPendingMapAccessChanges).toHaveBeenCalled();
    expect(mocks.teardownLocationTracking).toHaveBeenCalledWith('from-user', 42);
  });

  it('revokes every affected map for only the departing user', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `map-${index}`);
    mocks.affectedMapIdsForCharacter.mockResolvedValue(ids);
    await revokeCharacterMapClaims('departing-user', 42);
    expect(mocks.revokeUserMapClaims).toHaveBeenCalledExactlyOnceWith('departing-user', ids);
  });

  it('queues restoration and retains the error if revocation stops after a partial batch', async () => {
    const failure = new Error('Convex unavailable');
    mocks.affectedMapIdsForCharacter.mockResolvedValue(['map-a']);
    mocks.revokeUserMapClaims.mockRejectedValueOnce(failure);
    await expect(identityProjectionRunners.runBeforeCharacterUnlink({
      userId: 'departing-user', characterId: 42,
    })).rejects.toBe(failure);
    expect(mocks.enqueueAffectedMapAccessChanges).toHaveBeenCalledWith(42);
  });

  it('reasserts revocation after the durable unlink so prior snapshots cannot win', async () => {
    mocks.affectedMapIdsForCharacter.mockResolvedValue(['map-a']);
    await identityProjectionRunners.runAfterCharacterUnlink({
      userId: 'departing-user', characterId: 42, mapIds: ['map-a'],
    });
    expect(mocks.revokeUserMapClaims).toHaveBeenCalledWith('departing-user', ['map-a']);
  });

  it.each(['enqueue', 'acknowledge'])('still tears down location when map %s fails', async (stage) => {
    mocks.enqueueAffectedMapAccessChanges.mockResolvedValue(pending(['map-a']));
    const failing = stage === 'enqueue' ? mocks.enqueueAffectedMapAccessChanges : mocks.acknowledgeMapAccessChanges;
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
