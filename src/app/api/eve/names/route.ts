import {
  ENTITY_NAMES_LIMIT_PER_MINUTE,
  entityNamesEndpoint,
  entityNamesRequestSchema,
} from '@/data/eve-data/api-contract';
import { capabilityRoute } from '@/app/api/capability-route';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import { checkRateLimit } from '@/lib/rate-limit';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: public
export const POST = capabilityRoute('planner.resolve-entity-names', handlePost);

async function handlePost(req: Request): Promise<Response> {
  const parsed = await readJsonBody(req, entityNamesRequestSchema);
  if (!parsed.ok) return apiResponse(entityNamesEndpoint, 400, parsed.failure);

  // Public and unauthenticated: every id ESI cannot resolve spends the shared error budget.
  const limited = await checkRateLimit(req, { name: 'eve-entity-names', perMinute: ENTITY_NAMES_LIMIT_PER_MINUTE });
  if (!limited.ok) return apiResponse(entityNamesEndpoint, 429, limited.failure);

  const names = await resolveEntityNames(parsed.data.ids);
  return apiResponse(entityNamesEndpoint, 200, { names });
}
