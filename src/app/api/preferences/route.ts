import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import {
  getPreferencesEndpoint,
  putPreferenceEndpoint,
  putPreferenceRequestSchema,
} from '@/data/preferences/api-contract';
import { getPreferencesForUser, upsertPreference } from '@/data/preferences/queries';
import { getCurrentUserId } from '@/platform/auth/session';
import { checkUserId } from '@/platform/auth/route-guards';
import { validationFailure } from '@/lib/failure';
import { validatePreferenceValue } from '@/lib/preferences';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return apiResponse(getPreferencesEndpoint, 200, { preferences: [] });
  }
  const preferences = await getPreferencesForUser(userId);
  return apiResponse(getPreferencesEndpoint, 200, { preferences });
}

export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'account.save-preferences',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, putPreferenceRequestSchema),
    handle: async ({ userId }, { key, value }) => {
      if (!validatePreferenceValue(key, value)) {
        return apiResponse(
          putPreferenceEndpoint,
          400,
          validationFailure('invalid_value', 'invalid value for key'),
        );
      }

      await upsertPreference(userId, key, value);
      return apiResponse(putPreferenceEndpoint, 204);
    },
  });
}
