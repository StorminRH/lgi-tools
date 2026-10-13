import { z } from 'zod';
import { defineConvexDoor, purgeScopeRequestSchema } from '@/lib/convex-door-contract';
import { MERGE_RECEIPT_BATCH_SIZE, MERGE_TRACKING_LIMIT } from './constants';
import { trackingReceiptCandidateFields, trackingSelectionFields } from './merge-contract';

// The Convex HTTP doors location tracking calls. Convex parses each request
// with `door.request` (z.object) and Next parses each reply with
// `door.response` (z.strictObject). Convex bundles this module, so it imports
// zod and lib only.

const countSchema = z.number().int().nonnegative();

export const snapshotMergeTrackingDoor = defineConvexDoor({
  path: '/snapshot-merge-tracking',
  request: z.object({ sourceUserId: z.string().min(1) }),
  response: z.strictObject({
    selections: z.array(z.strictObject(trackingSelectionFields)).max(MERGE_TRACKING_LIMIT),
  }),
});

export const restoreMergeTrackingDoor = defineConvexDoor({
  path: '/restore-merge-tracking',
  request: z.object({
    operationId: z.string().min(1),
    survivorUserId: z.string().min(1),
    selections: z.array(z.object(trackingSelectionFields)).max(MERGE_TRACKING_LIMIT),
  }),
  response: z.strictObject({
    restored: countSchema,
    skipped: countSchema,
    alreadyApplied: z.boolean(),
  }),
});

export const listExpiredTrackingReceiptsDoor = defineConvexDoor({
  path: '/list-expired-tracking-receipts',
  request: z.object({ cutoff: z.number().finite(), cursor: z.string().nullable() }),
  response: z.strictObject({
    receipts: z
      .array(z.strictObject(trackingReceiptCandidateFields))
      .max(MERGE_RECEIPT_BATCH_SIZE),
    cursor: z.string(),
    done: z.boolean(),
  }),
});

export const deleteExpiredTrackingReceiptsDoor = defineConvexDoor({
  path: '/delete-expired-tracking-receipts',
  request: z.object({
    cutoff: z.number().finite(),
    receipts: z.array(z.object(trackingReceiptCandidateFields)).max(MERGE_RECEIPT_BATCH_SIZE),
  }),
  response: z.strictObject({ deleted: countSchema }),
});

/** Convex answers with its purge counts, which Next does not read. */
export const purgeLocationTrackingDoor = defineConvexDoor({
  path: '/purge-location-tracking',
  request: purgeScopeRequestSchema,
  response: z.unknown(),
});
