import { z } from 'zod';
import { positiveIdSchema } from '@/lib/id-schemas';

// Field shapes shared by the Next merge client and the Convex merge doors.
// Convex bundles this module, so it imports zod and lib only. Next parses
// Convex responses with z.strictObject and Convex parses requests with
// z.object, so each side wraps these fields itself.

/** One map tracking row a merge snapshots from Convex and later restores. */
export const trackingSelectionFields = {
  mapId: z.string().min(1),
  characterId: positiveIdSchema,
  lastProcessedTransitionAt: z.number().nonnegative().optional(),
};

/** One expired merge receipt, named by its id and the operation it records. */
export const trackingReceiptCandidateFields = {
  receiptId: z.string().min(1),
  operationId: z.string().min(1),
};

export type TrackingSelection = z.infer<z.ZodObject<typeof trackingSelectionFields>>;

export type TrackingReceiptCandidate = z.infer<z.ZodObject<typeof trackingReceiptCandidateFields>>;
