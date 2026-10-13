import { z } from 'zod';
import { defineConvexDoor } from '@/lib/convex-door-contract';

/**
 * The tab a leave-sync retires, as the browser sends it to Next and Next
 * forwards it to Convex. Convex bundles this module, so it imports zod and
 * lib only: the browser endpoint lives in api-contract.ts, which needs
 * transport.
 */
export const leaveSyncTabFields = {
  dataset: z.literal('characterLocation'),
  tabId: z.string().min(8).max(64),
};

/** Next forwards the tab with the session user it authenticated. */
export const leaveSyncDoor = defineConvexDoor({
  path: '/leave-sync',
  request: z.object({ userId: z.string().min(1), ...leaveSyncTabFields }),
  response: z.strictObject({ retired: z.boolean() }),
});
