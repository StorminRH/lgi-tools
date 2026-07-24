// API wire contract owned by the telemetry slice (3.4.T).
import { z } from 'zod';
import {
  defineEndpoint,
  emptyBody,
  problem,
} from '@/transport/endpoint';
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
 * use declared RFC 9457 problem bodies.
 */
export const telemetryEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/telemetry',
  request: telemetryRequestSchema,
  responses: {
    204: emptyBody(),
    400: problem('invalid_json', 'invalid_body', 'metadata_too_large'),
    429: problem('rate_limited'),
  },
});
