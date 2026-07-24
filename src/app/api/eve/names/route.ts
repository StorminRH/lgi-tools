// POST /api/eve/names
// Bulk entity-id → name resolution for characters + corporations (3.7.3.4),
// resolved through the one ESI gate's /universe/names. The merged active-jobs
// board resolves installer + corporation names here at view time, so entity
// names never live in Convex. Per-request by nature (client-posted ids).
// authz: public
import {
  entityNamesEndpoint,
  entityNamesRequestSchema,
} from '@/data/eve-data/api-contract';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

/**
 * Handles POST requests for /api/eve/names; this route owns its authorization, boundary
 * validation, and typed response mapping.
 */
export async function POST(req: Request): Promise<Response> {
  const parsed = await readJsonBody(req, entityNamesRequestSchema);
  if (!parsed.ok) return apiResponse(entityNamesEndpoint, 400, parsed.failure);

  const names = await resolveEntityNames(parsed.data.ids);
  return apiResponse(entityNamesEndpoint, 200, { names });
}
