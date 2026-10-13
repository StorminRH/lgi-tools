import { z } from 'zod';
import { postConvexHttpDoor } from '@/lib/convex-http-door';
import type { leaveSyncRequestSchema } from './api-contract';

const leaveSyncResultSchema = z.strictObject({
  retired: z.boolean(),
});

export class LeaveSyncDoorError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LeaveSyncDoorError';
  }
}

export async function postLeaveSync(
  input: { readonly userId: string } & z.infer<typeof leaveSyncRequestSchema>,
): Promise<{ retired: boolean }> {
  return postConvexHttpDoor({
    path: '/leave-sync',
    body: input,
    schema: leaveSyncResultSchema,
    error: LeaveSyncDoorError,
    label: 'leave-sync',
  });
}
