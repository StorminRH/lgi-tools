import { beforeEach, describe, expect, it } from 'vitest';
import { pendingTrackingMerges } from './schema';
import { readPendingTrackingOperationIds } from './merge-store';
import { MERGE_RECEIPT_BATCH_SIZE } from './constants';
import { createDbTestHarness, seedUser } from '@/db/__tests__/support/db-test-harness';

const harness = await createDbTestHarness({
  schema: 'test_tracking_receipt_pending',
  tables: ['user', 'pending_tracking_merges'],
  resetBetweenTests: 'truncate',
});
const PENDING = '11111111-1111-4111-8111-111111111111';
const COMPLETED = '22222222-2222-4222-8222-222222222222';

describe.skipIf(!harness.reachable)('tracking receipt pending lookup (real Postgres)', () => {
  beforeEach(async () => {
    await seedUser(harness.db, 'receipt-owner');
  });

  it('protects any pending job independent of age, selections, or discovery ordering', async () => {
    await harness.db.insert(pendingTrackingMerges).values({
      id: PENDING, userId: 'receipt-owner', sourceUserId: 'source', selections: [],
      queuedAt: new Date('2020-01-01T00:00:00Z'),
    });
    await expect(readPendingTrackingOperationIds([PENDING, COMPLETED, 'legacy-operation'], harness.db))
      .resolves.toEqual(new Set([PENDING]));
    await harness.db.delete(pendingTrackingMerges);
    await expect(readPendingTrackingOperationIds([PENDING], harness.db)).resolves.toEqual(new Set());
  });

  it('accepts UUID case variations and ignores non-UUID legacy operation ids', async () => {
    const mixed = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await harness.db.insert(pendingTrackingMerges).values({
      id: mixed, userId: 'receipt-owner', sourceUserId: 'source', selections: [],
    });
    await expect(readPendingTrackingOperationIds([mixed.toUpperCase(), 'legacy'], harness.db))
      .resolves.toEqual(new Set([mixed]));
    await expect(readPendingTrackingOperationIds(['legacy'], harness.db)).resolves.toEqual(new Set());
  });

  it('rejects an oversized candidate batch instead of returning a truncated protection set', async () => {
    await expect(readPendingTrackingOperationIds(Array.from({ length: MERGE_RECEIPT_BATCH_SIZE + 1 }, () => PENDING), harness.db))
      .rejects.toThrow('Too many tracking operations');
  });
});
