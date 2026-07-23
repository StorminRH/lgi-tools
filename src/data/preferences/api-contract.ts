// API wire contract owned by the preferences slice (F4). The provider calls these
// via apiFetch; the route imports the request schema and parses it. A renamed
// field fails tsc on both sides.
import { z } from 'zod';
import type { ApiEndpoint } from '@/transport/api-client';
import { PREFERENCE_KEYS } from '@/lib/preferences';

// The key must be one the registry knows; the value is refined per-key in the
// route (validatePreferenceValue) — the server trust boundary.
const preferenceKeySchema = z.enum(PREFERENCE_KEYS as unknown as [string, ...string[]]);

const getPreferencesResponseSchema = z.object({
  preferences: z.array(z.object({ key: z.string(), value: z.unknown() })),
});
/** Server-readable preference values keyed by the closed preference registry. */
export type GetPreferencesResponse = z.infer<typeof getPreferencesResponseSchema>;

/** GET /api/preferences — every saved preference for the logged-in caller. */
export const getPreferencesEndpoint: ApiEndpoint<null, GetPreferencesResponse> = {
  method: 'GET',
  path: '/api/preferences',
  request: null,
  response: getPreferencesResponseSchema,
};

/**
 * Boundary validator for put preference request schema; successful parsing yields the normalized
 * preferences input consumed internally.
 */
export const putPreferenceRequestSchema = z.object({
  key: preferenceKeySchema,
  value: z.unknown(),
});

/** POST /api/preferences — upsert one of the caller's preferences. 204 on success. */
export const putPreferenceEndpoint: ApiEndpoint<
  z.input<typeof putPreferenceRequestSchema>,
  undefined
> = {
  method: 'POST',
  path: '/api/preferences',
  request: putPreferenceRequestSchema,
  response: null,
};
