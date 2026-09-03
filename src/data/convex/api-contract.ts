import { z } from 'zod';
import { defineEndpoint, emptyBody, problem } from '@/transport/endpoint';

export interface CronSyncSweeperResponse {
  status: 'swept' | 'skipped' | 'failed';
  reason?: string;
  dispatched: number | null;
  retired: number | null;
  deleted: number | null;
  durationMs: number;
}

const leaveSyncDatasetSchema = z.literal('characterLocation');

export const leaveSyncRequestSchema = z.strictObject({
  dataset: leaveSyncDatasetSchema,
  tabId: z.string().min(8).max(64),
});

export const leaveSyncEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/sync-leave',
  request: leaveSyncRequestSchema,
  responses: {
    204: emptyBody(),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
    429: problem('rate_limited'),
    503: problem('leave_sync_unavailable'),
  },
});
