import type { NextRequest } from 'next/server';
import {
  buildLocationRequestSchema,
  type BuildLocationBadRequest,
  type BuildLocationResponse,
} from '@/features/industry-planner/api-contract';
import { getBuildLocation } from '@/features/industry-planner/queries';
import { parseJsonBody } from '@/transport/route-body';

/**
 * POST /api/industry/build-location
 * Body: \{ systemId, blueprintId \}
 *
 * Per-pick build-location read for the planner's net-margin path: the system's
 * industry-capable NPC stations + its cost indices + the CCP adjusted prices for
 * the blueprint's direct base materials (the EIV basis). All internal indexed DB
 * reads, no external calls — fetched only when the user picks a build system.
 */
// authz: public
export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await parseJsonBody(request, buildLocationRequestSchema, {
    invalidJson: () =>
      Response.json({ error: 'invalid_json' } satisfies BuildLocationBadRequest, { status: 400 }),
    invalidBody: (error) =>
      Response.json(
        { error: 'invalid_request', issues: error.issues } satisfies BuildLocationBadRequest,
        { status: 400 },
      ),
  });
  if (!parsed.ok) return parsed.response;

  const data = await getBuildLocation(parsed.data.systemId, parsed.data.blueprintId);
  return Response.json(data satisfies BuildLocationResponse);
}
