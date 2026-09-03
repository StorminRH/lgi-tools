import {
  entityNamesEndpoint,
  entityNamesRequestSchema,
} from '@/data/eve-data/api-contract';
import { capabilityRoute } from '@/app/api/capability-route';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: public
export const POST = capabilityRoute('planner.resolve-entity-names', handlePost);

async function handlePost(req: Request): Promise<Response> {
  const parsed = await readJsonBody(req, entityNamesRequestSchema);
  if (!parsed.ok) return apiResponse(entityNamesEndpoint, 400, parsed.failure);

  const names = await resolveEntityNames(parsed.data.ids);
  return apiResponse(entityNamesEndpoint, 200, { names });
}
