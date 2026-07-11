// POST /api/eve/names
// Bulk entity-id → name resolution for characters + corporations (3.7.3.4),
// resolved through the one ESI gate's /universe/names. The merged active-jobs
// board resolves installer + corporation names here at view time, so entity
// names never live in Convex. Per-request by nature (client-posted ids).
// authz: public
import {
  entityNamesRequestSchema,
  type EntityNamesResponse,
} from '@/data/eve-data/api-contract';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import { parseJsonBody } from '@/lib/route-body';

export async function POST(req: Request): Promise<Response> {
  const parsed = await parseJsonBody(req, entityNamesRequestSchema);
  if (!parsed.ok) return parsed.response;

  const names = await resolveEntityNames(parsed.data.ids);
  return Response.json({ names } satisfies EntityNamesResponse);
}
