import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import { getStructureFitNameIndex } from '@/data/eve-data/queries';
import {
  parseStructureFitEndpoint,
  parseStructureFitRequestSchema,
} from '@/features/custom-structures/api-contract';
import { parseStructureFit } from '@/features/industry-planner/structure-fit-parse';
import { checkUserId } from '@/platform/auth/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export const POST = capabilityRoute('structures.parse-structure-fit', handlePost);

async function handlePost(request: NextRequest): Promise<Response> {
  const gate = await checkUserId();
  if (!gate.ok) return apiResponse(parseStructureFitEndpoint, 401, gate.failure);

  const parsed = await readJsonBody(request, parseStructureFitRequestSchema);
  if (!parsed.ok) return apiResponse(parseStructureFitEndpoint, 400, parsed.failure);

  const nameIndex = await getStructureFitNameIndex();
  const result = parseStructureFit(parsed.data.fit, (name) => nameIndex.get(name));
  return apiResponse(parseStructureFitEndpoint, 200, { parsed: result });
}
