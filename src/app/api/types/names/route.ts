// POST /api/types/names
// Bulk type-id → name resolution from the Neon SDE (3.4.7). Public read of
// static SDE data — the skill-queue island resolves the skill ids in a
// pilot's Convex docs here at render time, so domain data never lives in
// Convex. Per-request by nature (user-posted ids).
// authz: public
import {
  typeNamesRequestSchema,
  type TypeNamesResponse,
} from '@/data/eve-data/api-contract';
import { getTypeNames } from '@/data/eve-data/queries';
import { parseJsonBody } from '@/lib/route-body';

export async function POST(req: Request): Promise<Response> {
  const parsed = await parseJsonBody(req, typeNamesRequestSchema);
  if (!parsed.ok) return parsed.response;

  const names = await getTypeNames(parsed.data.typeIds);
  return Response.json({
    names: Object.fromEntries(
      [...names.entries()].map(([id, name]) => [String(id), name]),
    ),
  } satisfies TypeNamesResponse);
}
