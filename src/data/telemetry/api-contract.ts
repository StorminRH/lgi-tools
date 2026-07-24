// API wire contract owned by the telemetry slice (3.4.T).
import { z } from 'zod';
import type { ApiEndpoint } from '@/transport/api-client';
import { CLIENT_USAGE_ACTIONS } from './types';

/**
 * Validates against CLIENT_USAGE_ACTIONS, not the full set: server-only
 * actions (cron health signals, auth/admin audit) must not be forgeable by a
 * client POST, or the health/audit rows they write could be polluted.
 */
export const telemetryRequestSchema = z.object({
  action: z.enum(CLIENT_USAGE_ACTIONS),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Success is 204 No Content (fire-and-forget; the beacon ignores it); errors
 * are plain text 400 or the shared RateLimitedBody 429.
 */
export const telemetryEndpoint: ApiEndpoint<z.input<typeof telemetryRequestSchema>, undefined> = {
  method: 'POST',
  path: '/api/telemetry',
  request: telemetryRequestSchema,
  response: null,
};
