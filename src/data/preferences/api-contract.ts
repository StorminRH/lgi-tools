// API wire contract owned by the preferences slice (F4). The provider calls these
// via apiFetch; the route imports the request schema and parses it. A renamed
// field fails tsc on both sides.
import { z } from 'zod';
import { PREFERENCE_KEYS } from '@/lib/preferences';
import {
  defineEndpoint,
  emptyBody,
  jsonBody,
  problem,
} from '@/transport/endpoint';

// The key must be one the registry knows; the value is refined per-key in the
// route (validatePreferenceValue) — the server trust boundary.
const preferenceKeySchema = z.enum(PREFERENCE_KEYS as unknown as [string, ...string[]]);

const getPreferencesResponseSchema = z.object({
  preferences: z.array(z.object({ key: z.string(), value: z.unknown() })),
});
/** Server-readable preference values keyed by the closed preference registry. */
export type GetPreferencesResponse = z.infer<typeof getPreferencesResponseSchema>;

/** GET /api/preferences — every saved preference for the logged-in caller. */
export const getPreferencesEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/preferences',
  request: null,
  responses: {
    200: jsonBody(getPreferencesResponseSchema),
  },
});

/**
 * Boundary validator for put preference request schema; successful parsing yields the normalized
 * preferences input consumed internally.
 */
export const putPreferenceRequestSchema = z.object({
  key: preferenceKeySchema,
  value: z.unknown(),
});

/** POST /api/preferences — upsert one of the caller's preferences. 204 on success. */
export const putPreferenceEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/preferences',
  request: putPreferenceRequestSchema,
  responses: {
    204: emptyBody(),
    400: problem('invalid_json', 'invalid_body', 'invalid_value'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
  },
});
