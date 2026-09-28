import { z } from 'zod';
import { postConvexHttpDoor } from '@/lib/convex-http-door';

const mergeResultSchema = z.strictObject({
  trackingMoved: z.number().int().nonnegative(),
  trackingDropped: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
});

export type LocationTrackingMergeResult = z.infer<typeof mergeResultSchema>;

export class LocationTrackingMergeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LocationTrackingMergeError';
  }
}

/** Moves the source user's map-tracking intent onto the survivor and drains the source's location state and leases. */
export function mergeLocationTrackingState(
  sourceUserId: string,
  survivorUserId: string,
): Promise<LocationTrackingMergeResult> {
  return postConvexHttpDoor({
    path: '/merge-user-state',
    body: { sourceUserId, survivorUserId },
    schema: mergeResultSchema,
    error: LocationTrackingMergeError,
    label: 'Location tracking merge unavailable',
  });
}
