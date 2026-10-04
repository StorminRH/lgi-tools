import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { checkUserId } from '@/composition/route-guards';
import {
  duplicateIndustryProfileEndpoint,
  duplicateIndustryProfileRequestSchema,
} from '@/features/industry-planner/profiles/api-contract';
import {
  getIndustryProfileDocument,
  listIndustryProfiles,
} from '@/features/industry-planner/profiles/queries';
import { conflictFailure, notFoundFailure } from '@/lib/failure';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';
import { insertWithinCap } from '../profile-writes';

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'planner.duplicate-industry-profile',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, duplicateIndustryProfileRequestSchema),
    handle: async ({ userId }, { id: sourceId, name }) => {
      const document = await getIndustryProfileDocument(userId, sourceId);
      if (document === null) {
        return apiResponse(
          duplicateIndustryProfileEndpoint,
          404,
          notFoundFailure('profile_missing', 'profile not found'),
        );
      }
      const id = await insertWithinCap(userId, { name, document });
      if (id === null) {
        return apiResponse(
          duplicateIndustryProfileEndpoint,
          409,
          conflictFailure('profile_limit', 'profile limit reached'),
        );
      }
      const profiles = await listIndustryProfiles(userId);
      return apiResponse(duplicateIndustryProfileEndpoint, 201, { profiles, id });
    },
  });
}
