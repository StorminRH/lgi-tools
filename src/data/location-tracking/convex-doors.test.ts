import { expect, test } from 'vitest';
import { MERGE_RECEIPT_BATCH_SIZE, MERGE_TRACKING_LIMIT } from './constants';
import {
  deleteExpiredTrackingReceiptsDoor,
  listExpiredTrackingReceiptsDoor,
  restoreMergeTrackingDoor,
  snapshotMergeTrackingDoor,
} from './convex-doors';

test('every selection a snapshot reply carries is one the restore door accepts back', () => {
  const selections = [
    { mapId: 'map-1', characterId: 90_000_001 },
    { mapId: 'map-2', characterId: 90_000_002, lastProcessedTransitionAt: 0 },
    { mapId: 'map-3', characterId: 90_000_003, lastProcessedTransitionAt: 1_800_000_000_000 },
  ];
  const snapshot = snapshotMergeTrackingDoor.response.parse({ selections });

  expect(restoreMergeTrackingDoor.request.parse({
    operationId: 'operation-1',
    survivorUserId: 'survivor',
    selections: snapshot.selections,
  }).selections).toEqual(selections);

  const negative = [{ mapId: 'map-1', characterId: 90_000_001, lastProcessedTransitionAt: -1 }];
  expect(snapshotMergeTrackingDoor.response.safeParse({ selections: negative }).success).toBe(false);
  expect(restoreMergeTrackingDoor.request.safeParse({
    operationId: 'operation-1', survivorUserId: 'survivor', selections: negative,
  }).success).toBe(false);

  const full = Array.from({ length: MERGE_TRACKING_LIMIT + 1 }, (_, index) => ({
    mapId: `map-${index}`, characterId: 90_000_001,
  }));
  expect(snapshotMergeTrackingDoor.response.safeParse({ selections: full }).success).toBe(false);
  expect(snapshotMergeTrackingDoor.response.safeParse({
    selections: full.slice(1),
  }).success).toBe(true);
  expect(snapshotMergeTrackingDoor.response.safeParse({ selections, extra: true }).success).toBe(false);
});

test('receipt pages and deletions are bounded by the merge receipt batch', () => {
  const receipts = Array.from({ length: MERGE_RECEIPT_BATCH_SIZE + 1 }, (_, index) => ({
    receiptId: `receipt-${index}`, operationId: `operation-${index}`,
  }));
  const page = (rows: typeof receipts) => ({ receipts: rows, cursor: 'cursor-1', done: false });

  expect(listExpiredTrackingReceiptsDoor.response.safeParse(page(receipts.slice(1))).success).toBe(true);
  expect(listExpiredTrackingReceiptsDoor.response.safeParse(page(receipts)).success).toBe(false);
  expect(deleteExpiredTrackingReceiptsDoor.request.safeParse({
    cutoff: 123, receipts: receipts.slice(1),
  }).success).toBe(true);
  expect(deleteExpiredTrackingReceiptsDoor.request.safeParse({ cutoff: 123, receipts }).success).toBe(false);
  expect(deleteExpiredTrackingReceiptsDoor.request.safeParse({
    cutoff: 123, receipts: [{ receiptId: '', operationId: 'operation-1' }],
  }).success).toBe(false);
});
