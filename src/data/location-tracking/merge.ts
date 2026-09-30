import { z } from 'zod';
import { postConvexHttpDoor } from '@/lib/convex-http-door';
import { MERGE_RECEIPT_BATCH_SIZE } from './constants';
import type { TrackingSelection } from './schema';

export class LocationTrackingMergeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LocationTrackingMergeError';
  }
}

export async function snapshotMergeTracking(sourceUserId: string): Promise<TrackingSelection[]> {
  const result = await postConvexHttpDoor({
    path: '/snapshot-merge-tracking',
    body: { sourceUserId },
    schema: z.strictObject({ selections: z.array(z.strictObject({
      mapId: z.string().min(1), characterId: z.number().int().positive(),
      lastProcessedTransitionAt: z.number().optional(),
    })).max(1000) }),
    error: LocationTrackingMergeError,
    label: 'Location tracking snapshot unavailable',
    timeoutMs: 4000,
  });
  return result.selections;
}

export function restoreMergeTracking(
  operationId: string,
  survivorUserId: string,
  selections: TrackingSelection[],
) {
  return postConvexHttpDoor({
    path: '/restore-merge-tracking',
    body: { operationId, survivorUserId, selections },
    schema: z.strictObject({
      restored: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative(),
      alreadyApplied: z.boolean(),
    }),
    error: LocationTrackingMergeError,
    label: 'Location tracking restore unavailable',
    timeoutMs: 4000,
  });
}

const receiptCandidateSchema = z.strictObject({
  receiptId: z.string().min(1),
  operationId: z.string().min(1),
});

export interface TrackingReceiptCandidate {
  readonly receiptId: string;
  readonly operationId: string;
}

export function listExpiredTrackingReceipts(cutoff: number, cursor: string | null) {
  return postConvexHttpDoor({
    path: '/list-expired-tracking-receipts',
    body: { cutoff, cursor },
    schema: z.strictObject({
      receipts: z.array(receiptCandidateSchema).max(MERGE_RECEIPT_BATCH_SIZE),
      cursor: z.string(),
      done: z.boolean(),
    }),
    error: LocationTrackingMergeError,
    label: 'Tracking receipt candidates unavailable',
    timeoutMs: 4000,
  });
}

export function deleteExpiredTrackingReceipts(
  cutoff: number,
  receipts: readonly TrackingReceiptCandidate[],
) {
  return postConvexHttpDoor({
    path: '/delete-expired-tracking-receipts',
    body: { cutoff, receipts },
    schema: z.strictObject({ deleted: z.number().int().nonnegative() }),
    error: LocationTrackingMergeError,
    label: 'Tracking receipt deletion unavailable',
    timeoutMs: 4000,
  });
}
