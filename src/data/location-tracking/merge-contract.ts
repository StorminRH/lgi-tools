import { z } from 'zod';
import { positiveIdSchema } from '@/lib/id-schemas';

// Field shapes of the merge doors. Convex bundles this module, so it imports
// zod and lib only. convex-doors.ts wraps them: z.object for the requests
// Convex parses, z.strictObject for the replies Next parses.

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
