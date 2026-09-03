import { z } from 'zod';
import { PREFERENCE_KEYS } from '@/lib/preferences';
import {
  defineEndpoint,
  emptyBody,
  jsonBody,
  problem,
} from '@/transport/endpoint';

const preferenceKeySchema = z.enum(PREFERENCE_KEYS as unknown as [string, ...string[]]);

const getPreferencesResponseSchema = z.object({
  preferences: z.array(z.object({ key: z.string(), value: z.unknown() })),
});

export type GetPreferencesResponse = z.infer<typeof getPreferencesResponseSchema>;

export const getPreferencesEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/preferences',
  request: null,
  responses: {
    200: jsonBody(getPreferencesResponseSchema),
  },
});

export const putPreferenceRequestSchema = z.object({
  key: preferenceKeySchema,
  value: z.unknown(),
});

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
