import type { ConvexDoorRequest, ConvexDoorResponse } from '@/lib/convex-door-contract';
import { ConvexDoorError, postConvexHttpDoor } from '@/lib/convex-http-door';
import { leaveSyncDoor } from './leave-contract';

export class LeaveSyncDoorError extends ConvexDoorError {
  override readonly name = 'LeaveSyncDoorError';
}

export function postLeaveSync(
  input: ConvexDoorRequest<typeof leaveSyncDoor>,
): Promise<ConvexDoorResponse<typeof leaveSyncDoor>> {
  return postConvexHttpDoor(leaveSyncDoor, input, {
    error: LeaveSyncDoorError,
    label: 'leave-sync',
  });
}
