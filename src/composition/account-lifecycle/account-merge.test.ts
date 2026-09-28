import { beforeEach, describe, expect, it, vi } from 'vitest';

const doors = vi.hoisted(() => ({
  mergeLocationTrackingState: vi.fn(),
  teardownLocationTracking: vi.fn(),
  deliverCapturedMapAccessChanges: vi.fn(),
  purgeUserMapAccessProjection: vi.fn(),
  order: [] as string[],
}));

vi.mock('@/data/location-tracking/merge', () => ({
  mergeLocationTrackingState: (...args: unknown[]) => {
    doors.order.push('merge-door');
    return doors.mergeLocationTrackingState(...args);
  },
}));
vi.mock('@/data/location-tracking/purge', () => ({
  teardownLocationTracking: (...args: unknown[]) => {
    doors.order.push('teardown');
    return doors.teardownLocationTracking(...args);
  },
}));
vi.mock('@/composition/map-affiliation-access', () => ({
  deliverCapturedMapAccessChanges: (...args: unknown[]) => {
    doors.order.push('deliver');
    return doors.deliverCapturedMapAccessChanges(...args);
  },
}));
vi.mock('@/composition/map-access-projection', () => ({
  purgeUserMapAccessProjection: (...args: unknown[]) => {
    doors.order.push('backstop');
    return doors.purgeUserMapAccessProjection(...args);
  },
}));
vi.mock('@/composition/purge/register-all', () => ({ PURGE_CONTRIBUTORS: [] }));
vi.mock('@/data/telemetry/queries', () => ({ logUsageEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/db', () => ({ directClient: {}, resolveLockConnectionUrl: () => 'postgres://direct' }));

import { resolveMergePair, settleConvexAfterMerge, type MergeRequest } from './account-merge';

const request: MergeRequest = {
  linkingUserId: 'linker',
  otherUserId: 'other',
  provenCharacterId: 100,
  jwtOwnerHash: 'owner-one',
};
const linker = { id: 'linker', createdAt: new Date('2026-05-01T00:00:00Z'), role: 'USER' as const };
const other = { id: 'other', createdAt: new Date('2026-01-01T00:00:00Z'), role: 'ADMIN' as const };
const captured = [{ mapId: 'map-1', version: 'v1' }];

beforeEach(() => {
  doors.order.length = 0;
  for (const door of [
    doors.mergeLocationTrackingState,
    doors.teardownLocationTracking,
    doors.deliverCapturedMapAccessChanges,
    doors.purgeUserMapAccessProjection,
  ]) {
    door.mockReset().mockResolvedValue(undefined);
  }
});

describe('resolveMergePair', () => {
  it('picks the older user as survivor once both rows are locked and the proof still holds', () => {
    expect(
      resolveMergePair(request, [linker, other], { userId: 'other', ownerHash: 'owner-one' }),
    ).toEqual({ survivor: other, source: linker });
  });

  it('converges to a noop when the picture changed under the lock', () => {
    const proven = { userId: 'other', ownerHash: 'owner-one' };
    expect(resolveMergePair(request, [linker], proven)).toEqual({ noop: 'source-gone' });
    expect(resolveMergePair(request, [linker, other], undefined)).toEqual({ noop: 'character-moved' });
    expect(resolveMergePair(request, [linker, other], { ...proven, userId: 'third' })).toEqual({
      noop: 'character-moved',
    });
    expect(resolveMergePair(request, [linker, other], { ...proven, userId: 'linker' })).toEqual({
      noop: 'same-user',
    });
    expect(resolveMergePair(request, [linker, other], { ...proven, ownerHash: 'owner-two' })).toEqual({
      noop: 'owner-unverified',
    });
    expect(resolveMergePair(request, [linker, other], { ...proven, ownerHash: null })).toEqual({
      noop: 'owner-unverified',
    });
  });
});

describe('settleConvexAfterMerge', () => {
  it('moves tracking through the merge door before reprojecting, then sweeps the source claims', async () => {
    await settleConvexAfterMerge({
      sourceUserId: 'src',
      survivorUserId: 'surv',
      movedCharacterIds: [100],
      captured,
    });
    expect(doors.order).toEqual(['merge-door', 'deliver', 'backstop']);
    expect(doors.mergeLocationTrackingState).toHaveBeenCalledWith('src', 'surv');
    expect(doors.deliverCapturedMapAccessChanges).toHaveBeenCalledWith(captured);
    expect(doors.purgeUserMapAccessProjection).toHaveBeenCalledWith('src');
  });

  it('falls back to tearing the source down when the merge door fails, and still reprojects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    doors.mergeLocationTrackingState.mockRejectedValue(new Error('door down'));
    doors.deliverCapturedMapAccessChanges.mockRejectedValue(new Error('projection down'));
    await expect(
      settleConvexAfterMerge({
        sourceUserId: 'src',
        survivorUserId: 'surv',
        movedCharacterIds: [],
        captured,
      }),
    ).resolves.toBeUndefined();
    expect(doors.order).toEqual(['merge-door', 'teardown', 'deliver', 'backstop']);
    expect(doors.teardownLocationTracking).toHaveBeenCalledWith('src', null);
    expect(errorSpy.mock.calls.map((call) => call[0])).toEqual([
      '[account-merge] merge door failed; tearing down source tracking',
      '[account-merge] reprojection failed for src',
    ]);
    errorSpy.mockRestore();
  });
});
