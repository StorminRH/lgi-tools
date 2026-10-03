import type { NextRequest } from 'next/server';
import {
  costIndicesEndpoint,
  costIndicesRequestSchema,
} from '@/features/industry-planner/api-contract';
import { capabilityRoute } from '@/app/api/capability-route';
import { getJobCostIndices } from '@/features/industry-planner/queries';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: public
export const POST = capabilityRoute('planner.read-cost-indices', handlePost);

async function handlePost(request: NextRequest): Promise<Response> {
  const parsed = await readJsonBody(request, costIndicesRequestSchema);
  if (!parsed.ok) return apiResponse(costIndicesEndpoint, 400, parsed.failure);

  const systems = await getJobCostIndices(parsed.data.systemIds);
  return apiResponse(costIndicesEndpoint, 200, { systems });
}
