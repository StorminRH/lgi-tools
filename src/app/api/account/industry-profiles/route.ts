import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { getCurrentUserId } from '@/composition/session';
import { checkUserId } from '@/composition/route-guards';
import {
  createIndustryProfileEndpoint,
  createIndustryProfileRequestSchema,
  industryProfilesEndpoint,
} from '@/features/industry-planner/profiles/api-contract';
import { listIndustryProfiles } from '@/features/industry-planner/profiles/queries';
import { conflictFailure, validationFailure } from '@/lib/failure';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';
import { addsUnlinkedMembers, insertWithinCap } from './profile-writes';

// authz: auth
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return apiResponse(industryProfilesEndpoint, 200, { profiles: [] });
  const profiles = await listIndustryProfiles(userId);
  return apiResponse(industryProfilesEndpoint, 200, { profiles });
}

export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'planner.create-industry-profile',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, createIndustryProfileRequestSchema),
    handle: async ({ userId }, body) => {
      if (await addsUnlinkedMembers(userId, body.document, null)) {
        return apiResponse(
          createIndustryProfileEndpoint,
          400,
          validationFailure('not_linked', 'Character not linked to your account'),
        );
      }
      const id = await insertWithinCap(userId, body);
      if (id === null) {
        return apiResponse(
          createIndustryProfileEndpoint,
          409,
          conflictFailure('profile_limit', 'profile limit reached'),
        );
      }
      const profiles = await listIndustryProfiles(userId);
      return apiResponse(createIndustryProfileEndpoint, 201, { profiles, id });
    },
  });
}
