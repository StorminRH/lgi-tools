import { z } from 'zod';
import {
  defineEndpoint,
  emptyBody,
  problem,
} from '@/transport/endpoint';
import { CLIENT_USAGE_ACTIONS } from './types';

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
