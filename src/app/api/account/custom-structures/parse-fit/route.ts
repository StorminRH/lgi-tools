import type { NextRequest } from 'next/server';
import { getStructureFitNameIndex } from '@/data/eve-data/queries';
import {
  parseStructureFitRequestSchema,
  type ParseStructureFitResponse,
} from '@/features/custom-structures/api-contract';
import { parseStructureFit } from '@/features/industry-planner/structure-fit-parse';
import { getCurrentUserId } from '@/features/auth/session';
import { parseJsonBody } from '@/lib/route-body';

// authz: auth
// POST /api/account/custom-structures/parse-fit. Turns a pasted in-game structure
// fit into { structureTypeId, rigTypeIds } so the builder can pre-fill its picker.
// Reads no per-user data, but stays signed-in-only (the builder is a signed-in
// feature). Resolution is bounded to the known industry structures + rigs, so
// unknown lines (services, fighters, defensive rigs) drop; `parsed` is null when
// the clipboard has no resolvable structure header.
export async function POST(request: NextRequest): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const parsed = await parseJsonBody(request, parseStructureFitRequestSchema);
  if (!parsed.ok) return parsed.response;

  const nameIndex = await getStructureFitNameIndex();
  const result = parseStructureFit(parsed.data.fit, (name) => nameIndex.get(name));
  return Response.json({ parsed: result } satisfies ParseStructureFitResponse);
}
