import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { checkUserId } from '@/composition/route-guards';
import {
  updateIndustryProfileEndpoint,
  updateIndustryProfileRequestSchema,
} from '@/features/industry-planner/profiles/api-contract';
import {
  getIndustryProfileDocument,
  listIndustryProfiles,
  updateIndustryProfile,
} from '@/features/industry-planner/profiles/queries';
import { conflictFailure, notFoundFailure, validationFailure } from '@/lib/failure';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';
import { addsUnlinkedMembers } from '../profile-writes';

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'planner.update-industry-profile',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, updateIndustryProfileRequestSchema),
    handle: async ({ userId }, body) => {
      const previous = await getIndustryProfileDocument(userId, body.id);
      if (previous === null) {
        return apiResponse(
          updateIndustryProfileEndpoint,
          404,
          notFoundFailure('profile_missing', 'profile not found'),
        );
      }
      if (await addsUnlinkedMembers(userId, body.document, previous)) {
        return apiResponse(
          updateIndustryProfileEndpoint,
          400,
          validationFailure('not_linked', 'Character not linked to your account'),
        );
      }
      if (!(await updateIndustryProfile(userId, body))) {
        return apiResponse(
          updateIndustryProfileEndpoint,
          409,
          conflictFailure('stale_revision', 'profile changed since it was loaded'),
        );
      }
      const profiles = await listIndustryProfiles(userId);
      return apiResponse(updateIndustryProfileEndpoint, 200, { profiles });
    },
  });
}
