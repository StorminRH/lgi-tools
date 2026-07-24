import type { NextRequest } from 'next/server';
import { getStructureFitNameIndex } from '@/data/eve-data/queries';
import {
  parseStructureFitEndpoint,
  parseStructureFitRequestSchema,
} from '@/features/custom-structures/api-contract';
import { parseStructureFit } from '@/features/industry-planner/structure-fit-parse';
import { checkUserId } from '@/platform/auth/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

/**
 * POST /api/account/custom-structures/parse-fit. Turns a pasted in-game structure
 * fit into \{ structureTypeId, rigTypeIds \} so the builder can pre-fill its picker.
 * Reads no per-user data, but stays signed-in-only (the builder is a signed-in
 * feature). Resolution is bounded to the known industry structures + rigs, so
 * unknown lines (services, fighters, defensive rigs) drop; `parsed` is null when
 * the clipboard has no resolvable structure header.
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  const gate = await checkUserId();
  if (!gate.ok) return apiResponse(parseStructureFitEndpoint, 401, gate.failure);

  const parsed = await readJsonBody(request, parseStructureFitRequestSchema);
  if (!parsed.ok) return apiResponse(parseStructureFitEndpoint, 400, parsed.failure);

  const nameIndex = await getStructureFitNameIndex();
  const result = parseStructureFit(parsed.data.fit, (name) => nameIndex.get(name));
  return apiResponse(parseStructureFitEndpoint, 200, { parsed: result });
}
