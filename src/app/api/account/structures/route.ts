import { SDE_ENGINEERING_COMPLEX_GROUP_ID } from '@/data/eve-data/constants';
import { getStructureTypes, getTypeAttributesBatch } from '@/data/eve-data/queries';
import { getAvailableCorpStructuresForUser } from '@/db/corp-structures-sync';
import { listCustomStructures } from '@/features/custom-structures/queries';
// The available-structures wire shape is owned by the consuming slice (the
// planner), the same consumer-owns-the-contract pattern as owned-blueprints —
// so the planner never imports the custom-structures feature directly.
import type {
  AvailableStructure,
  AvailableStructuresResponse,
} from '@/features/industry-planner/api-contract';
import { getCurrentUserId } from '@/features/auth/session';

// The structure's coverage group. Defensive default only — a row past the knownTypeIds
// gate always resolves (knownTypeIds and the group map both derive from structureTypes).
function resolveGroupId(groupIdByType: Map<number, number>, typeId: number): number {
  return groupIdByType.get(typeId) ?? SDE_ENGINEERING_COMPLEX_GROUP_ID;
}

// authz: auth
// GET /api/account/structures. The structures the caller can place a build in:
// their CUSTOM structures (3.7.9.1.4) AND their corp's PULLED structures (3.7.9.1.5),
// merged here with no selector change — the source-agnostic AvailableStructure (with
// `systemId`/`securityClass`) is the seam corp fills. A corp structure carries its real
// system + security band so the planner deduces-and-locks the build system on select;
// a custom structure has neither (its bonus scales against the picked build system).
// Corp structures appear only for sharing-enabled corps the caller is a member of (the
// on-view seam scopes + filters). Each row carries its resolved structure + rig dogma
// so the planner computes the bonus client-side. Anonymous callers get an empty list.
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

  const knownTypeIds = new Set(structureTypes.map((t) => t.typeId));
  const typeNameById = new Map(structureTypes.map((t) => [t.typeId, t.name]));
  // The structure's SDE group (EC / Refinery / Citadel) — the planner's coverage
  // input (only a Refinery hosts reactions). A row past the knownTypeIds gate below
  // always resolves; the EC default is a defensive fallback that never fires.
  const groupIdByType = new Map(structureTypes.map((t) => [t.typeId, t.groupId]));
  // One batched dogma read across every structure + rig type referenced (custom and corp).
  const typeIds = new Set<number>();
  for (const c of custom) {
    typeIds.add(c.structureTypeId);
    for (const r of c.rigTypeIds) typeIds.add(r);
  }
  for (const s of corp) {
    typeIds.add(s.typeId);
    for (const r of s.rigTypeIds) typeIds.add(r);
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
      groupId: resolveGroupId(groupIdByType, c.structureTypeId),
      // The optional pin (3.7.13.2): a pinned custom structure carries a home
      // system and the planner deduce-locks it like corp; null = portable. Its
      // rig bonus still scales against the planner's picked build system —
      // securityClass stays null, security is never a structure property here.
      systemId: c.systemId,
      structureAttrs: dogma.get(c.structureTypeId) ?? {},
      rigAttrs: c.rigTypeIds.map((r) => dogma.get(r) ?? {}),
      securityClass: null,
    });
  }
  for (const s of corp) {
    if (!knownTypeIds.has(s.typeId)) continue;
    structures.push({
      // A namespaced, stable id distinct from custom UUIDs (structure ids are
      // globally unique in EVE), so the selector can tell the two sources apart.
      id: `corp:${s.structureId}`,
      source: 'corp',
      // The corp endpoint's authoritative name; the type name is the fallback for a
      // rare nameless structure (mirrors the selector's documented fallback).
      name: s.name ?? typeNameById.get(s.typeId) ?? `Structure ${s.structureId}`,
      structureTypeId: s.typeId,
      groupId: resolveGroupId(groupIdByType, s.typeId),
      // Corp structures carry their home system + SDE-derived security band — the
      // planner deduces-and-locks the build system from this on select.
      systemId: s.systemId,
      structureAttrs: dogma.get(s.typeId) ?? {},
      rigAttrs: s.rigTypeIds.map((r) => dogma.get(r) ?? {}),
      securityClass: s.securityClass,
    });
  }
  return Response.json({ structures } satisfies AvailableStructuresResponse);
}
