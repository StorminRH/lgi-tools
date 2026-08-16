// API wire contract owned by the convex slice (3.4.9).
import { z } from 'zod';
import { defineEndpoint, emptyBody, problem } from '@/transport/endpoint';

/**
 * ── GET /api/cron/sync-sweeper (authz: cron) ────────────────────────────
 * The sync engine's external watchdog: relays the deployment's sweep counts.
 * All JSON-primitive fields, so the TS type is the wire truth; no
 * programmatic consumer — pinned with `satisfies` in the route. Counts are
 * null when the sweep never reached the deployment (skipped/failed).
 */
export interface CronSyncSweeperResponse {
  status: 'swept' | 'skipped' | 'failed';
  reason?: string;
  // Healthy system: all zeros. dispatched > 0 means the deployment's own
  // 30s scan is dead or lagging — the watchdog signal.
  dispatched: number | null;
  retired: number | null;
  deleted: number | null;
  durationMs: number;
}

/** Closed dataset the leave door will retire. */
const leaveSyncDatasetSchema = z.literal('characterLocation');

/** Untrusted beacon body. userId is never accepted from the client. */
export const leaveSyncRequestSchema = z.strictObject({
  dataset: leaveSyncDatasetSchema,
  tabId: z.string().min(8).max(64),
});

/** First-party leave beacon. 204 because sendBeacon ignores the response. */
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
