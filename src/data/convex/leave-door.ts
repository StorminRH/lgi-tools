import { z } from 'zod';
import { postConvexHttpDoor } from '@/lib/convex-http-door';

const leaveSyncResultSchema = z.strictObject({
  retired: z.boolean(),
});

export class LeaveSyncDoorError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LeaveSyncDoorError';
  }
}

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
