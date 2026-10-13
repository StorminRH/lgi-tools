import { z } from 'zod';

/**
 * The tab a leave-sync retires, as the browser sends it to Next and Next
 * forwards it to Convex. Convex bundles this module, so it imports zod only:
 * the browser endpoint lives in api-contract.ts, which needs transport.
 */
export const leaveSyncTabFields = {
  dataset: z.literal('characterLocation'),
  tabId: z.string().min(8).max(64),
};
