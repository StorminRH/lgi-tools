import { z } from 'zod';
import { postConvexHttpDoor } from '@/lib/convex-http-door';
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
