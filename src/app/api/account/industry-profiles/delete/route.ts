import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { checkUserId } from '@/composition/route-guards';
import {
  deleteIndustryProfileEndpoint,
  deleteIndustryProfileRequestSchema,
} from '@/features/industry-planner/profiles/api-contract';
import {
  deleteIndustryProfile,
  listIndustryProfiles,
} from '@/features/industry-planner/profiles/queries';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'planner.delete-industry-profile',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, deleteIndustryProfileRequestSchema),
    handle: async ({ userId }, { id }) => {
      await deleteIndustryProfile(userId, id);
      const profiles = await listIndustryProfiles(userId);
      return apiResponse(deleteIndustryProfileEndpoint, 200, { profiles });
    },
  });
}
