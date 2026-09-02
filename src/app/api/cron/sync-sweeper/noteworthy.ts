import type { CronSyncSweeperResponse } from '@/data/convex/api-contract';

export function isNoteworthySweep(summary: CronSyncSweeperResponse): boolean {
  return summary.status === 'failed' || (summary.dispatched ?? 0) > 0;
}
