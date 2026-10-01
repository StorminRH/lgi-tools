import { describe, expect, it } from 'vitest';
import { trackingReceiptCleanup } from './schema';
import { readOrCreateReceiptCleanupCheckpoint, saveReceiptCleanupCheckpoint } from './receipt-store';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';

const harness = await createDbTestHarness({
  schema: 'test_tracking_receipt_checkpoint',
  tables: ['tracking_receipt_cleanup'],
  resetBetweenTests: 'truncate',
});

describe.skipIf(!harness.reachable)('tracking receipt checkpoint (real Postgres)', () => {
  it('resumes its fixed cutoff, rejects stale progress, and resets only after completion', async () => {
    const first = await readOrCreateReceiptCleanupCheckpoint(123, harness.db);
    expect(first).toEqual({ cutoffMs: 123, cursor: null });
    await expect(readOrCreateReceiptCleanupCheckpoint(999, harness.db)).resolves.toEqual(first);
    await expect(saveReceiptCleanupCheckpoint(first, 'page-2', harness.db)).resolves.toBe(true);
    await expect(saveReceiptCleanupCheckpoint(first, 'rewind', harness.db)).resolves.toBe(false);
    await expect(saveReceiptCleanupCheckpoint(first, null, harness.db)).resolves.toBe(false);
    const next = await readOrCreateReceiptCleanupCheckpoint(999, harness.db);
    expect(next).toEqual({ cutoffMs: 123, cursor: 'page-2' });
    await expect(saveReceiptCleanupCheckpoint(next, null, harness.db)).resolves.toBe(true);
    await expect(readOrCreateReceiptCleanupCheckpoint(999, harness.db))
      .resolves.toEqual({ cutoffMs: 999, cursor: null });
  });

  it('keeps the previous cursor when a checkpoint transaction rolls back', async () => {
    const checkpoint = await readOrCreateReceiptCleanupCheckpoint(123, harness.db);
    await expect(harness.db.transaction(async (tx) => {
      expect(await saveReceiptCleanupCheckpoint(checkpoint, 'discarded', tx)).toBe(true);
      throw new Error('commit failed');
    })).rejects.toThrow('commit failed');
    await expect(readOrCreateReceiptCleanupCheckpoint(999, harness.db)).resolves.toEqual(checkpoint);
  });

  it('cannot grow beyond its singleton task', async () => {
    await readOrCreateReceiptCleanupCheckpoint(123, harness.db);
    await expect(harness.db.insert(trackingReceiptCleanup).values({ task: 'another-task', cutoffMs: 123 }))
      .rejects.toThrow();
    expect(await harness.db.select().from(trackingReceiptCleanup)).toHaveLength(1);
  });
});
