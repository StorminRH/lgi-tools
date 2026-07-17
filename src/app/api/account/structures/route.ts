import { getStructureTypes, getTypeAttributesBatch } from '@/data/eve-data/queries';
import { getAvailableCorpStructuresForUser } from '@/db/corp-structures-sync';
import { listCustomStructures } from '@/features/custom-structures/queries';
// The available-structures wire shape is owned by the consuming slice (the
// planner), the same consumer-owns-the-contract pattern as owned-blueprints —
// so the planner never imports the custom-structures feature directly.
import type { AvailableStructuresResponse } from '@/features/industry-planner/api-contract';
import {
  buildAvailableStructures,
  collectDogmaTypeIds,
} from '@/features/industry-planner/available-structures';
import { getCurrentUserId } from '@/features/auth/session';

/**
 * GET /api/account/structures. The structures the caller can place a build in:
 * their CUSTOM structures (3.7.9.1.4) AND their corp's PULLED structures (3.7.9.1.5),
 * merged by the planner's pure assembler with no selector change — the source-agnostic
 * AvailableStructure (with `systemId`/`securityClass`) is the seam corp fills. Corp
 * structures appear only for sharing-enabled corps the caller is a member of (the
 * on-view seam scopes + filters). Each row carries its resolved structure + rig dogma
 * so the planner computes the bonus client-side. Anonymous callers get an empty list.
 */
// authz: auth
// input: none
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return Response.json({ structures: [] } satisfies AvailableStructuresResponse);

  const [custom, corp, structureTypes] = await Promise.all([
    listCustomStructures(userId),
    getAvailableCorpStructuresForUser(userId),
    getStructureTypes(),
  ]);
  if (custom.length === 0 && corp.length === 0) {
    return Response.json({ structures: [] } satisfies AvailableStructuresResponse);
  }

  // One batched dogma read across every structure + rig type referenced.
  const dogma = await getTypeAttributesBatch(collectDogmaTypeIds(custom, corp));
  const structures = buildAvailableStructures(custom, corp, structureTypes, dogma);
  return Response.json({ structures } satisfies AvailableStructuresResponse);
}
