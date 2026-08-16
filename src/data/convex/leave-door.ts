// Next → Convex leave hop. The route has already verified the session user.
// Missing Convex config is a no-op (local without a deployment); a non-2xx
// is a real missed retire and must surface to the caller.
import { z } from 'zod';
import { postConvexHttpDoor } from '@/lib/convex-http-door';

const leaveSyncResultSchema = z.strictObject({
  retired: z.boolean(),
});

/** Error from the Convex leave-sync door. */
export class LeaveSyncDoorError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LeaveSyncDoorError';
  }
}

/** Posts one verified leave to the Convex service door. */
export async function postLeaveSync(input: {
  readonly userId: string;
  readonly dataset: 'characterLocation';
  readonly tabId: string;
}): Promise<{ retired: boolean }> {
  return postConvexHttpDoor({
    path: '/leave-sync',
    body: input,
    schema: leaveSyncResultSchema,
    error: LeaveSyncDoorError,
    label: 'leave-sync',
  });
}
