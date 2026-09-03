import type { NextRequest } from 'next/server';
import {
  buildLocationEndpoint,
  buildLocationRequestSchema,
} from '@/features/industry-planner/api-contract';
import { capabilityRoute } from '@/app/api/capability-route';
import { getBuildLocation } from '@/features/industry-planner/queries';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: public
export const POST = capabilityRoute('planner.resolve-build-location', handlePost);

async function handlePost(request: NextRequest): Promise<Response> {
  const parsed = await readJsonBody(request, buildLocationRequestSchema);
  if (!parsed.ok) return apiResponse(buildLocationEndpoint, 400, parsed.failure);

  const data = await getBuildLocation(parsed.data.systemId, parsed.data.blueprintId);
  return apiResponse(buildLocationEndpoint, 200, data);
}
