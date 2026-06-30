import { getStructureTypes, getTypeAttributesBatch } from '@/data/eve-data/queries';
import { listCustomStructures } from '@/features/custom-structures/queries';
// The available-structures wire shape is owned by the consuming slice (the
// planner), the same consumer-owns-the-contract pattern as owned-blueprints —
// so the planner never imports the custom-structures feature directly.
import type {
  AvailableStructure,
  AvailableStructuresResponse,
} from '@/features/industry-planner/api-contract';
import { getCurrentUserId } from '@/features/auth/session';

// authz: auth
// GET /api/account/structures. The structures the caller can place a build in:
// their custom structures now (3.7.9.1.4), plus their corp's pulled structures
// next session (3.7.9.1.5), merged here with no selector change — the source-
// agnostic AvailableStructure (with `systemId`) is the seam corp fills. Each row
// carries its resolved structure + rig dogma so the planner computes the bonus
// client-side. Anonymous callers get an empty list.
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return Response.json({ structures: [] } satisfies AvailableStructuresResponse);

  const [custom, structureTypes] = await Promise.all([
    listCustomStructures(userId),
    getStructureTypes(),
  ]);
  if (custom.length === 0) {
    return Response.json({ structures: [] } satisfies AvailableStructuresResponse);
  }

  const knownTypeIds = new Set(structureTypes.map((t) => t.typeId));
  // One batched dogma read across every structure + rig type referenced.
  const typeIds = new Set<number>();
  for (const c of custom) {
    typeIds.add(c.structureTypeId);
    for (const r of c.rigTypeIds) typeIds.add(r);
  }
  const dogma = await getTypeAttributesBatch([...typeIds]);

  const structures: AvailableStructure[] = [];
  for (const c of custom) {
    // A structure type that's no longer a known industry structure (an SDE drift)
    // is dropped rather than shown without resolvable dogma.
    if (!knownTypeIds.has(c.structureTypeId)) continue;
    structures.push({
      id: c.id,
      source: 'custom',
      name: c.name,
      structureTypeId: c.structureTypeId,
      // A custom structure has no fixed system — its rig bonus scales against
      // whatever build system the planner has picked. Corp structures (3.7.9.1.5)
      // fill this with their home system.
      systemId: null,
      structureAttrs: dogma.get(c.structureTypeId) ?? {},
      rigAttrs: c.rigTypeIds.map((r) => dogma.get(r) ?? {}),
      securityClass: null,
    });
  }
  return Response.json({ structures } satisfies AvailableStructuresResponse);
}
