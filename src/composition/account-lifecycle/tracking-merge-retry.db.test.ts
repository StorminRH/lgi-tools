import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { restoreMergeTracking } from '@/data/location-tracking/merge';
import * as mergeStore from '@/data/location-tracking/merge-store';
import { cancelPendingTracking, enqueueTrackingMerge } from '@/data/location-tracking/merge-store';
import { pendingTrackingMerges } from '@/data/location-tracking/schema';
import { purgeLocationTracking } from '@/data/location-tracking/purge';
import { account, user } from '@/db/auth-schema';
import { createDbTestHarness, seedEveAccount, seedUser } from '@/db/__tests__/support/db-test-harness';
import { projectMapAccess, purgeUserMapAccessProjection } from '@/composition/map-access-projection';
import { reconcileTrackingMerges } from './tracking-merge-retry';

vi.mock('@/data/location-tracking/merge', () => ({ restoreMergeTracking: vi.fn() }));
vi.mock('@/data/location-tracking/purge', () => ({ purgeLocationTracking: vi.fn() }));
vi.mock('@/composition/map-access-projection', () => ({
  projectMapAccess: vi.fn(),
  purgeUserMapAccessProjection: vi.fn(),
  requireCurrentProjection: vi.fn(),
}));

const harness = await createDbTestHarness({
  schema: 'test_tracking_merge_retry',
  tables: ['user', 'account', 'pending_tracking_merges'],
  foreignKeys: [
    { table: 'account', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'pending_tracking_merges', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

const SURVIVOR = 'survivor';
const SOURCE = 'deleted-source';
const CHARACTER = 90000041;
const OTHER_CHARACTER = 90000042;
const MAP = '11111111-1111-4111-8111-111111111111';
const OTHER_MAP = '22222222-2222-4222-8222-222222222222';
const selection = { mapId: MAP, characterId: CHARACTER };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(restoreMergeTracking).mockResolvedValue({ restored: 1, skipped: 0, alreadyApplied: false });
});

async function seedOwner() {
  await seedUser(harness.db, SURVIVOR);
  await seedEveAccount(harness.db, { id: 'linked', userId: SURVIVOR, characterId: CHARACTER });
}

const queued = () => harness.db.select().from(pendingTrackingMerges);
const reconcile = () => reconcileTrackingMerges(SURVIVOR, harness.db);

describe.skipIf(!harness.reachable)('tracking merge recovery (real Postgres)', () => {
  it('retains a failed delivery durably, then restores it using the same operation id and removes the job', async () => {
    await seedOwner();
    await enqueueTrackingMerge(harness.db, SOURCE, SURVIVOR, [selection]);
    const [job] = await queued();
    vi.mocked(restoreMergeTracking).mockRejectedValueOnce(new Error('response lost'));
    const error = silenceConsolePrefixes('error', ['[account-merge] tracking transfer retained for retry']);
    try {
      expect(await reconcile()).toEqual({ processed: 0, failed: 1 });
      expect(await queued()).toEqual([expect.objectContaining({ id: job!.id, selections: [selection] })]);
      expect(await reconcile()).toEqual({ processed: 1, failed: 0 });
      expect(restoreMergeTracking).toHaveBeenNthCalledWith(1, job!.id, SURVIVOR, [selection]);
      expect(restoreMergeTracking).toHaveBeenNthCalledWith(2, job!.id, SURVIVOR, [selection]);
      expect(await queued()).toEqual([]);
      expect(await reconcile()).toEqual({ processed: 0, failed: 0 });
      expect(restoreMergeTracking).toHaveBeenCalledTimes(2);
    } finally {
      error.mockRestore();
    }
  });

  it('revokes source access and live tracking before restoring the survivor', async () => {
    await seedOwner();
    await enqueueTrackingMerge(harness.db, SOURCE, SURVIVOR, [selection]);
    const events: string[] = [];
    vi.mocked(purgeUserMapAccessProjection).mockImplementation(async () => { events.push('access'); return { deleted: 1 }; });
    vi.mocked(purgeLocationTracking).mockImplementation(async () => { events.push('tracking'); });
    vi.mocked(restoreMergeTracking).mockImplementation(async () => {
      events.push('restore');
      return { restored: 1, skipped: 0, alreadyApplied: false };
    });

    await reconcile();

    expect(events).toEqual(['access', 'tracking', 'restore']);
    expect(purgeUserMapAccessProjection).toHaveBeenCalledWith(SOURCE);
    expect(purgeLocationTracking).toHaveBeenCalledWith(SOURCE, null);
    expect(projectMapAccess).toHaveBeenCalledWith(MAP, { timeoutMs: 4000 });
  });

  it('does not restore anything or discard the job if source revocation fails', async () => {
    await seedOwner();
    await enqueueTrackingMerge(harness.db, SOURCE, SURVIVOR, [selection]);
    vi.mocked(purgeLocationTracking).mockRejectedValueOnce(new Error('purge unavailable'));
    const error = silenceConsolePrefixes('error', ['[account-merge] tracking transfer retained for retry']);
    try {
      expect(await reconcile()).toEqual({ processed: 0, failed: 1 });
      expect(restoreMergeTracking).not.toHaveBeenCalled();
      expect(await queued()).toHaveLength(1);
    } finally {
      error.mockRestore();
    }
  });

  it('filters against current EVE linkage so detached characters and other providers cannot regain tracking', async () => {
    await seedOwner();
    await seedEveAccount(harness.db, { id: 'other-provider', userId: SURVIVOR, characterId: OTHER_CHARACTER }, { providerId: 'other' });
    await enqueueTrackingMerge(harness.db, SOURCE, SURVIVOR, [selection, { mapId: MAP, characterId: OTHER_CHARACTER }]);
    await harness.db.delete(account).where(eq(account.id, 'linked'));

    await reconcile();

    expect(restoreMergeTracking).toHaveBeenCalledWith(expect.any(String), SURVIVOR, []);
    expect(projectMapAccess).not.toHaveBeenCalled();
    expect(await queued()).toEqual([]);
  });

  it('cancels only a removed character while retaining other selections and source cleanup', async () => {
    await seedOwner();
    await seedEveAccount(harness.db, { id: 'other-character', userId: SURVIVOR, characterId: OTHER_CHARACTER });
    const other = { mapId: MAP, characterId: OTHER_CHARACTER };
    await enqueueTrackingMerge(harness.db, SOURCE, SURVIVOR, [selection, other]);

    await cancelPendingTracking(SURVIVOR, CHARACTER);

    expect(await queued()).toEqual([expect.objectContaining({ selections: [other] })]);
    await reconcile();
    expect(restoreMergeTracking).toHaveBeenCalledWith(expect.any(String), SURVIVOR, [other]);
    expect(purgeLocationTracking).toHaveBeenCalledWith(SOURCE, null);
  });

  it('keeps an empty snapshot queued for source cleanup and supports cancelling every pending transfer', async () => {
    await seedOwner();
    await enqueueTrackingMerge(harness.db, SOURCE, SURVIVOR, [selection]);
    await cancelPendingTracking(SURVIVOR, CHARACTER);
    expect(await queued()).toEqual([expect.objectContaining({ selections: [] })]);
    await reconcile();
    expect(purgeLocationTracking).toHaveBeenCalledWith(SOURCE, null);

    await enqueueTrackingMerge(harness.db, SOURCE, SURVIVOR, []);
    expect(await queued()).toHaveLength(1);
    await cancelPendingTracking(SURVIVOR, null);
    expect(await queued()).toEqual([]);
  });

  it('does not deliver to a retired survivor when a chained merge rekeys a job after discovery', async () => {
    await seedOwner();
    await seedUser(harness.db, 'final-survivor');
    await enqueueTrackingMerge(harness.db, SOURCE, SURVIVOR, [selection]);
    const readPending = mergeStore.readPendingTrackingMerges;
    const scan = vi.spyOn(mergeStore, 'readPendingTrackingMerges').mockImplementationOnce(async (userId) => {
      const discovered = await readPending(userId);
      // Reproduce a completed chained merge between the discovery query and delivery's row lock.
      await harness.db.transaction(async (tx) => {
        await tx.update(account).set({ userId: 'final-survivor' }).where(eq(account.userId, SURVIVOR));
        await tx.update(pendingTrackingMerges).set({ userId: 'final-survivor' }).where(eq(pendingTrackingMerges.userId, SURVIVOR));
        await tx.delete(user).where(eq(user.id, SURVIVOR));
      });
      return discovered;
    });
    try {
      await reconcile();
      expect(restoreMergeTracking).not.toHaveBeenCalled();
      expect(await queued()).toEqual([expect.objectContaining({ userId: 'final-survivor' })]);
      await reconcileTrackingMerges('final-survivor', harness.db);
      expect(restoreMergeTracking).toHaveBeenCalledWith(expect.any(String), 'final-survivor', [selection]);
      expect(await queued()).toEqual([]);
    } finally {
      scan.mockRestore();
    }
  });

  it('batches by map and cascades recovery jobs when the survivor is deleted', async () => {
    await seedOwner();
    await enqueueTrackingMerge(harness.db, SOURCE, SURVIVOR, [selection, { mapId: OTHER_MAP, characterId: CHARACTER }]);
    expect(await queued()).toHaveLength(2);
    await harness.db.delete(user).where(eq(user.id, SURVIVOR));
    expect(await queued()).toEqual([]);
  });
});
