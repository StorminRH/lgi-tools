// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import schema from '../convex/schema';
import { modules } from '../convex/__tests__/modules.setup';
import { MERGE_RECEIPT_BATCH_SIZE, MERGE_RECEIPT_RETENTION_MS } from '@/data/location-tracking/constants';
import { deleteExpiredTrackingReceipts, listExpiredTrackingReceipts } from '@/data/location-tracking/merge';
import { readPendingTrackingOperationIds } from '@/data/location-tracking/merge-store';
import { readOrCreateReceiptCleanupCheckpoint, saveReceiptCleanupCheckpoint, type ReceiptCleanupCheckpoint } from '@/data/location-tracking/receipt-store';
import { pruneTrackingMergeReceipts } from '@/composition/account-lifecycle/tracking-receipt-retention';

vi.mock('@/data/location-tracking/merge', () => ({
  deleteExpiredTrackingReceipts: vi.fn(), listExpiredTrackingReceipts: vi.fn(),
}));
vi.mock('@/data/location-tracking/merge-store', () => ({ readPendingTrackingOperationIds: vi.fn() }));
vi.mock('@/data/location-tracking/receipt-store', () => ({
  readOrCreateReceiptCleanupCheckpoint: vi.fn(), saveReceiptCleanupCheckpoint: vi.fn(),
}));

let storedCheckpoint: ReceiptCleanupCheckpoint | null = null;

async function saveCheckpoint(previous: ReceiptCleanupCheckpoint, cursor: string | null) {
  if (storedCheckpoint?.cutoffMs !== previous.cutoffMs || storedCheckpoint.cursor !== previous.cursor) return false;
  storedCheckpoint = cursor === null ? null : { ...previous, cursor };
  return true;
}

const NOW = 1_800_000_000_000;
const USER = 'receipt-survivor';
const MAP = 'receipt-map';
const CHAR = 90_000_101;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  storedCheckpoint = null;
  vi.mocked(readOrCreateReceiptCleanupCheckpoint).mockImplementation(async (cutoffMs) => {
    storedCheckpoint ??= { cutoffMs, cursor: null };
    return storedCheckpoint;
  });
  vi.mocked(saveReceiptCleanupCheckpoint).mockImplementation(saveCheckpoint);
  vi.mocked(readPendingTrackingOperationIds).mockResolvedValue(new Set());
});
afterEach(() => vi.useRealTimers());

function wireReceiptDoors(t: TestConvex<typeof schema>) {
  vi.mocked(listExpiredTrackingReceipts).mockImplementation((cutoff, cursor) =>
    t.query(internal.accountMerge.listExpiredTrackingReceipts, { cutoff, cursor }));
  vi.mocked(deleteExpiredTrackingReceipts).mockImplementation((cutoff, receipts) =>
    t.mutation(internal.accountMerge.deleteExpiredTrackingReceipts, {
      cutoff, receipts: receipts.map((receipt) => ({
        ...receipt, receiptId: receipt.receiptId as Id<'accountMergeTrackingReceipts'>,
      })),
    }));
}

