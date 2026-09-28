import { beforeEach, describe, expect, it, vi } from 'vitest';

const doors = vi.hoisted(() => ({
  logUsageEvent: vi.fn().mockResolvedValue(undefined),
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
vi.mock('@/data/telemetry/queries', () => ({ logUsageEvent: doors.logUsageEvent }));
vi.mock('@/db', () => ({ directClient: {}, resolveLockConnectionUrl: () => 'postgres://direct' }));

import type { PostgresJsDb } from '@/lib/db-types';
import { mergeUsers, resolveMergePair, settleConvexAfterMerge, type MergeRequest } from './account-merge';

const { chain, state } = vi.hoisted(() => {
  const state = { results: [] as unknown[], calls: { update: 0, delete: 0, execute: 0 } };
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(state.results.shift()),
  };
  for (const method of ['select', 'from', 'where', 'orderBy', 'for', 'set', 'limit']) {
    chain[method] = () => chain;
  }
  chain.update = () => {
    state.calls.update += 1;
    return chain;
  };
  chain.delete = () => {
    state.calls.delete += 1;
    return chain;
  };
  chain.execute = async () => {
    state.calls.execute += 1;
    return [];
  };
  return { chain, state };
});

const fakeDatabase = {
  transaction: (work: (tx: unknown) => Promise<unknown>) => work(chain),
} as unknown as PostgresJsDb;

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
  doors.logUsageEvent.mockClear();
  state.results = [];
  state.calls = { update: 0, delete: 0, execute: 0 };
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

describe('mergeUsers', () => {
  it('locks, re-checks, runs the rules, lifts the role, proves the source empty, deletes it last, and logs the merge', async () => {
    state.results = [
      [linker, other],
      [{ userId: 'other', ownerHash: 'owner-one' }],
      [{ accountId: '200' }, { accountId: 'not-a-character' }],
      undefined,
      undefined,
    ];
    const result = await mergeUsers(request, { database: fakeDatabase, contributors: [] });
    expect(result).toEqual({
      kind: 'merged',
      survivorUserId: 'other',
      sourceUserId: 'linker',
      movedCharacterIds: [200],
      captured: [],
    });
    expect(state.calls).toEqual({ update: 0, delete: 1, execute: 12 });
    expect(doors.logUsageEvent).toHaveBeenCalledWith({
      action: 'auth_merge',
      characterId: 100,
      metadata: { sourceUserId: 'linker', survivorUserId: 'other', movedCharacterIds: [200] },
    });
  });

  it('promotes the survivor when only the source was an admin', async () => {
    state.results = [
      [linker, { ...other, role: 'USER' as const }],
      [{ userId: 'other', ownerHash: 'owner-one' }],
      [],
      undefined,
      undefined,
    ];
    await mergeUsers(
      { ...request, linkingUserId: 'linker', otherUserId: 'other' },
      { database: fakeDatabase, contributors: [] },
    );
    expect(state.calls.update).toBe(0);

    state.results = [
      [{ ...linker, role: 'ADMIN' as const }, { ...other, role: 'USER' as const }],
      [{ userId: 'other', ownerHash: 'owner-one' }],
      [],
      undefined,
      undefined,
      undefined,
    ];
    await mergeUsers(request, { database: fakeDatabase, contributors: [] });
    expect(state.calls.update).toBe(1);
  });

  it('writes nothing and logs nothing when the locked picture says noop', async () => {
    state.results = [[linker], [{ userId: 'other', ownerHash: 'owner-one' }]];
    await expect(mergeUsers(request, { database: fakeDatabase })).resolves.toEqual({
      kind: 'noop',
      reason: 'source-gone',
    });
    expect(state.calls).toEqual({ update: 0, delete: 0, execute: 0 });
    expect(doors.logUsageEvent).not.toHaveBeenCalled();
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
