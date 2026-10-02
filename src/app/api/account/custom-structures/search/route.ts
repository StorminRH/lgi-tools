import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import { searchUpwellStructures } from '@/composition/structure-search';
import {
  searchStructuresEndpoint,
  searchStructuresRequestSchema,
} from '@/features/custom-structures/api-contract';
import { dependencyUnavailableFailure } from '@/lib/failure';
import { checkUserId } from '@/composition/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export const POST = capabilityRoute('structures.search-structures', handlePost);

async function handlePost(request: NextRequest): Promise<Response> {
  const gate = await checkUserId();
  if (!gate.ok) return apiResponse(searchStructuresEndpoint, 401, gate.failure);

  const parsed = await readJsonBody(request, searchStructuresRequestSchema);
  if (!parsed.ok) return apiResponse(searchStructuresEndpoint, 400, parsed.failure);

  try {
    const results = await searchUpwellStructures(gate.userId, parsed.data.search);
    return apiResponse(searchStructuresEndpoint, 200, { results });
  } catch (cause) {
    return apiResponse(
      searchStructuresEndpoint,
      503,
      dependencyUnavailableFailure('structure_search_unavailable', 503, {
        cause,
        detail: 'EVE structure search is temporarily unavailable',
      }),
    );
  }
}