describe('tracking receipt cleanup', () => {
  it('protects an opt-out past 90 days while delivery is pending, then cleans the completed receipt', async () => {
    const t = convexTest(schema, modules);
    wireReceiptDoors(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapAccess', { mapId: MAP, userId: USER, roles: ['viewer'] });
    });
    const args = { operationId: '11111111-1111-4111-8111-111111111111', survivorUserId: USER,
      selections: [{ mapId: MAP, characterId: CHAR }] };
    await t.mutation(internal.accountMerge.restoreMergeTracking, args);
    await t.withIdentity({ subject: USER }).mutation(api.mapTrackingOptIn.setTracking, {
      mapId: MAP, characterId: CHAR, tracked: false,
    });
    vi.setSystemTime(NOW + MERGE_RECEIPT_RETENTION_MS + 1);
    await expect(t.mutation(internal.engineSweep.sweep, {})).resolves.toEqual({ deleted: 0, capped: false });
    vi.mocked(readPendingTrackingOperationIds).mockResolvedValue(new Set([args.operationId]));
    await expect(pruneTrackingMergeReceipts(new Date(), Date.now() + 10_000))
      .resolves.toEqual({ deleted: 0, finished: true });
    expect(deleteExpiredTrackingReceipts).not.toHaveBeenCalled();
    await expect(t.mutation(internal.accountMerge.restoreMergeTracking, args))
      .resolves.toEqual({ restored: 0, skipped: 0, alreadyApplied: true });
    expect(await t.run((ctx) => ctx.db.query('mapTracking').collect())).toEqual([]);
    expect(storedCheckpoint).toBeNull();

    vi.mocked(readPendingTrackingOperationIds).mockResolvedValue(new Set());
    await expect(pruneTrackingMergeReceipts(new Date(), Date.now() + 10_000))
      .resolves.toEqual({ deleted: 1, finished: true });
    expect(await t.run((ctx) => ctx.db.query('accountMergeTrackingReceipts').collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query('mapTracking').collect())).toEqual([]);
  });

  it('continues past a full protected page to delete later completed receipts', async () => {
    const t = convexTest(schema, modules);
    wireReceiptDoors(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < MERGE_RECEIPT_BATCH_SIZE; i += 1) {
        await ctx.db.insert('accountMergeTrackingReceipts', { operationId: `pending-${i}` });
      }
    });
    vi.setSystemTime(NOW + 1);
    await t.run((ctx) => ctx.db.insert('accountMergeTrackingReceipts', { operationId: 'completed' }));
    vi.setSystemTime(NOW + MERGE_RECEIPT_RETENTION_MS + 2);
    vi.mocked(readPendingTrackingOperationIds).mockImplementation(async (ids) =>
      new Set(ids.filter((id) => id.startsWith('pending-'))));

    await expect(pruneTrackingMergeReceipts(new Date(), Date.now() + 10_000))
      .resolves.toEqual({ deleted: 1, finished: true });
    expect(listExpiredTrackingReceipts).toHaveBeenCalledTimes(2);
    expect(await t.run((ctx) => ctx.db.query('accountMergeTrackingReceipts').collect()))
      .toHaveLength(MERGE_RECEIPT_BATCH_SIZE);
  });

  it('reports unfinished at the deadline without deleting unchecked candidates', async () => {
    await expect(pruneTrackingMergeReceipts(new Date(), Date.now()))
      .resolves.toEqual({ deleted: 0, finished: false });
    expect(listExpiredTrackingReceipts).not.toHaveBeenCalled();
    expect(readOrCreateReceiptCleanupCheckpoint).not.toHaveBeenCalled();
    vi.mocked(listExpiredTrackingReceipts).mockResolvedValue({
      receipts: [{ receiptId: 'receipt', operationId: 'operation' }], cursor: 'next', done: false,
    });
    vi.mocked(readPendingTrackingOperationIds).mockImplementationOnce(async () => {
      vi.advanceTimersByTime(10_001);
      return new Set();
    });
    await expect(pruneTrackingMergeReceipts(new Date(), Date.now() + 10_000))
      .resolves.toEqual({ deleted: 0, finished: false });
    expect(deleteExpiredTrackingReceipts).not.toHaveBeenCalled();
    expect(storedCheckpoint).toEqual({ cutoffMs: NOW - MERGE_RECEIPT_RETENTION_MS, cursor: null });
  });

  it('retains every candidate when Neon cannot establish which deliveries are pending', async () => {
    vi.mocked(listExpiredTrackingReceipts).mockResolvedValue({
      receipts: [{ receiptId: 'receipt', operationId: 'operation' }], cursor: '', done: true,
    });
    vi.mocked(readPendingTrackingOperationIds).mockRejectedValueOnce(new Error('Neon unavailable'));
    await expect(pruneTrackingMergeReceipts(new Date(), Date.now() + 10_000))
      .rejects.toThrow('Neon unavailable');
    expect(deleteExpiredTrackingReceipts).not.toHaveBeenCalled();
    expect(storedCheckpoint).toEqual({ cutoffMs: NOW - MERGE_RECEIPT_RETENTION_MS, cursor: null });
  });

  it('resumes past a protected page on the next day using its original cutoff and cursor', async () => {
    const t = convexTest(schema, modules);
    wireReceiptDoors(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < MERGE_RECEIPT_BATCH_SIZE; i += 1) {
        await ctx.db.insert('accountMergeTrackingReceipts', { operationId: `pending-${i}` });
      }
    });
    vi.setSystemTime(NOW + 1);
    await t.run((ctx) => ctx.db.insert('accountMergeTrackingReceipts', { operationId: 'completed' }));
    vi.setSystemTime(NOW + MERGE_RECEIPT_RETENTION_MS + 2);
    vi.mocked(readPendingTrackingOperationIds).mockImplementation(async (ids) =>
      new Set(ids.filter((id) => id.startsWith('pending-'))));
    vi.mocked(saveReceiptCleanupCheckpoint).mockImplementationOnce(async (previous, cursor) => {
      const saved = await saveCheckpoint(previous, cursor);
      vi.advanceTimersByTime(10_001);
      return saved;
    });

    await expect(pruneTrackingMergeReceipts(new Date(), Date.now() + 10_000))
      .resolves.toEqual({ deleted: 0, finished: false });
    const saved = storedCheckpoint;
    expect(saved).toEqual({ cutoffMs: NOW + 2, cursor: expect.any(String) });
    vi.advanceTimersByTime(24 * 60 * 60_000);
    await expect(pruneTrackingMergeReceipts(new Date(), Date.now() + 10_000))
      .resolves.toEqual({ deleted: 1, finished: true });
    expect(listExpiredTrackingReceipts).toHaveBeenNthCalledWith(2, saved?.cutoffMs, saved?.cursor);
    expect(storedCheckpoint).toBeNull();
    expect(await t.run((ctx) => ctx.db.query('accountMergeTrackingReceipts').collect()))
      .toHaveLength(MERGE_RECEIPT_BATCH_SIZE);
  });

  it('reprocesses a page safely if deletion succeeds but its checkpoint write fails', async () => {
    const t = convexTest(schema, modules);
    wireReceiptDoors(t);
    await t.run(async (ctx) => {
      for (let i = 0; i <= MERGE_RECEIPT_BATCH_SIZE; i += 1) {
        await ctx.db.insert('accountMergeTrackingReceipts', { operationId: `completed-${i}` });
      }
    });
    vi.setSystemTime(NOW + MERGE_RECEIPT_RETENTION_MS + 1);
    vi.mocked(saveReceiptCleanupCheckpoint).mockRejectedValueOnce(new Error('checkpoint unavailable'));
    await expect(pruneTrackingMergeReceipts(new Date(), Date.now() + 10_000))
      .rejects.toThrow('checkpoint unavailable');
    expect(storedCheckpoint).toEqual({ cutoffMs: NOW + 1, cursor: null });
    expect(await t.run((ctx) => ctx.db.query('accountMergeTrackingReceipts').collect())).toHaveLength(1);

    await expect(pruneTrackingMergeReceipts(new Date(), Date.now() + 10_000))
      .resolves.toEqual({ deleted: 1, finished: true });
    expect(storedCheckpoint).toBeNull();
    expect(await t.run((ctx) => ctx.db.query('accountMergeTrackingReceipts').collect())).toEqual([]);
  });

  it('stops without overwriting progress when another run advances the checkpoint', async () => {
    vi.mocked(listExpiredTrackingReceipts).mockResolvedValue({ receipts: [], cursor: 'next', done: false });
    vi.mocked(saveReceiptCleanupCheckpoint).mockResolvedValueOnce(false);
    await expect(pruneTrackingMergeReceipts(new Date(), Date.now() + 10_000))
      .resolves.toEqual({ deleted: 0, finished: false });
    expect(listExpiredTrackingReceipts).toHaveBeenCalledOnce();
  });
});
