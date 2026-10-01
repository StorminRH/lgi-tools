import { MERGE_RECEIPT_RETENTION_MS } from '@/data/location-tracking/constants';
import { deleteExpiredTrackingReceipts, listExpiredTrackingReceipts } from '@/data/location-tracking/merge';
import { readPendingTrackingOperationIds } from '@/data/location-tracking/merge-store';
import { readOrCreateReceiptCleanupCheckpoint, saveReceiptCleanupCheckpoint } from '@/data/location-tracking/receipt-store';
import type { BatchedDeleteResult } from '@/lib/batched-delete';

export async function pruneTrackingMergeReceipts(
  now: Date,
  deadline: number,
): Promise<BatchedDeleteResult> {
  if (Date.now() >= deadline) return { deleted: 0, finished: false };
  let checkpoint = await readOrCreateReceiptCleanupCheckpoint(now.getTime() - MERGE_RECEIPT_RETENTION_MS);
  let deleted = 0;
  for (;;) {
    if (Date.now() >= deadline) return { deleted, finished: false };
    const page = await listExpiredTrackingReceipts(checkpoint.cutoffMs, checkpoint.cursor);
    const pending = await readPendingTrackingOperationIds(page.receipts.map((receipt) => receipt.operationId));
    const completed = page.receipts.filter((receipt) => !pending.has(receipt.operationId.toLowerCase()));
    if (Date.now() >= deadline) return { deleted, finished: false };
    if (completed.length > 0) {
      deleted += (await deleteExpiredTrackingReceipts(checkpoint.cutoffMs, completed)).deleted;
    }
    const cursor = page.done ? null : page.cursor;
    if (!(await saveReceiptCleanupCheckpoint(checkpoint, cursor))) return { deleted, finished: false };
    if (page.done) return { deleted, finished: true };
    checkpoint = { ...checkpoint, cursor: page.cursor };
  }
}
